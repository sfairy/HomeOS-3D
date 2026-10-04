/**
 * @file cookie-cors.util.ts
 * @module common/http-security
 *
 * Cookie Secure、CORS 来源判定与密码策略（HTTP / WebSocket 共用请求安全工具）
 *
 * 职责：
 * - 根据 COOKIE_SECURE 环境变量决定 Cookie 的 Secure 属性，避免在 HTTP 部署下 Cookie
 *   被明文截获，同时兼顾反代 HTTPS 场景（X-Forwarded-Proto）。
 * - 解析 CORS_ORIGINS 白名单，结合局域网/本机来源判定是否允许跨域，作为自托管家居
 *   场景的安全默认（局域网内设备可直接访问，公网需显式配置白名单）。
 * - 提供密码强度策略与校验入口，供注册/改密流程调用。
 *
 * 关键依赖：
 * - express（Request 类型）
 * - ../utils/business-exception（抛出业务异常 badRequest）
 *
 * 安全相关：所有判定结果直接用于 Set-Cookie / CORS 响应头，错误配置会导致 Cookie
 * 泄漏或跨域攻击，修改需谨慎并同步更新文档。
 */
import type { Request } from 'express';
import { badRequest } from '../utils/business-exception';

// ── Cookie Secure（安全标志） ── ────────────────────

/**
 * Cookie Secure 模式。
 * - 'true'：始终启用 Secure（仅 HTTPS 下浏览器才会发送 Cookie）。
 * - 'false'：始终不启用（纯 HTTP 内网部署）。
 * - 'auto'：按当前请求是否 HTTPS 自动判定（默认）。
 */
type CookieSecureMode = 'true' | 'false' | 'auto';

/**
 * 读取 COOKIE_SECURE 环境变量（默认 auto）。
 * @returns 标准化后的模式字符串，非识别值统一回退为 'auto'。
 */
export function getCookieSecureMode(): CookieSecureMode {
  const value = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (value === 'true') return 'true';
  if (value === 'false') return 'false';
  return 'auto';
}

/**
 * 当前连接是否为 HTTPS（含反代 X-Forwarded-Proto，需 trust proxy）。
 *
 * 安全意图：反代场景下 req.secure 恒为 false，必须读取 X-Forwarded-Proto 才能识别
 * 客户端到反代的真实链路是否加密；该判定影响 Cookie 的 Secure 属性是否生效。
 *
 * @param req Express 请求对象（仅需 secure 字段与 headers）。
 * @returns true 表示当前请求经过 HTTPS 链路。
 */
export function isRequestSecure(req: Pick<Request, 'secure' | 'headers'>): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  // X-Forwarded-Proto 可能是逗号分隔的多段（多层代理链），取第一段即最右侧代理所见
  const first = typeof proto === 'string' ? proto.split(',')[0]?.trim().toLowerCase() : '';
  return first === 'https';
}

/**
 * 按环境变量与当前请求解析 Cookie secure 布尔值。
 * - true：始终 Secure（仅 HTTPS 发送 Cookie）
 * - false：始终非 Secure（纯 HTTP 部署）
 * - auto（默认）：HTTPS 或 X-Forwarded-Proto=https 时为 Secure，否则非 Secure
 *
 * @param req Express 请求对象。
 * @returns 是否应在 Set-Cookie 时附加 Secure 属性。
 */
export function resolveCookieSecureForRequest(req: Pick<Request, 'secure' | 'headers'>): boolean {
  const mode = getCookieSecureMode();
  if (mode === 'true') return true;
  if (mode === 'false') return false;
  return isRequestSecure(req);
}

/**
 * Helmet HSTS：仅显式 COOKIE_SECURE=true 时在后端响应启用。
 *
 * 安全意图：HSTS 头会强制浏览器长期走 HTTPS，纯 HTTP 或反代混合部署下贸然启用会
 * 锁死访问，因此仅在运维明确声明全 HTTPS 部署时启用。
 *
 * @returns 是否应启用 HSTS。
 */
export function isHttpsDeployMode(): boolean {
  return getCookieSecureMode() === 'true';
}

// ── CORS 来源 ── ────────────────────

/**
 * 解析 CORS_ORIGINS 环境变量为白名单数组（未配置时为空）。
 *
 * 环境变量格式：逗号分隔的来源列表，例如 `https://home.example.com,http://192.168.1.10:8080`。
 *
 * @returns 去空白后的来源数组，未配置时返回空数组（表示仅放行局域网）。
 */
export function resolveAllowedOrigins(): string[] {
  return process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

/**
 * 判断是否为本机/局域网来源（自托管家居场景的安全默认）。
 *
 * 安全意图：未显式配置 CORS 白名单时，仍允许局域网内设备访问后端，避免家庭网络下
 * 前端被误拦；公网来源必须显式配置白名单。
 *
 * @param origin 完整 Origin 字符串（含 scheme）。
 * @returns true 表示属于本机/局域网/链路本地/mDNS（.local）。
 */
export function isLanOrigin(origin: string): boolean {
  try {
    // Logic fix: URL.hostname 对 IPv6 返回带方括号的 "[::1]"，需剥离后比较。
    const host = new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '::ffff:127.0.0.1'
    )
      return true;
    // RFC1918 私有网段 + 链路本地
    return (
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

/**
 * 判定某来源是否允许跨域。
 * - 命中白名单：放行
 * - 未配置白名单：仅放行局域网/本机来源
 * - 配置了白名单：白名单 + 局域网/本机来源放行，其余拒绝
 *
 * @param origin 待校验的 Origin 字符串。
 * @param allowedOrigins 已解析的 CORS 白名单数组。
 * @returns 是否允许该来源跨域。
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (allowedOrigins.length === 0) return isLanOrigin(origin);
  if (isLanOrigin(origin)) return true;
  return false;
}

// ── 密码策略 ── ────────────────────

/** 密码策略提示文案：≥8 位，含字母与数字 */
export const PASSWORD_POLICY_MESSAGE = '密码至少 8 位，且须同时包含字母和数字';

/**
 * 校验密码是否符合策略（≥8 位且 ≤128 位，须同时包含字母与数字）。
 *
 * @param password 明文密码。
 * @returns true 表示符合策略。
 */
function isPasswordPolicyCompliant(password: string): boolean {
  if (!password || password.length < 8 || password.length > 128) return false;
  return /[a-zA-Z]/.test(password) && /\d/.test(password);
}

/**
 * 断言密码符合策略；不符合则抛出业务异常（badRequest）。
 *
 * @param password 明文密码。
 * @throws {BusinessException} 密码不符合策略时抛出 400 业务异常。
 */
export function assertPasswordPolicy(password: string): void {
  if (!isPasswordPolicyCompliant(password)) {
    badRequest(PASSWORD_POLICY_MESSAGE);
  }
}