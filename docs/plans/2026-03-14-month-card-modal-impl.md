# Month Card Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正月卡弹窗中的灵石图标、移除误导性的进度展示，并把弹窗高度改成内容自适应。

**Architecture:** 前端把月卡状态展示规则集中到 `MonthCardModal` 旁边的共享模块，组件只负责渲染。样式层去掉固定高度，改成最大高度约束加内容区滚动，避免空白区域由组件自行撑满。

**Tech Stack:** React 19、TypeScript、Ant Design、SCSS

---

### Task 1: 收敛月卡展示规则

**Files:**
- Create: `client/src/pages/Game/modules/MonthCardModal/monthCardDisplay.ts`
- Modify: `client/src/pages/Game/modules/MonthCardModal/index.tsx`
- Test: `client/src/pages/Game/modules/MonthCardModal/__tests__/monthCardDisplay.test.ts`

**Step 1: 写失败测试**

```ts
it('激活中的月卡应展示剩余天数与到期时间', () => {
  expect(buildMonthCardPanelState({ active: true, daysLeft: 12, expireAt: '2026-03-30T08:00:00.000Z' }).statusValue).toBe('剩余 12 天');
});
```

**Step 2: 运行测试确认失败**

Run: `pnpm --filter ./client exec vitest run client/src/pages/Game/modules/MonthCardModal/__tests__/monthCardDisplay.test.ts`
Expected: FAIL，提示共享展示函数尚未实现

**Step 3: 写最小实现**

```ts
export const buildMonthCardPanelState = (...) => ({ ... });
export const buildMonthCardDailyRewards = (...) => [{ icon: IMG_LINGSHI, ... }];
```

**Step 4: 运行测试确认通过**

Run: `pnpm --filter ./client exec vitest run client/src/pages/Game/modules/MonthCardModal/__tests__/monthCardDisplay.test.ts`
Expected: PASS

### Task 2: 调整弹窗结构与自适应高度

**Files:**
- Modify: `client/src/pages/Game/modules/MonthCardModal/index.tsx`
- Modify: `client/src/pages/Game/modules/MonthCardModal/index.scss`

**Step 1: 接入共享展示状态**

```tsx
const panelState = buildMonthCardPanelState(...);
```

**Step 2: 删除进度条 UI，改成状态信息**

```tsx
<div className="monthcard-status-title">{panelState.title}</div>
<div className="monthcard-status-value">{panelState.statusValue}</div>
<div className="monthcard-status-hint">{panelState.statusHint}</div>
```

**Step 3: 去掉固定高度并加最大高度约束**

```scss
.monthcard-shell {
  max-height: min(76vh, 720px);
}
```

**Step 4: 执行类型校验**

Run: `tsc -b`
Expected: PASS
