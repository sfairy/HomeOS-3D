import { componentDirectLocation as componentDirectLocation2, findComponentLocation as findComponentLocation2 } from './component-tree'
import { sha256 } from '../bridge/scene'
import { randomUuid } from '../shared/util/random-id'
import { clampNumber } from '../shared/util/number'

/**
 * 仪表盘编辑器画布导航辅助。
 * Zoom 通过 CSS 变量 --sc-canvas-zoom 作用在 #editor-canvas。
 */

function clampEditorZoom(zoom: number): number {
  return Math.min(3, Math.max(0.25, Number(zoom) || 1))
}

export function applyEditorZoomCss(zoom: number, canvasEls: Array<Element | null | undefined>): number {
  const next = clampEditorZoom(zoom)
  document.documentElement.style.setProperty('--sc-canvas-zoom', String(next))
  for (const el of canvasEls) {
    el?.classList?.add('sc-canvas-zoom')
  }
  return next
}

/** 空白拖拽框选矩形（画布坐标，调用方负责与组件 hit-test）。 */
export interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

export function normalizeMarquee(x0: number, y0: number, x1: number, y1: number): MarqueeRect {
  const left = Math.min(x0, x1)
  const top = Math.min(y0, y1)
  return {
    x: left,
    y: top,
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  }
}

export function rectIntersects(
  leftRect: { x: number; y: number; width: number; height: number },
  rightRect: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    leftRect.x < rightRect.x + rightRect.width &&
    leftRect.x + leftRect.width > rightRect.x &&
    leftRect.y < rightRect.y + rightRect.height &&
    leftRect.y + leftRect.height > rightRect.y
  )
}

export function componentLabel(component: any) {
  const typeLabel =
      component.type === 'image'
        ? '图片'
        : component.type === 'time'
          ? '时间'
          : component.type === 'date'
            ? '日期'
            : component.type === 'weather'
              ? '天气'
              : component.type === 'percentage-bar'
                ? '百分比柱状图'
                : component.type === 'line-chart'
                  ? '折线图'
                  : component.type === 'event-log-wall'
                    ? '即时消息墙'
                    : component.type === 'flow-line'
                      ? '流水线条'
                      : component.type === 'panel-frame'
                        ? '底图框'
                        : component.type === 'navigation-button'
                          ? '导航按钮'
                          : component.type === 'scene-mode'
                            ? '情景模式'
                            : component.type === 'title-button'
                              ? '标题按钮'
                              : component.type === 'light-statistics'
                                ? '数量统计'
                                : component.type === 'icon-button'
                                  ? '图标按钮'
                                  : component.type === 'device-button'
                                    ? '设备按钮'
                                    : component.type === 'presence-sensor'
                                      ? '传感器'
                                      : component.type === 'air-conditioner'
                                        ? '空调'
                                        : component.type === 'vacuum-map'
                                          ? '扫地机器人实时地图'
                                          : component.type === 'camera'
                                            ? '摄像头实时预览'
                                            : component.type === 'icon-button-effect'
                                              ? '图标按钮（效果）'
                                              : component.type === 'group'
                                                ? '组合'
                                                : component.type,
    instanceName = component.properties?.instanceName,
    instanceNameMatch =
      component.type === 'light-statistics'
        ? /^(?:灯光统计|开灯统计)(_副本\d*)?$/.exec(String(instanceName || ''))
        : null,
    computedLabel =
      component.type === 'light-statistics' && instanceName === '图片'
        ? typeLabel
        : instanceNameMatch
          ? '' + typeLabel + (instanceNameMatch[1] || '')
          : (component.type === 'vacuum-map' && instanceName === '扫地机地图') ||
              (component.type === 'camera' && instanceName === '摄像头画面')
            ? typeLabel
            : instanceName
  return component.properties?.label || computedLabel || component.properties?.title || typeLabel
}
export function nextTemplateInstanceName(existingComponents: any, candidateName: any) {
  const labelSet = new Set((existingComponents || []).map((mappedComponent: any) => componentLabel(mappedComponent)))
  if (!labelSet.has(candidateName)) return candidateName
  let deduplicatedName = candidateName + '_副本',
    dedupIndex = 2
  for (; labelSet.has(deduplicatedName); ) (deduplicatedName = candidateName + '_副本' + dedupIndex), (dedupIndex += 1)
  return deduplicatedName
}
export function groupNameForCollection(groupComponents: any, baseGroupName = '组合') {
  const groupLabelSet = new Set((groupComponents || []).map((groupComponent: any) => componentLabel(groupComponent)))
  if (!groupLabelSet.has(baseGroupName)) return baseGroupName
  let groupIndex = 2
  for (; groupLabelSet.has(baseGroupName + ' ' + groupIndex); ) groupIndex += 1
  return baseGroupName + ' ' + groupIndex
}
function refreshComponentIds(rootComponent: any, assignedId: any = null) {
  rootComponent.id = assignedId || newId('component')
  for (const childComponent of rootComponent.children || []) refreshComponentIds(childComponent)
  return rootComponent
}
function copiedComponentLabel(sourceComponent: any, siblingComponents: any) {
  const cleanedLabel =
      String(componentLabel(sourceComponent) || '控件')
        .trim()
        .replace(/_副本\d*$/, '') || '控件',
    siblingLabelSet = new Set(
      (siblingComponents || []).map((siblingComponent: any) => String(componentLabel(siblingComponent)).trim()),
    )
  let copiedName = cleanedLabel + '_副本',
    copyIndex = 2
  for (; siblingLabelSet.has(copiedName); ) (copiedName = cleanedLabel + '_副本' + copyIndex), (copyIndex += 1)
  return copiedName
}
export function applyCollectionLayerOrder(orderedComponents: any) {
  for (let componentIndex = 0; componentIndex < (orderedComponents || []).length; componentIndex += 1) {
    const currentComponent = orderedComponents[componentIndex]
    currentComponent.position = {
      ...(currentComponent.position || {}),
      zIndex: orderedComponents.length - componentIndex,
    }
  }
}
export function syncSharedComponentReferenceOrder(dashboardConfig: any) {
  const sharedComponentIds = (dashboardConfig.sharedComponents || []).map((sharedComponent: any) => sharedComponent.id)
  for (const currentPage of dashboardConfig.pages || []) {
    const sharedIdSet = new Set(currentPage.sharedComponentIds || [])
    currentPage.sharedComponentIds = sharedComponentIds.filter((referencedId: any) => sharedIdSet.has(referencedId))
  }
}
export function ensureSharedComponentReference(collectionConfig: any, sharedComponentId: any, pagePath: any) {
  const targetPage = (collectionConfig?.pages || []).find((pageRecord: any) => pageRecord.path === pagePath),
    hasSharedComponent = (collectionConfig?.sharedComponents || []).some(
      (sharedComponentRecord: any) => sharedComponentRecord.id === sharedComponentId,
    )
  if (!targetPage || !hasSharedComponent) return false
  const pageSharedIds = targetPage.sharedComponentIds || []
  return pageSharedIds.includes(sharedComponentId)
    ? false
    : ((targetPage.sharedComponentIds = [
        sharedComponentId,
        ...pageSharedIds.filter((otherSharedId: any) => otherSharedId !== sharedComponentId),
      ]),
      true)
}

