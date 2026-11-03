/**
 * 多设备合并（0.8.4 `extra-sources`）：一台舞台设备背后可以挂多个 HA 设备的实体。
 *
 * 数据形态（与后端 `config.extraDevices` / `device.extraControls` 一致）：
 * - `item.deviceId` + `item.extraDevices[{deviceId, deviceName}]`：参与合并的设备清单；
 * - `control.sourceDeviceId`：该控件来自哪个附加设备；空 = 主设备。
 *
 * 这里只放纯函数，编辑器和舞台共用，避免两侧各写一份「主设备优先、去重、清理」的逻辑。
 */

/** 设备项的主设备 id：`deviceId` 优先，其次从实体目录里按主实体反查。 */
export function primaryDeviceId(item: any, entityEntries: any = []): string {
  const matchedEntry = entityEntries?.get
    ? entityEntries.get(item.entityId)
    : entityEntries?.find((entityEntry: any) => entityEntry.entityId === item.entityId);
  return item.deviceId || matchedEntry?.deviceId || matchedEntry?.device_id || "";
}

/** 合并后的设备清单：主设备排第一，其余按配置顺序去重（同 id 只留一条）。 */
export function extraSourceDevices(item: any, entityEntries: any = []) {
  const primaryId = primaryDeviceId(item, entityEntries),
    seenDeviceIds = new Set<string>();
  return [
    ...(primaryId
      ? [{ deviceId: primaryId, deviceName: item.deviceName || "当前设备", primary: true }]
      : []),
    ...(item.extraDevices || []),
  ].filter(
    (deviceEntry: any) =>
      deviceEntry.deviceId && !seenDeviceIds.has(deviceEntry.deviceId) && seenDeviceIds.add(deviceEntry.deviceId),
  );
}

/** 某个控件的归属设备：显式 `sourceDeviceId` 优先，否则算主设备。 */
export function extraSourceId(control: any, item: any, entityEntries: any = []): string {
  return control.sourceDeviceId || primaryDeviceId(item, entityEntries);
}

/** 该控件是否来自主设备（主设备的控件不写 `sourceDeviceId`）。 */
export function isPrimaryExtra(control: any): boolean {
  return !control.sourceDeviceId;
}

/** 当前挂在主设备下的控件实体 id 集合。 */
export function primaryExtraIds(item: any): Set<any> {
  return new Set(
    (item.extraControls || []).filter(isPrimaryExtra).map((control: any) => control.entityId),
  );
}

/**
 * 把「主设备下」的控件整体转交给某个附加设备（或清空交回主设备）。
 *
 * @param sourceDeviceId 目标设备 id；空串表示交回主设备（去掉 `sourceDeviceId`）
 */
export function replacePrimaryExtras(item: any, sourceDeviceId = "") {
  ((item.extraControls = (item.extraControls || [])
    .filter((control: any) => control.sourceDeviceId)
    .map((control: any) => {
      if (control.sourceDeviceId !== sourceDeviceId) return control;
      const { sourceDeviceId: _handedOverSourceId, ...restControl } = control;
      return restControl;
    })),
    item.extraDevices &&
      (item.extraDevices = item.extraDevices.filter(
        (deviceEntry: any) => deviceEntry.deviceId !== sourceDeviceId,
      )));
}

/** 移除一个附加设备：连同它名下的控件一起清掉（主设备控件不受影响）。 */
export function removeExtraDevice(item: any, deviceId: string) {
  ((item.extraDevices = (item.extraDevices || []).filter(
    (deviceEntry: any) => deviceEntry.deviceId !== deviceId,
  )),
    (item.extraControls = (item.extraControls || []).filter(
      (control: any) => control.sourceDeviceId !== deviceId,
    )));
}

/** 该实体能否被选进「附加实体」：必须有 id、未停用、未离线/丢失。 */
export function selectableExtraEntity(entityEntry: any): boolean {
  return (
    !!entityEntry?.entityId &&
    !entityEntry.disabledBy &&
    !entityEntry.disabled_by &&
    entityEntry.enabled !== false &&
    !["disabled", "missing"].includes(entityEntry.status || entityEntry.syncStatus)
  );
}
