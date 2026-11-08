/**
 * 媒体设备（电视 / 投影仪）共用的身份表。
 *
 * 两者在配置、控制、弹窗、状态灯上的流程几乎一致，差异只有三点：归属分类名、
 * 模型类型名，以及**有没有屏幕图层**。投影仪没有屏幕，所以带 `screenImage` 的
 * 配置必须被拒绝（后端同样按 `screen` 判定），前端也不渲染屏幕与自定义图片入口。
 *
 * `height` 是模型默认高度（米），`markerHeight` 是顶部状态标签的锚点高度比例：
 * 投影仪只有 0.129 m 高，仍然沿用电视那套标签高度会让标签浮在半空。
 */

export interface MediaDeviceProfile {
  /** `devices` 下的分类名。 */
  collection: string
  /** `scene` / `environment` 里的模型类型名（与建模、清理、锚点表对齐）。 */
  modelType: string
  label: string
  icon: string
  /** 模型默认高度（米）。 */
  height: number
  /** 顶部标签锚点高度比例（相对模型高度）。 */
  markerHeight: number
  /** 是否有屏幕图层；为假时禁止 `screenImage`。 */
  screen: boolean
}

export const MEDIA_DEVICE_PROFILES: Readonly<Record<string, MediaDeviceProfile>> = Object.freeze({
  television: Object.freeze({
    collection: 'televisions',
    modelType: 'tv',
    label: '电视',
    icon: 'mdi:television',
    height: 0.92,
    markerHeight: 0.62,
    screen: true,
  }),
  projector: Object.freeze({
    collection: 'projectors',
    modelType: 'projector',
    label: '投影仪',
    icon: 'mdi:projector',
    height: 0.129,
    markerHeight: 0.5,
    screen: false,
  }),
})

/** 媒体设备的全部种类名。 */
export const MEDIA_DEVICE_KINDS: ReadonlyArray<string> = Object.freeze(Object.keys(MEDIA_DEVICE_PROFILES))

/**
 * 取 media profile。`hasOwn` 而不是直接下标：`constructor` / `toString` 这类原型键
 * 会返回真值，把「不是媒体设备」误判成媒体设备。
 */
export function mediaDeviceProfile(deviceKind: unknown): MediaDeviceProfile | null {
  return typeof deviceKind === 'string' && Object.hasOwn(MEDIA_DEVICE_PROFILES, deviceKind)
    ? MEDIA_DEVICE_PROFILES[deviceKind]
    : null
}

export function isMediaDeviceKind(deviceKind: unknown): boolean {
  return mediaDeviceProfile(deviceKind) !== null
}

/** 把 `devices` 下各类媒体绑定摊平成一串，并带上各自的 `deviceKind`。 */
export function mediaDeviceBindings(
  deviceCollections: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  return MEDIA_DEVICE_KINDS.flatMap((deviceKind) => {
    const collection = mediaDeviceProfile(deviceKind)!.collection
    const bindings = deviceCollections?.[collection]
    return Array.isArray(bindings)
      ? bindings
          .filter((mediaBinding): mediaBinding is Record<string, unknown> => typeof mediaBinding === 'object')
          .map((mediaBinding) => ({ ...mediaBinding, deviceKind }))
      : []
  })
}
