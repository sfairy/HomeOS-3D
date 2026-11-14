import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { describeDoorMaterials } from './door-materials'
import { doorMaterialPartRolesForType, materialRoleLabel } from '../../../materials/studio-model-material-roles'
import {
  MATERIAL_STYLE_AUTO,
  isMaterialStyleCapable,
  materialStyleAutoLabel,
  materialStyleLabel,
  materialStyleOptionsFor,
  materialStyleOptionsSignature,
  materialStylePresetSwatchColors,
  normalizeMaterialStyle,
} from '../../../materials/studio-material-presets'
import { materialSlotGroupOf } from '../../../materials/studio-material-slot-groups'
import { materialSlabLabel } from '../../ui/studio-app-helpers'
import { normalizeMaterialSurfaceOverrides } from '../../scene/payload/studio-scene-payload'
import { createMaterialStyleChip } from './style-chip'
import { createMaterialSlotSurfacePanel } from './surface-panel'
import { materialSlotGroupView } from '../ui/slot-group-view'

import { domElement } from '@app/shared/util/dom-factory'
export function materialSlotPanelSignatureFor(runtime: StudioAppRuntime, modelItem: any, materialSlotEntries: any) {
  return [
    modelItem?.id || '',
    runtime.appCtx.sceneStyle,
    materialSlotEntries === null ? 'pending' : 'ready',
    JSON.stringify(modelItem?.materialOverrides || {}),
    JSON.stringify(normalizeMaterialSurfaceOverrides(modelItem?.materialSurfaceOverrides)),
    String(modelItem?.materialStyle || ''),
    runtime.appCtx.materialSlotGroupFilter,
    runtime.appCtx.materialStyleOptionSignature,
    materialSlotEntries ? materialSlotEntries.map((slotEntry: any) => slotEntry.name).join(',') : '',
  ].join('|')
}

/** 一枚色卡上排的 3–4 格调色板缩略。 */
export function materialStyleSwatchColors(
  runtime: StudioAppRuntime,
  preset: any,
  fallbackPalette: any,
  slotRoles: any,
) {
  return materialStylePresetSwatchColors(preset, fallbackPalette || runtime.backgroundSettings(), {
    roles: slotRoles,
  })
}

/** 重建「材质风格」色卡条：档位表随模型类型变化（沙发是布艺 / 皮革组、柜类是木作组…），所以色卡不写死在标记里； */
export function syncMaterialStyleStrip(runtime: StudioAppRuntime, modelItem: any, modelType: any, slotRoles: any) {
  if (!runtime.materialStyleStripElement) return
  runtime.ensureCustomMaterialStylesLoaded()
  const presetOptions = isMaterialStyleCapable(modelType) ? materialStyleOptionsFor(modelType) : [],
    optionSignature = materialStyleOptionsSignature(modelType, slotRoles),
    itemPalette = runtime.backgroundSettings()
  if (optionSignature !== runtime.appCtx.materialStyleOptionSignature) {
    runtime.appCtx.materialStyleOptionSignature = optionSignature
    const chipFragment = document.createDocumentFragment(),
      autoChip = createMaterialStyleChip(
        MATERIAL_STYLE_AUTO,
        materialStyleAutoLabel(modelType),
        runtime.materialStyleSwatchColors(null, itemPalette, slotRoles),
        false,
      )
    chipFragment.append(autoChip)
    for (const presetOption of presetOptions)
      chipFragment.append(
        createMaterialStyleChip(
          presetOption.id,
          presetOption.label,
          runtime.materialStyleSwatchColors(presetOption, itemPalette, slotRoles),
          presetOption.id.startsWith('custom:'),
        ),
      )
    runtime.materialStyleStripElement.replaceChildren(chipFragment)
  }
  const selectedStyle = normalizeMaterialStyle(modelType, modelItem?.materialStyle)
  for (const styleChip of runtime.materialStyleStripElement.children) {
    const isActive = styleChip.dataset.materialStyleId === selectedStyle
    styleChip.classList.toggle('is-active', isActive),
      styleChip.setAttribute('aria-checked', String(isActive)),
      styleChip.setAttribute('tabindex', isActive ? '0' : '-1')
  }
  const hasPresets = presetOptions.length > 0
  runtime.materialStyleStripElement.hidden = !hasPresets
  runtime.materialStyleFieldElement && (runtime.materialStyleFieldElement.hidden = !hasPresets)
  runtime.materialStyleDeleteButton && (runtime.materialStyleDeleteButton.hidden = !selectedStyle.startsWith('custom:'))
}

