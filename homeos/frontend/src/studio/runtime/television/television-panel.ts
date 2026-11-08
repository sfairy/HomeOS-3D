import { televisionState, televisionTime, televisionPower, televisionMediaControl } from './television-state'
import { domElement } from '@app/shared/util/dom-factory'
import { mediaDeviceProfile } from '@app/bridge/presets/media-device-profiles'
import { createStageDeviceVisual } from '../core/stage-device-visual'
export function createTelevisionPanel({
  onControl: onControl = async () => {},
}: {
  onControl?: (command?: any) => any
} = {}) {
  const createElement = (tag: any, className: any) => domElement(document, tag, className),
    rootElement = createElement('div', 'i3d-television-panel'),
    headingElement = createElement('div', 'i3d-nas-heading'),
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
