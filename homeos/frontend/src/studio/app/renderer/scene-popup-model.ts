/** 情景弹窗的数据模型（0.8.4）：分页、默认条目与动作去重键。 */

export const SCENE_POPUP_LAYOUT = Object.freeze({
  width: 420,
  height: 442,
  pageSize: 6,
  maxItems: 80,
})

export function scenePopupEnabled(sceneComponent: any) {
  return sceneComponent?.type === 'scene-mode' && sceneComponent.properties?.popupEnabled === true
}

export function scenePopupActionKey(sceneComponent: any, popupItem: any, scope = '') {
  return JSON.stringify([
    scope,
    sceneComponent.id,
    popupItem.id,
    popupItem.bindings?.entity?.entityId || '',
    popupItem.properties?.controlMode || 'auto',
  ])
}

export function scenePopupItems(sceneComponent: any): any[] {
  const popupItems = sceneComponent?.properties?.popupItems
  return Array.isArray(popupItems)
    ? popupItems
        .filter(
          (popupItem: any) =>
            popupItem &&
            typeof popupItem.id === 'string' &&
            popupItem.id &&
            popupItem.properties &&
            typeof popupItem.properties === 'object',
        )
        .slice(0, SCENE_POPUP_LAYOUT.maxItems)
    : []
}

export function createScenePopupItem(itemId: string) {
  return {
    id: itemId,
    type: 'scene-mode',
    bindings: {},
    properties: {
      label: '',
      controlMode: 'scene',
      activationAnimation: 'spring',
      mainText: '新情景',
      secondaryText: '',
      icon: '',
      mainSize: 17,
      secondarySize: 12,
      iconSize: 28,
      mainSpacing: 0,
      secondarySpacing: 0,
      mainWeight: 0,
      secondaryWeight: 0,
      mainColor: '',
      secondaryColor: '',
      iconColor: '',
      textIdleOpacity: 1,
      textActiveOpacity: 1,
      iconIdleOpacity: 0.85,
      iconActiveOpacity: 1,
    },
  }
}

export function scenePopupTitle(sceneComponent: any) {
  return String(sceneComponent?.properties?.popupTitle || sceneComponent?.properties?.mainText || '情景模式')
}

export function scenePopupPage(sceneComponent: any, pageIndex = 0) {
  const allItems = scenePopupItems(sceneComponent),
    pageCount = Math.max(1, Math.ceil(allItems.length / SCENE_POPUP_LAYOUT.pageSize)),
    page = Math.max(0, Math.min(pageCount - 1, Math.floor(Number(pageIndex) || 0)))
  return {
    all: allItems,
    page,
    pages: pageCount,
    items: allItems.slice(page * SCENE_POPUP_LAYOUT.pageSize, (page + 1) * SCENE_POPUP_LAYOUT.pageSize),
  }
}
