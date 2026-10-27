/**
 * 「本机是否已初始化」的门禁快照。
 *
 * 为什么单独一个模块：这个值由**路由守卫**在首次导航时探测（`GET /setup/status`，带后端
 * 启动重试），但**登录页**也要读它 —— 零用户首装时那一页要显示「创建本机唯一账号」，
 * 而不是普通登录表单。
 *
 * 改造前登录页是自己再发一次 `GET /setup/status`（见 LoginView 的历史注释），于是同一个
 * 问题在两处各答一次，而页面拿到答案的时刻在**挂载之后**：先画登录页、探测回来再换成
 * 首装页，整个面板的轨道、提示条、按钮全换一遍 —— 这正是入户页最明显的一次跳变。
 *
 * 现在守卫在放行首个路由之前就把结论写进这里，登录页**同步**读即可：首帧即最终形态。
 * 放在独立模块而不是 `router/index.ts` 里，是为了避免 views → router → views 的循环依赖。
 */
import type { SystemInitState } from '@/shared/types/router'

let systemInitialized: SystemInitState = null

/** 读取当前结论（null = 还没探测过）。 */
export function getSystemInitialized(): SystemInitState {
  return systemInitialized
}

/** 写入结论（路由守卫探测后 / 后端不可达时降级为 `offline`）。 */
export function setSystemInitialized(value: SystemInitState): void {
  systemInitialized = value
}
