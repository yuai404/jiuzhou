/**
 * 易名符改名提交流程 Hook
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中管理“打开改名弹窗 -> 提交接口 -> 成功提示/聊天广播 -> 刷新背包”的完整流程，供桌面端与移动端背包复用。
 * 2. 做什么：把改名成功后的 UI 副作用收敛到单一入口，避免两个背包组件各自维护一套请求与提示逻辑。
 * 3. 不做什么：不决定哪个物品是易名符，该判断仍由背包共享语义模块负责。
 *
 * 输入/输出：
 * - 输入：刷新函数，以及改名成功后的额外 UI 回调。
 * - 输出：打开改名弹窗的方法、提交中状态，以及可直接渲染的共享弹窗节点。
 *
 * 数据流/状态流：
 * 背包点击使用 -> `openCharacterRename` 写入当前道具 -> 共享弹窗提交 -> `/character/renameWithCard` -> 成功后刷新背包并广播系统消息。
 *
 * 关键边界条件与坑点：
 * 1. 同一次提交流程内不能重复点击提交，否则会产生重复请求与重复扣卡风险。
 * 2. 成功后必须同时刷新背包和派发 `inventory:changed`，否则道具数量与外层角标会不同步。
 */
import { App } from 'antd';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { getUnifiedApiErrorMessage, renameCharacterWithCard } from '../../../services/api';
import { gameSocket } from '../../../services/gameSocket';
import CharacterRenameModal from './CharacterRenameModal';

const SILENT_REQUEST_CONFIG = { meta: { autoErrorToast: false } } as const;

interface CharacterRenameCardContext {
  itemInstanceId: number;
  itemName: string;
}

interface UseCharacterRenameCardFlowOptions {
  refresh: () => Promise<void>;
  onAfterSuccess?: () => void;
}

export const useCharacterRenameCardFlow = ({
  refresh,
  onAfterSuccess,
}: UseCharacterRenameCardFlowOptions): {
  renameSubmitting: boolean;
  openCharacterRename: (context: CharacterRenameCardContext) => void;
  renameModalNode: ReactNode;
} => {
  const { message } = App.useApp();
  const [renameContext, setRenameContext] = useState<CharacterRenameCardContext | null>(null);
  const [renameSubmitting, setRenameSubmitting] = useState(false);

  const closeCharacterRename = useCallback(() => {
    if (renameSubmitting) {
      return;
    }
    setRenameContext(null);
  }, [renameSubmitting]);

  const openCharacterRename = useCallback((context: CharacterRenameCardContext) => {
    setRenameContext(context);
  }, []);

  const handleSubmitCharacterRename = useCallback(async (nickname: string) => {
    if (!renameContext || renameSubmitting) {
      return;
    }

    setRenameSubmitting(true);
    try {
      const result = await renameCharacterWithCard(
        renameContext.itemInstanceId,
        nickname,
        SILENT_REQUEST_CONFIG,
      );
      message.success(result.message || '改名成功');
      window.dispatchEvent(new CustomEvent('chat:append', {
        detail: {
          channel: 'system',
          content: `使用【${renameContext.itemName}】成功，道号已更改为【${nickname}】。`,
        },
      }));
      await refresh();
      window.dispatchEvent(new Event('inventory:changed'));
      setRenameContext(null);
      onAfterSuccess?.();
    } catch (error) {
      message.error(getUnifiedApiErrorMessage(error, '改名失败'));
    } finally {
      setRenameSubmitting(false);
    }
  }, [message, onAfterSuccess, refresh, renameContext, renameSubmitting]);

  const renameModalNode = useMemo(() => {
    return (
      <CharacterRenameModal
        open={renameContext !== null}
        itemName={renameContext?.itemName ?? '易名符'}
        initialNickname={gameSocket.getCharacter()?.nickname ?? ''}
        submitting={renameSubmitting}
        onCancel={closeCharacterRename}
        onSubmit={handleSubmitCharacterRename}
      />
    );
  }, [closeCharacterRename, handleSubmitCharacterRename, renameContext, renameSubmitting]);

  return {
    renameSubmitting,
    openCharacterRename,
    renameModalNode,
  };
};
