/**
 * presence（在家人 / 人员域）域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节不外借：跨域引用只允许 `import ... from '@/features/presence'`
 * （跨域只走域根 barrel，属项目约定）。
 *
 * ## 数据层已不在本域
 *
 * 在家判定、人员名单规范化、成员展示文案这些**纯数据**设施已下沉到
 * `@/domain/presence/`（`load-presence-home` / `use-presence-home` / `display` /
 * `entity-filter` / `person`）—— 它们只依赖 kernel 与 domain，被 home-mode、security、
 * weather、settings 平等共用，因此不属于某个 feature。
 *
 * 留在本域的只有**交互件**：下面的名单编辑器。它也依赖上面那批域设施，
 * 这正是 feature 依赖 domain 的正常方向。
 */

// ── 人员名单编辑器（features/settings 的自动化-在场实体分区复用）──
export { default as PresencePersonListInput } from './PresencePersonListInput.vue'
