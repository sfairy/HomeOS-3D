/**
 * home-mode（家居模式）域 · 共享层 —— `src/shared/home-mode/utils/`。
 *
 * ## 为什么在 `shared/` 而不在 `features/home-mode/`
 *
 * 这两个模块是**纯函数**（无 store、无 Vue 运行时依赖），被 domain 内外的多类消费者引用。
 * 放进 `features/home-mode/` 会让 `stores/`、`constants/` 等**下层**消费者反向依赖
 * `features/`，构成分层倒置；故按「纯逻辑下沉 `shared/`、Vue/状态留在域内」拆分。
 *
 * | 成员 | 消费者 |
 * |------|-----------|
 * | `mode-icon` | `features/home-mode/components/HomeModeSwitcherMenu.vue`（域内） |
 * | `mode-preset-meta` | `features/home-mode/editor/HomeModePresetCards.vue`（域内） |
 *
 * ## 命名：为什么是 `home-mode` 而不是 `home`
 *
 * 原先这两个文件在 `utils/home/`，同层的 `composables/home/` 里却混着**无关**的
 * `batch-actions.ts`（全屋批量关灯/窗帘/空调，属「全屋操作」而非「模式」）——
 * 一个桶名 `home` 承载两种含义，正是本项目要消灭的同名双义。
 *
 * 本域统一用仓库既有词汇 `home-mode`（`services/api/home-modes.ts`、
 * `features/home-mode/` 同此命名）。
 *
 * ## 已归位（见 plan P2-weather-mode / P2-home-mode）
 *
 * - 模式数据与切换、编辑器契约 → `features/home-mode/composables/`
 * - 切换器 UI → `features/home-mode/components/`；编辑器 11 组件 → `features/home-mode/editor/`
 * - 设置页嵌入适配层（非本域）→ `features/settings/automate/styles/home-mode-embed.css`
 * - `composables/home/batch-actions.ts` 属「全屋操作」域，与本域无关，仍留在 `@/composables/home/`
 */

export { isHomeModeEmojiIcon, resolveHomeModeIcon } from './utils/mode-icon.util'
export { collectPresetActionTags } from './utils/mode-preset-meta.util'
