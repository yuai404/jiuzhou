/**
 * IdleBattleWorker — 离线挂机战斗计算 Worker
 *
 * 作用：
 *   在独立线程中执行挂机战斗的纯计算部分，避免阻塞主线程事件循环。
 *   仅负责战斗模拟和奖励计算，不涉及数据库写入（由主线程的 flushBuffer 负责）。
 *
 * 输入/输出：
 *   - 接收消息：{ type: 'executeBatch', payload: ExecuteBatchPayload }
 *   - 返回消息：{ type: 'batchResult', batchIndex, result: SingleBatchResult }
 *                或 { type: 'error', batchIndex, error: string }
 *
 * 数据流：
 *   主线程 → Worker: executeBatch 消息（包含 session 快照、怪物配置）
 *   Worker → 主线程: batchResult 消息（战斗结果、奖励数据）
 *
 * 关键边界条件：
 *   1. Worker 内不访问数据库（所有数据通过消息传递）
 *   2. Worker 内不访问 Redis（无状态计算）
 *   3. Worker 内不推送 Socket 消息（由主线程负责）
 *   4. 静态配置数据（怪物、技能、掉落池）在 Worker 启动时加载到内存
 */

import { parentPort, workerData } from 'worker_threads';
import { randomUUID } from 'crypto';
import { createPVEBattle, type CharacterData, type SkillData } from '../battle/battleFactory.js';
import { BattleEngine, type PlayerSkillSelector } from '../battle/battleEngine.js';
import type { BattleLogEntry, BattleUnit, BattleSkill } from '../battle/types.js';
import type { IdleSessionRow, RewardItemEntry } from '../services/idle/types.js';
import type { MonsterData } from '../battle/battleFactory.js';
import { getNormalAttack } from '../battle/modules/skill.js';

type BattleResult = 'attacker_win' | 'defender_win' | 'draw';

// ============================================
// 类型定义
// ============================================

type ExecuteBatchPayload = {
  session: IdleSessionRow;
  batchIndex: number;
  userId: number;
  /** 房间怪物配置（从主线程传入，避免 Worker 内查询 DB）*/
  roomMonsters: Array<{ monster_def_id: string; count: number }>;
};

type SingleBatchResult = {
  result: BattleResult;
  expGained: number;
  silverGained: number;
  itemsGained: RewardItemEntry[];
  randomSeed: number;
  roundCount: number;
  battleLog: BattleLogEntry[];
  monsterIds: string[];
  bagFullFlag: boolean;
};

type WorkerMessage =
  | { type: 'executeBatch'; payload: ExecuteBatchPayload }
  | { type: 'shutdown' };

type WorkerResponse =
  | { type: 'batchResult'; batchIndex: number; result: SingleBatchResult }
  | { type: 'error'; batchIndex: number; error: string }
  | { type: 'ready' };

// ============================================
// 静态配置加载（Worker 启动时一次性加载）
// ============================================

/**
 * 从主线程传入的静态配置数据（通过 workerData）
 *
 * 包含：
 *   - monsterDefs: 怪物定义 Map
 *   - skillDefs: 技能定义 Map
 *   - dropPools: 掉落池配置 Map
 *   - itemDefs: 物品定义 Map（用于奖励计算）
 */
const staticConfig = workerData as {
  monsterDefs: Map<string, MonsterData>;
  skillDefs: Map<string, SkillData>;
  // 后续扩展：dropPools, itemDefs 等
};

// ============================================
// 核心计算函数（纯函数，无副作用）
// ============================================

/**
 * 将 SessionSnapshot 转换为 BattleFactory 所需的 CharacterData 格式
 */
