/** 3D 场景圆形按钮的两个基础度量：默认边长与图标占比。 */

/** 按钮未配置 size 时的默认边长（px）。 */
export const DEFAULT_BUTTON_SIZE = 60

/** 圆形按钮里 mdi 图标的相对大小（图标边长 / 按钮边长）。 */
const BUTTON_ICON_SIZE_RATIO = 0.6

export function buttonIconSize(buttonSize: any) {
  const numericSize = Number(buttonSize),
    resolvedSize = Number.isFinite(numericSize) && numericSize > 0 ? numericSize : DEFAULT_BUTTON_SIZE
  return Math.max(1, Math.round(resolvedSize * BUTTON_ICON_SIZE_RATIO * 100) / 100)
}

const ratioByBoard = new Map()
export function cameraPreviewRatio(boardId: any, ratio: any = undefined) {
  return (Number.isFinite(ratio) && ratio > 0 && ratioByBoard.set(boardId, ratio), ratioByBoard.get(boardId) || 16 / 9)
}
export function cameraPopupLayout(boardWidth: any, boardHeight: any, previewRatio = 16 / 9, chromeHeight = 58) {
  const maxPanelWidth = Math.max(1, (boardHeight - 24) / 2 - 26 - chromeHeight),
    panelWidth = Math.max(
      27,
      Math.min(Math.max(300, boardWidth * 0.3), (boardWidth - 32) / 2, maxPanelWidth * previewRatio + 26),
    ),
    mediaHeight = (panelWidth - 26) / previewRatio,
    panelHeight = 26 + chromeHeight + mediaHeight,
    topOffset = Math.max(12, Math.min(boardHeight * 0.56 - panelHeight, boardHeight - panelHeight * 2 - 12))
  return {
    panelWidth: panelWidth,
    mediaHeight: mediaHeight,
    panelHeight: panelHeight,
    top: topOffset,
  }
}

/** 3D 场景里「文字类卡片」的统一字号（舞台设计 px）。 */
export const CARD_TEXT_SIZE_PX = 21

const layoutStateByCanvas = new WeakMap(),
  ANIMATION_MS_PER_UNIT = 580,
  BASE_DISTANCE_PX = 24,
  EXCLUDED_CONTENT_SELECTOR = '.hb-interaction3d-host, iframe, video, audio, object, embed',
  TRACKED_STYLE_PROPS = ['translate', 'opacity', 'transition', 'willChange', 'pointerEvents']
function getSharedComponentIds(layoutClient: any) {
  return (
    (
      layoutClient.context.document?.pages?.find(
        (resolvedPage: any) => resolvedPage.id === layoutClient.context.page?.id,
      ) || layoutClient.context.page
    )?.sharedComponentIds || []
  )
}
function easeProgress(progress: any) {
  let curveParam = progress
  for (let iterationIndex = 0; iterationIndex < 8; iterationIndex++)
    curveParam = Math.max(
      0,
      Math.min(
        1,
        curveParam -
          (0.6 * curveParam - 0.6 * curveParam * curveParam + curveParam * curveParam * curveParam - progress) /
            (0.6 - 1.2 * curveParam + 3 * curveParam * curveParam),
      ),
    )
  return curveParam * curveParam * (3 - 2 * curveParam)
}
function parseTranslateValue(translateValue: any) {
  return !translateValue || translateValue === 'none'
    ? ['0px', '0px']
    : translateValue.match(/(?:calc\([^)]*\)|[^\s])+/g) || ['0px', '0px']
}
const FOCUSABLE_SELECTOR =
    'a[href], area[href], button, input, select, textarea, [tabindex], [contenteditable], summary',
  GUARD_EVENT_TYPES = ['pointerdown', 'click', 'dblclick', 'contextmenu', 'keydown', 'focusin']
