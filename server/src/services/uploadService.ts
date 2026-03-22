/**
 * 头像上传服务
 *
 * 作用：
 * - COS 启用时：配合 STS 直传链路，在 confirm 阶段更新 DB
 * - COS 未启用时：通过 multer 接收文件写入本地磁盘（本地开发回退方案）
 * - 删除头像（COS 对象或本地文件）
 *
 * 输入/输出：
 * - confirmAvatar(userId, avatarUrl) → { success, message, avatarUrl }
 * - updateAvatarLocal(userId, file) → { success, message, avatarUrl }（仅本地回退）
 * - deleteAvatar(userId) → { success, message }
 *
 * 数据流（COS 直传）：
 * - 客户端 → POST /sts 获取临时密钥
 * - 客户端 → 使用临时密钥直传文件到 COS
 * - 客户端 → POST /confirm 通知服务端更新 DB、清理旧头像
 *
 * 数据流（本地回退）：
 * - 客户端 → POST /avatar（multipart） → multer 写入本地 → 更新 DB → 清理旧文件
 *
 * 关键边界条件：
 * 1) COS 未配置时自动回退本地磁盘存储，保证本地开发可用
 * 2) 删除旧头像时需兼容两种 URL 格式：COS 完整 URL 和本地 /uploads/ 相对路径
 */
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { query } from "../config/database.js";
import {
  loadCharacterWritebackRowByUserId,
  queueCharacterWritebackSnapshot,
} from "./playerWritebackCacheService.js";
import {
  cosClient,
  COS_BUCKET,
  COS_REGION,
  COS_AVATAR_PREFIX,
  COS_DOMAIN,
  COS_ENABLED,
} from "../config/cos.js";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  generateAvatarFilename,
  isAllowedAvatarMimeType,
} from "./avatarUploadRules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 本地上传目录（COS 未配置时的回退方案）
const UPLOAD_DIR = path.join(__dirname, "../../uploads/avatars");

if (!COS_ENABLED && !fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── 文件校验 ───

export const ALLOWED_MIME_TYPES = [...ALLOWED_AVATAR_MIME_TYPES];

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (isAllowedAvatarMimeType(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("只支持 JPG、PNG、GIF、WEBP 格式的图片"));
  }
};

// ─── Multer 实例（仅本地回退使用） ───

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, generateAvatarFilename(path.extname(file.originalname)));
  },
});

export const avatarUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  },
});

// ─── COS 操作 ───

/** 从腾讯云 COS 删除对象 */
const deleteFromCos = (key: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    cosClient.deleteObject(
      {
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: key,
      },
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });
};

/**
 * 从 COS 完整 URL 中提取对象 Key
 * 例如：https://bucket.cos.region.myqcloud.com/avatars/avatar-123.png → avatars/avatar-123.png
 */
const extractCosKeyFromUrl = (url: string): string | null => {
  if (!url.startsWith("https://") && !url.startsWith("http://")) return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname.slice(1) || null;
  } catch {
    return null;
  }
};

// ─── 删除旧头像（兼容 COS URL 和本地路径两种格式） ───

const deleteOldAvatar = async (avatarValue: string): Promise<void> => {
  if (!avatarValue) return;

  const cosKey = extractCosKeyFromUrl(avatarValue);
  if (cosKey) {
    await deleteFromCos(cosKey).catch((err) => {
      console.error("删除 COS 旧头像失败:", err);
    });
    return;
  }

  const localPath = path.join(__dirname, "../..", avatarValue);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }
};

// ─── 校验 avatarUrl 合法性（防止客户端伪造） ───

/** 校验 avatarUrl 属于当前 COS Bucket 域名或自定义域名 */
const isValidCosAvatarUrl = (url: string): boolean => {
  if (!url.startsWith("https://")) return false;
  try {
    const parsed = new URL(url);
    const defaultHost = `${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com`;
    const allowedHosts = COS_DOMAIN ? [defaultHost, COS_DOMAIN] : [defaultHost];
    if (!allowedHosts.includes(parsed.hostname)) return false;
    const key = parsed.pathname.slice(1);
    return key.startsWith(COS_AVATAR_PREFIX);
  } catch {
    return false;
  }
};

// ─── 对外接口 ───

export { COS_ENABLED };

