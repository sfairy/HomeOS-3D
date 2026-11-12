import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { syncStudioSelect as syncStudioSelect2 } from '../../ui/studio-widgets'
import { lampItemTypeSet } from '../../items/item-catalog'
import type { ListDragRowSession } from '../../types/studio-app-types'
import { generateId } from '../../ui/studio-app-helpers'

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
