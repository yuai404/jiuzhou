import { Router, NextFunction, Request, Response } from "express";
/**
 * 头像上传路由
 *
 * 作用：
 * - COS 模式：STS 临时密钥 → 客户端直传 → confirm 三步流程
 * - 本地模式：POST /avatar multipart 单步上传（开发回退）
 * - DELETE /avatar 通用删除
 *
 * 数据流（COS 直传）：
 * - POST /avatar/sts → { cosEnabled, avatarUrl, credentials, key }
 * - 客户端使用临时密钥上传文件到 COS
 * - POST /avatar/confirm → 更新 DB
 *
 * 数据流（本地回退）：
 * - POST /avatar/sts → { cosEnabled: false }
 * - POST /avatar（multipart） → 写本地 + 更新 DB
 *
 * 关键边界条件：
 * 1) STS 端点同时返回 cosEnabled 标记，客户端据此决定走直传还是 FormData
 * 2) confirm 端点校验 avatarUrl 域名，防止客户端伪造任意 URL
 */
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import {
  acceptAvatarLocalUpload,
  avatarUpload,
  COS_ENABLED,
  confirmAvatarAsset,
  confirmAvatar,
  updateAvatarLocal,
  deleteAvatar,
} from "../services/uploadService.js";
import { issueAvatarUploadSts } from "../services/avatarUploadStsService.js";
import {
  isLocalAvatarUploadEnabled,
  LOCAL_AVATAR_UPLOAD_DISABLED_MESSAGE,
} from "../services/avatarUploadMode.js";
import { safePushCharacterUpdate } from "../middleware/pushUpdate.js";
import { sendSuccess, sendResult } from "../middleware/response.js";
import { BusinessError } from "../middleware/BusinessError.js";
import {
  AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  isAllowedAvatarMimeType,
} from "../services/avatarUploadRules.js";

const router = Router();

const parseAvatarUploadRequest = (
  req: Request,
): { contentType: string; normalizedFileSize: number } => {
  const { contentType, fileSize } = req.body as {
    contentType?: string;
    fileSize?: number;
  };
  const normalizedFileSize = Number(fileSize);
  if (!contentType || !isAllowedAvatarMimeType(contentType)) {
    throw new BusinessError("只支持 JPG、PNG、GIF、WEBP 格式的图片");
  }

  if (
    !Number.isFinite(normalizedFileSize) ||
    normalizedFileSize <= 0 ||
    normalizedFileSize > AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES
  ) {
    throw new BusinessError("图片大小不能超过2MB");
  }

  return {
    contentType,
    normalizedFileSize,
  };
};

const sendAvatarUploadStsResponse = async (
  res: Response,
  contentType: string,
  normalizedFileSize: number,
): Promise<void> => {
  if (!COS_ENABLED) {
    sendSuccess(res, {
      cosEnabled: false,
      maxFileSizeBytes: AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
    });
    return;
  }

  const payload = await issueAvatarUploadSts(contentType, normalizedFileSize);
  sendSuccess(res, payload);
};

// ─── COS 直传：获取临时密钥 ───

router.post(
  "/avatar/sts",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { contentType, normalizedFileSize } = parseAvatarUploadRequest(req);
    await sendAvatarUploadStsResponse(res, contentType, normalizedFileSize);
  }),
);

router.post(
  "/avatar-asset/sts",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { contentType, normalizedFileSize } = parseAvatarUploadRequest(req);
    await sendAvatarUploadStsResponse(res, contentType, normalizedFileSize);
  }),
);

// ─── COS 直传：确认上传完成 ───

router.post(
  "/avatar/confirm",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { avatarUrl } = req.body as { avatarUrl?: string };

    if (!avatarUrl) {
      throw new BusinessError("缺少 avatarUrl");
    }

    const result = await confirmAvatar(userId, avatarUrl);

    if (result.success) {
      await safePushCharacterUpdate(userId);
    }

    sendResult(res, result);
  }),
);

router.post(
  "/avatar-asset/confirm",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { avatarUrl } = req.body as { avatarUrl?: string };

    if (!avatarUrl) {
      throw new BusinessError("缺少 avatarUrl");
    }

    const result = await confirmAvatarAsset(avatarUrl);
    sendResult(res, result);
  }),
);

// ─── 本地回退：multipart 上传 ───

const avatarUploadMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  avatarUpload.single("avatar")(req, res, (error?: Error | string | null) => {
    if (!error) {
      next();
      return;
    }

    if (typeof error === "string") {
      res.status(400).json({ success: false, message: error });
      return;
    }

    const uploadError = error as Error & { name?: string; code?: string };
    if (
      uploadError.name === "MulterError" &&
      uploadError.code === "LIMIT_FILE_SIZE"
    ) {
      res.status(400).json({ success: false, message: "图片大小不能超过2MB" });
      return;
    }

    if (uploadError.message.includes("只支持")) {
      res.status(400).json({ success: false, message: uploadError.message });
      return;
    }

    console.error("上传头像错误:", uploadError);
    res.status(500).json({ success: false, message: "上传失败" });
  });
};

const ensureLocalAvatarUploadEnabled = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!isLocalAvatarUploadEnabled(COS_ENABLED)) {
    next(new BusinessError(LOCAL_AVATAR_UPLOAD_DISABLED_MESSAGE));
    return;
  }

  next();
};

router.post(
  "/avatar",
  requireAuth,
  ensureLocalAvatarUploadEnabled,
  avatarUploadMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const file = req.file;

    if (!file) {
      throw new BusinessError("请选择图片文件");
    }

    const result = await updateAvatarLocal(userId, file);

    if (result.success) {
      await safePushCharacterUpdate(userId);
    }

    sendResult(res, result);
  }),
);

router.post(
  "/avatar-asset",
  requireAuth,
  ensureLocalAvatarUploadEnabled,
  avatarUploadMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;

    if (!file) {
      throw new BusinessError("请选择图片文件");
    }

    const result = await acceptAvatarLocalUpload(file);
    sendResult(res, result);
  }),
);

// ─── 删除头像（通用） ───

router.delete("/avatar", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const result = await deleteAvatar(userId);

  if (result.success) {
    await safePushCharacterUpdate(userId);
  }

  sendResult(res, result);
}));

export default router;
