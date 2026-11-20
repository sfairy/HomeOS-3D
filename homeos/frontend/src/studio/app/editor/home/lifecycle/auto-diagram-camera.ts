/**
 * 自动导图预览的「构图」快照（0.8.7）。
 *
 * 0.8.7 之前，预览里拖出来的视角只活在 iframe 的运行时里：撤销、切楼层或重新打开，
 * 画面就回到默认机位。0.8.7 把构图作为一个**普通组件属性** `cameraSnapshot` 随文档保存，
 * 于是撤销栈、草稿持久化、重开编辑器都自动带上它。
 *
 * 这里只做两件事：
 * 1. `normalizeAutoDiagramCamera`：把 iframe 回传的任意 JSON 收敛成稳定形状，
 *    非法值一律丢弃（返回 `null`），避免脏数据进文档后再也回不去；
 * 2. `autoDiagramCameraSignature`：给「楼层 + 构图」算签名，用来跳过无意义的重复写入。
 *
 * 坐标用 `{x,y,z}` 而不是数组：恢复时直接喂给 `THREE.Vector3.copy`，
 * 少一层转换，也避免 three 内部对数组语义（`copy` 不认数组）的隐式约定。
 */

/** 一份可持久化的构图：机位 + 目标点 + 投影参数。 */
export interface AutoDiagramCameraSnapshot {
  mode: 'perspective' | 'orthographic'
  cameraView: 'top' | 'free'
  topRotation: number
  focalLength: number
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  up: { x: number; y: number; z: number }
  zoom: number
  near: number
  far: number
  viewportAspect: number
  fov: number
}

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null
}

function finite(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

/** 三分量向量：接受 `{x,y,z}` 或 `[x,y,z]`，两者都常见（序列化方式不同）。 */
function vector3(value: unknown): { x: number; y: number; z: number } | null {
  if (Array.isArray(value)) {
    if (value.length < 3) return null
    const [x, y, z] = value.map((entry) => Number(entry))
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null
  }
  const bag = record(value)
  if (!bag) return null
  const x = Number(bag.x)
  const y = Number(bag.y)
  const z = Number(bag.z)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return { x, y, z }
}

/** 把任意输入收敛成一份合法构图；缺关键字段（机位/目标）时返回 `null`。 */
export function normalizeAutoDiagramCamera(raw: unknown): AutoDiagramCameraSnapshot | null {
  const bag = record(raw)
  if (!bag) return null
  const position = vector3(bag.position)
  const target = vector3(bag.target)
  // 机位与目标点是还原视角的最小充分信息；缺任一项就不值得保存。
  if (!position || !target) return null
  const up = vector3(bag.up)
  const topRotation = (((Math.round(finite(bag.topRotation, 0) / 90) * 90) % 360) + 360) % 360
  return {
    mode: bag.mode === 'perspective' ? 'perspective' : 'orthographic',
    cameraView: bag.cameraView === 'top' ? 'top' : 'free',
    topRotation,
    focalLength: Math.min(120, Math.max(18, finite(bag.focalLength, 50))),
    position,
    target,
    up: up ?? { x: 0, y: 1, z: 0 },
    // zoom 为 0 会让正交相机直接不可见，兜底到 1。
    zoom: Math.abs(finite(bag.zoom, 1)) < 1e-6 ? 1 : finite(bag.zoom, 1),
    near: Math.max(1e-3, finite(bag.near, 0.1)),
    far: Math.max(1, finite(bag.far, 100)),
    viewportAspect: Math.max(0.05, finite(bag.viewportAspect, 1)),
    fov: Math.min(179, Math.max(1, finite(bag.fov, 36))),
  }
}

/** 「楼层 + 构图」签名：同签名代表无需再次写文档。 */
export function autoDiagramCameraSignature(floorSelection: string, camera: AutoDiagramCameraSnapshot): string {
  return JSON.stringify([floorSelection, camera])
}

/** 处理一条构图回传消息所需的上下文（显式传入，模块函数不读外部闭包）。 */
export interface AutoDiagramCameraStateContext {
  componentId: string
  source: MessageEventSource | null
  camera: unknown
  signatureOf: (camera: AutoDiagramCameraSnapshot) => string
  document: () => unknown
  findComponent: (document: unknown, componentId: string) => { component?: { type?: string } } | null | undefined
  mutate: (mutator: (draft: unknown) => void) => unknown
}

/** iframe 自己发出的消息才受理：同源其它窗口也能 postMessage，不校验 source 等于伪造。 */
function isAutoDiagramPreviewSource(componentId: string, source: MessageEventSource | null): boolean {
  if (!componentId || !source) return false
  const frame = document.querySelector<HTMLIFrameElement>(
    '.hb-component[data-component-id="' + CSS.escape(componentId) + '"] .hb-floorplan-auto-diagram-preview',
  )
  return !!frame && frame.contentWindow === source
}

/**
 * 把构图写进 `component.properties.cameraSnapshot`。
 *
 * 走 `mutateDocument` 而不是直接改对象，是为了同时拿到两件事：
 *  - 进撤销栈：撤销能回到上一个视角（0.8.7 变更清单的原话）；
 *  - 触发草稿持久化：重开编辑器时 `ready` 消息会把 snapshot 再送回去。
 * 签名与已保存值一致时直接跳过，避免一次拖动塞进几十条历史。
 */
export function applyAutoDiagramCameraState(
  context: AutoDiagramCameraStateContext,
  savedSignatures: Map<string, string>,
): void {
  if (!isAutoDiagramPreviewSource(context.componentId, context.source)) return
  const component = context.findComponent(context.document(), context.componentId)?.component
  if (component?.type !== 'floorplan-auto-diagram') return
  const snapshot = normalizeAutoDiagramCamera(context.camera)
  if (!snapshot) return
  const signature = context.signatureOf(snapshot)
  if (savedSignatures.get(context.componentId) === signature) return
  savedSignatures.set(context.componentId, signature)
  context.mutate((draft) => {
    const draftComponent = context.findComponent(draft, context.componentId)?.component as
      | { type?: string; properties?: Record<string, unknown> }
      | undefined
    if (draftComponent?.type !== 'floorplan-auto-diagram') return
    draftComponent.properties = { ...(draftComponent.properties || {}), cameraSnapshot: snapshot }
  })
}