/** 所选控件是否可合并为组（同页 / 同侧边栏集合且非 fill 布局）。 */
export function canGroupComponents(componentIdList: any, groupingDocument: any) {
  const componentLocations = [...new Set(componentIdList || [])]
  if (componentLocations.length < 2 || !groupingDocument) return false
  const map = componentLocations.map((componentIdItem) => componentDirectLocation2(groupingDocument, componentIdItem))
  if (map.some((locationEntry) => !locationEntry || locationEntry.component.type === 'group')) return false
  const firstComponentLocation = map[0]
  return map.every(
    (sameScopeLocation) =>
      sameScopeLocation.scope === firstComponentLocation.scope &&
      sameScopeLocation.page?.path === firstComponentLocation.page?.path &&
      sameScopeLocation.collection === firstComponentLocation.collection &&
      sameScopeLocation.component.properties?.layoutMode !== 'fill',
  )
}

/** 复制一个组件（含可选偏移与共享引用顺序修正）。纯函数：文档显式传参。 */
export function duplicateComponent(
  targetDocument: any,
  copiedComponentId: any,
  sourceComponentOverride: any = null,
  offsetDuplicate = false,
) {
  const sourceLocation = findComponentLocation2(targetDocument, copiedComponentId)
  if (!sourceLocation) return null
  const duplicatedComponent = sourceComponentOverride
    ? clone(sourceComponentOverride)
    : refreshComponentIds(clone(sourceLocation.component))
  if (
    ((duplicatedComponent.properties = {
      ...(duplicatedComponent.properties || {}),
      label: copiedComponentLabel(sourceLocation.component, sourceLocation.collection),
    }),
    delete duplicatedComponent.properties.previewState,
    offsetDuplicate)
  ) {
    const duplicateCanvasWidth = Number(targetDocument.canvas?.width || 2778),
      duplicateCanvasHeight = Number(targetDocument.canvas?.height || 1940),
      duplicateWidth = Number(duplicatedComponent.position?.width || 100),
      duplicateHeight = Number(duplicatedComponent.position?.height || 100)
    duplicatedComponent.position = {
      ...(duplicatedComponent.position || {}),
      x: clampNumber(
        Number(duplicatedComponent.position?.x || 0) + 24,
        -duplicateWidth / 2,
        duplicateCanvasWidth - duplicateWidth / 2,
      ),
      y: clampNumber(
        Number(duplicatedComponent.position?.y || 0) + 24,
        -duplicateHeight / 2,
        duplicateCanvasHeight - duplicateHeight / 2,
      ),
    }
  }
  if (
    (sourceLocation.collection.splice(sourceLocation.index, 0, duplicatedComponent),
    applyCollectionLayerOrder(sourceLocation.collection),
    sourceLocation.scope === 'shared' && sourceLocation.root)
  ) {
    for (const duplicatePageEntry of targetDocument.pages || []) {
      const indexOf3 = (duplicatePageEntry.sharedComponentIds || []).indexOf(copiedComponentId)
      indexOf3 >= 0 && duplicatePageEntry.sharedComponentIds.splice(indexOf3, 0, duplicatedComponent.id)
    }
    syncSharedComponentReferenceOrder(targetDocument)
  }
  return duplicatedComponent
}

