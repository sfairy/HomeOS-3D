/**
 * 职责：
 *  - HA Lovelace 卡片→HomeOS UI 映射；
 * 关键依赖：
 *  - shared/ha；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { CONFIG_MASK_PLACEHOLDER, isMaskedValue } from '../../shared/app-config/config-mask.util';

/**
 * 非 admin 读取 layout 时脱敏 HA token / 智能管家 API Key / 通道密钥。
 * 使用 structuredClone 深拷贝，避免修改原始对象。
 */
function maskAgentSecrets(agentConfig: Record<string, unknown> | undefined): void {
  if (!agentConfig) return;
  const hadKey =
    agentConfig.apiKey != null &&
    String(agentConfig.apiKey).length > 0 &&
    !isMaskedValue(agentConfig.apiKey);
  if (agentConfig.apiKey != null && String(agentConfig.apiKey).length > 0) {
    agentConfig.apiKey = CONFIG_MASK_PLACEHOLDER;
  }
  if (agentConfig.mcpGatewaySecret != null && String(agentConfig.mcpGatewaySecret).length > 0) {
    agentConfig.mcpGatewaySecret = CONFIG_MASK_PLACEHOLDER;
  }
  // 供前端判断是否已配置密钥，避免脱敏后误判为未配置导致鉴权失败
  agentConfig.apiKeyConfigured = Boolean(hadKey || agentConfig.apiKeyConfigured);
}

/** 通知通道配置中的密钥字段结构（email / webpush / wecom） */
type ChannelConfigSecrets = {
  email?: Record<string, unknown>;
  webpush?: Record<string, unknown>;
  wecom?: Record<string, unknown>;
};

/**
 * 脱敏通知通道密钥：Email SMTP 密码、WebPush VAPID 私钥、企微回调 Token / AES Key。
 * 原地修改传入对象，将非空敏感字段替换为占位符。
 */
function maskChannelSecrets(channelConfig: ChannelConfigSecrets | undefined): void {
  if (!channelConfig) return;
  if (channelConfig.email?.smtpPassword) {
    channelConfig.email.smtpPassword = CONFIG_MASK_PLACEHOLDER;
  }
  if (channelConfig.webpush?.vapidPrivateKey) {
    channelConfig.webpush.vapidPrivateKey = CONFIG_MASK_PLACEHOLDER;
  }
  if (channelConfig.wecom) {
    for (const key of ['corpSecret', 'callbackToken', 'callbackAesKey'] as const) {
      if (channelConfig.wecom[key]) {
        channelConfig.wecom[key] = CONFIG_MASK_PLACEHOLDER;
      }
    }
  }
}

/** 将 JsonB / 对象 layout 规范为普通对象；非法则 null */
function asLayoutObject(layout: unknown): Record<string, unknown> | null {
  if (layout != null && typeof layout === 'object' && !Array.isArray(layout)) {
    return layout as Record<string, unknown>;
  }
  return null;
}

/**
 * 对 layout 进行全量密钥脱敏（HA token + Agent 密钥 + 通道密钥）。
 * 使用 structuredClone 深拷贝，避免修改原始对象；供非 admin 读取路径使用。
 */
function maskLayoutSecrets(layout: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(layout);
  const haConfig = out.haConfig as Record<string, unknown> | undefined;
  if (haConfig?.token != null && String(haConfig.token).length > 0) {
    haConfig.token = CONFIG_MASK_PLACEHOLDER;
  }
  maskAgentSecrets(out.agentConfig as Record<string, unknown> | undefined);
  maskChannelSecrets(out.channelConfig as ChannelConfigSecrets | undefined);
  return out;
}

/**
 * 按角色决定是否脱敏 layout 中的密钥。
 * admin 保留 HA token 明文以便连接配置编辑；Agent / 通道密钥一律脱敏，
 * 运行时由 AgentConfigService.getRuntimeConfig 内部直读明文。
 */
export function maskLayoutForRole(
  layout: Record<string, unknown>,
  role?: string,
): Record<string, unknown> {
  if (role === 'admin') {
    const out = structuredClone(layout);
    // Agent / MCP / 企微密钥对 admin 也脱敏，防止前端回写写穿
    maskAgentSecrets(out.agentConfig as Record<string, unknown> | undefined);
    maskChannelSecrets(out.channelConfig as ChannelConfigSecrets | undefined);
    return out;
  }
  return maskLayoutSecrets(layout);
}