/** 一枚色卡：上方调色板缩略，下方档位名。 */

/** 过滤后的槽位 + 当前可选的族（少于两族时不给筛选条，避免为 5 个槽位加一排芯片）。 */
export function renderMaterialSlotGroupChips(runtime: StudioAppRuntime, groupView: any) {
  if (!runtime.materialSlotGroupsElement) return
  if (!groupView.isFilterable) {
    ;(runtime.materialSlotGroupsElement.hidden = true), runtime.materialSlotGroupsElement.replaceChildren()
    return
  }
  const chipFragment = document.createDocumentFragment(),
    chipEntries = [{ id: '', label: '全部' }, ...groupView.groups]
  for (const chipEntry of chipEntries) {
    const groupChip = document.createElement('button')
    ;(groupChip.type = 'button'),
      (groupChip.className =
        'material-slot-group-chip' + (chipEntry.id === groupView.activeGroupId ? ' is-active' : '')),
      (groupChip.dataset.materialSlotGroup = chipEntry.id),
      (groupChip.textContent = chipEntry.label),
      groupChip.addEventListener('click', () => runtime.setMaterialSlotGroupFilter(chipEntry.id)),
      chipFragment.append(groupChip)
  }
  runtime.materialSlotGroupsElement.replaceChildren(chipFragment),
    (runtime.materialSlotGroupsElement.hidden = false),
    runtime.materialSlotGroupsElement.classList.toggle('is-filtering', Boolean(groupView.activeGroupId))
}

/** 切槽位筛选：清面板签名逼下一次刷新重画（筛选是纯展示状态，不进文档、不进撤销）。 */
export function setMaterialSlotGroupFilter(runtime: StudioAppRuntime, groupId: any) {
  groupId === runtime.appCtx.materialSlotGroupFilter ||
    ((runtime.appCtx.materialSlotGroupFilter = groupId),
    (runtime.appCtx.materialSlotPanelSignature = ''),
    runtime.refreshStudioUi())
}

/** 一行只读表面参数：粗糙 / 金属 / 透明 / 自发光。 */
export function materialSlotMetaText(_runtime: StudioAppRuntime, slotEntry: any) {
  const metaParts = ['粗糙 ' + slotEntry.roughness.toFixed(2), '金属 ' + slotEntry.metalness.toFixed(2)]
  slotEntry.slab && metaParts.push(materialSlabLabel(slotEntry.slab) + '整图')
  ;(slotEntry.transparent || slotEntry.opacity < 1) &&
    metaParts.push('透明 ' + Math.round(slotEntry.opacity * 100) + '%')
  slotEntry.emissive &&
    slotEntry.emissive !== '#000000' &&
    slotEntry.emissiveIntensity > 0 &&
    metaParts.push('自发光 ' + Math.round(slotEntry.emissiveIntensity * 100) + '%')
  return metaParts.join(' · ')
}

/** 门的材质部件表（部件顺序 `DOOR_MATERIAL_PARTS` / 各门型部件 / 部件索引）统一放在`materials/studio-model-material-roles.ts`：运行时出图、材质面板与 CI 校验脚本共用同一份事实（门没有 GLB 可扫，槽位全靠这张表定义），门型增删部件时不会两边各… */

/** 门部件「跟随主题」时读的调色板键（返回色号）。 */
/** 门的逐部件材质 —— 出图与面板**同源**的那一份（改这里就等于同时改画面与检查面板）。 */
/** 画面上的门部件色：选中时叠一层主题 accent（沿用架构构件「选中即高亮」的老规矩），但**只叠一半** —— 从前的写法是把整扇门刷成 accent，于是编辑材质时画面上永远是一片高亮色，看不出自己改了什么（「选了风格没变化」）。 */
export function doorPartDisplayColor(
  _runtime: StudioAppRuntime,
  partMaterial: any,
  isSelected: boolean,
  themePalette: any,
) {
  const partColorValue = partMaterial?.colorValue
  if (!isSelected || typeof partColorValue !== 'number') return partColorValue
  const accentColor = themePalette?.accent
  if (typeof accentColor !== 'number') return partColorValue
  const mixChannel = (shift: number) => {
    const partChannel = (partColorValue >> shift) & 255,
      accentChannel = (accentColor >> shift) & 255
    return Math.round(partChannel + (accentChannel - partChannel) * 0.5)
  }
  return (mixChannel(16) << 16) | (mixChannel(8) << 8) | mixChannel(0)
}