/** 删除一个组件，并修正图层顺序与共享引用顺序。纯函数：文档显式传参。 */
export function removeComponent(removalDocument: any, removedComponentId: any) {
  const removalLocation = findComponentLocation2(removalDocument, removedComponentId)
  if (!removalLocation) return null
  const [splice] = removalLocation.collection.splice(removalLocation.index, 1)
  if (
    (applyCollectionLayerOrder(removalLocation.collection), removalLocation.scope === 'shared' && removalLocation.root)
  ) {
    for (const removeComponentState of removalDocument.pages || [])
      removeComponentState.sharedComponentIds = (removeComponentState.sharedComponentIds || []).filter(
        (filteredItems: any) => filteredItems !== removedComponentId,
      )
    syncSharedComponentReferenceOrder(removalDocument)
  }
  return splice
}

export function deferHiddenEditorDialogs(dialogElements = document.querySelectorAll('body > dialog.settings-dialog')) {
  for (const dialogElement of dialogElements) {
    if (!(dialogElement instanceof HTMLDialogElement) || dialogElement.dataset.lazyEditorDialog === 'true') continue
    dialogElement.dataset.lazyEditorDialog = 'true'
    const originalShow = dialogElement.show.bind(dialogElement),
      originalShowModal = dialogElement.showModal.bind(dialogElement),
      ensureAttached = () => {
        dialogElement.isConnected || document.body.append(dialogElement)
      }
    ;(dialogElement.show = (...showArguments) => (ensureAttached(), originalShow(...showArguments))),
      (dialogElement.showModal = (...showModalArguments) => (
        ensureAttached(), originalShowModal(...showModalArguments)
      )),
      dialogElement.addEventListener('close', () => {
        window.requestAnimationFrame(() => {
          !dialogElement.open && dialogElement.isConnected && dialogElement.remove()
        })
      }),
      dialogElement.remove()
  }
}
export function installSettingsDialogBackdropGuard() {
  const backdropPointerState = new WeakMap()
  document.addEventListener(
    'pointerdown',
    (pointerDownEvent) => {
      const pointerTarget = pointerDownEvent.target,
        targetDialog = pointerTarget instanceof Element ? pointerTarget.closest('dialog.settings-dialog') : null
      targetDialog && backdropPointerState.set(targetDialog, pointerTarget === targetDialog)
    },
    true,
  ),
    document.addEventListener(
      'click',
      (clickEvent) => {
        const clickedDialog = clickEvent.target
        if (!(clickedDialog instanceof HTMLDialogElement) || !clickedDialog.matches('.settings-dialog')) return
        const pointerStartedOnBackdrop = backdropPointerState.get(clickedDialog)
        backdropPointerState.delete(clickedDialog),
          pointerStartedOnBackdrop === false && (clickEvent.preventDefault(), clickEvent.stopImmediatePropagation())
      },
      true,
    )
}

