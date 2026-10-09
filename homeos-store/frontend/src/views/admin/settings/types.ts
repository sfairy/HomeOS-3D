export interface DiagnosticCheck {
  level?: string;
  label?: string;
  id?: string;
  detail?: string;
}

export interface MailPreset {
  id: string;
  label?: string;
  smtpHost?: string;
  smtpPort?: string | number;
  smtpSecurity?: string;
  domains?: string[];
  hint?: string;
}

export interface SettingsPayload {
  store?: Record<string, unknown>;
  payment?: {
    provider?: string;
    displayName?: string;
    transactionDescription?: string;
    transactionDescriptionFromDatabase?: boolean;
    enabled?: boolean;
    channels?: { provider?: string }[];
    [key: string]: unknown;
  };
  referral?: Record<string, unknown>;
  announcement?: string;
  deviceReleaseCooldownSeconds?: number | string | null;
  deviceReleaseCooldownEffectiveSeconds?: number;
  orderTtlSeconds?: number;
  orderTtlRecommendedSeconds?: number;
  alipay?: Record<string, unknown>;
  wechat?: Record<string, unknown>;
  mail?: Record<string, unknown>;
  channels?: string[];
}

export interface SettingsForm {
  siteName: string;
  siteTitle: string;
  supportEmail: string;
  logoUrl: string;
  deployBaseUrl: string;
  description: string;
  announcement: string;
  paymentChannelAlipay: boolean;
  paymentChannelWechat: boolean;
  paymentProvider: string;
  paymentDisplayName: string;
  paymentTransactionDescription: string;
  paymentEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  alipayAppId: string;
  alipaySellerId: string;
  alipayGatewayUrl: string;
  alipayAppPrivateKey: string;
  alipayPublicKey: string;
  alipayNotifyUrl: string;
  alipayReturnUrl: string;
  alipayClearPrivateKey: boolean;
  alipayClearPublicKey: boolean;
  wechatMchId: string;
  wechatAppId: string;
  wechatMerchantSerialNo: string;
  wechatApiV3Key: string;
  wechatMerchantPrivateKey: string;
  wechatPlatformPublicKey: string;
  wechatPlatformPublicKeyId: string;
  wechatGatewayUrl: string;
  wechatNotifyUrl: string;
  wechatClearApiV3Key: boolean;
  wechatClearMerchantPrivateKey: boolean;
  wechatClearPlatformPublicKey: boolean;
  mailMode: string;
  smtpSecurity: string;
  smtpHost: string;
  smtpUsername: string;
  mailFrom: string;
  smtpPort: string;
  smtpPassword: string;
  smtpClearPassword: boolean;
  verificationTtlSeconds: string;
  verificationCooldownSeconds: string;
  verificationGlobalHourlyLimit: string;
  deliveryEmailEnabled: boolean;
  mailTestEmail: string;
  referralEnabled: boolean;
  referralRatePercent: string;
  referralWithdrawalFeePercent: string;
  referralWithdrawalMinPoints: string;
  deviceReleaseCooldownSeconds: string;
}

export interface SettingsPlaceholders {
  alipayAppPrivateKey: string;
  alipayPublicKey: string;
  wechatApiV3Key: string;
  wechatMerchantPrivateKey: string;
  wechatPlatformPublicKey: string;
  smtpPassword: string;
  smtpPort: string;
  verificationTtlSeconds: string;
  verificationCooldownSeconds: string;
  verificationGlobalHourlyLimit: string;
  deviceReleaseCooldownSeconds: string;
}

export function asText(value: unknown): string {
  return value == null ? "" : String(value);
}
