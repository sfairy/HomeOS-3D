import { domElement } from '@app/shared/util/dom-factory'

const {
  hsToRgbColor: hsToRgbColor,
  lightColorPickerHsFromPoint: hsFromPoint,
  lightColorPickerPointFromHs: pointFromHs,
} = await import('@app/shared/device')
export function createLightColorPicker({ onPreview: onPreview, onCommit: onCommit, onCancel: onCancel }: any) {
  const pickerElement = document.createElement('div')
  ;(pickerElement.className = 'i3d-color-picker'),
    pickerElement.setAttribute('role', 'slider'),
    pickerElement.setAttribute('aria-label', '选择灯光颜色')
  const handleElement = document.createElement('i')
  ;(handleElement.className = 'i3d-color-handle'), pickerElement.append(handleElement)
  let hsPair = [0, 0],
    isEnabled = false,
    pickerEntityId = '',
    activePointerId: any = null,
    previewToken: any = null
  const syncPickerVisual = () => {
    const pickerRect = pickerElement.getBoundingClientRect(),
      normalizedPoint = pointFromHs(hsPair, pickerRect.width / pickerRect.height)
    pickerElement.style.setProperty('--i3d-color-x', normalizedPoint.x * 100 + '%'),
      pickerElement.style.setProperty('--i3d-color-y', normalizedPoint.y * 100 + '%'),
      pickerElement.style.setProperty('--i3d-color', 'rgb(' + hsToRgbColor!(hsPair)!.join(',') + ')'),
      pickerElement.setAttribute(
        'aria-valuetext',
        '色相 ' + Math.round(hsPair[0]) + ' 度，饱和度 ' + Math.round(hsPair[1]) + '%',
      )
  }
  function releasePointer() {
    const releasedPointerId = activePointerId
    if (((activePointerId = null), releasedPointerId !== null))
      try {
        pickerElement.releasePointerCapture?.(releasedPointerId)
      } catch {
        /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */
      }
  }
  function cancelPicker() {
    releasePointer()
    const cancelledToken = previewToken
    ;(previewToken = null), cancelledToken !== null && onCancel(pickerEntityId, cancelledToken)
  }
  const applyHsColor = (nextHs: any) => {
      ;(hsPair = nextHs), syncPickerVisual(), (previewToken = onPreview([...hsPair]))
    },
    updateColorFromPointer = (pointerEvent: any) => {
      const hitRect = pickerElement.getBoundingClientRect()
      !hitRect.width ||
        !hitRect.height ||
        applyHsColor(
          hsFromPoint(
            (pointerEvent.clientX - hitRect.left) / hitRect.width,
            (pointerEvent.clientY - hitRect.top) / hitRect.height,
            hitRect.width / hitRect.height,
          ),
        )
    }
  return (
    pickerElement.addEventListener('pointerdown', (pointerDownEvent) => {
      !isEnabled ||
        activePointerId !== null ||
        (pointerDownEvent.button !== undefined && pointerDownEvent.button !== 0) ||
        ((activePointerId = pointerDownEvent.pointerId),
        pickerElement.setPointerCapture?.(activePointerId),
        updateColorFromPointer(pointerDownEvent),
        pointerDownEvent.preventDefault())
    }),
    pickerElement.addEventListener('pointermove', (pointerMoveEvent) => {
      activePointerId === pointerMoveEvent.pointerId && updateColorFromPointer(pointerMoveEvent)
    }),
    pickerElement.addEventListener('pointerup', (pointerUpEvent) => {
      activePointerId === pointerUpEvent.pointerId &&
        (updateColorFromPointer(pointerUpEvent), releasePointer(), (previewToken = null), onCommit([...hsPair]))
    }),
    pickerElement.addEventListener('pointercancel', cancelPicker),
    pickerElement.addEventListener('lostpointercapture', () => {
      activePointerId !== null && cancelPicker()
    }),
    pickerElement.addEventListener('keydown', (keyEvent) => {
      if (!isEnabled) return
      if (keyEvent.key === 'Escape') {
        cancelPicker(), keyEvent.preventDefault()
        return
      }
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        ;(previewToken = null), onCommit([...hsPair]), keyEvent.preventDefault()
        return
      }
      const stepAmount = keyEvent.shiftKey ? 10 : 3
      let [hue, saturation] = hsPair
      if (keyEvent.key === 'ArrowLeft') hue -= stepAmount
      else {
        if (keyEvent.key === 'ArrowRight') hue += stepAmount
        else {
          if (keyEvent.key === 'ArrowUp') saturation -= stepAmount
          else {
            if (keyEvent.key === 'ArrowDown') saturation += stepAmount
            else return
          }
        }
      }
      applyHsColor([((hue % 360) + 360) % 360, Math.max(0, Math.min(100, saturation))]), keyEvent.preventDefault()
    }),
    {
      root: pickerElement,
      cancel: cancelPicker,
      dispose: cancelPicker,
      update(pickerState: any) {
        ;(pickerEntityId !== pickerState.entityId || !pickerState.enabled || !pickerState.visible) && cancelPicker(),
          (pickerEntityId = pickerState.entityId),
          (isEnabled = pickerState.enabled && pickerState.visible),
          (pickerElement.hidden = !pickerState.visible),
          (pickerElement.tabIndex = isEnabled ? 0 : -1),
          pickerElement.setAttribute('aria-disabled', String(!isEnabled)),
          activePointerId === null && previewToken === null && ((hsPair = pickerState.hs || [0, 0]), syncPickerVisual())
      },
    }
  )
}
export function createLightModeMenu(onSelect: any) {
  const makeElement = (tagName: any, className: any) => domElement(document, tagName, className),
    modeRoot = makeElement('div', 'i3d-light-mode'),
    triggerButton = makeElement('button', 'i3d-light-mode-trigger')
  ;(triggerButton.type = 'button'),
    triggerButton.setAttribute('aria-label', '灯光模式'),
    triggerButton.setAttribute('aria-haspopup', 'menu')
  const labelElement = makeElement('span', '')
  triggerButton.append(labelElement)
  const menuElement = makeElement('div', 'i3d-light-mode-menu')
  menuElement.setAttribute('role', 'menu'),
    menuElement.setAttribute('aria-label', '灯光模式'),
    modeRoot.append(triggerButton, menuElement)
  let selectedMode = '',
    menuEntityId = '',
    modesSignature = '',
    pendingMode = ''
  const modeButtons: any = [],
    getVisibleOptions = () => modeButtons.filter((optionButton: any) => !optionButton.hidden)
  function closeMenu(shouldRestoreFocus = false) {
    ;(menuElement.hidden = true),
      triggerButton.setAttribute('aria-expanded', 'false'),
      shouldRestoreFocus && !triggerButton.disabled && triggerButton.focus()
  }
  function openMenu(shouldFocusLast = false) {
    if (triggerButton.disabled || modeRoot.hidden) return
    ;(menuElement.hidden = false), triggerButton.setAttribute('aria-expanded', 'true')
    const visibleButtons = getVisibleOptions()
    ;(shouldFocusLast
      ? visibleButtons.at(-1)
      : visibleButtons.find((candidateButton: any) => candidateButton.value === selectedMode) || visibleButtons[0]
    )?.focus()
  }
  for (const [modeKey, modeLabel] of [
    ['color', '彩光'],
    ['temperature', '色温'],
    ['white', '白光'],
  ]) {
    const modeOptionButton = makeElement('button', 'i3d-light-mode-option')
    ;(modeOptionButton.type = 'button'),
      (modeOptionButton.value = modeKey),
      (modeOptionButton.textContent = modeLabel),
      (modeOptionButton.tabIndex = -1),
      modeOptionButton.setAttribute('role', 'menuitemradio'),
      modeOptionButton.addEventListener('click', () => {
        triggerButton.disabled ||
          modeOptionButton.hidden ||
          (closeMenu(true), selectedMode !== modeKey && ((pendingMode = modeKey), onSelect(modeKey)))
      }),
      menuElement.append(modeOptionButton),
      modeButtons.push(modeOptionButton)
  }
  triggerButton.addEventListener('click', () => (menuElement.hidden ? openMenu() : closeMenu())),
    triggerButton.addEventListener('keydown', (triggerKeyEvent: any) => {
      ;['ArrowDown', 'ArrowUp'].includes(triggerKeyEvent.key) &&
        (triggerKeyEvent.preventDefault(),
        triggerKeyEvent.stopPropagation(),
        openMenu(triggerKeyEvent.key === 'ArrowUp'))
    }),
    modeRoot.addEventListener('keydown', (menuKeyEvent: any) => {
      if (menuElement.hidden) return
      if (menuKeyEvent.key === 'Escape') {
        menuKeyEvent.preventDefault(), menuKeyEvent.stopPropagation(), closeMenu(true)
        return
      }
      if (menuKeyEvent.key === 'Tab') {
        closeMenu(true)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(menuKeyEvent.key)) return
      menuKeyEvent.preventDefault(), menuKeyEvent.stopPropagation()
      const visibleOptions = getVisibleOptions(),
        currentIndex = visibleOptions.indexOf(document.activeElement),
        nextIndex =
          menuKeyEvent.key === 'Home'
            ? 0
            : menuKeyEvent.key === 'End'
              ? visibleOptions.length - 1
              : (currentIndex + (menuKeyEvent.key === 'ArrowDown' ? 1 : -1) + visibleOptions.length) %
                visibleOptions.length
      visibleOptions[nextIndex]?.focus()
    }),
    modeRoot.addEventListener('focusout', (focusOutEvent: any) => {
      modeRoot.contains(focusOutEvent.relatedTarget) || closeMenu()
    })
  const handleOutsidePointerDown = (documentPointerEvent: any) => {
    modeRoot.contains(documentPointerEvent.target) || closeMenu()
  }
  return (
    document.addEventListener('pointerdown', handleOutsidePointerDown, true),
    closeMenu(),
    {
      root: modeRoot,
      close: closeMenu,
      get value() {
        return selectedMode
      },
      reset() {
        ;(pendingMode = ''), closeMenu()
      },
      dispose() {
        document.removeEventListener('pointerdown', handleOutsidePointerDown, true), (pendingMode = ''), closeMenu()
      },
      update({ modes: modes, value: selectedValue, disabled: isDisabled, entity: entityId }: any) {
        const nextModesSignature = Object.keys(modes)
          .filter((modeName) => modes[modeName])
          .join(',')
        ;(menuEntityId !== entityId || modesSignature !== nextModesSignature || isDisabled) && closeMenu(),
          (menuEntityId !== entityId || !modes[pendingMode]) && (pendingMode = ''),
          (menuEntityId = entityId),
          (modesSignature = nextModesSignature),
          (selectedMode = pendingMode || selectedValue),
          (modeRoot.hidden = Object.values(modes).filter(Boolean).length < 2),
          (triggerButton.disabled = isDisabled)
        for (const menuButton of modeButtons)
          (menuButton.hidden = !modes[menuButton.value]),
            menuButton.setAttribute('aria-checked', String(menuButton.value === selectedMode)),
            menuButton.value === selectedMode && (labelElement.textContent = menuButton.textContent)
        return selectedMode
      },
    }
  )
}

