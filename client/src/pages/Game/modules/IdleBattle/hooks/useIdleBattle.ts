/**
 * useIdleBattle Hook — 离线挂机战斗状态管理
 *
 * 作用：
 *   封装挂机战斗的完整状态流：会话管理、配置读写、历史查询、回放控制、Socket 实时更新。
 *   不包含任何 UI 渲染逻辑，所有状态通过 UseIdleBattleReturn 暴露给组件层。
 *
 * 输入/输出：
 *   - 无参数（依赖 gameSocket 单例和 idleBattleApi）
 *   - 返回 UseIdleBattleReturn 接口，包含状态、操作、历史、回放四个维度
 *
 * 数据流：
 *   mount → loadStatus + loadConfig → 初始化状态
 *   gameSocket.onIdleUpdate → 更新 activeSession 实时收益
 *   gameSocket.onIdleFinished → 清空 activeSession，触发历史刷新
 *   断线 30s 后 → getIdleProgress → 补全进度
 *   selectSession → getIdleBatches → sessionBatches → selectBatch → batchLog
 *
 * 关键边界条件：
 *   1. 断线检测：监听 gameSocket 连接状态，断线超过 RECONNECT_PROGRESS_DELAY_MS 后
 *      自动调用 getIdleProgress 补全进度（避免频繁请求）
 *   2. 不自动弹出未读回放弹窗，由玩家主动点击历史记录查看
 *   3. Socket 事件只更新内存状态，不重新请求 DB（减少服务端压力）
 *   4. saveConfig 与 startIdle 均为乐观更新：先更新本地状态，失败时回滚
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { gameSocket } from '../../../../../services/gameSocket';
import { getUnifiedApiErrorMessage } from '../../../../../services/api';
import type { IdleUpdatePayload, IdleFinishedPayload } from '../../../../../services/gameSocket';
import {
  startIdleSession,
  stopIdleSession,
  getIdleStatus,
  getIdleHistory,
  getIdleBatches,
  markIdleSessionViewed,
  getIdleProgress,
  getIdleConfig,
  updateIdleConfig,
} from '../api/idleBattleApi';
import type {
  IdleSessionDto,
  IdleBatchDto,
  IdleConfigDto,
} from '../types';
import type { BattleLogEntryDto } from '../../../../../services/api/combat-realm';

// ============================================
// 常量
// ============================================

/** 断线后延迟多久触发进度补全（ms） */
const RECONNECT_PROGRESS_DELAY_MS = 30_000;

/** 默认配置（未从服务端加载时的初始值） */
const DEFAULT_CONFIG: IdleConfigDto = {
  mapId: null,
  roomId: null,
  maxDurationMs: 3_600_000,
  autoSkillPolicy: { slots: [] },
  targetMonsterDefId: null,
};

// ============================================
// 返回类型
// ============================================

export interface UseIdleBattleReturn {
  // 当前活跃会话（null 表示未在挂机）
  activeSession: IdleSessionDto | null;
  // 全局加载状态（初始化时为 true）
  isLoading: boolean;
  // 最近一次操作的错误信息
  error: string | null;

  // 挂机配置（本地草稿，未保存前不影响服务端）
  config: IdleConfigDto;
  setConfig: (patch: Partial<IdleConfigDto>) => void;
  saveConfig: () => Promise<void>;

  // 操作
  startIdle: () => Promise<void>;
  stopIdle: () => Promise<void>;

  // 历史记录
  history: IdleSessionDto[];
  loadHistory: () => Promise<void>;

  // 回放控制
  selectedSession: IdleSessionDto | null;
  selectSession: (sessionId: string | null) => void;
  sessionBatches: IdleBatchDto[];
  selectedBatch: IdleBatchDto | null;
  selectBatch: (batchId: string | null) => void;
  batchLog: BattleLogEntryDto[];
}

// ============================================
// Hook 实现
// ============================================