function suspendTabStops(subtreeRootElement: any, memberState: any) {
  const tabbableElements = [subtreeRootElement, ...subtreeRootElement.querySelectorAll(FOCUSABLE_SELECTOR)]
  for (const tabbableElement of tabbableElements)
    tabbableElement.tabIndex >= 0 &&
      !memberState.tabStops.has(tabbableElement) &&
      (memberState.tabStops.set(tabbableElement, tabbableElement.getAttribute('tabindex')),
      tabbableElement.setAttribute('tabindex', '-1'))
}
function applyHiddenState(memberElement: any, memberRecordElement: any, isHidden: any) {
  if (memberRecordElement.hidden === isHidden) return
  if (((memberRecordElement.hidden = isHidden), isHidden))
    suspendTabStops(memberElement, memberRecordElement),
      memberElement.contains(memberElement.ownerDocument.activeElement) &&
        memberElement.ownerDocument.activeElement.blur(),
      (memberElement.style.pointerEvents = 'none')
  else {
    for (const [tabStopElement, previousTabIndex] of memberRecordElement.tabStops)
      previousTabIndex === null
        ? tabStopElement.removeAttribute('tabindex')
        : tabStopElement.setAttribute('tabindex', previousTabIndex)
    memberRecordElement.tabStops.clear(), (memberElement.style.pointerEvents = memberRecordElement.style.pointerEvents)
  }
  const ariaHiddenValue = isHidden ? 'true' : memberRecordElement.ariaHidden
  memberElement.getAttribute('aria-hidden') !== ariaHiddenValue &&
    (ariaHiddenValue === null
      ? memberElement.removeAttribute('aria-hidden')
      : memberElement.setAttribute('aria-hidden', ariaHiddenValue))
}
/**
 * 聚焦位移的距离换算：把位移折算回宿主 `zoom` **之前**的坐标系。
 *
 * 宿主可能带 CSS `zoom`（标题 / 统计 / 天气的放大清晰度方案）。`zoom` 会一起缩放
 * `style.translate` 的长度基准，不折算就会按 zoom 倍多走，聚焦落点偏出组件。
 * 抽成纯函数是为了让这条换算能被单测钉住 —— 它错了只表现为「聚焦时位置有点偏」，
 * 光靠人眼和截图很难在回归时发现。
 */
