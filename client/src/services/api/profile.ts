import api from "./core";
import COS from "cos-js-sdk-v5";
import {
  resolveAvatarUploadStsPayload,
  type AvatarUploadStsPayload,
  type AvatarUploadStsResponse,
} from "./avatarUploadShared";

// ─── 头像上传（COS 客户端直传 + 本地回退） ───

export interface UploadResponse {
  success: boolean;
  message: string;
  avatarUrl?: string;
}

/** 获取头像上传 STS（同时探测 COS 是否启用） */
const getCharacterAvatarUploadSts = (
  contentType: string,
  fileSize: number,
): Promise<AvatarUploadStsResponse> => {
  return api.post("/upload/avatar/sts", { contentType, fileSize });
};

/** 通知服务端客户端直传完成，更新 DB */
const confirmCharacterAvatarUpload = (avatarUrl: string): Promise<UploadResponse> => {
  return api.post("/upload/avatar/confirm", { avatarUrl });
};

const createAvatarUploadFormData = (file: File): FormData => {
  const formData = new FormData();
  formData.append("avatar", file);
  return formData;
};

const postAvatarUploadFormData = (
  url: string,
  file: File,
): Promise<UploadResponse> => {
  return api.post(url, createAvatarUploadFormData(file), {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

/** 本地回退：FormData 上传到服务端 */
const uploadCharacterAvatarLocal = (file: File): Promise<UploadResponse> => {
  return postAvatarUploadFormData("/upload/avatar", file);
};

const getAvatarAssetUploadSts = (
  contentType: string,
  fileSize: number,
): Promise<AvatarUploadStsResponse> => {
  return api.post("/upload/avatar-asset/sts", { contentType, fileSize });
};

const confirmAvatarAssetUpload = (avatarUrl: string): Promise<UploadResponse> => {
  return api.post("/upload/avatar-asset/confirm", { avatarUrl });
};

const uploadAvatarAssetLocal = (file: File): Promise<UploadResponse> => {
  return postAvatarUploadFormData("/upload/avatar-asset", file);
};

const uploadAvatarToCos = (
  sts: Extract<AvatarUploadStsPayload, { cosEnabled: true }>,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> => {
  const cos = new COS({
    SecretId: sts.credentials.tmpSecretId,
    SecretKey: sts.credentials.tmpSecretKey,
    SecurityToken: sts.credentials.sessionToken,
    StartTime: sts.startTime,
    ExpiredTime: sts.expiredTime,
  });

  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: sts.bucket,
        Region: sts.region,
        Key: sts.key,
        Body: file,
        ContentType: file.type,
        onProgress: (progressData) => {
          onProgress?.(Math.max(0, Math.min(100, progressData.percent * 100)));
        },
      },
      (error) => {
        if (error) {
          reject(new Error(error.message || "COS 上传失败"));
          return;
        }
        resolve();
      },
    );
  });
};

type AvatarUploadTransport = {
  getSts: (
    contentType: string,
    fileSize: number,
  ) => Promise<AvatarUploadStsResponse>;
  confirm: (avatarUrl: string) => Promise<UploadResponse>;
  uploadLocal: (file: File) => Promise<UploadResponse>;
};

const uploadAvatarWithTransport = async (
  file: File,
  transport: AvatarUploadTransport,
  options?: { onProgress?: (percent: number) => void },
): Promise<UploadResponse> => {
  const stsResponse = await transport.getSts(file.type, file.size);
  const sts: AvatarUploadStsPayload =
    resolveAvatarUploadStsPayload(stsResponse);

  if (!sts.cosEnabled) {
    return transport.uploadLocal(file);
  }

  await uploadAvatarToCos(sts, file, options?.onProgress);

  return transport.confirm(sts.avatarUrl);
};

/**
 * 上传头像（统一入口）
 *
 * 流程：
 * 1. 请求 STS 端点探测 COS 是否启用并获取临时密钥
 * 2. COS 启用：使用临时密钥上传文件到 COS → confirm 更新 DB
 * 3. COS 未启用：走 FormData 本地上传
 *
 * 被 PlayerInfo 上传头像处复用，是唯一的头像上传入口。
 */
export const uploadAvatar = async (
  file: File,
  options?: { onProgress?: (percent: number) => void },
): Promise<UploadResponse> => {
  return uploadAvatarWithTransport(file, {
    getSts: getCharacterAvatarUploadSts,
    confirm: confirmCharacterAvatarUpload,
    uploadLocal: uploadCharacterAvatarLocal,
  }, options);
};

/**
 * 上传头像素材（仅返回最终 URL，不写角色资料）
 *
 * 流程：
 * 1. 请求素材上传 STS 端点探测 COS 是否启用
 * 2. COS 启用时直传并通过素材 confirm 校验 URL
 * 3. COS 未启用时走本地 multipart 上传，返回最终可入库 URL
 *
 * 被伙伴改名弹窗复用，是“上传图片到统一头像存储”唯一入口。
 */
export const uploadAvatarAsset = async (
  file: File,
  options?: { onProgress?: (percent: number) => void },
): Promise<UploadResponse> => {
  return uploadAvatarWithTransport(file, {
    getSts: getAvatarAssetUploadSts,
    confirm: confirmAvatarAssetUpload,
    uploadLocal: uploadAvatarAssetLocal,
  }, options);
};

// 删除头像
export const deleteAvatar = (): Promise<{
  success: boolean;
  message: string;
}> => {
  return api.delete("/upload/avatar");
};

// 加点接口
export interface AddPointResponse {
  success: boolean;
  message: string;
  data?: {
    attribute: string;
    newValue: number;
    remainingPoints: number;
  };
}

export const addAttributePoint = (
  attribute: "jing" | "qi" | "shen",
  amount: number = 1,
): Promise<AddPointResponse> => {
  return api.post("/attribute/add", { attribute, amount });
};

// 减点
export const removeAttributePoint = (
  attribute: "jing" | "qi" | "shen",
  amount: number = 1,
): Promise<AddPointResponse> => {
  return api.post("/attribute/remove", { attribute, amount });
};

// 批量加点
export const batchAddPoints = (points: {
  jing?: number;
  qi?: number;
  shen?: number;
}): Promise<AddPointResponse> => {
  return api.post("/attribute/batch", points);
};

// 重置属性点
export const resetAttributePoints = (): Promise<{
  success: boolean;
  message: string;
  totalPoints?: number;
}> => {
  return api.post("/attribute/reset");
};
