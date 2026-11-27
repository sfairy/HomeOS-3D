import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { syncStudioSelect as syncStudioSelect2 } from '../ui/studio-widgets'
import { finite as finite2 } from '../loaders/studio-normalization'
import { type ListDragRowSession } from '../types/studio-app-types'
import { showDrawingLightNotice } from '../ui/dialogs'
import { clamp as clamp2 } from '../plan/geometry'
import { lightAngleLimitForType, lightPresetCatalog } from './studio-app-light-data'
import { lampItemTypeSet } from '../items/item-catalog'
import { type StudioAppContext } from '../app-context'


/** 按区域头的拖放结果重排区域顺序。 */
export function moveAreaRow(runtime: StudioAppRuntime, draggedAreaId: any, targetAreaId: any, insertAfterFlag: any) {
  const draggedAreaIndex = runtime.appCtx.lightAreaRecords.findIndex(
      (draggedAreaMatch) => draggedAreaMatch.areaId === draggedAreaId,
    ),
    targetAreaIndex = runtime.appCtx.lightAreaRecords.findIndex(
      (targetAreaMatch) => targetAreaMatch.areaId === targetAreaId,
    )
  if (draggedAreaIndex < 0 || targetAreaIndex < 0 || draggedAreaIndex === targetAreaIndex) return
  const reorderedAreas = [...runtime.appCtx.lightAreaRecords],
    [draggedArea] = reorderedAreas.splice(draggedAreaIndex, 1),
    insertAreaIndex = reorderedAreas.findIndex((insertTargetMatch) => insertTargetMatch.areaId === targetAreaId)
  if (insertAreaIndex < 0) return
  reorderedAreas.splice(insertAreaIndex + (insertAfterFlag ? 1 : 0), 0, draggedArea)
  if (
    reorderedAreas.every(
      (orderedArea, orderedAreaIndex) =>
        orderedArea.areaId === runtime.appCtx.lightAreaRecords[orderedAreaIndex]?.areaId,
    )
  )
    return
  runtime.appCtx.lightAreaRecords = reorderedAreas
  runtime.persistLightAreaOrder()
  runtime.syncLightGroupList()
}

/** 把灯组移动到目标区域，可插到某组之前 / 之后（targetGroupId 为空表示只换区域、不改顺序）。 */
export function moveLightGroupToArea(
  runtime: StudioAppRuntime,
  draggedGroupId: any,
  targetAreaId: any,
  targetGroupId: any = null,
  insertAfterFlag = false,
) {
  const movedLightGroup = runtime.appCtx.studioState.lightGroups.find(
    (draggedGroupMatch) => draggedGroupMatch.id === draggedGroupId,
  )
  if (!movedLightGroup) return
  const nextAreaId = targetAreaId || null,
    areaChanged = (movedLightGroup.areaId || null) !== nextAreaId
  let reorderedLightGroups = runtime.appCtx.studioState.lightGroups
  if (targetGroupId) {
    const remainingLightGroups = runtime.appCtx.studioState.lightGroups.filter(
        (remainingGroupMatch) => remainingGroupMatch.id !== draggedGroupId,
      ),
      anchorGroupIndex = remainingLightGroups.findIndex((anchorGroupMatch) => anchorGroupMatch.id === targetGroupId)
    if (anchorGroupIndex >= 0) {
      reorderedLightGroups = [...remainingLightGroups]
      reorderedLightGroups.splice(anchorGroupIndex + (insertAfterFlag ? 1 : 0), 0, movedLightGroup)
    }
  }
  const orderChanged = reorderedLightGroups.some(
    (orderedGroup, orderedGroupIndex) =>
      orderedGroup.id !== runtime.appCtx.studioState.lightGroups[orderedGroupIndex]?.id,
  )
  if (!areaChanged && !orderChanged) return
  runtime.deselectAll(),
    (movedLightGroup.areaId = nextAreaId),
    orderChanged && (runtime.appCtx.studioState.lightGroups = reorderedLightGroups),
    nextAreaId && runtime.appCtx.expandedAreaIds.add(nextAreaId),
    runtime.syncLightGroupList(),
    runtime.refreshStudioUi(),
    runtime.markDocumentDirty()
}

