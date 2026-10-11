/**
 * earthquake 域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节（`composables/` `utils/` `styles/`）不外借：跨域引用只允许
 * `import ... from '@/features/earthquake'`，禁止深引用子路径
 * （门禁见 scripts/check-frontend-deps.mjs 与 eslint.config.js 的域边界规则）。
 *
 * 分层约定（本次迁移实测得出的边界）：
 * - **纯函数**（无 store/DOM 依赖）留在叶子层 `@/shared/earthquake/utils/`（如 `history-analytics.util`）；
 * - **依赖 store 的辅助**（如 `earthquake-layout.util`、`ha-coords.util`）留在 **composables 层**
 *   `@/composables/earthquake/` —— 因为它们被 `stores/` 与跨域 composable 反向依赖，
 *   放进 `features/` 会造成「下层 → features」的分层倒置；
 * - 本 barrel 只是把这些层里的域内件**再导出**给跨域调用方，不复制实现。
 *
 * 本次调用方已全部改指本 barrel 或对应层，故**无 compat 桩残留**。
 *
 * ## 薄 barrel 原则（本批已按实测收敛）
 *
 * 只导出**跨域真正从本 barrel 取用**的成员。迁移初期这里是「把上面几层的域内件整批再导出」，
 * 于是积了 12 条只有域内相对引用（或下层直连源模块）的转发 —— 它们不构成对外契约，
 * 却把域根撑成一张假接口表。判定口径就是 `bun run knip`（`export` 无人 import 即报），
 * 归位批次收尾必跑。
 */

// ── 域入口组件 ──
export { default as AlertOverlay } from './AlertOverlay.vue'
export { default as CencBulletinCard } from './CencBulletinCard.vue'
export { default as HistoryAnalytics } from './HistoryAnalytics.vue'
export { default as SetupWizard } from './SetupWizard.vue'
// `EewSafetyTips` / `EewSlideUnlock` 不在此导出：它们是 `AlertOverlay` 的内部子块，
// 只被它相对引用（`./EewSafetyTips.vue`），跨域无人从域根取。

// ── composables ──
export { useEarthquakeBootstrap, reopenEarthquakeWizard } from './composables/useEarthquakeBootstrap'
export { useEarthquakeStatusQuery } from './composables/useEarthquakeStatusQuery'
// `useEarthquakeHistoryAnalytics` / `useEarthquakeSetupWizard` / `useEarthquakeTts` 同理：
// 消费者是域内的 `HistoryAnalytics` / `SetupWizard` / `AlertOverlay`（相对路径），不外借。

// ── 纯函数 ──
// 下层消费者直接连源模块（`stores/earthquake.store.ts` → `@/composables/earthquake/earthquake-layout.util`、
// `features/earthquake/composables/useEarthquakeHistoryAnalytics.ts` → `@/shared/earthquake/utils/history-analytics.util`），
// 域根只留真的被跨域从 barrel 取的那几个。
export { earthquakeMagnitudeTone, formatEarthquakeMagnitude } from '@/composables/earthquake/earthquake-layout.util'
export { syncEarthquakeHomeCoordsFromHa } from '@/composables/earthquake/ha-coords.util'
export { buildFixedPageSlots, computeAnalyticsSummary, shortenPlace } from '@/shared/earthquake/utils/history-analytics.util'
