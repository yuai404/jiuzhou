/**
 * 头像上传交互共享 Hook
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中封装 Ant Design `Upload.customRequest` 所需的上传中状态、进度透传与成功回调，供玩家头像与伙伴改名头像复用。
 * 2. 做什么：把“上传成功后回传最终 URL”的交互统一成单入口，避免多个组件各自维护一套 `options.onProgress/onSuccess/onError` 逻辑。
 * 3. 不做什么：不决定具体上传到哪个业务接口，也不负责把返回的头像 URL 写入角色或伙伴数据。
 *
 * 输入/输出：
 * - 输入：具体上传请求函数、成功提示文案，以及上传成功后的业务回调。
 * - 输出：`uploading` 状态与可直接传给 `Upload` 组件的 `customRequest`。
 *
 * 数据流/状态流：
 * 选择文件 -> `customRequest` 调用上传接口 -> 上传成功回传最终 URL -> 业务层决定是否刷新角色或提交改名。
 *
 * 关键边界条件与坑点：
 * 1. 上传成功只表示“图片已落到统一存储”，不等于业务对象已经写库，因此写库动作必须继续由调用侧显式触发。
 * 2. 同一时刻只维护一个上传中状态，避免多个使用方各自复制 `setUploading(true/false)` 造成行为漂移。
 */
import { App } from 'antd';
import type { UploadProps } from 'antd';
import { useCallback, useState } from 'react';

import type { UploadResponse } from '../../../services/api';

export type AvatarUploadRequest = (
  file: File,
  options?: { onProgress?: (percent: number) => void },
) => Promise<UploadResponse>;

interface UseAvatarUploadFlowOptions {
  uploadRequest: AvatarUploadRequest;
  successMessage: string;
  onUploaded?: (avatarUrl: string, result: UploadResponse) => void;
}

export const useAvatarUploadFlow = ({
  uploadRequest,
  successMessage,
  onUploaded,
}: UseAvatarUploadFlowOptions): {
  uploading: boolean;
  customRequest: UploadProps<UploadResponse>['customRequest'];
} => {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  const customRequest: NonNullable<UploadProps<UploadResponse>['customRequest']> = useCallback(async (options) => {
    const file = options.file as File;
    setUploading(true);

    try {
      const result = await uploadRequest(file, {
        onProgress: (percent) => {
          options.onProgress?.({ percent });
        },
      });
      if (!result.success || !result.avatarUrl) {
        const uploadError = new Error(result.message || '头像上传失败');
        options.onError?.(uploadError);
        return;
      }

      options.onSuccess?.(result);
      onUploaded?.(result.avatarUrl, result);
      message.success(successMessage);
    } catch (error) {
      const uploadError = error instanceof Error ? error : new Error('头像上传失败');
      options.onError?.(uploadError);
    } finally {
      setUploading(false);
    }
  }, [message, onUploaded, successMessage, uploadRequest]);

  return {
    uploading,
    customRequest,
  };
};
