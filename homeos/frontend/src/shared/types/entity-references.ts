/**
 * 实体反向引用（前端类型，与后端 EntityReferencesResponse 对齐）。
 *
 * 本文件仅做再导出，实际类型定义与常量位于 @homeos/shared，避免前后端类型不一致。
 * 包含：引用种类 / 角色 / 条目 / 响应 / 解绑请求与结果，以及各模块使用的引用种类集合。
 */
export {
  type EntityReferenceKind,
  type EntityReferenceItem,
  type EntityReferencesResponse,
  type EntityReferenceUnlinkRequest,
  type EntityReferenceUnlinkResult,
  ENTITY_REFERENCE_KIND_LABELS,
  ENTITY_REFERENCE_ROLE_LABELS,
  ENTITY_REFERENCE_KIND_ORDER,
  LAYOUT_ENTITY_REFERENCE_KINDS,
  SYSTEM_CONFIG_ENTITY_REFERENCE_KINDS,
  UNLINKABLE_ENTITY_REFERENCE_KINDS,
} from '@homeos/shared'