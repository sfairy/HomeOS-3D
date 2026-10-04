/**
 * API 错误码解析工具（正查表，取代脆弱的中文反查）
 *
 * 职责：根据异常 message 解析稳定错误码（API_ERROR key），供前端 i18n / 日志聚合。
 * 原实现为「中文 message 反查 key」：
 *  1. 逐条字符串相等比较（O(n)，文案改一个字就断码）；
 *  2. 动态工厂文案仅有 11 条手工前缀映射，其余 ~50 条动态错误无 apiErrorCode。
 * 现改为：
 *  1. 静态文案 → key 正查 Map（模块加载时构建一次，O(1)）；
 *  2. 动态工厂文案 → 用哨兵值调用工厂提取稳定前缀，自动登记前缀 → key；
 *  3. 手工前缀表仅作兜底（工厂含非插值逻辑无法自动提取时）。
 */
import { API_ERROR } from './api-error-messages';

/** 静态文案 → 错误码 正查表 */
const STATIC_CODE_BY_MESSAGE = new Map<string, string>();

/** 动态文案前缀 → 错误码（自动推导 + 手工兜底合并） */
const DYNAMIC_PREFIX_CODES = new Map<string, string>();

/** 哨兵值：调用工厂函数时注入，用于提取模板字符串中首个插值之前的稳定前缀 */
const PREFIX_SENTINEL = '\u0000HOMEOS_PREFIX_SENTINEL\u0000';

function buildCodeIndexes(): void {
  for (const [code, value] of Object.entries(API_ERROR)) {
    if (typeof value === 'string') {
      // 保留首个出现的映射（与旧实现的顺序优先语义一致）
      if (!STATIC_CODE_BY_MESSAGE.has(value)) STATIC_CODE_BY_MESSAGE.set(value, code);
      continue;
    }
    if (typeof value === 'function') {
      try {
        const out = String((value as (...args: unknown[]) => unknown)(PREFIX_SENTINEL));
        const idx = out.indexOf(PREFIX_SENTINEL);
        if (idx > 0) {
          const prefix = out.slice(0, idx);
          if (prefix.trim()) DYNAMIC_PREFIX_CODES.set(prefix, code);
        }
      } catch {
        /* 工厂含算术/格式化等无法以哨兵安全调用时跳过，交由手工表兜底 */
      }
    }
  }
}

/**
 * 手工兜底前缀表：工厂无法用哨兵提取稳定前缀（如首个参数即 label 且无固定前缀）时登记。
 * 与自动推导合并，自动推导优先（重复前缀以自动推导为准）。
 */
const MANUAL_DYNAMIC_PREFIXES: Array<{ prefix: string; code: string }> = [
  { prefix: '备份 schema ', code: 'BACKUP_SCHEMA_TOO_NEW' },
  { prefix: '备份包 schema ', code: 'BUNDLE_SCHEMA_TOO_NEW' },
  { prefix: '企业微信获取 access_token 失败: ', code: 'WECOM_GET_TOKEN_FAILED' },
  { prefix: '企业微信发送消息失败: ', code: 'WECOM_SEND_FAILED' },
  { prefix: '实体未找到: ', code: 'ENTITY_NOT_FOUND' },
  { prefix: '区域 ', code: 'AREA_NOT_FOUND' },
  { prefix: 'WebSocket 请求超时：', code: 'HA_WS_REQUEST_TIMEOUT' },
  { prefix: 'Home Assistant 服务错误：', code: 'PROXY_HA_SERVICE_FAILED' },
  { prefix: '内嵌页「', code: 'EMBED_NOT_FOUND' },
];

buildCodeIndexes();
for (const { prefix, code } of MANUAL_DYNAMIC_PREFIXES) {
  if (!DYNAMIC_PREFIX_CODES.has(prefix)) DYNAMIC_PREFIX_CODES.set(prefix, code);
}

/**
 * 根据 API message 解析稳定错误码。
 * 匹配顺序：静态正查表 → 动态前缀表（自动推导 + 手工兜底）。
 */
export function resolveApiErrorCode(message: string | undefined | null): string | undefined {
  if (!message || typeof message !== 'string') return undefined;
  const trimmed = message.trim();
  if (!trimmed) return undefined;
  const staticHit = STATIC_CODE_BY_MESSAGE.get(trimmed);
  if (staticHit) return staticHit;
  for (const [prefix, code] of DYNAMIC_PREFIX_CODES) {
    if (trimmed.startsWith(prefix)) return code;
  }
  return undefined;
}