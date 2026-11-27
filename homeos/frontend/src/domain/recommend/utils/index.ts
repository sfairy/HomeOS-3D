/**
 * `domain/recommend/utils` 公开面。
 *
 * 这些模块此前被合并成 `utils.ts`（1070 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './alert-rules-recommend'
export * from './bindings-recommend'
export * from './entity-sync-recommend'
export * from './event-log-perf-recommend'
export * from './event-log-record-recommend'
export * from './favorites-recommend'
export * from './home-mode-recommend'
export * from './insight'
export * from './whole-home-off-recommend'
