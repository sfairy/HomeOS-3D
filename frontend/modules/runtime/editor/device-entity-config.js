/**
 * 通用设备实体的「目录」折算层（编辑器侧）。
 */

// 从实体 ID 的前缀解析所属域（HA 的 entity_id 形如 "<domain>.<object_id>"）。
const resolveDomain = entityId => String(entityId || "").split(".")[0];

/**
 * 把一个实体折算成统一的目录项。
 * @param {object} entity 实体注册项（可能来自 HA，也可能来自面板草稿）。
 * @param {object|Map} [state] 实时状态；兼容 { newState } 包装与裸状态对象两种形态。
 */
export function entityCapabilities(entity, state = null) {
  const entityId = entity?.entityId || entity?.entity_id || "";
  const domain = entity?.domain || resolveDomain(entityId);
  // 状态可能被包在 { newState } 里；拆不出属性时回落到实体自身的 attributes。
  const liveState = state?.newState || state || {};
  const attributes = liveState.attributes || entity?.attributes || {};
  return {
    entityId,
    domain,
    deviceId: entity?.deviceId || entity?.device_id || "",
    disabledBy: entity?.disabledBy || entity?.disabled_by || null,
    enabled: entity?.enabled !== false,
    status: entity?.status || entity?.syncStatus || "",
    name: entity?.name || entity?.friendlyName || attributes.friendly_name || entityId,
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
 * @param {Array} entities 实体注册项列表。
 * @param {string} deviceId 目标设备 ID。
 * @param {Map|object} [states] 实体 ID → 实时状态；兼容 Map 与普通对象两种索引方式。
 */
export function deviceEntityCatalog(entities = [], deviceId = "", states = new Map()) {
  if (!deviceId) {
    return [];
  }
  return entities
    .filter(entity => (entity.deviceId || entity.device_id) === deviceId)
    .map(entity =>
      entityCapabilities(
        entity,
        states instanceof Map ? states.get(entity.entityId) : (states || {})[entity.entityId]
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
