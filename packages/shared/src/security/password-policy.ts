/**
 * 口令策略：两个前端共用同一份判据。
 *
 * 后端真源是 `packages/shared-py/homeos_shared/password_policy.py`；本文件与它逐条对齐，
 * 两侧前端都用 `[A-Za-z]` / `[0-9]`（ASCII），与 Python 侧的 `isascii()` 判定一致。
 *
 * 后端在请求解析期已经拦一次；前端这份只为了「别让用户白填一遍表单、白烧一枚验证码」，
 * 所以判据必须与后端完全一致 —— 两边分叉会出现「前端放行、后端 422」的割裂。
 */

/** 口令长度下界（与后端 `PASSWORD_MIN_LENGTH` 同值）。 */
export const PASSWORD_MIN_LENGTH = 8

/** 口令长度上界（与后端 `PASSWORD_MAX_LENGTH` 同值）。 */
export const PASSWORD_MAX_LENGTH = 128

/** 策略提示文案：后端 `PASSWORD_POLICY_MESSAGE` 的同一句。 */
export const PASSWORD_POLICY_MESSAGE = '密码至少 8 位，且须同时包含字母和数字'

/**
 * 口令长度（**按码位**计，不是 UTF-16 码元）。
 *
 * `String.prototype.length` 数的是 UTF-16 码元：一个补充平面字符（emoji 等）算 2，
 * 而 Python 的 `len()` 按码位算、只算 1。于是 `"😀abc123"` 在 JS 里是 8 位（放行）、
 * 在 Python 里是 7 位（422），用户会在「验证码已经消耗」之后才收到长度错误。
 * 用展开运算符按码位切分即可与后端对齐。
 */
export function passwordLength(password: string): number {
  return [...password].length
}

/** 口令是否满足统一策略：8–128 位（按码位），且同时含 ASCII 字母与 ASCII 数字。 */
export function isPasswordPolicyCompliant(password: string): boolean {
  if (!password) return false
  const length = passwordLength(password)
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) return false
  return /[A-Za-z]/.test(password) && /[0-9]/.test(password)
}
