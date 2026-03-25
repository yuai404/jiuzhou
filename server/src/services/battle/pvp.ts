/**
 * PVP 战斗发起与竞技场结算
 *
 * 作用：
 * - startPVPBattle: 创建 PVP 战斗（普通 / 竞技场）
 * - settleArenaBattleIfNeeded: 竞技场评分结算
 *
 * 复用点：路由层 / arenaRoutes 调用 startPVPBattle；settlement.ts / action.ts 调用 settleArenaBattleIfNeeded。
 *
 * 边界条件：
 * 1) 竞技场战斗时 defender 为 NPC 类型，不推送给对手
 * 2) 竞技场评分初始化使用 INSERT ... ON CONFLICT DO NOTHING
 */

import {
  createPVPBattle,
} from "../../battle/battleFactory.js";
import { BattleEngine } from "../../battle/battleEngine.js";
import {
  applyArenaBattleResultProjection,
  getArenaProjection,
  getOnlineBattleCharacterSnapshotByCharacterId,
  getOnlineBattleCharacterSnapshotByUserId,
  upsertArenaProjection,
} from "../onlineBattleProjectionService.js";
import {
  calculateArenaRatingDelta,
  DEFAULT_ARENA_RATING,
  type ArenaBattleOutcome,
} from "../shared/arenaRatingDelta.js";
import type { BattleResult } from "./battleTypes.js";
import {
  BATTLE_START_COOLDOWN_MS,
  buildCharacterInBattleResult,
  registerStartedBattle,
  validateBattleStartCooldown,
  buildBattleStartCooldownResult,
} from "./runtime/state.js";
import {
  rejectIfIdling,
  isCharacterIdling,
  withBattleStartResources,
  scheduleBattleStartResourcesSyncForUsers,
} from "./shared/preparation.js";
import { buildBattleSnapshotState } from "./runtime/realtime.js";
import { computeRankPower } from "../shared/rankPower.js";

export async function startPVPBattle(
  userId: number,
  opponentCharacterId: number,
  battleId?: string,
): Promise<BattleResult> {
  try {
    const challengerSnapshot = await getOnlineBattleCharacterSnapshotByUserId(userId);
    if (!challengerSnapshot) {
      return { success: false, message: "角色不存在" };
    }
    const challengerBase = challengerSnapshot.computed;

    const challengerCharacterId = Number(challengerBase.id);
    if (!Number.isFinite(challengerCharacterId) || challengerCharacterId <= 0) {
      return { success: false, message: "角色数据异常" };
    }

    const idleReject = await rejectIfIdling(challengerCharacterId);
    if (idleReject) return idleReject;

    const oppId = Number(opponentCharacterId);
    if (!Number.isFinite(oppId) || oppId <= 0) {
      return { success: false, message: "对手参数错误" };
    }

    const opponentSnapshot = await getOnlineBattleCharacterSnapshotByCharacterId(oppId);
    if (!opponentSnapshot) {
      return { success: false, message: "对手不存在" };
    }
    const opponentBase = opponentSnapshot.computed;

    const opponentUserId = Number(opponentBase.user_id);
    if (!Number.isFinite(opponentUserId) || opponentUserId <= 0) {
      return { success: false, message: "对手数据异常" };
    }

    const requestedBattleId =
      typeof battleId === "string" ? battleId.trim() : "";
    const isArenaBattle = requestedBattleId.startsWith("arena-battle-");
    if (!isArenaBattle) {
      const opponentIdling = await isCharacterIdling(oppId);
      if (opponentIdling) {
        return { success: false, message: "对手离线挂机中，无法发起挑战" };
      }
    }

    const challengerInBattleResult = buildCharacterInBattleResult(
      challengerCharacterId,
      "character_in_battle",
      "角色正在战斗中",
    );
    if (challengerInBattleResult) return challengerInBattleResult;
    if (!isArenaBattle) {
      const opponentInBattleResult = buildCharacterInBattleResult(
        oppId,
        "opponent_in_battle",
        "对手正在战斗中",
      );
      if (opponentInBattleResult) return opponentInBattleResult;
    }
    const challengerCooldown = validateBattleStartCooldown(
      challengerCharacterId,
    );
    if (challengerCooldown) {
      return buildBattleStartCooldownResult(
        challengerCooldown,
        "battle_start_cooldown",
      );
    }
    if (!isArenaBattle) {
      const opponentCooldown = validateBattleStartCooldown(oppId);
      if (opponentCooldown) {
        return buildBattleStartCooldownResult(
          opponentCooldown,
          "opponent_battle_start_cooldown",
          "对手刚结束战斗，暂时无法发起挑战",
        );
      }
    }

    const challengerLoadout = challengerSnapshot.loadout;
    const opponentLoadout = opponentSnapshot.loadout;
    if (!challengerLoadout) {
      return { success: false, message: "角色战斗资料不存在" };
    }
    if (!opponentLoadout) {
      return { success: false, message: "对手战斗资料不存在" };
    }
    const challenger = {
      ...challengerBase,
      setBonusEffects: challengerLoadout.setBonusEffects,
    };
    const opponent = {
      ...opponentBase,
      setBonusEffects: opponentLoadout.setBonusEffects,
    };
    const recoveredChallenger = withBattleStartResources(challenger);
    const recoveredOpponent = withBattleStartResources(opponent);

    scheduleBattleStartResourcesSyncForUsers(
      isArenaBattle ? [userId] : [userId, opponentUserId],
      { context: "同步战前资源（PVP战斗）" },
    );

    const finalBattleId = requestedBattleId
      ? requestedBattleId
      : `pvp-battle-${userId}-${Date.now()}`;
    const battleState = createPVPBattle(
      finalBattleId,
      recoveredChallenger,
      challengerLoadout.skills,
      recoveredOpponent,
      opponentLoadout.skills,
      isArenaBattle ? { defenderUnitType: "npc" } : undefined,
    );

    const engine = new BattleEngine(battleState);
    registerStartedBattle(
      finalBattleId,
      engine,
      isArenaBattle ? [userId] : [userId, opponentUserId],
    );

    return {
      success: true,
      message: "战斗开始",
      data: {
        battleId: finalBattleId,
        state: buildBattleSnapshotState(engine.getState()),
        battleStartCooldownMs: BATTLE_START_COOLDOWN_MS,
      },
    };
  } catch (error) {
    console.error("发起PVP战斗失败:", error);
    return { success: false, message: "发起PVP战斗失败" };
  }
}

