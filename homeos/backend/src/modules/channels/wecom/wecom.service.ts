/**
 * @file wecom.service.ts
 * @module ChannelsModule
 *
 * 企业微信应用消息通道：入站回调 → Agent，出站应用消息回发。
 *
 * 职责：
 * - 实现 ChannelProvider 接口，提供企微通道的 onMessage / sendText 能力
 * - 维护 corpId / corpSecret / agentId / 回调 Token / AES Key / 白名单等运行时配置
 * - 缓存 access_token 并通过 tokenRefreshPromise 进行并发去重刷新
 * - fail-closed 白名单校验：白名单为空时拒绝所有入站消息，避免任意企微成员借绑定身份控制设备
 * - 配置热重载：监听 SYSTEM_CONFIG_UPDATED 事件
 *
 * 依赖：ChannelConfigService（读取配置）、EventEmitter2（事件订阅）、axios（调用企微 API）、
 *       wecom.utils（Markdown 转纯文本 + 长文本分片）、BusinessException、API_ERROR
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';
import { ChannelConfigService } from '../channel-config.service';
import type { ChannelMessage, ChannelProvider } from '../channel-provider.interface';
import { HOMEOS_EVENTS } from '../../../shared/homeos-events';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { BusinessException, ErrorCode, getErrorMessage } from '../../../common/utils';
import { markdownToWecomText, splitWecomText } from './wecom.utils';
import { sleep } from '../../../common/utils/sleep.util';

/**
 * 企业微信应用消息通道服务（可注入）。
 *
 * 实现 ChannelProvider 接口，由 ChannelsService 调度：入站消息经白名单鉴权后转发到 Agent，
 * 出站消息通过企微 message/send API 回发。access_token 带过期缓存与并发去重刷新。
 */
@Injectable()
export class WecomService implements ChannelProvider, OnModuleInit, OnModuleDestroy {
  readonly name = 'wecom';
  private readonly logger = new Logger(WecomService.name);

  private corpId?: string;
  private corpSecret?: string;
  private agentId = 0;
  private callbackToken?: string;
  private aesKey?: string;
  private apiProxy?: string;
  /** 出站/白名单 UserId（保留原始大小写，供 message/send） */
  private allowedUsers: string[] = [];
  /** 入站鉴权用小写集合 */
  private allowedUsersLower = new Set<string>();
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenRefreshPromise: Promise<string> | null = null;
  private messageHandler?: (msg: ChannelMessage) => void | Promise<void>;

  /** 稳定引用：配置变更时热重载企业微信通道 */
  private readonly onSystemConfigUpdated = async () => {
    this.logger.log('检测到配置更新,正在热重载企业微信通道...');
    this.channelConfigService.invalidateCache();
    await this.reload();
  };