export function focusTranslationDistance(
  distance: number,
  amount: number,
  zoomText: string | null | undefined,
): number {
  const hostZoom = Math.max(0.01, Number.parseFloat(zoomText || '') || 1)
  return (distance * amount) / hostZoom
}
function applyMemberMotion(layoutState: any, motionElement: any, memberSnapshot: any, amount: any) {
  const [translateX, translateY = '0px', translateZ] = memberSnapshot.translate
  ;(motionElement.style.translate =
    'calc(' +
    translateX +
    ' - ' +
    focusTranslationDistance(layoutState.distance, amount, motionElement.style.zoom) +
    'px) ' +
    translateY +
    (translateZ ? ' ' + translateZ : '')),
    (motionElement.style.opacity = String(memberSnapshot.opacity * (1 - amount))),
    applyHiddenState(
      motionElement,
      memberSnapshot,
      amount > 0 || (layoutState.owners.size > 0 && layoutState.targets.has(motionElement)),
    )
}
function detachMember(layout: any, detachedElement: any, detachedMemberState: any) {
  for (const styleProperty of TRACKED_STYLE_PROPS)
    detachedElement.style[styleProperty] = detachedMemberState.style[styleProperty]
  applyHiddenState(detachedElement, detachedMemberState, false),
    layout.members.delete(detachedElement),
    layout.targets.delete(detachedElement)
}
function cancelMotionFrame(frameOwner: any) {
  frameOwner.frame !== null && frameOwner.view.cancelAnimationFrame(frameOwner.frame), (frameOwner.frame = null)
}
function renderMembers(renderingLayout: any) {
  for (const renderedElement of renderingLayout.targets) {
    const renderedMemberState = renderingLayout.members.get(renderedElement)
    renderedMemberState &&
      applyMemberMotion(renderingLayout, renderedElement, renderedMemberState, renderingLayout.amount)
  }
}
function animateAmount(animatingLayout: any, targetAmount: any, shouldAnimate = true) {
  if (
    animatingLayout.to === targetAmount &&
    ((shouldAnimate && animatingLayout.frame !== null) || animatingLayout.amount === targetAmount)
  ) {
    renderMembers(animatingLayout)
    return
  }
  cancelMotionFrame(animatingLayout)
  const fromAmount = animatingLayout.amount
  if (
    ((animatingLayout.to = targetAmount),
    !shouldAnimate || animatingLayout.view.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  ) {
    ;(animatingLayout.amount = targetAmount), renderMembers(animatingLayout)
    return
  }
  const startTimeMs = animatingLayout.view.performance.now(),
    durationMs = ANIMATION_MS_PER_UNIT * Math.abs(targetAmount - fromAmount),
    advanceMotion = (timestampMs: any) => {
      animatingLayout.frame = null
      const elapsedFraction = durationMs ? Math.max(0, Math.min(1, (timestampMs - startTimeMs) / durationMs)) : 1
      ;(animatingLayout.amount = fromAmount + (targetAmount - fromAmount) * easeProgress(elapsedFraction)),
        renderMembers(animatingLayout),
        elapsedFraction < 1 && (animatingLayout.frame = animatingLayout.view.requestAnimationFrame(advanceMotion))
    }
  animatingLayout.frame = animatingLayout.view.requestAnimationFrame(advanceMotion)
}
function updateLayout(canvasLayout: any) {
  const clientRegistrations = [...canvasLayout.clients],
    clientComponentIdSet = new Set(clientRegistrations.flatMap(getSharedComponentIds)),
    ownerComponentIdSet = new Set([...canvasLayout.owners].flatMap(getSharedComponentIds)),
    componentElements = [...canvasLayout.canvas.children].filter((canvasChildElement) => {
      const componentId =
        canvasChildElement.dataset?.componentId ||
        canvasChildElement.dataset?.effectFor ||
        canvasChildElement.dataset?.airflowFor
      return (
        clientComponentIdSet.has(componentId) &&
        !clientRegistrations.some((clientEntry) => canvasChildElement.contains(clientEntry.root)) &&
        !canvasChildElement.matches?.(EXCLUDED_CONTENT_SELECTOR) &&
        !canvasChildElement.querySelector?.(EXCLUDED_CONTENT_SELECTOR)
      )
    }),
    componentElementSet = new Set(componentElements)
  for (const [trackedElement, trackedMemberState] of canvasLayout.members)
    componentElementSet.has(trackedElement) || detachMember(canvasLayout, trackedElement, trackedMemberState)
  const canvasRect = canvasLayout.canvas.getBoundingClientRect(),
    canvasScale = canvasRect.width / canvasLayout.canvas.clientWidth || 1
  let distancePx = BASE_DISTANCE_PX
  for (const childElement of componentElements) {
    let childMemberState = canvasLayout.members.get(childElement)
    const childRect = childElement.getBoundingClientRect()
    if (
      ((distancePx = Math.max(
        distancePx,
        (childRect.right - canvasRect.left) / canvasScale +
          BASE_DISTANCE_PX +
          (childMemberState && canvasLayout.targets.has(childElement)
            ? canvasLayout.distance * canvasLayout.amount
            : 0),
      )),
      !childMemberState)
    ) {
      const computedStyle = canvasLayout.view.getComputedStyle(childElement)
      ;(childMemberState = {
        style: Object.fromEntries(
          TRACKED_STYLE_PROPS.map((trackedProperty) => [trackedProperty, childElement.style[trackedProperty] || '']),
        ),
        opacity: Number(computedStyle.opacity),
        translate: parseTranslateValue(computedStyle.translate),
        hidden: false,
        tabStops: new Map(),
        ariaHidden: childElement.getAttribute('aria-hidden'),
      }),
        canvasLayout.members.set(childElement, childMemberState),
        (childElement.style.transition = 'none'),
        (childElement.style.willChange = [childMemberState.style.willChange, 'opacity', 'translate']
          .filter((styleValue) => styleValue && styleValue !== 'auto')
          .join(',')),
        applyMemberMotion(canvasLayout, childElement, childMemberState, 0)
    }
  }
  if (((canvasLayout.distance = distancePx), canvasLayout.owners.size)) {
    const newTargetSet = new Set(
      componentElements.filter((ownerComponentElement) =>
        ownerComponentIdSet.has(
          ownerComponentElement.dataset.componentId ||
            ownerComponentElement.dataset.effectFor ||
            ownerComponentElement.dataset.airflowFor,
        ),
      ),
    )
    for (const staleTarget of canvasLayout.targets)
      !newTargetSet.has(staleTarget) &&
        canvasLayout.members.has(staleTarget) &&
        (canvasLayout.targets.delete(staleTarget),
        applyMemberMotion(canvasLayout, staleTarget, canvasLayout.members.get(staleTarget), 0))
    canvasLayout.targets = newTargetSet
  }
  renderMembers(canvasLayout)
}
function releaseLayout(releasedLayout: any, clientRegistration: any) {
  if (
    (releasedLayout.owners.delete(clientRegistration),
    releasedLayout.clients.delete(clientRegistration),
    releasedLayout.clients.size)
  )
    updateLayout(releasedLayout), animateAmount(releasedLayout, releasedLayout.owners.size ? 1 : 0, false)
  else {
    cancelMotionFrame(releasedLayout), releasedLayout.observer.disconnect()
    for (const eventName of GUARD_EVENT_TYPES)
      releasedLayout.canvas.removeEventListener(eventName, releasedLayout.guard, true)
    for (const [releasedElement, releasedMemberState] of releasedLayout.members)
      detachMember(releasedLayout, releasedElement, releasedMemberState)
    layoutStateByCanvas.get(releasedLayout.canvas) === releasedLayout &&
      layoutStateByCanvas.delete(releasedLayout.canvas)
  }
}
export function createInteraction3dFocusLayout(rootElement: any, focusOptions: { editable?: boolean } = {}) {
  const registration = {
    root: rootElement,
    context: focusOptions,
  }
  let activeLayout: any = null,
    isActive = false,
    isDisposed = false
  const refreshLayout = () => {
    if (isDisposed || focusOptions.editable) return
    const canvasElement = rootElement.closest('.hb-renderer-canvas')
    if (activeLayout?.canvas !== canvasElement) {
      if ((activeLayout && releaseLayout(activeLayout, registration), (activeLayout = null), !canvasElement)) return
      if (((activeLayout = layoutStateByCanvas.get(canvasElement)), !activeLayout)) {
        const canvasView = canvasElement.ownerDocument.defaultView
        activeLayout = {
          canvas: canvasElement,
          view: canvasView,
          clients: new Set(),
          owners: new Set(),
          members: new Map(),
          targets: new Set(),
          frame: null as any,
          amount: 0,
          to: 0,
          distance: BASE_DISTANCE_PX,
        }
        const capturedLayout = activeLayout
        activeLayout.guard = (event: any) => {
          for (const [blockedElement, blockingMemberStateElement] of capturedLayout.members)
            if (blockingMemberStateElement.hidden && blockedElement.contains(event.target)) {
              event.preventDefault(), event.stopImmediatePropagation(), event.type === 'focusin' && event.target.blur()
              return
            }
        }
        for (const eventType of GUARD_EVENT_TYPES) canvasElement.addEventListener(eventType, activeLayout.guard, true)
        ;(activeLayout.observer = new canvasView.MutationObserver((mutationRecords: any) => {
          mutationRecords.some((mutationRecord: any) => mutationRecord.target === canvasElement) &&
            updateLayout(capturedLayout)
          for (const [hiddenElement, hiddenMemberStateElement] of capturedLayout.members)
            hiddenMemberStateElement.hidden && suspendTabStops(hiddenElement, hiddenMemberStateElement)
        })),
          activeLayout.observer.observe(canvasElement, {
            childList: true,
            subtree: true,
          }),
          layoutStateByCanvas.set(canvasElement, activeLayout)
      }
      activeLayout.clients.add(registration)
    }
    activeLayout &&
      (isActive ? activeLayout.owners.add(registration) : activeLayout.owners.delete(registration),
      updateLayout(activeLayout),
      animateAmount(activeLayout, activeLayout.owners.size ? 1 : 0))
  }
  return {
    refresh: refreshLayout,
    setActive(shouldActivate: any) {
      isDisposed || focusOptions.editable || ((isActive = shouldActivate === true), refreshLayout())
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true), activeLayout && releaseLayout(activeLayout, registration), (activeLayout = null))
    },
  }
}

