/** `entity` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export { getEntityDomain, getEntityLeaf } from './domain';
export { attrValueEquals } from './attr-value-equals.util';
export { isControllableEntityDomain, isControllableEntityId } from './controllable';
export {
  type JwtUserLike,
  resolveEntityRestrictions,
  isEntityAllowed,
  filterEntitiesByAccess,
} from './access';
export {
  type EntityAreaAttrs,
  type EntityAreaInfo,
  resolveEntityArea,
  entityMatchesAreaFilter,
} from './area';
export {
  type EntityReferenceKind,
  type EntityReferenceRole,
  type EntityReferenceItem,
  type EntityReferencesResponse,
  type EntityReferenceUnlinkRequest,
  type EntityReferenceUnlinkAction,
  type EntityReferenceUnlinkResult,
  ENTITY_REFERENCE_KIND_LABELS,
  ENTITY_REFERENCE_ROLE_LABELS,
  ENTITY_REFERENCE_KIND_ORDER,
  LAYOUT_ENTITY_REFERENCE_KINDS,
  SYSTEM_CONFIG_ENTITY_REFERENCE_KINDS,
  UNLINKABLE_ENTITY_REFERENCE_KINDS,
} from './references';
export {
  DEFAULT_CRITICAL_DOMAINS,
  WS_PUSH_CRITICAL_DOMAINS,
  type EntityIdLike,
  sortEntitiesBySyncPriority,
} from './sync-priority';