function snapshotToCharacterData(
  snapshot: IdleSessionRow['sessionSnapshot'],
  userId: number,
): CharacterData {
  const a = snapshot.baseAttrs;
  return {
    user_id: userId,
    id: snapshot.characterId,
    nickname: snapshot.nickname || '无名修士',
    realm: snapshot.realm,
    attribute_element: (a as { element?: string }).element ?? 'none',
    qixue: a.max_qixue ?? 0,
    max_qixue: a.max_qixue ?? 0,
    lingqi: a.max_lingqi != null && a.max_lingqi > 0
      ? Math.floor(a.max_lingqi * 0.5)
      : 0,
    max_lingqi: a.max_lingqi ?? 0,
    wugong: a.wugong ?? 0,
    fagong: a.fagong ?? 0,
    wufang: a.wufang ?? 0,
    fafang: a.fafang ?? 0,
    sudu: a.sudu ?? 1,
    mingzhong: a.mingzhong ?? 0.9,
    shanbi: a.shanbi ?? 0,
    zhaojia: a.zhaojia ?? 0,
    baoji: a.baoji ?? 0,
    baoshang: a.baoshang ?? 0,
    kangbao: a.kangbao ?? 0,
    zengshang: a.zengshang ?? 0,
    zhiliao: a.zhiliao ?? 0,
    jianliao: a.jianliao ?? 0,
    xixue: a.xixue ?? 0,
    lengque: a.lengque ?? 0,
    kongzhi_kangxing: a.kongzhi_kangxing ?? 0,
    jin_kangxing: a.jin_kangxing ?? 0,
    mu_kangxing: a.mu_kangxing ?? 0,
    shui_kangxing: a.shui_kangxing ?? 0,
    huo_kangxing: a.huo_kangxing ?? 0,
    tu_kangxing: a.tu_kangxing ?? 0,
    qixue_huifu: a.qixue_huifu ?? 0,
    lingqi_huifu: a.lingqi_huifu ?? 0,
    setBonusEffects: snapshot.setBonusEffects,
  };
}

/**
 * 将 BattleSkill[] 转换为 SkillData[]
 */
function battleSkillsToSkillData(
  skills: IdleSessionRow['sessionSnapshot']['skills'],
): SkillData[] {
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    cost_lingqi: s.cost.lingqi ?? 0,
    cost_qixue: s.cost.qixue ?? 0,
    cooldown: s.cooldown,
    target_type: s.targetType,
    target_count: s.targetCount,
    damage_type: s.damageType ?? 'none',
    element: s.element,
    effects: s.effects,
    ai_priority: s.aiPriority,
  }));
}

/**
 * 技能策略选择器（从 session.autoSkillPolicy 构建）
 *
 * 返回 BattleSkill 对象而非 skillId 字符串（符合 PlayerSkillSelector 类型）
 */
function selectSkillByPolicy(
  unit: BattleUnit,
  policy: NonNullable<IdleSessionRow['sessionSnapshot']['autoSkillPolicy']>,
): BattleSkill | null {
  for (const slot of policy.slots) {
    if (!slot.skillId) continue;
    const skill = unit.skills.find((s) => s.id === slot.skillId);
    if (skill && (unit.skillCooldowns[skill.id] ?? 0) === 0) {
      return skill;
    }
  }
  return null;
}

/**
 * 执行单场挂机战斗（纯计算，无 DB/Redis/Socket 操作）
 *
 * 步骤：
 *   1. 构建 CharacterData 和 SkillData
 *   2. 解析怪物数据（从 staticConfig.monsterDefs 获取）
 *   3. createPVEBattle → BattleEngine.autoExecute()
 *   4. 胜利时计算奖励（纯内存计算，不写 DB）
 *
 * 注意：
 *   - 奖励计算简化版（仅计算经验/银两/掉落物品 ID，不涉及背包写入）
 *   - 背包满判断由主线程在 flushBuffer 时处理
 */
