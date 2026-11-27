/**
 * `domain/layout/store` 公开面。
 *
 * 这些模块此前被合并成 `store.ts`（2113 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './create-edit-history-state'
export * from './create-edit-mode-actions'
export * from './create-floor-widget-actions'
export * from './create-layout-core-state'
export * from './create-layout-dirty-tracking'
export * from './create-layout-draft-state'
export * from './create-layout-persistence'
export * from './create-layout-profile-actions'
export * from './create-layout-state'
export * from './defaults'
export * from './layout.store'
export * from './resolve-active-profile'