export async function settleArenaBattleIfNeeded(
  battleId: string,
  battleResult: "attacker_win" | "defender_win" | "draw",
): Promise<void> {
  const battleIdSegments = battleId.split("-");
  const challengerCharacterId = Number(battleIdSegments[2] ?? 0);
  const opponentCharacterId = Number(battleIdSegments[3] ?? 0);
  if (!Number.isFinite(challengerCharacterId) || challengerCharacterId <= 0)
    return;
  if (!Number.isFinite(opponentCharacterId) || opponentCharacterId <= 0) return;

  const challengerProjection = await getArenaProjection(challengerCharacterId);
  const opponentProjection = await getArenaProjection(opponentCharacterId);
  const challengerBefore = challengerProjection?.score ?? DEFAULT_ARENA_RATING;
  const opponentBefore = opponentProjection?.score ?? DEFAULT_ARENA_RATING;

  const challengerOutcome: ArenaBattleOutcome =
    battleResult === "attacker_win"
      ? "win"
      : battleResult === "defender_win"
        ? "lose"
        : "draw";
  const challengerDelta = calculateArenaRatingDelta({
    selfRating: challengerBefore,
    opponentRating: opponentBefore,
    outcome: challengerOutcome,
  });
  const challengerAfter = Math.max(0, challengerBefore + challengerDelta);

  const opponentOutcome: ArenaBattleOutcome =
    challengerOutcome === "win"
      ? "lose"
      : challengerOutcome === "lose"
        ? "win"
        : "draw";
  const opponentDelta = calculateArenaRatingDelta({
    selfRating: opponentBefore,
    opponentRating: challengerBefore,
    outcome: opponentOutcome,
  });
  const opponentAfter = Math.max(0, opponentBefore + opponentDelta);

  const opponentSnapshot = await getOnlineBattleCharacterSnapshotByCharacterId(opponentCharacterId);
  await upsertArenaProjection({
    characterId: opponentCharacterId,
    score: opponentAfter,
    winCount: (opponentProjection?.winCount ?? 0) + (opponentOutcome === 'win' ? 1 : 0),
    loseCount: (opponentProjection?.loseCount ?? 0) + (opponentOutcome === 'lose' ? 1 : 0),
    todayUsed: opponentProjection?.todayUsed ?? 0,
    todayLimit: opponentProjection?.todayLimit ?? 20,
    todayRemaining: opponentProjection?.todayRemaining ?? 20,
    records: opponentProjection?.records ?? [],
  });
  await applyArenaBattleResultProjection({
    battleId,
    challengerCharacterId,
    opponentCharacterId,
    challengerOutcome,
    challengerScoreDelta: challengerDelta,
    challengerScoreAfter: challengerAfter,
    opponentName: opponentSnapshot?.computed.nickname ?? `修士${opponentCharacterId}`,
    opponentRealm: opponentSnapshot?.computed.realm ?? '凡人',
    opponentPower: opponentSnapshot ? Math.max(0, computeRankPower(opponentSnapshot.computed)) : 0,
  });
}
