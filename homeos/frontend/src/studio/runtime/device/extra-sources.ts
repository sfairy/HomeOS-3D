/**
 * 多设备合并（0.8.4 `extra-sources`）：一台舞台设备背后可以挂多个 HA 设备的实体。
 *
 * 数据形态（与后端 `config.extraDevices` / `device.extraControls` 一致）：
 * - `item.deviceId` + `item.extraDevices[{deviceId, deviceName}]`：参与合并的设备清单；
 * - `control.sourceDeviceId`：该控件来自哪个附加设备；空 = 主设备。
 *
 * 这里只放纯函数，编辑器和舞台共用，避免两侧各写一份「主设备优先、去重、清理」的逻辑。
 */

/** 移除一个附加设备：连同它名下的控件一起清掉（主设备控件不受影响）。 */
export function removeExtraDevice(item: any, deviceId: string) {
  ;(item.extraDevices = (item.extraDevices || []).filter((deviceEntry: any) => deviceEntry.deviceId !== deviceId)),
    (item.extraControls = (item.extraControls || []).filter((control: any) => control.sourceDeviceId !== deviceId))
}

/** 该实体能否被选进「附加实体」：必须有 id、未停用、未离线/丢失。 */
export function selectableExtraEntity(entityEntry: any): boolean {
  return (
    !!entityEntry?.entityId &&
    !entityEntry.disabledBy &&
    !entityEntry.disabled_by &&
    entityEntry.enabled !== false &&
    !['disabled', 'missing'].includes(entityEntry.status || entityEntry.syncStatus)
  )
}
