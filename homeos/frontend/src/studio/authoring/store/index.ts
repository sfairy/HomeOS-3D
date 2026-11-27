/**
 * `studio/authoring/store` 公开面。
 *
 * 这些模块此前被合并成 `store.ts`（2050 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './document-diff'
export * from './document-store'
export * from './history-store'
export * from './save-store'
export * from './scene-sync-controller'
export * from './studio-draft-repository'