const selectedProjectStorageKey = 'homeos:editor:selected-project'
export function rememberEditorProject(projectId: any, getSessionStorage = () => globalThis.sessionStorage) {
  try {
    getSessionStorage()?.setItem(selectedProjectStorageKey, projectId)
  } catch {
    /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
  }
}
export function restoredEditorProject(
  projects: any,
  preferredProjectId: any = null,
  readSessionStorage = () => globalThis.sessionStorage,
) {
  if (projects.some((project: any) => project.id === preferredProjectId)) return preferredProjectId
  let storedProjectId: any
  try {
    storedProjectId = readSessionStorage()?.getItem(selectedProjectStorageKey)
  } catch {
    /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
  }
  return projects.find((matchedProject: any) => matchedProject.id === storedProjectId)?.id ?? projects[0]?.id ?? null
}
export function uniquePagePath(pages: any, pageName: any, excludedPath = '') {
  const basePagePath = slugify(pageName),
    existingPathSet = new Set(
      (pages || []).map((page: any) => page.path).filter((pagePath: any) => pagePath !== excludedPath),
    )
  let candidatePath = basePagePath,
    suffixIndex = 2
  for (; existingPathSet.has(candidatePath); ) candidatePath = basePagePath + '-' + suffixIndex++
  return candidatePath
}
export function clonePageWithFreshIds(sourcePage: any, newPageName: any, existingPages: any[] = []) {
  const clonedPage = clone(sourcePage)
  ;(clonedPage.id = newId('page')),
    (clonedPage.name = newPageName),
    (clonedPage.path = uniquePagePath(existingPages, newPageName))
  const assignFreshComponentIds = (components: any) => {
    for (const component of components || [])
      (component.id = newId('component')), assignFreshComponentIds(component.children)
  }
  return (assignFreshComponentIds(clonedPage.components), clonedPage)
}
export function findCustomPopup(editorDocument: any, popupId: any) {
  return (editorDocument?.customPopups || []).find((customPopup: any) => customPopup.id === popupId) || null
}
export function popupModuleTypeLabel(moduleType: any) {
  return (
    (
      {
        light: '灯光',
        climate: '空调 / 浴霸',
        'air-purifier': '空气净化器',
        'water-heater': '热水器',
        'media-player': '媒体',
        'electric-bed': '电动床',
        switch: '开关 / 按钮',
        cover: '窗帘',
        camera: '摄像头',
        'line-chart': '折线图',
        generic: '通用设备',
        'capability-device': '通用设备',
      } as any
    )[moduleType] || '通用设备'
  )
}
const climateDeviceTypes = ['auto', 'air-conditioner', 'bath-heater']
export function normalizedPopupClimateDeviceType(deviceType: any) {
  return climateDeviceTypes.includes(deviceType) ? deviceType : 'auto'
}
export function popupModuleEntityRecommended(entity: any, popupModuleType: any) {
  const entityDomain = entity?.domain || String(entity?.entityId || '').split('.')[0]
  return popupModuleType === 'light'
    ? entityDomain === 'light'
    : popupModuleType === 'climate'
      ? ['climate', 'fan'].includes(entityDomain)
      : popupModuleType === 'air-purifier'
        ? entityDomain === 'fan'
        : popupModuleType === 'water-heater'
          ? entityDomain === 'water_heater'
          : popupModuleType === 'media-player'
            ? entityDomain === 'media_player'
            : popupModuleType === 'electric-bed'
              ? ['number', 'select', 'button', 'switch'].includes(entityDomain)
              : popupModuleType === 'switch'
                ? ['switch', 'input_boolean', 'button'].includes(entityDomain)
                : popupModuleType === 'cover'
                  ? entityDomain === 'cover'
                  : popupModuleType === 'camera'
                    ? entityDomain === 'camera'
                    : popupModuleType === 'line-chart'
                      ? entityDomain === 'sensor'
                      : true
}
export function reorderedPopupModules(
  modules: any,
  draggedModuleId: any,
  targetModuleId: any = null,
  shouldPlaceAfter = false,
) {
  const reorderedModules = [...(modules || [])],
    draggedIndex = reorderedModules.findIndex((module) => module.id === draggedModuleId)
  if (draggedIndex < 0 || draggedModuleId === targetModuleId) return reorderedModules
  const [draggedModule] = reorderedModules.splice(draggedIndex, 1)
  if (!targetModuleId) return (reorderedModules.push(draggedModule), reorderedModules)
  const targetIndex = reorderedModules.findIndex((targetModule) => targetModule.id === targetModuleId)
  return targetIndex < 0
    ? (reorderedModules.splice(draggedIndex, 0, draggedModule), reorderedModules)
    : (reorderedModules.splice(targetIndex + (shouldPlaceAfter ? 1 : 0), 0, draggedModule), reorderedModules)
}
export function popupModuleDropPosition(moduleElement: any, pointerEvent: any) {
  const boundingRect = moduleElement.getBoundingClientRect(),
    pointerOffsetY = pointerEvent.clientY - boundingRect.top,
    edgeThresholdPx = Math.min(48, boundingRect.height * 0.22)
  return pointerOffsetY <= edgeThresholdPx
    ? {
        placeAfter: false,
        edge: 'top',
      }
    : pointerOffsetY >= boundingRect.height - edgeThresholdPx
      ? {
          placeAfter: true,
          edge: 'bottom',
        }
      : pointerEvent.clientX < boundingRect.left + boundingRect.width / 2
        ? {
            placeAfter: false,
            edge: 'left',
          }
        : {
            placeAfter: true,
            edge: 'right',
          }
}
export function greatestCommonDivisor(firstNumber: any, secondNumber: any) {
  let currentDivisor = Math.abs(Math.trunc(firstNumber)),
    currentRemainder = Math.abs(Math.trunc(secondNumber))
  for (; currentRemainder; ) [currentDivisor, currentRemainder] = [currentRemainder, currentDivisor % currentRemainder]
  return currentDivisor || 1
}

