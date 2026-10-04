/**
 * 职责：
 *  - 正则相关的小工具（正则元字符转义等），供各模块安全构造 RegExp；
 * 关键依赖：
 *  - 无外部依赖，纯函数；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/** 正则元字符集合（与 ECMAScript 规范一致） */
const REGEXP_META_RE = /[.*+?^${}()|[\]\\]/g;

/**
 * 转义字符串中的正则元字符。
 *
 * 用于把任意用户/配置字符串安全嵌入 `new RegExp(...)`，避免其被当作正则语法解析
 * （如实体 ID 中的 `.` 被当成通配符，导致 `light.a` 误匹配 `light.abc`）。
 *
 * @param value 原始字符串
 * @returns 可直接嵌入正则的转义后字符串
 */
export function escapeRegExp(value: string): string {
  return String(value ?? '').replace(REGEXP_META_RE, '\\$&');
}