/** 门部件材质 → `addArchitectureMesh` 的 options。 */
export function doorPartMeshOptions(_runtime: StudioAppRuntime, partMaterial: any, baseOptions: any) {
  if (!partMaterial) return baseOptions
  const meshOptions = { ...baseOptions }
  partMaterial.roughness !== undefined && (meshOptions.roughness = partMaterial.roughness)
  partMaterial.metalness !== undefined && (meshOptions.metalness = partMaterial.metalness)
  partMaterial.transparent &&
    ((meshOptions.transparent = true),
    (meshOptions.opacity = partMaterial.opacity),
    (meshOptions.depthWrite = partMaterial.depthWrite))
  partMaterial.emissiveValue !== undefined &&
    ((meshOptions.emissive = partMaterial.emissiveValue),
    (meshOptions.emissiveIntensity = partMaterial.emissiveIntensity ?? 0.5))
  return meshOptions
}

/** 门的「材质属性」槽位表：形状与 `loader.describeItemMaterials` 的输出一致，于是同一块面板 DOM、同一套写入函数与同一份色卡逻辑都能直接复用。 */
/** 同款门（同 doorType）的其它扇数：面板上「应用到同类」的可点状态。 */
export function doorMaterialPeerCount(runtime: StudioAppRuntime, doorRecord: any) {
  return runtime.materialSameModelPeerCount({ kind: 'door', record: doorRecord })
}

/** 重建「材质属性」面板的门版本：与 `renderMaterialSlotPanel` 共用色卡条 / 槽位行 / 动作按钮，只有槽位来源不同（门是程序化部件，家具是 GLB 材质槽）。 */
export function renderDoorMaterialPanel(runtime: StudioAppRuntime, doorRecord: any) {
  if (!runtime.materialFieldsElement || !runtime.materialSlotListElement || !doorRecord) return
  const doorPartRoles = doorMaterialPartRolesForType(doorRecord.doorType)
  runtime.materialFieldsElement.hidden = false
  runtime.syncMaterialStyleStrip(doorRecord, 'door', doorPartRoles)
  const materialSlotEntries = describeDoorMaterials(runtime.backgroundSettings, doorRecord),
    panelSignature = runtime.materialSlotPanelSignatureFor(doorRecord, materialSlotEntries)
  if (panelSignature === runtime.appCtx.materialSlotPanelSignature) return
  runtime.appCtx.materialSlotPanelSignature = panelSignature
  runtime.appCtx.isMaterialSlotPanelPending = false

  for (const expandedSlotName of [...runtime.appCtx.expandedMaterialSurfaceSlots])
    materialSlotEntries.some((slotEntry) => slotEntry.name === expandedSlotName) ||
      runtime.appCtx.expandedMaterialSurfaceSlots.delete(expandedSlotName)
  const overrideCount = materialSlotEntries.filter((slotEntry) => Boolean(slotEntry.overrideColor)).length,
    surfaceOverrideCount = materialSlotEntries.filter((slotEntry) => Boolean(slotEntry.surfaceOverride)).length,
    doorMaterialStyle = normalizeMaterialStyle('door', doorRecord.materialStyle),
    hasMaterialStyle = doorMaterialStyle !== MATERIAL_STYLE_AUTO,
    peerCount = runtime.doorMaterialPeerCount(doorRecord),
    groupView = materialSlotGroupView(runtime.appCtx, materialSlotEntries)
  runtime.materialSummaryElement.textContent =
    (hasMaterialStyle ? materialStyleLabel('door', doorMaterialStyle) + ' · ' : '') +
    materialSlotEntries.length +
    ' 个材质部件 · ' +
    runtime.materialCoverageSummary(overrideCount, surfaceOverrideCount)
  ;(runtime.materialResetAllButton.disabled = !overrideCount && !surfaceOverrideCount && !hasMaterialStyle),
    (runtime.materialSavePresetButton.disabled = false),
    (runtime.materialApplySameButton.disabled = !peerCount),
    (runtime.materialApplySameButton.title = peerCount
      ? '把当前档位与逐部件改动复制给其它 ' + peerCount + ' 扇同款门'
      : '场景里没有其它同款门')
  runtime.renderMaterialSlotGroupChips(groupView)
  const slotRowFragment = document.createDocumentFragment()
  for (const slotEntry of groupView.visibleSlotEntries) slotRowFragment.append(runtime.createMaterialSlotRow(slotEntry))
  if (!groupView.visibleSlotEntries.length) {
    const emptyElement = document.createElement('p')
    ;(emptyElement.className = 'material-slot-empty'),
      (emptyElement.textContent = '这一族里没有部件。'),
      slotRowFragment.append(emptyElement)
  }
  runtime.materialSlotListElement.replaceChildren(slotRowFragment)
}

