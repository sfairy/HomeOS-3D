/**
 * 扫地机器人（vacuum）的实体聚合目录。
 *
 * 舞台页清扫面板用这里产出的 profile 列表渲染「设备 + 地图 + 相关按键」，数据来自 /api/ha 的
 * 实体表与设备注册表，纯计算不发请求。对外导出 vacuumProfiles。后端实体字段有 `disabled_by` /
 * `disabledBy`、`device_id` / `deviceId` 两套写法，两边都要识别，否则 HA 集成升级后会出现
 * 「已禁用的扫地机仍显示」。
 */

/**
 * 把原始实体表聚合成扫地机器人 profile 列表。
 */
export function vacuumProfiles(entities = [], devices = []) {
  // 先剔除已禁用与已丢失的实体：它们在 HA 里已经离线，留在面板上只会产生无效操作。
  const enabledEntities = entities.filter(
    entity =>
      entity.disabledBy == null &&
      entity.disabled_by == null &&
      entity.enabled !== false &&
      !["missing", "disabled"].includes(entity.status)
  );
  const profilesByDeviceId = new Map();
  // 只认 HA 原生 vacuum 域；虚拟实体（virtual.*）不参与清扫面板。
  for (const vacuumEntity of enabledEntities.filter(rawEntity =>
    /^vacuum\.[a-z0-9_]+$/.test(rawEntity.entityId)
  )) {
    const entityDeviceId = vacuumEntity.deviceId || vacuumEntity.device_id || "";
    // 无 deviceId 的实体（旧版集成未上报）以 entityId 自成一组，避免多台机器被并成一条。
    const deviceKey = entityDeviceId || vacuumEntity.entityId;
    if (!profilesByDeviceId.has(deviceKey)) {
      // 用户自定义名称优先于注册表名与实体名：这是面板上唯一用户可辨认的标识。
      const deviceEntry = devices.find(
        registryDevice => (registryDevice.id || registryDevice.deviceId) === entityDeviceId
      );
      // 同属一个设备的其它实体：有 deviceId 时按设备聚合，没有时只能退回只认这一个实体。
      const deviceEntities = entityDeviceId
        ? enabledEntities.filter(
            deviceEntity => (deviceEntity.deviceId || deviceEntity.device_id) === entityDeviceId
          )
        : [vacuumEntity];
      // maps 收 camera / image 域（清扫地图），relatedEntityIds 收可操作的辅助实体；
      // 这两个域前缀是与 HA 集成约定死的分类口径。
      profilesByDeviceId.set(deviceKey, {
        deviceId: deviceKey,
        name:
          deviceEntry?.nameByUser ||
          deviceEntry?.name ||
          vacuumEntity.name ||
          vacuumEntity.entityId,
        entities: [],
        maps: deviceEntities.filter(mapEntity => /^(camera|image)\./.test(mapEntity.entityId)),
        relatedEntityIds: deviceEntities
          .filter(candidateEntity =>
            /^(sensor|binary_sensor|select|number|switch|button)\./.test(candidateEntity.entityId)
          )
          .map(relatedEntity => relatedEntity.entityId)
      });
    }
    // 同一设备允许多个 vacuum 实体（例如带多个清扫区域的机型），统一挂到同一 profile 下。
    profilesByDeviceId.get(deviceKey).entities.push(vacuumEntity);
  }
  // Map 保持插入顺序，即设备在实体表中的出现顺序，面板直接沿用，不再二次排序。
  return [...profilesByDeviceId.values()];
}