const {
    lightSupportsColor: lightSupportsColor,
    lightColorRgb: lightColorRgb,
    lightColorHs: lightColorHs,
    lightColorServiceData: buildColorServicePayload,
    lightRealtimeCapabilities: lightRealtimeCapabilities,
    hsToRgbColor: j,
  } = await import('@app/shared/device'),
  isColorHsPair = (colorHsCandidate: any) =>
    Array.isArray(colorHsCandidate) &&
    colorHsCandidate.length === 2 &&
    colorHsCandidate.every((hsComponent) => typeof hsComponent == 'number' && Number.isFinite(hsComponent)) &&
    colorHsCandidate[0] >= 0 &&
    colorHsCandidate[0] <= 360 &&
    colorHsCandidate[1] >= 0 &&
    colorHsCandidate[1] <= 100
export { j as hsToRgbColor }
const isNumericValue = (candidateValue: any) =>
    candidateValue != null && candidateValue !== '' && Number.isFinite(Number(candidateValue)),
  colorModeSet = new Set(['hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white', 'brightness', 'onoff', 'unknown'])
export function lightState(entityId: any, entityState: any, fallbackState: any = null) {
  const stateObject = entityState?.newState || entityState || {},
    attributes = stateObject.attributes || {},
    supportedColorModes = Array.isArray(attributes.supported_color_modes) ? attributes.supported_color_modes : [],
    isLightDomain = entityId.startsWith('light.'),
    colorSupported =
      isLightDomain &&
      (supportedColorModes.length
        ? lightSupportsColor(attributes)
        : lightSupportsColor(attributes) || fallbackState?.colorSupported === true),
    colorRgb = (colorSupported && (lightColorRgb(attributes) || fallbackState?.colorRgb)) || null,
    colorHs = (colorSupported && (lightColorHs(attributes) || fallbackState?.colorHs)) || null,
    colorMode =
      isLightDomain && (attributes.color_mode === 'color_temp' || colorModeSet.has(attributes.color_mode))
        ? attributes.color_mode
        : (fallbackState?.colorMode ?? null),
    realtimeCapabilities = lightRealtimeCapabilities(entityId, stateObject),
    brightnessSupported =
      isLightDomain &&
      (realtimeCapabilities.brightness || (!supportedColorModes.length && fallbackState?.brightnessSupported === true)),
    temperatureSupported =
      isLightDomain &&
      (realtimeCapabilities.colorTemperature ||
        (!supportedColorModes.length && fallbackState?.temperatureSupported === true)),
    capabilitiesKnown =
      supportedColorModes.length > 0 ||
      isNumericValue(attributes.brightness) ||
      isNumericValue(attributes.color_temp_kelvin) ||
      isNumericValue(attributes.color_temp) ||
      isNumericValue(attributes.min_color_temp_kelvin) ||
      isNumericValue(attributes.max_color_temp_kelvin) ||
      (Number(attributes.supported_features) & 3) !== 0 ||
      fallbackState?.capabilitiesKnown === true,
    minimumKelvin = isNumericValue(attributes.min_color_temp_kelvin)
      ? Number(attributes.min_color_temp_kelvin)
      : Number(attributes.max_mireds) > 0
        ? 1000000 / Number(attributes.max_mireds)
        : (fallbackState?.minimum ?? 2000),
    maximumKelvin = isNumericValue(attributes.max_color_temp_kelvin)
      ? Number(attributes.max_color_temp_kelvin)
      : Number(attributes.min_mireds) > 0
        ? 1000000 / Number(attributes.min_mireds)
        : (fallbackState?.maximum ?? 6500),
    kelvinValue =
      isNumericValue(attributes.color_temp_kelvin) && Number(attributes.color_temp_kelvin) > 0
        ? Number(attributes.color_temp_kelvin)
        : isNumericValue(attributes.color_temp) && Number(attributes.color_temp) > 0
          ? 1000000 / Number(attributes.color_temp)
          : (fallbackState?.kelvin ?? null),
    rawBrightness = isNumericValue(attributes.brightness)
      ? Math.max(0, Math.min(255, Number(attributes.brightness)))
      : null,
    brightnessPercent =
      rawBrightness !== null && !(stateObject.state === 'off' && rawBrightness === 0)
        ? rawBrightness > 0
          ? Math.max(1, Math.round((rawBrightness / 255) * 100))
          : 0
        : fallbackState?.brightness > 0
          ? fallbackState.brightness
          : null
  return {
    on: stateObject.state === 'on',
    available: ['on', 'off'].includes(stateObject.state),
    name: attributes.friendly_name || fallbackState?.name || entityId,
    brightnessSupported: brightnessSupported,
    temperatureSupported: temperatureSupported,
    colorSupported: colorSupported,
    colorHs: colorHs,
    colorRgb: colorRgb,
    colorModes: supportedColorModes.length ? [...supportedColorModes] : fallbackState?.colorModes || [],
    colorMode: colorMode,
    capabilitiesKnown: capabilitiesKnown,
    brightness: brightnessSupported ? brightnessPercent : null,
    kelvin: temperatureSupported && isNumericValue(kelvinValue) ? Math.round(kelvinValue) : null,
    minimum: Math.round(Math.max(1000, Math.min(minimumKelvin, maximumKelvin))),
    maximum: Math.round(Math.min(20000, Math.max(minimumKelvin, maximumKelvin))),
  }
}
export function lightRenderState(stateSnapshot: any) {
  const hasMissingBrightness = stateSnapshot.brightnessSupported && !Number.isFinite(stateSnapshot.brightness),
    hasUsableColorRgb =
      !stateSnapshot.colorMode &&
      stateSnapshot.colorSupported &&
      Array.isArray(stateSnapshot.colorRgb) &&
      stateSnapshot.colorRgb.length === 3 &&
      stateSnapshot.colorRgb.every(
        (rgbChannel: any) => Number.isFinite(rgbChannel) && rgbChannel >= 0 && rgbChannel <= 255,
      ),
    hasMissingKelvin =
      stateSnapshot.temperatureSupported &&
      !colorModeSet.has(stateSnapshot.colorMode) &&
      !Number.isFinite(stateSnapshot.kelvin) &&
      !hasUsableColorRgb
  return {
    ...stateSnapshot,
    on: stateSnapshot.on && !hasMissingBrightness && !hasMissingKelvin,
  }
}
const HISTORY_MAX_AGE_MS = 10080 * 60 * 1000,
  MAX_TRACKED_ENTITIES = 256,
  isLightEntityId = (entityIdCandidate: any) => /^(light|switch)\.[a-z0-9_]+$/.test(entityIdCandidate),
  isNumericAttribute = (attributeValue: any) => typeof attributeValue != 'boolean' && isNumericValue(attributeValue),
  LIGHT_ATTRIBUTE_VALIDATORS = {
    brightness: (brightnessValue: any) =>
      Number.isFinite(brightnessValue) && brightnessValue > 0 && brightnessValue <= 100,
    kelvin: (kelvinCandidate: any) => Number.isFinite(kelvinCandidate) && kelvinCandidate > 0,
    minimum: (minimumCandidate: any) =>
      Number.isFinite(minimumCandidate) && minimumCandidate >= 1000 && minimumCandidate <= 20000,
    maximum: (maximumCandidate: any) =>
      Number.isFinite(maximumCandidate) && maximumCandidate >= 1000 && maximumCandidate <= 20000,
    colorMode: (colorModeCandidate: any) => colorModeCandidate === 'color_temp' || colorModeSet.has(colorModeCandidate),
    brightnessSupported: (brightnessSupportedFlag: any) => typeof brightnessSupportedFlag == 'boolean',
    temperatureSupported: (temperatureSupportedFlag: any) => typeof temperatureSupportedFlag == 'boolean',
    colorSupported: (colorSupportedFlag: any) => typeof colorSupportedFlag == 'boolean',
    colorHs: isColorHsPair,
    colorRgb: (colorRgbCandidate: any) =>
      Array.isArray(colorRgbCandidate) &&
      colorRgbCandidate.length === 3 &&
      colorRgbCandidate.every(
        (rgbComponent) => Number.isFinite(rgbComponent) && rgbComponent >= 0 && rgbComponent <= 255,
      ),
    colorModes: (colorModesCandidate: any) =>
      Array.isArray(colorModesCandidate) &&
      colorModesCandidate.length <= 12 &&
      colorModesCandidate.every((colorModeName) => typeof colorModeName == 'string' && colorModeName.length < 32),
  }
