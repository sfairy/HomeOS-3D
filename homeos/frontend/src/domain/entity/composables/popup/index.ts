/**
 * `domain/entity/composables/popup` 公开面。
 *
 * 这些模块此前被合并成 `popup.ts`（1552 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './use-climate-control-popup'
export * from './use-cover-control-popup'
export * from './use-entity-popup-anchor'
export * from './use-entity-popup-base'
export * from './use-light-control-popup'
export * from './use-media-player-controls'
export * from './use-media-player-modal-display'