/**
 * 灯光 3D 光效策略（0.8.5：标准光影模式支持逐灯自定义）。
 *
 * 两种模式共用同一份渲染管线，差别只在「光效参数从哪来」：
 *
 * - 轻量柔光（``region``）：所有灯一律用固定范围 / 默认值，由区域光照接管；
 * - 标准光影（``standard``）：未开启自定义的灯仍用固定值，开启后改用
 *   ``standardLightEffects`` 里的范围、默认值与色温兜底。
 *
 * 未开启自定义时必须与旧行为逐字节一致，否则老组件的画面会整体跳亮度。
 */

/** 固定范围（轻量柔光与未自定义的标准光影共用）。 */
const LIGHT_EFFECT_RANGE = Object.freeze({
  brightnessMin: 50,
  brightnessMax: 150,
  temperatureMin: 2700,
  temperatureMax: 6500,
})

/** 固定默认值（同上）。 */
export const LIGHT_EFFECT_DEFAULTS = Object.freeze({
  brightness: 150,
  kelvin: 3500,
})

export function withFixedLightEffects(settings: any) {
  return {
    ...settings,
    effectRange: {
      ...LIGHT_EFFECT_RANGE,
    },
    effectDefaults: {
      ...LIGHT_EFFECT_DEFAULTS,
    },
  }
}

