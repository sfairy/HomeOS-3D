 
/**
 * 前端冒烟脚本共用夹具：断言收尾 + Bun 里缺的浏览器环境桩。
 *
 * 此前 6 个 `*_smoke.ts` 各自复制一套 `failures` / `checked` / `check()`，输出格式、计数口径
 * 都不一致（有的数、有的不数，有的 `[PASS]` 有的 `PASS  `）；`window` / `WebSocket` /
 * `MediaSource` / 定时器桩也各写一份。这里收敛成一份。
 *
 * `check` / `section` / `report` 的实现放在 [`_smoke_harness.mjs`](./_smoke_harness.mjs)
 * —— `.mjs` 门禁自检由 **node** 跑（不能加载 `.ts`），两侧必须共用同一份口径；
 * 本文件负责把它们转出给 TS 冒烟，并提供只在浏览器环境里需要的桩。
 *
 * 用法（桩必须在 import 被测模块**之前**装好）：
 *
 * ```ts
 * import { check, fakeTimers, installWindow, report, section } from './_smoke_harness'
 *
 * installWindow({ MediaSource: FakeMediaSource as unknown })
 * const { createGo2RtcMseTransport } = await import('@/shared/camera/composables/useGo2RtcMseTransport')
 *
 * section('① 地址归一')
 * check('同源 wss 地址', relayUrl === expected, relayUrl)
 * report('go2rtc MSE 传输回归')
 * ```
 *
 * 本文件豁免 `@typescript-eslint/no-explicit-any`：三个 `createFake*` 是「万能桩」——
 * 各控件取用的字段互不相同（`closest` / `srcObject` / `fire` …），写死接口等于让被测代码
 * 迁就夹具。规则本身在其余位置仍是 **error**，只在这里按文件豁免。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export { check, counts, failed, report, section } from './_smoke_harness.mjs'

// ── 全局桩 ────────────────────────────────────────────────────────────────

/** 装一个假 `window`（缺省只带 location）；返回该对象供后续改写（如临时删掉 MediaSource）。 */
export function installWindow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const win: Record<string, unknown> = {
    location: { href: 'https://home.local/', origin: 'https://home.local' },
    ...overrides,
  }
  ;(globalThis as unknown as { window: unknown }).window = win
  return win
}

/** 装一个全局（`WebSocket` / `fetch` / `document` …）。 */
export function installGlobal(name: string, value: unknown): void {
  ;(globalThis as unknown as Record<string, unknown>)[name] = value
}

/** 摘掉一个全局（`Reflect.deleteProperty`，与 `delete globalThis.x` 等价但不受 strict 限制）。 */
export function removeGlobal(name: string): void {
  Reflect.deleteProperty(globalThis, name)
}

/**
 * 桩掉 `URL.createObjectURL`：Bun 的实现只接受 `Blob`，而浏览器接受 `MediaSource`
 * （MSE 通路靠它把 MediaSource 挂到 `<video src>`）。
 */
export function installObjectUrl(value = 'blob:smoke'): void {
  ;(URL as unknown as { createObjectURL: (input: unknown) => string }).createObjectURL = () => value
}

// ── 定时器桩 ──────────────────────────────────────────────────────────────

/**
 * 假定时器：把 `setTimeout` 记下来，可查「排了几个某延时的定时器」，也可 `advance` 推进虚拟
 * 时钟真的执行回调（退避重连这类「排程 → 重连 → 再排程」的链路要靠它才测得动）。
 */
export class FakeTimers {
  private nextId = 1
  private now = 0
  private pending: Array<{ id: number; handler: () => void; delay: number; at: number }> = []

  setTimeout = (handler: () => void, delay = 0): number => {
    const id = this.nextId++
    this.pending.push({ id, handler, delay, at: this.now })
    return id
  }

  clearTimeout = (id: number): void => {
    this.pending = this.pending.filter((timer) => timer.id !== id)
  }

  /** 当前待执行定时器的延时列表（注册序）。 */
  delays(): number[] {
    return this.pending.map((timer) => timer.delay)
  }

  /** 待执行定时器里延时恰为 `delay` 的个数。 */
  countByDelay(delay: number): number {
    return this.pending.filter((timer) => timer.delay === delay).length
  }

  reset(): void {
    this.pending = []
    this.now = 0
  }