/**
 * 判断敏感字段值是否应视为"未修改"（空值 / null / undefined / 脱敏占位符）。
 * 这些值都不会覆盖已有的真实密钥。
 */
function isSensitiveValueSkippable(val: unknown): boolean {
  if (val == null) return true;
  if (val === '') return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  return isMaskedValue(val);
}

/**
 * 保存时若 token 为脱敏占位符/空值/null，保留数据库中的真实 token。
 * 前端回传的 layout 中密钥可能是占位符（因非 admin 读取时被脱敏），
 * 此时需从数据库已有 layout 中恢复真实值，避免覆盖为占位符。
 * 同样处理：空字符串、null、undefined、完全缺失的字段。
 */
export function mergeLayoutSecretsOnSave(
  incoming: Record<string, unknown>,
  existingLayout: unknown,
): Record<string, unknown> {
  const merged = structuredClone(incoming);
  const incomingCh = merged.channelConfig as ChannelConfigSecrets | undefined;
  if (existingLayout == null) return merged;
  const existing = asLayoutObject(existingLayout);
  if (!existing) return merged;
  const incomingHa = merged.haConfig as Record<string, unknown> | undefined;
  const existingHa = existing.haConfig as { token?: string } | undefined;
  if (incomingHa && isSensitiveValueSkippable(incomingHa.token) && existingHa?.token) {
    incomingHa.token = existingHa.token;
  }
  const incomingAgent = merged.agentConfig as Record<string, unknown> | undefined;
  const existingAgent = existing.agentConfig as {
    apiKey?: string;
    mcpGatewaySecret?: string;
  } | undefined;
  if (
    incomingAgent &&
    isSensitiveValueSkippable(incomingAgent.apiKey) &&
    existingAgent?.apiKey
  ) {
    incomingAgent.apiKey = existingAgent.apiKey;
  }
  if (
    incomingAgent &&
    isSensitiveValueSkippable(incomingAgent.mcpGatewaySecret) &&
    existingAgent?.mcpGatewaySecret
  ) {
    incomingAgent.mcpGatewaySecret = existingAgent.mcpGatewaySecret;
  }
  // 持久化层不存 apiKeyConfigured 标志
  if (incomingAgent) delete incomingAgent.apiKeyConfigured;
  const existingCh = existing.channelConfig as
    | {
        email?: { smtpPassword?: string };
        webpush?: { vapidPrivateKey?: string };
        wecom?: {
          corpSecret?: string;
          callbackToken?: string;
          callbackAesKey?: string;
        };
      }
    | undefined;
  if (
    incomingCh?.email &&
    isSensitiveValueSkippable(incomingCh.email.smtpPassword) &&
    existingCh?.email?.smtpPassword
  ) {
    incomingCh.email.smtpPassword = existingCh.email.smtpPassword;
  }
  if (
    incomingCh?.webpush &&
    isSensitiveValueSkippable(incomingCh.webpush.vapidPrivateKey) &&
    existingCh?.webpush?.vapidPrivateKey
  ) {
    incomingCh.webpush.vapidPrivateKey = existingCh.webpush.vapidPrivateKey;
  }
  if (incomingCh?.wecom && existingCh?.wecom) {
    for (const key of ['corpSecret', 'callbackToken', 'callbackAesKey'] as const) {
      if (
        isSensitiveValueSkippable(incomingCh.wecom[key]) &&
        existingCh.wecom[key]
      ) {
        incomingCh.wecom[key] = existingCh.wecom[key];
      }
    }
  }
  return merged;
}

/**
 * 从 layout JSON 提取 HA 连接指纹（url + fallbackUrl + token），用于判断是否需要触发重连。
 * @returns "url|fallback|token" 格式的指纹字符串；layout 为空或解析失败返回空串
 */
export function extractHaConfigFingerprint(layout: unknown): string {
  if (layout == null || layout === '') return '';
  const parsed = asLayoutObject(layout);
  if (!parsed) return '';
  const ha = parsed.haConfig as { url?: string; fallbackUrl?: string; token?: string } | undefined;
  if (!ha?.url || !ha?.token) return '';
  const fallback = String(ha.fallbackUrl || '')
    .trim()
    .replace(/\/$/, '');
  return `${String(ha.url).replace(/\/$/, '')}|${fallback}|${String(ha.token)}`;
}
