/**
 * `/3d-studio` 首屏加载遮罩的前端侧入口。
 *
 * 遮罩本体是 `public/static/3d-studio/studio-loading.js`（经典脚本，早于 Vue 入口执行），
 * 它挂出 `window.homeosStudioStartup`。本模块把那套契约包成带类型、且在**没有遮罩时
 * 一律 no-op** 的薄封装：
 *
 *   - 应用内路由跳转进 `/3d-studio` 时遮罩脚本根本没跑（它在首屏按路径守卫提前 return），
 *     所有调用都必须容忍 `window.homeosStudioStartup` 缺席；
 *   - 业务代码不该因此长出 `?.` 与 `as any`。
 *
 * 只做转发，不持有状态：加载态的唯一真相仍是脚本里的那个对象。
 */

/** 脚本侧暴露的控制器契约（与 studio-loading.js 的 `Object.freeze({...})` 一一对应）。 */
interface StudioStartupController {
  readonly active: boolean
  readonly signal: AbortSignal
  phase(text: string): void
  fail(reason?: string): void
  wait<T>(task: Promise<T> | T): Promise<T>
  ready(): void
}

function controller(): StudioStartupController | null {
  const candidate = (window as unknown as { homeosStudioStartup?: StudioStartupController })
    .homeosStudioStartup
  return candidate && typeof candidate.phase === 'function' ? candidate : null
}

/** 当前是否仍处于首屏加载态（遮罩未收起、也没失败）。 */
export function studioStartupActive(): boolean {
  return controller()?.active === true
}

/** 换阶段文案。加载已结束（ready / fail）时是 no-op。 */
export function studioStartupPhase(text: string): void {
  controller()?.phase(text)
}

/** 进入错误态：遮罩显示原因与「重新加载」按钮，同时中止下游准备工作。 */
export function studioStartupFail(reason?: string): void {
  controller()?.fail(reason)
}

/** 收起遮罩（幂等）。 */
export function studioStartupReady(): void {
  controller()?.ready()
}

/**
 * 等一个准备任务，但页面退出 / 失败时立刻以 abort 原因拒绝。
 *
 * 用途：把「几秒的准备过程」挂在遮罩的生命周期上 —— 用户已经关掉页面或点了重试，
 * 继续在后台把户型建完只是白烧 GPU。
 */
export function studioStartupWait<T>(task: Promise<T> | T): Promise<T> {
  const active = controller()
  return active ? active.wait(task) : Promise.resolve(task)
}