function executeSingleBatch(payload: ExecuteBatchPayload): SingleBatchResult {
  const { session, batchIndex, userId, roomMonsters } = payload;

  // 1. 构建怪物 ID 列表
  const targetDefId = session.sessionSnapshot.targetMonsterDefId;
  let monsterIds: string[];
  if (targetDefId) {
    const monsterEntry = roomMonsters.find((m) => m.monster_def_id === targetDefId);
    const count = monsterEntry?.count ?? 1;
    monsterIds = Array(count).fill(targetDefId) as string[];
  } else {
    monsterIds = roomMonsters.map((m) => m.monster_def_id);
  }

  if (monsterIds.length === 0) {
    return {
      result: 'draw',
      expGained: 0,
      silverGained: 0,
      itemsGained: [],
      randomSeed: 0,
      roundCount: 0,
      battleLog: [],
      monsterIds: [],
      bagFullFlag: false,
    };
  }

  // 2. 从静态配置获取怪物数据
  const monsters: MonsterData[] = [];
  const monsterSkillsMap: Record<string, SkillData[]> = {};
  for (const id of monsterIds) {
    const monsterDef = staticConfig.monsterDefs.get(id);
    if (!monsterDef) {
      console.warn(`[Worker] 怪物定义不存在: ${id}`);
      continue;
    }
    monsters.push(monsterDef);
    // 技能数据从 monsterDef.skills 获取（假设已包含完整技能数据）
    monsterSkillsMap[id] = monsterDef.skills?.map((skillId) => {
      const skillDef = staticConfig.skillDefs.get(String(skillId));
      return skillDef ?? {
        id: String(skillId),
        name: '未知技能',
        cost_lingqi: 0,
        cost_qixue: 0,
        cooldown: 0,
        target_type: 'single_enemy',
        target_count: 1,
        damage_type: 'none',
        element: 'none',
        effects: [],
        ai_priority: 0,
      };
    }) ?? [];
  }

  if (monsters.length === 0) {
    return {
      result: 'draw',
      expGained: 0,
      silverGained: 0,
      itemsGained: [],
      randomSeed: 0,
      roundCount: 0,
      battleLog: [],
      monsterIds,
      bagFullFlag: false,
    };
  }

  // 3. 构建战斗状态
  const characterData = snapshotToCharacterData(session.sessionSnapshot, userId);
  const skillData = battleSkillsToSkillData(session.sessionSnapshot.skills);
  const battleId = randomUUID();

  const state = createPVEBattle(
    battleId,
    characterData,
    skillData,
    monsters,
    monsterSkillsMap,
  );

  const engine = new BattleEngine(state);

  // 4. 执行战斗（注入技能策略）
  const policy = session.sessionSnapshot.autoSkillPolicy;
  const playerSelector: PlayerSkillSelector | undefined =
    policy && policy.slots.length > 0
      ? (unit) => selectSkillByPolicy(unit, policy) ?? getNormalAttack(unit)
      : undefined;
  engine.autoExecute(playerSelector);

  const finalState = engine.getState();
  const battleResult = finalState.result ?? 'draw';
  const randomSeed = finalState.randomSeed;
  const roundCount = finalState.roundCount;
  const battleLog = finalState.logs as BattleLogEntry[];

  // 5. 计算奖励（简化版，仅计算数值，不写 DB）
  let expGained = 0;
  let silverGained = 0;
  let itemsGained: RewardItemEntry[] = [];

  if (battleResult === 'attacker_win') {
    // 经验和银两：累加所有怪物的奖励
    for (const monster of monsters) {
      expGained += monster.exp_reward ?? 0;
      const silverMin = monster.silver_reward_min ?? 0;
      const silverMax = monster.silver_reward_max ?? 0;
      silverGained += Math.floor(Math.random() * (silverMax - silverMin + 1)) + silverMin;
    }

    // 物品掉落：简化版（仅返回掉落池 ID，由主线程在 flushBuffer 时解析）
    // 这里暂时返回空数组，后续可扩展为在 Worker 内完整计算掉落
    itemsGained = [];
  }

  return {
    result: battleResult,
    expGained,
    silverGained,
    itemsGained,
    randomSeed,
    roundCount,
    battleLog,
    monsterIds,
    bagFullFlag: false,
  };
}

// ============================================
// Worker 消息处理
// ============================================

if (!parentPort) {
  throw new Error('[IdleBattleWorker] parentPort 未定义，无法启动 Worker');
}

parentPort.on('message', (msg: WorkerMessage) => {
  try {
    if (msg.type === 'executeBatch') {
      const result = executeSingleBatch(msg.payload);
      const response: WorkerResponse = {
        type: 'batchResult',
        batchIndex: msg.payload.batchIndex,
        result,
      };
      parentPort!.postMessage(response);
    } else if (msg.type === 'shutdown') {
      // 优雅关闭：清理资源后退出
      process.exit(0);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const response: WorkerResponse = {
      type: 'error',
      batchIndex: (msg as { payload?: { batchIndex?: number } }).payload?.batchIndex ?? -1,
      error: errorMsg,
    };
    parentPort!.postMessage(response);
  }
});

// Worker 启动完成，通知主线程
parentPort.postMessage({ type: 'ready' } as WorkerResponse);
