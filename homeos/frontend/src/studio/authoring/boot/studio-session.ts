/**
 * 3D Studio 的**单实例不变量**：同一时刻只允许一个活动实例。
 *
 * ## 为什么单独成模块
 *
 * `app-boot.ts` 里原先有三条模块级 `let` 承担这个不变量：
 *
 * ```ts
 * let disposeActiveStudio: (() => void) | null = null
 * let flushActiveStudioSave: (() => Promise<void>) | null = null
 * let activeStudioRenderLoop: { dispose?: () => void } | null = null
 * ```
 *
 * 它们夹在 6000 行文件的 import 之间，而「重复引导必须被拒绝」这条规则由一个
 * `if (disposeActiveStudio)` 守卫隐式表达 —— 读代码的人只能靠通读全文才知道
 * 「谁写、谁读、什么顺序」。抽成模块后，不变量有了名字和唯一的读写入口。
 *
 * ## 为什么回收要走 save 钩子
 *
 * `teardownStudio()` 在闭包**外**执行，但落盘逻辑在 `bootStudio()` 的闭包里
 * （需要文档 store）。所以 boot 注册 `flushActiveStudioSave`，teardown 调用它 ——
 * 两者必须成对，放在同一模块里才能保证「登记了就能清掉」。
 */

/** 单例状态：一个 `const` 对象而不是三条 `let` —— 单实例不变量只有一处真源。 */
const session: {
  dispose: (() => void) | null
  flush: (() => Promise<void>) | null
  renderLoop: { dispose?: () => void } | null
} = { dispose: null, flush: null, renderLoop: null }

/** 是否已有活动实例（`bootStudio` 用它在入口拒绝第二次引导）。 */
export function hasActiveStudio(): boolean {
  return session.dispose !== null
}

/** 登记本次引导的实例：回收句柄、落盘钩子、渲染循环。 */
export function registerStudioInstance(handle: {
  dispose: () => void
  flush?: (() => Promise<void>) | null
  renderLoop?: { dispose?: () => void } | null
}): void {
  session.dispose = handle.dispose
  session.flush = handle.flush ?? null
  session.renderLoop = handle.renderLoop ?? null
}

/** 取回收句柄（teardown 入口）。 */
export function takeStudioDispose(): (() => void) | null {
  return session.dispose
}

/** 取落盘钩子（teardown 在 dispose 之前调用）。 */
export function takeStudioFlush(): (() => Promise<void>) | null {
  return session.flush
}

/** 清空登记（teardown 完成后调用）。 */
export function clearStudioInstance(): void {
  session.dispose = null
  session.flush = null
  session.renderLoop = null
}

/** 登记/清空渲染循环句柄。渲染循环在实际创建时才产生，必须能被**后续**更新，
 * 否则 teardown 拿到的是引导时刻的 null，RAF 与定时器会整批泄漏。 */
export function setStudioRenderLoop(loop: { dispose?: () => void } | null): void {
  session.renderLoop = loop
}

/** 渲染循环句柄只读（诊断与热重载用）。 */
export function peekStudioRenderLoop(): { dispose?: () => void } | null {
  return session.renderLoop
}

/**
 * 模块版本戳：供外部探针与缓存排查读取。
 *
 * 必须由**代码**写入（而不是 `index.html`），否则打包后与构建号会脱钩。
 */
export const STUDIO_MODULE_VERSION =
  '20260904-local-shadow-edge-v6-depth-precision-v1-model-load-state-v3-floor-scope-v1-ground-grid-v3-depth-fade-v2-local-shadow-depth-v1-export-shadow-quality-v1-base-light-entry-v1-auto-diagram-preview-hd-v1-auto-diagram-floor-v1-20260905-first-light-prewarm-v3-20260905-orbit-architecture-center-v1'
