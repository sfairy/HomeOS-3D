export function vacuumProfiles(entities = [], devices = []) {
  const activeEntities = entities.filter(
      (entity) =>
        entity.disabledBy == null &&
        entity.disabled_by == null &&
        entity.enabled !== false &&
        !["missing", "disabled"].includes(entity.status),
    ),
    profilesById = new Map();
  for (const vacuumEntity of activeEntities.filter((candidateEntity) =>
    /^vacuum\.[a-z0-9_]+$/.test(candidateEntity.entityId),
  )) {
    const deviceId = vacuumEntity.deviceId || vacuumEntity.device_id || "",
      profileId = deviceId || vacuumEntity.entityId;
    if (!profilesById.has(profileId)) {
      const deviceRecord = devices.find((device) => (device.id || device.deviceId) === deviceId),
        relatedEntities = deviceId
          ? activeEntities.filter(
              (siblingEntity) => (siblingEntity.deviceId || siblingEntity.device_id) === deviceId,
            )
          : [vacuumEntity];
      profilesById.set(profileId, {
        deviceId: profileId,
        name:
          deviceRecord?.nameByUser ||
          deviceRecord?.name ||
          vacuumEntity.name ||
          vacuumEntity.entityId,
        entities: [],
        maps: relatedEntities.filter((cameraEntity) =>
          /^(camera|image)\./.test(cameraEntity.entityId),
        ),
        relatedEntityIds: relatedEntities
          .filter((sensorEntity) =>
            /^(sensor|binary_sensor|select|number|switch|button)\./.test(sensorEntity.entityId),
          )
          .map((relatedEntity) => relatedEntity.entityId),
      });
    }
    profilesById.get(profileId).entities.push(vacuumEntity);
  }
  return [...profilesById.values()];
}