const excludedComponentKeySet = new Set(['actions', 'bindings', 'position', 'properties', 'style'])
/** 未保存副本的指纹：文档签名的 SHA-256（十六进制 64 位）。 */
const RECOVERY_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/
/** `saveAttempts` 上限（上游同款：超过 16 条时保留第一条 + 最近 14 条）。 */
const MAX_RECOVERY_SAVE_ATTEMPTS = 16
function recoveryFingerprint(recoveryDocument: any) {
  return sha256(documentSignature(recoveryDocument))
}
export function createRecoveryWriter(
  writeRecoverySnapshot: any,
  { delay: delayMs = 200, setTimer: setTimer = setTimeout, clearTimer: clearTimer = clearTimeout } = {},
) {
  let pendingSnapshot: any = null,
    timeoutId: any = null
  const flushPendingSnapshot = () => {
    timeoutId !== null && clearTimer(timeoutId), (timeoutId = null)
    const flushedSnapshot = pendingSnapshot
    ;(pendingSnapshot = null), flushedSnapshot && writeRecoverySnapshot(flushedSnapshot)
  }
  return {
    schedule(incomingSnapshot: any) {
      pendingSnapshot && pendingSnapshot.projectId !== incomingSnapshot.projectId && flushPendingSnapshot(),
        (pendingSnapshot = incomingSnapshot),
        timeoutId === null && (timeoutId = setTimer(flushPendingSnapshot, delayMs))
    },
    flush: flushPendingSnapshot,
    cancel(projectId: any) {
      !pendingSnapshot ||
        pendingSnapshot.projectId !== projectId ||
        ((pendingSnapshot = null), timeoutId !== null && clearTimer(timeoutId), (timeoutId = null))
    },
  }
}
export function editorComponentEntries(editorDocument: any) {
  const componentById = new Map(),
    orderKeys: any = [],
    collectComponent = (component: any, scope: any, pagePath: any, parentId: any = null) => {
      if (!component?.id) return
      const componentId = String(component.id)
      componentById.set(componentId, {
        component: component,
        scope: scope,
        pagePath: pagePath,
        parentId: parentId,
      }),
        orderKeys.push(scope + ':' + (pagePath || '') + ':' + (parentId || '') + ':' + componentId)
      for (const nestedComponent of component.children || [])
        collectComponent(nestedComponent, scope, pagePath, componentId)
    }
  for (const sharedComponent of editorDocument?.sharedComponents || [])
    collectComponent(sharedComponent, 'shared', '', null)
  for (const page of editorDocument?.pages || [])
    for (const pageComponent of page.components || []) collectComponent(pageComponent, 'page', page.path, null)
  return {
    entries: componentById,
    order: orderKeys,
  }
}
export function editorComponentStructure(sourceComponent: any) {
  const componentStructure: Record<string, unknown> = {}
  for (const [propertyKey, propertyValue] of Object.entries(sourceComponent || {}))
    excludedComponentKeySet.has(propertyKey) ||
      propertyKey === 'children' ||
      (componentStructure[propertyKey] = propertyValue)
  return (
    (componentStructure.children = (sourceComponent?.children || []).map((childComponent: any) => childComponent.id)),
    JSON.stringify(componentStructure)
  )
}
export function editorDocumentFrameSignature(sourceDocument: any) {
  const strippedDocument = {
    ...(sourceDocument || {}),
  }
  return (
    (strippedDocument.sharedComponents = []),
    strippedDocument.pages &&
      (strippedDocument.pages = strippedDocument.pages.map((pageEntry: any) => ({
        ...pageEntry,
        components: [] as any[],
      }))),
    documentSignature(strippedDocument)
  )
}
export function documentSignature(documentToSign: any): any {
  const normalizeAction = (actionConfig: any) => {
      if (!actionConfig || !actionConfig.type || actionConfig.type === 'none') return null
      const actionCopy = {
        ...actionConfig,
      }
      return (
        (!actionCopy.data || !Object.keys(actionCopy.data).length) && delete actionCopy.data,
        actionCopy.type !== 'navigate' && delete actionCopy.target,
        // ``domain`` / ``service`` **不能**剥：签名同时用于「脏判定 + 去重」，
        // 剥掉之后「只改动作域/服务」的编辑与会话开头的签名完全相同，
        // ``projectSummary`` 的 ``if (currentDocument === editHistoryEntry) return`` 会直接早退
        // —— 文档不落、不进 undo、不置脏，切页时静默丢失。
        canonicalizeForSignature(actionCopy)
      )
    },
    canonicalizeForSignature = (rawValue: any, parentKey = ''): any =>
      Array.isArray(rawValue)
        ? rawValue.map((arrayElement) => canonicalizeForSignature(arrayElement))
        : rawValue && typeof rawValue == 'object'
          ? Object.fromEntries(
              parentKey === 'actions'
                ? Object.keys(rawValue)
                    .sort()
                    .flatMap((actionKey) => {
                      const normalizedAction: any = normalizeAction(rawValue[actionKey])
                      return normalizedAction ? [[actionKey, normalizedAction]] : []
                    })
                : Object.keys(rawValue)
                    .sort()
                    .map((entryKey) => [entryKey, canonicalizeForSignature(rawValue[entryKey], entryKey)]),
            )
          : rawValue
  return JSON.stringify(canonicalizeForSignature(documentToSign || null))
}
export function recoveryStorageKey(storagePrefix: any, recoveryProjectId: any) {
  return '' + storagePrefix + recoveryProjectId
}
/**
 * 记录一次「保存尝试」：`{revision, fingerprint}`。
 *
 * 用途：刷新后只剩快照、服务器 revision 已经推进一格时，无法单靠 revision 判断
 * 「这份快照是不是我刚保存过的那份」。指纹能证明「本机这份内容确实已经写进过服务器」，
 * 于是可以安全地转成 `restored`（静默沿用、不再弹冲突），而不是误报冲突吓用户。
 */
