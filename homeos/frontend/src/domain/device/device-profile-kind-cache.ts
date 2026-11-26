/**
 * 设备画像 kind 的只读投影缓存（`entityId → kind`）。
 *
 * 为什么需要它：3D 面板渲染是**同步**的（`resolveClimateDeviceType()` 在每帧 / 每次
 * 交互里被调用），而 kind 的权威来源是后端 `/api/v1/device-profiles`（人工确认优先，
 * 其次规则分类）。所以这里只做一件事：把后端结论投影成一张同步可读的 Map。
 *
 * 位置为什么在 `shared/`：它是**叶子层**——不 import 任何模块（包括 API 客户端与 Vue），
 * 因此谁都能读（studio 面板、舞台逐文件产物、后续的设置页预览），而不会把 axios 或
 * 组件层拖进 `vite.runtime.config.ts` 的独立产物。
 *
 * 写入只有 `replace` 一个入口：谁拉数据谁负责投影，本模块不发起请求。
 * 读不到时返回空串，由调用方决定兜底；这里不做任何默认值推断。
 */

const kindByEntityId = new Map<string, string>()

/** 整体替换投影（后端返回一页画像时调用，不要逐条 merge 造成残留）。 */
export function replaceDeviceProfileKinds(entries: ReadonlyArray<{ entityId?: unknown; kind?: unknown }>): void {
  kindByEntityId.clear()
  for (const entry of entries) {
    const entityId = typeof entry?.entityId === 'string' ? entry.entityId.trim() : ''
    const kind = typeof entry?.kind === 'string' ? entry.kind.trim() : ''
    if (entityId && kind) kindByEntityId.set(entityId, kind)
  }
}

/** 读取某实体的 kind；未投影 / 空实体 id 返回空串。 */
export function deviceProfileKind(entityId: unknown): string {
  return typeof entityId === 'string' && entityId ? (kindByEntityId.get(entityId) ?? '') : ''
}

/** 登出 / 换账号时清空，避免把上一个会话的分类结论带给下一个用户。 */
export function resetDeviceProfileKinds(): void {
  kindByEntityId.clear()
}

/** 已投影条数（自检与诊断用）。 */
export function deviceProfileKindCount(): number {
  return kindByEntityId.size
}