function computeAttributePatch(patchEntityId: any, patchEntityState: any) {
  const entityStateBody = patchEntityState?.newState || patchEntityState || {},
    entityAttributes = entityStateBody.attributes || {},
    resolvedLightState = lightState(patchEntityId, patchEntityState),
    attributePatch: Record<string, any> = {},
    patchSupportedColorModes = Array.isArray(entityAttributes.supported_color_modes)
      ? entityAttributes.supported_color_modes
      : [],
    hasReportedBrightness = isNumericAttribute(entityAttributes.brightness) && Number(entityAttributes.brightness) > 0,
    hasReportedKelvin =
      (isNumericAttribute(entityAttributes.color_temp_kelvin) && Number(entityAttributes.color_temp_kelvin) > 0) ||
      (isNumericAttribute(entityAttributes.color_temp) && Number(entityAttributes.color_temp) > 0),
    hasReportedMinKelvin =
      (isNumericAttribute(entityAttributes.min_color_temp_kelvin) &&
        Number(entityAttributes.min_color_temp_kelvin) > 0) ||
      (isNumericAttribute(entityAttributes.max_mireds) && Number(entityAttributes.max_mireds) > 0),
    hasReportedMaxKelvin =
      (isNumericAttribute(entityAttributes.max_color_temp_kelvin) &&
        Number(entityAttributes.max_color_temp_kelvin) > 0) ||
      (isNumericAttribute(entityAttributes.min_mireds) && Number(entityAttributes.min_mireds) > 0),
    reportedSupportedFeatures = isNumericAttribute(entityAttributes.supported_features)
      ? Number(entityAttributes.supported_features)
      : 0
  return (
    (patchSupportedColorModes.length || hasReportedBrightness || reportedSupportedFeatures & 1) &&
      (attributePatch.brightnessSupported = resolvedLightState.brightnessSupported),
    (patchSupportedColorModes.length ||
      hasReportedKelvin ||
      hasReportedMinKelvin ||
      hasReportedMaxKelvin ||
      reportedSupportedFeatures & 2) &&
      (attributePatch.temperatureSupported = resolvedLightState.temperatureSupported),
    (patchSupportedColorModes.length || lightColorHs(entityAttributes)) &&
      (attributePatch.colorSupported = resolvedLightState.colorSupported),
    patchSupportedColorModes.length && (attributePatch.colorModes = [...patchSupportedColorModes]),
    resolvedLightState.colorSupported &&
      lightColorRgb(entityAttributes) &&
      (attributePatch.colorRgb = resolvedLightState.colorRgb),
    resolvedLightState.colorSupported &&
      lightColorHs(entityAttributes) &&
      (attributePatch.colorHs = resolvedLightState.colorHs),
    hasReportedBrightness &&
      resolvedLightState.brightnessSupported &&
      (attributePatch.brightness = resolvedLightState.brightness),
    hasReportedKelvin && resolvedLightState.temperatureSupported && (attributePatch.kelvin = resolvedLightState.kelvin),
    hasReportedMinKelvin && (attributePatch.minimum = resolvedLightState.minimum),
    hasReportedMaxKelvin && (attributePatch.maximum = resolvedLightState.maximum),
    (entityAttributes.color_mode === 'color_temp' || colorModeSet.has(entityAttributes.color_mode)) &&
      (attributePatch.colorMode = resolvedLightState.colorMode),
    Object.fromEntries(
      Object.entries(attributePatch).filter(([patchKey, patchValue]) =>
        (LIGHT_ATTRIBUTE_VALIDATORS as any)[patchKey](patchValue),
      ),
    )
  )
}

type LightHistoryRecord = { at: number; value?: unknown }

