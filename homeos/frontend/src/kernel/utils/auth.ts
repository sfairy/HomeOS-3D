/**
 * 「注册邮箱 → 激活邮箱」的短途交接。
 *
 * 首次开通时用户刚在注册页填过邮箱，而激活页要填的正是**商店下单用的那个邮箱**（多半就是
 * 同一个）。让用户再手打一遍是纯粹的重复劳动，但这一格既不是凭据、也不该长期留存：
 * 用 `sessionStorage` 正好 —— 刷新还在，关掉标签即失，不会像 localStorage 那样在几个月后的
 * 一次激活里忽然冒出一个过期邮箱。
 *
 * 所有读写都吞掉异常：隐私模式 / 存储被禁只意味着少了预填，不能因此打断注册或激活。
 */

/** 键名带 `homeos:` 前缀：与其它页面级 sessionStorage 键同一命名空间。 */
const STORAGE_KEY = 'homeos:activation-email'

/**
 * 记住刚注册的邮箱，供激活页预填。
 * @param email 注册时填的邮箱；空值直接忽略（不会清掉已有值）
 */
export function rememberActivationEmail(email: string): void {
  const value = email.trim()
  if (!value) return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value)
  } catch {
    // 存储不可用：预填只是便利，写不进去就算了
  }
}

/**
 * 读取待预填的邮箱。
 * @returns 没有记录（或存储不可用）时返回空串
 */
export function readActivationEmail(): string {
  try {
    return (window.sessionStorage.getItem(STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

/** 激活成功后清掉这格交接值：它只服务「刚注册完那一次」。 */
export function forgetActivationEmail(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 清不掉不影响功能：下次激活前会被新的注册值覆盖
  }
}

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
interface RenderableAuthStep extends AuthFlowStep {
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
export function renderAuthSteps(flow: AuthFlowStep[], activeKey: string, blocked = false): RenderableAuthStep[] {
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

/**
 * 首屏「要不要打一发 `/auth/me`」的判定。
 *
 * 背景：路由守卫在首个导航里会探一次登录态（`GET /auth/me`）。匿名访客必然是 401 ——
 * 拦截器已经把它当正常分支（`skipAuthRedirect`）处理，不会弹窗也不会清会话，但浏览器照样
 * 会把这次请求标红打到控制台。入户页（登录 / 注册 / 激活 / 找回）恰恰是匿名访客最常落地的
 * 页面，于是每次冷开都留一条 `Failed to load resource: 401`，看起来像坏了一样。
 *
 * 现在服务端渲染外壳时就把结论写进 `<html data-auth="guest|user">`（见
 * `backend/src/bootstrap/spa_static.py` 的 `inject_auth_hint`）：服务端能看到请求有没有
 * 会话 Cookie。**没有** Cookie 时 `/auth/me` 一定 401，这一发没有任何信息量，直接跳过。
 *
 * 为什么只信 `guest`：
 *   · 服务端只能确认「有没有 Cookie」，确认不了「这个 Cookie 还有效」，所以 `user` 只是
 *     「可能已登录」，必须真打一次才知道；
 *   · `unknown`（属性缺失）也必须打 —— Vite 开发索引不经过后端外壳渲染，没有这个属性。
 *     若按「不认识就不打」处理，开发态硬刷新会把已登录用户当成匿名：守卫不放行受保护路由，
 *     人也到不了总览页，而 Cookie 其实是好的。这条与商店 `session-probe.ts` 的口径一致。
 */

/** 服务端给出的登录态提示。`unknown` = 外壳上没有这个属性（开发索引 / 老模板）。 */
type ServerAuthHint = 'guest' | 'user' | 'unknown'

/**
 * 解析 `data-auth` 的取值。
 *
 * 未知取值一律收敛成 `unknown`（等于「照旧探测」）：宁可多打一发 401，也不要把
 * 已登录用户误判成游客 —— 后者的症状是「刷新后停在登录页、Cookie 明明是好的」。
 *
 * @param value - `<html data-auth>` 的原始字符串
 */
export function parseServerAuthHint(value: string | null | undefined): ServerAuthHint {
  if (value === 'guest') return 'guest'
  if (value === 'user') return 'user'
  return 'unknown'
}

/**
 * 是否该发登录态探针。
 *
 * 只有服务端**明确**判定 `guest` 时跳过 —— 那种情况下 `/auth/me` 必然 401。
 */
export function shouldProbeSession(hint: ServerAuthHint): boolean {
  return hint !== 'guest'
}

/**
 * 读当前文档外壳上的登录态提示。
 *
 * 只在首屏有意义：SPA 内导航不换 `<html>`，属性会变旧（登录 / 登出后仍是首屏那次的值）。
 * 调用点因此限死在「首个导航的登录态探测」这一处。
 */
export function readServerAuthHint(): ServerAuthHint {
  if (typeof document === 'undefined') return 'unknown'
  return parseServerAuthHint(document.documentElement.getAttribute('data-auth'))
}
