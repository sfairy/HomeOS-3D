/**
 * home-mode（家居模式）域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节（`composables/` `components/` `editor/`）不外借：跨域引用只允许
 * `import ... from '@/features/home-mode'`（门禁见 scripts/check-frontend-deps.mjs
 * 与 eslint.config.js 的域边界规则）。
 *
 * ## 本域为什么成立（而不是并回 settings）
 *
 * 「模式」是横跨多处的一等概念，不是设置页的内部实现：
 *
 * | 使用场景 | 入口 | 位置 |
 * |----------|------|------|
 * | 壳层切换器 | `HomeModeSwitcher` | `layouts/MainLayout.vue` |
 * | 模式切换数据 | `useHomeModes` / `useHomeModeSwitcher` | 本域 |
 * | 触发日志分析 | `useModeLogsAnalytics` | `views/ModeTriggerLogsView.vue` |
 * | 模式编辑器（设置页内嵌） | `HomeModePanel` | `features/settings/automate/SettingsHomeModePanel.vue` |
 * | 安防区域编辑器复用展开逻辑 | `useHomeModeItemExpansion` | `features/security/composables/` |
 *
 * ## 跨域方向（**单向**，勿反向）
 *
 * `features/settings` 与 `features/security` → `@/features/home-mode` —— 这是允许的方向。
 * 反向（本域 → settings/security）**必须避免**：域不得依赖域。
 *
 * 本域的编辑器要被设置页宿主，由此产生两处**真实共享**（已按 DAG 归位，均不在 settings 域内）：
 *
 * | 共享件 | 归宿 | 原因 |
 * |--------|------|------|
 * | `SettingsOrchTabs` 编排工具条 | `@/components/common/` | API 通用（tabs/modelValue/toolbar/sortable/plain）、无 store；`HomeModeTabsToolbar` 用它 |
 * | 待存登记 + 保存编排内核 | `@/composables/settings-kernel/` | 绑 `useLayoutStore.saveConfig()`，进不了 `shared/`；settings 与本域**平等**共用 |
 *
 * 留在 settings、由宿主 `SettingsHomeModePanel.vue` 承担的：`SettingsPageShell`、
 * `SettingsPendingSaveAction`、页内注入的嵌入适配层样式。
 *
 * ## 薄 barrel 原则
 *
 * 只导出被跨域真正用到的成员。纯域内使用（如 `useHomeModeSwitcher` 的
 * `memberInitial` / `memberTone`，只被域内 `HomeModePresenceBadge` 用）不在此列出。
 * 本批按 `bun run knip` 实测又收掉了 5 条：`useHomeModes` / `useHomeModeSwitcher` /
 * `useHomeModeEditor` 与 `ActionTemplate` / `ModeActionDraft` 类型，全部只被域内相对引用。
 * 上面的「使用场景」表描述的是**谁在用这个概念**，不等于「域根必须导出它」——
 * 归位批次收尾请以 knip 为准，别照抄表格。
 *
 * 依赖 store 与本域耦合的 `composables/home/batch-actions.ts`（**全屋批量操作**，
 * 与「模式」无关）不在本域，仍在 `@/composables/home/`。
 */

// ── 壳层切换器 ──
export { default as HomeModeSwitcher } from './components/HomeModeSwitcher.vue'

// ── 编辑器（设置页内嵌宿主用）──
// `editor/` 子目录自持：11 个编辑分区组件 + 4 个样式表 + 状态内核
// `composables/home-mode-panel.internals.ts`。跨域只借出这个入口组件。
export { default as HomeModePanel } from './editor/HomeModePanelSection.vue'

// ── 模式数据与切换 ──
// `useHomeModes` / `useHomeModeSwitcher` **不在此导出**：消费者全在域内
// （`HomeModeSwitcher.vue`、`HomeModePresenceBadge.vue`、`home-mode-panel.internals.ts`）。
// 跨域只用壳层入口组件 `HomeModeSwitcher`。

// ── 触发日志分析（views 用）──
export {
  EMPTY_MODE_LOG_ANALYTICS,
  buildModeResultBarOption,
  buildModeSourcePieOption,
  buildModeTimelineOption,
} from './composables/useModeLogsAnalytics'
export type { ModeLogAnalytics } from './composables/useModeLogsAnalytics'

// ── 编辑器契约 ──
// 跨域：features/settings 的自动化面板、features/security 的区域编辑器都复用这些。
// 名字里的 `.internals` 是历史命名（原属 settings 域内部），迁移后它们已是**跨域契约**；
// 待后续批次更名去掉 internals 后缀，届时同步更新本 barrel。
// `useHomeModeEditor` 与类型 `ActionTemplate` / `ModeActionDraft` **不在此导出**：
// 它们只被域内 `home-mode-panel.internals.ts` / `editor.internals.ts` 相对引用，
// 不构成跨域契约（跨域用的是下面这几个 bridge / section / item 组合式）。
export { useHomeModePanelBridge, setHomeModePanelBridge } from './composables/editor.internals'
export { useHomeModeActionsSection } from './composables/editor.internals'
export { useHomeModeItemExpansion, useHomeModeItemFocus } from './composables/editor.internals'

// ── 场景选项（security modes 复用）──
export { useHomeosSceneOptions } from './composables/useHomeosSceneOptions'