type LightHistoryStorage = {
  getItem: (storageKey: string) => string | null
  setItem: (storageKey: string, storageValue: string) => void
  removeItem: (storageKey: string) => void
}
function createLightHistoryStore(storage: any, scope: any, now: any, schedule: any, cancel: any) {
  if (!storage || typeof scope != 'string' || !scope.trim()) return null
  const storageKey = 'hb-i3d:light-history:v1:' + scope,
    historyByEntityId = new Map<string, Record<string, LightHistoryRecord>>(),
    signatureByEntityId = new Map()
  let isStorageUsable = true,
    flushTimerId: any = null,
    hasPendingWrites = false,
    nextPruneMs = 0
  const latestRecordTimestamp = (attributeRecords: Record<string, LightHistoryRecord>) =>
    Math.max(0, ...Object.values(attributeRecords).map((attributeRecord) => attributeRecord.at))
  function pruneExpiredRecords(nowMs: any) {
    if (nowMs < nextPruneMs && historyByEntityId.size <= MAX_TRACKED_ENTITIES) return false
    let hasPruned = false
    nextPruneMs = Infinity
    for (const [storedEntityId, storedAttributes] of historyByEntityId) {
      for (const [attributeKey, record] of Object.entries(storedAttributes))
        nowMs - record.at >= HISTORY_MAX_AGE_MS
          ? (delete storedAttributes[attributeKey], (hasPruned = true))
          : (nextPruneMs = Math.min(nextPruneMs, record.at + HISTORY_MAX_AGE_MS))
      Object.keys(storedAttributes).length || historyByEntityId.delete(storedEntityId)
    }
    if (historyByEntityId.size > MAX_TRACKED_ENTITIES) {
      const entitiesByAge = [...historyByEntityId].sort(
        (leftEntity, rightEntity) => latestRecordTimestamp(leftEntity[1]) - latestRecordTimestamp(rightEntity[1]),
      )
      for (const [evictedEntityId] of entitiesByAge.slice(0, historyByEntityId.size - MAX_TRACKED_ENTITIES))
        historyByEntityId.delete(evictedEntityId)
      hasPruned = true
    }
    return hasPruned
  }
  function readStoredHistory() {
    const storedHistoryByEntityId = new Map<string, Record<string, LightHistoryRecord>>(),
      storedJSON = storage.getItem(storageKey)
    if (storedJSON) {
      const parsedHistory = JSON.parse(storedJSON),
        readAtMs = now()
      if (
        parsedHistory?.version !== 1 ||
        !parsedHistory.entities ||
        typeof parsedHistory.entities != 'object' ||
        Array.isArray(parsedHistory.entities)
      )
        throw new Error('Invalid light history')
      for (const [entityIdFromStorage, attributesFromStorage] of Object.entries(parsedHistory.entities)) {
        if (
          !isLightEntityId(entityIdFromStorage) ||
          !attributesFromStorage ||
          typeof attributesFromStorage != 'object' ||
          Array.isArray(attributesFromStorage)
        )
          continue
        const validAttributeRecords: Record<string, any> = {}
        for (const [recordKey, storedRecord] of Object.entries(attributesFromStorage))
          Object.hasOwn(LIGHT_ATTRIBUTE_VALIDATORS, recordKey) &&
            (LIGHT_ATTRIBUTE_VALIDATORS as any)[recordKey](storedRecord?.value) &&
            Number.isFinite(storedRecord.at) &&
            storedRecord.at >= 0 &&
            storedRecord.at <= readAtMs &&
            readAtMs - storedRecord.at < HISTORY_MAX_AGE_MS &&
            ((validAttributeRecords as any)[recordKey] = {
              value: storedRecord.value,
              at: storedRecord.at,
            })
        Object.keys(validAttributeRecords).length &&
          storedHistoryByEntityId.set(entityIdFromStorage, validAttributeRecords)
      }
    }
    return storedHistoryByEntityId
  }
  try {
    for (const [restoredEntityId, restoredAttributes] of readStoredHistory())
      historyByEntityId.set(restoredEntityId, restoredAttributes)
    pruneExpiredRecords(now())
  } catch {
    return null
  }
  const serializeHistory = () =>
    JSON.stringify({
      version: 1,
      entities: Object.fromEntries(historyByEntityId),
    })
  function flushHistory() {
    if (
      (flushTimerId !== null && (cancel(flushTimerId), (flushTimerId = null)), !(!isStorageUsable || !hasPendingWrites))
    ) {
      hasPendingWrites = false
      try {
        for (const [persistedEntityId, persistedAttributes] of readStoredHistory()) {
          const mergedRecords: Record<string, LightHistoryRecord> = historyByEntityId.get(persistedEntityId) || {}
          for (const [mergedKey, newerRecord] of Object.entries(persistedAttributes))
            (!mergedRecords[mergedKey] || mergedRecords[mergedKey].at < newerRecord.at) &&
              (mergedRecords[mergedKey] = newerRecord)
          mergedRecords.brightnessSupported?.value === false && delete mergedRecords.brightness,
            mergedRecords.temperatureSupported?.value === false && delete mergedRecords.kelvin,
            mergedRecords.colorSupported?.value === false &&
              (delete mergedRecords.colorHs, delete mergedRecords.colorRgb),
            historyByEntityId.set(persistedEntityId, mergedRecords)
        }
        ;(nextPruneMs = 0), pruneExpiredRecords(now()), storage.setItem(storageKey, serializeHistory())
      } catch {
        isStorageUsable = false
      }
    }
  }
  function scheduleHistoryFlush() {
    !isStorageUsable ||
      flushTimerId !== null ||
      !hasPendingWrites ||
      (flushTimerId = schedule(() => {
        ;(flushTimerId = null), flushHistory()
      }))
  }
  return {
    resolve(resolveEntityId: any, resolveEntityState: any) {
      const resolveNowMs = now()
      if (
        ((hasPendingWrites = pruneExpiredRecords(resolveNowMs) || hasPendingWrites), isLightEntityId(resolveEntityId))
      ) {
        const resolvedPatch = computeAttributePatch(resolveEntityId, resolveEntityState),
          patchSignature = JSON.stringify(resolvedPatch)
        if (signatureByEntityId.get(resolveEntityId) !== patchSignature) {
          signatureByEntityId.delete(resolveEntityId), signatureByEntityId.set(resolveEntityId, patchSignature)
          const entityHistory = historyByEntityId.get(resolveEntityId) || {}
          for (const [historyAttributeKey, historyAttributeValue] of Object.entries(resolvedPatch))
            JSON.stringify(entityHistory[historyAttributeKey]?.value) !== JSON.stringify(historyAttributeValue) &&
              ((entityHistory[historyAttributeKey] = {
                value: historyAttributeValue,
                at: resolveNowMs,
              }),
              (nextPruneMs = Math.min(nextPruneMs, resolveNowMs + HISTORY_MAX_AGE_MS)),
              (hasPendingWrites = true))
          for (
            resolvedPatch.brightnessSupported === false &&
              entityHistory.brightness &&
              (delete entityHistory.brightness, (hasPendingWrites = true)),
              resolvedPatch.colorSupported === false &&
                (entityHistory.colorHs || entityHistory.colorRgb) &&
                (delete entityHistory.colorHs, delete entityHistory.colorRgb, (hasPendingWrites = true)),
              resolvedPatch.temperatureSupported === false &&
                entityHistory.kelvin &&
                (delete entityHistory.kelvin, (hasPendingWrites = true)),
              Object.keys(entityHistory).length && historyByEntityId.set(resolveEntityId, entityHistory);
            signatureByEntityId.size > MAX_TRACKED_ENTITIES;
          )
            signatureByEntityId.delete(signatureByEntityId.keys().next().value)
        }
      }
      ;(hasPendingWrites = pruneExpiredRecords(resolveNowMs) || hasPendingWrites), scheduleHistoryFlush()
      const mergedAttributes = Object.fromEntries(
        Object.entries(historyByEntityId.get(resolveEntityId) || {}).map(([mergedKeyName, mergedRecord]) => [
          mergedKeyName,
          mergedRecord.value,
        ]),
      )
      return (
        (mergedAttributes.colorSupported ??= isColorHsPair(mergedAttributes.colorHs)),
        (mergedAttributes.brightnessSupported ??=
          Number.isFinite(mergedAttributes.brightness) ||
          !!(mergedAttributes.colorMode && mergedAttributes.colorMode !== 'onoff')),
        (mergedAttributes.temperatureSupported ??=
          Number.isFinite(mergedAttributes.kelvin) ||
          Number.isFinite(mergedAttributes.minimum) ||
          Number.isFinite(mergedAttributes.maximum) ||
          mergedAttributes.colorMode === 'color_temp'),
        mergedAttributes
      )
    },
    flush: flushHistory,
    clear() {
      if (
        (flushTimerId !== null && (cancel(flushTimerId), (flushTimerId = null)),
        historyByEntityId.clear(),
        signatureByEntityId.clear(),
        (hasPendingWrites = false),
        (nextPruneMs = Infinity),
        isStorageUsable)
      )
        try {
          storage.removeItem(storageKey)
        } catch {
          isStorageUsable = false
        }
    },
  }
}
export function createLightStateCache({
  storage: cacheStorage,
  scope: cacheScope,
  now: cacheNow = () => Date.now(),
  schedule: cacheSchedule = (scheduledCallback) => setTimeout(scheduledCallback, 50),
  cancel: cacheCancel = (scheduledTimerId) => clearTimeout(scheduledTimerId),
}: {
  storage?: LightHistoryStorage | null
  scope?: string
  now?: () => number

  schedule?: (scheduledCallback: () => void) => any
  cancel?: (scheduledTimerId: any) => void
} = {}) {
  const lastStateByEntityId = new Map(),
    historyStore = createLightHistoryStore(cacheStorage, cacheScope, cacheNow, cacheSchedule, cacheCancel)
  return {
    resolve(cacheEntityId: any, cacheEntityState: any) {
      const cachedAttributes = historyStore
          ? {
              name: lastStateByEntityId.get(cacheEntityId)?.name,
              ...historyStore.resolve(cacheEntityId, cacheEntityState),
            }
          : lastStateByEntityId.get(cacheEntityId),
        computedState = lightState(cacheEntityId, cacheEntityState, cachedAttributes)
      return (
        lastStateByEntityId.set(
          cacheEntityId,
          computedState.brightness === 0
            ? {
                ...computedState,
                brightness: cachedAttributes?.brightness > 0 ? cachedAttributes.brightness : null,
              }
            : computedState,
        ),
        computedState
      )
    },
    flush() {
      historyStore?.flush()
    },
    clear() {
      lastStateByEntityId.clear(), historyStore?.clear()
    },
  }
}
export function lightCommand(commandEntityId: any, commandName: any, commandValue: any, capabilities: any) {
  if (!/^(light|switch)\.[a-z0-9_]+$/.test(commandEntityId) || !capabilities.available) throw new Error('设备不可用。')
  const entityDomainName = commandEntityId.split('.')[0]
  if (commandName === 'power')
    return {
      domain: entityDomainName,
      service: commandValue ? 'turn_on' : 'turn_off',
      entityId: commandEntityId,
      data: {} as Record<string, any>,
    }
  if (commandName === 'white' && capabilities.colorModes?.includes('white'))
    return {
      domain: entityDomainName,
      service: 'turn_on',
      entityId: commandEntityId,
      data: {
        white: Math.round(
          (Math.max(1, Math.min(100, Number.isFinite(commandValue) ? commandValue : capabilities.brightness || 100)) *
            255) /
            100,
        ),
      },
    }
  if (commandName === 'color') {
    if (!capabilities.colorSupported || !isColorHsPair(commandValue))
      throw new Error('此设备不支持该颜色或颜色参数无效。')
    return {
      domain: entityDomainName,
      service: 'turn_on',
      entityId: commandEntityId,
      data: buildColorServicePayload(
        {
          supported_color_modes: capabilities.colorModes,
        },
        commandValue,
      ),
    }
  }
  if (!Number.isFinite(Number(commandValue))) throw new Error('灯光参数无效。')
  if (commandName === 'brightness' && capabilities.brightnessSupported)
    return {
      domain: entityDomainName,
      service: 'turn_on',
      entityId: commandEntityId,
      data: {
        brightness: Math.round((Math.max(1, Math.min(100, Number(commandValue))) * 255) / 100),
      },
    }
  if (commandName === 'temperature' && capabilities.temperatureSupported)
    return {
      domain: entityDomainName,
      service: 'turn_on',
      entityId: commandEntityId,
      data: {
        color_temp_kelvin: Math.round(
          Math.max(capabilities.minimum, Math.min(capabilities.maximum, Number(commandValue))),
        ),
      },
    }
  throw new Error('此设备不支持该灯光调节。')
}
export function createLightPreview({ now: previewNow = () => performance.now() } = {}) {
  const previewsByEntityId = new Map<
    any,
    { values: Record<string, any>; revision: number; committed: boolean; expires: number }
  >()
  let revisionCounter = 0
  return {
    set(previewEntityId: any, previewCommand: any, previewValue: any, isCommitted = false) {
      const previewValues: Record<string, any> = {
        ...previewsByEntityId.get(previewEntityId)?.values,
        on: previewCommand === 'power' ? previewValue === true : true,
      }
      previewCommand === 'brightness' && (previewValues.brightness = previewValue),
        previewCommand === 'temperature' &&
          ((previewValues.kelvin = previewValue),
          (previewValues.colorMode = 'color_temp'),
          delete previewValues.colorHs,
          delete previewValues.colorRgb),
        previewCommand === 'color' &&
          isColorHsPair(previewValue) &&
          ((previewValues.colorHs = [...previewValue]),
          (previewValues.colorRgb = j(previewValue)),
          (previewValues.colorMode = 'hs'),
          delete previewValues.kelvin),
        previewCommand === 'white' &&
          ((previewValues.colorMode = 'white'),
          (previewValues.colorRgb = [255, 255, 255]),
          (previewValues.colorHs = [0, 0]),
          Number.isFinite(previewValue) && (previewValues.brightness = previewValue),
          delete previewValues.kelvin),
        previewCommand === 'preset' &&
          (Number.isFinite(previewValue?.brightness) && (previewValues.brightness = previewValue.brightness),
          Number.isFinite(previewValue?.kelvin) &&
            ((previewValues.kelvin = previewValue.kelvin),
            (previewValues.colorMode = 'color_temp'),
            delete previewValues.colorHs,
            delete previewValues.colorRgb)),
        previewCommand === 'power' &&
          !previewValue &&
          (delete previewValues.brightness,
          delete previewValues.kelvin,
          delete previewValues.colorHs,
          delete previewValues.colorRgb,
          delete previewValues.colorMode)
      const previewEntry = {
        values: previewValues,
        revision: ++revisionCounter,
        committed: isCommitted,
        expires: previewNow() + 15000,
      }
      return (previewsByEntityId.set(previewEntityId, previewEntry), previewEntry.revision)
    },
    state(stateEntityId: any, serverState: any) {
      return {
        ...serverState,
        ...previewsByEntityId.get(stateEntityId)?.values,
      }
    },
    reconcile(reconcileEntityId: any, serverEntityState: any) {
      const pendingPreview = previewsByEntityId.get(reconcileEntityId)
      if (!pendingPreview) return
      const isSettled = Object.entries(pendingPreview.values).every(([previewKey, expectedValue]) =>
        previewKey === 'on'
          ? serverEntityState.on === expectedValue
          : previewKey === 'colorMode'
            ? expectedValue === 'white'
              ? serverEntityState.colorMode === 'white'
              : expectedValue === 'color_temp'
                ? serverEntityState.colorMode === 'color_temp' ||
                  (!serverEntityState.colorMode && Number.isFinite(serverEntityState.kelvin))
                : ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(serverEntityState.colorMode) ||
                  (!serverEntityState.colorMode && isColorHsPair(serverEntityState.colorHs))
            : previewKey === 'colorRgb'
              ? true
              : previewKey === 'colorHs'
                ? isColorHsPair(serverEntityState.colorHs) &&
                  j!(serverEntityState.colorHs)!.every(
                    (serverRgbComponent, rgbChannelIndex) =>
                      Math.abs(serverRgbComponent - j!(expectedValue)![rgbChannelIndex]) <= 4,
                  )
                : Number.isFinite(serverEntityState[previewKey]) &&
                  Math.abs(serverEntityState[previewKey] - expectedValue) <= (previewKey === 'kelvin' ? 15 : 1),
      )
      ;(!serverEntityState.available || (pendingPreview.committed && isSettled)) &&
        previewsByEntityId.delete(reconcileEntityId)
    },
    hold(holdEntityId: any, holdRevision: any) {
      const heldPreview = previewsByEntityId.get(holdEntityId)
      heldPreview?.revision === holdRevision && (heldPreview!.committed = false)
    },
    retain(retainEntityId: any, retainRevision: any) {
      const retainedPreview = previewsByEntityId.get(retainEntityId)
      retainedPreview?.revision === retainRevision &&
        ((retainedPreview!.committed = true), (retainedPreview!.expires = previewNow() + 15000))
    },
    acknowledge(acknowledgeEntityId: any, acknowledgeRevision: any) {
      const acknowledgedPreview = previewsByEntityId.get(acknowledgeEntityId)
      acknowledgedPreview?.revision === acknowledgeRevision && (acknowledgedPreview!.expires = previewNow() + 8000)
    },
    reject(rejectEntityId: any, rejectRevision: any) {
      previewsByEntityId.get(rejectEntityId)?.revision === rejectRevision && previewsByEntityId.delete(rejectEntityId)
    },
    expire() {
      let hasExpired = false
      for (const [expiredEntityId, expiredPreview] of previewsByEntityId)
        expiredPreview.expires <= previewNow() && (previewsByEntityId.delete(expiredEntityId), (hasExpired = true))
      return hasExpired
    },
    clear() {
      previewsByEntityId.clear()
    },
    nextDelay(atMs = previewNow()) {
      let earliestExpiryMs = Infinity
      for (const previewRecord of previewsByEntityId.values())
        earliestExpiryMs = Math.min(earliestExpiryMs, previewRecord.expires)
      return Math.max(0, earliestExpiryMs - atMs)
    },
  }
}