/** 重建「材质属性」检查面板：先给「材质风格」预设下拉（选一档 = 整套角色换料），再列出选中物件的每个 GLB 材质槽位 → 角色 → 当前显色与表面。 */
export function renderMaterialSlotPanel(runtime: StudioAppRuntime, modelItem: any) {
  if (!runtime.materialFieldsElement || !runtime.materialSlotListElement) return
  const hasExternalModel = Boolean(modelItem && runtime.externalModelRegistry.hasExternalModelForItem(modelItem))
  runtime.materialFieldsElement.hidden = !hasExternalModel
  if (!hasExternalModel) {
    ;(runtime.appCtx.materialSlotPanelSignature = ''),
      (runtime.appCtx.materialStyleOptionSignature = ''),
      runtime.materialSlotListElement.replaceChildren()
    return
  }
  const itemModelType = runtime.externalModelRegistry.modelTypeForItem(modelItem)

  const materialSlotEntries = runtime.externalModelRegistry.describeItemMaterials(
      modelItem,
      runtime.materialLoadOptionsForItem(modelItem),
    ),
    slotRoles = materialSlotEntries ? materialSlotEntries.map((slotEntry: any) => slotEntry.role) : null
  runtime.syncMaterialStyleStrip(modelItem, itemModelType, slotRoles)
  const panelSignature = runtime.materialSlotPanelSignatureFor(modelItem, materialSlotEntries)
  if (panelSignature === runtime.appCtx.materialSlotPanelSignature) return
  runtime.appCtx.materialSlotPanelSignature = panelSignature
  if (!materialSlotEntries) {
    ;(runtime.appCtx.isMaterialSlotPanelPending = true),
      (runtime.materialSummaryElement.textContent = '模型加载中，稍后自动刷新…'),
      runtime.materialSlotListElement.replaceChildren(),
      (runtime.materialResetAllButton.disabled = true),
      (runtime.materialSavePresetButton.disabled = true),
      (runtime.materialApplySameButton.disabled = true),
      runtime.materialSlotGroupsElement && (runtime.materialSlotGroupsElement.hidden = true)
    return
  }
  runtime.appCtx.isMaterialSlotPanelPending = false

  for (const expandedSlotName of [...runtime.appCtx.expandedMaterialSurfaceSlots])
    materialSlotEntries.some((slotEntry: any) => slotEntry.name === expandedSlotName) ||
      runtime.appCtx.expandedMaterialSurfaceSlots.delete(expandedSlotName)
  const overrideCount = materialSlotEntries.reduce(
      (count: number, slotEntry: any) =>
        count +
        (Array.isArray(slotEntry.variants) && slotEntry.variants.length
          ? slotEntry.variants.filter((slotVariant: any) => Boolean(slotVariant.overrideColor)).length
          : Number(Boolean(slotEntry.overrideColor))),
      0,
    ),
    surfaceOverrideCount = materialSlotEntries.reduce(
      (count: number, slotEntry: any) =>
        count +
        (Array.isArray(slotEntry.variants) && slotEntry.variants.length
          ? slotEntry.variants.filter((slotVariant: any) => Boolean(slotVariant.surfaceOverride)).length
          : Number(Boolean(slotEntry.surfaceOverride))),
      0,
    ),
    itemMaterialStyle = normalizeMaterialStyle(itemModelType, modelItem?.materialStyle),
    hasMaterialStyle = itemMaterialStyle !== MATERIAL_STYLE_AUTO,
    peerCount = runtime.materialSameModelPeerCount({ kind: 'item', record: modelItem }),
    groupView = materialSlotGroupView(runtime.appCtx, materialSlotEntries)
  runtime.materialSummaryElement.textContent =
    (hasMaterialStyle ? materialStyleLabel(itemModelType, itemMaterialStyle) + ' · ' : '') +
    materialSlotEntries.length +
    ' 个材质槽位 · ' +
    runtime.materialCoverageSummary(overrideCount, surfaceOverrideCount)
  ;(runtime.materialResetAllButton.disabled = !overrideCount && !surfaceOverrideCount && !hasMaterialStyle),
    (runtime.materialSavePresetButton.disabled = false),
    (runtime.materialApplySameButton.disabled = !peerCount),
    (runtime.materialApplySameButton.title = peerCount
      ? '把当前档位与逐槽改动复制给其它 ' + peerCount + ' 件同模型物件'
      : '场景里没有其它同模型物件')
  runtime.renderMaterialSlotGroupChips(groupView)
  const showGroupLabels = !groupView.activeGroupId && groupView.isFilterable && materialSlotEntries.length >= 8,
    slotRowFragment = document.createDocumentFragment()
  let lastGroupId = ''
  for (const slotEntry of groupView.visibleSlotEntries) {
    const slotGroup = materialSlotGroupOf(slotEntry)
    if (showGroupLabels && slotGroup.id !== lastGroupId) {
      lastGroupId = slotGroup.id
      const groupLabelElement = document.createElement('div')
      ;(groupLabelElement.className = 'material-slot-group-label'),
        (groupLabelElement.textContent = slotGroup.label),
        slotRowFragment.append(groupLabelElement)
    }
    slotRowFragment.append(runtime.createMaterialSlotRow(slotEntry))
  }
  if (!groupView.visibleSlotEntries.length) {
    const emptyElement = document.createElement('p')
    ;(emptyElement.className = 'material-slot-empty'),
      (emptyElement.textContent = '这一族里没有槽位。'),
      slotRowFragment.append(emptyElement)
  }
  runtime.materialSlotListElement.replaceChildren(slotRowFragment)
}