/** 光效范围的四个键（部分缺省时回落固定值）。 */
interface LightEffectRangeSource {
  brightnessMin?: number
  brightnessMax?: number
  temperatureMin?: number
  temperatureMax?: number
}

/** 默认光效的两个键（部分缺省时回落固定值）。 */
interface LightEffectDefaultsSource {
  brightness?: number
  kelvin?: number
}

/** 读物：灯卡片 / 舞台共用的最小字段集。 */
interface LightEffectSource {
  effectRange?: LightEffectRangeSource
  effectDefaults?: LightEffectDefaultsSource
  temperatureFallback?: string
  standardLightEffects?: {
    enabled?: boolean
    effectRange?: LightEffectRangeSource
    effectDefaults?: LightEffectDefaultsSource
    temperatureFallback?: string
  }
}

/**
 * 逐灯自定义光效的编辑草稿：缺省键一律回落固定值。
 *
 * ``temperatureFallback`` 兼容 0.8.4 的旧字段：没有 ``standardLightEffects`` 时
 * 沿用灯上的顶层 ``temperatureFallback``，避免升级后已选「跟随户型」的灯被重置。
 */
export function standardLightEffectsDraft(item: LightEffectSource | null | undefined) {
  const effects = item?.standardLightEffects,
    temperatureFallback =
      effects?.temperatureFallback === 'floorplan' || (!effects && item?.temperatureFallback === 'floorplan')
        ? 'floorplan'
        : 'default'
  return {
    enabled: effects?.enabled === true,
    effectRange: { ...LIGHT_EFFECT_RANGE, ...effects?.effectRange },
    effectDefaults: { ...LIGHT_EFFECT_DEFAULTS, ...effects?.effectDefaults },
    temperatureFallback,
  }
}

/**
 * 把逐灯自定义光效折算成渲染参数。
 *
 * ``lightingMode`` 由调用方归一（``region`` / ``standard``）；非标准光影或未开启自定义
 * 时直接返回固定值，调用点因此可以无条件替换原来的 :func:`withFixedLightEffects`。
 */
export function withInteractionLightEffects(
  item: (LightEffectSource & Record<string, unknown>) | null | undefined,
  lightingMode: string,
) {
  const fixed = withFixedLightEffects(item)
  if (lightingMode !== 'standard' || item?.standardLightEffects?.enabled !== true) return fixed
  const draft = standardLightEffectsDraft(item)
  return {
    ...fixed,
    effectRange: draft.effectRange,
    effectDefaults: draft.effectDefaults,
    temperatureFallback: draft.temperatureFallback,
  }
}

/**
 * 媒体设备（电视 / 投影仪）共用的身份表。
 *
 * 两者在配置、控制、弹窗、状态灯上的流程几乎一致，差异只有三点：归属分类名、
 * 模型类型名，以及**有没有屏幕图层**。投影仪没有屏幕，所以带 `screenImage` 的
 * 配置必须被拒绝（后端同样按 `screen` 判定），前端也不渲染屏幕与自定义图片入口。
 *
 * `height` 是模型默认高度（米），`markerHeight` 是顶部状态标签的锚点高度比例：
 * 投影仪只有 0.129 m 高，仍然沿用电视那套标签高度会让标签浮在半空。
 */

export interface MediaDeviceProfile {
  /** `devices` 下的分类名。 */
  collection: string
  /** `scene` / `environment` 里的模型类型名（与建模、清理、锚点表对齐）。 */
  modelType: string
  label: string
  icon: string
  /** 模型默认高度（米）。 */
  height: number
  /** 顶部标签锚点高度比例（相对模型高度）。 */
  markerHeight: number
  /** 是否有屏幕图层；为假时禁止 `screenImage`。 */
  screen: boolean
}

