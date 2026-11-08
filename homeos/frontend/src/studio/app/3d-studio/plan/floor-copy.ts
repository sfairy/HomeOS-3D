import { remapCourtyardAttachments } from './courtyard-drawing'

type CopyableRecord = { id: string }
type CopyableItem = CopyableRecord & { lightGroupId?: string }
type CopyableOpening = CopyableRecord & { wallId?: string }
type CopyableFloor = {
  id: string
  name: string
  elevation: number
  scene: {
    walls?: CopyableRecord[]
    windows?: CopyableOpening[]
    doors?: CopyableOpening[]
    railings?: CopyableOpening[]
    lightGroups?: CopyableRecord[]
    items?: CopyableItem[]
  }
}

/** 需要换 id 的集合，以及每一类 id 的前缀（沿用户型图里已有的 id 形状）。 */
const COPY_COLLECTIONS = [
  ['walls', 'wall'],
  ['windows', 'window'],
  ['doors', 'door'],
  ['railings', 'railing'],
  ['lightGroups', 'light-group'],
  ['items', 'item'],
] as const

const COPY_NAME_LIMIT = 24

function uniqueCopyName(floors: readonly { name: string }[], sourceName: string) {
  const usedNames = new Set(floors.map((floor) => floor.name))
  for (let copyIndex = 1; ; copyIndex += 1) {
    const suffix = copyIndex === 1 ? ' 副本' : ` 副本 ${copyIndex}`
    let keptName = ''
    for (const nameCharacter of sourceName) {
      if (keptName.length + nameCharacter.length > COPY_NAME_LIMIT - suffix.length) break
      keptName += nameCharacter
    }
    const candidateName = keptName.trimEnd() + suffix
    if (!usedNames.has(candidateName)) return candidateName
  }
}

/** 所有集合换新 id，返回「旧 id → 新 id」的映射，供门窗与灯组回挂。 */
function remapFloorIds(floor: CopyableFloor, newId: (kind: string) => string) {
  const idMap: Record<(typeof COPY_COLLECTIONS)[number][0], Map<string, string>> = {
    walls: new Map(),
    windows: new Map(),
    doors: new Map(),
    railings: new Map(),
    lightGroups: new Map(),
    items: new Map(),
  }
  for (const [collectionName, idKind] of COPY_COLLECTIONS)
    for (const record of floor.scene[collectionName] || []) {
      const nextId = newId(idKind)
      idMap[collectionName].set(record.id, nextId)
      record.id = nextId
    }
  return idMap
}

/** 门窗 / 栏杆的 ``wallId`` 指向复制出来的墙；找不到说明源楼层已经坏了，整层拒绝复制。 */
function remapOpeningWalls(floor: CopyableFloor, wallIds: ReadonlyMap<string, string>) {
  for (const collectionName of ['windows', 'doors', 'railings'] as const)
    for (const opening of floor.scene[collectionName] || []) {
      const nextWallId = wallIds.get(opening.wallId || '')
      if (!nextWallId) throw new Error('楼层存在失效的门窗或栏杆关联，请重新载入后再复制。')
      opening.wallId = nextWallId
    }
}

/** 灯具的 ``lightGroupId`` 指向复制出来的灯组，同上。 */
function remapItemLightGroups(floor: CopyableFloor, lightGroupIds: ReadonlyMap<string, string>) {
  for (const item of floor.scene.items || []) {
    if (!item.lightGroupId) continue
    const nextLightGroupId = lightGroupIds.get(item.lightGroupId)
    if (!nextLightGroupId) throw new Error('楼层存在失效的灯组关联，请重新载入后再复制。')
    item.lightGroupId = nextLightGroupId
  }
}

/**
 * 原位置复制一层：绘图坐标不动，id 全部换新，标高接到现有最高层之上。
 * 庭院门洞关系按物件顺序重挂；失效的墙或灯组关联直接抛错，不写出半份楼层。
 */
export function createFloorCopy<T extends CopyableFloor>(
  floors: readonly T[],
  floorId: string,
  { newId, floorHeight = 3 }: { newId: (kind: string) => string; floorHeight?: number },
): T | null {
  const sourceFloor = floors.find((floor) => floor.id === floorId)
  if (!sourceFloor) return null
  const nextElevation = Math.max(...floors.map((floor) => floor.elevation)) + floorHeight
  if (!Number.isFinite(nextElevation) || nextElevation > 120)
    throw new Error('复制后的楼层高度超过上限，请先调整楼层高度。')
  const copiedFloor = structuredClone(sourceFloor)
  copiedFloor.id = newId('floor')
  copiedFloor.name = uniqueCopyName(floors, sourceFloor.name)
  copiedFloor.elevation = nextElevation
  const idMap = remapFloorIds(copiedFloor, newId)
  remapOpeningWalls(copiedFloor, idMap.walls)
  remapItemLightGroups(copiedFloor, idMap.lightGroups)
  remapCourtyardAttachments(sourceFloor.scene.items || [], copiedFloor.scene.items || [])
  return copiedFloor
}
