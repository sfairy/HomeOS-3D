import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  MATERIAL_STYLE_AUTO,
  normalizeMaterialStyle,
  registerCustomMaterialStyles,
} from '../../../materials/studio-material-presets'
import { normalizeMaterialSurfaceOverrides } from '../../scene/payload/studio-scene-payload'

/** 场景里同款物件的其它数量（「应用到同类」的按钮状态与提示用）：家具按模型比，门按门型比。 */
export function materialSameModelPeerCount(runtime: StudioAppRuntime, target: any) {
  return runtime.materialSameModelPeerRecords(target).length
}

/** 材质编辑用的「模型类型」：家具取注册表里的模型类型，门就是 `door` —— 门的档位组与角色表都以 `door` 为键（门型差异由部件表处理，不另开模型类型）。 */
export function materialEditModelType(runtime: StudioAppRuntime, record: any, kind: any) {
  return kind === 'door' ? 'door' : runtime.externalModelRegistry.modelTypeForItem(record)
}

/** 当前选中对象里那一个「可做材质编辑」的：家具（GLB 模型）或门（户型洞口）。 */
export function selectedMaterialEditTarget(runtime: StudioAppRuntime) {
  const selectedObject = runtime.getSelectedObject()
  if (!selectedObject || !runtime.isSelectionAllowed(runtime.appCtx.selectedItem)) return null
  if (runtime.appCtx.selectedItem?.kind === 'item') return { kind: 'item', record: selectedObject }
  if (runtime.appCtx.selectedItem?.kind === 'door') return { kind: 'door', record: selectedObject }
  return null
}

/** 同款物件的其它成员：家具按 itemType 比，门按 **doorType** 比 —— 门的「同款」就是同一种门型（实木门与推拉门的部件都不一样，互相套用材质只会套出一堆无主的覆盖色）。 */
export function materialSameModelPeerRecords(runtime: StudioAppRuntime, target: any) {
  if (!target) return []
  if (target.kind === 'door') {
    const doorType = target.record?.doorType || 'solid'
    return runtime.appCtx.studioState.doors.filter(
      (sceneDoor) => sceneDoor.id !== target.record.id && (sceneDoor.doorType || 'solid') === doorType,
    )
  }
  const modelType = runtime.materialEditModelType(target.record, target.kind)
  if (!modelType) return []
  return runtime.appCtx.studioState.items.filter(
    (sceneItem) =>
      sceneItem !== target.record &&
      sceneItem?.id !== target.record?.id &&
      runtime.externalModelRegistry.modelTypeForItem(sceneItem) === modelType,
  )
}

/** 逐物件材质编辑的公共收尾：只调用一次 `captureUndoSnapshot`，改动为真才落撤销 / 重建。 */
export function commitItemMaterialEdit(runtime: StudioAppRuntime, mutationFunction: any) {
  const materialEditTarget = runtime.selectedMaterialEditTarget()
  if (!materialEditTarget) return false
  const undoSnapshot = runtime.captureUndoSnapshot()
  if (!mutationFunction(materialEditTarget.record, materialEditTarget.kind)) return false
  return (
    (runtime.appCtx.materialSlotPanelSignature = ''),
    runtime.applyPlacementChange(undoSnapshot),
    runtime.refreshScopeItems(
      materialEditTarget.kind === 'door' ? 'architecture' : runtime.resolvePreviewScope(materialEditTarget.record),
    ),
    runtime.markDocumentDirty(),
    true
  )
}

/** 写入 / 清除逐物件材质覆盖色。 */
/**
 * 一条面板行可能代表**多个 GLB 材质**：车辆按语义槽位归并后，同一行里颜色/参数一致的
 * 材质并成了一个色块（见 `VEHICLE_MATERIAL_SLOTS`）。写回时按色块展开成真实材质名列表，
 * 否则改色只会命中分格里的第一个材质。
 */
function materialSlotWriteTargets(slotEntries: any, materialName: any) {
  const slotEntry = Array.isArray(slotEntries)
    ? slotEntries.find((candidate: any) => candidate.name === materialName || candidate.members?.includes(materialName))
    : null
  const variant = slotEntry?.variants?.find(
    (candidate: any) => candidate.name === materialName || candidate.names?.includes(materialName),
  )
  return {
    names: variant?.names?.length ? variant.names : [materialName],
    hasAtlas: Boolean(variant ? variant.hasAtlas : slotEntry?.hasAtlas),
  }
}

export function setItemMaterialOverride(runtime: StudioAppRuntime, materialName: any, overrideColor: any) {
  runtime.commitItemMaterialEdit((modelItem: any) => {
    // 图集槽位不接受手动改色：颜色由整张 UV 图集提供，写进去只会把图集盖成一块纯色。
    const slotEntries = materialName
        ? runtime.externalModelRegistry.describeItemMaterials(modelItem, runtime.materialLoadOptionsForItem(modelItem))
        : null,
      writeTargets = materialName ? materialSlotWriteTargets(slotEntries, materialName) : { names: [], hasAtlas: false }
    if (materialName && writeTargets.hasAtlas) return false
    const previousOverrides =
        modelItem.materialOverrides &&
        typeof modelItem.materialOverrides == 'object' &&
        !Array.isArray(modelItem.materialOverrides)
          ? { ...modelItem.materialOverrides }
          : {},
      nextOverrides = { ...previousOverrides },
      isOverrideColor = typeof overrideColor == 'string' && /^#[0-9a-f]{6}$/i.test(overrideColor)
    if (!materialName) for (const overrideKey of Object.keys(nextOverrides)) delete nextOverrides[overrideKey]
    else if (isOverrideColor)
      for (const targetName of writeTargets.names) nextOverrides[targetName] = overrideColor.toLowerCase()
    else for (const targetName of writeTargets.names) delete nextOverrides[targetName]
    const touchedKeys = new Set([...Object.keys(previousOverrides), ...Object.keys(nextOverrides)])
    if (![...touchedKeys].some((touchedKey) => previousOverrides[touchedKey] !== nextOverrides[touchedKey]))
      return false
    const normalizedOverrides = Object.fromEntries(
      Object.entries(nextOverrides).sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0)),
    )
    Object.keys(normalizedOverrides).length
      ? (modelItem.materialOverrides = normalizedOverrides)
      : delete modelItem.materialOverrides
    return true
  })
}