export const MEDIA_DEVICE_PROFILES: Readonly<Record<string, MediaDeviceProfile>> = Object.freeze({
  television: Object.freeze({
    collection: 'televisions',
    modelType: 'tv',
    label: '电视',
    icon: 'mdi:television',
    height: 0.92,
    markerHeight: 0.62,
    screen: true,
  }),
  projector: Object.freeze({
    collection: 'projectors',
    modelType: 'projector',
    label: '投影仪',
    icon: 'mdi:projector',
    height: 0.129,
    markerHeight: 0.5,
    screen: false,
  }),
})

/** 媒体设备的全部种类名。 */
export const MEDIA_DEVICE_KINDS: ReadonlyArray<string> = Object.freeze(Object.keys(MEDIA_DEVICE_PROFILES))

/**
 * 取 media profile。`hasOwn` 而不是直接下标：`constructor` / `toString` 这类原型键
 * 会返回真值，把「不是媒体设备」误判成媒体设备。
 */
export function mediaDeviceProfile(deviceKind: unknown): MediaDeviceProfile | null {
  return typeof deviceKind === 'string' && Object.hasOwn(MEDIA_DEVICE_PROFILES, deviceKind)
    ? MEDIA_DEVICE_PROFILES[deviceKind]
    : null
}

export function isMediaDeviceKind(deviceKind: unknown): boolean {
  return mediaDeviceProfile(deviceKind) !== null
}

/** 把 `devices` 下各类媒体绑定摊平成一串，并带上各自的 `deviceKind`。 */
export function mediaDeviceBindings(
  deviceCollections: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  return MEDIA_DEVICE_KINDS.flatMap((deviceKind) => {
    const collection = mediaDeviceProfile(deviceKind)!.collection
    const bindings = deviceCollections?.[collection]
    return Array.isArray(bindings)
      ? bindings
          .filter((mediaBinding): mediaBinding is Record<string, unknown> => typeof mediaBinding === 'object')
          .map((mediaBinding) => ({ ...mediaBinding, deviceKind }))
      : []
  })
}

const baseAppearancePreset = {
  pageDimStrength: {
    overview: 0,
    light: 0,
    environment: 30,
    devices: 30,
    vacuum: 30,
    security: 30,
  },
  pageSaturation: {
    overview: 100,
    light: 100,
    environment: 100,
    devices: 100,
    vacuum: 100,
    security: 100,
  },
  focusDimStrength: 0,
  focusVignetteStrength: 0,
}
for (const presetValue of Object.values(baseAppearancePreset))
  presetValue && typeof presetValue == 'object' && Object.freeze(presetValue)
Object.freeze(baseAppearancePreset)
const PAGE_APPEARANCE_PRESETS = Object.freeze({
  default: baseAppearancePreset,
  'warm-wood': baseAppearancePreset,
})
export function withPageAppearancePreset(sceneConfig: any) {
  const appearancePreset = PAGE_APPEARANCE_PRESETS[sceneConfig.sceneStyle === 'warm-wood' ? 'warm-wood' : 'default']
  return {
    ...sceneConfig,
    ...structuredClone(appearancePreset),
  }
}

/** 页面行为配置来自文档，键是行为名（interaction / autoRotate / …），取值由各行为自己解释，所以除少数已知键外统一走索引签名。 */
type PageBehaviorConfig = {
  behaviorScope?: string
  pageBehaviors?: Record<string, Record<string, any>>
  hideIconsWhileRotating?: unknown

  [behaviorName: string]: any
}
export function resolvePageBehavior(behavior: PageBehaviorConfig = {}, pageKind = 'light') {
  const normalizedPage =
      {
        climate: 'environment',
        cover: 'environment',
        nas: 'devices',
        speaker: 'devices',
        television: 'devices',
        'vacuum-shortcut': 'vacuum',
      }[pageKind] || pageKind,
    scopeBehaviors = behavior.behaviorScope === 'page' ? behavior.pageBehaviors?.[normalizedPage] : null,
    mergeBehavior = (name: any, defaults: any) => {
      const scopedBehavior = scopeBehaviors?.[name]
      return {
        ...defaults,
        ...behavior[name],
        ...(typeof scopedBehavior == 'boolean'
          ? {
              enabled: scopedBehavior,
            }
          : scopedBehavior || {}),
      }
    }
  return {
    interaction: mergeBehavior('interaction', {
      rotationMode: 'free',
      panEnabled: true,
      zoomEnabled: true,
    }),
    autoRotate: mergeBehavior('autoRotate', {
      enabled: false,
      idleSeconds: 30,
      speed: 6,
      direction: 'clockwise',
      returnToDefault: false,
    }),
    idleExitFocus: mergeBehavior('idleExitFocus', {
      enabled: false,
      idleSeconds: 30,
    }),
    idleHideIcons: mergeBehavior('idleHideIcons', {
      enabled: false,
      idleSeconds: 30,
    }),
    hideIconsWhileRotating:
      typeof scopeBehaviors?.hideIconsWhileRotating == 'boolean'
        ? scopeBehaviors.hideIconsWhileRotating
        : behavior.hideIconsWhileRotating === true,
  }
}

