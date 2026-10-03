/**
 * @file channel-provider.interface.ts
 * @module ChannelsModule
 *
 * 消息通道相关的类型与接口定义。
 *
 * 定义了通道消息（ChannelMessage）、通道提供者（ChannelProvider）的统一契约，
 * 以及 Email / WebPush 通道的配置结构。
 */

/**
 * 通道类型枚举。
 * 当前支持 `email`、`webpush`；保留字面量联合类型便于后续扩展。
 */
type ChannelKind = 'email' | 'webpush' | 'wecom';

/**
 * 通道消息统一结构。
 * 各通道提供者需将平台原始消息归一化为该结构后交给 ChannelsService 处理。
 */
export interface ChannelMessage {
  /** 消息来源通道类型 */
  channel: ChannelKind;
  /** 通道内的账号标识（如 Email 发件人地址），用于多账号区分 */
  accountId?: string;
  /** 发送者显示名 */
  fromUser: string;
  /** 会话 ID（Email 收件人或 WebPush endpoint），用于回发消息 */
  chatId: string | number;
  /** 消息文本内容 */
  content: string;
  /** 会话类型：direct 私聊 / group 群聊 / email 邮件 / webpush 推送 / wecom 企微 */
  chatType: 'direct' | 'group' | 'email' | 'webpush' | 'wecom';
  /**
   * 会话级唯一键，用于隔离对话记忆。
   * 形如 `email:<email>`、`webpush:<endpoint>`，同一 sessionKey 共享一份历史记录。
   */
  sessionKey: string;
}

/**
 * 通道提供者契约。
 * 每个具体通道（EmailService、WebPushService 等）需实现该接口，
 * 由 ChannelsService 统一调度：注册消息回调、回发文本。
 */
export interface ChannelProvider {
  /** 通道名称，与 ChannelKind 对应 */
  name: string;
  /**
   * 注册消息处理回调。通道收到用户消息时调用 handler。
   * @param handler 消息处理函数，可同步或异步
   */
  onMessage(handler: (msg: ChannelMessage) => void | Promise<void>): void;
  /**
   * 向指定会话回发文本消息。
   * @param to 目标会话 ID（chatId、email 地址或 webpush endpoint）
   * @param text 文本内容
   */
  sendText(to: string | number, text: string): Promise<void>;
}

/**
 * Email 通道配置结构。
 * 对应 UI 配置中 `channelConfig.email` 字段。
 */
export interface EmailChannelConfig {
  /** 是否启用 Email 通道 */
  enabled: boolean;
  /** SMTP 服务器地址 */
  smtpHost: string;
  /** SMTP 端口（通常 587） */
  smtpPort: number;
  /** SMTP 用户名 */
  smtpUser: string;
  /** SMTP 密码 */
  smtpPassword: string;
  /** 发件人地址 */
  fromAddress: string;
  /** 收件人地址列表（逗号分隔） */
  toAddresses: string;
  /** 是否启用 TLS */
  tlsEnabled: boolean;
}

/**
 * WebPush 通道配置结构。
 * 对应 UI 配置中 `channelConfig.webpush` 字段。
 */
export interface WebPushChannelConfig {
  /** 是否启用 WebPush 通道 */
  enabled: boolean;
  /** VAPID 公钥 */
  vapidPublicKey: string;
  /** VAPID 私钥 */
  vapidPrivateKey: string;
  /** 推送主题（通常为应用域名） */
  subject: string;
}

/**
 * 企业微信应用通道配置（存于 layout.channelConfig.wecom）。
 */
export interface WecomChannelConfig {
  enabled: boolean;
  corpId: string;
  corpSecret: string;
  agentId: string | number;
  callbackToken: string;
  callbackAesKey: string;
  /** 可选 API 代理前缀（内网访问 qyapi） */
  apiProxy?: string;
  /** 逗号分隔 UserId 白名单，空则不限制 */
  allowedUsers?: string;
  /**
   * 绑定的 HomeOS 用户 ID。
   * 未配置时渠道消息仅允许查询类工具，禁止 control_device / control_room。
   */
  boundHomeOsUserId?: string;
}

/**
 * 全部通道的配置聚合。
 * 后续新增通道时在此扩展对应字段。
 */
export interface ChannelConfig {
  email: EmailChannelConfig;
  webpush: WebPushChannelConfig;
  wecom?: WecomChannelConfig;
}
