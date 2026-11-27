import { domElement } from '@app/shared/util/dom-factory'
import { mediaDeviceProfile } from '@app/bridge/presets'
import { createStageDeviceVisual } from '../core/stage-device-visual'
import { isWarmSceneStyle } from '@app/shared/scene-styles'
import { drawCoveredScreenImage, screenUploadSource } from '@app/shared/display-image-source'
import { drawTelevisionGlass as drawGlass } from '@app/shared/scene/studio-television-glass'
import { drawTelevisionPoster as drawPosterArt } from '@app/shared/scene/studio-television-poster'
import { dashboardCanvasFont } from '@app/shared/dashboard-fonts'
import { DEVICE_STATUS_NORMAL_COLOR } from '../device/device'

export function createTelevisionPanel({
  onControl: onControl = async () => {},
}: {
  onControl?: (command?: any) => any
} = {}) {
  const createElement = (tag: any, className: any) => domElement(document, tag, className),
    rootElement = createElement('div', 'i3d-television-panel'),
    headingElement = createElement('div', 'i3d-nas-heading i3d-popup-heading'),
    titleElement = createElement('h3', ''),
    statusElement = createElement('span', 'i3d-tv-status'),
    contentElement = createElement('div', 'i3d-tv-content'),
    artworkElement = createElement('img', 'i3d-tv-artwork'),
    detailsElement = createElement('div', 'i3d-tv-details'),
    mediaTitleElement = createElement('strong', ''),
    mediaMetaElement = createElement('span', ''),
    progressElement = createElement('progress', ''),
    timeElement = createElement('span', 'i3d-tv-time'),
    powerOnButton = createElement('button', 'i3d-tv-power'),
    powerOffButton = createElement('button', 'i3d-tv-power'),
    errorElement = createElement('p', 'i3d-tv-error')
  ;(powerOnButton.type = powerOffButton.type = 'button'), errorElement.setAttribute('role', 'status')
  const actionsElement = createElement('div', 'i3d-tv-actions')
  actionsElement.setAttribute('role', 'group'), actionsElement.setAttribute('aria-label', '电视播放控制')
  const mediaButtons = ['previous', 'play', 'next'].map((action) => {
    const createdButton = createElement('button', '')
    return (
      (createdButton.type = 'button'),
      createdButton.addEventListener('click', async () => {
        if (isMediaControlBusy()) return
        const mediaControl = televisionMediaControl(viewModel.item, viewModel.states, action)
        if (!mediaControl.enabled) return
        // 媒体请求与开关机同款代次：记录本次请求归属的设备身份，回调只认「还是同一台设备、
        // 同一次挂载、并且这条请求还没被后来的点击顶掉」时才落错误 / 解除忙碌。
        const instanceAtSend = instanceId,
          mediaKey = currentDeviceKey(),
          mediaRequest = { key: mediaKey, instanceId: instanceAtSend }
        pendingMedia = mediaRequest
        ;(isBusy = true), (errorElement.textContent = ''), render()
        try {
          await onControl(mediaControl.command)
        } catch (error: any) {
          isMediaRequestLive(mediaRequest, instanceAtSend) &&
            mediaKey === currentDeviceKey() &&
            (errorElement.textContent = error?.message || '播放控制失败，请重试。')
        } finally {
          if (isMediaRequestLive(mediaRequest, instanceAtSend)) {
            ;(isBusy = false), (pendingMedia = null), render()
          } else if (pendingMedia === mediaRequest) pendingMedia = null
        }
      }),
      actionsElement.append(createdButton),
      {
        action: action,
        button: createdButton,
      }
    )
  })
  ;(artworkElement.hidden = true),
    (artworkElement.alt = '正在播放的内容封面'),
    artworkElement.addEventListener('error', () => {
      artworkElement.hidden = true
    })
  const headingTextElement = createElement('div', 'i3d-popup-heading-text'),
    powerActionsElement = createElement('div', 'i3d-popup-power-actions')
  const deviceVisual = createStageDeviceVisual({
    kind: 'television',
    onActivate: () => {
      if (!viewModel || isDisposed) return
      const powerState = televisionPower(viewModel.item, viewModel.states)
      if (!powerState.available || !powerState.supported) return
      const effectiveOn = pendingPower !== null ? !!pendingPower : !!powerState.on
      sendPower(!effectiveOn)
    },
  })
  headingTextElement.append(titleElement, statusElement),
    powerActionsElement.append(powerOnButton, powerOffButton),
    powerActionsElement.classList.add('is-visual-replaced'),
    headingElement.append(headingTextElement, powerActionsElement, deviceVisual.root),
    detailsElement.append(mediaTitleElement, mediaMetaElement, progressElement, timeElement),
    contentElement.append(artworkElement, detailsElement)
  const bodyElement = createElement('div', 'i3d-popup-body')
  bodyElement.append(contentElement, actionsElement, errorElement),
    rootElement.append(headingElement, bodyElement),
    (rootElement.hidden = true)
  let viewModel: any,
    artworkUrl = '',
    progressTimerId: any = null,
    pendingPower: any = null,
    /** 进行中的媒体请求：`{ key, instanceId }`，`null` 表示空闲。 */
    pendingMedia: { key: string; instanceId: number } | null = null,
    powerTimeoutId: any = null,
    instanceId = 0,
    isDisposed = false,
    isBusy = false,
    isPowerConfirmed = false
  /**
   * 当前设备的身份键。只用于「这次回调还属不属于同一台设备」的判定：
   * 同层换型号、换实体都会得到新键，旧请求的回调随即作废。
   */
  function currentDeviceKey() {
    const item = viewModel?.item || {},
      mediaProfile = mediaDeviceProfile(item.deviceKind) || mediaDeviceProfile('television')!
    return JSON.stringify([
      mediaProfile.modelType,
      item.id || '',
      item.floorId || '',
      item.modelId || '',
      item.entityId || '',
      item.powerEntityId || '',
    ])
  }
  /** 渲染用的媒体 profile：投影仪与电视共用一套弹窗，只有文案与屏幕图层不同。 */
  function currentMediaProfile() {
    return mediaDeviceProfile(viewModel?.item?.deviceKind) || mediaDeviceProfile('television')!
  }
  function clearPendingPower() {
    powerTimeoutId !== null && clearTimeout(powerTimeoutId),
      (powerTimeoutId = null),
      (pendingPower = null),
      (isPowerConfirmed = false)
  }
  async function sendPower(powerOn: any) {
    if (!viewModel || isDisposed || viewModel.editing || isBusy) return
    // 已在朝该目标切换时忽略；允许反向再点一次（取消/改发对面状态）
    if (pendingPower !== null && pendingPower === powerOn) return
    const powerControl = televisionPower(viewModel.item, viewModel.states, powerOn)
    if (!powerControl.available || !powerControl.supported) return
    const powerInstanceAtSend = instanceId
    powerTimeoutId !== null && clearTimeout(powerTimeoutId),
      (pendingPower = powerOn),
      (isPowerConfirmed = false),
      (errorElement.textContent = ''),
      render(),
      (powerTimeoutId = setTimeout(() => {
        !isDisposed && instanceId === powerInstanceAtSend && (clearPendingPower(), render())
      }, 14000))
    try {
      await onControl(powerControl.command),
        !isDisposed &&
          powerInstanceAtSend === instanceId &&
          pendingPower === powerOn &&
          ((isPowerConfirmed = true), render())
    } catch (powerError: any) {
      !isDisposed &&
        powerInstanceAtSend === instanceId &&
        pendingPower === powerOn &&
        (clearPendingPower(), (errorElement.textContent = powerError?.message || '开关机失败，请重试。'), render())
    }
  }
  powerOnButton.addEventListener('click', () => sendPower(true)),
    powerOffButton.addEventListener('click', () => sendPower(false))
  /**
   * 时间轴 / 进度条的独立刷新。
   *
   * 播放中 `position` 由 `media_position_updated_at` 推算，必须每秒重算；
   * 秒级定时器只需重绘这一小段，而不是整个面板（标题、封面、按钮、设备视觉）。
   */
  function renderTimeline(state: any) {
    ;(progressElement.hidden = timeElement.hidden = false),
      (progressElement.max = state.duration || 1),
      (progressElement.value = state.position || 0),
      (timeElement.textContent = televisionTime(state.position) + ' / ' + televisionTime(state.duration))
  }
  /** 秒级定时器：面板隐藏或已销毁时跳过，播放结束后自动停表。 */
  function renderTimelineTick() {
    if (!viewModel || isDisposed || rootElement.hidden) return
    const state = televisionState(viewModel.item, viewModel.states)
    renderTimeline(state)
    if (!state.playing && progressTimerId !== null) {
      clearInterval(progressTimerId)
      progressTimerId = null
    }
  }

  /** 播放控制此刻是否该被拦下：没选设备、编辑预览、正在忙，或已有请求在途。 */
  function isMediaControlBusy() {
    return !viewModel || isDisposed || viewModel.editing || isBusy || pendingPower !== null || pendingMedia !== null
  }

  /** 这条媒体请求的回调还算不算数：同一挂载、同一条请求，面板也没被销毁。 */
  function isMediaRequestLive(mediaRequest: { key: string; instanceId: number }, instanceAtSend: number) {
    return !isDisposed && instanceAtSend === instanceId && pendingMedia === mediaRequest
  }

  /** 开关机按钮此刻能不能点：编辑预览、忙碌、已在本方向请求中都算不能。 */
  function isPowerButtonDisabled(
    desiredOn: boolean,
    isMediaPending: boolean,
    control: ReturnType<typeof televisionPower>,
  ) {
    return (
      !!viewModel.editing ||
      isBusy ||
      isMediaPending ||
      (pendingPower !== null && pendingPower === desiredOn) ||
      !control.available ||
      !control.supported
    )
  }

  /** 开关机按钮：文案、禁用与提示都跟随「当前这一次」请求的代次。 */
  function renderPowerButtons(mediaProfile: { label: string }, isMediaPending: boolean): void {
    for (const [powerButton, desiredOn] of [
      [powerOnButton, true],
      [powerOffButton, false],
    ] as const) {
      const buttonControl = televisionPower(viewModel.item, viewModel.states, desiredOn)
      ;(powerButton.textContent =
        pendingPower === desiredOn ? (desiredOn ? '开机中…' : '关机中…') : desiredOn ? '开机' : '关机'),
        powerButton.setAttribute('aria-label', (desiredOn ? '开启' : '关闭') + mediaProfile.label),
        (powerButton.disabled = isPowerButtonDisabled(desiredOn, isMediaPending, buttonControl)),
        (powerButton.title = viewModel.editing ? '编辑预览不可控制设备' : buttonControl.reason)
    }
  }

  /** 上一集 / 播放暂停 / 下一集：与开关机按钮同一套忙碌门控。 */
  function renderMediaButtons(effectivePlaying: boolean, isMediaPending: boolean): void {
    for (const { action: mediaAction, button: mediaButton } of mediaButtons) {
      const mediaControlState = televisionMediaControl(viewModel.item, viewModel.states, mediaAction)
      ;(mediaButton.textContent =
        mediaAction === 'previous' ? '上一集' : mediaAction === 'next' ? '下一集' : effectivePlaying ? '暂停' : '播放'),
        mediaButton.setAttribute('aria-label', mediaButton.textContent),
        (mediaButton.disabled =
          !!viewModel.editing || isBusy || pendingPower !== null || isMediaPending || !mediaControlState.enabled),
        (mediaButton.title = mediaControlState.enabled ? '' : '当前设备状态或播放器不支持此操作')
    }
  }

  /** 电源状态回报到位后清掉「开机中 / 关机中」：四件事同时成立才算这一次请求成功。 */
  function reconcilePowerConfirmation(powerState: ReturnType<typeof televisionPower>): void {
    if (isPowerConfirmed && pendingPower !== null && pendingPower === powerState.on && powerState.available)
      clearPendingPower()
  }

  function render() {
    if (!viewModel) return
    const mediaProfile = currentMediaProfile(),
      deviceKey = currentDeviceKey(),
      state = televisionState(viewModel.item, viewModel.states),
      powerState = televisionPower(viewModel.item, viewModel.states)
    // 设备换了，上一台设备的媒体请求就作废，别让「忙碌」卡在新设备上。
    pendingMedia && pendingMedia.key !== deviceKey && (pendingMedia = null)
    const isMediaPending = pendingMedia !== null
    actionsElement.setAttribute('aria-label', mediaProfile.label + '播放控制')
    reconcilePowerConfirmation(powerState)
    const effectiveOn = pendingPower !== null ? !!pendingPower : !!state.on,
      effectivePlaying = effectiveOn && !!state.playing
    renderPowerButtons(mediaProfile, isMediaPending)
    rootElement.setAttribute('aria-busy', String(pendingPower !== null || isMediaPending))
    renderMediaButtons(effectivePlaying, isMediaPending)
    ;(titleElement.textContent = state.name),
      (statusElement.textContent = pendingPower !== null ? (pendingPower ? '开机中…' : '关机中…') : state.status),
      (mediaTitleElement.textContent = effectiveOn ? state.title : state.status),
      (mediaMetaElement.textContent = [state.app, state.artist].filter(Boolean).join(' · ') || '—'),
      (mediaMetaElement.hidden = false),
      state.artwork !== artworkUrl &&
        ((artworkUrl = state.artwork),
        (artworkElement.hidden = !artworkUrl),
        artworkUrl
          ? ((artworkElement.hidden = true),
            (artworkElement.onload = () => {
              viewModel && artworkUrl === state.artwork && (artworkElement.hidden = false)
            }),
            (artworkElement.src = artworkUrl))
          : artworkElement.removeAttribute('src')),
      renderTimeline(state),
      !effectivePlaying && progressTimerId !== null && (clearInterval(progressTimerId), (progressTimerId = null))
    const canTogglePower = powerState.available && powerState.supported && !viewModel.editing && !isBusy
    deviceVisual.sync({
      kind: 'television',
      on: effectiveOn,
      available: !!powerState.available,
      playing: effectivePlaying,
      busy: pendingPower !== null || isMediaPending || isBusy,
      disabled: !canTogglePower,
      interactive: canTogglePower,
      label: state.name || mediaProfile.label,
      artworkUrl: state.artwork || null,
    })
  }
  return {
    root: rootElement,
    update(nextViewModel: any) {
      viewModel?.item.id !== nextViewModel.item.id &&
        (instanceId++, (isBusy = false), (pendingMedia = null), clearPendingPower(), (errorElement.textContent = '')),
        (viewModel = nextViewModel),
        render(),
        televisionState(nextViewModel.item, nextViewModel.states).playing &&
          progressTimerId === null &&
          (progressTimerId = setInterval(renderTimelineTick, 1000))
    },
    hide() {
      ;(rootElement.hidden = true),
        (pendingMedia = null),
        progressTimerId !== null && clearInterval(progressTimerId),
        (progressTimerId = null)
    },
    dispose() {
      ;(isDisposed = true),
        instanceId++,
        clearPendingPower(),
        this.hide(),
        (viewModel = null),
        artworkElement.removeAttribute('src'),
        deviceVisual.dispose(),
        rootElement.remove()
    },
  }
}

