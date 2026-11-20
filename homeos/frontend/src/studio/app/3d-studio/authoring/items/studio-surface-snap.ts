/**
 * 台面吸附：把物件落到它能站上去的那个支撑面上（0.8.7 `studio-surface-snap.js`）。
 *
 * 两张类型表**逐项对齐 0.8.7**（从 `studio-surface-snap.js` 的 `q` / `z` 两个 Set 反解）：
 * - `SNAPPABLE_TYPES`（65 项）决定「谁能贴到台面上」，拖动松手与属性面板的「贴合台面」
 *   共用这一张；早期只抄了 13 项（只有 `decor-*` 与小电器），于是台灯、音箱、空气炸锅、
 *   植物、投影、游戏机…全都贴不上，用户看到的是一颗没反应的按钮。
 * - `SUPPORT_TYPES`（17 项）决定「谁算支撑面」；早期漏了 `side-table` 与 `kitchen-island`。
 *
 * 智能屏是唯一不在表里也能贴的：桌面款必须能摆到柜面 / 餐边柜上，壁挂款则不该落台
 * （0.8.7 的条件是 `type === 'smart-display' && smartDisplayMount !== 'wall'`）。
 */
const SNAPPABLE_TYPES = [
  'soundbar',
  'coffee-machine',
  'pressure-cooker',
  'projector',
  'turntable',
  'air-fryer',
  'power-blender',
  'juicer',
  'bread-maker',
  'stand-mixer',
  'toaster',
  'electric-kettle',
  'health-kettle',
  'induction-hob',
  'ceramic-hob',
  'food-steamer',
  'multi-cooker',
  'coffee-grinder',
  'dish-rack',
  'knife-block',
  'cutting-board-rack',
  'spice-set',
  'cookware-set',
  'mug-tree',
  'capsule-rack',
  'fruit-basket',
  'bed-tray',
  'jewelry-box',
  'toiletry-set',
  'dual-monitors',
  'scanner',
  'drawing-tablet',
  'pillow-set',
  'sofa-throw',
  'decorative-plate',
  'dried-flowers',
  'candlestick',
  'decorative-lantern',
  'trophy',
  'figurine-set',
  'plant-pothos',
  'flower-orchid',
  'flower-peace-lily',
  'flower-anthurium',
  'flower-hydrangea',
  'switch-console',
  'xbox-series-x',
  'ps5',
  'aroma-diffuser',
  'table-lamp',
  'desktop-frame',
  '3d-printer',
  'decor-books',
  'decor-vase',
  'decor-tea-tray',
  'decor-tissue-box',
  'decor-small-plant',
  'router',
  'humidifier',
  'laptop',
  'desktop',
  'nas',
  'printer',
  'microwave',
  'ricecooker',
] as const

const SUPPORT_TYPES = [
  'side-table',
  'kitchen-island',
  'table',
  'rounddiningtable',
  'rounddiningtableturntable',
  'coffeetable',
  'squarecoffeetable',
  'tea-table-set',
  'desk',
  'nightstand',
  'tvstand',
  'sideboard',
  'shoecabinet',
  'cabinet',
  'kitchenbase',
  'bar',
  'vanity',
] as const

const snappableTypesSet = new Set<string>(SNAPPABLE_TYPES)
const supportTypesSet = new Set<string>(SUPPORT_TYPES)

/** 能否落台：表内类型，或**桌面款**智能屏（壁挂款不上台面）。 */
function isSnappableItem(item: { type?: unknown; smartDisplayMount?: unknown }): boolean {
  if (typeof item.type !== 'string') return false
  if (snappableTypesSet.has(item.type)) return true
  return item.type === 'smart-display' && item.smartDisplayMount !== 'wall'
}

/**
 * 量支撑面时临时挂载的模型。
 *
 * 传 `modelCache` 时按「支撑物快照」复用同一个 Group：同一笔操作里多个采样点不该反复
 * 克隆模型。调用方负责在操作结束后释放（见 `finalizeAddedItem`）—— 这些 Group 只用来
 * 量高度，不进入场景，不释放就会一直挂着 mesh。
 */
type SupportModelCache = Map<string, unknown>

