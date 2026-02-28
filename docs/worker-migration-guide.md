# Worker 迁移方案文档

## 概述

将离线挂机战斗计算从主线程迁移到 Worker 线程池，提升系统并发能力和响应性能。

## 架构对比

### 当前架构（主线程）
```
主线程
├── Socket.IO 事件处理
├── HTTP 请求处理
└── 挂机战斗计算（阻塞）
    ├── BattleEngine.autoExecute()
    ├── 奖励计算
    └── 批量写入 DB
```

### Worker 架构
```
主线程
├── Socket.IO 事件处理
├── HTTP 请求处理
└── 挂机任务调度
    ├── 分发任务到 Worker
    ├── 接收计算结果
    └── 批量写入 DB

Worker 池（多线程）
├── Worker #1: 战斗计算
├── Worker #2: 战斗计算
└── Worker #N: 战斗计算
```

## 核心文件

### 1. Worker 实现
- **文件**: `server/src/workers/idleBattleWorker.ts`
- **职责**: 在独立线程中执行战斗计算（纯 CPU 密集型操作）
- **输入**: `{ session, batchIndex, userId, roomMonsters }`
- **输出**: `{ result, expGained, silverGained, itemsGained, battleLog, ... }`

### 2. Worker 池管理
- **文件**: `server/src/workers/workerPool.ts`
- **职责**: 管理多个 Worker 实例，提供任务分发、负载均衡、错误恢复
- **特性**:
  - 自动负载均衡（选择任务数最少的 Worker）
  - Worker 崩溃自动重启
  - 任务队列（所有 Worker 忙碌时排队）
  - 优雅关闭（等待任务完成）

### 3. 主线程协调器
- **文件**: `server/src/services/idle/idleBattleExecutorWorker.ts`
- **职责**: 协调 Worker 执行，处理 DB 写入和 Socket 推送
- **保留在主线程的操作**:
  - 数据库查询/写入
  - Socket.IO 推送
  - 终止条件检查
  - 批量 flush 逻辑

## 迁移步骤

### 阶段 1：准备（不影响生产）

1. **安装依赖**（无需额外依赖，Node.js 内置 `worker_threads`）

2. **初始化 Worker 池**

   在 `server/src/bootstrap/startupPipeline.ts` 中添加：

   ```typescript
   import { initializeWorkerPool, shutdownWorkerPool } from '../workers/workerPool.js';
   import { getMonsterDefinitions, getSkillDefinitions } from '../services/staticConfigLoader.js';

   // 启动流程中添加（在 initTables 之后）
   console.log('正在初始化 Worker 池...');
   const monsterDefs = new Map(
     getMonsterDefinitions().map((m) => [m.id, m])
   );
   const skillDefs = new Map(
     getSkillDefinitions().map((s) => [s.id, s])
   );

   await initializeWorkerPool({
     workerCount: Math.max(1, os.cpus().length - 1), // CPU 核心数 - 1
     workerData: { monsterDefs, skillDefs },
   });
   console.log('✓ Worker 池已就绪');

   // 关闭流程中添加（在 stopAllExecutionLoops 之后）
   await shutdownWorkerPool();
   console.log('✓ Worker 池已关闭');
   ```

3. **添加环境变量开关**

   在 `.env` 中添加：
   ```
   # 离线挂机使用 Worker（实验性功能）
   IDLE_USE_WORKER=false
   ```

4. **修改 idleSessionService.ts**

   ```typescript
   import { startExecutionLoop as startExecutionLoopMain } from './idleBattleExecutor.js';
   import { startExecutionLoop as startExecutionLoopWorker } from './idleBattleExecutorWorker.js';

   const USE_WORKER = process.env.IDLE_USE_WORKER === 'true';

   export function startExecutionLoop(session: IdleSessionRow, userId: number): void {
     if (USE_WORKER) {
       return startExecutionLoopWorker(session, userId);
     } else {
       return startExecutionLoopMain(session, userId);
     }
   }
   ```

### 阶段 2：灰度测试

1. **小规模测试**
   - 设置 `IDLE_USE_WORKER=true`
   - 重启服务
   - 观察 10-20 个挂机会话的表现

2. **监控指标**
   ```typescript
   // 添加到 app.ts 或独立监控路由
   app.get('/api/admin/worker-status', requireAdmin, (req, res) => {
     const workerPool = getWorkerPool();
     const status = workerPool.getStatus();
     res.json({
       ...status,
       eventLoopLag: getEventLoopLag(), // 需实现
     });
   });
   ```

3. **关键指标**
   - Worker 池状态：`totalWorkers`, `busyWorkers`, `queuedTasks`
   - 主线程事件循环延迟（应 < 100ms）
   - 挂机战斗完成率（应 = 100%）
   - 数据库写入延迟

### 阶段 3：全量切换

1. **确认测试通过**
   - 无 Worker 崩溃
   - 无数据丢失
   - 事件循环延迟正常
   - 玩家无异常反馈

2. **生产环境切换**
   - 更新 `.env`: `IDLE_USE_WORKER=true`
   - 滚动重启服务（Docker Swarm 零停机更新）

3. **回滚方案**
   - 设置 `IDLE_USE_WORKER=false`
   - 重启服务（立即回退到主线程模式）

## 性能优化建议

### 1. Worker 数量调优

```typescript
// 根据服务器配置调整
const cpuCount = os.cpus().length;
const workerCount = process.env.IDLE_WORKER_COUNT
  ? parseInt(process.env.IDLE_WORKER_COUNT, 10)
  : Math.max(1, cpuCount - 1);
```