function drawPoster(posterCanvas: any, canvasPainter: any, posterState: any) {
  // 待机画面直接复用编辑态那张满幅宣传画（960×540 坐标系，512×288 画布同样等比），
  // 再在底部状态条右侧盖一枚播放状态胶囊——旧版只画一行居中文字，电视看上去就是一块黑屏。
  drawPosterArt(posterCanvas, canvasPainter)
  const statusText = posterState.playing
      ? '正在播放中'
      : !posterState.idle && posterState.state === 'paused'
        ? '已暂停'
        : !posterState.idle && posterState.state === 'buffering'
          ? '正在缓冲'
          : '暂未播放',
    statusColor = posterState.playing
      ? '#32c59b'
      : !posterState.idle && posterState.state === 'paused'
        ? '#ff9f36'
        : '#6d8398',
    artScale = posterCanvas.width / 960
  canvasPainter.save(),
    canvasPainter.scale(artScale, artScale),
    (canvasPainter.fillStyle = 'rgba(7,17,29,0.86)'),
    canvasPainter.beginPath(),
    canvasPainter.roundRect(602, 492, 300, 40, 20),
    canvasPainter.fill(),
    (canvasPainter.fillStyle = statusColor),
    canvasPainter.beginPath(),
    canvasPainter.arc(624, 512, 5, 0, Math.PI * 2),
    canvasPainter.fill(),
    (canvasPainter.fillStyle = '#f4f8fb'),
    (canvasPainter.font = dashboardCanvasFont('600 16px', 'Arial, sans-serif')),
    (canvasPainter.textAlign = 'center'),
    canvasPainter.fillText(statusText, 760, 518),
    canvasPainter.restore()
}
export function createTelevisionScreens({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
}: {
  THREE?: any
  requestFrame?: (floorIds: any[]) => void
} = {}) {
  let syncedRoot: any,
    syncedRevision: any,
    screensByLocation = new Map(),
    modelsByLocation = new Map(),
    isDisposed = false
  const sceneModelKey = (locationSource: any) => JSON.stringify([locationSource.floorId, locationSource.modelId])
  function releaseScreen(targetEntry: any) {
    if (!targetEntry.removed) {
      ;(targetEntry.removed = true),
        targetEntry.screen.geometry.removeEventListener('dispose', targetEntry.onGeometryDispose),
        targetEntry.generation++,
        targetEntry.screen.material === targetEntry.materials && (targetEntry.screen.material = targetEntry.original)
      for (const [glow, wasVisible] of targetEntry.glows) glow.visible = wasVisible
      targetEntry.texture.dispose(), targetEntry.material.dispose()
    }
  }
  function renderScreen(entry: any) {
    if (isDisposed) return
    const { canvas: canvas, context: screenPainter, state: state, image: image } = entry
    if (
      ((screenPainter.fillStyle = '#050609'),
      state.on
        ? screenPainter.fillRect(0, 0, canvas.width, canvas.height)
        : drawGlass(canvas, screenPainter, isWarmSceneStyle(entry.screen.userData?.sceneStyle)),
      state.on && image)
    ) {
      // 铺满（cover）而不是等比内嵌（contain）：电视上留黑边就是「画面没有全屏」。
      // 内容超出画布的部分交给画布裁剪，宁可裁掉一点也不能露边。
      drawCoveredScreenImage(screenPainter, image, canvas.width, canvas.height)
    } else state.on && drawPoster(canvas, screenPainter, state)
    ;(entry.texture.needsUpdate = true), requestFrame([entry.floorId])
  }
  return {
    sync({
      root: root,
      revision: revision,
      bindings: bindings = [],
      states: states = {},
      focusedModel: focusedModel = '',
      dimStrength: dimStrength = 70,
    }: any) {
      if (isDisposed) return
      ;(syncedRoot !== root || syncedRevision !== revision) &&
        ((syncedRoot = root),
        (syncedRevision = revision),
        (modelsByLocation = new Map()),
        syncedRoot?.traverse((sceneObject: any) => {
          sceneObject.userData?.environmentModelType === 'tv' &&
            modelsByLocation.set(
              JSON.stringify([sceneObject.userData.environmentFloorId, sceneObject.userData.environmentModelId]),
              sceneObject,
            )
        }))
      const activeLocationSet = new Set(),
        bindingsByLocation = new Map()
      for (const [modelLocation, locatedModel] of modelsByLocation)
        bindingsByLocation.set(modelLocation, {
          floorId: locatedModel.userData.environmentFloorId,
          modelId: locatedModel.userData.environmentModelId,
        })
      for (const [screenLocation, existingScreenEntry] of screensByLocation)
        bindingsByLocation.has(screenLocation) ||
          bindingsByLocation.set(screenLocation, {
            floorId: existingScreenEntry.floorId,
            modelId: existingScreenEntry.modelId,
          })
      for (const binding of bindings)
        binding.visible !== false && bindingsByLocation.set(sceneModelKey(binding), binding)
      for (const bindingEntry of bindingsByLocation.values()) {
        const location = sceneModelKey(bindingEntry),
          model = modelsByLocation.get(location)
        if ((activeLocationSet.add(location), !model)) continue
        let screenMesh: any
        if (
          (model.traverse((candidate: any) => {
            candidate.userData?.televisionScreen && (screenMesh = candidate)
          }),
          !screenMesh)
        )
          continue
        activeLocationSet.add(location)
        let screenEntry = screensByLocation.get(location)
        if (
          (screenEntry &&
            screenEntry.screen !== screenMesh &&
            (releaseScreen(screenEntry), screensByLocation.delete(location), (screenEntry = null)),
          !screenEntry)
        ) {
          const canvasElement = document.createElement('canvas')
          ;(canvasElement.width = 512), (canvasElement.height = 288)
          const posterPainter = canvasElement.getContext('2d')
          if (!posterPainter) continue
          const texture = new THREE.CanvasTexture(canvasElement)
          texture.colorSpace = THREE.SRGBColorSpace
          const material = new THREE.MeshBasicMaterial({
              map: texture,
              toneMapped: false,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
            }),
            originalMaterial = screenMesh.material,
            materials = Array.from(
              {
                length: 6,
              },
              (_element, index) =>
                index === 4 ? material : Array.isArray(originalMaterial) ? originalMaterial[index] : originalMaterial,
            ),
            glows: any = []
          model.traverse((childObject: any) => {
            childObject.userData?.televisionGlow &&
              (glows.push([childObject, childObject.visible]), (childObject.visible = false))
          }),
            (screenEntry = {
              floorId: bindingEntry.floorId,
              modelId: bindingEntry.modelId,
              screen: screenMesh,
              original: originalMaterial,
              materials: materials,
              material: material,
              canvas: canvasElement,
              context: posterPainter,
              texture: texture,
              glows: glows,
              generation: 0,
              artwork: '',
              customPoster: '',
              signature: '',
              image: null as any,
            })
          const createdEntry = screenEntry
          ;(screenEntry.onGeometryDispose = () => {
            releaseScreen(createdEntry),
              screensByLocation.get(location) === createdEntry && screensByLocation.delete(location)
          }),
            screenMesh.geometry.addEventListener('dispose', screenEntry.onGeometryDispose),
            (screenMesh.material = materials),
            screensByLocation.set(location, screenEntry)
        }
        const deviceState = televisionState(bindingEntry, states),
          signature = JSON.stringify([
            deviceState.on,
            deviceState.status,
            deviceState.title,
            deviceState.app,
            deviceState.name,
            deviceState.artwork,
            deviceState.customPosterUrl,
            bindingEntry.screenImage?.assetId || '',
          ])
        screenEntry.state = deviceState
        const colorLevel = focusedModel && focusedModel !== location ? Math.max(0.1, 1 - dimStrength / 100) : 1
        if (
          (screenEntry.material.color.r !== colorLevel &&
            (screenEntry.material.color.setRGB(colorLevel, colorLevel, colorLevel),
            requestFrame([screenEntry.floorId])),
          screenEntry.signature !== signature)
        ) {
          const nextScreenImageUrl = deviceState.artwork || (deviceState.on ? deviceState.customPosterUrl : '')
          if (
            ((screenEntry.signature = signature),
            screenEntry.artwork !== deviceState.artwork || screenEntry.customPoster !== deviceState.customPosterUrl)
          ) {
            screenEntry.artwork = deviceState.artwork
            screenEntry.customPoster = deviceState.customPosterUrl
            const previousImage = screenEntry.image
            screenEntry.image = null
            const generation = ++screenEntry.generation
            if (nextScreenImageUrl) {
              let retryCount = 0
              const loadScreenImage = () => {
                if (
                  isDisposed ||
                  generation !== screenEntry.generation ||
                  screensByLocation.get(location) !== screenEntry
                )
                  return
                const loadedImage = new Image()
                loadedImage.onload = () => {
                  !isDisposed &&
                    generation === screenEntry.generation &&
                    screensByLocation.get(location) === screenEntry &&
                    ((screenEntry.image = loadedImage), renderScreen(screenEntry))
                }
                loadedImage.onerror = () => {
                  if (
                    isDisposed ||
                    generation !== screenEntry.generation ||
                    screensByLocation.get(location) !== screenEntry
                  )
                    return
                  if (retryCount < 2 && (typeof navigator == 'undefined' || navigator.onLine !== false)) {
                    retryCount += 1
                    // 指数退避（1s → 2s），对齐 0.8.9 的 `1000 * 2 ** n`：
                    // 小米电视封面每次都要现截屏，连着重试只会把上游 5xx 放大。
                    setTimeout(loadScreenImage, Math.min(30_000, 1000 * 2 ** (retryCount - 1)))
                    return
                  }
                  // 重试用尽：保留上一帧（后端也可能已回落旧帧），别把屏幕切成待机宣传画。
                  ;(screenEntry.image = previousImage), renderScreen(screenEntry)
                }
                loadedImage.src =
                  screenUploadSource(nextScreenImageUrl, screenEntry.canvas.width, screenEntry.canvas.height, {
                    fit: 'cover',
                    still: true,
                  }) +
                  (nextScreenImageUrl.includes('?') ? '&' : '?') +
                  'hb_retry=' +
                  retryCount
              }
              loadScreenImage()
            } else renderScreen(screenEntry)
          } else renderScreen(screenEntry)
        }
      }
      for (const [staleLocation, staleEntry] of screensByLocation)
        activeLocationSet.has(staleLocation) ||
          (releaseScreen(staleEntry), screensByLocation.delete(staleLocation), requestFrame([staleEntry.floorId]))
    },
    dispose() {
      isDisposed = true
      for (const disposedEntry of screensByLocation.values()) releaseScreen(disposedEntry)
      screensByLocation.clear(), modelsByLocation.clear(), (syncedRoot = null)
    },
  }
}