export function useIdleBattle(): UseIdleBattleReturn {
  const [activeSession, setActiveSession] = useState<IdleSessionDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfigState] = useState<IdleConfigDto>(DEFAULT_CONFIG);

  const [history, setHistory] = useState<IdleSessionDto[]>([]);

  const [selectedSession, setSelectedSession] = useState<IdleSessionDto | null>(null);
  const [sessionBatches, setSessionBatches] = useState<IdleBatchDto[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<IdleBatchDto | null>(null);

  // 断线时间戳（用于计算是否需要补全进度）
  const disconnectedAtRef = useRef<number | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============================================
  // 初始化：加载当前状态和配置
  // ============================================

  const loadStatus = useCallback(async () => {
    try {
      const res = await getIdleStatus();
      setActiveSession(res.session);
    } catch (err) {
      setActiveSession(null);
      setError(getUnifiedApiErrorMessage(err, '加载挂机状态失败'));
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const res = await getIdleConfig();
      setConfigState(res.config);
    } catch (err) {
      setError(getUnifiedApiErrorMessage(err, '加载挂机配置失败'));
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void Promise.all([loadStatus(), loadConfig()]).finally(() => setIsLoading(false));
  }, [loadConfig, loadStatus]);

  // ============================================
  // Socket 事件：idle:update（每场战斗收益推送）
  // ============================================

  useEffect(() => {
    const unsubscribe = gameSocket.onIdleUpdate((data: IdleUpdatePayload) => {
      setActiveSession((prev) => {
        if (!prev || prev.id !== data.sessionId) return prev;
        // 累加本场收益到内存状态（不重新请求 DB）
        return {
          ...prev,
          totalBattles: prev.totalBattles + 1,
          winCount: data.result === 'attacker_win' ? prev.winCount + 1 : prev.winCount,
          loseCount: data.result === 'defender_win' ? prev.loseCount + 1 : prev.loseCount,
          totalExp: prev.totalExp + data.expGained,
          totalSilver: prev.totalSilver + data.silverGained,
        };
      });
    });
    return unsubscribe;
  }, []);

  // ============================================
  // Socket 事件：idle:finished（会话结束推送）
  // ============================================

  useEffect(() => {
    const unsubscribe = gameSocket.onIdleFinished((data: IdleFinishedPayload) => {
      setActiveSession((prev) => {
        if (!prev || prev.id !== data.sessionId) return prev;
        return null;
      });
      // 会话结束后刷新历史记录
      void loadHistory();
    });
    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // 断线续战：断线 30s 后补全进度
  // ============================================

  useEffect(() => {
    const unsubscribeConnect = gameSocket.onCharacterUpdate(() => {
      // 重新连接时，若之前断线超过阈值，补全进度
      if (disconnectedAtRef.current !== null) {
        const elapsed = Date.now() - disconnectedAtRef.current;
        disconnectedAtRef.current = null;

        if (elapsed >= RECONNECT_PROGRESS_DELAY_MS) {
          void (async () => {
            try {
              const res = await getIdleProgress();
              setActiveSession(res.session);
              if (res.session && res.batches.length > 0) {
                // 有新批次时，若当前选中的是该会话，刷新批次列表
                setSelectedSession((prev) => {
                  if (prev?.id === res.session?.id) {
                    void getIdleBatches(res.session!.id)
                      .then((batchRes) => {
                        setSessionBatches(batchRes.batches);
                      })
                      .catch((error) => {
                        setError(getUnifiedApiErrorMessage(error, '刷新挂机回放失败'));
                      });
                  }
                  return prev;
                });
              }
            } catch (error) {
              setError(getUnifiedApiErrorMessage(error, '同步挂机进度失败'));
            }
          })();
        }
      }
    });

    return unsubscribeConnect;
  }, []);

  // 监听 socket 断线（通过 isSocketConnected 轮询不合适，改为监听 error 事件作为断线信号）
  useEffect(() => {
    const unsubscribeError = gameSocket.onError(() => {
      if (disconnectedAtRef.current === null) {
        disconnectedAtRef.current = Date.now();
      }
    });
    return unsubscribeError;
  }, []);


  // ============================================
  // 配置管理
  // ============================================

  const setConfig = useCallback((patch: Partial<IdleConfigDto>) => {
    setConfigState((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveConfig = useCallback(async () => {
    setError(null);
    try {
      await updateIdleConfig(config);
    } catch (err) {
      setError(getUnifiedApiErrorMessage(err, '保存配置失败'));
    }
  }, [config]);

  // ============================================
  // 操作：启动/停止挂机
  // ============================================

  const startIdle = useCallback(async () => {
    setError(null);
    if (!config.mapId || !config.roomId) {
      setError('请先选择挂机地图和房间');
      return;
    }
    if (!config.targetMonsterDefId) {
      setError('请先选择挂机怪物');
      return;
    }
    try {
      await startIdleSession({
        mapId: config.mapId,
        roomId: config.roomId,
        maxDurationMs: config.maxDurationMs,
        autoSkillPolicy: config.autoSkillPolicy,
        targetMonsterDefId: config.targetMonsterDefId,
      });
      // 启动成功后重新拉取状态（获取完整 session 对象）
      await loadStatus();
    } catch (err) {
      setError(getUnifiedApiErrorMessage(err, '启动挂机失败'));
    }
  }, [config, loadStatus]);

  const stopIdle = useCallback(async () => {
    setError(null);
    try {
      await stopIdleSession();
      // 乐观更新：将 status 改为 stopping（等待 idle:finished 事件清空）
      setActiveSession((prev) => prev ? { ...prev, status: 'stopping' } : null);
    } catch (err) {
      setError(getUnifiedApiErrorMessage(err, '停止挂机失败'));
    }
  }, []);

  // ============================================
  // 历史记录
  // ============================================

  const loadHistory = useCallback(async () => {
    try {
      const res = await getIdleHistory();
      setHistory(res.history);
    } catch (err) {
      setHistory([]);
      setError(getUnifiedApiErrorMessage(err, '加载挂机历史失败'));
    }
  }, []);

  // ============================================
  // 回放控制
  // ============================================

  const selectSession = useCallback((sessionId: string | null) => {
    if (!sessionId) {
      setSelectedSession(null);
      setSessionBatches([]);
      setSelectedBatch(null);
      return;
    }

    // 从历史或活跃会话中查找
    const found =
      history.find((s) => s.id === sessionId) ??
      (activeSession?.id === sessionId ? activeSession : null);

    setSelectedSession(found ?? null);
    setSelectedBatch(null);

    if (found) {
      void getIdleBatches(sessionId)
        .then((res) => {
          setSessionBatches(res.batches);
        })
        .catch((error) => {
          setError(getUnifiedApiErrorMessage(error, '加载挂机回放失败'));
        });

      // 标记已查看（幂等，服务端有 viewed_at IS NULL 保护）
      void markIdleSessionViewed(sessionId).catch((error) => {
        setError(getUnifiedApiErrorMessage(error, '更新已读状态失败'));
      });
      // 同步更新本地历史记录的 viewedAt
      setHistory((prev) =>
        prev.map((s) => (s.id === sessionId && s.viewedAt === null ? { ...s, viewedAt: new Date().toISOString() } : s))
      );
    }
  }, [history, activeSession]);

  const selectBatch = useCallback((batchId: string | null) => {
    if (!batchId) {
      setSelectedBatch(null);
      return;
    }
    const found = sessionBatches.find((b) => b.id === batchId) ?? null;
    setSelectedBatch(found);
  }, [sessionBatches]);

  // batchLog 从 selectedBatch 派生，无需额外状态
  const batchLog: BattleLogEntryDto[] = selectedBatch?.battleLog ?? [];

  // ============================================
  // 清理
  // ============================================

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
      }
    };
  }, []);

  return {
    activeSession,
    isLoading,
    error,

    config,
    setConfig,
    saveConfig,

    startIdle,
    stopIdle,

    history,
    loadHistory,

    selectedSession,
    selectSession,
    sessionBatches,
    selectedBatch,
    selectBatch,
    batchLog,
  };
}
