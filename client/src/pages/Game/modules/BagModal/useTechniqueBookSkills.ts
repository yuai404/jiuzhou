/**
 * 功法书技能查询 Hook
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把 BagItem 里的 `learnableTechniqueId` 适配到共享功法技能查询 Hook，给桌面端与移动端详情面板复用。
 * 2. 做什么：保留 BagModal 现有调用接口，避免业务组件直接感知共享 Hook 的参数结构。
 * 3. 不做什么：不直接发请求实现查询细节，也不处理技能卡片样式。
 *
 * 输入/输出：
 * - 输入：`item` 当前详情物品；`enabled` 是否允许发起查询。
 * - 输出：`skills` 技能详情数组、`loading` 加载态、`error` 错误文案。
 *
 * 数据流/状态流：
 * BagItem.learnableTechniqueId -> useTechniqueSkillDetails -> TechniqueSkillSection。
 *
 * 关键边界条件与坑点：
 * 1. 非功法书或未解析出 `learnableTechniqueId` 时必须立刻清空状态，避免沿用上一个物品的数据。
 * 2. 具体竞态处理下沉到共享 Hook，当前封装只负责稳定地传递 `techniqueId`。
 */
import { useMemo } from 'react';
import type { BagItem } from './bagShared';
import { useTechniqueSkillDetails } from '../../shared/useTechniqueSkillDetails';

type UseTechniqueBookSkillsOptions = {
  item: BagItem | null;
  enabled: boolean;
};

type TechniqueBookSkillsState = ReturnType<typeof useTechniqueSkillDetails>;

export const useTechniqueBookSkills = ({
  item,
  enabled,
}: UseTechniqueBookSkillsOptions): TechniqueBookSkillsState => {
  const techniqueId = useMemo(() => {
    if (!enabled) return null;
    return item?.learnableTechniqueId ?? null;
  }, [enabled, item?.learnableTechniqueId]);

  return useTechniqueSkillDetails({
    techniqueId,
    enabled,
  });
};
