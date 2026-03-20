# 秘境弹窗默认选中上次战斗秘境 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让秘境弹窗打开时，优先自动选中玩家上次进入或正在进行中的秘境与难度。

**Architecture:** 在客户端新增单一的“最近秘境选择”纯函数模块，统一处理最近秘境记录的归一化、候选优先级和默认选中判定。`Game` 负责从当前秘境战斗会话与成功进入秘境动作中产出原始数据，`MapModal` 只消费归一化后的默认选择，避免在多个组件里重复写“取上次秘境”的判断。

**Tech Stack:** React 19、TypeScript、Vitest/Node test、Ant Design

---

### Task 1: 提炼最近秘境选择纯函数

**Files:**
- Create: `client/src/pages/Game/modules/MapModal/lastDungeonSelection.ts`
- Test: `client/src/pages/Game/modules/__tests__/lastDungeonSelection.test.ts`

**Step 1: Write the failing test**

覆盖以下行为：
- 当前分类为秘境且存在最近秘境选择时，应优先选中对应 `dungeonId`
- 最近秘境不存在于当前列表时，应回退到列表第一项
- 最近秘境难度非法或缺失时，应保持现有难度默认逻辑

**Step 2: Run test to verify it fails**

Run: `pnpm --filter ./client exec vitest run client/src/pages/Game/modules/__tests__/lastDungeonSelection.test.ts`

**Step 3: Write minimal implementation**

实现：
- 最近秘境选择类型定义
- `resolveInitialDungeonSelection`
- `normalizeLastDungeonSelection`

**Step 4: Run test to verify it passes**

Run: `pnpm --filter ./client exec vitest run client/src/pages/Game/modules/__tests__/lastDungeonSelection.test.ts`

### Task 2: Game 收口最近秘境来源

**Files:**
- Modify: `client/src/pages/Game/index.tsx`
- Modify: `client/src/services/api/world.ts`

**Step 1: Write the failing integration-oriented test if needed**

若纯函数测试已能锁住默认选中策略，则不额外补组件挂载测试，避免重复测试同一规则。

**Step 2: Implement minimal code**

实现：
- `Game` 新增最近秘境选择状态
- 成功进入秘境后记录 `dungeonId + rank`
- 若当前 battle session 为秘境，则通过 `instanceId -> getDungeonInstance` 同步最近秘境选择
- 将该状态作为 `MapModal` 的输入 props

### Task 3: MapModal 消费默认选择

**Files:**
- Modify: `client/src/pages/Game/modules/MapModal/index.tsx`

**Step 1: Implement minimal code**

实现：
- `MapModal` 新增 `lastDungeonSelection` 输入
- 弹窗打开且分类为秘境时，优先使用最近秘境选择作为默认 `activeId`
- 复用现有 `dungeonRankById`，避免新增第二套难度状态

### Task 4: Verify

**Files:**
- Verify: `client/src/pages/Game/modules/__tests__/lastDungeonSelection.test.ts`
- Verify: `tsc -b`

**Step 1: Run focused test**

Run: `pnpm --filter ./client exec vitest run client/src/pages/Game/modules/__tests__/lastDungeonSelection.test.ts`

**Step 2: Run TypeScript build check**

Run: `tsc -b`