export function snapItemToSurface({
  THREE: three,
  item: snapItem,
  items: sceneItems,
  pixelsPerMeter: pixelsPerMeter,
  mountModel: mountModel,
  enabled: isEnabled = true,
  movingIds: movingIds = [snapItem.id],
  modelCache: modelCache = null,
}: any): { elevation: number; supportId: string } | null {
  if (
    !isEnabled ||
    movingIds.length !== 1 ||
    !isSnappableItem(snapItem) ||
    !(pixelsPerMeter > 0) ||
    !(snapItem.width > 0 && snapItem.depth > 0)
  )
    return null
  const supportModelOf = (supportItem: any) => {
    const cache = modelCache as SupportModelCache | null
    if (!cache) {
      const uncachedGroup = new three.Group()
      return mountModel(uncachedGroup, supportItem) ? uncachedGroup : null
    }
    const cacheKey = JSON.stringify(supportItem)
    if (cache.has(cacheKey)) return cache.get(cacheKey)
    const cachedGroup = new three.Group()
    const mountedGroup = mountModel(cachedGroup, supportItem) ? cachedGroup : null
    cache.set(cacheKey, mountedGroup)
    return mountedGroup
  }
  const rotationRad = ((snapItem.rotation || 0) * Math.PI) / 180,
    rotationCos = Math.cos(rotationRad),
    rotationSin = Math.sin(rotationRad),
    sampleOffsets = [
      [0, 0],
      [-0.48, -0.48],
      [0.48, -0.48],
      [-0.48, 0.48],
      [0.48, 0.48],
      [-0.48, 0],
      [0.48, 0],
      [0, -0.48],
      [0, 0.48],
    ].map(
      ([offsetX, offsetY]) => (
        (offsetX *= snapItem.width),
        (offsetY *= snapItem.depth),
        [offsetX * rotationCos - offsetY * rotationSin, offsetX * rotationSin + offsetY * rotationCos]
      ),
    ),
    raycaster = new three.Raycaster(),
    normalMatrix = new three.Matrix3(),
    surfaceNormal = new three.Vector3(),
    rayDirection = new three.Vector3(0, -1, 0)
  let surfaceCandidate: { elevation: number; supportId: string } | null = null
  for (const supportItem of sceneItems) {
    if (supportItem.id === snapItem.id || !supportTypesSet.has(supportItem.type)) continue
    const deltaX = (supportItem.x - snapItem.x) / pixelsPerMeter,
      deltaY = (supportItem.y - snapItem.y) / pixelsPerMeter
    if (Math.hypot(deltaX, deltaY) > Math.hypot(supportItem.width, supportItem.depth) / 2) continue
    const supportGroup = supportModelOf(supportItem)
    if (!supportGroup) continue
    supportGroup.position.set(deltaX, supportItem.elevation || 0, deltaY),
      (supportGroup.rotation.y = (-(supportItem.rotation || 0) * Math.PI) / 180),
      supportGroup.updateMatrixWorld(true)
    const supportMeshes: any = []
    supportGroup.traverseVisible((childObject: any) => {
      childObject.isMesh && supportMeshes.push(childObject)
    })
    const supportBounds = new three.Box3().setFromObject(supportGroup),
      hitHeights: any[] = []
    for (const [sampleX, sampleY] of sampleOffsets) {
      raycaster.set(new three.Vector3(sampleX, supportBounds.max.y + 0.1, sampleY), rayDirection)
      const intersection = raycaster.intersectObjects(supportMeshes, false)[0]
      if (
        !intersection?.face ||
        (surfaceNormal
          .copy(intersection.face.normal)
          .applyMatrix3(normalMatrix.getNormalMatrix(intersection.object.matrixWorld))
          .normalize(),
        surfaceNormal.y < 0.999 || intersection.point.y < 0.05 || intersection.point.y > 6)
      )
        break
      hitHeights.push(intersection.point.y)
    }
    if (hitHeights.length !== sampleOffsets.length) continue
    const surfaceElevation = Math.max(...hitHeights)
    // 九个采样点不在同一高度（斜面 / 跨两个支撑物）就跳过：落台只认平整台面。
    surfaceElevation - Math.min(...hitHeights) > 0.005 ||
      ((!surfaceCandidate || surfaceElevation > surfaceCandidate.elevation) &&
        (surfaceCandidate = {
          elevation: surfaceElevation,
          supportId: supportItem.id,
        }))
  }
  return (surfaceCandidate && (snapItem.elevation = surfaceCandidate.elevation), surfaceCandidate)
}