/**
 * 3D 弹窗摆放（0.8.1）：
 * - 新增 `maxHeight`（画面高度的百分比，30–95）与 `fitContent`；
 * - 缩放不再只受宽度约束，还要压到「最大高度」以内，长内容在面板内部滚动；
 * - `custom` 显式标记优先，其次是 scale / maxHeight / x / y 任一被设置过。
 */
const clampOrDefault = <TFallback extends number | null>(
  value: unknown,
  fallback: TFallback,
  min: number,
  max: number,
): number | TFallback =>
  typeof value == 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

export interface PopupPlacementSettings {
  scale?: number
  x?: number
  y?: number
  /** 面板最大高度占画面的百分比（30–95）。 */
  maxHeight?: number
  custom?: boolean
}

interface PopupPlacementOptions {
  width: number
  height: number
  panelWidth: number
  panelHeight: number
  defaultScale?: number
  defaultTop?: number
  defaultRight?: number
  settings?: PopupPlacementSettings | null
  /** 按内容高度收口（而非按 180px 的最小占位估算）。 */
  fitContent?: boolean
  /** 必须完整显示的内容高度（本地 px）：缩放再压一档，保证它在「最大高度」内不被裁切。 */
  minContentHeight?: number
}

export interface PopupPlacement {
  scale: number
  top: number
  right: number
  left: number
  width: number
  height: number
  /** 面板内可用的最大高度（px），超过就在面板内部滚动。 */
  maxHeight: number
  margin: number
  custom: boolean
}

function popupCustomEnabled(settings: PopupPlacementSettings = {}): boolean {
  return typeof settings.custom == 'boolean'
    ? settings.custom
    : clampOrDefault(settings.scale, 1, 0.5, 10) !== 1 ||
        Number.isFinite(settings.maxHeight) ||
        Number.isFinite(settings.x) ||
        Number.isFinite(settings.y)
}

export function popupPlacement({
  width: width,
  height: height,
  panelWidth: panelWidth,
  panelHeight: panelHeight,
  defaultScale: defaultScale = 1,
  defaultTop: defaultTop = 12,
  defaultRight: defaultRight = 16,
  settings: rawSettings = {},
  fitContent: fitContent = false,
  minContentHeight: minContentHeight = 0,
}: PopupPlacementOptions): PopupPlacement {
  ;(width = Math.max(1, width)),
    (height = Math.max(1, height)),
    (panelWidth = Math.max(1, panelWidth)),
    (panelHeight = Math.max(1, panelHeight))
  const placementSettings: PopupPlacementSettings = rawSettings ?? {},
    custom = popupCustomEnabled(placementSettings),
    customScale = custom ? clampOrDefault(placementSettings.scale, 1, 0.5, 10) : 1,
    xPercent = custom ? clampOrDefault(placementSettings.x, null, 0, 100) : null,
    yPercent = custom ? clampOrDefault(placementSettings.y, null, 0, 100) : null,
    margin = Math.min(12, width / 4, height / 4),
    maxPanelHeight = Math.min(
      height - margin * 2,
      (height * (custom ? clampOrDefault(placementSettings.maxHeight, 75, 30, 95) : 75)) / 100,
    ),
    scale = Math.max(
      0.001,
      Math.min(
        defaultScale * (customScale ?? 1),
        (width - margin * 2) / panelWidth,
        maxPanelHeight / Math.max(fitContent ? panelHeight : 180, minContentHeight),
      ),
    ),
    contentMaxHeight = maxPanelHeight / scale,
    scaledWidth = panelWidth * scale,
    scaledHeight = Math.min(panelHeight, contentMaxHeight) * scale,
    left =
      xPercent === null
        ? Math.max(margin, width - Math.max(margin, defaultRight) - scaledWidth)
        : margin + (Math.max(0, width - margin * 2 - scaledWidth) * xPercent) / 100,
    top =
      yPercent === null
        ? Math.max(margin, Math.min(height - margin - scaledHeight, defaultTop))
        : margin + (Math.max(0, height - margin * 2 - scaledHeight) * yPercent) / 100
  return {
    scale: scale,
    top: top,
    right: width - left - scaledWidth,
    left: left,
    width: scaledWidth,
    height: scaledHeight,
    maxHeight: contentMaxHeight,
    margin: margin,
    custom: custom,
  }
}