export function recordRecoverySaveAttempt(
  saveAttempts: any,
  revision: any,
  recoveryDocument: any,
): Array<{ revision: any; fingerprint: string }> {
  const recordedAttempt = {
      revision: revision,
      fingerprint: recoveryFingerprint(recoveryDocument),
    },
    matchingAttempts = (Array.isArray(saveAttempts) ? saveAttempts.slice(0, 16) : []).filter(
      (attempt: any) => attempt?.revision === revision && RECOVERY_FINGERPRINT_PATTERN.test(attempt.fingerprint),
    )
  if (matchingAttempts.some((attempt: any) => attempt.fingerprint === recordedAttempt.fingerprint))
    return matchingAttempts
  return [
    ...(matchingAttempts.length >= MAX_RECOVERY_SAVE_ATTEMPTS
      ? [matchingAttempts[0], ...matchingAttempts.slice(-14)]
      : matchingAttempts),
    recordedAttempt,
  ]
}
/**
 * 刷新后判定未保存副本的四个状态（0.8.4）：
 *
 * - `discard`：项目/文档对不上，或内容与已保存完全一致 —— 快照没有价值，直接丢掉；
 * - `restore`：revision 与全局弹窗版本都没变 —— 安全恢复；
 * - `restored`：服务器 revision 正好是快照 revision + 1，指纹证明本机内容已保存成功，
 *   只是快照没来得及清理 —— 静默沿用，不再弹「要不要恢复」；
 * - `conflict`：服务器已被别处改过 —— 不允许直接恢复，只允许下载副本或丢弃。
 */
export function resolveUnsavedRecovery(
  recovery: any,
  loadedProject: any,
): { status: 'discard' | 'restore' | 'restored' | 'conflict'; recovery: any } {
  if (
    !recovery?.document ||
    recovery.projectId !== loadedProject?.projectId ||
    recovery.document.projectId !== loadedProject?.document?.projectId
  )
    return { status: 'discard', recovery: null }
  const loadedSignature = documentSignature(loadedProject.document)
  if (documentSignature(recovery.document) === loadedSignature) return { status: 'discard', recovery: null }
  const popupRevisionMatches =
    recovery.globalPopupRevision == null || recovery.globalPopupRevision === loadedProject.globalPopupRevision
  if (recovery.revision === loadedProject.revision && popupRevisionMatches)
    return { status: 'restore', recovery: recovery }
  const candidateAttempts = (Array.isArray(recovery.saveAttempts) ? recovery.saveAttempts.slice(0, 16) : []).filter(
    (attempt: any) =>
      attempt?.revision === recovery.revision &&
      Number.isSafeInteger(attempt.revision) &&
      loadedProject.revision === attempt.revision + 1 &&
      RECOVERY_FINGERPRINT_PATTERN.test(attempt.fingerprint),
  )
  const loadedFingerprint = candidateAttempts.length ? sha256(loadedSignature) : null
  return candidateAttempts.some((attempt: any) => attempt.fingerprint === loadedFingerprint)
    ? {
        status: 'restored',
        recovery: {
          ...recovery,
          revision: loadedProject.revision,
          globalPopupRevision: loadedProject.globalPopupRevision,
          saveAttempts: [],
          // 已保存的那一步不该再出现在撤销栈里（撤回去等于把服务器上的内容改回旧版）。
          undo: (Array.isArray(recovery.undo) ? recovery.undo : []).filter(
            (historyStep: any) => historyStep?.kind !== 'save',
          ),
          redo: [],
        },
      }
    : { status: 'conflict', recovery: recovery }
}

/**
 * 仪表盘编辑器：框选几何 + 多选对齐/分布（纯函数，供 home.ts 调用）。
 */


export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-x' | 'distribute-y'