/** 拉取 HA 区域注册表，作为灯光面板唯一的区域来源（只读，但展示顺序可在本地拖动调整）。 */
export async function refreshLightAreasFromHa(runtime: StudioAppRuntime) {
  let fetchedAreaRecords: { areaId: string; name: string }[] = []
  try {
    const areaApiPayload = await runtime.fetchStudioApi('/ha/areas'),
      listedAreaItems = Array.isArray(areaApiPayload?.items) ? areaApiPayload.items : []
    fetchedAreaRecords = listedAreaItems
      .map((areaItem: any) => ({
        areaId: String(areaItem?.areaId || areaItem?.id || '').trim(),
        name: String(areaItem?.name || '').trim(),
      }))
      .filter((areaRecord: any) => areaRecord.areaId && areaRecord.name)
  } catch (lightAreaError: any) {
    fetchedAreaRecords = []
  }
  runtime.appCtx.lightAreaRecords = runtime.applySavedLightAreaOrder(fetchedAreaRecords)
  runtime.syncLightGroupList()
}

export function readSavedLightAreaOrder(runtime: StudioAppRuntime): string[] {
  try {
    const savedOrder = JSON.parse(window.localStorage.getItem(runtime.LIGHT_AREA_ORDER_STORAGE_KEY) || '[]')
    return Array.isArray(savedOrder) ? savedOrder.map((areaIdItem) => String(areaIdItem)) : []
  } catch (lightAreaOrderError: any) {
    return []
  }
}

export function persistLightAreaOrder(runtime: StudioAppRuntime) {
  try {
    window.localStorage.setItem(
      runtime.LIGHT_AREA_ORDER_STORAGE_KEY,
      JSON.stringify(runtime.appCtx.lightAreaRecords.map((areaRecord) => areaRecord.areaId)),
    )
  } catch (lightAreaOrderError: any) {
    /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
  }
}

/** 按本地记录的 areaId 顺序重排 HA 区域； */
export function applySavedLightAreaOrder(runtime: StudioAppRuntime, areaRecords: { areaId: string; name: string }[]) {
  const areaRecordById = new Map(areaRecords.map((areaRecord) => [areaRecord.areaId, areaRecord])),
    orderedAreaRecords: any[] = []
  for (const savedAreaId of runtime.readSavedLightAreaOrder()) {
    const savedAreaRecord = areaRecordById.get(savedAreaId)
    savedAreaRecord && (orderedAreaRecords.push(savedAreaRecord), areaRecordById.delete(savedAreaId))
  }
  for (const remainingAreaRecord of areaRecords)
    areaRecordById.has(remainingAreaRecord.areaId) &&
      (orderedAreaRecords.push(remainingAreaRecord), areaRecordById.delete(remainingAreaRecord.areaId))
  return orderedAreaRecords
}

/** 该 areaId 是否为当前 HA 里的有效区域（渲染分组 / 分配校验用）。 */
export function isKnownLightAreaId(runtime: StudioAppRuntime, areaId: any) {
  return !!areaId && runtime.appCtx.lightAreaRecords.some((areaRecord) => areaRecord.areaId === areaId)
}

/** 重建「所属区域」下拉框：「未分类」恒在首位，其后是 HA 区域注册表里的全部区域。 */
export function syncAreaAssignOptions(runtime: StudioAppRuntime, selectedAreaId: any) {
  const areaOptionRecords = [
    {
      value: '',
      label: '未分类',
    },
  ]
  for (const listedArea of runtime.appCtx.lightAreaRecords)
    areaOptionRecords.push({
      value: listedArea.areaId,
      label: listedArea.name,
    })
  runtime.lightGroupAreaSelectElement.replaceChildren(
    ...areaOptionRecords.map((areaOptionRecord) => {
      const areaOptionElement = document.createElement('option')
      return (
        (areaOptionElement.value = areaOptionRecord.value),
        (areaOptionElement.textContent = areaOptionRecord.label),
        areaOptionElement
      )
    }),
  ),
    (runtime.lightGroupAreaSelectElement.value = areaOptionRecords.some(
      (areaOptionRecord) => areaOptionRecord.value === selectedAreaId,
    )
      ? selectedAreaId
      : ''),
    syncStudioSelect2(runtime.lightGroupAreaSelectElement)
}

