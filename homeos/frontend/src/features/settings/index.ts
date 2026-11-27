/**
 * settings 域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节（`shared/` `connect/` `display/` … 及各面板的 `composables/`）不外借：跨域引用只允许
 * `import ... from '@/features/settings'`（门禁见 ops/checks/frontend/check_frontend_deps.mjs 与
 * biome.json 的 noRestrictedImports 规则）。
 *
 * 这里**刻意只导出被跨域实际用到的成员**，不做「整域再导出」：settings 是 100+ 文件的
 * 功能域，全量 barrel 会把面板实现拖进任何引用方的 chunk。
 * 新增跨域需求时，按需在这里补一条具名导出，并同步把调用方从深引用改走 barrel。
 */

// 由 features/security 跨域使用（环境传感器字段映射）
export { useEnvSensorMap } from './shared/env-sensor-map'

// 由 features/home-mode 跨域使用（编辑器顶部的编排工具条）
// 品牌页里「模式编辑器」是设置页的宿主体，但它复用 settings 的工具条实现：
// 页签 / 排序 / 工具栏三者一旦各写一份，快捷键与拖拽手感就会在两个入口不一致。
export { default as SettingsOrchTabs } from './SettingsOrchTabs.vue'
