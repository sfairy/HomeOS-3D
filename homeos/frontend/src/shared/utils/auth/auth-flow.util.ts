/**
 * 认证/开通流程的唯一步骤定义。
 *
 * 为什么集中在这里：2025 版页面上每个认证页各自手写「注册 · 01/03」「登录 · 02/03」
 * 「授权激活 · 03/05」—— 同一套界面里出现了两套分母（3 和 5），而且「登录」和
 * 「找回密码」都写成 02/03，读起来像同一步；用户无法从数字回答「我走到哪了」。
 * 现在由这里定义流程，页面只声明自己处在哪个 key，编号与分母自动一致。
 */

/** 单个流程步骤：key 供页面引用，label 是显示文案（编号由数组顺序推导）。 */
interface AuthFlowStep {
  /** 稳定标识，页面用它声明自己当前处于哪一步。 */
  key: string
  /** 显示文案，不含编号。 */
  label: string
}

/** 步骤在轨道上的视觉/语义状态。 */
type AuthStepState = 'done' | 'current' | 'todo' | 'blocked'

/** 渲染用的一步：编号、文案、状态。 */
export interface RenderableAuthStep extends AuthFlowStep {
  /** 两位编号，例如 '01'。 */
  ordinal: string
  /** 该步在轨道上的状态。 */
  state: AuthStepState
}

/** 首次开通：初始化 → 注册 → 激活。三条认证页共用这一条轨道。 */
export const AUTH_FLOW_SETUP: AuthFlowStep[] = [
  { key: 'init', label: '初始化' },
  { key: 'register', label: '注册' },
  { key: 'activate', label: '激活' },
]

/** 回访：登录 ←→ 找回密码。与开通流程分开，避免把「回访」读成开通的第二步。 */
export const AUTH_FLOW_ACCESS: AuthFlowStep[] = [
  { key: 'login', label: '登录' },
  { key: 'reset', label: '找回密码' },
]

/** 授权恢复：激活受阻 → 恢复授权。 */
/**
 * 把流程步骤渲染成带编号与状态的数组。
 *
 * @param flow 流程定义（AUTH_FLOW_*）
 * @param activeKey 当前页对应的步骤 key；找不到时全部按 todo 处理
 * @param blocked 当前步是否「停在这里过不去」（如绑定冲突），true 时当前步用 blocked 态
 * @returns 供 AuthShell 渲染的步骤数组
 */
export function renderAuthSteps(
  flow: AuthFlowStep[],
  activeKey: string,
  blocked = false,
): RenderableAuthStep[] {
  const activeIndex = flow.findIndex((step) => step.key === activeKey)
  return flow.map((step, index) => ({
    ...step,
    ordinal: String(index + 1).padStart(2, '0'),
    state:
      index === activeIndex
        ? blocked
          ? 'blocked'
          : 'current'
        : activeIndex >= 0 && index < activeIndex
          ? 'done'
          : 'todo',
  }))
}