/** 打开灯组的「设置区域」对话框，按该灯组当前所属区域回填下拉框。 */
export function openLightGroupAreaDialog(runtime: StudioAppRuntime, assignTargetGroup: any) {
  assignTargetGroup &&
    ((runtime.appCtx.areaAssignGroupId = assignTargetGroup.id),
    (runtime.lightGroupAreaNameElement.textContent = assignTargetGroup.name),
    runtime.syncAreaAssignOptions(assignTargetGroup.areaId || ''),
    runtime.lightGroupAreaDialogElement.showModal())
}

export function closeLightGroupAreaDialog(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.areaAssignGroupId = ''), runtime.lightGroupAreaDialogElement.close()
}

/** 展开 / 收起某个区域。 */
export function toggleAreaExpanded(runtime: StudioAppRuntime, toggledAreaId: any) {
  runtime.appCtx.expandedAreaIds.has(toggledAreaId)
    ? runtime.appCtx.expandedAreaIds.delete(toggledAreaId)
    : runtime.appCtx.expandedAreaIds.add(toggledAreaId),
    runtime.syncLightGroupList()
}

/** 创建一个「区域」区块：区域来自 HA，可折叠、可拖动排序，也是拖放目标（灯组拖到头上即挂进该区域）。 */
export function createAreaSection(runtime: StudioAppRuntime, listedArea: any, memberLightGroups: any) {
  const isAreaExpanded = runtime.appCtx.expandedAreaIds.has(listedArea.areaId),
    areaSectionElement = document.createElement('div')
  ;(areaSectionElement.className = 'light-area-section'), (areaSectionElement.dataset.areaId = listedArea.areaId)
  const areaHeaderElement = document.createElement('div')
  ;(areaHeaderElement.className = 'light-area-row' + (isAreaExpanded ? ' expanded' : '')),
    (areaHeaderElement.dataset.areaId = listedArea.areaId),
    areaHeaderElement.setAttribute(
      'aria-label',
      listedArea.name + '，单击展开或收起，拖动可调整区域顺序；区域来自 HA，不可新建或删除',
    )
  const areaDragRowSession: ListDragRowSession = {
    kind: 'area',
    id: listedArea.areaId,
    name: listedArea.name,
    rowElement: areaHeaderElement,
    pointerId: -1,
    pointerType: 'mouse',
    startX: 0,
    startY: 0,
    armed: false,
    active: false,
    holdTimeoutId: null as any,
    ghostElement: null as any,
    dropTargets: [] as any[],
    pendingDrop: null as any,
  }
  areaHeaderElement.addEventListener('pointerdown', (areaPointerDownEvent) => {
    areaPointerDownEvent.button === 0 &&
      !(areaPointerDownEvent.target instanceof Element && areaPointerDownEvent.target.closest('button')) &&
      runtime.beginListRowDrag(areaDragRowSession, areaPointerDownEvent)
  }),
    areaHeaderElement.addEventListener('click', () => runtime.toggleAreaExpanded(listedArea.areaId))
  const areaCaretButton = document.createElement('button')
  ;(areaCaretButton.type = 'button'),
    (areaCaretButton.className = 'light-area-caret'),
    (areaCaretButton.textContent = isAreaExpanded ? '▾' : '▸'),
    (areaCaretButton.title = isAreaExpanded ? '收起区域' : '展开区域'),
    areaCaretButton.addEventListener('click', (areaCaretEvent) => {
      areaCaretEvent.stopPropagation(), runtime.toggleAreaExpanded(listedArea.areaId)
    })
  const areaNameLabel = document.createElement('span')
  ;(areaNameLabel.className = 'light-area-name'), (areaNameLabel.textContent = listedArea.name)
  const areaCountNote = document.createElement('small')
  ;(areaCountNote.textContent = String(memberLightGroups.length)),
    areaHeaderElement.append(areaCaretButton, areaNameLabel, areaCountNote),
    areaSectionElement.append(areaHeaderElement)
  if (isAreaExpanded) {
    if (!memberLightGroups.length) {
      const emptyAreaNote = document.createElement('div')
      ;(emptyAreaNote.className = 'light-area-empty'),
        (emptyAreaNote.textContent = '暂无灯组'),
        areaSectionElement.append(emptyAreaNote)
    } else {
      const areaGroupsContainer = document.createElement('div')
      ;(areaGroupsContainer.className = 'light-area-groups'),
        memberLightGroups.forEach((memberLightGroup: any) =>
          areaGroupsContainer.append(runtime.createLightGroupRow(memberLightGroup)),
        ),
        areaSectionElement.append(areaGroupsContainer)
    }
  }
  return areaSectionElement
}

