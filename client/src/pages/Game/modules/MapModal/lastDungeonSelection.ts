/**
 * 秘境弹窗“最近一次秘境选择”归一化与默认选中规则。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理最近秘境选择的数据归一化，以及秘境弹窗首次默认选中的判定。
 * 2. 做什么：让 Game 与 MapModal 复用同一套规则，避免“当前分类/最近秘境/回退首项”判断散落在多个组件。
 * 3. 不做什么：不读取接口、不持有 React 状态，也不决定秘境难度选项列表的来源。
 *
 * 输入/输出：
 * - 输入：当前弹窗分类、当前过滤后的列表 ID、现有 activeId、最近秘境选择。
 * - 输出：建议使用的默认 activeId，以及仅在“命中最近秘境”时返回的默认 rank。
 *
 * 数据流/状态流：
 * - Game 收口最近秘境原始数据 -> 本模块归一化 -> MapModal 打开或切换分类时消费结果初始化选中态。
 *
 * 关键边界条件与坑点：
 * 1. 只有 `dungeon` 分类才允许使用最近秘境默认选中，避免误影响大世界/活动列表。
 * 2. 若当前 activeId 仍然有效，必须优先保留用户当前选择，不能被最近秘境记录反复覆盖。
 */

export type MapModalCategory = 'world' | 'dungeon' | 'event';

export type LastDungeonSelection = {
  dungeonId: string;
  rank: number;
};

type ResolveInitialDungeonSelectionParams = {
  category: MapModalCategory;
  filteredIds: string[];
  activeId: string;
  lastSelection?: LastDungeonSelection | null;
};

type InitialDungeonSelectionResult = {
  activeId: string;
  rank: number | null;
};

export const normalizeLastDungeonSelection = (
  selection?: LastDungeonSelection | null,
): LastDungeonSelection | null => {
  if (!selection) return null;

  const dungeonId = selection.dungeonId.trim();
  const normalizedRank = Math.floor(selection.rank);
  if (!dungeonId || !Number.isFinite(normalizedRank) || normalizedRank <= 0) {
    return null;
  }

  return {
    dungeonId,
    rank: normalizedRank,
  };
};

export const resolveInitialDungeonSelection = (
  params: ResolveInitialDungeonSelectionParams,
): InitialDungeonSelectionResult => {
  const normalizedActiveId = params.activeId.trim();
  if (normalizedActiveId && params.filteredIds.includes(normalizedActiveId)) {
    return {
      activeId: normalizedActiveId,
      rank: null,
    };
  }

  const normalizedLastSelection = normalizeLastDungeonSelection(params.lastSelection);
  if (
    params.category === 'dungeon'
    && normalizedLastSelection
    && params.filteredIds.includes(normalizedLastSelection.dungeonId)
  ) {
    return {
      activeId: normalizedLastSelection.dungeonId,
      rank: normalizedLastSelection.rank,
    };
  }

  return {
    activeId: params.filteredIds[0] ?? '',
    rank: null,
  };
};