/** 一行覆盖情况的说法：颜色改了几处、表面参数改了几处，都没改就说跟随主题。 */
export function materialCoverageSummary(_runtime: StudioAppRuntime, overrideCount: any, surfaceOverrideCount: any) {
  const changeParts: any[] = []
  overrideCount && changeParts.push('改色 ' + overrideCount)
  surfaceOverrideCount && changeParts.push('改参数 ' + surfaceOverrideCount)
  return changeParts.length ? changeParts.join(' · ') : '全部跟随主题'
}

/** 一条槽位行：左边角色 / 槽位号 / GLB 名，右边色块 + 十六进制 + 参数 + 复位。 */
export function createMaterialSlotRow(runtime: StudioAppRuntime, slotEntry: any) {
  /**
   * 归并行（车辆语义槽位）里一个色块可能代表多个 GLB 材质：
   * 主控件绑第一格，其余分格各出一组小色块，写回按分格展开（见 `materialSlotWriteTargets`）。
   */
  const slotVariants = Array.isArray(slotEntry.variants) && slotEntry.variants.length ? slotEntry.variants : null,
    primaryVariant = slotVariants?.[0] || slotEntry,
    /** 控件上的写入键：分格里第一个真实材质名（`setItemMaterialOverride` 会展开整格）。 */
    slotWriteName = primaryVariant.name || slotEntry.name,
    displayedColor = (slotEntry.overrideColor || slotEntry.color || '#000000').toLowerCase(),
    surfaceOverride = slotEntry.surfaceOverride || null,
    hasOverride = Boolean(slotEntry.overrideColor),
    hasSurfaceOverride = Boolean(surfaceOverride),
    isSurfaceExpanded = runtime.appCtx.expandedMaterialSurfaceSlots.has(slotEntry.name),
    slotRow = document.createElement('div'),
    slotLineElement = document.createElement('div'),
    slotTextElement = document.createElement('span'),
    roleElement = document.createElement('span'),
    nameElement = document.createElement('span'),
    slabBadgeElement = document.createElement('span'),
    atlasBadgeElement = document.createElement('span'),
    controlsElement = document.createElement('span'),
    colorInputElement = document.createElement('input'),
    hexInputElement = document.createElement('input'),
    surfaceToggleButton = document.createElement('button'),
    resetButtonElement = document.createElement('button')
  return (
    (slotRow.className =
      'material-slot' + (hasOverride ? ' is-overridden' : '') + (hasSurfaceOverride ? ' has-surface-override' : '')),
    (slotRow.dataset.materialSlot = slotEntry.name),
    (slotRow.title = runtime.materialSlotMetaText(slotEntry)),
    (slotLineElement.className = 'material-slot-line'),
    (slotTextElement.className = 'material-slot-text'),
    (roleElement.className = 'material-slot-role'),
    (roleElement.textContent =
      (slotEntry.label || materialRoleLabel(slotEntry.role)) +
      (Number.isFinite(slotEntry.slot) ? ' · #' + slotEntry.slot : '')),
    (nameElement.className = 'material-slot-name'),
    (nameElement.textContent =
      Array.isArray(slotEntry.members) && slotEntry.members.length > 1
        ? slotEntry.members.join(' / ')
        : slotEntry.name),
    (nameElement.title =
      (Array.isArray(slotEntry.members) && slotEntry.members.length ? slotEntry.members.join(' / ') : slotEntry.name) +
      (slotEntry.fromPalette ? '（跟随主题调色板）' : '（沿用模型自带颜色）')),
    (slabBadgeElement.className = 'material-slot-slab'),
    (slabBadgeElement.textContent = materialSlabLabel(slotEntry.slab)),
    (slabBadgeElement.title =
      materialSlabLabel(slotEntry.slab) + '整图：这一槽会贴一张自带的石材纹路（颜色仍可调，纹路不受影响）'),
    slotEntry.slab || (slabBadgeElement.hidden = true),
    /**
     * 图集槽位：颜色是贴图烘焙出来的（车漆 / 玻璃 / 尾灯 / 轮毂都在同一张 UV 图集里），
     * 换一个纯色只会把整张图集盖掉 —— 所以这里**不给改色**，只留表面参数。
     */
    (atlasBadgeElement.className = 'material-slot-slab'),
    (atlasBadgeElement.textContent = '图集'),
    (atlasBadgeElement.title =
      '该槽位的颜色由模型自带的 UV 图集贴图提供（车漆 / 玻璃 / 灯组等都在同一张图上），' +
      '改色会覆盖整张图集，因此只开放粗糙度与金属度'),
    slotEntry.hasAtlas || (atlasBadgeElement.hidden = true),
    (controlsElement.className = 'material-slot-controls'),
    (colorInputElement.type = 'color'),
    (colorInputElement.className = 'material-slot-color'),
    (colorInputElement.dataset.materialSlotColor = slotWriteName),
    (colorInputElement.value = displayedColor),
    (colorInputElement.disabled = Boolean(slotEntry.hasAtlas)),
    (colorInputElement.title = slotEntry.hasAtlas
      ? '该槽位颜色来自模型自带图集，不能改色；可展开「参数」调粗糙度 / 金属度'
      : '点开取色器给这个槽位指定颜色；改完写进当前物件'),
    (hexInputElement.type = 'text'),
    (hexInputElement.className = 'material-slot-hex'),
    (hexInputElement.dataset.materialSlotHex = slotWriteName),
    (hexInputElement.value = displayedColor),
    (hexInputElement.spellcheck = false),
    (hexInputElement.maxLength = 7),
    (hexInputElement.disabled = Boolean(slotEntry.hasAtlas)),
    (hexInputElement.title = slotEntry.hasAtlas
      ? '该槽位颜色来自模型自带图集，不能改色'
      : '可以直接粘贴十六进制色值，回车或离开输入框生效'),
    (surfaceToggleButton.type = 'button'),
    (surfaceToggleButton.className = 'material-slot-surface-toggle'),
    (surfaceToggleButton.dataset.materialSlotSurfaceToggle = slotEntry.name),
    surfaceToggleButton.setAttribute('aria-expanded', String(isSurfaceExpanded)),
    (surfaceToggleButton.textContent = hasSurfaceOverride ? '参数 •' : '参数'),
    (surfaceToggleButton.title = '调整该槽位的粗糙度与金属度（当前 ' + runtime.materialSlotMetaText(slotEntry) + '）'),
    (resetButtonElement.type = 'button'),
    (resetButtonElement.className = 'material-slot-reset'),
    (resetButtonElement.dataset.materialSlotReset = slotWriteName),
    (resetButtonElement.textContent = '↺'),
    (resetButtonElement.disabled = !hasOverride || Boolean(slotEntry.hasAtlas)),
    (resetButtonElement.title = slotEntry.hasAtlas
      ? '该槽位颜色来自模型自带图集，没有可清除的手动颜色'
      : hasOverride
        ? '清除该槽位的手动颜色'
        : '该槽位当前就跟随主题'),
    controlsElement.append(colorInputElement, hexInputElement, surfaceToggleButton, resetButtonElement),
    slotTextElement.append(roleElement, nameElement, slabBadgeElement, atlasBadgeElement),
    slotLineElement.append(slotTextElement, controlsElement),
    slotRow.append(slotLineElement),
    slotVariants &&
      slotVariants.length > 1 &&
      slotRow.append(createMaterialSlotVariantList(runtime, slotVariants.slice(1))),
    slotRow.append(createMaterialSlotSurfacePanel(slotEntry, isSurfaceExpanded)),
    slotRow
  )
}