/**
 * 灯光性能提示：当前楼层（或「全部楼层」）已开启的灯具 ≥ 6 盏时提醒一次。
 *
 * 判定与 0.7.8 一致：灯具条目亮度和 > 0，且所属灯组未被关闭；只统计当前预览范围，
 * 因此切到「全部楼层」时计数会包含所有楼层的灯。
 */
export async function maybeShowDrawingLightNotice(runtime: StudioAppRuntime) {
  if (runtime.hasShownDrawingLightNotice) return
  const litLightCount = runtime
    .collectLampEntries()
    .filter(
      (lampEntry: any) => finite2(lampEntry.item.lightBrightness, 0) > 0 && lampEntry.group?.enabled !== false,
    ).length
  if (litLightCount < runtime.DRAWING_LIGHT_NOTICE_THRESHOLD) return
  runtime.hasShownDrawingLightNotice = true
  await showDrawingLightNotice(litLightCount)
}

/**
 * 「照射范围（m）」与「光束角（°）」的就地同步。
 *
 * 为什么需要它
 * ------------
 * 这两个值只活在灯对象自己身上（`SpotLight.distance` / `SpotLight.angle`），而灯对象是
 * **重建灯光层**时才新建的。亮度、色温没有这个限制：灯效通路（HA 灯态、灯光过渡、
 * 灯光缓存回显）每帧都会从 item 上重写一次 `intensity` / `color`。
 *
 * 于是只要重建没有立刻发生，用户就会看到「改亮度有色温有反应，改照射范围、光束角毫无变化」：
 * - 手动预览模式（`livePreviewEnabled !== true`）下 `requestSceneRebuild` 只会把场景标脏，
 *   等用户点「待更新 · 更新」；
 * - 场景还在装载、或重建被合并到下一帧时同理。
 *
 * 这里按 item 的当前值把锥体参数写回**已经存在**的灯对象，并把阴影相机的裁剪面一起对齐，
 * 再请一帧重绘，让这两个参数一次提交就能看见效果。重建照旧排队，负责灯带外形、光晕等
 * 几何层面的更新。
 *
 * 口径与 `addLightModel` 完全一致：`SpotLight.angle` 是**半角**（弧度），
 * `distance` 是照射范围，阴影相机 `near/far` 跟随照射范围。
 * 灯带是 `RectAreaLight`，没有锥角，光束角对它无效（0.8.2 同样如此）。
 */


/** 按灯型取预设（未知灯型按筒灯处理，与 `addLightModel` 同口径）。 */
function lightPresetFor(lightType: string) {
  return (
    (lightPresetCatalog as unknown as Record<string, typeof lightPresetCatalog.downlight>)[lightType] ??
    lightPresetCatalog.downlight
  )
}

interface LightShapeTarget {
  distance: number
  halfAngleRad: number
}

/** 灯具 item 里本模块关心的字段（其余字段一律不看）。 */
type LightItemLike = {
  id?: string
  type?: string
  lightRange?: number
  lightAngle?: number
  lightSourceVisible?: boolean
}

/** 场景里的灯对象里本模块关心的字段（SpotLight / RectAreaLight 的公共子集）。 */
type SceneLightLike = {
  distance?: number
  angle?: number
  intensity?: number
  visible?: boolean
  isSpotLight?: boolean
  isRectAreaLight?: boolean
  type?: string
  children?: SceneLightLike[]
  userData?: {
    lightItemId?: string
    stripFixtureRoot?: boolean
    stripFixtureItemId?: string
    stripFixture?: { visible?: boolean }
  }
  shadow?: { camera?: { near: number; far: number; updateProjectionMatrix: () => void }; needsUpdate?: boolean }
}

declare global {
  interface Window {
    /** 现场排查入口（见 `installLightShapeProbe`）。 */
    __homeosLightShapeProbe?: () => unknown
  }
}

