/**
 * 作用：为 client 的现有 Vite 样式管线接入 Tailwind PostCSS 编译能力。
 * 不做什么：不改动 Vite 插件链、不注入额外样式库、不负责主题变量映射。
 * 输入/输出：
 * - 输入：Vite 交给 PostCSS 的 CSS 资源
 * - 输出：经 Tailwind 官方 PostCSS 插件展开后的 CSS
 * 数据流/状态流：
 * - `src/index.css` 中的 Tailwind 指令进入 Vite CSS 管线
 * - PostCSS 通过 `@tailwindcss/postcss` 解析并生成实际原子类
 * - 生成结果继续回到 Vite 既有打包流程
 * 复用设计说明：
 * - 把 Tailwind 接入收敛到 PostCSS 单一入口，避免在 Vite 配置和业务样式文件里重复声明插件。
 * - 后续若新增更多 Tailwind 相关 CSS 文件，仍复用这一个 PostCSS 入口，不需要重复扩展构建链。
 * 关键边界条件与坑点：
 * 1. 当前 `client/package.json` 使用 `type: "module"`，配置文件必须使用 ESM 导出，避免 Node 加载失败。
 * 2. 这里只注册 Tailwind 官方插件，不额外引入兼容层，避免构建链膨胀和样式行为漂移。
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
