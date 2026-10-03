/**
 * @file webpush.service.ts
 * @module ChannelsModule
 *
 * WebPush 通道：VAPID 推送 + 订阅持久化（Prisma）+ 热重载。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as webPush from 'web-push';
import { isIP } from 'node:net';
import { ChannelConfigService } from '../channel-config.service';
import { PrismaService } from '../../../shared/prisma/service';
import { HOMEOS_EVENTS } from '../../../shared/homeos-events';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { badRequest, getErrorMessage } from '../../../common/utils';
import type { ChannelMessage, ChannelProvider } from '../channel-provider.interface';

interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  label?: string;
  id?: string;
  createdAt?: Date;
}

/** 私网/回环/链路本地/保留 host 名后缀（mDNS / Docker internal / 本地解析等） */
const BLOCKED_WEBPUSH_HOST_SUFFIXES = [
  '.local',
  '.internal',
  '.localhost',
  '.lan',
  '.home.arpa',
  '.test',
  '.invalid',
];

/** 判断 IPv4 字面量是否属私网/回环/链路本地/保留段 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && (b === 0 || b === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

/** 判断 hostname 是否指向私网/回环/链路本地（防 SSRF） */
function isBlockedWebPushHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === 'ip6-localhost' || h === 'ip6-loopback') return true;
  if (BLOCKED_WEBPUSH_HOST_SUFFIXES.some((s) => h.endsWith(s))) return true;
  const ver = isIP(h);
  if (ver === 4) return isPrivateIPv4(h);
  if (ver === 6) {
    if (h === '::1' || h === '::') return true;
    if (h.startsWith('fc') || h.startsWith('fd')) return true;
    if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) {
      return true;
    }
    if (h.startsWith('::ffff:')) {
      return isPrivateIPv4(h.slice('::ffff:'.length));
    }
    return false;
  }
  return false;
}

/** 校验 WebPush 订阅 endpoint（须 https 公网推送服务，防 SSRF） */
function isSafeWebPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return !isBlockedWebPushHost(url.hostname);
}

@Injectable()
/**
 * WebPushService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class WebPushService
 */
export class WebPushService implements ChannelProvider, OnModuleInit, OnModuleDestroy {
  readonly name = 'webpush';
  private readonly logger = new Logger(WebPushService.name);
  private enabled = false;
  private subscriptions = new Map<string, PushSubscription>();
  private messageHandler?: (msg: ChannelMessage) => void | Promise<void>;

  /** 稳定引用：配置变更时热重载 VAPID */
  private readonly onSystemConfigUpdated = async () => {
    this.channelConfigService.invalidateCache();
    await this.reload();
  };

  constructor(
    private readonly channelConfigService: ChannelConfigService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    this.eventEmitter.on(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
    await this.reload();
    await this.loadSubscriptionsFromDb();
  }

  onModuleDestroy(): void {
    this.eventEmitter.off(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  async reload(): Promise<void> {
    const cfg = await this.channelConfigService.getWebPushConfig();
    this.enabled = cfg?.enabled ?? false;

    if (!this.enabled || !cfg?.vapidPublicKey || !cfg?.vapidPrivateKey) {
      this.logger.warn('WebPush 通道配置不完整或已禁用');
      return;
    }

    try {
      webPush.setVapidDetails(
        cfg.subject || 'mailto:webmaster@homeos.local',
        cfg.vapidPublicKey,
        cfg.vapidPrivateKey,
      );
      this.logger.log('WebPush 通道已热重载');
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.logger.error(`WebPush 通道初始化失败: ${msg}`);
    }
  }

  private async loadSubscriptionsFromDb(): Promise<void> {
    try {
      const rows = await this.prisma.webPushSubscription.findMany({ take: 500 });
      this.subscriptions.clear();
      for (const row of rows) {
        if (!isSafeWebPushEndpoint(row.endpoint)) {
          this.logger.warn(`跳过不安全 WebPush 订阅 endpoint: ${row.endpoint.substring(0, 60)}`);
          continue;
        }
        this.subscriptions.set(row.endpoint, {
          id: row.id,
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
          userAgent: row.userAgent ?? undefined,
          label: row.label ?? undefined,
          createdAt: row.createdAt,
        });
      }
      this.logger.log(`已从数据库加载 ${rows.length} 条 WebPush 订阅`);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.logger.warn(`加载 WebPush 订阅失败(表可能尚未迁移): ${msg}`);
    }
  }

  async getStatus(): Promise<{
    enabled: boolean;
    configured: boolean;
    subscriptionCount: number;
    vapidPublicKey?: string;
    error?: string;
  }> {
    if (!this.enabled) {
      return { enabled: false, configured: false, subscriptionCount: 0 };
    }
    try {
      const cfg = await this.channelConfigService.getWebPushConfig();
      return {
        enabled: true,
        configured: !!(cfg?.vapidPublicKey && cfg?.vapidPrivateKey),
        subscriptionCount: this.subscriptions.size,
        vapidPublicKey: cfg?.vapidPublicKey,
      };
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      return {
        enabled: true,
        configured: false,
        subscriptionCount: this.subscriptions.size,
        error: msg,
      };
    }
  }

  async getPublicKey(): Promise<string | null> {
    if (!this.enabled) return null;
    const cfg = await this.channelConfigService.getWebPushConfig();
    return cfg?.vapidPublicKey || null;
  }

  listSubscriptions(): Array<{
    id?: string;
    endpoint: string;
    label?: string;
    userAgent?: string;
    createdAt?: Date;
  }> {
    return [...this.subscriptions.values()].map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      label: s.label,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
    }));
  }