/** item → 灯对象上应有的锥体参数；不是灯或缺少 id 时返回 null。 */
function resolveLightShapeTarget(lightItem: LightItemLike): LightShapeTarget | null {
  if (!lightItem?.id || !lampItemTypeSet.has(lightItem.type ?? '')) return null
  const lightPreset = lightPresetFor(lightItem.type ?? ''),
    lightRange = clamp2(finite2(lightItem.lightRange, lightPreset.range), 0.5, 10),
    lightAngle = clamp2(
      finite2(lightItem.lightAngle, lightPreset.angle),
      15,
      lightAngleLimitForType(lightItem.type ?? ''),
    )
  return {
    distance: lightRange,
    // 与 addLightModel 同口径：SpotLight 的 angle 是半角（弧度）。
    halfAngleRad: ((lightAngle / 2) * Math.PI) / 180,
  }
}

function applyLightShapeTarget(sceneLight: SceneLightLike, shapeTarget: LightShapeTarget) {
  if (
    Math.abs(finite2(sceneLight.distance, 0) - shapeTarget.distance) < 0.0001 &&
    Math.abs(finite2(sceneLight.angle, 0) - shapeTarget.halfAngleRad) < 0.00001
  )
    return false
  ;(sceneLight.distance = shapeTarget.distance), (sceneLight.angle = shapeTarget.halfAngleRad)
  const spotShadowCamera = sceneLight.shadow?.camera
  if (spotShadowCamera) {
    ;(spotShadowCamera.near = clamp2(shapeTarget.distance * 0.05, 0.12, 0.24)),
      (spotShadowCamera.far = shapeTarget.distance),
      spotShadowCamera.updateProjectionMatrix()
  }
  // 锥体变了，旧阴影图里能看见的区域就不对了：标脏让它按新锥体重画一次。
  sceneLight.shadow && (sceneLight.shadow.needsUpdate = true)
  return true
}

/**
 * 把给定灯具的照射范围/光束角同步到场景里已经存在的灯对象。
 *
 * @returns 实际被改动的灯对象数量（0 表示已一致，或场景里还没有对应的灯）。
 */
function syncLightShapeFromItems(
  appCtx: StudioAppContext,
  lightItemList: LightItemLike[] = (appCtx.studioState?.items as LightItemLike[]) || [],
) {
  const sceneRoot = appCtx.sceneRootNode
  if (!sceneRoot?.traverse || !lightItemList?.length) return 0
  installLightShapeProbe(appCtx)
  const shapeByItemId = new Map<string, LightShapeTarget>()
  for (const lightItem of lightItemList) {
    const shapeTarget = resolveLightShapeTarget(lightItem)
    shapeTarget && lightItem.id && shapeByItemId.set(lightItem.id, shapeTarget)
  }
  if (!shapeByItemId.size) return 0
  let updatedLightCount = 0
  sceneRoot.traverse((sceneLight: SceneLightLike) => {
    const shapeTarget = sceneLight?.userData?.lightItemId
      ? (shapeByItemId.get(sceneLight.userData.lightItemId) ?? null)
      : null
    if (!shapeTarget || !sceneLight.isSpotLight) return
    applyLightShapeTarget(sceneLight, shapeTarget) && (updatedLightCount += 1)
  })
  // 现场自检：改完这两个值应该能看到 updated/候选 这个计数变化（0/N 说明没匹配到灯）。
  updatedLightCount > 0 &&
    (document.documentElement.dataset.lightShapeSync = `${updatedLightCount}/${shapeByItemId.size}`)
  return updatedLightCount
}

/**
 * 灯带「显示光源」就地开关：重建被推迟时，选中态下的发光本体 / 朝向箭头也要立刻显隐。
 * 未选中时本来就不画本体，这里只处理当前提交的那几条灯带。
 */
