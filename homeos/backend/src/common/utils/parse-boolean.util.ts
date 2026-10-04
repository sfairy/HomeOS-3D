/**
 * 职责：
 *  - 布尔值解析：环境变量（多值真/假）与 HTTP 查询参数（1/true）两套口径；
 * 关键依赖：
 *  - 无外部依赖，纯函数；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/** 视为「真」的环境变量取值（不区分大小写） */
const ENV_TRUTHY = new Set(['1', 'true', 'yes', 'on']);
/** 视为「假」的环境变量取值（不区分大小写） */
const ENV_FALSY = new Set(['0', 'false', 'no', 'off']);

/**
 * 解析环境变量布尔值。
 *
 * 用于 `HOMEOS_HARDENED` / `LICENSE_REQUIRED` 等开关：显式真/假取值直接生效，
 * 未设置或无法识别时返回 null，由调用方按环境（如 production 默认开启）决定缺省。
 *
 * @param raw 环境变量原始值
 * @returns true / false；无法识别返回 null
 */
export function parseEnvBoolean(raw?: string | null): boolean | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (ENV_TRUTHY.has(v)) return true;
  if (ENV_FALSY.has(v)) return false;
  return null;
}

/**
 * 解析 HTTP 查询参数布尔值。
 *
 * 与前端 `?flag=1` / `?flag=true` 的发送口径严格对齐：仅这两种取值视为真，
 * 其余（含未传、空串）一律为假，避免查询参数出现"默认开启"的隐式语义。
 *
 * @param raw 查询参数原始值（Express 可能给出 string 或 string[]）
 * @returns 是否为明确的真值
 */
export function parseBooleanQuery(raw?: string | string[] | null): boolean {
  const v = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true';
}
