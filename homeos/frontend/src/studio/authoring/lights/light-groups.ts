import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { syncStudioSelect as syncStudioSelect2 } from '../ui/studio-widgets'
import { lampItemTypeSet, itemTypeCatalog } from '../items/item-catalog'
import { type ListDragRowSession } from '../types/studio-app-types'
import { generateId, composeKey, composeItemKey } from '../ui/studio-app-helpers'
import { isPlacedItemLocked } from '../items/placed-item-state'
import { normalizeLightPropertyValue, formatLightPropertyValue } from './studio-app-light-data'
import { domElement } from '@app/shared/util/dom-factory'


export function getLightGroups(runtime: StudioAppRuntime) {
  const lightGroups = runtime.appCtx.studioState.lightGroups || (runtime.appCtx.studioState.lightGroups = [])
  return (
    lightGroups.length ||
      lightGroups.push({
        id: generateId('light-group'),
        name: '默认灯组',
        enabled: true,
        areaId: null as any,
      }),
    lightGroups.some((lightGroupIdMatch) => lightGroupIdMatch.id === runtime.appCtx.activeLightGroupId) ||
      (runtime.appCtx.activeLightGroupId = lightGroups[0].id),
    lightGroups.find((lightGroupByName) => lightGroupByName.id === runtime.appCtx.activeLightGroupId) || lightGroups[0]
  )
}

export function syncLightGroupSelect(runtime: StudioAppRuntime, lightGroupSourceItem: any) {
  const lightGroupSelectElement = runtime.selectElement('#light-group')
  lightGroupSelectElement.replaceChildren()
  for (const lightGroupOption of runtime.appCtx.studioState.lightGroups || []) {
    const lightGroupOptionElement = document.createElement('option')
    ;(lightGroupOptionElement.value = lightGroupOption.id),
      (lightGroupOptionElement.textContent = lightGroupOption.name),
      lightGroupSelectElement.append(lightGroupOptionElement)
  }
  ;(lightGroupSelectElement.value = runtime.resolveLightGroup(lightGroupSourceItem)?.id || runtime.getLightGroups().id),
    syncStudioSelect2(lightGroupSelectElement)
}

export function hideLightGroupActionMenu(runtime: StudioAppRuntime) {
  ;(runtime.lightGroupActionMenuElement.hidden = true), (runtime.appCtx.pendingLightGroupId = '')
}

export function showLightGroupActionMenu(runtime: StudioAppRuntime, lightGroupRow: any, lightGroupMenuEvent: any) {
  ;(runtime.appCtx.pendingLightGroupId = lightGroupRow.id),
    (runtime.appCtx.activeLightGroupId = lightGroupRow.id),
    runtime.syncLightGroupList()
  const lightGroupDeleteControl = runtime.lightGroupActionMenuElement.querySelector(
    '[data-light-group-action="delete"]',
  )
  ;(lightGroupDeleteControl.disabled = runtime.appCtx.studioState.lightGroups.length <= 1),
    (runtime.lightGroupActionMenuElement.hidden = false),
    (runtime.lightGroupActionMenuElement.style.left =
      Math.min(lightGroupMenuEvent.clientX, window.innerWidth - 116) + 'px'),
    (runtime.lightGroupActionMenuElement.style.top =
      Math.min(lightGroupMenuEvent.clientY, window.innerHeight - 148) + 'px')
}

