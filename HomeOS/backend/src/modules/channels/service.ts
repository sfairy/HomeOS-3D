/**
 * @file channels.service.ts
 * @module ChannelsModule
 *
 * 消息通道分发服务：统一调度各通道提供者（EmailService、WebPushService 等），
 * 将用户消息转发给 AgentService，并把 Agent 回复格式化后回发。
 *
 * 核心职责：
 * - 维护按 sessionKey 隔离的对话历史（内存中，带容量上限）
 * - 处理快捷命令（/clear、清除记忆）
 * - 在 Mock 模式下回发引导文案
 * - 将 Agent 结果通过 formatChannelReply 转为口语化回复
 * - 统一管理多通道的注册与状态查询
 * - 外部告警投递前统一前置时间戳（Asia/Shanghai）
 *
 * 依赖：
 * - EmailService：Email 通道提供者
 * - WebPushService：WebPush 通道提供者
 * - AgentService：执行智能对话
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EmailService } from './email/service';
import { WebPushService } from './webpush/service';
import { WecomService } from './wecom/wecom.service';
import { AgentService } from '../agent/service';
import type { AgentActor } from '../agent/agent-actor';
import type { ChannelProvider, ChannelMessage } from './channel-provider.interface';
import { formatChannelReply } from './reply.util';
import { MOCK_AGENT_CONFIG_GUIDE } from './mock-guide';
import { ChannelConfigService } from './channel-config.service';
import { PrismaService } from '../../shared/prisma/service';
import { readJsonObject } from '../../common/utils/json-field.util';
import { getErrorMessage } from '../../common/utils';
import { withPushTimestamp } from '../../common/utils';

/** 单个会话保留的最大历史轮次（user + assistant 各计 1 条） */
const MAX_HISTORY = 16;
/** 同时在内存中维护的最大会话数；超出时淘汰最旧会话 */
const MAX_SESSIONS = 200;

/** 对话历史单条结构，兼容 OpenAI 风格的 role/content */
type HistoryItem = { role: 'user' | 'assistant'; content: string };

/**
 * 消息通道分发服务（可注入）。
 *
 * 实现 OnModuleInit，在模块初始化时向各通道提供者注册消息回调，
 * 从而把各通道收到的消息接入 Agent 对话流水线。
 */
@Injectable()
export class ChannelsService implements OnModuleInit {
  private readonly logger = new Logger(ChannelsService.name);
  /** 会话历史表：sessionKey → 历史条目数组 */
  private readonly sessions = new Map<string, HistoryItem[]>();
  /** 通道提供者注册表：名称 → 提供者实例 */
  private readonly providers = new Map<string, ChannelProvider>();

  constructor(
    private readonly emailService: EmailService,
    private readonly webPushService: WebPushService,
    private readonly wecomService: WecomService,
    private readonly agentService: AgentService,
    private readonly channelConfig: ChannelConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.providers.set(emailService.name, emailService);
    this.providers.set(webPushService.name, webPushService);
    this.providers.set(wecomService.name, wecomService);
  }

