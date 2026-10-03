/**
 * 实体反向引用类型定义
 *
 * 所属模块：state-store
 * 职责：自 @homeos/shared 再导出实体反向引用相关的类型与常量，保持既有 import 路径稳定，
 *       避免上游模块直接依赖 @homeos/shared 包路径。
 * 依赖：@homeos/shared（类型与标签常量的实际来源）
 */

/** 实体反向引用 — 自 @homeos/shared 再导出，保持既有 import 路径 */
export {
  type EntityReferenceKind,
  type EntityReferenceRole,
  type EntityReferenceItem,
  type EntityReferencesResponse,
  type EntityReferenceUnlinkRequest,
  type EntityReferenceUnlinkAction,
  type EntityReferenceUnlinkResult,
} from '@homeos/shared';