  async registerSubscription(subscription: PushSubscription): Promise<void> {
    if (!isSafeWebPushEndpoint(subscription.endpoint)) {
      badRequest(API_ERROR.CHANNEL_WEBPUSH_ENDPOINT_INVALID);
    }
    if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
      badRequest(API_ERROR.CHANNEL_WEBPUSH_ENDPOINT_INVALID);
    }
    this.subscriptions.set(subscription.endpoint, subscription);
    try {
      const row = await this.prisma.webPushSubscription.upsert({
        where: { endpoint: subscription.endpoint },
        create: {
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent: subscription.userAgent,
          label: subscription.label,
        },
        update: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent: subscription.userAgent,
          label: subscription.label,
        },
      });
      subscription.id = row.id;
      subscription.createdAt = row.createdAt;
      this.subscriptions.set(subscription.endpoint, subscription);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.logger.warn(`持久化 WebPush 订阅失败(仍保留内存): ${msg}`);
    }
    this.logger.log(`已注册 WebPush 订阅: ${subscription.endpoint.substring(0, 40)}...`);
  }

  async unregisterSubscription(endpoint: string): Promise<void> {
    this.subscriptions.delete(endpoint);
    try {
      await this.prisma.webPushSubscription.deleteMany({ where: { endpoint } });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.logger.warn(`删除 WebPush 订阅失败: ${msg}`);
    }
    this.logger.log(`已取消 WebPush 订阅: ${endpoint.substring(0, 40)}...`);
  }

  onMessage(handler: (msg: ChannelMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * 发送文本推送。
   *
   * @param to 目标 endpoint；空串/数字表示广播给全部订阅者
   * @param text 推送正文（调用方通常已前置时间戳）
   * @param title 可选通知标题；缺省沿用内置「HomeOS」，地震速报等场景传入专属标题
   */
  async sendText(to: string | number, text: string, title?: string): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('WebPush 通道未启用');
      return;
    }

    const targets: PushSubscription[] = [];
    if (typeof to === 'string' && to.trim()) {
      const sub = this.subscriptions.get(to.trim());
      if (sub) targets.push(sub);
      else {
        this.logger.warn(`未找到 endpoint: ${to}`);
        return;
      }
    } else {
      targets.push(...this.subscriptions.values());
    }

    if (targets.length === 0) {
      this.logger.warn('无 WebPush 订阅者');
      return;
    }

    const payload = JSON.stringify({
      // 标题由调用方定制（如「地震速报(官方已确认)」），缺省回退品牌名
      title: String(title ?? '').trim() || 'HomeOS',
      body: text,
      icon: '/logo/logo.svg',
    });

    await Promise.allSettled(
      targets.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payload,
          );
        } catch (error: unknown) {
          const msg = getErrorMessage(error);
          this.logger.error(`发送 WebPush 失败: ${msg}`);
          if (msg.includes('410') || msg.includes('404') || msg.includes('expired')) {
            await this.unregisterSubscription(sub.endpoint);
          }
        }
      }),
    );
  }

  /** 测试推送：向全部或指定 endpoint 发送 */
  async sendTest(endpoint?: string): Promise<{ sent: number }> {
    const before = this.subscriptions.size;
    await this.sendText(endpoint || '', '这是一条 HomeOS 测试推送');
    return { sent: endpoint ? (this.subscriptions.has(endpoint) ? 1 : 0) : before };
  }
}
