# 属性注册表与反弹减伤 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `jianbaoshang` 与新增 `jianfantan` 全量接入属性定义、展示、来源与战斗结算，并收口重复属性名单。

**Architecture:** 先建立服务端属性注册表和前端展示注册表，再让功法约束、角色计算、装备成长、战斗快照和战斗公式统一消费该入口。反弹伤害减免统一在 `reactiveDamage.ts` 应用，避免技能反弹与套装反弹出现双轨逻辑。

**Tech Stack:** TypeScript、Node.js、React、现有 battle/service 模块、`node:test` 测试文件、`tsc -b`

---

### Task 1: 写属性注册表测试与反弹减伤测试

**Files:**
- Modify: `server/src/services/__tests__/techniqueGenerationConstraintsPassiveKey.test.ts`
- Modify: `server/src/services/__tests__/reflectDamageBuff.test.ts`
- Modify: `server/src/services/__tests__/battleDefenseReductionFormula.test.ts`

**Step 1: 先补测试用例**

- 增加 `jianfantan` 属于受支持功法被动属性的断言。
- 增加 `reflect_damage` 会被 `jianfantan` 降低的断言。
- 保持 `jianbaoshang` 暴伤减免断言继续覆盖原有公式。

**Step 2: 按项目约束不运行测试**

- 项目明确禁止执行 `test` 命令，本次只先写测试文件，不运行测试进程。

### Task 2: 新建服务端属性注册表

**Files:**
- Create: `server/src/services/shared/characterAttrRegistry.ts`
- Modify: `server/src/services/shared/techniqueGenerationConstraints.ts`
- Modify: `server/src/services/shared/techniquePassiveAttrs.ts`
- Modify: `server/src/services/shared/affixModifier.ts`
- Modify: `server/src/services/equipmentGrowthRules.ts`
- Modify: `server/src/services/infoTargetService.ts`
- Modify: `server/src/services/achievement/shared.ts`

**Step 1: 新建注册表**

- 定义属性元数据与导出集合。
- 收口功法被动语义、百分比属性、标题效果、装备成长分类等重复规则。

**Step 2: 替换现有重复名单**

- 让上述模块改为复用注册表导出的集合和中文名映射。

### Task 3: 打通服务端运行时属性结构

**Files:**
- Modify: `server/src/services/characterComputedService.ts`
- Modify: `server/src/services/staticConfigLoader.ts`
- Modify: `server/src/services/shared/partnerRules.ts`
- Modify: `server/src/services/shared/partnerView.ts`
- Modify: `server/src/services/shared/partnerRecruitRules.ts`
- Modify: `server/src/services/inventory/shared/types.ts`
- Modify: `server/src/game/gameState.ts`
- Modify: `server/src/services/characterService.ts`

**Step 1: 补齐类型**

- 给角色、伙伴、功法、背包白名单等结构加入 `jianfantan`。

**Step 2: 接入计算链路**

- 默认值、归一化、百分比属性取整规则、伙伴/招募/展示 DTO 都补齐新属性。

### Task 4: 打通战斗快照与反弹减伤结算

**Files:**
- Modify: `server/src/battle/types.ts`
- Modify: `server/src/battle/utils/validation.ts`
- Modify: `server/src/battle/battleFactory.ts`
- Modify: `server/src/services/battle/shared/monsters.ts`
- Modify: `server/src/services/battle/snapshot.ts`
- Modify: `server/src/services/idle/idleBattleSimulationCore.ts`
- Modify: `server/src/battle/modules/reactiveDamage.ts`
- Modify: `server/src/battle/modules/skill.ts`
- Modify: `server/src/battle/modules/setBonus.ts`
- Modify: `server/src/battle/modules/damage.ts`

**Step 1: 补战斗属性结构**

- 所有进入 `BattleAttrs` 的入口都带上 `jianfantan`。

**Step 2: 把反弹减免统一接入 `reactiveDamage.ts`**

- 技能反弹和套装反弹共用一套减免逻辑。

**Step 3: 保持暴伤减免逻辑不回归**

- `jianbaoshang` 仍由暴击伤害倍率公式消费。

### Task 5: 收口前端属性展示定义

**Files:**
- Modify: `client/src/pages/Game/shared/attrDisplay.ts`
- Modify: `client/src/pages/Game/shared/itemMetaFormat.ts`
- Modify: `client/src/pages/Game/shared/techniquePassiveDisplay.ts`
- Modify: `client/src/pages/Game/index.tsx`
- Modify: `client/src/pages/Game/modules/PlayerInfo/index.tsx`
- Modify: `client/src/services/gameSocket.ts`
- Modify: `client/src/services/api/partner.ts`

**Step 1: 扩展前端共享属性展示表**

- 补上 `jianbaoshang`、`jianfantan` 的中文名、排序和百分比属性识别。

**Step 2: 去掉局部重复名单**

- 让页面和 tooltip 复用共享定义，而不是各自再抄一份。

### Task 6: 静态校验

**Files:**
- Modify: 本次实际改动文件

**Step 1: 执行 TypeScript 构建校验**

Run: `tsc -b`

Expected:

- 成功完成，或明确列出剩余报错位置与原因。

**Step 2: 不执行 Git 提交**

- 项目明确禁止未经允许的 Git 操作，本次不执行 `git add` / `git commit`。
