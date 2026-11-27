/**
 * `kernel/utils/core` 公开面。
 *
 * 这些模块此前被合并成 `core.ts`（1223 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './api-boot-retry.util'
export * from './clone-plain.util'
export * from './count-json-leaf-diff.util'
export * from './crud-list.util'
export * from './error-message'
export * from './lazy-component'
export * from './local-storage.util'
export * from './logger'
export * from './misc.util'
export * from './poll-scheduler'
export * from './post-restore-lock'
export * from './pwa-update'
export * from './random-uuid.util'
