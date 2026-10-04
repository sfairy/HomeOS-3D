/**
 * 领域事件 → Socket.IO 客户端广播 Helper。
 *
 * 职责：
 * - 订阅 Nest 事件总线上的领域事件（通知/家庭模式/自动化执行/安防/在场/能耗/Frigate/TTS/儿童模式/EEW），
 *   转译为 WS 客户端事件并广播给在线客户端。
 * - 通知类事件支持按用户/房间去重推送，仅向有权限访问 entityId 的用户发送。
 * - 通知送达后异步更新 Notification.deliveryChannels，便于后续送达分析。
 *
 * 关键依赖：PrismaService（通知送达记录）、TtsSpeakService（TTS 播报选路）、subscription.util（用户房间键）。
 */
import type { PrismaService } from '../../shared/prisma/service';
import type { EarthquakeAlertPayload } from '../earthquake/types';
import type { TtsSpeakService } from '../ha-connector/tts-speak.service';
import type { JwtUserLike } from '@homeos/shared';
import { isEntityAllowed, WS_CLIENT_EVENTS } from '@homeos/shared';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { parseJsonArray } from '../../common/utils/json-field.util';
import { resolveUserRoomKey } from './subscription.util';

interface WsPushDomainEventsDeps {
  logger: Logger;
  getServer: () => Server;
  prisma: PrismaService;
  ttsSpeak: TtsSpeakService;
}

/** 领域事件 → Socket.IO 广播（通知、安防、居家模式等） */
export class WsPushDomainEventsHelper {
  constructor(private readonly deps: WsPushDomainEventsDeps) {}

  /**
   * 通知创建事件广播。
   * channels 不含 'socket' 时跳过；按 entityId 权限过滤接收者，
   * 多标签页同用户按 user room 去重 emit；送达后异步更新 deliveryChannels。
   */
  handleNotification(data: {
    id: string;
    level: string;
    message: string;
    entityId?: string;
    source: string;
    createdAt: string;
    channels?: string[];
  }): void {
    const channels = data.channels?.length ? data.channels : ['in_app', 'socket'];
    if (!channels.includes('socket')) return;

    const payload = { type: 'notification', ...data };
    const server = this.deps.getServer();
    let delivered = 0;
    if (!data.entityId) {
      server.emit(WS_CLIENT_EVENTS.NOTIFICATION, payload);
      delivered = server.sockets.sockets.size;
    } else {
      // 按 user: room 去重推送（多标签页同用户只算一次 room emit）
      const rooms = new Set<string>();
      for (const socket of server.sockets.sockets.values()) {
        const user = socket.data?.user as JwtUserLike | undefined;
        if (!user) continue;
        if (!isEntityAllowed(data.entityId, user)) continue;
        rooms.add(resolveUserRoomKey(user, socket.id));
      }
      for (const room of rooms) {
        server.to(room).emit(WS_CLIENT_EVENTS.NOTIFICATION, payload);
      }
      delivered = rooms.size;
    }
    if (delivered > 0 && data.id) {
      void this.markNotificationDelivered(data.id, ['socket']);
    }
  }