  constructor(
    private readonly channelConfigService: ChannelConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 模块初始化：注册配置热重载监听并执行首次配置加载 */
  async onModuleInit(): Promise<void> {
    this.eventEmitter.on(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
    await this.reload();
  }

  onModuleDestroy(): void {
    this.eventEmitter.off(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  /**
   * 重新加载企微通道配置。
   * @remarks 配置不完整或未启用时清空所有运行时状态并停用通道；
   *          白名单字符串按逗号切分，同时构建小写集合供入站鉴权使用。
   */
  async reload(): Promise<void> {
    const cfg = await this.channelConfigService.getWecomConfig();
    if (!cfg || !cfg.enabled || !cfg.corpId || !cfg.corpSecret) {
      this.logger.warn('企业微信未启用或配置不完整,通道停用');
      this.corpId = undefined;
      this.corpSecret = undefined;
      this.agentId = 0;
      this.callbackToken = undefined;
      this.aesKey = undefined;
      this.apiProxy = undefined;
      this.allowedUsers = [];
      this.allowedUsersLower.clear();
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      return;
    }
    this.corpId = cfg.corpId;
    this.corpSecret = cfg.corpSecret;
    this.agentId = Number(cfg.agentId || 0);
    this.callbackToken = cfg.callbackToken;
    this.aesKey = cfg.callbackAesKey;
    this.apiProxy = cfg.apiProxy;
    this.allowedUsers = cfg.allowedUsers
      ? cfg.allowedUsers
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean)
      : [];
    this.allowedUsersLower = new Set(this.allowedUsers.map((u) => u.toLowerCase()));
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.logger.log('企业微信通道已热重载');
  }

  /** 注册消息处理回调（由 ChannelsService 调用，将入站消息接入 Agent 流水线） */
  onMessage(handler: (msg: ChannelMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  /** 返回回调鉴权所需配置（token / aesKey / corpId），供 WecomController 校验签名使用 */
  getSecurityConfig(): { token?: string; aesKey?: string; corpId?: string } {
    return {
      token: this.callbackToken,
      aesKey: this.aesKey,
      corpId: this.corpId,
    };
  }

  /**
   * 查询通道运行状态（供 /channels/status 接口使用）。
   * @returns enabled 是否启用；configured 是否配置了完整四件套（corpId/secret/token/aesKey）
   */
  async getStatus(): Promise<{
    enabled: boolean;
    configured: boolean;
    corpId?: string;
    agentId: number;
  }> {
    const cfg = await this.channelConfigService.getWecomConfig();
    return {
      enabled: Boolean(cfg?.enabled),
      configured: Boolean(cfg?.corpId && cfg?.corpSecret && cfg?.callbackToken && cfg?.callbackAesKey),
      corpId: cfg?.corpId,
      agentId: Number(cfg?.agentId || 0),
    };
  }

  /**
   * 向指定用户发送文本消息：Markdown 转纯文本 → 长文本分片 → 逐片调用企微 API。
   * @param to 目标 UserId（@all 表示全员）
   * @param text 原始文本（可为 Markdown）
   * @remarks 分片之间插入 300ms 间隔，避免触发企微 API 频控；单片失败不影响其余片发送。
   */
  async sendText(to: string | number, text: string): Promise<void> {
    const plainText = markdownToWecomText(text);
    const chunks = splitWecomText(plainText);
    for (let i = 0; i < chunks.length; i++) {
      try {
        await this.sendWecomTextSingle(String(to), chunks[i]);
        if (i < chunks.length - 1) await sleep(300);
      } catch (error: unknown) {
        const msg = getErrorMessage(error);
        this.logger.error(`企微消息分片发送失败 ${i + 1}/${chunks.length}: ${msg}`);
      }
    }
  }

  /**
   * 告警/系统通知广播：优先 UserId 白名单，否则 @all。
   * 仅需 corpId / corpSecret / agentId（不依赖回调 Token）。
   */
  async sendAlertBroadcast(text: string, title?: string): Promise<void> {
    if (!this.corpId || !this.corpSecret || !this.agentId) {
      this.logger.warn('企微出站未就绪(缺少 CorpId/Secret/AgentId),跳过告警推送');
      return;
    }
    // 标题以 Markdown `#` 前置，经 markdownToWecomText 转为 `◆ 标题` 醒目行
    const heading = String(title ?? '').trim();
    const body = heading ? `# ${heading}\n\n${text}` : text;
    const targets = this.allowedUsers.length > 0 ? this.allowedUsers : ['@all'];
    for (const to of targets) {
      try {
        await this.sendText(to, body);
      } catch (error: unknown) {
        const msg = getErrorMessage(error);
        this.logger.error(`企微告警推送失败 (${to}): ${msg}`);
      }
    }
  }

  /**
   * 处理企微入站消息：白名单鉴权 → 构造 ChannelMessage → 调用 messageHandler。
   * @param fromUser 企微用户 UserId
   * @param content 消息文本内容
   * @remarks fail-closed：白名单为空时拒绝所有入站消息，避免任意企微成员借绑定身份控制设备。
   *          未授权用户会被提示联系管理员；处理失败时回发兜底错误文案。
   */
  async handleIncomingMessage(fromUser: string, content: string): Promise<void> {
    // fail-closed：白名单为空时拒绝所有入站消息，避免任意企微成员借绑定身份控制设备
    if (this.allowedUsersLower.size === 0) {
      this.logger.warn(`企微白名单为空，拒绝入站消息: ${fromUser}`);
      await this.sendText(fromUser, '未配置控制授权白名单，请联系管理员在企微通道配置允许的用户。');
      return;
    }
    if (!this.allowedUsersLower.has(fromUser.toLowerCase())) {
      this.logger.warn(`未授权企微用户: ${fromUser}`);
      await this.sendText(fromUser, '您未获得控制授权，请联系管理员配置白名单。');
      return;
    }
    if (!this.messageHandler) return;
    const channelMsg: ChannelMessage = {
      channel: 'wecom',
      accountId: this.corpId,
      fromUser,
      chatId: fromUser,
      content,
      chatType: 'direct',
      sessionKey: `wecom:${fromUser}`,
    };
    try {
      await this.messageHandler(channelMsg);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.logger.error(`企微消息处理失败: ${msg}`);
      await this.sendText(fromUser, '系统内部处理消息出错');
    }
  }

  /**
   * 获取企微 access_token：带过期缓存 + 并发去重刷新。
   * @returns 有效的 access_token
   * @remarks 距过期超过 60s 时直接返回缓存；并发刷新通过 tokenRefreshPromise 去重，避免雪崩请求。
   *          corpId/corpSecret 缺失时抛 BusinessException。
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now + 60_000) {
      return this.accessToken;
    }
    if (this.tokenRefreshPromise) return this.tokenRefreshPromise;

    const corpId = this.corpId;
    const corpSecret = this.corpSecret;
    if (!corpId || !corpSecret) {
      throw new BusinessException(ErrorCode.CONFIG_ERROR, API_ERROR.WECOM_CREDENTIALS_MISSING);
    }

    const refreshPromise = (async () => {
      try {
        const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`;
        const response = await this.fetchApi(url);
        if (!response.data?.access_token) {
          throw new BusinessException(
            ErrorCode.EXTERNAL_ERROR,
            API_ERROR.WECOM_GET_TOKEN_FAILED(JSON.stringify(response.data)),
          );
        }
        this.accessToken = String(response.data.access_token);
        this.tokenExpiresAt = Date.now() + (Number(response.data.expires_in) || 7200) * 1000;
        return this.accessToken;
      } finally {
        this.tokenRefreshPromise = null;
      }
    })();
    this.tokenRefreshPromise = refreshPromise;
    return refreshPromise;
  }

  /**
   * 向指定用户发送单条文本消息（不分片，由 sendText 上层负责分片）。
   * @param toUser 目标 UserId
   * @param text 单片文本内容（≤ 2000 字节）
   * @remarks errcode 非 0 时抛 BusinessException，由上层捕获并记录日志。
   */
  private async sendWecomTextSingle(toUser: string, text: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`;
    const body = {
      touser: toUser,
      msgtype: 'text',
      agentid: this.agentId,
      text: { content: text },
      safe: 0,
    };
    const response = await this.fetchApi(url, {
      method: 'POST',
      data: body,
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.data?.errcode !== 0) {
      throw new BusinessException(
        ErrorCode.EXTERNAL_ERROR,
        API_ERROR.WECOM_SEND_FAILED(JSON.stringify(response.data)),
      );
    }
  }

  /**
   * 调用企微 API 的统一出口，支持可选 apiProxy 代理前缀。
   * @param url 原始企微 qyapi URL
   * @param options 请求方法 / body / headers
   * @returns axios 响应
   * @remarks apiProxy 用于内网无法直连 qyapi.weixin.qq.com 时通过反代访问；
   *          仅替换 host + path + search，保留原始 query 与 body。
   */
  private async fetchApi(
    url: string,
    options: { method?: string; data?: unknown; headers?: Record<string, string> } = {},
  ) {
    let targetUrl = url;
    if (this.apiProxy) {
      try {
        const originalUrl = new URL(url);
        targetUrl = `${this.apiProxy.replace(/\/$/, '')}${originalUrl.pathname}${originalUrl.search}`;
      } catch (err: unknown) {
        const msg = getErrorMessage(err);
        this.logger.error(`无效的 API URL:${url},${msg}`);
      }
    }
    return axios({
      url: targetUrl,
      method: (options.method as 'GET' | 'POST') || 'GET',
      data: options.data,
      headers: options.headers,
    });
  }
}
