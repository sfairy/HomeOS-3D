import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { isCourtyardPlanItem as isCourtyardPlanItem2 } from '../../../plan/courtyard-plan'
import { isCourtyardGate as isCourtyardGate2 } from '../../../plan/courtyard-drawing'
import { isCourtyardDrawing as isCourtyardDrawing2 } from '../../../loaders/studio-normalization'
import { lampItemTypeSet } from '../../items/item-catalog'
import { classifyLightingScope } from '../ui/lighting-scope'
import { itemPreviewScope, selectionPreviewScope } from '../../scene/studio-preview-scope'
import type { PreviewScopeOptions } from '../../scene/studio-preview-scope'

export function createSelectionRef(runtime: StudioAppRuntime, selectionKind: any, selectionId: any) {
  return (
    (runtime.appCtx.selectedItem?.kind === selectionKind && runtime.appCtx.selectedItem.id === selectionId) ||
    runtime.appCtx.selectedItems.some(
      (selectionCandidate: any) => selectionCandidate.kind === selectionKind && selectionCandidate.id === selectionId,
    )
  )
}

export function refreshSelection(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.selectedItem = null), (runtime.appCtx.selectedItems = [])
}

export function isPlanItemVisible(runtime: StudioAppRuntime, planItemRef: any) {
  return runtime.appCtx.activeLibraryCategory === 'courtyard'
    ? isCourtyardPlanItem2(planItemRef)
    : lampItemTypeSet.has(planItemRef.type) === (runtime.appCtx.activeLibraryCategory === 'light')
}

export function isSelectionAllowed(runtime: StudioAppRuntime, selectionObject: any) {
  return selectionObject
    ? selectionObject.kind === 'item'
      ? runtime.isPlanItemVisible(
          runtime.appCtx.studioState.items.find((itemLookupMatch) => itemLookupMatch.id === selectionObject.id) || {},
        )
      : !['courtyard', 'light'].includes(runtime.appCtx.activeLibraryCategory)
    : false
}

export function selectSceneObject(runtime: StudioAppRuntime, objectKind: any, objectId: any) {
  ;(runtime.appCtx.selectedItem =
    objectKind && objectId
      ? {
          kind: objectKind,
          id: objectId,
        }
      : null),
    (runtime.appCtx.selectedItems = [])
}

export function getDefaultSelectionScope(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioState.walls?.length >= 3 && runtime.closedWallLoops(runtime.getPixelsPerMeter()).length
    ? 'items'
    : 'all'
}

/**
 * 预览作用域的注入项：判定函数本身住在纯模块 `studio-preview-scope` 里，这里只负责把
 * 「灯类集合 / 庭院判定 / 庭院作用域」这些运行时依赖喂进去。
 */
export function previewScopeOptions(runtime: StudioAppRuntime): PreviewScopeOptions {
  return {
    lightTypes: lampItemTypeSet,
    courtyardScope: () => runtime.getDefaultSelectionScope(),
    isCourtyardItem: (scopeItem) => Boolean(isCourtyardDrawing2(scopeItem) || isCourtyardGate2(scopeItem)),
  }
}

export function resolvePreviewScope(runtime: StudioAppRuntime, scopeItem: any) {
  return itemPreviewScope(scopeItem, previewScopeOptions(runtime))
}

export function classifySelectionScope(runtime: StudioAppRuntime, selectionList: any) {
  return selectionPreviewScope(selectionList, runtime.appCtx.studioState.items, previewScopeOptions(runtime)) ?? 'all'
}

export function getCurrentPreviewScope(runtime: StudioAppRuntime) {
  return runtime.classifySelectionScope(
    runtime.appCtx.selectedItems.length
      ? runtime.appCtx.selectedItems
      : runtime.appCtx.selectedItem
        ? [runtime.appCtx.selectedItem]
        : [],
  )
}

export function getPreviewScopeSelection(runtime: StudioAppRuntime) {
  return classifyLightingScope(
    runtime.appCtx,
    runtime.appCtx.selectedItems.length
      ? runtime.appCtx.selectedItems
      : runtime.appCtx.selectedItem
        ? [runtime.appCtx.selectedItem]
        : [],
  )
}

export function setPreviewScope(runtime: StudioAppRuntime, scopeRequest: any) {
  const defaultScope = runtime.getPreviewScopeSelection(),
    previewScopeSet = new Set([scopeRequest, defaultScope].filter(Boolean))
  if (previewScopeSet.size) {
    if (previewScopeSet.has('all')) {
      runtime.requestSceneRebuild({
        scope: 'all',
        preserveLightCache: true,
      })
      return
    }
    for (const previewScopeEntry of previewScopeSet)
      runtime.requestSceneRebuild({
        scope: previewScopeEntry,
        preserveLightCache: true,
      })
  }
}
