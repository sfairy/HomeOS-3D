/**
 * @file csrf.util.ts
 * @module common/http-security
 *
 * CSRF（Cross-Site Request Forgery）防护工具集。
 *
 * 职责：
 * - 生成不可预测的 CSRF token（crypto.randomBytes）。
 * - 维护公开路径白名单（CSRF_SKIP_PATHS）与按前缀匹配的豁免规则。
 * - 提供 Double-submit Cookie 模式的校验入口 validateCsrf，使用时序安全比较
 *   防止 token 泄露侧信道攻击。
 *
 * 关键依赖：
 * - Node.js crypto（随机数生成 + timingSafeEqual）
 *
 * 安全相关：本模块是 CSRF 防护的核心，任何对豁免列表或校验逻辑的修改都可能引入
 * 安全漏洞；新增豁免路径必须确认其属于预认证端点或无法携带 CSRF 头的实时通道。
 */
import * as crypto from 'crypto';

/** CSRF token 在 Cookie 中的字段名 */
const CSRF_COOKIE = 'csrf_token';

/** CSRF token 在请求头中的字段名（Express 自动小写化） */
const CSRF_HEADER = 'x-csrf-token';

/**
 * 生成 CSRF token。
 *
 * 使用 crypto.randomBytes 生成 24 字节（192 位）随机数，再编码为 48 字符十六进制
 * 字符串。该熵值足以抵御暴力猜测。
 *
 * @returns 48 字符的十六进制 CSRF token。
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** CSRF Cookie 名与请求头名常量集合 */
export const CSRF = { COOKIE: CSRF_COOKIE, HEADER: CSRF_HEADER } as const;

/**
 * 公开路径（无需 CSRF 校验）。
 *
 * 安全说明：这些路径均为预认证端点（登录/注册/健康检查）或外部 Webhook 回调，
 * 调用时浏览器尚无 CSRF Cookie 或由外部服务发起、不依赖浏览器凭据。
 */
const CSRF_SKIP_PATHS = new Set([
  '/health',
  '/api/v1/auth/status',
  '/api/v1/auth/setup',
  '/api/v1/auth/login',
  // MFA 第二步登录在凭据校验前进行、尚无 CSRF Cookie，与 login 同属公开预认证端点
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/guest-login',
  '/api/v1/auth/guest-exchange',
  // 商业授权激活页为预认证引导，可能尚无 CSRF Cookie
  '/api/v1/license/status',
  '/api/v1/license/activate',
  // 企业微信服务器回调（外部 POST，无浏览器 CSRF Cookie）
  '/api/v1/channels/wecom/callback',
]);

/**
 * 判断路径是否豁免 CSRF 校验。
 *
 * 豁免规则：
 * 1. 命中 CSRF_SKIP_PATHS 精确匹配集合；
 * 2. Socket.IO 轮询端点（POST 无法携带自定义头，与 WebSocket 升级同属实时通道）；
 * 3. MCP 网关（机器客户端 API Key 鉴权，无浏览器 Cookie）；
 * 4. WebRTC WSS 反代、自动化 Webhook（外部 HMAC）。
 *    内嵌反代 GET 已由幂等方法放行；变更方法须带 CSRF（垫片会注入头）。
 *
 * @param path 已去除 query string 的请求路径。
 * @returns true 表示该路径无需 CSRF 校验。
 */
function isCsrfExemptPath(path: string): boolean {
  if (CSRF_SKIP_PATHS.has(path)) return true;
  // Socket.IO 轮询 POST 无法携带 CSRF 头，与 WebSocket 升级同属实时通道
  if (path === '/socket.io' || path.startsWith('/socket.io/')) return true;
  if (path === '/api/v1/mcp' || path.startsWith('/api/v1/mcp/')) return true;
  if (path.startsWith('/api/v1/ha/webrtc-ws')) return true;
  return false;
}

/**
 * Double-submit cookie CSRF 校验（时序安全比较）。
 *
 * 校验逻辑：
 * 1. 幂等方法（GET/HEAD/OPTIONS）直接放行——不产生副作用，无需 CSRF 防护。
 * 2. 豁免路径直接放行（预认证端点/实时通道）。
 * 3. Cookie token 与 Header token 必须同时存在，否则拒绝。
 * 4. 长度不同直接拒绝（提前短路，避免 timingSafeEqual 抛错）。
 * 5. 使用 crypto.timingSafeEqual 做恒定时间比较，防止时序侧信道泄露 token。
 *
 * 安全意图：Double-submit 模式要求攻击者无法读取 victim 浏览器的 Cookie（同源策略
 * 保护），因此跨站请求虽能携带 Cookie 但无法在头中复制相同的 token，从而被拒绝。
 *
 * @param method HTTP 方法。
 * @param path 请求路径（已去 query string）。
 * @param cookieToken 从 csrf_token Cookie 读取的 token。
 * @param headerToken 从 X-CSRF-Token 请求头读取的 token。
 * @returns true 表示校验通过或无需校验；false 表示校验失败应拒绝。
 */
export function validateCsrf(
  method: string,
  path: string,
  cookieToken?: string,
  headerToken?: string,
): boolean {
  // 幂等方法无副作用，直接放行
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true;
  // 公开预认证端点 / 实时通道豁免
  if (isCsrfExemptPath(path)) return true;
  // 任一 token 缺失即拒绝：Double-submit 要求 Cookie + Header 双因子
  if (!cookieToken || !headerToken) return false;
  // 长度不同先短路：timingSafeEqual 要求等长 Buffer，且避免泄露长度信息
  if (cookieToken.length !== headerToken.length) return false;
  try {
    // 恒定时间比较：防止通过响应耗时差异逐字节猜测 token
    return crypto.timingSafeEqual(
      Buffer.from(cookieToken, 'utf8'),
      Buffer.from(headerToken, 'utf8'),
    );
  } catch {
    return false;
  }
}