  /**
   * 解析渠道绑定的 HomeOS 用户作为 Agent 执行身份。
   * 未绑定则返回 undefined → 控制类工具被 ACL 拒绝（只读）。
   */
  private async resolveChannelActor(channel: string): Promise<AgentActor | undefined> {
    if (channel !== 'wecom') return undefined;
    const cfg = await this.channelConfig.getWecomConfig();
    const userId = String(cfg?.boundHomeOsUserId || '').trim();
    if (!userId) return undefined;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, preferences: true },
    });
    if (!user) {
      this.logger.warn(`企微绑定用户不存在: ${userId}`);
      return undefined;
    }
    const prefs = readJsonObject(user.preferences) as Record<string, unknown>;
    const restrictions = Array.isArray(prefs.entityRestrictions)
      ? (prefs.entityRestrictions as string[])
      : undefined;
    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      ...(user.role !== 'admin' && restrictions ? { restrictions } : {}),
    };
  }

  /**
   * 模块初始化。
   * Email / WebPush 当前主要为出站通知；企微入站回调注册到 Agent 流水线。
   */
  onModuleInit(): void {
    this.wecomService.onMessage((msg) => this.handleChannelMessage(msg, this.wecomService));
    this.logger.log('消息通道分发服务已初始化(含企业微信)');
  }

  /**
   * 获取所有通道的运行状态（供管理后台 / channels/status 接口使用）。
   * @returns 包含所有通道状态的聚合对象
   */
  async getStatus() {
    const [email, webpush, wecom] = await Promise.all([
      this.emailService.getStatus(),
      this.webPushService.getStatus(),
      this.wecomService.getStatus(),
    ]);
    return { email, webpush, wecom };
  }

  /**
   * 告警/系统通知的外部通道投递（Email / WebPush / 企业微信）。
   * 各通道失败互不影响；调用方无需直接触达具体 Provider。
   *
   * 主动推送正文统一前置 `[YYYY-MM-DD HH:mm:ss]` 时间戳（Asia/Shanghai），
   * 便于与企业微信 / 移动端通知的接收时间对照；正文已带同格式前缀时不重复前置。
   *
   * @param channels 目标通道列表
   * @param message 原始正文
   * @param title 可选推送标题（Email 主题 / WebPush 通知标题 / 企业微信标题行；缺省由各 Provider 使用内置标题）
   */
  async sendExternalAlert(channels: string[], message: string, title?: string): Promise<void> {
    if (!Array.isArray(channels) || channels.length === 0 || !message?.trim()) return;

    const status = await this.getStatus();
    // 统一时间戳前置：地震速报等内联时间戳正文命中同格式前缀则原样透传
    const text = withPushTimestamp(message);

    if (channels.includes('email') && status.email.enabled && status.email.configured) {
      try {
        await this.emailService.sendText('', text, title);
      } catch (error: unknown) {
        const msg = getErrorMessage(error);
        this.logger.error(`Email 告警投递失败: ${msg}`);
      }
    }

    if (channels.includes('webpush') && status.webpush.enabled && status.webpush.configured) {
      try {
        await this.webPushService.sendText('', text, title);
      } catch (error: unknown) {
        const msg = getErrorMessage(error);
        this.logger.error(`WebPush 告警投递失败: ${msg}`);
      }
    }

    if (channels.includes('wecom') && status.wecom.enabled) {
      try {
        await this.wecomService.sendAlertBroadcast(text, title);
      } catch (error: unknown) {
        const msg = getErrorMessage(error);
        this.logger.error(`企业微信告警投递失败: ${msg}`);
      }
    }
  }

  /**
   * 清除指定会话的历史记忆。
   * @param sessionKey 会话唯一键（如 `email:<address>`）
   */
  clearSession(sessionKey: string): void {
    this.sessions.delete(sessionKey);
  }

  /**
   * 获取指定会话的历史副本（不暴露内部引用，避免外部修改污染）。
   * @param sessionKey 会话唯一键
   * @returns 历史条目数组的浅拷贝
   */
  private getHistory(sessionKey: string): HistoryItem[] {
    return [...(this.sessions.get(sessionKey) || [])];
  }

  /**
   * 追加一轮对话到会话历史，并执行容量控制。
   *
   * - 单条内容截断到 2000 字符，避免上下文过长。
   * - 超过 MAX_HISTORY 时移除最旧条目（FIFO）。
   * - 会话总数超过 MAX_SESSIONS 时淘汰最旧会话。
   *
   * @param sessionKey 会话唯一键
   * @param user 用户消息原文
   * @param assistant 助手回复原文
   */
  private pushTurn(sessionKey: string, user: string, assistant: string): void {
    const list = this.sessions.get(sessionKey) || [];
    list.push({ role: 'user', content: user.slice(0, 2000) });
    if (assistant.trim()) {
      list.push({ role: 'assistant', content: assistant.slice(0, 2000) });
    }
    while (list.length > MAX_HISTORY) list.shift();
    this.sessions.set(sessionKey, list);
    if (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest) this.sessions.delete(oldest);
    }
  }

  /**
   * 处理来自通道的用户消息：解析命令 → 调用 Agent → 格式化回复 → 回发。
   *
   * @param msg 归一化后的通道消息
   * @param provider 通道提供者，用于回发文本
   */
  async handleChannelMessage(msg: ChannelMessage, provider: ChannelProvider): Promise<void> {
    this.logger.log(`收到来自 ${msg.channel} [${msg.fromUser}] 的消息: "${msg.content}"`);

    const trimmed = msg.content.trim();
    const cmd = trimmed.split(/\s+/)[0].replace(/@[\w_]+$/i, '').toLowerCase();
    if (cmd === '/clear' || trimmed === '清除记忆') {
      this.clearSession(msg.sessionKey);
      try {
        await this.agentService.chat('清除记忆');
      } catch {
        /* 忽略 Agent 内部重置错误，本地历史已清除 */
      }
      await provider.sendText(msg.chatId, '已清除本对话记忆。');
      return;
    }

    try {
      const providerInfo = this.agentService.getProviderInfo();
      if (providerInfo.provider === 'mock' || !providerInfo.ready) {
        await provider.sendText(msg.chatId, MOCK_AGENT_CONFIG_GUIDE);
        return;
      }

      const history = this.getHistory(msg.sessionKey);
      const actor = await this.resolveChannelActor(msg.channel);
      if (!actor) {
        this.logger.warn(
          `渠道 ${msg.channel} 未绑定 HomeOS 用户:控制类指令将被拒绝,仅允许查询`,
        );
      }
      const result = await this.agentService.chat(msg.content, history, { actor });
      const replyText = formatChannelReply(result);
      if (replyText) {
        this.pushTurn(msg.sessionKey, msg.content, replyText);
        await provider.sendText(msg.chatId, replyText);
      } else if (result.outcome === 'success') {
        const fallback = formatChannelReply({ outcome: 'success', reply: '' });
        this.pushTurn(msg.sessionKey, msg.content, fallback);
        await provider.sendText(msg.chatId, fallback);
      }
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      this.logger.error(`执行 ${msg.channel} 智能对话失败: ${errMsg}`);
      await provider.sendText(msg.chatId, '出了点问题，请重试。');
    }
  }
}
