import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { lampItemTypeSet } from '../../items/item-catalog'
import { composeKey, composeItemKey } from '../../ui/studio-app-helpers'

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

export function collectLampEntries(runtime: StudioAppRuntime) {
  return (
    runtime.getPreviewFloorMode() === 'all'
      ? runtime.appCtx.studioProject?.floors || []
      : [runtime.getActiveFloor()].filter(Boolean)
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