/**
 * 灯光/实体状态的运行时长连接（上游 `light-stream.js`，0.8.1 重写为「两槽交接」）。
 *
 * ## 为什么是两槽
 *
 * 0.8.0 的实现只有一个 socket：订阅列表一变、收到 `resync_required`、或者连接抖动一次，
 * 都会「先清空状态再重连」。舞台侧看到的是同一帧里所有实体先变成 unavailable，几百毫秒后
 * 才恢复 —— 大户型上表现为墙屏整片闪白。
 *
 * 0.8.1 改成两个槽位：
 *
 * - `active`：正在供数的连接，订阅的是**旧**实体集合；
 * - `pending`：按**新**实体集合刚建起来的连接。
 *
 * 新连接收到 `snapshot` 之后才晋升为 active、旧连接随即退役。切换过程中旧值一直在
 * `active` 里，所以订阅变更 / 重同步都不会出现空窗。
 *
 * ## 失败语义（与上游逐条对齐）
 *
 * - `4400 / 4401 / 4403`：鉴权类关闭码，不重试，直接整体失效并通知 `onInvalidate`；
 * - 其它关闭 / 心跳超时：失效**该槽服务过的那批实体**（让历史缓存跟着失效），然后按指数退避重连；
 * - `resync_required`：走一次普通失败（会失效），随后立刻新建 pending，不等待退避。
 */

