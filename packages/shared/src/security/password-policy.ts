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
export const PASSWORD_MIN_LENGTH = 8;

/** 口令长度上界（与后端 `PASSWORD_MAX_LENGTH` 同值）。 */
export const PASSWORD_MAX_LENGTH = 128;

/** 策略提示文案：后端 `PASSWORD_POLICY_MESSAGE` 的同一句。 */
export const PASSWORD_POLICY_MESSAGE = "密码至少 8 位，且须同时包含字母和数字";

/** 口令是否满足统一策略：8–128 位，且同时含 ASCII 字母与 ASCII 数字。 */
export function isPasswordPolicyCompliant(password: string): boolean {
  if (!password || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return false;
  }
  return /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}
