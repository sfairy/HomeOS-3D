const defaultCapabilitiesByDomain = {
    switch: ["toggle"],
    input_boolean: ["toggle"],
    light: ["toggle"],
    select: ["select"],
    input_select: ["select"],
    number: ["number"],
    input_number: ["number"],
    button: ["press"],
    input_button: ["press"],
    climate: ["climate"],
    fan: ["fan"],
    cover: ["cover"],
    media_player: ["media_player"],
    sensor: [],
    binary_sensor: [],
  },
  capabilityAdapterByDomain = new Map();
export function registerDeviceCapabilityAdapter(capabilityDomain, capabilityAdapter) {
  return !capabilityDomain || !capabilityAdapter || typeof capabilityAdapter != "object"
    ? () => {}
    : (capabilityAdapterByDomain.set(String(capabilityDomain), capabilityAdapter),
      () => capabilityAdapterByDomain.delete(String(capabilityDomain)));
}
export function deviceCapabilityAdapter(lookupDomain) {
  return capabilityAdapterByDomain.get(String(lookupDomain || "")) || null;
}
const normalizedRoleSet = new Set(["control", "state", "status"]),
  resolveDomain = (rawEntityId) => String(rawEntityId || "").split(".")[0];
export function entityCapabilities(entity, state = null) {
  const entityId = entity?.entityId || entity?.entity_id || "",
    entityDomain = entity?.domain || resolveDomain(entityId),
    liveState = state?.newState || state || {},
    stateAttributes = liveState.attributes || entity?.attributes || {},
    registeredAdapter = deviceCapabilityAdapter(entityDomain),
    capabilities = [
      ...(registeredAdapter?.capabilities || defaultCapabilitiesByDomain[entityDomain] || []),
    ],
    supportedFeatures = stateAttributes.supported_features;
  return {
    entityId: entityId,
    domain: entityDomain,
    deviceId: entity?.deviceId || entity?.device_id || "",
    disabledBy: entity?.disabledBy || entity?.disabled_by || null,
    enabled: entity?.enabled !== false,
    status: entity?.status || entity?.syncStatus || "",
    name: entity?.name || entity?.friendlyName || stateAttributes.friendly_name || entityId,
    available:
      liveState.available !== false &&
      !["unknown", "unavailable"].includes(String(liveState.state || "").toLowerCase()),
    capabilities: capabilities,
    writable: capabilities.length > 0,
    readable: true,
    attributes: stateAttributes,
    supportedFeatures: Number.isInteger(supportedFeatures) ? supportedFeatures : 0,
    adapter: registeredAdapter?.name || null,
  };
}
export function deviceEntityCatalog(entities = [], deviceId = "", statesByEntityId = new Map()) {
  return deviceId
    ? entities
        .filter(
          (candidateEntity) => (candidateEntity.deviceId || candidateEntity.device_id) === deviceId,
        )
        .map((matchedEntity) =>
          entityCapabilities(
            matchedEntity,
            statesByEntityId instanceof Map
              ? statesByEntityId.get(matchedEntity.entityId)
              : (statesByEntityId || {})[matchedEntity.entityId],
          ),
        )
        .filter((capability) => capability.entityId)
        .sort(
          (leftCapability, rightCapability) =>
            leftCapability.domain.localeCompare(rightCapability.domain) ||
            leftCapability.name.localeCompare(rightCapability.name) ||
            leftCapability.entityId.localeCompare(rightCapability.entityId),
        )
    : [];
}
export function normalizeDeviceEntitySelection(selectionEntries = [], catalogEntries = []) {
  const catalogEntriesByEntityId = new Map(
      catalogEntries.map((catalogEntry) => [catalogEntry.entityId, catalogEntry]),
    ),
    selectionKeySet = new Set();
  return selectionEntries
    .filter((selectionEntry) => {
      const selectionKey = selectionEntry?.entityId + ":" + selectionEntry?.role;
      return !normalizedRoleSet.has(selectionEntry?.role) ||
        selectionKeySet.has(selectionKey) ||
        !catalogEntriesByEntityId.has(selectionEntry.entityId)
        ? false
        : (selectionKeySet.add(selectionKey), true);
    })
    .map((selectedEntry) => {
      const matchedCatalogEntry = catalogEntriesByEntityId.get(selectedEntry.entityId),
        resolvedRole =
          selectedEntry.role === "control" && !matchedCatalogEntry.writable
            ? "state"
            : selectedEntry.role;
      return {
        entityId: matchedCatalogEntry.entityId,
        role: resolvedRole,
        capabilities: [...matchedCatalogEntry.capabilities],
      };
    });
}
export function deviceEntityRoleLabel(role) {
  return (
    {
      control: "弹窗控制",
      state: "只读状态",
      status: "状态判断",
    }[role] || "不显示"
  );
}