  /** 家庭模式激活广播：携带 modeId/modeName 与执行结果统计 */
  handleModeActivated(data: {
    modeId: string;
    modeName: string;
    results: unknown[];
    successCount: number;
    totalCount: number;
  }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.HOME_MODE, {
      type: 'home_mode_activated',
      modeId: data.modeId,
      modeName: data.modeName,
      successCount: data.successCount,
      totalCount: data.totalCount,
      timestamp: new Date().toISOString(),
    });
  }

  /** 家庭模式停用广播：仅携带 modeId */
  handleModeDeactivated(data: { modeId: string }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.HOME_MODE, {
      type: 'home_mode_deactivated',
      modeId: data.modeId,
      timestamp: new Date().toISOString(),
    });
  }

  /** 自动化执行结果广播：供前端展示成功/失败状态 */
  handleAutomationExecuted(data: {
    id: string;
    name: string;
    success?: boolean;
    timestamp: string;
  }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.AUTOMATION_EXECUTED, {
      type: 'automation_executed',
      automationId: data.id,
      name: data.name,
      success: data.success,
      timestamp: data.timestamp,
    });
  }

  /** 安防布防/撤防模式变更广播 */
  handleSecurityModeChanged(data: { mode: string; zones?: string[]; timestamp: string }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.SECURITY_MODE, {
      type: 'security_mode_changed',
      ...data,
    });
  }

  /** 安防区域配置变更广播：前端据此刷新区域列表 */
  handleSecurityZonesConfigured(data: { count: number; timestamp: string }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.SECURITY_ZONES, {
      type: 'security_zones_changed',
      ...data,
    });
  }

  /** 安防告警广播：携带告警实体、区域、模式与动作失败列表 */
  handleSecurityAlarm(data: {
    entityId: string;
    friendlyName: string;
    zones: string[];
    zoneNames: string;
    mode: string;
    type?: string;
    actionFailures?: string[];
    timestamp: string;
  }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.SECURITY_ALARM, {
      type: 'security_alarm',
      ...data,
    });
  }

  /** 紧急事件（如 SOS）广播：默认 action 为 SOS */
  handleSecurityEmergency(data: { action?: string; timestamp?: string }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.SECURITY_EMERGENCY, {
      type: 'security_emergency',
      action: data.action || 'SOS',
      timestamp: data.timestamp || new Date().toISOString(),
    });
  }

  /** 紧急事件解除广播：通知前端关闭告警 UI */
  handleSecurityEmergencyCompleted(data: Record<string, unknown>): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.SECURITY_EMERGENCY_COMPLETED, {
      type: 'security_emergency_completed',
      ...data,
    });
  }

  /** 在场状态变化广播：成员是否在家 */
  handlePresenceChanged(data: {
    memberId: string;
    name: string;
    atHome: boolean;
    timestamp: string;
  }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.PRESENCE_CHANGED, {
      type: 'presence_changed',
      ...data,
    });
  }

  /** 全员离家广播：触发离家模式相关自动化 */
  handleEveryoneLeft(data: { lastMember: string; timestamp: string }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.PRESENCE_ALL_LEFT, {
      type: 'presence_all_left',
      ...data,
    });
  }

  /** 能耗异常检测广播：携带异常设备与原因 */
  handleEnergyAnomaly(data: Record<string, unknown>): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.ENERGY_ANOMALY, {
      type: 'energy_anomaly',
      ...data,
    });
  }

  /** Frigate 检测事件广播：携带摄像头/事件 ID */
  handleFrigateDetection(data: Record<string, unknown>): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.FRIGATE_DETECTION, {
      type: 'frigate_detection',
      ...data,
    });
  }

  /** TTS 播报：调用 TtsSpeakService 选路播报，并广播播报结果 */
  async handleTtsSpeak(data: { message: string; ts?: number }): Promise<void> {
    const result = await this.deps.ttsSpeak.speak(data.message);
    this.deps.getServer().emit(WS_CLIENT_EVENTS.TTS_SPEAK, {
      type: 'tts_speak',
      message: data.message,
      success: result.success,
      detail: result.message,
      timestamp: new Date(data.ts || Date.now()).toISOString(),
    });
  }

  /** 房间级在场检测广播：携带房间名/是否有人/触发传感器 */
  handleRoomPresenceChange(data: { room: string; occupied: boolean; sensor: string }): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.ROOM_PRESENCE, {
      type: 'room_presence',
      ...data,
    });
  }

  /** 儿童模式开关变更广播：前端据此限制可用实体 */
  handleChildModeChanged(data: Record<string, unknown>): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.CHILD_MODE, {
      type: 'child_mode_changed',
      ...data,
    });
  }

  /** 儿童模式拦截事件广播：通知前端展示拦截提示 */
  handleChildModeBlocked(data: Record<string, unknown>): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.CHILD_MODE, {
      type: 'child_mode_blocked',
      ...data,
    });
  }

  /** 地震预警（EEW）广播：高优先级携带震感与震中信息 */
  handleEarthquakeAlert(data: EarthquakeAlertPayload): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.EARTHQUAKE_ALERT, {
      type: 'earthquake_alert',
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /** 台网核定速报 / 迟到确认：轻量公报弹层（非全屏倒计时） */
  handleEarthquakeConfirmation(data: EarthquakeAlertPayload): void {
    this.deps.getServer().emit(WS_CLIENT_EVENTS.EARTHQUAKE_CONFIRMATION, {
      type: 'earthquake_confirmation',
      alertKind: data.alertKind || 'confirmation',
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /** 异步标记通知送达状态：合并已有 channels 后写入数据库（失败静默） */
  private async markNotificationDelivered(id: string, channels: string[]) {
    try {
      const row = await this.deps.prisma.notification.findUnique({
        where: { id },
        select: { deliveryChannels: true },
      });
      const existing = parseJsonArray<string>(row?.deliveryChannels);
      const merged = [...new Set([...existing, ...channels])];
      await this.deps.prisma.notification.update({
        where: { id },
        data: {
          deliveredAt: new Date(),
          deliveryChannels: merged,
        },
      });
    } catch {
      /* 忽略 */
    }
  }
}
