/**
 * 安防组件草稿的纯数据整形。
 *
 * 旧草稿 / 只建了一半的组件可能缺 `security` 分区里任意一个集合字段，这里统一补齐空数组，
 * 让后面的读写都不用再判空。抽成独立模块只是为了让主流程（`openSecurityEditor`）的圈复杂度
 * 不被这层无关的判空逻辑顶到阈值。
 */
type SecurityCollections = {
  locks?: unknown[]
  cameras?: unknown[]
  presenceSensors?: unknown[]
  alarms?: unknown[]
  windows?: unknown[]
}

export function normalizeSecurityDraftProperties<T extends { security?: SecurityCollections }>(
  properties: T | null | undefined,
): T {
  const draftProperties = structuredClone((properties || {}) as T)
  draftProperties.security = {
    ...draftProperties.security,
    locks: draftProperties.security?.locks || [],
    cameras: draftProperties.security?.cameras || [],
    presenceSensors: draftProperties.security?.presenceSensors || [],
    alarms: draftProperties.security?.alarms || [],
    windows: draftProperties.security?.windows || [],
  } as T['security']
  return draftProperties
}
