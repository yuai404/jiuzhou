/**
 * BattleArea 单位状态标签解析
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：把服务端 Buff/Debuff 快照统一转换成战斗卡片可显示的名称 Tag，避免 BattleArea 卡片和其他展示位重复写解析规则。
 * - 做什么：集中处理控制、增益、减益的名称优先级和排序规则，让同一状态在不同卡片里展示一致。
 * - 不做什么：不负责日志句式、不负责持续回合说明，也不做 tooltip 明细展开。
 *
 * 输入/输出：
 * - 输入：`BattleBuffDto[]` 与需要展示的标签上限。
 * - 输出：按重要度排序的 BattleUnitStatusTag[]，供卡片组件渲染单行标签。
 *
 * 数据流/状态流：
 * - 战斗快照 `unit.buffs`
 * - 本模块做名称归一化、优先级排序、数量截断
 * - BattleUnitCard 只渲染解析后的标签数据
 *
 * 关键边界条件与坑点：
 * 1. 控制状态必须优先展示，否则 1 行容量有限时，玩家最关心的沉默/眩晕会被普通增益挤掉。
 * 2. 这里不追加“未知状态”兜底文案，若服务端给出的 name / buffDefId 都为空，直接过滤，避免制造误导性标签。
 */

import type { BattleBuffDto } from '../../../../services/api';
import { translateControlName } from '../../shared/controlNameMap';
import { translateBuffName } from './logNameMap';

export type BattleUnitStatusTagTone = 'control' | 'debuff' | 'buff';

export type BattleUnitStatusTag = {
  id: string;
  label: string;
  tone: BattleUnitStatusTagTone;
};

const STATUS_TONE_PRIORITY: Record<BattleUnitStatusTagTone, number> = {
  control: 0,
  debuff: 1,
  buff: 2,
};

const resolveStatusLabel = (buff: BattleBuffDto): string => {
  const control = String(buff.control ?? '').trim();
  if (control) {
    return translateControlName(control);
  }

  const explicitName = String(buff.name ?? '').trim();
  if (explicitName) {
    const translatedExplicitName = translateBuffName(explicitName);
    return translatedExplicitName || explicitName;
  }

  const buffDefId = String(buff.buffDefId ?? '').trim();
  if (!buffDefId) return '';
  const translatedDefId = translateBuffName(buffDefId);
  return translatedDefId || buffDefId;
};

const resolveStatusTone = (buff: BattleBuffDto): BattleUnitStatusTagTone => {
  if (String(buff.control ?? '').trim()) return 'control';
  return buff.type === 'debuff' ? 'debuff' : 'buff';
};

export const resolveBattleUnitStatusTags = (
  buffs: BattleBuffDto[] | undefined,
  limit: number,
): BattleUnitStatusTag[] => {
  if (!Array.isArray(buffs) || buffs.length === 0 || limit <= 0) return [];

  return buffs
    .map((buff) => {
      const baseLabel = resolveStatusLabel(buff);
      if (!baseLabel) return null;
      const stackText = buff.stacks > 1 ? ` x${buff.stacks}` : '';
      return {
        id: buff.id,
        label: `${baseLabel}${stackText}`,
        tone: resolveStatusTone(buff),
      } satisfies BattleUnitStatusTag;
    })
    .filter((tag): tag is BattleUnitStatusTag => tag !== null)
    .sort((left, right) => {
      const toneDiff = STATUS_TONE_PRIORITY[left.tone] - STATUS_TONE_PRIORITY[right.tone];
      if (toneDiff !== 0) return toneDiff;
      return left.label.localeCompare(right.label, 'zh-Hans-CN');
    })
    .slice(0, limit);
};
