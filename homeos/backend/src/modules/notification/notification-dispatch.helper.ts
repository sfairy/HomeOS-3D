/**
 * 职责：
 *  - 通知分发+入库+EventBus+通道投递；
 * 关键依赖：
 *  - shared/prisma、shared/redis、channels；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { getErrorMessage } from '../../common/utils';
import { resolveLanChannels } from '../../common/alert-support/notification-channels.util';
import { isDndActiveNow, isLifeSafetyNotification } from '@homeos/shared';
import { PrismaService } from '../../shared/prisma/service';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { RedisService } from '../../shared/redis/service';
import type { AlertLevel, Notification } from './service';
import { Logger } from '@nestjs/common';
import type { ChannelsService } from '../channels/service';

/** NotificationDispatchHelper 的依赖注入接口 */
interface NotificationDispatchDeps {
  logger: Logger;
  prisma: PrismaService;
  redisService: RedisService;
  eventBus: EventBusService;
  getCfg: () => {
    dndStart?: number;
    dndEnd?: number;
    globalNotifyEnabled?: boolean;
    importantNotifyEnabled?: boolean;
  };
  schedulePrune: () => void;
  /** 消息通道服务，用于发送 Email/WebPush 通知 */
  channelsService?: ChannelsService;
}

/**
 * 通知分发 Helper。
 * 负责通知入库、EventBus 发布与跨实例分发。
 * 入库失败时降级为内存对象（不丢失通知），仍通过 EventBus 推送。
 */
export class NotificationDispatchHelper {
  constructor(private readonly deps: NotificationDispatchDeps) {}

  /**
   * 创建并分发通知。
   * 1. 全局开关关闭时直接返回 null
   * 2. 「重要通知」关闭时抑制非 info 的普通告警；生命安全类永不因此静音
   * 3. 免打扰（DND）时段内抑制非 danger；opts.bypassDnd 或生命安全 source 一并放行
   * 4. 含 in_app 渠道时持久化到数据库
   * 5. 通过 EventBus 发布 notification.created 事件（跨实例分发）
   * 6. 含 in_app 渠道时调度条数软上限清理
   * 7. 含 email/webpush/wecom 渠道时通过 ChannelsService 发送外部通知
   *
   * @param opts.channels 额外投递渠道（email/webpush/wecom/tts）
   * @param opts.bypassDnd 为 true 时绕过免打扰时段限制
   * @param opts.title 外部推送标题（如「地震速报(官方已确认)」）；缺省由通道内置标题兜底
   */
  async notify(
    level: AlertLevel,
    message: string,
    source: string = 'system',
    entityId?: string,
    opts?: { channels?: string[]; bypassDnd?: boolean; title?: string },
  ): Promise<Notification | null> {
    const cfg = this.deps.getCfg();
    if (cfg.globalNotifyEnabled === false) return null;
    const lifeSafety = isLifeSafetyNotification(level, source);
    if (cfg.importantNotifyEnabled === false && level !== 'info' && !lifeSafety) return null;
    // DND：danger / 显式 bypass / 生命安全 source 放行；其余抑制
    if (
      level !== 'danger' &&
      !opts?.bypassDnd &&
      !lifeSafety &&
      isDndActiveNow(cfg)
    ) {
      return null;
    }

    const channels = resolveLanChannels(opts?.channels);
    let notification: Notification;

    if (channels.includes('in_app')) {
      try {
        const record = await this.deps.prisma.notification.create({
          data: {
            level,
            message,
            entityId,
            source,
            deliveryChannels: channels.filter((c) => c !== 'tts'),
          },
        });
        notification = {
          id: record.id,
          level: record.level as AlertLevel,
          message: record.message,
          entityId: record.entityId || undefined,
          source: record.source,
          read: record.read,
          createdAt: record.createdAt.toISOString(),
          deliveredAt: record.deliveredAt?.toISOString(),
          deliveryChannels: channels.filter((c) => c !== 'tts'),
          channels,
        };
      } catch (err) {
        this.deps.logger.error(`通知入库失败: ${err}`);
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        notification = {
          id,
          level,
          message,
          entityId,
          source,
          read: false,
          createdAt: new Date().toISOString(),
          channels,
        };
      }
    } else {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      notification = {
        id,
        level,
        message,
        entityId,
        source,
        read: false,
        createdAt: new Date().toISOString(),
        channels,
      };
    }

    this.deps.eventBus.emit('notification.created', notification);

    if (channels.includes('in_app')) {
      this.deps.schedulePrune();
    }

    this.sendExternalNotifications(channels, message, opts?.title);

    return notification;
  }

  private sendExternalNotifications(channels: string[], message: string, title?: string): void {
    if (!this.deps.channelsService) return;
    void this.deps.channelsService.sendExternalAlert(channels, message, title).catch((error: unknown) => {
      const msg = getErrorMessage(error);
      this.deps.logger.error(`发送外部通知失败: ${msg}`);
    });
  }
}