/** 写入 / 清除「材质风格」档位（`item.materialStyle`）。 */
export function setItemMaterialStyle(runtime: StudioAppRuntime, styleValue: any) {
  runtime.commitItemMaterialEdit((modelItem: any, materialEditTargetKind: any) => {
    const modelType = runtime.materialEditModelType(modelItem, materialEditTargetKind),
      previousStyle = normalizeMaterialStyle(modelType, modelItem.materialStyle),
      nextStyle = normalizeMaterialStyle(modelType, styleValue)
    if (nextStyle === previousStyle) return false
    nextStyle === MATERIAL_STYLE_AUTO ? delete modelItem.materialStyle : (modelItem.materialStyle = nextStyle)
    return true
  })
}

/** 「全部跟随主题」：档位与逐槽覆盖色一起清掉（面板上那颗按钮的语义就是全复位）。 */
export function resetItemMaterialAll(runtime: StudioAppRuntime) {
  runtime.commitItemMaterialEdit((modelItem: any, materialEditTargetKind: any) => {
    const modelType = runtime.materialEditModelType(modelItem, materialEditTargetKind),
      hasOverrides = Boolean(
        modelItem.materialOverrides &&
          typeof modelItem.materialOverrides == 'object' &&
          Object.keys(modelItem.materialOverrides).length,
      ),
      hasSurfaceOverrides = Boolean(
        Object.keys(normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides)).length,
      ),
      hasMaterialStyle = normalizeMaterialStyle(modelType, modelItem.materialStyle) !== MATERIAL_STYLE_AUTO
    if (!hasOverrides && !hasSurfaceOverrides && !hasMaterialStyle) return false
    delete modelItem.materialOverrides, delete modelItem.materialSurfaceOverrides, delete modelItem.materialStyle
    return true
  })
}

/** 写入 / 清除某个槽位的表面参数覆盖（`item.materialSurfaceOverrides`）。 */
export function setItemMaterialSurfaceOverride(
  runtime: StudioAppRuntime,
  materialName: any,
  surfaceKey: any,
  surfaceValue: any,
) {
  if (!materialName || !['roughness', 'metalness'].includes(surfaceKey)) return
  runtime.commitItemMaterialEdit((modelItem: any) => {
    // 归并后的色块代表多个真实材质，参数要写到该格的全部材质上。
    const surfaceTargetNames = materialSlotWriteTargets(
        runtime.externalModelRegistry.describeItemMaterials(modelItem, runtime.materialLoadOptionsForItem(modelItem)),
        materialName,
      ).names,
      previousSurfaceOverrides = normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides),
      isSurfaceNumber = typeof surfaceValue == 'number' && Number.isFinite(surfaceValue),
      nextSurfaceOverrides = { ...previousSurfaceOverrides }
    for (const targetName of surfaceTargetNames) {
      const previousSlotOverride = previousSurfaceOverrides[targetName] || {},
        nextSlotOverride = { ...previousSlotOverride }
      isSurfaceNumber
        ? (nextSlotOverride[surfaceKey] = Math.round(Math.min(1, Math.max(0, surfaceValue)) * 100) / 100)
        : delete nextSlotOverride[surfaceKey]
      Object.keys(nextSlotOverride).length
        ? (nextSurfaceOverrides[targetName] = nextSlotOverride)
        : delete nextSurfaceOverrides[targetName]
    }
    const normalizedSurfaceOverrides = normalizeMaterialSurfaceOverrides(nextSurfaceOverrides)
    if (JSON.stringify(normalizedSurfaceOverrides) === JSON.stringify(previousSurfaceOverrides)) return false
    return (
      Object.keys(normalizedSurfaceOverrides).length
        ? (modelItem.materialSurfaceOverrides = normalizedSurfaceOverrides)
        : delete modelItem.materialSurfaceOverrides,
      true
    )
  })
}

export function readStoredCustomMaterialStyles(runtime: StudioAppRuntime) {
  try {
    return JSON.parse(window.localStorage.getItem(runtime.MATERIAL_STYLE_CUSTOM_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

/** 把存储里的个人预设装进档位表； */
export function loadCustomMaterialStyles(runtime: StudioAppRuntime) {
  const acceptedRecords = registerCustomMaterialStyles(runtime.readStoredCustomMaterialStyles())
  return acceptedRecords
}

/** 个人预设只装一次：档位表的查询是热路径（每次刷新面板都要走），不能每次读 localStorage。 */
export function ensureCustomMaterialStylesLoaded(runtime: StudioAppRuntime) {
  runtime.appCtx.areCustomMaterialStylesLoaded ||
    ((runtime.appCtx.areCustomMaterialStylesLoaded = true), runtime.loadCustomMaterialStyles())
}

export function writeStoredCustomMaterialStyles(runtime: StudioAppRuntime, records: any) {
  try {
    window.localStorage.setItem(runtime.MATERIAL_STYLE_CUSTOM_STORAGE_KEY, JSON.stringify(records))
  } catch {
    /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
  }
}