const readEntityState = (stateSource: any, entityId: any) =>
  stateSource instanceof Map ? stateSource.get(entityId) : stateSource?.[entityId]

/** 媒体设备种类缺省值：老配置不一定写 `deviceKind`，按电视处理。 */
function mediaProfileOf(mediaConfig: { deviceKind?: string } | null | undefined) {
  return mediaDeviceProfile(mediaConfig?.deviceKind) || mediaDeviceProfile('television')!
}

/** ``screenImage.assetId`` 形如 ``user:<32hex>``。 */
export function televisionScreenImage(televisionConfig: any = {}) {
  const assetId = televisionConfig?.screenImage?.assetId
  if (typeof assetId == 'string' && /^user:[0-9a-f]{32}$/i.test(assetId.trim())) return assetId.trim().toLowerCase()
  return ''
}

function televisionPosterAssetUrl(televisionConfig: any) {
  const assetId = televisionScreenImage(televisionConfig)
  return assetId ? '/api/v1/assets/user/' + assetId.slice(5) : ''
}
export function televisionArtwork(
  artworkAttributes: { entity_picture_local?: any; entity_picture?: any; media_image_url?: any } = {},
) {
  return (
    [artworkAttributes.entity_picture_local, artworkAttributes.entity_picture, artworkAttributes.media_image_url].find(
      (candidateArtworkUrl) =>
        typeof candidateArtworkUrl == 'string' &&
        /^\/api\/(?:media_player_proxy|image_proxy)\/[^\s]+$/.test(candidateArtworkUrl),
    ) || ''
  )
}
export function televisionState(televisionConfig: any, entityStateStore: Record<string, any> = {}, nowMs = Date.now()) {
  const mediaProfile = mediaProfileOf(televisionConfig),
    stateEntry = readEntityState(entityStateStore, televisionConfig.entityId),
    entityState = stateEntry?.newState || stateEntry || {},
    stateAttributes = entityState.attributes || {},
    normalizedState = String(entityState.state || 'unknown').toLowerCase(),
    isMediaAvailable =
      !!televisionConfig.entityId &&
      entityState.available !== false &&
      !['unknown', 'unavailable', ''].includes(normalizedState),
    isMediaOn = isMediaAvailable && !['off', 'standby'].includes(normalizedState),
    powerState = televisionPower(televisionConfig, entityStateStore),
    isAvailable = televisionConfig.powerEntityId ? powerState.available : isMediaAvailable,
    isOn = televisionConfig.powerEntityId ? powerState.on : isMediaOn,
    isIdle = isOn && (!isMediaOn || ['on', 'idle'].includes(normalizedState)),
    parseFiniteNumber = (rawInput: any) =>
      rawInput !== null && rawInput !== '' && Number.isFinite(Number(rawInput)) ? Number(rawInput) : null,
    mediaDurationSeconds = parseFiniteNumber(stateAttributes.media_duration),
    mediaPositionSeconds = parseFiniteNumber(stateAttributes.media_position),
    mediaPositionUpdatedAtMs = Date.parse(stateAttributes.media_position_updated_at || ''),
    mediaPositionElapsedSeconds =
      isOn && normalizedState === 'playing' && Number.isFinite(mediaPositionUpdatedAtMs)
        ? Math.max(0, (nowMs - mediaPositionUpdatedAtMs) / 1000)
        : 0
  let artworkUrl = isOn && !isIdle ? televisionArtwork(stateAttributes) : ''
  const customPosterUrl = televisionPosterAssetUrl(televisionConfig)
  if (artworkUrl) {
    const artworkIdentityJson = JSON.stringify([
      stateAttributes.media_content_id,
      stateAttributes.media_title,
      stateAttributes.media_series_title,
      stateAttributes.media_season,
      stateAttributes.media_episode,
      stateAttributes.media_album_name,
      stateAttributes.media_artist,
      stateAttributes.app_name,
      stateAttributes.source,
    ])
    let artworkHash = 2166136261
    for (let charIndex = 0; charIndex < artworkIdentityJson.length; charIndex++)
      artworkHash = Math.imul(artworkHash ^ artworkIdentityJson.charCodeAt(charIndex), 16777619)
    artworkUrl += (artworkUrl.includes('?') ? '&' : '?') + 'hb_i3d=' + (artworkHash >>> 0).toString(36)
  }
  return {
    state: normalizedState,
    available: isAvailable,
    on: isOn,
    idle: isIdle,
    mediaAvailable: isMediaAvailable,
    playing: isOn && isMediaOn && normalizedState === 'playing',
    name: televisionConfig.label || stateAttributes.friendly_name || mediaProfile.label,
    status:
      !televisionConfig.entityId && !televisionConfig.powerEntityId
        ? '尚未绑定媒体实体'
        : isAvailable
          ? !isOn && televisionConfig.powerEntityId
            ? mediaProfile.label + '已关闭'
            : isOn && !isMediaOn
              ? '已开启'
              : {
                  playing: '播放中',
                  paused: '已暂停',
                  buffering: '缓冲中',
                  idle: '空闲',
                  on: '已开启',
                  off: '已关闭',
                  standby: '待机',
                }[normalizedState] || normalizedState
          : '设备不可用',
    title: isIdle
      ? '暂无播放内容'
      : String(
          stateAttributes.media_title ||
            stateAttributes.media_series_title ||
            stateAttributes.app_name ||
            stateAttributes.source ||
            '暂无播放内容',
        ),
    app: String(stateAttributes.app_name || stateAttributes.source || ''),
    artist: String(stateAttributes.media_artist || ''),
    artwork: artworkUrl,
    customPosterUrl: customPosterUrl,
    screenImageUrl: artworkUrl || (isOn ? customPosterUrl : ''),
    duration: mediaDurationSeconds! > 0 ? mediaDurationSeconds : null,
    position:
      mediaPositionSeconds !== null
        ? Math.min(
            mediaDurationSeconds! > 0 ? mediaDurationSeconds! : Infinity!,
            Math.max(0, mediaPositionSeconds + mediaPositionElapsedSeconds),
          )
        : null,
    updated: entityState.updatedAt || entityState.last_updated || '',
  }
}
/**
 * 媒体设备的状态灯规则（电视 / 投影仪共用）。
 *
 * 与灯组 / 扫地机的状态灯同一份契约：`visible` 决定挂不挂灯，`status` 决定颜色档位，
 * `color` 是「正常」档的固定色。投影仪只有这一枚指示灯，屏幕不参与状态表达 ——
 * 它的画面只在弹窗里出现。
 */
