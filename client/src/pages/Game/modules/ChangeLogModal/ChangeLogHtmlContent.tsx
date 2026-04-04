/**
 * 更新日志 HTML 内容渲染组件。
 *
 * 作用：
 * 1. 统一承接更新日志单条内容的 HTML 片段渲染，避免在页面 JSX 中散落 `dangerouslySetInnerHTML`。
 * 2. 只服务于当前仓库内维护的静态更新日志数据，让 `<strong>`、`<br>`、`<a>` 等受控 HTML 直接生效。
 * 3. 不做什么：不解析 Markdown、不做运行时清洗，也不接收外部接口或用户输入的富文本。
 *
 * 输入 / 输出：
 * - 输入：单条更新日志 HTML 字符串与可选样式类名。
 * - 输出：一段可直接挂载到更新日志列表中的富文本节点。
 *
 * 数据流 / 状态流：
 * `changeLogData.ts` 静态 HTML 字符串 -> 本组件集中渲染 -> `ChangeLogModal` 顺序展示。
 *
 * 复用设计说明：
 * 1. 把 HTML 注入入口集中到单文件后，后续若更新日志样式或边界约束变化，只改这一处。
 * 2. 页面层继续只关心“日期 + 内容列表”结构，不直接感知具体 HTML 注入实现。
 * 3. 高变化点是日志内容本身，因此组件保持极小职责，只承接受控静态片段输出。
 *
 * 关键边界条件与坑点：
 * 1. 本组件只允许消费仓库静态数据，不能复用到接口返回或用户输入内容，否则会引入 XSS 风险。
 * 2. HTML 片段外层容器必须稳定，避免不同条目在布局和间距上各写一套样式。
 */

interface ChangeLogHtmlContentProps {
  content: string;
  className?: string;
}

const buildChangeLogHtmlContentClassName = (className?: string): string =>
  className ? `change-log-html-content ${className}` : 'change-log-html-content';

const ChangeLogHtmlContent: React.FC<ChangeLogHtmlContentProps> = ({ content, className }) => {
  return (
    <div
      className={buildChangeLogHtmlContentClassName(className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
};

export default ChangeLogHtmlContent;
