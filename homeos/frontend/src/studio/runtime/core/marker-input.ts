export function nearestMarkerTarget(markers: any, pointerX: any, pointerY: any) {
  let nearestId: any = null,
    bestDistance = Infinity,
    bestTieBreak = Infinity
  for (const { id: markerId, rect: rect, width: width, height: height } of markers) {
    if (pointerX < rect.left || pointerX > rect.right || pointerY < rect.top || pointerY > rect.bottom) continue
    const offsetX = Math.abs(pointerX - (rect.left + rect.right) / 2),
      offsetY = Math.abs(pointerY - (rect.top + rect.bottom) / 2),
      edgeDistance = Math.max(0, offsetX - width / 2) ** 2 + Math.max(0, offsetY - height / 2) ** 2,
      centerDistance = offsetX * offsetX + offsetY * offsetY
    ;(edgeDistance < bestDistance || (edgeDistance === bestDistance && centerDistance < bestTieBreak)) &&
      ((nearestId = markerId), (bestDistance = edgeDistance), (bestTieBreak = centerDistance))
  }
  return nearestId
}
export function createMarkerTouch(resolveId: any) {
  let activeTouch: any = null
  return {
    down(downEvent: any) {
      if (downEvent.pointerType !== 'touch') {
        activeTouch = null
        return
      }
      if ((activeTouch && !activeTouch.ended) || downEvent.isPrimary === false) {
        activeTouch && (activeTouch.cancelled = true)
        return
      }
      activeTouch = {
        pointerId: downEvent.pointerId,
        x: downEvent.clientX,
        y: downEvent.clientY,
        id: resolveId(downEvent),
      }
    },
    move(moveEvent: any) {
      activeTouch?.pointerId === moveEvent.pointerId &&
        Math.hypot(moveEvent.clientX - activeTouch.x, moveEvent.clientY - activeTouch.y) >= 8 &&
        (activeTouch.cancelled = true)
    },
    up(upEvent: any) {
      activeTouch?.pointerId === upEvent.pointerId &&
        (Math.hypot(upEvent.clientX - activeTouch.x, upEvent.clientY - activeTouch.y) >= 8 &&
          (activeTouch.cancelled = true),
        (activeTouch.ended = true))
    },
    cancel() {
      activeTouch && ((activeTouch.cancelled = true), (activeTouch.ended = true))
    },
    target(targetEvent: any, fallbackTarget: any) {
      if (targetEvent.detail === 0 || !activeTouch) return fallbackTarget
      const touchedId = activeTouch.cancelled ? null : activeTouch.id
      return ((activeTouch = null), touchedId)
    },
  }
}

/** 指针事件里真正用到的字段（`PointerEvent` 结构上满足）。 */
type PointerLike = {
  pointerId: number
  clientX: number
  clientY: number
  pointerType?: string
  isPrimary?: boolean
  button?: number
}
/** `click` 里用到的字段：`PointerEvent` 有 `pointerId`，`MouseEvent` 没有。 */
type ClickLike = {
  detail?: number
  pointerId?: number
  preventDefault: () => void
  stopImmediatePropagation: () => void
}
type HoldState = {
  pointerId: number
  x: number
  y: number
  slop: number
  consumeClick: boolean
  timer: ReturnType<typeof setTimeout> | null
}
/** 按住状态机：只管「何时开始计、何时算取消」，不碰 DOM 监听。 */
function createHoldCore() {
  let current: HoldState | null = null
  const clear = () => {
    current?.timer && clearTimeout(current.timer)
    current = null
  }
  /** 取消计时但**保留** `consumeClick`：后面那次 click 仍要被吞掉。 */
  const consume = () => {
    if (!current) return
    if (current.timer) clearTimeout(current.timer)
    current.consumeClick = true
  }
  return {
    get current() {
      return current
    },
    clear,
    consume,
    consumePointer(event: Event) {
      const pointerEvent = event as unknown as PointerLike
      if (current?.pointerId === pointerEvent.pointerId) consume()
    },
    trackMove(pointerEvent: PointerLike) {
      if (!current || current.pointerId !== pointerEvent.pointerId) return
      if (Math.hypot(pointerEvent.clientX - current.x, pointerEvent.clientY - current.y) < current.slop) return
      consume()
    },
    /** 起一次计时；`fire` 在按住 `seconds` 秒后触发一次。 */
    begin(startEvent: PointerLike, seconds: number, fire: () => void) {
      if (startEvent.button !== 0 || startEvent.isPrimary === false) return
      clear()
      const hold: HoldState = {
        pointerId: startEvent.pointerId,
        x: startEvent.clientX,
        y: startEvent.clientY,
        slop: startEvent.pointerType === 'touch' ? 8 : 5,
        consumeClick: false,
        timer: null,
      }
      hold.timer = setTimeout(
        () => {
          hold.consumeClick = true
          fire()
        },
        Math.round(seconds * 1000),
      )
      current = hold
    },
  }
}
/** 监听挂在宿主捕获阶段：先于标记自己的 `click`，才能在长按命中时把那一下点击吞掉。 */
function bindHoldListeners(
  host: EventTarget,
  core: ReturnType<typeof createHoldCore>,
  options: AddEventListenerOptions,
) {
  host.addEventListener(
    'pointerdown',
    (event: Event) => {
      const downEvent = event as unknown as PointerLike
      if (downEvent.isPrimary === false) core.consume()
      else core.clear()
    },
    options,
  )
  host.addEventListener('pointermove', (event: Event) => core.trackMove(event as unknown as PointerLike), options)
  host.addEventListener(
    'pointerup',
    (event: Event) => {
      const upEvent = event as unknown as PointerLike
      if (!core.current || core.current.pointerId !== upEvent.pointerId) return
      core.trackMove(upEvent)
      // 已经吞过点击就保留状态，等 `click` 把它收掉；否则这次只是一次短按。
      if (!core.current.consumeClick) core.clear()
    },
    options,
  )
  host.addEventListener('pointercancel', (event: Event) => core.consumePointer(event), options)
  host.addEventListener(
    'click',
    (event: Event) => {
      const clickEvent = event as unknown as ClickLike
      if (!core.current?.consumeClick || !clickEvent.detail) return
      if ((clickEvent.pointerId ?? 0) > 0 && clickEvent.pointerId !== core.current.pointerId) return
      core.clear()
      clickEvent.preventDefault()
      clickEvent.stopImmediatePropagation()
    },
    options,
  )
}

/**
 * 标记「按住不放」计时（0.8.8 `createMarkerHold`）。
 *
 * 逐灯长按开面板用的就是它。要点：
 * - 移动超过 slop（触摸 8px / 鼠标 5px）或抬起 => 取消计时，并继续「吞点击」
 *   （`consumeClick = true`）：已经按住过就不该再按普通点击处理。
 * - `start` 只接受主键、主指针；`seconds` 由调用方先过 `lightLongPressSeconds()`。
 */
export function createMarkerHold(holdHost: EventTarget) {
  const controller = new AbortController()
  const core = createHoldCore()
  bindHoldListeners(holdHost, core, { capture: true, signal: controller.signal })
  return {
    start: core.begin,
    cancel: core.consume,
    cancelPointer: core.consumePointer,
    dispose() {
      core.clear()
      controller.abort()
    },
  }
}
