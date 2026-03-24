/**
 * PlayerInfo 属性加点请求链路测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定属性加减点成功后不再额外手动调用 `gameSocket.refreshCharacter()`，避免同一次操作重复发起角色刷新。
 * 2. 做什么：保留属性面板由服务端推送更新的单一刷新入口，减少请求成功后又手动补拉一遍的冗余链路。
 * 3. 不做什么：不渲染真实组件，不触发真实 HTTP/Socket，也不覆盖按钮禁用态判断。
 *
 * 输入/输出：
 * - 输入：`PlayerInfo/index.tsx` 源码文本。
 * - 输出：属性加减点成功分支中是否仍残留手动 `refreshCharacter` 调用。
 *
 * 数据流/状态流：
 * 读取 PlayerInfo 源码 -> 定位加点/减点成功分支 -> 断言成功后不再手动触发 Socket 角色刷新。
 *
 * 关键边界条件与坑点：
 * 1. 这里只锁属性加减点链路，头像上传等其他功能是否刷新角色数据不在本测试覆盖范围内。
 * 2. 如果未来把加减点逻辑抽到独立 Hook，这里的源码路径和断言目标都需要同步迁移。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const playerInfoPath = resolve(process.cwd(), 'client/src/pages/Game/modules/PlayerInfo/index.tsx');

describe('PlayerInfo 属性加点请求链路', () => {
  it('加点与减点成功后不应再手动 refreshCharacter', () => {
    const source = readFileSync(playerInfoPath, 'utf8');

    expect(source).toContain('const result = await addAttributePoint(attribute, attributePointStep);');
    expect(source).toContain('const result = await removeAttributePoint(attribute, attributePointStep);');
    expect(source).not.toContain('if (result.success) {\n        gameSocket.refreshCharacter();');
    expect(source).not.toContain('if (result.success) {\r\n        gameSocket.refreshCharacter();');
  });
});
