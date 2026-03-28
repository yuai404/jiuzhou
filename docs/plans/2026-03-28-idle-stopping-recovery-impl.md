# 挂机停止态自愈 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复玩家离线战斗偶尔永久卡在“停止中”的问题，让失活的 stopping 会话能被服务端自动收敛为最终态。

**Architecture:** 复用现有 `idleSessionActivity` 作为 stopping 会话判定单一入口，把“无执行循环承接”和“执行循环已失活但注册表未清理”统一收口成同一套孤儿判定。执行器继续只负责调度与心跳上报，`idleSessionService` 仍是唯一的状态收敛入口，避免前端、路由或其他服务重复实现 stopping 自愈逻辑。

**Tech Stack:** TypeScript, Node.js, Express, PostgreSQL, node:test

---

### Task 1: 先补失败测试锁定 stopping 卡死场景

**Files:**
- Modify: `server/src/services/__tests__/idleSessionActivity.test.ts`

**Step 1: 写注册表心跳失活的 stopping 会话测试**

- 增加“会话仍被注册，但最后心跳已超过阈值”的用例。
- 断言该会话会被识别为应收敛的孤儿 stopping 会话。

**Step 2: 写新鲜心跳不应被误伤的对照测试**

- 增加“会话已注册且心跳仍新鲜”的用例。
- 断言它不会被提前收敛，避免正常停止流程被误判。

**Step 3: 运行局部测试确认先失败**

- Run: `pnpm --filter ./server exec tsx --test src/services/__tests__/idleSessionActivity.test.ts`
- Expected: FAIL，提示共享判定函数尚未支持心跳失活识别。

### Task 2: 扩展执行循环注册表与共享判定

**Files:**
- Modify: `server/src/services/idle/idleExecutionRegistry.ts`
- Modify: `server/src/services/idle/idleSessionActivity.ts`

**Step 1: 在执行循环注册表中加入心跳时间戳**

- 让注册表在保留 `sessionId` 唯一索引的同时记录最近一次心跳时间。
- 暴露读取/触达心跳的共享函数，避免执行器与 Service 各自维护运行态结构。

**Step 2: 扩展 stopping 共享判定规则**

- 在 `idleSessionActivity` 中新增“已注册但心跳失活”的判定。
- 保持该模块纯函数属性，输入最小会话视图 + 注册表探针，输出应收敛的 sessionId 列表。

### Task 3: 让执行器持续上报运行心跳

**Files:**
- Modify: `server/src/services/idle/idleBattleExecutorWorker.ts`
- Modify: `server/src/services/idle/idleBattleExecutor.ts`

**Step 1: 在执行循环关键节点触达心跳**

- 启动循环、请求立即停止、调度下一轮、开始执行 tick 时统一更新心跳。
- 不新增第二套运行态容器，继续复用现有注册表。

**Step 2: 保持停止链路单一出口**

- 只由 `idleSessionService` 在读活跃会话前做 stopping 收敛。
- 执行器不直接写入新的 stopping 自愈状态，避免状态写入源分叉。

### Task 4: 回归校验

**Files:**
- Modify: 如实现中受影响文件

**Step 1: 运行局部测试**

- Run: `pnpm --filter ./server exec tsx --test src/services/__tests__/idleSessionActivity.test.ts`

**Step 2: 运行 TypeScript 构建校验**

- Run: `tsc -b`

**Step 3: 汇总结果**

- 说明 stopping 自愈现在如何复用共享判定入口。
- 报告局部测试与 `tsc -b` 结果。