/** 单条连接的槽位。`stateById` 在 socket 关闭后仍然保留，用于交接期继续供数。 */
interface StreamSlot {
  /** 建槽时冻结的订阅集合；活跃槽不会跟着订阅变更重新订阅。 */
  ids: string[]
  stateById: Map<string, any>
  /** 收到过完整 snapshot 才为 true；未 ready 的槽不参与供数。 */
  ready: boolean
  /** socket 已关闭 / 已被退役。 */
  closed: boolean
  /** @param force 为 true 时连 CONNECTING 的 socket 也立刻关闭（bfcache 冻结前必须强制）。 */
  closeSocket: (force?: boolean) => void
  /**
   * 本槽的分片连接（一槽可能有多条 socket，见 `MAX_SUBSCRIBE_ENTITIES`）。
   *
   * 预留可变：订阅变更走 `update_subscription` 时只改这里每个分片的 `ids`，
   * 不重建连接 —— 否则同一批实体会被新旧两条连接各快照一遍。
   */
  chunks: StreamChunk[]
  /** 刷新心跳计时（建槽时注入）：增量订阅后连接仍然健康，要重新计时。 */
  touchHeartbeat?: () => void
  /** 触发整槽失败（建槽时注入）。 */
  fail?: () => void
}

/** 槽内的一个分片连接。 */
interface StreamChunk {
  socket: WebSocket
  /** 该分片当前订阅的实体（`update_subscription` 会原地改写）。 */
  ids: string[]
  /** 该分片是否收到过自己的首个 snapshot。 */
  ready: boolean
}

export interface LightStreamOptions {
  onStates?: (states: Record<string, any>) => void
  onPatch?: ((patch: Record<string, any>) => void) | null
  /** 订阅态被重置（鉴权失败 / 连接失败 / 重同步）时回调：舞台据此让历史失效。 */
  onInvalidate?: (entityIds: string[]) => void
  /**
   * 后端推送 `cover_memory_changed`：某实体的窗帘姿态历史变了，调用方据此重取快照。
   *
   * 这条通道不走 `onPatch`：记忆不是 HA 状态，塞进状态表会让舞台当成设备值重绘。
   */
  onCoverMemory?: (entityId?: string) => void
  createSocket?: (socketUrl: string) => WebSocket
  socketURL?: string | (() => string)
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timerId: ReturnType<typeof setTimeout>) => void
}

/** 鉴权类关闭码：重连没有意义，直接整体失效。 */
const TERMINAL_CLOSE_CODES = [4400, 4401, 4403]
/** 首帧超时：这么久还没收到 snapshot 就换一条连接。 */
const FIRST_RESPONSE_TIMEOUT_MS = 12000
/** 稳态心跳超时：服务端每 15s 左右会推 ping，65s 没有任何消息即视为断链。 */
const HEARTBEAT_TIMEOUT_MS = 65000
/**
 * 单条连接最多订阅的实体数：后端 `MAX_RUNTIME_ENTITIES` 就是这个数，
 * 超过会被 `close(4400)` 且该码不重试。上游 0.8.1 按这个粒度分片。
 */
const MAX_SUBSCRIBE_ENTITIES = 1000

