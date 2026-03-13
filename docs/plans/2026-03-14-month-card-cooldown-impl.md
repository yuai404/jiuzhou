# 月卡冷却缩减 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让激活中的修行月卡为伙伴招募与洞府研修提供 10% 冷却缩减，并保持状态接口与创建拦截共用同一套规则。

**Architecture:** 后端新增单一的月卡冷却权益共享模块，集中处理“是否激活月卡”和“基础冷却秒数如何缩减”；伙伴招募与洞府研修继续只依赖各自的共享冷却纯函数，避免业务服务重复拼接月卡逻辑。

**Tech Stack:** TypeScript, Node.js, Express, PostgreSQL, node:test

---

### Task 1: 先补失败测试锁定冷却缩减行为

**Files:**
- Modify: `server/src/services/__tests__/partnerRecruitCooldown.test.ts`
- Modify: `server/src/services/__tests__/techniqueResearchCooldown.test.ts`

**Step 1: 写伙伴招募月卡冷却测试**

- 在正式冷却口径下增加“月卡未激活”和“月卡激活”对照用例。
- 断言月卡激活时 `168h` 会缩短到 `151.2h`，并同步影响 `cooldownUntil` 与 `cooldownRemainingSeconds`。

**Step 2: 写洞府研修月卡冷却测试**

- 增加“月卡激活时 72h 冷却缩短到 64.8h”的用例。
- 保留原有非月卡用例，确保默认口径不被破坏。

**Step 3: 运行局部测试确认先失败**

- Run: `pnpm --filter ./server exec tsx --test src/services/__tests__/partnerRecruitCooldown.test.ts src/services/__tests__/techniqueResearchCooldown.test.ts`
- Expected: FAIL，提示共享冷却函数还不支持月卡冷却缩减参数。

### Task 2: 抽取共享月卡冷却权益模块

**Files:**
- Create: `server/src/services/shared/monthCardBenefits.ts`
- Modify: `server/src/services/staticConfigLoader.ts`

**Step 1: 新增月卡权益共享模块**

- 暴露月卡基础配置常量与类型安全的冷却缩减纯函数。
- 提供统一的“按秒计算实际冷却”的入口，避免两个玩法各自维护 10% 公式。

**Step 2: 提供月卡激活查询能力**

- 在共享模块里新增角色月卡激活态查询函数。
- 只返回当前任务需要的布尔结果，不提前抽象无关月卡能力。

### Task 3: 接入伙伴招募与洞府研修共享冷却入口

**Files:**
- Modify: `server/src/services/shared/partnerRecruitRules.ts`
- Modify: `server/src/services/shared/techniqueResearchCooldown.ts`
- Modify: `server/src/services/partnerRecruitService.ts`
- Modify: `server/src/services/techniqueGenerationService.ts`

**Step 1: 扩展共享冷却纯函数参数**

- 让两个冷却纯函数都支持显式传入“月卡冷却缩减比例”。
- 默认值保持 0，避免测试外的现有调用受影响。

**Step 2: 在服务层统一注入月卡激活态**

- 在伙伴招募状态查询与创建入口读取月卡激活状态。
- 在洞府研修状态查询与创建入口读取月卡激活状态。
- 两边都只把布尔/倍率传给共享冷却函数，不在服务层自行计算秒数。

### Task 4: 回归校验

**Files:**
- Modify: 如实现中受影响文件

**Step 1: 运行局部测试**

- Run: `pnpm --filter ./server exec tsx --test src/services/__tests__/partnerRecruitCooldown.test.ts src/services/__tests__/techniqueResearchCooldown.test.ts`

**Step 2: 运行 TypeScript 构建校验**

- Run: `tsc -b`

**Step 3: 汇总结果**

- 说明新增的共享月卡冷却权益模块被哪些冷却入口复用。
- 报告局部测试与 `tsc -b` 结果。