interface ComponentBounds {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** 视口客户坐标 → 画布文档坐标（考虑 CSS zoom）。 */
export function clientPointToCanvas(
  clientX: number,
  clientY: number,
  canvasEl: HTMLElement,
  documentWidth: number,
  documentHeight: number,
): { x: number; y: number } {
  const rect = canvasEl.getBoundingClientRect()
  const zoom = Number(document.documentElement.style.getPropertyValue('--sc-canvas-zoom')) || 1
  const localX = (clientX - rect.left) / Math.max(zoom, 0.01)
  const localY = (clientY - rect.top) / Math.max(zoom, 0.01)
  const scaleX = documentWidth / Math.max(rect.width / Math.max(zoom, 0.01), 1)
  const scaleY = documentHeight / Math.max(rect.height / Math.max(zoom, 0.01), 1)
  return { x: localX * scaleX, y: localY * scaleY }
}

export function pickComponentsInMarquee(components: ComponentBounds[], marquee: MarqueeRect): string[] {
  return components
    .filter((component) =>
      rectIntersects(marquee, {
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height,
      }),
    )
    .map((component) => component.id)
}

export function computeAlignedPositions(
  components: ComponentBounds[],
  mode: AlignMode,
): Array<{ id: string; x: number; y: number }> {
  if (components.length < 2) return []
  const minX = Math.min(...components.map((component) => component.x))
  const maxX = Math.max(...components.map((component) => component.x + component.width))
  const minY = Math.min(...components.map((component) => component.y))
  const maxY = Math.max(...components.map((component) => component.y + component.height))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  if (mode === 'distribute-x') {
    const sorted = [...components].sort((left, right) => left.x - right.x)
    if (sorted.length < 3) return []
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last.x + last.width - first.x
    const totalWidth = sorted.reduce((sum, component) => sum + component.width, 0)
    const gap = (span - totalWidth) / (sorted.length - 1)
    let cursor = first.x
    return sorted.map((component, index) => {
      if (index === 0) {
        cursor = component.x + component.width + gap
        return { id: component.id, x: component.x, y: component.y }
      }
      if (index === sorted.length - 1) return { id: component.id, x: component.x, y: component.y }
      const x = cursor
      cursor = x + component.width + gap
      return { id: component.id, x, y: component.y }
    })
  }

  if (mode === 'distribute-y') {
    const sorted = [...components].sort((left, right) => left.y - right.y)
    if (sorted.length < 3) return []
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last.y + last.height - first.y
    const totalHeight = sorted.reduce((sum, component) => sum + component.height, 0)
    const gap = (span - totalHeight) / (sorted.length - 1)
    let cursor = first.y
    return sorted.map((component, index) => {
      if (index === 0) {
        cursor = component.y + component.height + gap
        return { id: component.id, x: component.x, y: component.y }
      }
      if (index === sorted.length - 1) return { id: component.id, x: component.x, y: component.y }
      const y = cursor
      cursor = y + component.height + gap
      return { id: component.id, x: component.x, y }
    })
  }

  return components.map((component) => {
    switch (mode) {
      case 'left':
        return { id: component.id, x: minX, y: component.y }
      case 'right':
        return { id: component.id, x: maxX - component.width, y: component.y }
      case 'center':
        return { id: component.id, x: centerX - component.width / 2, y: component.y }
      case 'top':
        return { id: component.id, x: component.x, y: minY }
      case 'bottom':
        return { id: component.id, x: component.x, y: maxY - component.height }
      case 'middle':
        return { id: component.id, x: component.x, y: centerY - component.height / 2 }
      default:
        return { id: component.id, x: component.x, y: component.y }
    }
  })
}

/** 控件旋转后的轴对齐包围盒（画布坐标）。 */
export function componentBounds(boundsComponent: any) {
  const boundsPosition = boundsComponent.position || {},
    boundsWidth = Math.max(0.01, Number(boundsPosition.width || 100)),
    boundsHeight = Math.max(0.01, Number(boundsPosition.height || 100)),
    boundsScale = Math.max(0.01, Math.min(5, Number(boundsComponent.style?.scale || 1))),
    boundsRotationRad = (Number(boundsPosition.rotation || 0) * Math.PI) / 180,
    boundsHalfWidth =
      (Math.abs(Math.cos(boundsRotationRad)) * boundsWidth * boundsScale +
        Math.abs(Math.sin(boundsRotationRad)) * boundsHeight * boundsScale) /
      2,
    boundsHalfHeight =
      (Math.abs(Math.sin(boundsRotationRad)) * boundsWidth * boundsScale +
        Math.abs(Math.cos(boundsRotationRad)) * boundsHeight * boundsScale) /
      2,
    boundsCenterX = Number(boundsPosition.x || 0) + boundsWidth / 2,
    boundsCenterY = Number(boundsPosition.y || 0) + boundsHeight / 2
  return {
    left: boundsCenterX - boundsHalfWidth,
    top: boundsCenterY - boundsHalfHeight,
    right: boundsCenterX + boundsHalfWidth,
    bottom: boundsCenterY + boundsHalfHeight,
  }
}


export { clampNumber }
export function clone(sourceValue: any) {
  return structuredClone(sourceValue)
}
export function newId(idPrefix: any) {
  return idPrefix + '-' + randomUuid()
}
export function slugify(sourceText: any) {
  return (
    String(sourceText || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'page-' + randomUuid().slice(0, 8)
  )
}
export function normalizedHexColor(colorInput: any) {
  const trimmedColor = String(colorInput || '').trim(),
    hashPrefixedColor = trimmedColor.startsWith('#') ? trimmedColor : '#' + trimmedColor
  return /^#[\da-f]{6}$/i.test(hashPrefixedColor)
    ? hashPrefixedColor.toLowerCase()
    : /^#[\da-f]{3}$/i.test(hashPrefixedColor)
      ? ('#' + [...hashPrefixedColor.slice(1)].map((hexDigit) => hexDigit.repeat(2)).join('')).toLowerCase()
      : ''
}
export function rgbToHex(redChannel: any, greenChannel: any, blueChannel: any) {
  const channelToHex = (channelNumber: any) =>
    Math.round(clampNumber(Number(channelNumber) || 0, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return '#' + channelToHex(redChannel) + channelToHex(greenChannel) + channelToHex(blueChannel)
}
export function rgbToHsv({ r: redComponent, g: greenComponent, b: blueComponent }: any) {
  const normalizedRed = redComponent / 255,
    normalizedGreen = greenComponent / 255,
    normalizedBlue = blueComponent / 255,
    maxChannel = Math.max(normalizedRed, normalizedGreen, normalizedBlue),
    minChannel = Math.min(normalizedRed, normalizedGreen, normalizedBlue),
    channelRange = maxChannel - minChannel
  let hueDeg = 0
  return (
    channelRange &&
      (maxChannel === normalizedRed
        ? (hueDeg = 60 * (((normalizedGreen - normalizedBlue) / channelRange) % 6))
        : maxChannel === normalizedGreen
          ? (hueDeg = 60 * ((normalizedBlue - normalizedRed) / channelRange + 2))
          : (hueDeg = 60 * ((normalizedRed - normalizedGreen) / channelRange + 4))),
    hueDeg < 0 && (hueDeg += 360),
    {
      h: hueDeg,
      s: maxChannel ? channelRange / maxChannel : 0,
      v: maxChannel,
    }
  )
}
/**
 * HSV → RGB 0–255 分量（色相为角度，饱和度/明度为 0–1）。
 *
 * 与 `@/shared/entity/utils/control/light-control-core` 的 `hsvToRgb` **不是**同一口径：
 * 那边收的是 HA 的 `hs_color`（饱和度按百分比），返回 0–1 分量；这边收 0–1 饱和度并直接给
 * 0–255 通道。两者此前同名，取色盘与弹窗各用一份、极易串用，故此处按量纲改名。
 */
export function hsvToRgb255(hueInput: any, saturationInput: any, brightnessInput: any) {
  const normalizedHue = ((Number(hueInput) % 360) + 360) % 360,
    saturationRatio = clampNumber(Number(saturationInput), 0, 1),
    brightnessRatio = clampNumber(Number(brightnessInput), 0, 1),
    chroma = brightnessRatio * saturationRatio,
    hueSector = normalizedHue / 60,
    intermediateChannel = chroma * (1 - Math.abs((hueSector % 2) - 1)),
    baseRgbComponents =
      hueSector < 1
        ? [chroma, intermediateChannel, 0]
        : hueSector < 2
          ? [intermediateChannel, chroma, 0]
          : hueSector < 3
            ? [0, chroma, intermediateChannel]
            : hueSector < 4
              ? [0, intermediateChannel, chroma]
              : hueSector < 5
                ? [intermediateChannel, 0, chroma]
                : [chroma, 0, intermediateChannel],
    brightnessOffset = brightnessRatio - chroma
  return {
    r: (baseRgbComponents[0] + brightnessOffset) * 255,
    g: (baseRgbComponents[1] + brightnessOffset) * 255,
    b: (baseRgbComponents[2] + brightnessOffset) * 255,
  }
}
export function roundField(numericField: any) {
  return Number.isFinite(numericField) ? String(Math.round(numericField * 100) / 100) : '0'
}
export function visibilityIconSvg(visibilityIconVisible: any) {
  return visibilityIconVisible
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M2.5 12s3.5-6 9.5-6c2 0 3.7.7 5.1 1.6M21.5 12s-3.5 6-9.5 6c-2 0-3.7-.7-5.1-1.6"/></svg>'
}

export function normalizedFontWeight(fontWeightInput: any, fallbackWeight = 0.4) {
  const numericWeight = Number(fontWeightInput)
  return Number.isFinite(numericWeight)
    ? numericWeight > 1
      ? clampNumber((numericWeight - 1) / 899, 0, 1)
      : clampNumber(numericWeight, 0, 1)
    : fallbackWeight
}