export type UploadResult = { success: boolean; message: string; avatarUrl?: string };

export const normalizeManagedAvatarValue = (
  avatarValue: string | null | undefined,
): string | null => {
  const normalizedValue = String(avatarValue ?? '').trim();
  return normalizedValue || null;
};

const isValidLocalAvatarUrl = (avatarUrl: string): boolean => {
  return /^\/uploads\/avatars\/[a-zA-Z0-9._-]+$/.test(avatarUrl);
};

export const isValidManagedAvatarUrl = (avatarUrl: string): boolean => {
  return isValidLocalAvatarUrl(avatarUrl) || isValidCosAvatarUrl(avatarUrl);
};

export const confirmAvatarAsset = async (
  avatarUrl: string,
): Promise<UploadResult> => {
  if (!isValidManagedAvatarUrl(avatarUrl)) {
    return { success: false, message: "头像地址不合法" };
  }

  return { success: true, message: "头像上传成功", avatarUrl };
};

export const getLocalUploadedAvatarUrl = (
  file: Express.Multer.File,
): string => {
  return `/uploads/avatars/${file.filename}`;
};

export const acceptAvatarLocalUpload = async (
  file: Express.Multer.File,
): Promise<UploadResult> => {
  return {
    success: true,
    message: "头像上传成功",
    avatarUrl: getLocalUploadedAvatarUrl(file),
  };
};

export const deleteManagedAvatarIfReplaced = async (
  previousAvatar: string | null | undefined,
  nextAvatar: string | null | undefined,
): Promise<void> => {
  const normalizedPreviousAvatar = normalizeManagedAvatarValue(previousAvatar);
  const normalizedNextAvatar = normalizeManagedAvatarValue(nextAvatar);
  if (!normalizedPreviousAvatar || normalizedPreviousAvatar === normalizedNextAvatar) {
    return;
  }
  if (!isValidManagedAvatarUrl(normalizedPreviousAvatar)) {
    return;
  }

  await deleteOldAvatar(normalizedPreviousAvatar);
};

/**
 * 确认客户端直传完成，更新 DB 中的头像 URL 并清理旧头像。
 * 仅在 COS 模式下使用。
 */
export const confirmAvatar = async (
  userId: number,
  avatarUrl: string,
): Promise<UploadResult> => {
  if (!isValidCosAvatarUrl(avatarUrl)) {
    return { success: false, message: "头像地址不合法" };
  }

  const character = await loadCharacterWritebackRowByUserId(userId, {
    forUpdate: true,
  });
  const oldAvatar = typeof character?.avatar === "string" ? character.avatar : undefined;
  if (!character) {
    return { success: false, message: "角色不存在" };
  }
  queueCharacterWritebackSnapshot(character.id, {
    avatar: avatarUrl,
  });

  await deleteManagedAvatarIfReplaced(oldAvatar, avatarUrl);

  return { success: true, message: "头像更新成功", avatarUrl };
};

/** 更新用户头像（本地磁盘回退方案，仅 COS 未启用时使用） */
export const updateAvatarLocal = async (
  userId: number,
  file: Express.Multer.File,
): Promise<UploadResult> => {
  const character = await loadCharacterWritebackRowByUserId(userId, {
    forUpdate: true,
  });
  const oldAvatar = typeof character?.avatar === "string" ? character.avatar : undefined;
  if (!character) {
    return { success: false, message: "角色不存在" };
  }

  const avatarUrl = getLocalUploadedAvatarUrl(file);
  queueCharacterWritebackSnapshot(character.id, {
    avatar: avatarUrl,
  });

  await deleteManagedAvatarIfReplaced(oldAvatar, avatarUrl);

  return { success: true, message: "头像更新成功", avatarUrl };
};

/** 删除用户头像 */
export const deleteAvatar = async (
  userId: number,
): Promise<{ success: boolean; message: string }> => {
  const character = await loadCharacterWritebackRowByUserId(userId, {
    forUpdate: true,
  });
  if (!character) {
    return { success: false, message: "角色不存在" };
  }
  const avatar = typeof character.avatar === "string" ? character.avatar : undefined;

  if (avatar) {
    await deleteOldAvatar(avatar);
  }

  queueCharacterWritebackSnapshot(character.id, {
    avatar: null,
  });

  return { success: true, message: "头像删除成功" };
};
