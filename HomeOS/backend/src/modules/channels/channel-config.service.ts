/**
 * @file channel-config.service.ts
 * @module ChannelsModule
 *
 * 通道配置服务：负责读取并缓存 HomeOS UI 配置中的「消息通道」部分
 * （Email、WebPush 通道）。通过监听系统配置更新事件自动失效缓存。
 *
 * 依赖：
 * - UiConfigService：读取激活 profile 配置中的 layout 字段
 * - EventEmitter2：监听 SYSTEM_CONFIG_UPDATED 事件以失效缓存
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UiConfigService } from '../ui-config/service';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import type {
  ChannelConfig,
  EmailChannelConfig,
  WebPushChannelConfig,
  WecomChannelConfig,
} from './channel-provider.interface';

/**
 * 通道配置服务（可注入）。
 *
 * 维护一份带 TTL 的 layout 缓存，避免每次回复消息都重新读取并解析配置。
 * 当系统配置更新事件触发时主动失效缓存，保证下次读取获得最新配置。
 */
@Injectable()
export class ChannelConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChannelConfigService.name);
  /** 已缓存的 layout 结构（来自 UiConfig 的解析结果） */
  private layoutCache: Record<string, unknown> | null = null;
  /** 当前缓存到期时间戳（ms）；0 表示无缓存 */
  private cacheTtl = 0;
  /** 缓存有效期（30 秒），平衡配置实时性与读取开销 */
  private readonly CACHE_MS = 30_000;

  /** 稳定引用：供 on/off 对称注销 */
  private readonly onSystemConfigUpdated = () => {
    this.logger.log('检测到配置更新,正在使通道配置缓存失效');
    this.invalidateCache();
  };

  constructor(
    private readonly uiConfigService: UiConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 模块初始化时订阅系统配置更新事件。
   * 一旦配置发生变更，立即失效本地缓存。
   */
  onModuleInit(): void {
    this.eventEmitter.on(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  onModuleDestroy(): void {
    this.eventEmitter.off(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  /**
   * 获取通道 layout 配置（带缓存）。
   *
   * 命中且未过期时直接返回缓存；否则向 UiConfigService 重新读取并解析 layout 字段。
   * 读取或解析失败时返回 null，但不会抛出，避免阻塞上层消息处理。
   *
   * @returns layout 对象；无配置或读取失败时返回 null
   */
  async getLayout(): Promise<Record<string, unknown> | null> {
    const now = Date.now();
    if (this.layoutCache && now < this.cacheTtl) return this.layoutCache;
    try {
      const cfg = await this.uiConfigService.getConfig(
        this.uiConfigService.resolveActiveProjectId(),
      );
      if (!cfg || !cfg.layout) return null;
      const { layout } = this.uiConfigService.parseLayoutField(cfg.layout);
      this.layoutCache = layout;
      this.cacheTtl = now + this.CACHE_MS;
      return layout;
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      this.logger.warn(`读取通道配置失败: ${msg}`);
      return null;
    }
  }

  /**
   * 主动失效缓存。供配置更新事件或外部强制刷新时调用。
   */
  invalidateCache(): void {
    this.layoutCache = null;
    this.cacheTtl = 0;
  }

  /**
   * 获取 Email 通道配置。
   *
   * @returns Email 通道配置；未配置时返回 null
   */
  async getEmailConfig(): Promise<EmailChannelConfig | null> {
    const layout = await this.getLayout();
    const channelConfig = layout?.channelConfig as ChannelConfig | undefined;
    return channelConfig?.email ?? null;
  }

  /**
   * 获取 WebPush 通道配置。
   *
   * @returns WebPush 通道配置；未配置时返回 null
   */
  async getWebPushConfig(): Promise<WebPushChannelConfig | null> {
    const layout = await this.getLayout();
    const channelConfig = layout?.channelConfig as ChannelConfig | undefined;
    return channelConfig?.webpush ?? null;
  }

  /**
   * 获取企业微信通道配置。
   */
  async getWecomConfig(): Promise<WecomChannelConfig | null> {
    const layout = await this.getLayout();
    const channelConfig = layout?.channelConfig as ChannelConfig | undefined;
    return channelConfig?.wecom ?? null;
  }
}