/**
 * 归并行里的其余色块：一行「灯罩与灯组」里前灯罩是白的、尾灯罩是红的、灯组外壳是暗的，
 * 三格各自一格色块，改哪格只写哪格里的材质（不会把尾灯刷成前灯色）。
 */
export function createMaterialSlotVariantList(runtime: StudioAppRuntime, slotVariants: any[]) {
  const variantListElement = domElement(document, 'div', 'material-slot-variants')
  for (const slotVariant of slotVariants) {
    const variantElement = document.createElement('span'),
      variantNameElement = document.createElement('span'),
      variantColorInput = document.createElement('input'),
      variantHexInput = document.createElement('input'),
      variantColor = (slotVariant.overrideColor || slotVariant.color || '#000000').toLowerCase(),
      variantAtlas = Boolean(slotVariant.hasAtlas),
      variantWriteName = slotVariant.name
    ;(variantElement.className = 'material-slot-variant' + (slotVariant.overrideColor ? ' is-overridden' : '')),
      (variantNameElement.className = 'material-slot-variant-name'),
      (variantNameElement.textContent = slotVariant.names?.join(' / ') || variantWriteName),
      (variantNameElement.title =
        (slotVariant.names?.join(' / ') || variantWriteName) + ' · ' + runtime.materialSlotMetaText(slotVariant)),
      (variantColorInput.type = 'color'),
      (variantColorInput.className = 'material-slot-color'),
      (variantColorInput.dataset.materialSlotColor = variantWriteName),
      (variantColorInput.value = variantColor),
      (variantColorInput.disabled = variantAtlas),
      (variantColorInput.title = variantAtlas
        ? '该格颜色来自模型自带图集，不能改色'
        : '点开取色器改这一格的颜色（只会写到这一格里的材质）'),
      (variantHexInput.type = 'text'),
      (variantHexInput.className = 'material-slot-hex'),
      (variantHexInput.dataset.materialSlotHex = variantWriteName),
      (variantHexInput.value = variantColor),
      (variantHexInput.spellcheck = false),
      (variantHexInput.maxLength = 7),
      (variantHexInput.disabled = variantAtlas),
      (variantHexInput.title = variantAtlas ? '该格颜色来自模型自带图集，不能改色' : '直接填十六进制色值'),
      variantElement.append(variantNameElement, variantColorInput, variantHexInput),
      variantListElement.append(variantElement)
  }
  return variantListElement
}