export function deleteLightGroup(runtime: StudioAppRuntime, lightGroupToDelete: any) {
  if (!lightGroupToDelete || runtime.appCtx.studioState.lightGroups.length <= 1) return
  /**
   * 锁定守卫（0.8.7）：组内有已锁定的灯时拒绝删除。
   * 「已放置」面板把锁当作「别动它」的承诺，删灯组会把锁定件一起删掉，
   * 那是用户明确要求不要发生的事，所以这里必须挡下来而不是弹二次确认。
   */
  const lockedLampInGroup = runtime.appCtx.studioState.items.some(
    (groupLamp) =>
      lampItemTypeSet.has(groupLamp.type) &&
      groupLamp.lightGroupId === lightGroupToDelete.id &&
      isPlacedItemLocked(runtime.appCtx, groupLamp.id),
  )
  if (lockedLampInGroup) {
    runtime.showToast('灯组中有已锁定的灯光，请先解锁后再删除。', 'warning')
    return
  }
  runtime.deselectAll()
  const fallbackLightGroup = runtime.appCtx.studioState.lightGroups.find(
      (otherLightGroup) => otherLightGroup.id !== lightGroupToDelete.id,
    ),
    deletedLampIdSet = new Set(
      runtime.appCtx.studioState.items
        .filter(
          (lampInGroup) => lampItemTypeSet.has(lampInGroup.type) && lampInGroup.lightGroupId === lightGroupToDelete.id,
        )
        .map((lampInGroupId) => lampInGroupId.id),
    )
  ;(runtime.appCtx.studioState.items = runtime.appCtx.studioState.items.filter(
    (remainingItem) => !deletedLampIdSet.has(remainingItem.id),
  )),
    (runtime.appCtx.studioState.lightGroups = runtime.appCtx.studioState.lightGroups.filter(
      (remainingLightGroup) => remainingLightGroup.id !== lightGroupToDelete.id,
    )),
    runtime.appCtx.selectedItem?.kind === 'item' &&
      deletedLampIdSet.has(runtime.appCtx.selectedItem.id) &&
      (runtime.appCtx.selectedItem = null),
    (runtime.appCtx.selectedItems = runtime.appCtx.selectedItems.filter(
      (remainingSelection: any) => remainingSelection.kind !== 'item' || !deletedLampIdSet.has(remainingSelection.id),
    )),
    runtime.appCtx.activeLightGroupId === lightGroupToDelete.id &&
      (runtime.appCtx.activeLightGroupId = fallbackLightGroup!.id),
    runtime.refreshScopeItems('lights'),
    runtime.markDocumentDirty(),
    runtime.showToast('已删除“' + lightGroupToDelete.name + '”及组内 ' + deletedLampIdSet.size + ' 盏灯。', 'success')
}

export function uniqueLightGroupName(runtime: StudioAppRuntime, lightGroupBaseName: any) {
  const lightGroupNameSet = new Set(
    runtime.appCtx.studioState.lightGroups.map((existingGroupName) => existingGroupName.name),
  )
  if (!lightGroupNameSet.has(lightGroupBaseName)) return lightGroupBaseName
  let duplicateNameSuffix = 2
  for (; lightGroupNameSet.has(lightGroupBaseName + ' ' + duplicateNameSuffix); ) duplicateNameSuffix += 1
  return lightGroupBaseName + ' ' + duplicateNameSuffix
}

export function duplicateLightGroup(runtime: StudioAppRuntime, lightGroupToDuplicate: any) {
  if (!lightGroupToDuplicate) return
  runtime.deselectAll()
  const duplicatedLightGroup = {
      ...structuredClone(lightGroupToDuplicate),
      id: generateId('light-group'),
      name: runtime.uniqueLightGroupName(lightGroupToDuplicate.name + ' 副本'),
    },
    sourceLightGroupIndex = runtime.appCtx.studioState.lightGroups.findIndex(
      (sourceGroupMatch) => sourceGroupMatch.id === lightGroupToDuplicate.id,
    )
  runtime.appCtx.studioState.lightGroups.splice(sourceLightGroupIndex + 1, 0, duplicatedLightGroup)
  const clonedLampItems = runtime.appCtx.studioState.items
    .filter(
      (lampInSourceGroup) =>
        lampItemTypeSet.has(lampInSourceGroup.type) && lampInSourceGroup.lightGroupId === lightGroupToDuplicate.id,
    )
    .map((clonedLamp) => ({
      ...structuredClone(clonedLamp),
      id: generateId('item'),
      lightGroupId: duplicatedLightGroup.id,
    }))
  runtime.appCtx.studioState.items.push(...clonedLampItems),
    (runtime.appCtx.activeLightGroupId = duplicatedLightGroup.id),
    (runtime.appCtx.selectedItem =
      clonedLampItems.length === 1
        ? {
            kind: 'item',
            id: clonedLampItems[0].id,
          }
        : null),
    (runtime.appCtx.selectedItems =
      clonedLampItems.length > 1
        ? clonedLampItems.map((relinkedLamp) => ({
            kind: 'item',
            id: relinkedLamp.id,
          }))
        : []),
    runtime.syncLightGroupList(),
    runtime.refreshScopeItems('lights'),
    runtime.markDocumentDirty(),
    runtime.showToast(
      '已复制“' + lightGroupToDuplicate.name + '”及组内 ' + clonedLampItems.length + ' 盏灯。',
      'success',
    )
}

