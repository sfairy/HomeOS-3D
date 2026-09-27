/**
 * 通用设备实体的「目录」折算层（编辑器侧）。
 */

type EntityLike = {
  entityId?: string;
  entity_id?: string;
  domain?: string;
  deviceId?: string;
  device_id?: string;
  disabledBy?: unknown;
  disabled_by?: unknown;
  enabled?: boolean;
  status?: string;
  syncStatus?: string;
  name?: string;
  friendlyName?: string;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
};

type StateLike = {
  newState?: StateLike;
  attributes?: Record<string, unknown>;
  available?: boolean;
  state?: unknown;
  [key: string]: unknown;
};

// 从实体 ID 的前缀解析所属域（HA 的 entity_id 形如 "<domain>.<object_id>"）。
const resolveDomain = (entityId: unknown) => String(entityId || "").split(".")[0] || "";

/**
 * 把一个实体折算成统一的目录项。
 */
export function entityCapabilities(entity: EntityLike | null | undefined, state: StateLike | null = null) {
  const entityId = entity?.entityId || entity?.entity_id || "";
  const domain = entity?.domain || resolveDomain(entityId);
  // 状态可能被包在 { newState } 里；拆不出属性时回落到实体自身的 attributes。
  const liveState = (state?.newState || state || {}) as StateLike;
  const attributes = (liveState.attributes || entity?.attributes || {}) as Record<string, unknown>;
  return {
    entityId,
    domain,
    deviceId: entity?.deviceId || entity?.device_id || "",
    disabledBy: entity?.disabledBy || entity?.disabled_by || null,
    enabled: entity?.enabled !== false,
    status: entity?.status || entity?.syncStatus || "",
    name: entity?.name || entity?.friendlyName || String(attributes.friendly_name || entityId),
    // 实时状态明确 available:false，或状态字面量是 unknown / unavailable，都视为不可用。
    available:
      liveState.available !== false &&
      !["unknown", "unavailable"].includes(String(liveState.state || "").toLowerCase()),
    // 原始属性表照原样带上：状态判定的口径（device-status.js）直接读它。
    attributes
  };
}

/**
 * 列出归属某台设备的全部实体，按域、名称、实体 ID 三级排序。
 */
export function deviceEntityCatalog(
  entities: EntityLike[] = [],
  deviceId = "",
  states: Map<string, StateLike> | Record<string, StateLike> = new Map(),
) {
  if (!deviceId) {
    return [];
  }
  return entities
    .filter(entity => (entity.deviceId || entity.device_id) === deviceId)
    .map(entity =>
      entityCapabilities(
        entity,
        states instanceof Map
          ? (states.get(String(entity.entityId || "")) ?? null)
          : (states || {})[String(entity.entityId || "")] || null
      )
    )
    // 丢掉没能解析出实体 ID 的残项，它们在场景里无法绑定任何状态。
    .filter(capability => capability.entityId)
    .sort(
      (a, b) =>
        a.domain.localeCompare(b.domain) ||
        a.name.localeCompare(b.name) ||
        a.entityId.localeCompare(b.entityId)
    );
}
