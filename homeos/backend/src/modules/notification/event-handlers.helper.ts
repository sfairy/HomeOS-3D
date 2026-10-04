/**
 * 职责：
 *  - 领域事件→通知翻译处理+冷却窗口；
 * 关键依赖：
 *  - shared/ha、@homeos/shared；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { AppConfigService } from '../../shared/app-config/service';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import { formatSecurityAlarmMessage } from '@homeos/shared';
import type { HaStateChangeEvent } from '../../shared/types';
import { formatEewNotifyMessage } from '../earthquake/state.util';
import { eewCatalogCooldownKey } from '../earthquake/types';
import type { EarthquakeAlertPayload } from '../earthquake/types';
import type { AlertLevel } from './service';

/** NotificationEventHandlersHelper 的依赖注入接口 */
interface NotificationEventHandlersDeps {
  appConfig: AppConfigService;
  stateRouter: HaStateChangeRouterService;
  notify: (
    level: AlertLevel,
    message: string,
    source?: string,
    entityId?: string,
    opts?: { channels?: string[]; bypassDnd?: boolean; title?: string },
  ) => Promise<unknown>;
  isInCooldown: (key: string) => boolean;
  setCooldown: (key: string, minutes: number) => void;
  checkDeviceOffline: (entityId: string, friendlyName: string) => Promise<void>;
  checkLowBattery: (entityId: string, friendlyName: string, level: number) => Promise<void>;
  evaluateRules: (
    entityId: string,
    state: string,
    attributes?: Record<string, unknown>,
  ) => Promise<void>;
  resolveRoomLabel: (roomId?: string) => string;
}

/**
 * 领域事件 → 通知的处理器集合。
 * 每个 handler 对应一个 @OnEvent 注册的事件，负责：
 * - 冷却去重（避免短时间内重复通知）
 * - 级别映射（将领域事件的级别映射为 AlertLevel）
 * - 文案格式化（将事件 payload 格式化为用户可读的通知文案）
 * - 渠道选择（如烟感/燃气/漏水使用 in_app + socket）
 */
export class NotificationEventHandlersHelper {
  constructor(private readonly deps: NotificationEventHandlersDeps) {}

  /**
   * 解析安防独立告警渠道（security.alertChannels）。
   * - 未配置（缺失/空数组）返回 null，发送点保持原有渠道行为
   * - 仅保留 in_app / email / webpush 合法渠道，未配置的渠道自动跳过
   * - 含 in_app 时自动补充 socket（基础设施渠道），保证 WS 实时推送不因渠道收紧而丢失
   */
  private resolveSecurityAlertChannels(): string[] | null {
    const raw = this.deps.appConfig.get('security').alertChannels;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const forced: string[] = [
      ...new Set(
        raw.filter(
          (c): c is 'in_app' | 'email' | 'webpush' =>
            c === 'in_app' || c === 'email' || c === 'webpush',
        ),
      ),
    ];
    if (forced.length === 0) return null;
    if (forced.includes('in_app')) forced.push('socket');
    return forced;
  }