const positiveOr = (candidate: any, fallback: any) =>
  Number.isFinite(Number(candidate)) && Number(candidate) > 0 ? Number(candidate) : fallback
export function interaction3dPreviewSize(element: any, board: any, boardWidth: any, boardHeight: any) {
  const isFill = element.properties?.layoutMode === 'fill',
    sourceSize = isFill ? board?.canvas : element.position,
    width = positiveOr(sourceSize?.width, isFill ? 2778 : 100),
    height = positiveOr(sourceSize?.height, isFill ? 1940 : 100),
    scale = Math.min(positiveOr(boardWidth, 0) / width, positiveOr(boardHeight, 0) / height)
  return {
    width: width * scale,
    height: height * scale,
    aspectRatio: width / height,
  }
}
/**
 * 统一 3D 配置预览的尺寸观察入口：ResizeObserver + rAF 节流，
 * 避免多个编辑器各自裸用 ResizeObserver 在窗口尺寸变化时触发布局抖动 / 警告。
 * 返回句柄的 `disconnect()` 会同时取消挂起的动画帧。
 */
export function observeInteraction3dPreview(targetElement: any, onResize: () => void, view: any = globalThis) {
  let animationFrameId: number | null = null
  let isDisconnected = false
  const resizeObserver = new view.ResizeObserver(() => {
    if (animationFrameId === null) {
      animationFrameId = view.requestAnimationFrame(() => {
        animationFrameId = null
        if (!isDisconnected) onResize()
      })
    }
  })
  resizeObserver.observe(targetElement)
  return {
    disconnect() {
      isDisconnected = true
      resizeObserver.disconnect()
      if (animationFrameId !== null) view.cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    },
  }
}

const baseLightingPreset = {
  ambientIntensity: 0.16,
  fillAzimuth: -48,
  fillElevation: 28,
  fillIntensity: 0.16,
  hemisphereIntensity: 0.58,
  mainAzimuth: 139,
  mainElevation: 55,
  mainIntensity: 2.05,
  mainShadowIntensity: 0.18,
  topAzimuth: 90,
  topElevation: 86,
  topIntensity: 0.12,
}
const REGION_LIGHTING_PRESETS = Object.freeze({
  default: Object.freeze({
    ...baseLightingPreset,
    exposure: 0.95,
    floorBrightness: 75,
  }),
  'warm-wood': Object.freeze({
    ...baseLightingPreset,
    exposure: 0.6,
    floorBrightness: 50,
  }),
  // 自然木语的墙面自发光更高（暖砂墙 + 木饰面），区域光再按暖木那档压到 0.6 会糊成一片；
  // 曝光取中值、地面亮度略提，让踢脚与家具阴影还能分辨。
  'natural-wood': Object.freeze({
    ...baseLightingPreset,
    exposure: 0.72,
    floorBrightness: 62,
  }),
})

/** 风格 → 区域光预设键。未知风格回落到默认档。 */
function regionPresetKey(sceneStyle: unknown): 'default' | 'warm-wood' | 'natural-wood' {
  if (sceneStyle === 'warm-wood') return 'warm-wood'
  if (sceneStyle === 'natural-wood') return 'natural-wood'
  return 'default'
}

export function withRegionLightingPreset(sceneConfig: any) {
  if (sceneConfig.lightingMode !== 'region') return sceneConfig
  const presetKey = regionPresetKey(sceneConfig.sceneStyle)
  return {
    ...sceneConfig,
    baseLighting: {
      ...REGION_LIGHTING_PRESETS[presetKey],
    },
  }
}
