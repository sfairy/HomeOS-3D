/**
 * 内嵌反代请求转发工具：Cookie 过滤 + 请求体重建
 *
 * 职责：在把客户端请求转发给内嵌站上游前，对 Cookie 与请求体做安全/兼容性处理：
 *   - 剥离 HomeOS 自身的鉴权 / CSRF / 上下文 Cookie，避免泄露给被反代的内嵌站；
 *   - 保留内嵌站自身的会话 Cookie（同源反代后写在本源下），使登录状态可维持；
 *   - 按 content-type 重建请求体，覆盖 JSON / form / 文本等常见情形。
 * 关键依赖：无（纯函数工具模块）
 */

/** HomeOS 自身的鉴权/CSRF cookie，不可泄露给被反代的内嵌站 */
const HOMEOS_PRIVATE_COOKIES = new Set(['auth_token', 'csrf_token']);

/** HomeOS 内部 Cookie 名前缀：embed_ctx__* 为内嵌上下文标记，不可泄露 */
const HOMEOS_PRIVATE_COOKIE_PREFIX = 'embed_ctx__';

/** HomeOS 用户/UI 态 cookie，对内嵌站无意义且可能引发上游误判 */
const HOMEOS_NON_AUTH_COOKIES = new Set([
  'fusra_session_id',
  'fusra_user_info',
  'lastloginusername',
  'trim-mc-token',
]);

/**
 * 仅剔除 HomeOS 自身的 cookie，保留内嵌站（经同源反代后写在本源下的）cookie，
 * 使内嵌应用自己的会话得以维持。
 *
 * @param cookieHeader 原始 Cookie 请求头
 * @returns 过滤后的 Cookie 字符串；全部被剔除时返回 undefined（即不发送 Cookie 头）
 */
export function stripHomeosCookies(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const kept = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter((c) => {
      // 取等号前的 name 部分做小写比较
      const name = c.split('=')[0]?.trim().toLowerCase();
      if (!name) return false;
      // 命中鉴权/CSRF 黑名单：剔除
      if (HOMEOS_PRIVATE_COOKIES.has(name)) return false;
      // 命中 UI 态黑名单：剔除
      if (HOMEOS_NON_AUTH_COOKIES.has(name)) return false;
      // 命中内嵌上下文前缀：剔除
      if (name.startsWith(HOMEOS_PRIVATE_COOKIE_PREFIX)) return false;
      return true;
    });
  return kept.length ? kept.join('; ') : undefined;
}

/**
 * 重建转发给上游的请求体。
 *
 * 全局 body-parser 已消费原始流，故按 content-type 从已解析的 req.body 重新序列化，
 * 覆盖 JSON / x-www-form-urlencoded / 文本等常见情形。
 * （multipart/二进制流目前不支持，会返回 undefined。）
 *
 * @param rawBody - 原始请求体 Buffer（由 json() verify 回调保存），
 *   对 JSON 请求优先透传原始字节，避免 JSON.stringify 重序列化破坏上游签名校验。
 *
 * @param method      HTTP 方法（GET/HEAD 无需 body）
 * @param contentType Content-Type 头
 * @param body        已解析的请求体对象
 * @param rawBody     原始字节 Buffer（可选）
 * @returns 重建后的 body 字符串/Buffer；无 body 时返回 undefined
 */
export function buildEmbedForwardBody(
  method: string,
  contentType: string | undefined,
  body: unknown,
  rawBody?: Buffer,
): string | Buffer | undefined {
  const m = (method || 'GET').toUpperCase();
  // GET/HEAD 按 RFC 不应有 body
  if (m === 'GET' || m === 'HEAD') return undefined;
  if (body == null) return undefined;
  const ct = (contentType || '').toLowerCase();
  // JSON 请求优先透传原始字节，避免重序列化（键排序/空格等差异）破坏上游签名校验
  if (rawBody && rawBody.length > 0 && ct.includes('json')) {
    return rawBody;
  }
  // 字符串 body：直接透传，空串视为无 body
  if (typeof body === 'string') return body.length ? body : undefined;
  // Buffer body：转 utf8 字符串，空 Buffer 视为无 body
  if (Buffer.isBuffer(body)) return body.length ? body.toString('utf8') : undefined;
  if (typeof body === 'object') {
    // 空对象：无 body
    if (Object.keys(body as Record<string, unknown>).length === 0) return undefined;
    // form 表单：用 URLSearchParams 序列化，null 值统一为空串
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
        params.append(k, v == null ? '' : String(v));
      }
      return params.toString() || undefined;
    }
    // 默认按 JSON 序列化
    return JSON.stringify(body);
  }
  return undefined;
}