  /**
   * 安防告警 → 持久化通知（站内 + Socket + TTS）。
   * 消费 anomaly-detection / security-panel / 安全传感器联动 发出的 security.alarm。
   * 配置 security.alertChannels 时强制走安防独立告警渠道（未配置渠道自动跳过），
   * 否则按类型回退：烟感/燃气/漏水使用 in_app + socket 渠道，其余保持默认。
   * 本链路显式 bypassDnd：安防告警（含 warn 级异常）绕过免打扰；
   * danger 级别冷却 1 分钟，其他 2 分钟。
   */
  async handleSecurityAlarm(data: {
    friendlyName?: string;
    zoneNames?: string;
    message?: string;
    type?: string;
    entityId?: string;
    level?: string;
    actionFailures?: string[];
  }) {
    const desc = formatSecurityAlarmMessage(data);
    const cooldownKey = `security_alarm:${data.entityId || data.type || 'global'}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const forced = this.resolveSecurityAlertChannels();
    const channels =
      forced ??
      (data.type === 'smoke' || data.type === 'gas_leak' || data.type === 'water_leak'
        ? ['in_app', 'socket']
        : undefined);
    const levelRaw = String(data.level || '').toLowerCase();
    const alertLevel =
      levelRaw === 'high' || levelRaw === 'danger'
        ? 'danger'
        : levelRaw === 'medium' || levelRaw === 'warn' || levelRaw === 'warning'
          ? 'warn'
          : levelRaw === 'low' || levelRaw === 'info'
            ? 'info'
            : 'danger';
    const sent = await this.deps.notify(
      alertLevel,
      desc,
      'security',
      data.entityId,
      { ...(channels ? { channels } : {}), bypassDnd: true },
    );
    // 通知被全局开关拦截时不写冷却，保证恢复后仍可重新告警
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, alertLevel === 'danger' ? 1 : 2);
  }

  /**
   * 紧急一键求救 → 立即推送 danger 通知（1 分钟冷却）。
   * 配置 security.alertChannels 时强制走安防独立告警渠道；未配置时保持原有默认渠道。
   */
  async handleEmergency(data: { action?: string }) {
    const cooldownKey = 'security_emergency_notify';
    if (this.deps.isInCooldown(cooldownKey)) return;
    const forced = this.resolveSecurityAlertChannels();
    const sent = await this.deps.notify(
      'danger',
      `🆘 紧急求助已触发：${data.action || 'SOS'}`,
      'emergency',
      undefined,
      { ...(forced ? { channels: forced } : {}), bypassDnd: true },
    );
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, 1);
  }

  /**
   * 能耗异常（待机过高/突增/持续高负荷）→ 通知。
   * 持续高负荷为 danger，其他为 warn。
   */
  async handleEnergyAnomaly(data: {
    type?: string;
    entityId?: string;
    friendlyName?: string;
    current?: number;
    average?: number;
    ratio?: number;
  }) {
    const cooldownKey = `energy_anomaly:${data.entityId || data.type || 'global'}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const name = data.friendlyName || data.entityId || '设备';
    let detail = `${name} 功耗异常`;
    if (data.type === 'high_standby') {
      detail = `${name} 待机功耗 ${data.current ?? '?'}W 持续偏高（均值 ${data.average?.toFixed?.(0) ?? data.average ?? '?'}W）`;
    } else if (data.type === 'spike') {
      detail = `${name} 功率突增至 ${data.current ?? '?'}W（约为均值 ${data.ratio ?? '?'} 倍）`;
    } else if (data.type === 'sustained_high') {
      detail = `${name} 持续高负荷 ${data.current ?? '?'}W 超过 2 小时`;
    }
    const level: AlertLevel = data.type === 'sustained_high' ? 'danger' : 'warn';
    const sent = await this.deps.notify(level, `⚡ ${detail}`, 'energy-anomaly', data.entityId);
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, this.deps.appConfig.get('energy').anomalyCooldownMin);
  }

  /** 能源预算超支告警 → warn 通知。 */
  async handleBudgetExceeded(data: { message?: string }) {
    const cooldownKey = 'energy_budget';
    if (this.deps.isInCooldown(cooldownKey)) return;
    const sent = await this.deps.notify(
      'warn',
      `能源预算告警：${data.message || '本月用能预计超支'}`,
      'energy-budget',
    );
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, this.deps.appConfig.get('energy').budgetAlertCooldownMin);
  }

  /** 用水异常告警（持续水流/超量）→ danger 通知。 */
  async handleWaterAnomaly(data: {
    type?: string;
    friendlyName?: string;
    entityId?: string;
    flowRate?: number;
    totalUsage?: number;
  }) {
    const cooldownKey = `water:${data.entityId || data.type || 'global'}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const name = data.friendlyName || data.entityId || '水表';
    const detail =
      data.type === 'continuous_flow'
        ? `${name} 持续水流 ${data.flowRate ?? '?'} L/min，疑似漏水`
        : `${name} 今日用水 ${data.totalUsage?.toFixed?.(2) ?? data.totalUsage} m³，超出阈值`;
    const sent = await this.deps.notify('danger', detail, 'water-monitor', data.entityId);
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, this.deps.appConfig.get('water').anomalyCooldownMin);
  }
  /** 环境霉菌风险告警。level >= 3 为 danger，否则为 warn。 */
  async handleMoldRisk(data: { roomId?: string; level?: number; message?: string }) {
    const cooldownKey = `mold:${data.roomId || 'global'}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const level = data.level ?? 2;
    const alertLevel: AlertLevel = level >= 3 ? 'danger' : 'warn';
    const roomLabel = this.deps.resolveRoomLabel(data.roomId);
    const sent = await this.deps.notify(
      alertLevel,
      `🦠 [${roomLabel}] ${data.message || '霉菌风险偏高'}`,
      'environment-health',
      data.roomId,
    );
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, this.deps.appConfig.get('iaq').moldAlertCooldownMin);
  }

  /** 环境 IAQ 超阈值告警 → warn 通知。 */
  async handleIaqThreshold(data: { roomId?: string; iaq?: number; message?: string }) {
    const cooldownKey = `iaq:${data.roomId || 'global'}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const roomLabel = this.deps.resolveRoomLabel(data.roomId);
    const score = data.iaq != null ? ` IAQ ${data.iaq}` : '';
    const sent = await this.deps.notify(
      'warn',
      `🌬️ [${roomLabel}]${score} ${data.message || '空气质量指数超阈值，建议通风或开启净化设备'}`,
      'environment-health',
      data.roomId,
    );
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, this.deps.appConfig.get('iaq').moldAlertCooldownMin);
  }

  /** 智能顾问建议 → 持久化为站内通知。 */
  async handleHomeosAutomationNotify(data: { message?: string; title?: string }) {
    const text = data.message || data.title || '自动化通知';
    await this.deps.notify('info', text, 'automation');
  }

  /**
   * 自动化执行失败 → warn 站内通知。
   * 消费 automation 模块 runRuleBody 失败分支 emit 的 automation.failed。
   * 按规则去重冷却（30 分钟），避免高频失败刷屏；warn 语义：需用户感知但非紧急。
   */
  async handleAutomationFailed(data: {
    ruleId?: string;
    name?: string;
    error?: string;
    trace?: unknown[];
  }) {
    const ruleId = data.ruleId || 'unknown';
    const cooldownKey = `automation-failed:${ruleId}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const name = data.name || ruleId;
    const summary = data.error || '动作执行失败';
    const sent = await this.deps.notify('warn', `⚠️ 自动化执行失败：[${name}] ${summary}`, 'automation');
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, 30);
  }

  /**
   * 自动化触发被丢弃（parallel 并发超限）→ warn 站内通知。
   * 消费 automation 模块并发超限分支 emit 的 automation.dropped。
   * 按规则去重冷却（30 分钟），warn 语义同上。
   */
  async handleAutomationDropped(data: {
    ruleId?: string;
    name?: string;
    reason?: string;
    limit?: number;
    group?: string;
  }) {
    const ruleId = data.ruleId || 'unknown';
    const cooldownKey = `automation-dropped:${ruleId}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const name = data.name || ruleId;
    let detail: string;
    if (data.reason === 'concurrency-limit') {
      detail = `并发执行数已达上限(${data.limit ?? '未知'})，本次触发被丢弃`;
    } else if (data.reason === 'mutex-busy') {
      detail = `互斥组 [${data.group ?? '未知'}] 正被其他自动化占用，本次触发被丢弃`;
    } else {
      detail = '本次触发被丢弃';
    }
    const sent = await this.deps.notify('warn', `⚠️ 自动化触发被丢弃：[${name}] ${detail}`, 'automation');
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, 30);
  }

  /** 地震 EEW 实时预警 → 站内 + WebPush（10 分钟冷却）。 */
  async handleEarthquakeEewAlert(data: EarthquakeAlertPayload) {
    const cooldownKey = `earthquake_eew:${data.eventId}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const sent = await this.deps.notify('danger', formatEewNotifyMessage(data), 'earthquake-eew', data.eventId, {
      channels: ['in_app', 'socket', 'webpush'],
      title: '地震预警',
    });
    // 通知被全局开关拦截时不写冷却，避免同事件震级上修后的更强预警被静默吞掉
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, 10);
  }

  /**
   * 台网核定 / 迟到正式测定 → warn 通知（与实时预警分流）。
   *
   * 标题固定为「地震速报(官方已确认)」，与手机端推送语义对齐，避免与实时预警混淆。
   */
  async handleEarthquakeEewConfirmation(data: EarthquakeAlertPayload) {
    // 与目录轮询共用同一冷却键：目录轮询已直投时，此处不再重复投递（避免同事件双发）
    const cooldownKey = eewCatalogCooldownKey(data.eventId);
    if (this.deps.isInCooldown(cooldownKey)) return;
    const sent = await this.deps.notify('warn', formatEewNotifyMessage(data), 'earthquake-catalog', data.eventId, {
      channels: ['in_app', 'socket', 'webpush'],
      title: '地震速报(官方已确认)',
    });
    // 通知被全局开关/重要通知开关拦截时不写冷却，保证后续更强更新仍可投递
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, 10);
  }

  /** 智能顾问建议 → info 通知。冷却时长由 other.tipCooldownHours 配置。 */
  async handleAdvisorTip(data: { title: string; message: string; category?: string }) {
    const cooldownKey = `tip:${data.title}:${data.category || ''}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const sent = await this.deps.notify(
      'info',
      `${data.title}: ${data.message}`,
      `advisor-${data.category || 'tip'}`,
    );
    if (!sent) return;
    const tipHours = this.deps.appConfig.get('other').tipCooldownHours;
    this.deps.setCooldown(cooldownKey, Math.max(1, Math.round(tipHours * 60)));
  }

  /** 墙面板低电量 → warn 站内通知 */
  async handleClientPowerLow(data: { clientId?: string; level?: number }) {
    const id = String(data?.clientId || 'unknown');
    const cooldownKey = `client_power_low:${id}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const level = data?.level != null ? `${Math.round(Number(data.level))}%` : '未知';
    const sent = await this.deps.notify('warn', `墙面板 ${id} 电量低（${level}）`, 'client-power', id, {
      channels: ['in_app', 'socket'],
    });
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, 30);
  }

  /** 墙面板充满 → info 站内通知 */
  async handleClientPowerCharged(data: { clientId?: string; level?: number }) {
    const id = String(data?.clientId || 'unknown');
    const cooldownKey = `client_power_charged:${id}`;
    if (this.deps.isInCooldown(cooldownKey)) return;
    const level = data?.level != null ? `${Math.round(Number(data.level))}%` : '未知';
    const sent = await this.deps.notify('info', `墙面板 ${id} 电量已充满（${level}）`, 'client-power', id, {
      channels: ['in_app', 'socket'],
    });
    if (!sent) return;
    this.deps.setCooldown(cooldownKey, 30);
  }

  /**
   * HA 状态变更（notification_health 订阅）→ 设备健康检查。
   * - state 为 unavailable 时检查设备离线
   * - battery_level < 20 时检查低电量
   * 使用 setImmediate 避免阻塞状态变更路由。
   */
  handleStateChanged(event: {
    entity_id: string;
    new_state: {
      state: string;
      attributes?: { friendly_name?: string; battery_level?: number };
    } | null;
    old_state?: unknown;
  }) {
    if (!this.deps.stateRouter.shouldProcess('notification_health', event as HaStateChangeEvent))
      return;
    if (!event.new_state) return;
    const state = event.new_state.state;
    const name = event.new_state.attributes?.friendly_name || event.entity_id;
    const batteryLevel = event.new_state.attributes?.battery_level;
    const entityId = event.entity_id;
    if (state === 'unavailable') {
      setImmediate(() => {
        void this.deps.checkDeviceOffline(entityId, name);
      });
    }
    if (batteryLevel !== undefined && batteryLevel !== null && batteryLevel < 20) {
      setImmediate(() => {
        void this.deps.checkLowBattery(entityId, name, batteryLevel);
      });
    }
  }

  /**
   * HA 状态变更（alert_rules 订阅）→ 告警规则条件求值。
   * 任意匹配实体的状态变更均参与求值（边沿触发 + 冷却）。
   * 使用 setImmediate 避免阻塞状态变更路由。
   */
  handleAlertRuleStateChanged(event: {
    entity_id: string;
    new_state: { state: string; attributes?: Record<string, unknown> } | null;
    old_state?: unknown;
  }) {
    if (!this.deps.stateRouter.shouldProcess('alert_rules', event as HaStateChangeEvent)) return;
    if (!event.new_state) return;
    const entityId = event.entity_id;
    const state = event.new_state.state;
    setImmediate(() => {
      void this.deps.evaluateRules(entityId, state, event.new_state?.attributes);
    });
  }
}
