/**
 * energy（能源 / 水电燃气计量）域 —— `src/shared/` 共享域的第一块样板。
 *
 * ## 为什么是 `shared/` 而不是 `features/`
 *
 * 本域在依赖图上是**被下层反向依赖**的，实测入边：
 * `stores/defaults.ts`、`constants/dashboard-footer.ts`、`constants/account-binding-meta.ts`、
 * `constants/utility-meter-presets.ts`、`composables/ui/useDashboardFooter.ts`、`App.vue`。
 * 放进 `features/energy/` 会立刻造成 `stores → features`、`constants → features` 的分层倒置；
 * `src/shared/` 在 DAG 里位于 `stores` / `constants` / `composables` **下方**，所以不产生倒置。
 *
 * 判定方法（每批新域都先跑）：统计「桶内文件的真实入边」，
 * 若存在来自 `stores` / `constants` / `composables` / `utils` / `types` / 根入口的消费者
 * → 该域是共享域，落 `shared/`；只有 `views` / `layouts` / 同域入边 → 才是叶子域，落 `features/`。
 *
 * ## 两层访问规则（重要，勿破坏）
 *
 * - **上层消费者**（`views` / `features` / `components` / `composables`）→ 走本 barrel。
 * - **叶子 / 下层消费者**（`stores` / `constants` / `types` / `utils`）→ 走深路径
 *   `@/shared/energy/utils/*`、`@/shared/energy/constants/*`。
 *
 * 不能反过来：本 barrel 会带上 `composables/` 层（其中 `useUtilityMeter` 依赖 `vue`），
 * 让 `stores/defaults.ts` 之类去 import 它，会把 Vue 运行时拖进本该纯净的常量/状态模块。
 *
 * ## 域内分层
 *
 * - `constants/` —— 字段定义、属性映射（无副作用，叶子）
 * - `utils/` —— 纯函数：账号解析 / 同步、实体属性读取、来源归一化
 * - `composables/` —— 仅依赖 `vue` + `types` 的组合式逻辑（**不含 store**）
 *
 * 依赖 store 的能源逻辑**不在此处**，留在 `@/composables/energy/`（`useClientPowerReporter`、
 * `useCommInfoPopup`、`useUtilityMeterPopup`）—— `shared/` 不允许反向依赖 `stores/`。
 */

export { useRelativeDateLabel, parseDateParts } from './composables/useUtilityMeter'
export { useUtilityBalanceFields } from './composables/useUtilityBalanceFields'
export { readPopupAttr, parseJsonAttr, parseNumAttr } from './composables/utility-entity-helpers'
// `useRemainingDays` 不在此导出：它只被同域的 `useUtilityBalanceFields.ts` 用（域内深路径）。
// `parseGasDayItem` … `parseWaterYearItem`（9 个）同理且更明确 —— 唯一消费者是
// `constants/utility-meter-presets.ts`，属**叶子/下层**位置，按两层访问规则**必须**走深路径，
// 所以它们本来就不该出现在域根上。
export type { UtilityMeterParsedItem } from './composables/utility-meter-parse-helpers'