export function createLightStream({
  onStates: onStates = () => {},
  onPatch: onPatch = null,
  onInvalidate: onInvalidate = () => {},
  onCoverMemory: onCoverMemory = () => {},
  createSocket: createSocket = (socketUrl) => new window.WebSocket(socketUrl),
  socketURL: resolveSocketUrl = () => {
    const endpointUrl = new URL('/api/v1/ws/runtime', location.origin)
    return ((endpointUrl.protocol = endpointUrl.protocol === 'https:' ? 'wss:' : 'ws:'), endpointUrl.href)
  },
  setTimer: setTimer = (timerCallback, timerDelayMs) => setTimeout(timerCallback, timerDelayMs),
  clearTimer: clearTimer = (pendingTimerId) => clearTimeout(pendingTimerId),
}: LightStreamOptions = {}) {
  let wantedEntityIds: string[] = [],
    wantedEntityIdSet = new Set<string>(),
    activeSlot: StreamSlot | null = null,
    pendingSlot: StreamSlot | null = null,
    isStreamActive = false,
    isDisposed = false,
    reconnectAttempt = 0,
    reconnectTimerId: any = null,
    // 冻结前是否处于激活态：bfcache 期间 visibilitychange 可能先把流 setActive(false)，
    // 回来时得按冻结前的状态恢复，而不是只看那一刻的 isStreamActive。
    wasActiveBeforePageCache = false

  const unavailableState = (unavailableEntityId: string) => ({
    entityId: unavailableEntityId,
    state: 'unavailable',
    available: false,
    attributes: {} as Record<string, any>,
  })

  /** 当前可用的槽（active 优先）。两个槽不会同时 ready；active 是权威。 */
  const readySlot = () => (activeSlot?.ready ? activeSlot : pendingSlot?.ready ? pendingSlot : null)

  /** 读某个实体的最新值：active 优先，交接期回落到 pending。 */
  function stateFor(entityId: string) {
    return activeSlot?.stateById.get(entityId) ?? pendingSlot?.stateById.get(entityId)
  }

  function emitStates() {
    // 一个槽都没 ready 之前不下发任何值：舞台侧据此继续显示占位，而不是一片 unavailable。
    if (!readySlot()) {
      onStates({})
      return
    }
    onStates(
      Object.fromEntries(
        wantedEntityIds.map((wantedEntityId) => [
          wantedEntityId,
          structuredClone(stateFor(wantedEntityId) || unavailableState(wantedEntityId)),
        ]),
      ),
    )
  }

  function emitPatch(patchedEntityId: string) {
    if (typeof onPatch == 'function') {
      onPatch({
        [patchedEntityId]: structuredClone(stateFor(patchedEntityId) || unavailableState(patchedEntityId)),
      })
      return
    }
    emitStates()
  }

  function cancelReconnect() {
    reconnectTimerId !== null && clearTimer(reconnectTimerId), (reconnectTimerId = null)
  }

  function scheduleReconnect() {
    if (isDisposed || !isStreamActive || !wantedEntityIds.length || reconnectTimerId !== null) return
    const reconnectDelayMs = Math.min(15000, 500 * 2 ** Math.min(reconnectAttempt++, 5))
    reconnectTimerId = setTimer(() => {
      ;(reconnectTimerId = null), openPendingSlot()
    }, reconnectDelayMs)
  }

  /** 退役一个槽：关掉 socket，丢掉状态，不留任何定时器。 */
  function retireSlot(retiredSlot: StreamSlot | null) {
    if (!retiredSlot || (retiredSlot.closed && !retiredSlot.stateById.size)) return
    retiredSlot.closeSocket()
    retiredSlot.closed = true
    retiredSlot.stateById.clear()
  }

  /** 只关 socket、保留状态：bfcache 冻结 / 交接期需要「旧值继续供数」。 */
  function parkSlot(parkedSlot: StreamSlot | null) {
    if (!parkedSlot) return
    // 冻结前必须强制关闭：握手期的连接等 `open` 再关是等不到的（见 closeSocket 注释）。
    parkedSlot.closeSocket(true)
    parkedSlot.closed = true
  }

  function disposeAllSlots({ notify }: { notify: boolean } = { notify: true }) {
    const invalidatedEntityIds = [...wantedEntityIds]
    cancelReconnect(),
      pendingSlot !== null && (retireSlot(pendingSlot), (pendingSlot = null)),
      activeSlot !== null && (retireSlot(activeSlot), (activeSlot = null))
    notify && invalidatedEntityIds.length && onInvalidate(invalidatedEntityIds)
  }

  /** 按当前 `wantedEntityIds` 切分片：后端单连接上限见 `MAX_SUBSCRIBE_ENTITIES`。 */
  function splitSubscriptionChunks(entityIds: string[]): string[][] {
    const chunks: string[][] = []
    for (let chunkStart = 0; chunkStart < entityIds.length; chunkStart += MAX_SUBSCRIBE_ENTITIES)
      chunks.push(entityIds.slice(chunkStart, chunkStart + MAX_SUBSCRIBE_ENTITIES))
    return chunks
  }

  /**
   * 在**已 ready 的活跃槽**上做增量订阅，返回是否成功。
   *
   * 为什么不是一切换就重建连接：两槽交接虽然消灭了空窗，但订阅一变就并行建一条新连接，
   * 同一批实体（尤其是大户型几百个灯）会被新旧两条连接重复快照 —— 服务端要重复取数、
   * 重复序列化，墙屏每改一次统计/弹窗就付一次这个代价。
   *
   * 后端 `/ws/runtime` 支持 `update_subscription`：换订阅集合 + 补一份新集合的快照，
   * 连接与授权上下文都保留，旧值在补快照到达前继续供数，空窗同样不存在。
   *
   * 分片数变化（实体数跨过 1000 的边界）时不走这条路：分片边界得重建，交给两槽交接。
   */
  function tryUpdateActiveSubscription(nextEntityIds: string[]): boolean {
    const slot = activeSlot
    if (!slot || !slot.ready || slot.closed || pendingSlot) return false
    if (!slot.chunks.length) return false
    const nextChunkIds = splitSubscriptionChunks(nextEntityIds)
    if (nextChunkIds.length !== slot.chunks.length) return false
    for (let chunkIndex = 0; chunkIndex < slot.chunks.length; chunkIndex++) {
      const chunk = slot.chunks[chunkIndex]
      chunk.ids = nextChunkIds[chunkIndex]
      try {
        // 增量订阅也要重申批量能力：服务端按连接记录该标志，漏传会退回逐条推送。
        chunk.socket.send(
          JSON.stringify({ type: 'update_subscription', entityIds: chunk.ids, supportsStateBatch: true }),
        )
      } catch {
        // 连接已经不可写：按整槽失败处理（会失效并重连），绝不退回「再建一条连接」。
        slot.fail?.()
        return true
      }
    }
    slot.ids = [...nextEntityIds]
    wantedEntityIds = nextEntityIds
    wantedEntityIdSet = new Set(nextEntityIds)
    // 已经不在订阅集合里的实体不能继续留在槽里：否则 emitStates 之外的地方（如
    // emitPatch / 历史缓存）仍会读到早已退订的旧值。
    for (const staleEntityId of [...slot.stateById.keys()])
      wantedEntityIdSet.has(staleEntityId) || slot.stateById.delete(staleEntityId)
    // 增量订阅后连接仍然健康：重新计心跳，别沿用旧的首帧超时。
    slot.touchHeartbeat?.()
    emitStates()
    return true
  }

  /**
   * 按当前 `wantedEntityIds` 新建一条 pending 连接。
   *
   * 一条连接最多订阅 `MAX_SUBSCRIBE_ENTITIES` 个实体：后端在这个数上直接
   * `close(4400, 'too many entities')`，而 4400 属于**不重试**的终态码 ——
   * 大户型一旦超过，整片灯光会永久停在 unavailable。上游按 `ceil(n/1000)` 拆流，
   * 这里保持同样的分片，只是把 N 条 socket 收进同一个「槽」：
   * 槽仍然是一个交接单位（全部 chunk 收到 snapshot 才晋升），心跳与失败也是整槽判定。
   */
  function openPendingSlot() {
    if (isDisposed || !isStreamActive || !wantedEntityIds.length || pendingSlot) return
    const chunkEntityIds = splitSubscriptionChunks(wantedEntityIds)
    const slot: StreamSlot = {
      ids: [...wantedEntityIds],
      stateById: new Map(),
      ready: false,
      closed: false,
      closeSocket: () => {},
      chunks: [],
    }
    pendingSlot = slot
    // 每个槽只管自己的心跳；重连退避是全流共享的（`reconnectTimerId`），
    // 否则两个槽各退避一份，交接期会出现两倍频率的重连。
    let slotHeartbeatTimerId: any = null,
      readyChunkCount = 0
    const chunkListenerCleanups: Array<() => void> = []
    const clearSlotTimers = () => {
      slotHeartbeatTimerId !== null && clearTimer(slotHeartbeatTimerId), (slotHeartbeatTimerId = null)
    }
    const slotIsAlive = () => !isDisposed && isStreamActive && !slot.closed
    slot.closeSocket = (force = false) => {
      clearSlotTimers()
      for (const cleanupChunkListeners of chunkListenerCleanups) cleanupChunkListeners()
      for (const chunk of slot.chunks)
        try {
          // 正常退役（订阅切换 / 重连交班）时，握手期（CONNECTING）直接 close() 会被浏览器
          // 报「WebSocket is closed before the connection is established」：等握手完成再关。
          // 但 bfcache 冻结前必须强制关：冻结期间 `open` 永远不会来，连接只会被浏览器掐断，
          // 既留下一条 `Page entered Back-Forward Cache`，服务端也要等心跳才发现这条死连接。
          chunk.socket.readyState === 0 && !force
            ? chunk.socket.addEventListener('open', () => chunk.socket.close(), { once: true })
            : chunk.socket.close()
        } catch {
          // 清理期关闭失败无需处理：socket 可能已经没有底层连接。
        }
    }

    function slotFailed(closeCode = 0) {
      if (!slotIsAlive()) return
      // 鉴权类关闭码：整体失效，不再重试（重试只会拿到同样的 4401）。
      if (TERMINAL_CLOSE_CODES.includes(closeCode)) {
        disposeAllSlots()
        emitStates()
        return
      }
      // 只失效「这个槽确实在供数」的那批实体：pending 从未 ready，不牵连任何历史。
      const invalidatedEntityIds =
          activeSlot === slot ? wantedEntityIds.filter((wantedId) => slot.ids.includes(wantedId)) : [],
        wasActive = activeSlot === slot
      activeSlot === slot && (activeSlot = null), pendingSlot === slot && (pendingSlot = null)
      ;(slot.closed = true), slot.closeSocket(), slot.stateById.clear()
      wasActive && invalidatedEntityIds.length && (onInvalidate(invalidatedEntityIds), emitStates()),
        reconnectTimerId === null && scheduleReconnect()
    }

    function scheduleHeartbeatTimeout(heartbeatTimeoutMs: number) {
      slotHeartbeatTimerId !== null && clearTimer(slotHeartbeatTimerId),
        (slotHeartbeatTimerId = setTimer(() => slotFailed(0), heartbeatTimeoutMs))
    }

    // 注入给槽外（增量订阅）用的钩子：失败与心跳都由建槽的闭包管理。
    slot.fail = () => slotFailed(0)
    slot.touchHeartbeat = () => scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS)

    /** 一个分片收到 snapshot：凑齐全部分片才算整槽 ready，然后晋升。 */
    function chunkSnapshotReady() {
      readyChunkCount += 1
      if (readyChunkCount < chunkEntityIds.length) {
        scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS)
        return
      }
      ;(slot.ready = true), (reconnectAttempt = 0), scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS)
      // 晋升：旧 active 交完班才退役，交接期两边都在，但 active 的值优先。
      if (pendingSlot === slot) {
        const previousActiveSlot = activeSlot
        ;(activeSlot = slot), (pendingSlot = null)
        retireSlot(previousActiveSlot)
      }
      emitStates()
    }

    function connectChunk(chunkIds: string[]) {
      let chunkSocket: WebSocket
      try {
        chunkSocket = createSocket(typeof resolveSocketUrl == 'function' ? resolveSocketUrl() : resolveSocketUrl)
      } catch {
        scheduleReconnect()
        return false
      }
      const chunk: StreamChunk = { socket: chunkSocket, ids: chunkIds, ready: false }
      slot.chunks.push(chunk)
      const socketHandlers: Record<string, (event: any) => void> = {
        open() {
          if (!slotIsAlive()) return
          try {
            // 声明支持批量帧：服务端会把「一次场景切换产生的几十条状态」合成一帧发过来。
            // 不声明时只能逐条收 —— 全屋开灯/关灯这类操作会被放大成同倍数的解析与重绘。
            chunkSocket.send(JSON.stringify({ type: 'subscribe', entityIds: chunk.ids, supportsStateBatch: true }))
          } catch {
            slotFailed()
          }
        },
        message(messageEvent: any) {
          if (!slotIsAlive()) return
          let messagePayload
          try {
            messagePayload = JSON.parse(messageEvent.data)
          } catch {
            return
          }
          if (!messagePayload || typeof messagePayload != 'object') return
          if (messagePayload.type === 'resync_required') {
            // 与上游一致：重同步会失效一次，但立刻新建连接，不等退避。
            slotFailed(), cancelReconnect(), openPendingSlot()
            return
          }
          if (messagePayload.type === 'snapshot' && Array.isArray(messagePayload.states)) {
            applySnapshotStates(slot, chunk.ids, messagePayload.states)
            if (chunk.ready) {
              // 增量订阅后的补快照：整槽已经 ready，只需要把新值刷出去，不参与晋升计数。
              scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS)
              emitStates()
              return
            }
            chunk.ready = true
            chunkSnapshotReady()
            return
          }
          if (!slot.ready) return
          if (messagePayload.type === 'cover_memory_changed') {
            // 记忆是低频增量：只通知调用方重取，不影响状态表。
            onCoverMemory(typeof messagePayload.entityId == 'string' ? messagePayload.entityId : undefined),
              scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS)
            return
          }
          if (applySingleEvent(slot, messagePayload)) {
            scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS)
            emitPatch(messagePayload.entityId)
            return
          }
          if (messagePayload.type === 'state_changed_batch' && Array.isArray(messagePayload.events)) {
            // 批量帧：逐条落地后**一次**通知，避免 N 条事件触发 N 次重绘。
            if (applyBatchEvents(slot, messagePayload.events)) {
              scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS)
              emitStates()
            }
            return
          }
          messagePayload.type === 'ping' && scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS)
        },
        close(closeEvent: any) {
          slotFailed(closeEvent?.code ?? 0)
        },
        error() {
          slotFailed()
        },
      }
      const cleanupChunkListeners = () =>
        chunkListenerCleanups.push(() => {
          for (const [handlerName, handler] of Object.entries(socketHandlers))
            chunkSocket.removeEventListener(handlerName, handler)
        })
      for (const [handlerName, handler] of Object.entries(socketHandlers))
        chunkSocket.addEventListener(handlerName, handler)
      cleanupChunkListeners()
      return true
    }

    if (chunkEntityIds.some((chunkIds) => !connectChunk(chunkIds))) {
      // 有一条分片连不上：整槽不能用（凑不齐 snapshot 会一直卡住），直接按失败处理。
      slotFailed()
      return
    }
    scheduleHeartbeatTimeout(FIRST_RESPONSE_TIMEOUT_MS)
  }

  return {
    configure(entityIds: string[] = [], { additionalEntityIds = [] }: { additionalEntityIds?: string[] } = {}) {
      if (isDisposed) return
      const additionalEntityIdSet = new Set(
          additionalEntityIds.filter(
            (additionalCandidateId) =>
              typeof additionalCandidateId == 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(additionalCandidateId),
          ),
        ),
        nextSubscribedEntityIds = [
          ...new Set(
            entityIds.filter(
              (candidateEntityId) =>
                typeof candidateEntityId == 'string' &&
                (additionalEntityIdSet.has(candidateEntityId) ||
                  /^(light|switch|climate|cover|binary_sensor|event|input_boolean|sensor|media_player|vacuum|camera|image|script|button)\.[a-z0-9_]+$/.test(
                    candidateEntityId,
                  )),
            ),
          ),
        ].sort()
      if (
        nextSubscribedEntityIds.length === wantedEntityIds.length &&
        nextSubscribedEntityIds.every(
          (sortedEntityId, entityIdIndex) => sortedEntityId === wantedEntityIds[entityIdIndex],
        )
      )
        return
      cancelReconnect(), (reconnectAttempt = 0)
      // 首选：在现有连接上增量换订阅（不新建连接、不重复快照）。
      if (tryUpdateActiveSubscription(nextSubscribedEntityIds)) return
      // 退化到两槽交接（分片边界变化 / 活跃槽还没 ready）：
      // pending 是按旧集合建的，订阅变了就没用了；active **保留**，
      // 它继续供交集部分的值，直到新连接拿到 snapshot。
      pendingSlot !== null && (retireSlot(pendingSlot), (pendingSlot = null)),
        (wantedEntityIds = nextSubscribedEntityIds),
        (wantedEntityIdSet = new Set(wantedEntityIds))
      if (activeSlot && !activeSlot.ids.some((activeSlotId) => wantedEntityIdSet.has(activeSlotId))) {
        retireSlot(activeSlot), (activeSlot = null)
      }
      emitStates(), openPendingSlot()
    },
    setActive(isActiveNext: boolean) {
      isDisposed ||
        isStreamActive === (isActiveNext === true) ||
        ((isStreamActive = isActiveNext === true),
        (reconnectAttempt = 0),
        isStreamActive ? openPendingSlot() : (disposeAllSlots(), emitStates()))
    },
    /**
     * 进入 bfcache 前主动断开。
     *
     * 与 `setActive(false)` 的差别是**保留**订阅列表与已收到的状态：页面只是被冻结，
     * 既没有换页也没有改订阅，回来时应当先按旧值渲染再被新快照覆盖。
     *
     * 这里用 `parkSlot`（只关 socket、留状态）而不是退役：`activeSlot.ready` 仍是 true，
     * `emitStates()` 继续吐出冻结前的最后一批值，所以后退回来不会闪一遍空数据。
     */
    suspend() {
      if (isDisposed) return
      wasActiveBeforePageCache = wasActiveBeforePageCache || isStreamActive
      cancelReconnect(), parkSlot(pendingSlot), (pendingSlot = null), parkSlot(activeSlot)
    },
    /**
     * 从 bfcache 恢复后立刻重连。
     *
     * 不能只依赖心跳超时：那意味着最长 65s 的旧值。这里先把退避计数清零再开连，
     * 避免沿用冻结前攒下的失败次数而多等几轮。
     *
     * 冻结期间 `visibilitychange` 可能已经把流 `setActive(false)` 掉，所以按
     * `wasActiveBeforePageCache` 恢复激活态，而不是只看此刻的 `isStreamActive`。
     */
    resume() {
      if (isDisposed) return
      const shouldRestore = wasActiveBeforePageCache
      if (((wasActiveBeforePageCache = false), !shouldRestore || !wantedEntityIds.length)) return
      isStreamActive = true
      // 冻结期间 park 掉的槽已经关了 socket：退役它（状态已被新连接接管），再开新的。
      activeSlot !== null && !activeSlot.stateById.size && (retireSlot(activeSlot), (activeSlot = null)),
        (reconnectAttempt = 0),
        pendingSlot || openPendingSlot()
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        (isStreamActive = false),
        (wasActiveBeforePageCache = false),
        disposeAllSlots({ notify: false }),
        (wantedEntityIds = []),
        wantedEntityIdSet.clear())
    },
  }
}

