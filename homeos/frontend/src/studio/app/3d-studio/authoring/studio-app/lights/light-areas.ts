import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { syncStudioSelect as syncStudioSelect2 } from '../../ui/studio-widgets'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import type { ListDragRowSession } from '../../types/studio-app-types'
import { showDrawingLightNotice } from '../ui/studio-confirm-dialogs'

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