  /** 推进虚拟时钟 `ms`，按到期顺序执行回调（回调里新排的定时器照常参与）。 */
  advance(ms: number): void {
    const target = this.now + ms
    for (;;) {
      const due = this.pending
        .filter((timer) => timer.at + timer.delay <= target)
        .sort((a, b) => a.at + a.delay - (b.at + b.delay) || a.id - b.id)
      const next = due[0]
      if (!next) break
      this.pending = this.pending.filter((timer) => timer.id !== next.id)
      this.now = next.at + next.delay
      next.handler()
    }
    this.now = target
  }
}

// ── 元素桩 ────────────────────────────────────────────────────────────────

/** 元素桩：只实现控件真正用到的面（dataset / value / textContent / classList / 监听）。 */
export function createFakeElement(extra: Record<string, unknown> = {}): any {
  const listeners = new Map<string, Array<(event: any) => void>>()
  const classes = new Set<string>()
  const element: any = {
    hidden: false,
    value: '',
    textContent: '',
    dataset: {} as Record<string, string>,
    classList: {
      toggle: (name: string, on?: boolean) => {
        const active = on === undefined ? !classes.has(name) : on
        if (active) classes.add(name)
        else classes.delete(name)
        return active
      },
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name),
    },
    addEventListener: (type: string, handler: (event: any) => void) => {
      listeners.set(type, [...(listeners.get(type) || []), handler])
    },
    querySelectorAll: () => [],
    ...extra,
  }
  /** 已挂监听数（断言幂等用）。 */
  element.listenerCount = (type: string) => (listeners.get(type) || []).length
  /** 触发一次事件；`target` 缺省是元素自身。 */
  element.fire = (type: string, target: any = element) =>
    (listeners.get(type) || []).forEach((handler) => handler({ target }))
  return element
}

/** 分段按钮桩：`closest("[data-...]")` 命中自身，其它选择器返回 null（与真实 DOM 一致）。 */
export function createFakeOptionElement(attribute: string, dataValue: string): any {
  const datasetKey = attribute
    .replace(/^data-/, '')
    .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
  const element: any = createFakeElement({ dataset: { [datasetKey]: dataValue } })
  element.closest = (selector: string) => (selector === `[${attribute}]` ? element : null)
  return element
}

/** 视频元素桩：只桩出 MSE 传输用到的面（readyState / srcObject / 事件）。 */
export function createFakeVideo(): any {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    readyState: 0,
    currentTime: 0,
    src: '',
    srcObject: null as unknown,
    addEventListener: (type: string, handler: () => void) => {
      ;(listeners[type] ||= []).push(handler)
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners[type] = (listeners[type] || []).filter((item) => item !== handler)
    },
    emit: (type: string) => (listeners[type] || []).forEach((handler) => handler()),
    pause: () => {},
    removeAttribute: () => {},
    play: () => Promise.resolve(),
  }
}

// ── MSE / WebSocket 桩 ────────────────────────────────────────────────────

export class FakeSourceBuffer {
  mode = ''
  updating = false
  buffered = { length: 0, start: () => 0, end: () => 0 }
  listeners: Record<string, Array<() => void>> = {}
  appended: unknown[] = []
  addEventListener(type: string, handler: () => void) {
    ;(this.listeners[type] ||= []).push(handler)
  }
  /** 触发一次事件（测试用 `updateend` 驱动「一条写完再写下一条」的串行队列）。 */
  emit(type: string) {
    ;(this.listeners[type] || []).forEach((handler) => handler())
  }
  appendBuffer(chunk: unknown) {
    this.appended.push(chunk)
  }
  remove() {}
}

export class FakeMediaSource {
  static last: FakeMediaSource | null = null
  static isTypeSupported() {
    return true
  }
  readyState = 'open'
  listeners: Record<string, Array<() => void>> = {}
  sourceBuffers: FakeSourceBuffer[] = []
  constructor() {
    FakeMediaSource.last = this
  }
  addEventListener(type: string, handler: () => void) {
    ;(this.listeners[type] ||= []).push(handler)
  }
  /** 触发一次事件（测试用 `sourceopen` 驱动首帧协商）。 */
  emit(type: string) {
    ;(this.listeners[type] || []).forEach((handler) => handler())
  }
  addSourceBuffer() {
    const buffer = new FakeSourceBuffer()
    this.sourceBuffers.push(buffer)
    return buffer
  }
  endOfStream() {}
}

export class FakeWebSocket {
  static OPEN = 1
  static last: FakeWebSocket | null = null
  static created: string[] = []
  readyState = 1
  binaryType = ''
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeWebSocket.last = this
    FakeWebSocket.created.push(url)
  }
  send(payload: string) {
    this.sent.push(payload)
  }
  close() {
    this.readyState = 3
  }
}
