/**
 * 最近秘境默认选中策略回归测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中锁定“秘境弹窗打开时默认选中哪个秘境/难度”的判定规则。
 * 2. 做什么：保证 Game 与 MapModal 共用同一套最近秘境选择逻辑，避免各自散落 if 判断。
 * 3. 不做什么：不挂载 React 组件、不请求接口，也不验证弹窗样式。
 *
 * 输入/输出：
 * - 输入：秘境列表、当前分类、最近秘境选择。
 * - 输出：归一化后的默认 `activeId` 与可复用的最近秘境难度。
 *
 * 数据流/状态流：
 * - Game 产出最近秘境原始数据 -> 本模块归一化并决定默认秘境 -> MapModal 消费结果作为默认选中状态。
 *
 * 关键边界条件与坑点：
 * 1. 只有当前分类为 `dungeon` 时，最近秘境选择才应该生效，避免影响大世界地图弹窗。
 * 2. 最近秘境若已失效或不在列表中，必须稳定回退到当前列表第一项，不能保留不存在的选中项。
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeLastDungeonSelection,
  resolveInitialDungeonSelection,
} from '../MapModal/lastDungeonSelection.js';

describe('lastDungeonSelection', () => {
  it('秘境分类打开时，应优先选中最近一次进入的秘境', () => {
    const result = resolveInitialDungeonSelection({
      category: 'dungeon',
      filteredIds: ['dungeon-a', 'dungeon-b'],
      activeId: '',
      lastSelection: {
        dungeonId: 'dungeon-b',
        rank: 2,
      },
    });

    expect(result).toEqual({
      activeId: 'dungeon-b',
      rank: 2,
    });
  });

  it('最近秘境不在当前列表中时，应回退到列表第一项', () => {
    const result = resolveInitialDungeonSelection({
      category: 'dungeon',
      filteredIds: ['dungeon-a', 'dungeon-b'],
      activeId: '',
      lastSelection: {
        dungeonId: 'dungeon-c',
        rank: 3,
      },
    });

    expect(result).toEqual({
      activeId: 'dungeon-a',
      rank: null,
    });
  });

  it('非秘境分类不应套用最近秘境默认选中', () => {
    const result = resolveInitialDungeonSelection({
      category: 'world',
      filteredIds: ['map-a', 'map-b'],
      activeId: '',
      lastSelection: {
        dungeonId: 'dungeon-b',
        rank: 2,
      },
    });

    expect(result).toEqual({
      activeId: 'map-a',
      rank: null,
    });
  });

  it('最近秘境难度必须归一化为合法正整数', () => {
    expect(
      normalizeLastDungeonSelection({
        dungeonId: ' dungeon-a ',
        rank: 2.8,
      }),
    ).toEqual({
      dungeonId: 'dungeon-a',
      rank: 2,
    });

    expect(
      normalizeLastDungeonSelection({
        dungeonId: 'dungeon-a',
        rank: 0,
      }),
    ).toBeNull();
  });
});
