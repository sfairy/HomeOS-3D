// P6-b：settings 里「同一面板的 .internals.ts 族」合并为该面板一个实现文件。
const S = 'homeos/frontend/src/features/settings'
const sys = `${S}/groups/system`
export default {
  merges: [
    {
      into: `${sys}/system-config-panel.ts`,
      from: [
        `${sys}/system-config-panel-prefs.internals.ts`,
        `${sys}/system-config-panel-fields.internals.ts`,
        `${sys}/system-config-panel-nav.internals.ts`,
        `${sys}/system-config-panel-search.internals.ts`,
        `${sys}/system-config-panel-io.internals.ts`,
        `${sys}/system-config-panel.internals.ts`,
      ],
      header: '/**\n * 高级参数面板：偏好、字段渲染、导航、搜索、导入导出。\n *\n * 曾按 hooks 习惯拆成 6 个 .internals.ts（文件名只说「内部实现」，不说做什么），\n * 它们服务同一个面板 → 合并为一个实现文件。\n */',
    },
    {
      into: `${sys}/profiles.ts`,
      from: [`${sys}/profiles/internals.ts`, `${sys}/profiles/use-profiles-section.ts`],
    },
  ],
}