function syncStripFixtureVisibilityFromItems(
  appCtx: StudioAppContext,
  lightItemList: LightItemLike[] = (appCtx.studioState?.items as LightItemLike[]) || [],
) {
  const sceneRoot = appCtx.sceneRootNode
  if (!sceneRoot?.traverse || !lightItemList?.length) return 0
  const visibilityByItemId = new Map<string, boolean>()
  for (const lightItem of lightItemList) {
    if (lightItem.type !== 'striplight' || !lightItem.id) continue
    visibilityByItemId.set(lightItem.id, lightItem.lightSourceVisible !== false)
  }
  if (!visibilityByItemId.size) return 0
  let updatedCount = 0
  sceneRoot.traverse((node: SceneLightLike) => {
    if (!node.userData?.stripFixtureRoot || !node.children?.length) return
    const fixture = node.children.find((child) => child.userData?.stripFixtureItemId)
    const itemId = fixture?.userData?.stripFixtureItemId
    if (!itemId || !visibilityByItemId.has(itemId)) return
    const show = visibilityByItemId.get(itemId) === true
    for (const child of node.children) {
      if (child.visible === show) continue
      child.visible = show
      updatedCount += 1
    }
  })
  return updatedCount
}

/**
 * 就地同步 + 请一帧重绘。
 *
 * 重绘走的是 `isFrameDirty` + 帧循环 `wake()`：与 `requestStudioRender` 同一条通路，
 * 但只依赖 `appCtx`，因此属性提交（`applyToolSetting`）这种拿不到 runtime 的位置也能用。
 */
export function syncLightShapeAndRepaint(appCtx: StudioAppContext, lightItemList?: LightItemLike[]) {
  const updatedLightCount =
    syncLightShapeFromItems(appCtx, lightItemList) + syncStripFixtureVisibilityFromItems(appCtx, lightItemList)
  if (updatedLightCount > 0) (appCtx.isFrameDirty = true), appCtx.lightingScheduler?.wake?.()
  return updatedLightCount
}

let probeAppCtx: StudioAppContext | null = null

/**
 * 现场排查入口：控制台执行 `__homeosLightShapeProbe()`，列出每盏灯
 * 「item 上期望的 range/angle」与「场景里灯对象实际的 distance/angle」的对照。
 *
 * 用来区分三种情况：
 * - item 列表里根本没有这盏灯 → 选中的不是当前楼层的灯具；
 * - 有 item、没有对应的 spot → 灯光层没建出来（或该类型是灯带）；
 * - 两边不一致 → 重建没跑到灯光层，就地同步也没命中。
 */
function installLightShapeProbe(appCtx: StudioAppContext) {
  probeAppCtx = appCtx
  if (typeof window === 'undefined' || window.__homeosLightShapeProbe) return
  window.__homeosLightShapeProbe = () => {
    const probeItemList = ((probeAppCtx?.studioState?.items || []) as LightItemLike[]).filter((probeItem) =>
        lampItemTypeSet.has(probeItem?.type ?? ''),
      ),
      probeLightsByItemId = new Map<string, SceneLightLike>()
    probeAppCtx?.sceneRootNode?.traverse?.((probeLight: SceneLightLike) => {
      const probeLightItemId = probeLight?.userData?.lightItemId
      probeLightItemId && !probeLightsByItemId.has(probeLightItemId)
        ? probeLightsByItemId.set(probeLightItemId, probeLight)
        : null
    })
    return {
      sync: document.documentElement.dataset.lightShapeSync || '(还没同步过)',
      itemCount: probeItemList.length,
      lightCount: probeLightsByItemId.size,
      rows: probeItemList.map((probeItem) => {
        const probeTarget = resolveLightShapeTarget(probeItem),
          probeLight = probeItem.id ? probeLightsByItemId.get(probeItem.id) : undefined
        return {
          id: probeItem.id,
          type: probeItem.type,
          itemRange: probeItem.lightRange ?? '(默认)',
          itemAngle: probeItem.lightAngle ?? '(默认)',
          expectRange: probeTarget?.distance ?? null,
          expectAngleDeg: probeTarget ? Math.round((probeTarget.halfAngleRad * 2 * 180) / Math.PI) : null,
          lightKind: probeLight ? (probeLight.isSpotLight ? 'spot' : probeLight.type) : '缺失',
          lightRange: probeLight?.distance ?? null,
          lightAngleDeg: probeLight?.isSpotLight ? Math.round(((probeLight.angle ?? 0) * 2 * 180) / Math.PI) : null,
          visible: probeLight?.visible ?? null,
          intensity: probeLight?.intensity ?? null,
        }
      }),
    }
  }
}
