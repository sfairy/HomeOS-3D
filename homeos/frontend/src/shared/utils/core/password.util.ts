/**
 * 口令策略（与后端 `platform/security/passwords.py` 同源）。
 *
 * 后端在请求解析期已经拦一次；前端这份只为了「别让用户白填一遍表单、白烧一枚验证码」，
 * 所以判据必须与后端完全一致 —— 两边分叉会出现「前端放行、后端 422」的割裂。
 */

/** 策略提示文案：后端 `PASSWORD_POLICY_MESSAGE` 的同一句。 */
export const PASSWORD_POLICY_MESSAGE = '密码至少 8 位，且须同时包含字母和数字'

/** 口令是否满足统一策略：8–128 位，且同时含 ASCII 字母与数字。 */
export function isPasswordPolicyCompliant(password: string): boolean {
  if (!password || password.length < 8 || password.length > 128) return false
  return /[A-Za-z]/.test(password) && /[0-9]/.test(password)
}