export function mediaDeviceIndicator(
  mediaConfig: Parameters<typeof televisionState>[0],
  entityStateStore: Parameters<typeof televisionState>[1] = {},
) {
  const mediaState = televisionState(mediaConfig, entityStateStore)
  return {
    ...mediaState,
    visible: mediaState.available && mediaState.on,
    status: mediaState.on ? 'normal' : 'off',
    color: DEVICE_STATUS_NORMAL_COLOR,
  }
}
export function televisionTime(totalSeconds: any) {
  if (!Number.isFinite(totalSeconds)) return '—'
  const wholeSeconds = Math.max(0, Math.floor(totalSeconds))
  return Math.floor(wholeSeconds / 60) + ':' + String(wholeSeconds % 60).padStart(2, '0')
}
export function televisionPower(
  powerConfig: any,
  powerStateStore: Record<string, any> = {},
  desiredOn: any = undefined,
) {
  const targetEntityId = powerConfig.powerEntityId || powerConfig.entityId || '',
    entityDomain = targetEntityId.split('.')[0],
    powerStateEntry = readEntityState(powerStateStore, targetEntityId),
    powerEntityState = powerStateEntry?.newState || powerStateEntry || {},
    isPowerAvailable =
      !!targetEntityId &&
      powerEntityState.available !== false &&
      typeof powerEntityState.state == 'string' &&
      !['unknown', 'unavailable', ''].includes(powerEntityState.state),
    isPowerOn = isPowerAvailable && !['off', 'standby'].includes(powerEntityState.state),
    shouldTurnOn = typeof desiredOn == 'boolean' ? desiredOn : !isPowerOn,
    powerService = shouldTurnOn ? 'turn_on' : 'turn_off',
    powerSupportedFeatures = Number(powerEntityState.attributes?.supported_features) || 0,
    canTogglePower =
      entityDomain === 'switch' ||
      (entityDomain === 'media_player' && !!(powerSupportedFeatures & (shouldTurnOn ? 128 : 256)))
  return {
    entityId: targetEntityId,
    domain: entityDomain,
    on: isPowerOn,
    available: isPowerAvailable,
    supported: canTogglePower,
    service: powerService,
    reason: isPowerAvailable ? (canTogglePower ? '' : '此实体不支持开关机') : '电源状态不可用',
    command: {
      entityId: targetEntityId,
      domain: entityDomain,
      service: powerService,
      data: {} as Record<string, any>,
      deviceKind: powerConfig.deviceKind || 'television',
    },
  }
}
/** 播放控制动作 → Home Assistant 的 media_player 服务名。 */
function mediaServiceFor(mediaAction: string, isPlaying: boolean) {
  if (mediaAction === 'previous') return 'media_previous_track'
  if (mediaAction === 'next') return 'media_next_track'
  return isPlaying ? 'media_pause' : 'media_play'
}

export function televisionMediaControl(mediaConfig: any, mediaStateStore: any, mediaAction: any) {
  const mediaStateEntry = readEntityState(mediaStateStore, mediaConfig.entityId),
    mediaEntityState = mediaStateEntry?.newState || mediaStateEntry || {},
    televisionSnapshot = televisionState(mediaConfig, mediaStateStore),
    mediaSupportedFeatures = Number(mediaEntityState.attributes?.supported_features) || 0,
    mediaService = mediaServiceFor(mediaAction, televisionSnapshot.playing),
    requiredFeatureMask = {
      media_previous_track: 16,
      media_next_track: 32,
      media_pause: 1,
      media_play: 16384,
    }[mediaService]
  return {
    enabled:
      televisionSnapshot.on &&
      televisionSnapshot.mediaAvailable &&
      !['off', 'standby'].includes(televisionSnapshot.state) &&
      !!(mediaSupportedFeatures & requiredFeatureMask),
    command: {
      domain: 'media_player',
      entityId: mediaConfig.entityId,
      service: mediaService,
      data: {} as Record<string, any>,
      deviceKind: mediaConfig.deviceKind || 'television',
    },
  }
}
