import { withoutModelRemarks } from '../../shared/model-remarks'

export { canonicalizeContent, sceneContentKey } from './scene-content-key'

const VIEW_SETTING_KEYS = [
    'planViewRotation',
    'cameraView',
    'cameraTopRotation',
    'cameraMode',
    'cameraFocalLength',
    'fixedCameraView',
    'livePreviewEnabled',
    'backgroundVisible',
    'snapEnabled',
    'snapEndpoints',
    'snapIntersections',
    'snapSegments',
    'snapOrthogonal',
    'snapAngles',
    'snapGrid',
    'snapTolerance',
    'previewPanelRatio',
    'detailsPanelWidthRatio',
  ],
  FLOOR_SHARED_KEYS = [
    'activeFloorId',
    'previewFloorMode',
    'combinedCameraSettings',
    'combinedFixedCameraView',
    'exportFloorGap',
    'exportPresets',
    'activeExportPresetSlot',
  ]
function omitKeys(source: any, excludedKeys: any) {
  const result = {
    ...source,
  }
  for (const key of excludedKeys) delete result[key]
  return result
}
/**
 * 结构化相等（键无序）：等价于「``JSON.stringify(sortDeep(x))`` 后比字符串」，
 * 但**不构建字符串**、不做中间对象克隆，且在第一个不同处提前返回。
 *
 * 直接遍历比较，不构建字符串、不做中间对象克隆，且在第一个不同处提前返回。
 *
 * 口径刻意**保守**（任何拿不准的情况都判为「不相等」），即最多多报一次变更，
 * 绝不会漏报：值为 ``undefined`` / 函数 / ``NaN`` 的字段，以及数组里的 ``undefined``
 * 元素都判为不同。
 */
function stableEquals(left: any, right: any): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
      if (!stableEquals(left[index], right[index])) return false
    }
    return true
  }
  const leftIsObject = !!left && typeof left === 'object',
    rightIsObject = !!right && typeof right === 'object'
  if (leftIsObject || rightIsObject) {
    if (!leftIsObject || !rightIsObject) return false
    // 非普通对象（Date / Map / 类实例）只看自有可枚举键
    const leftKeys = Object.keys(left).sort(),
      rightKeys = Object.keys(right).sort()
    if (leftKeys.length !== rightKeys.length) return false
    for (let index = 0; index < leftKeys.length; index += 1) {
      if (leftKeys[index] !== rightKeys[index]) return false
      if (!stableEquals(left[leftKeys[index]], right[rightKeys[index]])) return false
    }
    return true
  }
  return Number.isNaN(left) && Number.isNaN(right)
}
const floorComparisonShape = (floor: any) => ({
    ...withoutModelRemarks(floor.scene),
    settings: omitKeys(floor.scene?.settings, VIEW_SETTING_KEYS),
  }),
  floorIdentityShape = (sourceFloor: any) => omitKeys(sourceFloor, ['scene', 'name', 'aligned', 'alignmentPending'])

export function sceneUpdatePlan(previousScene: any, nextScene: any) {
  const previousFloorsById = new Map(previousScene.floors.map((listedFloor: any) => [listedFloor.id, listedFloor])),
    sharedSceneShape = (scene: any) => omitKeys(scene, [...FLOOR_SHARED_KEYS, 'floors', 'baseLighting']),
    isSceneChanged =
      !stableEquals(sharedSceneShape(previousScene), sharedSceneShape(nextScene)) ||
      !stableEquals(previousScene.floors.map(floorIdentityShape), nextScene.floors.map(floorIdentityShape)),
    changedFloorIds = nextScene.floors
      .filter(
        (candidateFloor: any) =>
          !previousFloorsById.has(candidateFloor.id) ||
          !stableEquals(
            floorComparisonShape(previousFloorsById.get(candidateFloor.id)),
            floorComparisonShape(candidateFloor),
          ),
      )
      .map((changedFloor: any) => changedFloor.id),
    isLightingChanged = !stableEquals(previousScene.baseLighting, nextScene.baseLighting)
  return {
    full: isSceneChanged,
    floors: changedFloorIds,
    lighting: isLightingChanged,
    visual: isSceneChanged || changedFloorIds.length > 0 || isLightingChanged,
  }
}

/**
 * 把「场景同步」失败响应翻译成可排障的文案。
 *
 * 调用方（render loop）原先只抛一句「户型同步暂时不可用」：HTTP 状态、服务端错误信封里的
 * `message` 与 `traceId` 全被丢掉，于是控制台里既看不出是 409（草稿没保存）、403（授权）
 * 还是 500（服务端异常），也无从在后端日志里按 traceId 定位那条堆栈 —— 每次排障只能靠猜。
 *
 * 只读响应体里**已有**的字段（后端统一错误信封），不做推断：读不出 JSON 时退回纯状态码
 * 文案，诊断代码本身不会因抛错而掩盖原始失败。
 *
 * 放在本模块而不是 render loop：那个文件已超 3000 行，file-size 与类型棘轮都不允许它
 * 继续变长；这里用 unknown + 显式收窄，不引入新的隐式类型。
 */
export async function sceneSyncFailureMessage(response: Response): Promise<string> {
  const statusText = `户型同步暂时不可用（HTTP ${response.status}）`
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    return statusText
  }
  const envelope = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const detail = typeof envelope.message === 'string' ? envelope.message.trim() : ''
  const traceId = typeof envelope.traceId === 'string' ? envelope.traceId.trim() : ''
  // 文案只取前 120 字：错误信封里的 message 可能是长句，控制台一行读得完才有人看。
  const parts = [detail.slice(0, 120), traceId && `traceId=${traceId}`].filter(Boolean)
  return parts.length ? `${statusText}：${parts.join(' · ')}` : statusText
}