**推荐配置**:
- 4 核 CPU: 3 个 Worker
- 8 核 CPU: 6-7 个 Worker
- 16 核 CPU: 12-14 个 Worker

### 2. 批量参数调优

当前配置：
- `FLUSH_BATCH_SIZE = 10`（每 10 场战斗 flush 一次）
- `FLUSH_INTERVAL_MS = 5000`（每 5 秒 flush 一次）

Worker 模式下可适当增大：
- `FLUSH_BATCH_SIZE = 20`（减少 DB 写入频率）
- `FLUSH_INTERVAL_MS = 10000`（降低 flush 开销）

### 3. 静态配置优化

Worker 启动时加载的静态配置应尽量精简：
- 仅传递挂机战斗必需的怪物/技能数据
- 掉落池配置可保留在主线程（由主线程在 flush 时处理）

## 故障排查

### Worker 启动失败

**症状**: 服务启动时报错 `Worker #X 启动超时`

**原因**:
- TypeScript 文件未编译（生产环境）
- Worker 脚本路径错误
- 静态配置数据过大导致序列化超时

**解决**:
```bash
# 检查编译产物
ls -lh server/dist/workers/

# 检查 Worker 日志
docker logs jiuzhou_server | grep Worker
```

### Worker 频繁崩溃

**症状**: 日志中出现 `Worker #X 异常退出，代码: 1`

**原因**:
- 内存泄漏（战斗日志过大）
- 未捕获的异常
- 静态配置数据损坏

**解决**:
1. 检查 Worker 内存使用：
   ```typescript
   // 在 Worker 中添加
   setInterval(() => {
     const usage = process.memoryUsage();
     if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB
       console.warn('[Worker] 内存使用过高:', usage);
     }
   }, 60_000);
   ```

2. 简化战斗日志（仅保留关键信息）

### 任务队列堆积

**症状**: `queuedTasks` 持续增长，挂机战斗延迟明显

**原因**:
- Worker 数量不足
- 单场战斗耗时过长
- Worker 被阻塞

**解决**:
1. 增加 Worker 数量
2. 优化战斗计算逻辑（减少回合数上限）
3. 检查 Worker 是否有同步阻塞操作

## 监控指标

### 关键指标

```typescript
// 事件循环延迟监控
let lastCheck = Date.now();
setInterval(() => {
  const now = Date.now();
  const lag = now - lastCheck - 5000; // 期望间隔 5 秒
  if (lag > 100) {
    console.warn(`[EventLoop] 延迟 ${lag}ms`);
  }
  lastCheck = now;
}, 5000);

// Worker 池状态监控
setInterval(() => {
  const status = getWorkerPool().getStatus();
  console.log('[WorkerPool]', status);

  // 告警：队列堆积
  if (status.queuedTasks > 50) {
    console.error('[WorkerPool] 任务队列堆积:', status.queuedTasks);
  }

  // 告警：Worker 不足
  if (status.busyWorkers === status.totalWorkers && status.queuedTasks > 0) {
    console.warn('[WorkerPool] 所有 Worker 忙碌，队列等待中');
  }
}, 30_000);
```

### Prometheus 指标（可选）

```typescript
import { register, Gauge, Counter } from 'prom-client';

const workerPoolGauge = new Gauge({
  name: 'idle_worker_pool_status',
  help: 'Worker 池状态',
  labelNames: ['metric'],
});

const workerTaskCounter = new Counter({
  name: 'idle_worker_tasks_total',
  help: 'Worker 处理任务总数',
  labelNames: ['status'], // success, error, timeout
});

// 定期更新
setInterval(() => {
  const status = getWorkerPool().getStatus();
  workerPoolGauge.set({ metric: 'total_workers' }, status.totalWorkers);
  workerPoolGauge.set({ metric: 'busy_workers' }, status.busyWorkers);
  workerPoolGauge.set({ metric: 'queued_tasks' }, status.queuedTasks);
}, 10_000);
```

## 注意事项

1. **Worker 内不能访问数据库**
   - Worker 线程无法共享主线程的数据库连接池
   - 所有 DB 查询必须在主线程完成，通过消息传递数据

2. **Worker 内不能推送 Socket 消息**
   - Socket.IO 实例绑定在主线程
   - 实时推送由主线程在接收 Worker 结果后执行

3. **静态配置数据同步**
   - Worker 启动时加载的静态配置是快照
   - 运行时更新配置需重启 Worker 池

4. **开发环境 Worker 启动**
   - 使用 `tsx` 执行 TypeScript Worker
   - `workerPool.ts` 中已配置 `execArgv: ['--import', 'tsx']`

5. **生产环境编译**
   - 确保 `server/src/workers/` 目录被 TypeScript 编译
   - 检查 `tsconfig.json` 的 `include` 配置

## 后续优化方向

1. **Worker 内完整奖励计算**
   - 将掉落池解析逻辑移到 Worker
   - 减少主线程在 flush 时的计算负担

2. **Worker 池动态扩缩容**
   - 根据任务队列长度动态调整 Worker 数量
   - 空闲时缩减 Worker，高峰时扩容

3. **Worker 亲和性调度**
   - 同一会话的任务尽量分配到同一 Worker
   - 利用 Worker 本地缓存提升性能

4. **分布式 Worker**
   - 将 Worker 池扩展到多台服务器
   - 使用消息队列（Redis/RabbitMQ）分发任务
