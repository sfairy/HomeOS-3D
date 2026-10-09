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
    sensor: [] as any[],
    binary_sensor: [] as any[],
  },
  capabilityAdapterByDomain = new Map();

function deviceCapabilityAdapter(lookupDomain: any) {
  return capabilityAdapterByDomain.get(String(lookupDomain || "")) || null;
}
const resolveDomain = (rawEntityId: any) => String(rawEntityId || "").split(".")[0];
export function entityCapabilities(entity: any, state: any = null) {
  const entityId = entity?.entityId || entity?.entity_id || "",
    entityDomain = entity?.domain || resolveDomain(entityId),
    liveState = state?.newState || state || {},
    stateAttributes = liveState.attributes || entity?.attributes || {},
    registeredAdapter = deviceCapabilityAdapter(entityDomain),
    capabilities = [
      ...(registeredAdapter?.capabilities || (defaultCapabilitiesByDomain as any)[entityDomain] || []),
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
export function deviceEntityCatalog(entities: any[] = [], deviceId = "", statesByEntityId = new Map()) {
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

