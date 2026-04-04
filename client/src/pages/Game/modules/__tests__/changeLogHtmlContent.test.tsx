/**
 * 更新日志 HTML 渲染静态回归测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定更新日志条目里的受控 HTML 片段会被按真实标签结构输出。
 * 2. 做什么：保证 HTML 注入入口集中在专用组件，而不是散落到页面各处。
 * 3. 不做什么：不验证弹窗布局，不覆盖数据排序或菜单链路。
 *
 * 输入/输出：
 * - 输入：单条更新日志 HTML 字符串。
 * - 输出：`renderToStaticMarkup` 生成的静态 HTML 结构。
 *
 * 数据流/状态流：
 * 静态更新日志 HTML -> `ChangeLogHtmlContent` -> 静态 HTML 字符串断言。
 *
 * 关键边界条件与坑点：
 * 1. `<strong>`、`<br>`、`<a>` 这类常用标签必须按真实节点输出，不能再被当作普通文本。
 * 2. 外层类名必须稳定，避免页面样式无法统一命中富文本容器。
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ChangeLogHtmlContent from '../ChangeLogModal/ChangeLogHtmlContent';

describe('ChangeLogHtmlContent', () => {
  it('应渲染更新日志中的 HTML 片段', () => {
    const html = renderToStaticMarkup(
      <ChangeLogHtmlContent
        className="change-log-entry-item"
        content={'开放<strong>证道期</strong>相关内容<br /><a href="https://example.com">查看详情</a>'}
      />,
    );

    expect(html).toContain('change-log-html-content change-log-entry-item');
    expect(html).toContain('<strong>证道期</strong>');
    expect(html).toContain('<br/>');
    expect(html).toContain('<a href="https://example.com">查看详情</a>');
  });
});
