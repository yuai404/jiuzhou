/**
 * IdleStatusIndicator — 挂机状态指示器
 *
 * 作用：
 *   在游戏主界面状态栏展示当前挂机会话的实时摘要信息。
 *   仅在 activeSession 非 null 时渲染，否则返回 null。
 *   通过共享地图详情缓存解析地图/房间中文名，避免 tooltip 先露出英文 ID。
 *
 * 输入/输出：
 *   - activeSession: 当前活跃会话（null 时组件不渲染）
 *   - onOpenPanel: 点击指示器时打开挂机面板的回调
 *
 * 数据流：
 *   useIdleBattle.activeSession → props.activeSession → 本地 elapsed 计时器 → 展示
 *   gameSocket idle:update → useIdleBattle → activeSession.totalExp/totalSilver 更新 → 重渲染
 *
 * 关键边界条件：
 *   1. elapsed 计时器每秒 tick，组件卸载时必须清除，避免内存泄漏
 *   2. status === 'stopping' 时显示"停止中"标签，不再更新计时
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tag, Tooltip } from 'antd';
import { LoadingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { IdleSessionDto } from '../types';
import { useMapDetailSnapshot } from '../../../shared/useMapDetailSnapshot';
import './IdleStatusIndicator.scss';

// ============================================
// 工具函数
// ============================================

/**
 * 将毫秒数格式化为 "X时Y分Z秒" 形式
 * 复用点：仅此处使用，不抽到全局 util（避免过度抽象）
 */
const formatElapsed = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
};

// ============================================
// Props
// ============================================

interface IdleStatusIndicatorProps {
  activeSession: IdleSessionDto;
  onOpenPanel?: () => void;
}

// ============================================
// 组件
// ============================================

const IdleStatusIndicator: React.FC<IdleStatusIndicatorProps> = ({
  activeSession,
  onOpenPanel,
}) => {
  // 实时已挂机时长（每秒更新）
  const [elapsed, setElapsed] = useState<number>(() =>
    Date.now() - new Date(activeSession.startedAt).getTime()
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStopping = activeSession.status === 'stopping';
  const { snapshot, loading } = useMapDetailSnapshot(activeSession.mapId);
  const roomName = useMemo(() => {
    const matchedRoom = snapshot?.rooms.find((room) => room.id === activeSession.roomId);
    if (matchedRoom?.name) return matchedRoom.name;
    return loading ? '同步中...' : '未知房间';
  }, [activeSession.roomId, loading, snapshot]);
  const mapName = snapshot?.mapName || (loading ? '同步中...' : '未知地图');

  useEffect(() => {
    // stopping 状态不再更新计时
    if (isStopping) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const startMs = new Date(activeSession.startedAt).getTime();
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startMs);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeSession.startedAt, isStopping]);

  const tooltipContent = (
    <div className="idle-status-tooltip">
      <div className="idle-status-tooltip-row">
        <span>地图</span>
        <span>{mapName}</span>
      </div>
      <div className="idle-status-tooltip-row">
        <span>房间</span>
        <span>{roomName}</span>
      </div>
      {activeSession.targetMonsterName && (
        <div className="idle-status-tooltip-row">
          <span>目标怪物</span>
          <span>{activeSession.targetMonsterName}</span>
        </div>
      )}
      <div className="idle-status-tooltip-row">
        <span>战斗场数</span>
        <span>{activeSession.totalBattles}（胜 {activeSession.winCount} / 败 {activeSession.loseCount}）</span>
      </div>
      <div className="idle-status-tooltip-row">
        <span>累计修为</span>
        <span>+{activeSession.totalExp.toLocaleString()}</span>
      </div>
      <div className="idle-status-tooltip-row">
        <span>累计银两</span>
        <span>+{activeSession.totalSilver.toLocaleString()}</span>
      </div>
      {activeSession.bagFullFlag && (
        <div className="idle-status-tooltip-warn">背包已满，物品掉落已暂停</div>
      )}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="bottomRight">
      <div
        className={`idle-status-indicator${isStopping ? ' is-stopping' : ''}`}
        role="button"
        tabIndex={0}
        onClick={onOpenPanel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenPanel?.();
          }
        }}
        aria-label="挂机状态，点击打开挂机面板"
      >
        {/* 状态图标 */}
        <span className="idle-status-icon">
          {isStopping ? (
            <LoadingOutlined spin />
          ) : (
            <ThunderboltOutlined />
          )}
        </span>

        {/* 挂机时长 */}
        <span className="idle-status-elapsed">{formatElapsed(elapsed)}</span>

        {/* 状态标签 */}
        {isStopping ? (
          <Tag color="warning" className="idle-status-tag">停止中</Tag>
        ) : (
          <Tag color="success" className="idle-status-tag">挂机中</Tag>
        )}

        {/* 背包满警告点 */}
        {activeSession.bagFullFlag && (
          <span className="idle-status-bag-full" title="背包已满" aria-label="背包已满" />
        )}
      </div>
    </Tooltip>
  );
};

export default IdleStatusIndicator;
