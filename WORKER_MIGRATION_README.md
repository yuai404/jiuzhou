# Worker 迁移方案 - README

## 概述

本方案将离线挂机战斗计算从主线程迁移到 Worker 线程池，解决以下问题：
- 主线程事件循环阻塞（影响 Socket.IO 实时性）
- 无法利用多核 CPU（单线程瓶颈）
- 扩展性受限（玩家增长后性能下降）

## 快速开始

### 1. 查看文档

- **快速开始**: `docs/worker-quickstart.md`（3 步完成集成）
- **完整指南**: `docs/worker-migration-guide.md`（详细迁移步骤）
- **交付总结**: `docs/worker-delivery-summary.md`（架构设计和性能预期）
- **变更清单**: `WORKER_MIGRATION_CHECKLIST.md`（测试和监控清单）

### 2. 核心文件

```
server/src/
├── workers/
│   ├── idleBattleWorker.ts          # Worker 线程实现
│   └── workerPool.ts                # Worker 池管理
├── services/idle/
│   └── idleBattleExecutorWorker.ts  # 主线程协调器（Worker 版本）
└── bootstrap/
    └── workerIntegration.example.ts # 启动集成示例
```

### 3. 集成步骤（3 步）

#### 步骤 1：添加环境变量

在 `.env` 中添加：
```bash
IDLE_USE_WORKER=false
```

#### 步骤 2：修改启动流程

在 `server/src/bootstrap/startupPipeline.ts` 中添加 Worker 池初始化（参考 `workerIntegration.example.ts`）。

#### 步骤 3：添加执行器切换逻辑

在 `server/src/services/idle/idleSessionService.ts` 中添加 Worker/主线程切换逻辑。

详细代码请参考 `docs/worker-quickstart.md`。

## 架构对比

### 当前架构（主线程）
```
主线程
├── Socket.IO 事件处理
├── HTTP 请求处理
└── 挂机战斗计算（阻塞）
```

### Worker 架构
```
主线程
├── Socket.IO 事件处理
├── HTTP 请求处理
└── 挂机任务调度

Worker 池（多线程）
├── Worker #1: 战斗计算
├── Worker #2: 战斗计算
└── Worker #N: 战斗计算
```

## 性能预期

| 指标 | 主线程模式 | Worker 模式 | 改善 |
|------|-----------|------------|------|
| 事件循环延迟 | 200-500ms | 10-50ms | 80-90% |
| 挂机战斗吞吐量 | 10 场/秒 | 50-100 场/秒 | 5-10x |
| Socket 响应延迟 | 100-300ms | 10-30ms | 70-90% |
| CPU 利用率 | 单核 100% | 多核 60-80% | 充分利用 |

## 当前建议

**200 在线玩家暂时不需要迁移**，但应：
1. 添加事件循环延迟监控
2. 准备 Worker 迁移方案（已完成）
3. 在线玩家超过 300 时启用 Worker 模式

**触发迁移的阈值**：
- 在线玩家 > 300
- 事件循环延迟持续 > 100ms
- 玩家投诉实时交互卡顿

## 测试流程

1. **本地开发测试**：2-3 个挂机会话，验证功能正常
2. **小规模灰度**：10-20 个挂机会话，监控 1 小时
3. **中等规模测试**：50-100 个挂机会话，监控 6 小时
4. **全量切换**：所有挂机会话，持续监控 24 小时

## 回滚方案

如果 Worker 模式出现问题：

1. 修改 `.env`: `IDLE_USE_WORKER=false`
2. 重启服务
3. 系统立即恢复到主线程模式，无数据丢失

## 监控指标

### 关键指标
- `totalWorkers`: Worker 总数
- `busyWorkers`: 忙碌 Worker 数
- `queuedTasks`: 队列中的任务数
- 事件循环延迟（主线程）

### 告警阈值
- 队列堆积 > 50
- 事件循环延迟 > 100ms
- Worker 频繁崩溃

## 交付物

### 代码（~1100 行）
- Worker 线程实现（350 行）
- Worker 池管理（350 行）
- 主线程协调器（400 行）

### 文档（~1300 行）
- 完整迁移文档（800 行）
- 快速开始指南（300 行）
- 交付总结（200 行）

### 总计：~2400 行

## 风险评估

**风险等级**：低

**原因**：
- 支持快速回滚（修改环境变量即可）
- 数据流完全兼容（无需迁移数据）
- 可灰度测试（小规模验证后再全量）
- 主线程模式保留（作为备份方案）

## 后续优化

1. **Worker 内完整奖励计算**（减少主线程负担）
2. **Worker 池动态扩缩容**（根据负载自动调整）
3. **分布式 Worker**（扩展到多台服务器）

## 联系方式

如有问题，请参考：
- 完整文档：`docs/worker-migration-guide.md`
- 故障排查：`docs/worker-migration-guide.md` 第 7 节
- 变更清单：`WORKER_MIGRATION_CHECKLIST.md`

---

**当前状态**: ✅ 已完成开发，等待集成测试

**下一步**: 按照快速开始指南进行集成（预计 1 小时）

**预计收益**: 事件循环延迟降低 80-90%，吞吐量提升 5-10x
