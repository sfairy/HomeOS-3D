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
