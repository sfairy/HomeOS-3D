import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { describeDoorMaterials } from './door-materials'
import {
  buildCustomMaterialStyleRecord,
  customMaterialStyleId,
  materialStyleGroupFor,
  materialStylePresetFor,
  normalizeMaterialStyle,
} from '../../../materials/studio-material-presets'
import { normalizeMaterialSurfaceOverrides } from '../../scene/payload/studio-scene-payload'

/** 把当前物件的出图结果存成一档个人预设（同名同组覆盖）。 */
export function saveCurrentItemMaterialStyle(runtime: StudioAppRuntime, label: any) {
  const materialEditTarget = runtime.selectedMaterialEditTarget(),
    modelItem = materialEditTarget?.record
  if (!modelItem) return ''
  const modelType = runtime.materialEditModelType(modelItem, materialEditTarget.kind),
    presetGroup = materialStyleGroupFor(modelType)
  if (!presetGroup) return ''
  const materialSlotEntries =
    materialEditTarget.kind === 'door'
      ? describeDoorMaterials(runtime.backgroundSettings, modelItem)
      : runtime.externalModelRegistry.describeItemMaterials(modelItem, runtime.materialLoadOptionsForItem(modelItem))
  if (!materialSlotEntries) return ''
  const currentStyle = normalizeMaterialStyle(modelType, modelItem.materialStyle),
    customId = customMaterialStyleId(presetGroup, label),
    customRecord = buildCustomMaterialStyleRecord(
      customId,
      label,
      presetGroup,
      materialSlotEntries.map((slotEntry: any) => ({
        role: slotEntry.role,
        color: slotEntry.color || '#888888',
        roughness: slotEntry.roughness,
        metalness: slotEntry.metalness,

        slab: slotEntry.slab || '',
      })),
      materialStylePresetFor(modelType, currentStyle),
    )
  if (!customRecord) return ''
  const remainingRecords = runtime
    .loadCustomMaterialStyles()
    .filter((customStyleRecord: any) => customStyleRecord.id !== customId)
  const nextRecords = [...remainingRecords, customRecord]
  runtime.writeStoredCustomMaterialStyles(nextRecords),
    runtime.loadCustomMaterialStyles(),
    (runtime.appCtx.materialStyleOptionSignature = ''),
    (runtime.appCtx.materialSlotPanelSignature = '')

  runtime.setItemMaterialStyle(customId)
  return label
}

/** 删除一档个人预设； */
export function deleteCustomMaterialStyle(runtime: StudioAppRuntime, styleId: any) {
  if (!String(styleId).startsWith('custom:')) return
  const nextRecords = runtime
    .loadCustomMaterialStyles()
    .filter((customStyleRecord: any) => customStyleRecord.id !== styleId)
  runtime.writeStoredCustomMaterialStyles(nextRecords),
    runtime.loadCustomMaterialStyles(),
    (runtime.appCtx.materialStyleOptionSignature = '')

  const affectedItems = runtime.appCtx.studioState.items.filter((sceneItem) => sceneItem.materialStyle === styleId),
    affectedDoors = runtime.appCtx.studioState.doors.filter((sceneDoor) => sceneDoor.materialStyle === styleId)
  if (!affectedItems.length && !affectedDoors.length) return void (runtime.appCtx.materialSlotPanelSignature = '')
  const undoSnapshot = runtime.captureUndoSnapshot()
  for (const affectedItem of affectedItems) delete affectedItem.materialStyle
  for (const affectedDoor of affectedDoors) delete affectedDoor.materialStyle
  runtime.applyPlacementChange(undoSnapshot),
    affectedItems.length && runtime.refreshScopeItems('items'),
    affectedDoors.length && runtime.refreshScopeItems('architecture'),
    runtime.markDocumentDirty()
}

/** 「应用到同类物件」：把当前物件的档位、逐槽颜色与表面参数复制给场景里同模型的其它物件。 */
export function applyMaterialToSameModelItems(runtime: StudioAppRuntime) {
  const materialEditTarget = runtime.selectedMaterialEditTarget(),
    modelItem = materialEditTarget?.record
  if (!modelItem) return 0
  const peerItems = runtime.materialSameModelPeerRecords(materialEditTarget)
  if (!peerItems.length) return 0
  const materialOverrides = modelItem.materialOverrides ? { ...modelItem.materialOverrides } : null,
    materialSurfaceOverrides = Object.keys(normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides)).length
      ? normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides)
      : null,
    materialStyle = modelItem.materialStyle || null
  const undoSnapshot = runtime.captureUndoSnapshot()
  for (const peerItem of peerItems)
    materialStyle ? (peerItem.materialStyle = materialStyle) : delete peerItem.materialStyle,
      materialOverrides ? (peerItem.materialOverrides = { ...materialOverrides }) : delete peerItem.materialOverrides,
      materialSurfaceOverrides
        ? (peerItem.materialSurfaceOverrides = { ...materialSurfaceOverrides })
        : delete peerItem.materialSurfaceOverrides
  return (
    (runtime.appCtx.materialSlotPanelSignature = ''),
    runtime.applyPlacementChange(undoSnapshot),
    runtime.refreshScopeItems(
      materialEditTarget.kind === 'door' ? 'architecture' : runtime.resolvePreviewScope(materialEditTarget.record),
    ),
    runtime.markDocumentDirty(),
    peerItems.length
  )
}

export function refreshScopeItems(runtime: StudioAppRuntime, scopeFilter = 'all') {
  runtime.refreshBackground(),
    runtime.refreshStudioUi(),
    runtime.refreshStudioView(),
    scopeFilter !== 'none' &&
      runtime.requestSceneRebuild({
        scope: scopeFilter,
      })
}
