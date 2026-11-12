import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { itemTypeCatalog, lampItemTypeSet } from '../../items/item-catalog'
import { normalizeLightPropertyValue, formatLightPropertyValue } from '../../lights/studio-app-light-data'

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
    const lightTargetListContainer = document.createElement('div')
    lightTargetListContainer.className = 'light-property-target-grid'
    const lightItemCountsByType = new Map()
    for (const countedLightItem of lightGroupItems)
      lightItemCountsByType.set(countedLightItem.type, (lightItemCountsByType.get(countedLightItem.type) || 0) + 1)
    const lightItemIndexByType = new Map()
    for (const indexedLightItem of lightGroupItems) {
      const downlight6 = (itemTypeCatalog as any)[indexedLightItem.type] || itemTypeCatalog.downlight,
        lightItemTypeIndex = (lightItemIndexByType.get(indexedLightItem.type) || 0) + 1
      lightItemIndexByType.set(indexedLightItem.type, lightItemTypeIndex)
      const lightTargetLabel = document.createElement('label')
      lightTargetLabel.className = 'light-property-target-item'
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