/** 创建一个灯组列表行（长按拖动排序 / 移入区域 + 右键菜单）。 */
export function createLightGroupRow(runtime: StudioAppRuntime, listedLightGroup: any) {
  const lightGroupRowElement = document.createElement('div')
  ;(lightGroupRowElement.className =
    'light-group-row' + (listedLightGroup.id === runtime.appCtx.activeLightGroupId ? ' active' : '')),
    (lightGroupRowElement.dataset.lightGroupId = listedLightGroup.id),
    (lightGroupRowElement.dataset.lightGroupAreaId = listedLightGroup.areaId || ''),
    lightGroupRowElement.setAttribute(
      'aria-label',
      listedLightGroup.name + '，拖动可排序或移入区域，右键可设置区域、重命名、复制或删除',
    )
  const listDragRowSession: ListDragRowSession = {
    kind: 'group',
    id: listedLightGroup.id,
    name: listedLightGroup.name,
    rowElement: lightGroupRowElement,
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
  lightGroupRowElement.addEventListener('pointerdown', (groupPointerDownEvent) => {
    groupPointerDownEvent.button === 0 &&
      !(groupPointerDownEvent.target instanceof Element && groupPointerDownEvent.target.closest('button')) &&
      runtime.beginListRowDrag(listDragRowSession, groupPointerDownEvent)
  }),
    lightGroupRowElement.addEventListener('click', () => {
      ;(runtime.appCtx.activeLightGroupId = listedLightGroup.id), runtime.syncLightGroupList()
    }),
    lightGroupRowElement.addEventListener('contextmenu', (groupActionMenuEvent) => {
      groupActionMenuEvent.preventDefault(), runtime.showLightGroupActionMenu(listedLightGroup, groupActionMenuEvent)
    })
  const groupToggleButton = document.createElement('button')
  ;(groupToggleButton.type = 'button'),
    (groupToggleButton.className = listedLightGroup.enabled ? 'on' : ''),
    (groupToggleButton.textContent = listedLightGroup.enabled ? '◉' : '○'),
    (groupToggleButton.title = listedLightGroup.enabled ? '关闭这个灯组' : '开启这个灯组'),
    groupToggleButton.addEventListener('click', (groupToggleClickEvent) => {
      groupToggleClickEvent.stopPropagation(),
        runtime.deselectAll(),
        (listedLightGroup.enabled = !listedLightGroup.enabled),
        runtime.transitionLightGroups([listedLightGroup.id]),
        runtime.markDocumentDirty()
    })
  const groupNameLabel = document.createElement('span')
  ;(groupNameLabel.className = 'light-group-name'),
    (groupNameLabel.textContent = listedLightGroup.name),
    (groupNameLabel.title = '拖动灯组可排序或移入区域，右键可设置区域、重命名、复制或删除')
  const groupLampCountNote = document.createElement('small')
  ;(groupLampCountNote.textContent = String(
    runtime.appCtx.studioState.items.filter(
      (lampInRowGroup) =>
        lampItemTypeSet.has(lampInRowGroup.type) && lampInRowGroup.lightGroupId === listedLightGroup.id,
    ).length,
  )),
    lightGroupRowElement.append(groupToggleButton, groupNameLabel, groupLampCountNote)
  return lightGroupRowElement
}

export function syncLightGroupList(runtime: StudioAppRuntime) {
  if (
    ((runtime.lightLayerPanelElement.hidden = runtime.appCtx.activeLibraryCategory !== 'light'),
    !runtime.lightLayerPanelElement.hidden)
  ) {
    runtime.getLightGroups(), runtime.maybeShowDrawingLightNotice(), runtime.lightGroupListElement.replaceChildren()
    const sceneAreas = runtime.appCtx.lightAreaRecords,
      knownAreaIdSet = new Set(sceneAreas.map((areaRef) => areaRef.areaId)),
      areaMemberGroupMap = new Map(),
      unassignedLightGroups: any[] = []
    for (const listedLightGroup of runtime.appCtx.studioState.lightGroups) {
      const listedAreaId = knownAreaIdSet.has(listedLightGroup.areaId) ? listedLightGroup.areaId : null
      listedAreaId
        ? (areaMemberGroupMap.has(listedAreaId) || areaMemberGroupMap.set(listedAreaId, []),
          areaMemberGroupMap.get(listedAreaId).push(listedLightGroup))
        : unassignedLightGroups.push(listedLightGroup)
    }
    for (const listedArea of sceneAreas)
      runtime.lightGroupListElement.append(
        runtime.createAreaSection(listedArea, areaMemberGroupMap.get(listedArea.areaId) || []),
      )
    for (const unassignedLightGroup of unassignedLightGroups)
      runtime.lightGroupListElement.append(runtime.createLightGroupRow(unassignedLightGroup))
    for (const [screenRowIndex, screenLayerItem] of runtime.getScreenLightGroups().entries()) {
      const screenLayerRowElement = document.createElement('div')
      ;(screenLayerRowElement.className = 'light-group-row tv-screen-layer-row'),
        screenLayerRowElement.setAttribute(
          'aria-label',
          (screenLayerItem.screenLayerName || '电视画面 ' + (screenRowIndex + 1)) + '，可独立开启或关闭',
        )
      const screenToggleButton = document.createElement('button')
      ;(screenToggleButton.type = 'button'),
        (screenToggleButton.className = screenLayerItem.screenEnabled !== false ? 'on' : ''),
        (screenToggleButton.textContent = screenLayerItem.screenEnabled !== false ? '◉' : '○'),
        (screenToggleButton.title = screenLayerItem.screenEnabled !== false ? '关闭电视画面' : '开启电视画面'),
        screenToggleButton.addEventListener('click', () => {
          runtime.deselectAll(),
            (screenLayerItem.screenEnabled = screenLayerItem.screenEnabled === false),
            runtime.refreshScopeItems('items'),
            runtime.markDocumentDirty()
        })
      const screenNameLabel = document.createElement('span')
      ;(screenNameLabel.className = 'light-group-name'),
        (screenNameLabel.textContent = screenLayerItem.screenLayerName || '电视画面 ' + (screenRowIndex + 1)),
        (screenNameLabel.title = '电视开启画面')
      const screenLayerIndexNote = document.createElement('small')
      ;(screenLayerIndexNote.textContent = '1'),
        screenLayerRowElement.append(screenToggleButton, screenNameLabel, screenLayerIndexNote),
        runtime.lightGroupListElement.append(screenLayerRowElement)
    }
    for (const [chargingRowIndex, chargingLayerItem] of runtime.getChargingLightGroups().entries()) {
      const chargingLayerRowElement = document.createElement('div')
      ;(chargingLayerRowElement.className = 'light-group-row car-charging-layer-row'),
        chargingLayerRowElement.setAttribute(
          'aria-label',
          (chargingLayerItem.chargingLayerName || '汽车充电 ' + (chargingRowIndex + 1)) + '，可独立开启或关闭',
        )
      const chargingToggleButton = document.createElement('button')
      ;(chargingToggleButton.type = 'button'),
        (chargingToggleButton.className = chargingLayerItem.chargingEnabled === true ? 'on' : ''),
        (chargingToggleButton.textContent = chargingLayerItem.chargingEnabled === true ? '◉' : '○'),
        (chargingToggleButton.title =
          chargingLayerItem.chargingEnabled === true ? '关闭汽车充电状态' : '开启汽车充电状态'),
        chargingToggleButton.addEventListener('click', () => {
          runtime.deselectAll(),
            (chargingLayerItem.chargingEnabled = chargingLayerItem.chargingEnabled !== true),
            runtime.refreshScopeItems('items'),
            runtime.markDocumentDirty()
        })
      const chargingNameLabel = document.createElement('span')
      ;(chargingNameLabel.className = 'light-group-name'),
        (chargingNameLabel.textContent = chargingLayerItem.chargingLayerName || '汽车充电 ' + (chargingRowIndex + 1)),
        (chargingNameLabel.title = '汽车充电中状态图层')
      const chargingIndexNote = document.createElement('small')
      ;(chargingIndexNote.textContent = '1'),
        chargingLayerRowElement.append(chargingToggleButton, chargingNameLabel, chargingIndexNote),
        runtime.lightGroupListElement.append(chargingLayerRowElement)
    }
  }
}

export function setAllLightGroupsEnabled(runtime: StudioAppRuntime, enabledFlag: any) {
  const bl2 = runtime.getScreenLightGroups(),
    gl2 = runtime.getChargingLightGroups()
  if (
    !(
      (runtime.appCtx.studioState.lightGroups || []).every(
        (lightGroupEnabledCheck) => lightGroupEnabledCheck.enabled === enabledFlag,
      ) &&
      bl2.every((screenEnabledCheck: any) => (screenEnabledCheck.screenEnabled !== false) === enabledFlag) &&
      gl2.every((chargingEnabledCheck: any) => (chargingEnabledCheck.chargingEnabled === true) === enabledFlag)
    )
  ) {
    runtime.deselectAll()
    for (const lightGroupToggleTarget of runtime.appCtx.studioState.lightGroups)
      lightGroupToggleTarget.enabled = enabledFlag
    for (const screenToggleTarget of bl2) screenToggleTarget.screenEnabled = enabledFlag
    for (const chargingToggleTarget of gl2) chargingToggleTarget.chargingEnabled = enabledFlag
    runtime.transitionLightGroups(
      runtime.appCtx.studioState.lightGroups.map((lightGroupIdItem) => lightGroupIdItem.id),
    ),
      (bl2.length || gl2.length) &&
        runtime.requestSceneRebuild({
          scope: 'items',
          preserveLightCache: true,
        }),
      runtime.markDocumentDirty()
  }
}


/** 逐槽表面参数的**入库净化**：只接受 `{ "<GLB 材质名>": { roughness?, metalness? } }`，两个值都规整到 0–1 并按两位小数定下来（避免浮点尾数让产物不稳定）。 */
export function captureUndoSnapshot(runtime: StudioAppRuntime, snapshotSource = runtime.appCtx.studioState) {
  return structuredClone(snapshotSource)
}

export function resolveLightGroup(runtime: StudioAppRuntime, lightGroupOwner: any) {
  return (
    runtime.appCtx.studioState.lightGroups?.find(
      (matchedLightGroup) => matchedLightGroup.id === lightGroupOwner?.lightGroupId,
    ) ||
    runtime.appCtx.studioState.lightGroups?.[0] ||
    null
  )
}

export function resolveFloorDefaultGroup(
  runtime: StudioAppRuntime,
  lightGroupOwnerItem: any,
  ownerScene = runtime.appCtx.studioState,
) {
  return (
    ownerScene?.lightGroups?.find((lightGroupMatch) => lightGroupMatch.id === lightGroupOwnerItem?.lightGroupId) ||
    ownerScene?.lightGroups?.[0] ||
    null
  )
}

export function isLampEnabled(runtime: StudioAppRuntime, lampStateRef: any) {
  return runtime.appCtx.overriddenFloorIds !== null
    ? runtime.appCtx.overriddenFloorIds.has(lampStateRef.id)
    : runtime.resolveLightGroup(lampStateRef)?.enabled === false
      ? false
      : runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isLightOverrideOn || !runtime.areLightsEnabled()
}

export function getScreenLightGroups(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioState.items.filter((tvItem) => tvItem.type === 'tv')
}

export function getChargingLightGroups(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioState.items.filter((vehicleItem) =>
    ['smallcar', 'suv', 'scooter'].includes(vehicleItem.type),
  )
}

export function getOrderedFloorList(runtime: StudioAppRuntime) {
  return runtime.getPreviewFloorMode() === 'all'
    ? runtime.appCtx.studioProject.floors
    : [runtime.getActiveFloor()].filter(Boolean)
}

export function composeLightGroupKey(runtime: StudioAppRuntime, groupKeyFloor: any, groupKeyGroup: any) {
  return runtime.getPreviewFloorMode() === 'all' ? composeKey(groupKeyFloor, groupKeyGroup) : groupKeyGroup
}

/**
 * 灯位条目缓存（结构级）。
 *
 * 条目列表只由「楼层 / 分组的结构」决定：亮度这类逐灯属性消费者会从条目引用上实时读，
 * 不需要重建列表。而这条调用链是热路径：
 * `areLightsEnabled() → canRenderScene() → assessRenderBudget() → collectActiveLightEntries()
 * → collectLampEntries()`，一次拖动里每帧被触发 2–4 次，每次都要 flatMap 全部楼层的
 * 全部物件再筛灯具 —— 户型越大越贵，且全是可直接复用的临时对象。
 */
let lampEntriesSignature = {
  revision: -1 as number,
  floorMode: null as unknown,
  activeFloorId: null as unknown,
  project: null as unknown,
}
let lampEntriesCache: ReturnType<typeof buildLampEntries> = []
let hasLampEntriesCache = false

/** 真正构造条目列表（只在结构变化时调用一次）。 */
function buildLampEntries(runtime: StudioAppRuntime, floorMode: unknown) {
  return (
    floorMode === 'all' ? runtime.appCtx.studioProject?.floors || [] : [runtime.getActiveFloor()].filter(Boolean)
  ).flatMap((floorEntryLamp: any) =>
    floorEntryLamp.scene.items
      .filter((lampItem: any) => lampItemTypeSet.has(lampItem.type))
      .map((lampItemRef: any) => {
        const dy2 = runtime.resolveFloorDefaultGroup(lampItemRef, floorEntryLamp.scene)
        return {
          floor: floorEntryLamp,
          item: lampItemRef,
          group: dy2,
          itemKey: composeItemKey(floorEntryLamp.id, lampItemRef.id),
          groupKey: runtime.composeLightGroupKey(floorEntryLamp.id, dy2?.id || '__ungrouped'),
        }
      }),
  )
}

export function collectLampEntries(runtime: StudioAppRuntime) {
  const floorMode = runtime.getPreviewFloorMode()
  const activeFloorId = runtime.appCtx.activeFloorId
  const project = runtime.appCtx.studioProject
  const revision = runtime.appCtx.sceneRevisionCount
  if (
    hasLampEntriesCache &&
    lampEntriesSignature.revision === revision &&
    lampEntriesSignature.floorMode === floorMode &&
    lampEntriesSignature.activeFloorId === activeFloorId &&
    lampEntriesSignature.project === project
  )
    return lampEntriesCache
  const entries = buildLampEntries(runtime, floorMode)
  lampEntriesSignature = { revision, floorMode, activeFloorId, project }
  lampEntriesCache = entries
  hasLampEntriesCache = true
  return entries
}

export function listLightGroupRows(
  runtime: StudioAppRuntime,
  lightGroupFloors = runtime.appCtx.studioProject?.floors || [],
) {
  return lightGroupFloors.flatMap((lightGroupFloor: any) =>
    lightGroupFloor.scene.lightGroups.map((lightGroupRecord: any, lightGroupIndex: any) => ({
      floor: lightGroupFloor,
      group: lightGroupRecord,
      index: lightGroupIndex,
      key: composeKey(lightGroupFloor.id, lightGroupRecord.id),
      lights: lightGroupFloor.scene.items.filter(
        (lampItemMatch: any) =>
          lampItemTypeSet.has(lampItemMatch.type) && lampItemMatch.lightGroupId === lightGroupRecord.id,
      ),
    })),
  )
}

export function listScreenRows(runtime: StudioAppRuntime, screenFloors = runtime.appCtx.studioProject?.floors || []) {
  return screenFloors.flatMap((screenFloor: any) =>
    screenFloor.scene.items
      .filter((tvItemCandidate: any) => tvItemCandidate.type === 'tv')
      .map((tvItemRef: any, tvItemIndex: any) => ({
        floor: screenFloor,
        item: tvItemRef,
        index: tvItemIndex,
        key: screenFloor.id + ':' + tvItemRef.id,
      })),
  )
}

export function listChargingRows(
  runtime: StudioAppRuntime,
  chargingFloors = runtime.appCtx.studioProject?.floors || [],
) {
  return chargingFloors.flatMap((chargingFloor: any) =>
    chargingFloor.scene.items
      .filter((vehicleItemCandidate: any) => ['smallcar', 'suv', 'scooter'].includes(vehicleItemCandidate.type))
      .map((vehicleItemRef: any, vehicleItemIndex: any) => ({
        floor: chargingFloor,
        item: vehicleItemRef,
        index: vehicleItemIndex,
        key: chargingFloor.id + ':' + vehicleItemRef.id,
      })),
  )
}

export function syncScreenLayers(runtime: StudioAppRuntime, floorArgScreen: any) {
  const screenLayerNameSet = new Set(
    runtime.getScreenLightGroups().map((screenLayerEntry: any) => screenLayerEntry.screenLayerName),
  )
  let screenLayerNumber = 1
  for (const screenItem of floorArgScreen)
    if (screenItem.type === 'tv') {
      for (; screenLayerNameSet.has('电视画面 ' + screenLayerNumber); ) screenLayerNumber += 1
      ;(screenItem.screenLayerName = '电视画面 ' + screenLayerNumber),
        (screenItem.screenEnabled = screenItem.screenEnabled !== false),
        screenLayerNameSet.add(screenItem.screenLayerName),
        (screenLayerNumber += 1)
    }
}

export function syncChargingLayers(runtime: StudioAppRuntime, floorArgCharging: any) {
  const chargingLayerNameSet = new Set(
    runtime.getChargingLightGroups().map((chargingLayerEntry: any) => chargingLayerEntry.chargingLayerName),
  )
  let chargingLayerNumber = 1
  for (const chargingItem of floorArgCharging)
    if (['smallcar', 'suv', 'scooter'].includes(chargingItem.type)) {
      for (; chargingLayerNameSet.has('汽车充电 ' + chargingLayerNumber); ) chargingLayerNumber += 1
      ;(chargingItem.chargingLayerName = '汽车充电 ' + chargingLayerNumber),
        (chargingItem.chargingEnabled = chargingItem.chargingEnabled === true),
        chargingLayerNameSet.add(chargingItem.chargingLayerName),
        (chargingLayerNumber += 1)
    }
}

export function pushUndoEntry(runtime: StudioAppRuntime, undoSnapshotArg: any) {
  runtime.syncScreenLayers(undoSnapshotArg), runtime.syncChargingLayers(undoSnapshotArg)
}


export function collectLightTargetInputs(
  runtime: StudioAppRuntime,
  lightTargetRoot = runtime.lightPropertyTargetListElement,
) {
  return [...lightTargetRoot.querySelectorAll('[data-light-target-item-id]')]
}

export function syncLightTargetGroups(runtime: StudioAppRuntime) {
  const ys2 = runtime.collectLightTargetInputs(),
    checkedGroupToggleCount = ys2.filter((lightGroupToggleInput: any) => lightGroupToggleInput.checked).length
  ;(runtime.lightPropertySelectionCountElement.textContent = checkedGroupToggleCount + '/' + ys2.length + ' 灯'),
    (runtime.lightPropertyToggleAllButton.disabled = !ys2.length),
    (runtime.lightPropertyToggleAllButton.textContent =
      ys2.length && checkedGroupToggleCount === ys2.length ? '取消全选' : '全选')
  for (const lightTargetGroupRow of runtime.lightPropertyTargetListElement.querySelectorAll(
    '[data-light-target-group-id]',
  )) {
    const ys3 = runtime.collectLightTargetInputs(lightTargetGroupRow),
      checkedTargetToggleCount = ys3.filter((lightTargetToggleInput: any) => lightTargetToggleInput.checked).length
    ;(lightTargetGroupRow.querySelector('[data-light-target-group-count]').textContent =
      checkedTargetToggleCount + '/' + ys3.length + ' 灯'),
      (lightTargetGroupRow.querySelector('[data-light-target-group-toggle]').textContent =
        ys3.length && checkedTargetToggleCount === ys3.length ? '取消全选' : '全选')
  }
}

export function buildLightGroupList(runtime: StudioAppRuntime, listedLightGroup: any) {
  runtime.lightPropertyTargetListElement.replaceChildren()
  let lightGroupListIndex = 0
  for (const listedGroup of runtime.appCtx.studioState.lightGroups) {
    const lightGroupItems = runtime.appCtx.studioState.items.filter(
      (lightGroupItem) => lampItemTypeSet.has(lightGroupItem.type) && lightGroupItem.lightGroupId === listedGroup.id,
    )
    if (!lightGroupItems.length) continue
    lightGroupListIndex += lightGroupItems.length
    const lightGroupSection = document.createElement('section')
    ;(lightGroupSection.className = 'light-property-target-group'),
      (lightGroupSection.dataset.lightTargetGroupId = listedGroup.id)
    const lightGroupHeader = document.createElement('header'),
      lightGroupHeading = document.createElement('strong')
    lightGroupHeading.textContent = listedGroup.name
    const lightGroupCountBadge = document.createElement('span')
    lightGroupCountBadge.dataset.lightTargetGroupCount = ''
    const lightTargetToggleButton = document.createElement('button')
    ;(lightTargetToggleButton.type = 'button'),
      (lightTargetToggleButton.dataset.lightTargetGroupToggle = ''),
      (lightTargetToggleButton.textContent = '取消全选'),
      lightGroupHeader.append(lightGroupHeading, lightGroupCountBadge, lightTargetToggleButton)
    const lightTargetListContainer = domElement(document, 'div', 'light-property-target-grid')
    const lightItemCountsByType = new Map()
    for (const countedLightItem of lightGroupItems)
      lightItemCountsByType.set(countedLightItem.type, (lightItemCountsByType.get(countedLightItem.type) || 0) + 1)
    const lightItemIndexByType = new Map()
    for (const indexedLightItem of lightGroupItems) {
      const downlight6 = (itemTypeCatalog as any)[indexedLightItem.type] || itemTypeCatalog.downlight,
        lightItemTypeIndex = (lightItemIndexByType.get(indexedLightItem.type) || 0) + 1
      lightItemIndexByType.set(indexedLightItem.type, lightItemTypeIndex)
      const lightTargetLabel = domElement(document, 'label', 'light-property-target-item')
      const lightTargetCheckbox = document.createElement('input')
      ;(lightTargetCheckbox.type = 'checkbox'),
        (lightTargetCheckbox.checked = true),
        (lightTargetCheckbox.dataset.lightTargetItemId = indexedLightItem.id)
      const lightTargetNameLabel = document.createElement('span'),
        lightTargetItemTitle = document.createElement('strong')
      lightTargetItemTitle.textContent =
        lightItemCountsByType.get(indexedLightItem.type) > 1
          ? downlight6.name + ' ' + lightItemTypeIndex
          : downlight6.name
      const lightTargetDetailNote = document.createElement('small'),
        kd3 = normalizeLightPropertyValue(listedLightGroup, indexedLightItem[listedLightGroup], indexedLightItem.type)
      ;(lightTargetDetailNote.textContent =
        (indexedLightItem.id === runtime.appCtx.selectedItem?.id ? '当前灯 · ' : '') +
        '当前 ' +
        formatLightPropertyValue(listedLightGroup, kd3)),
        lightTargetNameLabel.append(lightTargetItemTitle, lightTargetDetailNote),
        lightTargetLabel.append(lightTargetCheckbox, lightTargetNameLabel),
        lightTargetListContainer.append(lightTargetLabel)
    }
    lightGroupSection.append(lightGroupHeader, lightTargetListContainer),
      runtime.lightPropertyTargetListElement.append(lightGroupSection)
  }
  if (!lightGroupListIndex) {
    const lightGroupEmptyMessage = document.createElement('p')
    ;(lightGroupEmptyMessage.className = 'light-property-target-empty'),
      (lightGroupEmptyMessage.textContent = '当前没有可应用的灯具。'),
      runtime.lightPropertyTargetListElement.append(lightGroupEmptyMessage)
  }
  runtime.syncLightTargetGroups()
}