/**
 * 把快照写进分片槽。
 *
 * 按**当前**订阅集合过滤：``update_subscription`` 之后该分片的 ids 已经换过，
 * 用建连时冻结的那份会把新实体的快照全部丢掉。
 */
function applySnapshotStates(slot: { stateById: Map<string, unknown> }, ids: string[], states: unknown[]): void {
  for (const snapshotState of states) {
    const row = snapshotState as { entityId?: unknown; state?: unknown } | null
    if (!row || typeof row.entityId != 'string' || !ids.includes(row.entityId)) continue
    if (typeof row.state != 'string') continue
    slot.stateById.set(row.entityId, structuredClone(row))
  }
}

/**
 * 单实体增量（`state_changed` / `state_removed`）；返回是否为本槽订阅的实体。
 *
 * 两条事件的处理只差「写入 / 删除」，收敛到一个函数后 message 处理器的分支数
 * 不会再随消息类型线性增长。
 */
function applySingleEvent(
  slot: { ids: string[]; stateById: Map<string, unknown> },
  message: { type?: unknown; entityId?: unknown; state?: unknown },
): boolean {
  if (typeof message.entityId != 'string' || !slot.ids.includes(message.entityId)) return false
  if (message.type === 'state_removed') {
    slot.stateById.delete(message.entityId)
    return true
  }
  if (message.type === 'state_changed') {
    if (typeof message.state != 'string') return false
    slot.stateById.set(message.entityId, structuredClone(message))
    return true
  }
  return false
}

/**
 * 把一批状态事件写进分片槽；返回是否有任何实体真的被写入。
 *
 * 只写本槽订阅的实体（``slot.ids``），并过滤掉没有 ``state`` 的畸形帧 ——
 * 批量帧来自服务端聚合，个别条目损坏不应该让整帧作废。
 */
function applyBatchEvents(slot: { ids: string[]; stateById: Map<string, unknown> }, events: unknown[]): boolean {
  let touched = false
  for (const event of events) {
    const row = event as { entityId?: unknown; state?: unknown } | null
    if (!row || typeof row.entityId != 'string' || !slot.ids.includes(row.entityId)) continue
    if (typeof row.state != 'string') continue
    slot.stateById.set(row.entityId, structuredClone(row))
    touched = true
  }
  return touched
}
