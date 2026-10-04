/**
 * @file security-panel.internals.ts
 * @module backend/src/modules
 *
 * 安防面板内部辅助集合：合并自 zone / hazard-sensor / emergency /
 * panel-state / linkage / alarm / emergency-runner 等多个原 helper/util，
 * 供 SecurityPanelService 组合使用。包含：
 * - classifyHazardSensor：危险探测器类型识别（smoke/gas/leak）。
 * - isSecurityAlarmTrigger：布防区域内传感器是否构成入侵告警。
 * - normalizeSecurityEmergency：紧急求助配置规范化。
 * - SecurityPanelStateHelper：状态持久化与事件日志。
 * - SecurityLinkageHelper：HA 服务联动动作执行（含并发批处理）。
 * - SecurityAlarmHelper：入侵告警与危险传感器自动关阀/排风。
 * - SecurityEmergencyRunnerHelper：紧急求助设备联动（内置 + 自定义）。
 */
/** panel：合并自 zone / hazard-sensor / emergency / panel-state / linkage / alarm / emergency-runner 等 */
import type { AppConfigService } from '../../../shared/app-config/service';
import type { PrismaService } from '../../../shared/prisma/service';
import { scheduleRuntimeKvUpsert } from '../../../shared/prisma/runtime-kv.util';
import { loadActiveProjectLayout } from '../../../common/platform/project-paths.util';
import type { EventBusService } from '../../../shared/redis/event-bus.service';
import {
  runHazardAutoActions,
  parseHazardLayoutBindings,
  resolveBoundHazardKind,
  scheduleSecurityEvent,
  scheduleSecurityEventSilent,
} from '../../../common/http-security/hazard.util';
import type { HaStateChangeEvent } from '../../../shared/types';
import { getErrorMessage } from '../../../common/utils';
import { readJsonObject } from '../../../common/utils/json-field.util';
import type { HaConnectorService } from '../../ha-connector/service';
import type { ArmingMode, SecurityModeAction, SecurityPanelOptions, SecurityZone } from './security-panel.service';
import type { HazardActionResult, SecurityZoneType } from '@homeos/shared';
import {
  getEntityDomain,
  normalizeZoneType,
  shouldZoneAlarmInMode,
  summarizeHazardActionFailures,
} from '@homeos/shared';
import { Logger } from '@nestjs/common';

// ── security-zone.util ──
export type { SecurityZoneType };
export { normalizeZoneType };

// ── security-hazard-sensor.util ──
type HazardSensorKind = 'smoke' | 'gas' | 'leak';

/**
 * 危险探测器识别。返回 'smoke' | 'gas' | 'leak' | null
 *
 * 规则：
 *  1. 仅 binary_sensor 且状态为 on（探测器均为二元告警）。
 *  2. 排除家电本体（热水器/灶具/壁挂炉/油烟机等）的运行传感器。
 *  3. 优先依据 device_class（gas/smoke/carbon_monoxide/moisture）。
 *  4. 关键词兜底，但要求“泄漏/报警/探测/检测/detector/alarm”等探测语义，
 *     漏水不再匹配泛化的 'water'，避免温度/水流等运行量被误判。
 */
function classifyHazardSensor(
  entityId: string,
  attributes: Record<string, unknown> | undefined,
  state: string,
): HazardSensorKind | null {
  if (!entityId.startsWith('binary_sensor.')) return null;
  if (state !== 'on') return null;

  const id = entityId.toLowerCase();
  const name = String(attributes?.friendly_name || '').toLowerCase();
  const dc = String(attributes?.device_class || '').toLowerCase();
  const blob = `${id} ${name}`;

  // 排除家电本体：其运行传感器（火焰/水流/风机/温度等）常含“燃气/水”字样但非探测器
  const appliance =
    /热水器|water_heater|壁挂炉|boiler|燃气灶|灶具|stove|cooktop|range_hood|油烟机|烤箱|oven|锅炉|furnace|洗碗|dishwasher|洗衣|washer|dryer|烘干/;
  if (appliance.test(blob)) return null;

  // 探测语义关键词（关键词兜底时要求具备）
  const detectorIntent = /detector|detect|alarm|sensor|leak|泄漏|报警|探测|检测|感应|感测/;

  if (dc === 'smoke' || /smoke|烟雾|烟感/.test(blob)) return 'smoke';
  if (dc === 'gas' || dc === 'carbon_monoxide') return 'gas';
  if (
    /\bco\b|methane|甲烷|天然气|煤气|可燃气|一氧化碳/.test(blob) ||
    (/gas|燃气/.test(blob) && detectorIntent.test(blob))
  ) {
    return 'gas';
  }
  if (
    dc === 'moisture' ||
    (/leak|moisture|flood|漏水|水浸|浸水/.test(blob) &&
      (dc === 'moisture' || detectorIntent.test(blob) || /漏水|水浸|浸水/.test(blob)))
  ) {
    return 'leak';
  }
  return null;
}

/** 布防区域内传感器是否构成安防告警触发 */
function isSecurityAlarmTrigger(
  entityId: string,
  newState: string,
  /** lock 解锁事件是否处于布防撤防宽限期内（宽限内不视为入侵） */
  lockUnlockInGrace = false,
): boolean {
  return (
    (entityId.startsWith('binary_sensor.') && newState === 'on') ||
    (entityId.startsWith('sensor.') && (newState === 'on' || newState === 'open')) ||
    (entityId.startsWith('lock.') && newState === 'unlocked' && !lockUnlockInGrace) ||
    (entityId.startsWith('alarm_control_panel.') && newState === 'triggered')
  );
}

// ── security-emergency.util ──
type SecurityEmergencyMode = 'full_home' | 'key_areas' | 'notify_only' | 'custom';

interface SecurityEmergencyConfig {
  mode: SecurityEmergencyMode;
  appendBuiltin: boolean;
  appendMode: 'full_home' | 'key_areas';
  lightBrightnessPct: number;
  lightPool: string[];
  autoArmAway: boolean;
  actions: SecurityModeAction[];
  useBuiltinFallback?: boolean;
}

const DEFAULT: SecurityEmergencyConfig = {
  mode: 'full_home',
  appendBuiltin: false,
  appendMode: 'full_home',
  lightBrightnessPct: 100,
  lightPool: [],
  autoArmAway: false,
  actions: [],
  useBuiltinFallback: true,
};

function normalizeSecurityEmergency(
  raw: Partial<SecurityEmergencyConfig> | undefined,
): SecurityEmergencyConfig {
  const cfg: SecurityEmergencyConfig = {
    ...DEFAULT,
    ...(raw || {}),
    lightPool: Array.isArray(raw?.lightPool) ? raw.lightPool.filter(Boolean) : [],
    actions: Array.isArray(raw?.actions) ? raw.actions : [],
    lightBrightnessPct: Math.min(100, Math.max(1, Number(raw?.lightBrightnessPct) || 100)),
  };
  return cfg;
}

function resolveEmergencyLightPool(
  cfg: SecurityEmergencyConfig,
  awaySimulationLightPool: string[],
): string[] {
  if (cfg.lightPool.length > 0) return cfg.lightPool;
  if (awaySimulationLightPool.length > 0) return awaySimulationLightPool;
  return [];
}

/** 静默模式不执行任何 HA 设备联动（含自定义动作） */
function shouldRunCustomEmergencyActions(cfg: SecurityEmergencyConfig): boolean {
  return cfg.mode !== 'notify_only' && cfg.actions.length > 0;
}

function shouldRunBuiltinEmergency(cfg: SecurityEmergencyConfig): boolean {
  if (cfg.mode === 'notify_only') return false;
  if (cfg.mode === 'full_home' || cfg.mode === 'key_areas') return true;
  if (cfg.mode === 'custom') return cfg.appendBuiltin;
  return false;
}

function resolveBuiltinProfile(cfg: SecurityEmergencyConfig): 'full_home' | 'key_areas' {
  if (cfg.mode === 'key_areas') return 'key_areas';
  if (cfg.mode === 'full_home') return 'full_home';
  if (cfg.mode === 'custom' && cfg.appendBuiltin) {
    return cfg.appendMode === 'key_areas' ? 'key_areas' : 'full_home';
  }
  return 'full_home';
}

// ── security-panel-state.helper ──
interface SecurityPanelStateAccessor {
  getMode: () => ArmingMode;
  setMode: (mode: ArmingMode) => void;
  getZones: () => SecurityZone[];
  setZones: (zones: SecurityZone[]) => void;
  /** 最近一次布防的进程内时间戳（毫秒）；未布防时为 null */
  getArmedAt: () => number | null;
  setArmedAt: (t: number | null) => void;
}

interface SecurityPanelStateDeps {
  logger: Logger;
  prisma: PrismaService;
}

/** 安防面板持久化状态与事件日志 */
export class SecurityPanelStateHelper {
  constructor(
    private readonly deps: SecurityPanelStateDeps,
    private readonly state: SecurityPanelStateAccessor,
  ) {}

  async loadPersistedState(): Promise<void> {
    try {
      const row = await this.deps.prisma.runtimeKv.findUnique({
        where: { id: 'security-panel' },
      });
      const data = row?.data as
        | { mode?: ArmingMode; zones?: SecurityZone[]; armedAt?: number | null }
        | null;
      if (data?.mode) this.state.setMode(data.mode);
      if (Array.isArray(data?.zones)) {
        this.state.setZones(
          data.zones.map((z) => ({
            id: z.id,
            name: z.name,
            sensors: z.sensors || [],
            armed: z.armed ?? false,
            zoneType: normalizeZoneType(z.zoneType),
            roomId: z.roomId?.trim() || undefined,
          })),
        );
      }
      if (typeof data?.armedAt === 'number') this.state.setArmedAt(data.armedAt);
      this.deps.logger.log(
        `安防面板状态已恢复: 模式=${this.state.getMode()}, 区域=${this.state.getZones().length}`,
      );
    } catch {
      /* 首次启动无记录 */
    }
  }

  persistPanelState(): void {
    scheduleRuntimeKvUpsert(this.deps.prisma, 'security-panel', {
      mode: this.state.getMode(),
      zones: this.state.getZones(),
      armedAt: this.state.getArmedAt(),
    });
  }

  scheduleSecurityEvent(
    type: string,
    detail: string,
    opts?: { mode?: string; entityId?: string; zones?: string[] },
  ) {
    scheduleSecurityEventSilent(this.deps.prisma, type, detail, {
      ...opts,
      defaultMode: this.state.getMode(),
    });
  }
}

// ── security-linkage.helper ──
interface SecurityLinkageHelperDeps {
  logger: Logger;
  prisma: PrismaService;
  appConfig: AppConfigService;
  haConnector: HaConnectorService;
}

/** 单个联动动作的失败明细（供前端展示警示） */
interface SecurityLinkageFailure {
  entity_id: string;
  message: string;
}

/** 安防模式 / 紧急求助 HA 服务联动执行 */
export class SecurityLinkageHelper {
  constructor(private readonly deps: SecurityLinkageHelperDeps) {}

  /** 从当前激活 profile layout.securityModes 读取联动动作（读失败抛出，由调用方 fail-closed） */
  async loadSecurityModeActions(mode: string): Promise<SecurityModeAction[]> {
    const { layout } = await loadActiveProjectLayout(this.deps.prisma, this.deps.appConfig);
    const securityModes = layout.securityModes as
      Array<{ key: string; actions?: SecurityModeAction[] }> | undefined;
    const sm = securityModes?.find((m) => m.key === mode);
    return Array.isArray(sm?.actions) ? sm.actions : [];
  }

  /** 按序执行 HA 服务动作 */
  async executeHaActions(
    actions: SecurityModeAction[],
    label: string,
    failureEventType: string,
    opts?: { mode?: string },
  ): Promise<{ executed: number; failed: number; failedItems: SecurityLinkageFailure[] }> {
    if (!actions.length) return { executed: 0, failed: 0, failedItems: [] };

    const haStatus = await this.deps.haConnector.getStatus();
    if (!haStatus.connected) {
      this.deps.logger.warn(`${label} 联动动作跳过:HA 未连接`);
      return {
        executed: 0,
        failed: actions.length,
        failedItems: actions.map((a) => ({
          entity_id: a.entity_id,
          message: 'HA 未连接，联动动作未执行',
        })),
      };
    }

    let executed = 0;
    let failed = 0;
    const failedItems: SecurityLinkageFailure[] = [];
    for (const act of actions) {
      if (!act.entity_id?.trim() || !act.service?.trim()) continue;
      const domain = act.domain || getEntityDomain(act.entity_id);
      try {
        await this.deps.haConnector.callService(
          domain,
          act.service,
          act.entity_id,
          act.service_data || {},
        );
        executed++;
      } catch (err) {
        failed++;
        const msg = getErrorMessage(err);
        failedItems.push({ entity_id: act.entity_id, message: msg });
        this.deps.logger.warn(`${label} 联动失败 [${act.entity_id}]: ${msg}`);
        scheduleSecurityEvent(
          this.deps.prisma,
          this.deps.logger,
          failureEventType,
          `${label} 联动失败 [${act.entity_id}]: ${msg}`,
          { mode: opts?.mode, entityId: act.entity_id },
        );
      }
    }
    if (executed > 0 || failed > 0) {
      this.deps.logger.log(`${label} 联动: ${executed} 成功, ${failed} 失败`);
    }
    return { executed, failed, failedItems };
  }

  /** 按序执行布局安防场景中的 HA 服务动作（读联动配置失败时返回 failed，拒绝布防） */
  async executeSecurityModeActions(
    mode: string,
  ): Promise<{ executed: number; failed: number; failedItems: SecurityLinkageFailure[] }> {
    let actions: SecurityModeAction[];
    try {
      actions = await this.loadSecurityModeActions(mode);
    } catch (err) {
      const msg = getErrorMessage(err);
      this.deps.logger.error(`加载安防联动动作失败，拒绝布防: ${msg}`);
      return {
        executed: 0,
        failed: 1,
        failedItems: [{ entity_id: '', message: `联动配置读取失败: ${msg}` }],
      };
    }
    return this.executeHaActions(actions, `安防模式 ${mode}`, 'linkage_action_failed', { mode });
  }

  /** 并发批量调用 HA 服务（全屋设备较多时加速） */
  async callServiceBatch(
    items: Array<{
      domain: string;
      service: string;
      entity_id: string;
      data?: Record<string, unknown>;
    }>,
    label: string,
    failureEventType: string,
    concurrency = 10,
  ): Promise<{ ok: number; failed: number }> {
    if (!items.length) return { ok: 0, failed: 0 };

    const haStatus = await this.deps.haConnector.getStatus();
    if (!haStatus.connected) {
      this.deps.logger.warn(`${label} 跳过:HA 未连接`);
      return { ok: 0, failed: items.length };
    }

    let ok = 0;
    let failed = 0;
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map((item) =>
          this.deps.haConnector.callService(
            item.domain,
            item.service,
            item.entity_id,
            item.data || {},
          ),
        ),
      );
      for (let j = 0; j < results.length; j++) {
        const item = chunk[j];
        if (results[j].status === 'fulfilled') {
          ok++;
        } else {
          failed++;
          const msg = getErrorMessage((results[j] as PromiseRejectedResult).reason);
          scheduleSecurityEvent(
            this.deps.prisma,
            this.deps.logger,
            failureEventType,
            `${label} 联动失败 [${item.entity_id}]: ${msg}`,
            { entityId: item.entity_id },
          );
        }
      }
    }
    return { ok, failed };
  }
}

// ── security-alarm.helper ──
interface SecurityAlarmHelperDeps {
  logger: Logger;
  eventBus: EventBusService;
  haConnector: HaConnectorService;
  appConfig: AppConfigService;
  prisma: PrismaService;
  stateHelper: SecurityPanelStateHelper;
  getCurrentMode: () => ArmingMode;
  getZones: () => SecurityZone[];
  /** 最近一次布防的进程内时间戳（毫秒）；未布防时为 null */
  getArmedAt: () => number | null;
  /** 持久化冷却：namespace security / key zone-alarm:${zoneId} */
  isZoneAlarmInCooldown: (zoneId: string) => boolean;
  setZoneAlarmCooldown: (zoneId: string, minutes: number) => void;
}

/** 安防面板：区域告警与安全传感器联动 */
export class SecurityAlarmHelper {
  private readonly safetyLastAlarm = new Map<string, number>();

  constructor(private readonly deps: SecurityAlarmHelperDeps) {}

  /** 惰性清理已过冷却窗口的安全传感器告警冷却条目，避免 Map 只增不减 */
  private pruneSafetyLastAlarm(now: number, cooldownMs: number) {
    if (cooldownMs <= 0) return;
    for (const [id, lastAt] of this.safetyLastAlarm) {
      if (now - lastAt >= cooldownMs) this.safetyLastAlarm.delete(id);
    }
  }

  /**
   * lock 解锁事件是否处于布防撤防宽限期（armExitGraceSeconds）内。
   * 布防后用户进门未撤防（开门→门锁解锁）在宽限期内不视为入侵，避免高频误报。
   */
  private isLockUnlockInArmExitGrace(entityId: string, newState: string): boolean {
    if (!entityId.startsWith('lock.') || newState !== 'unlocked') return false;
    const graceSec = this.deps.appConfig.get('security').armExitGraceSeconds;
    if (graceSec <= 0) return false;
    const armedAt = this.deps.getArmedAt();
    if (armedAt == null) return false;
    return Date.now() - armedAt < graceSec * 1000;
  }

  handleSensorTrigger(event: HaStateChangeEvent) {
    if (this.deps.getCurrentMode() === 'disarmed') return;

    const entityId = event.entity_id;
    const newState = event.new_state?.state;
    const oldState = event.old_state?.state;
    if (!newState || newState === oldState) return;

    const zones = this.deps.getZones();
    const triggeredZones = zones.filter(
      (z) =>
        z.armed &&
        z.sensors.includes(entityId) &&
        shouldZoneAlarmInMode(this.deps.getCurrentMode(), z.zoneType),
    );
    if (triggeredZones.length === 0) return;
    if (!isSecurityAlarmTrigger(entityId, newState, this.isLockUnlockInArmExitGrace(entityId, newState)))
      return;

    const cooldownSec = this.deps.appConfig.get('security').sensorAlertCooldownSec;
    const zonesToAlert =
      cooldownSec <= 0
        ? triggeredZones
        : triggeredZones.filter((z) => !this.deps.isZoneAlarmInCooldown(z.id));
    if (zonesToAlert.length === 0) return;
    if (cooldownSec > 0) {
      for (const z of zonesToAlert) {
        this.deps.setZoneAlarmCooldown(z.id, cooldownSec / 60);
      }
    }

    const friendlyName = event.new_state?.attributes?.friendly_name || entityId;
    const zoneNames = zonesToAlert.map((z) => z.name).join('、');

    this.deps.logger.warn(`🚨 安防告警: ${friendlyName} 触发 (${zoneNames})`);

    this.deps.eventBus.emit('security.alarm', {
      entityId,
      friendlyName,
      zones: zonesToAlert.map((z) => z.id),
      zoneNames,
      mode: this.deps.getCurrentMode(),
      timestamp: new Date().toISOString(),
    });
    this.deps.stateHelper.scheduleSecurityEvent(
      'alarm',
      `${friendlyName} 触发告警 (${zoneNames})`,
      {
        entityId,
        zones: zonesToAlert.map((z) => z.id),
      },
    );
  }

  async handleSafetySensor(event: HaStateChangeEvent) {
    const entityId = event.entity_id;
    const newState = event.new_state?.state;
    const oldState = event.old_state?.state;
    if (!newState || newState === oldState) return;
    if (newState !== 'on' && newState !== 'wet' && !(parseFloat(String(newState)) > 0)) return;

    const { layout } = await loadActiveProjectLayout(this.deps.prisma, this.deps.appConfig);
    const hazardBindings = parseHazardLayoutBindings(layout);

    let hazard = classifyHazardSensor(
      entityId,
      event.new_state?.attributes as Record<string, unknown> | undefined,
      newState,
    );
    if (!hazard) {
      hazard = resolveBoundHazardKind(entityId, hazardBindings);
    }
    if (!hazard) return;

    const now = Date.now();
    const cooldownMs = this.deps.appConfig.get('security').sensorAlertCooldownSec * 1000;
    // 每次触发顺带清理已过冷却窗口的条目，避免 Map 只增不减
    this.pruneSafetyLastAlarm(now, cooldownMs);
    const last = this.safetyLastAlarm.get(entityId) ?? 0;
    if (cooldownMs > 0 && now - last < cooldownMs) return;
    this.safetyLastAlarm.set(entityId, now);

    const isSmoke = hazard === 'smoke';
    const isGas = hazard === 'gas';

    const friendlyName = event.new_state?.attributes?.friendly_name || entityId;
    this.deps.logger.warn(
      `🔴 安全传感器触发: ${friendlyName} (${isSmoke ? '烟雾' : isGas ? '燃气' : '漏水'})`,
    );

    const drillMode = hazardBindings.hazardDrillMode;
    let actionResults: HazardActionResult[] = [];

    if (!drillMode) {
      actionResults = await runHazardAutoActions(hazardBindings, hazard, {
        callService: (domain, service, entityId) =>
          this.deps.haConnector.callServiceViaRest(domain, service, entityId),
      });
      const failures = summarizeHazardActionFailures(actionResults);
      if (failures.length) {
        this.deps.logger.warn(`危险传感器联动部分失败: ${failures.join(',')}`);
      }
    } else {
      this.deps.logger.warn('演习模式:已跳过关阀/排风自动动作');
    }

    const actionFailures = summarizeHazardActionFailures(actionResults);
    const hazardLabel = isSmoke ? '烟雾' : isGas ? '燃气' : '漏水';

    this.deps.eventBus.emit('security.alarm', {
      entityId,
      friendlyName,
      type: isSmoke ? 'smoke' : isGas ? 'gas_leak' : 'water_leak',
      autoActions: !drillMode,
      drillMode,
      actionResults,
      actionFailures,
      zones: [],
      zoneNames: isSmoke ? '烟雾告警' : isGas ? '燃气泄漏' : '漏水告警',
      mode: 'safety',
      timestamp: new Date().toISOString(),
    });

    this.deps.stateHelper.scheduleSecurityEvent(
      'hazard',
      `${friendlyName} ${hazardLabel}告警${actionFailures.length ? `（联动失败：${actionFailures.join('、')}）` : ''}`,
      { entityId, mode: 'safety' },
    );

    if (hazardBindings.emergencySceneIds.length) {
      for (const sceneId of hazardBindings.emergencySceneIds) {
        try {
          await this.deps.haConnector.callService(
            getEntityDomain(sceneId) || 'scene',
            'turn_on',
            sceneId,
            {},
          );
        } catch (err) {
          this.deps.logger.warn(`紧急场景触发失败 [${sceneId}]: ${getErrorMessage(err)}`);
        }
      }
    }
  }
}

// ── security-emergency-runner.helper ──
interface SecurityEmergencyRunnerDeps {
  logger: Logger;
  prisma: PrismaService;
  eventBus: EventBusService;
  haConnector: HaConnectorService;
  linkage: SecurityLinkageHelper;
  getCurrentMode: () => ArmingMode;
  arm: (mode: ArmingMode, zoneIds?: string[], opts?: SecurityPanelOptions) => Promise<unknown>;
}

/** 紧急求助配置加载与设备联动执行 */
export class SecurityEmergencyRunnerHelper {
  constructor(private readonly deps: SecurityEmergencyRunnerDeps) {}

  /** 从 layout 读取紧急求助配置 */
  async loadEmergencyLayout(): Promise<{
    config: SecurityEmergencyConfig;
    awaySimulationLightPool: string[];
  }> {
    try {
      const row = await this.deps.prisma.projectConfig.findUnique({
        where: { projectId: 'default' },
      });
      if (!row?.layout) {
        return { config: normalizeSecurityEmergency(undefined), awaySimulationLightPool: [] };
      }
      const layout = readJsonObject(row.layout) as {
        securityEmergency?: Partial<SecurityEmergencyConfig>;
        awaySimulationLightPool?: string[];
      };
      return {
        config: normalizeSecurityEmergency(layout.securityEmergency),
        awaySimulationLightPool: Array.isArray(layout.awaySimulationLightPool)
          ? layout.awaySimulationLightPool.filter(Boolean)
          : [],
      };
    } catch {
      return { config: normalizeSecurityEmergency(undefined), awaySimulationLightPool: [] };
    }
  }

  async runBuiltinEmergency(
    profile: 'full_home' | 'key_areas',
    cfg: SecurityEmergencyConfig,
    awaySimulationLightPool: string[],
  ): Promise<{ sirens: number; lights: number; failed: number }> {
    const results = { sirens: 0, lights: 0, failed: 0 };
    const brightness = cfg.lightBrightnessPct;

    try {
      const sirens = await this.deps.haConnector.fetchEntitiesByDomain('siren');
      const sirenItems = sirens.map((s) => ({
        domain: 'siren',
        service: 'turn_on',
        entity_id: s.entity_id,
        data: {},
      }));
      const sirenResult = await this.deps.linkage.callServiceBatch(
        sirenItems,
        '紧急求助 sirens',
        'emergency_action_failed',
      );
      results.sirens = sirenResult.ok;
      results.failed += sirenResult.failed;
    } catch {
      /* 无 siren 域则跳过 */
    }

    let lightIds: string[] = [];
    if (profile === 'full_home') {
      try {
        const lights = await this.deps.haConnector.fetchEntitiesByDomain('light');
        lightIds = lights.map((l) => l.entity_id);
      } catch {
        /* 跳过 */
      }
    } else {
      lightIds = resolveEmergencyLightPool(cfg, awaySimulationLightPool);
      if (!lightIds.length) {
        this.deps.logger.warn(
          '重点区域模式未配置灯池,已跳过灯光联动(仍可配置 emergency.lightPool 或 awaySimulationLightPool)',
        );
      }
    }

    if (lightIds.length) {
      const lightItems = lightIds.map((entity_id) => ({
        domain: 'light',
        service: 'turn_on',
        entity_id,
        data: { brightness_pct: brightness },
      }));
      const lightResult = await this.deps.linkage.callServiceBatch(
        lightItems,
        '紧急求助 lights',
        'emergency_action_failed',
      );
      results.lights = lightResult.ok;
      results.failed += lightResult.failed;
    }

    return results;
  }

  /** 按配置执行自定义 + 内置紧急联动 */
  async runEmergencyActions() {
    const { config: cfg, awaySimulationLightPool } = await this.loadEmergencyLayout();
    const results = { executed: 0, sirens: 0, lights: 0, failed: 0 };

    if (shouldRunCustomEmergencyActions(cfg)) {
      const custom = await this.deps.linkage.executeHaActions(
        cfg.actions,
        '紧急求助',
        'emergency_action_failed',
      );
      results.executed = custom.executed;
      results.failed += custom.failed;
    }

    if (shouldRunBuiltinEmergency(cfg)) {
      const profile = resolveBuiltinProfile(cfg);
      const builtin = await this.runBuiltinEmergency(profile, cfg, awaySimulationLightPool);
      results.sirens = builtin.sirens;
      results.lights = builtin.lights;
      results.failed += builtin.failed;
    } else if (!shouldRunCustomEmergencyActions(cfg)) {
      if (cfg.mode === 'notify_only') {
        this.deps.logger.warn('紧急求助:静默通知模式,跳过设备联动');
      } else if (cfg.mode === 'custom' && !cfg.appendBuiltin) {
        this.deps.logger.warn('紧急求助:完全自定义且无叠加内置,无设备联动');
      }
    }

    if (cfg.autoArmAway) {
      try {
        await this.deps.arm('armed_away', undefined, {
          source: 'emergency',
          skipActions: true,
          force: this.deps.getCurrentMode() !== 'armed_away',
        });
        this.deps.logger.warn('紧急求助:已自动离家布防(跳过布防联动,避免与求救声光冲突)');
      } catch (err) {
        scheduleSecurityEvent(
          this.deps.prisma,
          this.deps.logger,
          'emergency_action_failed',
          `紧急求助自动布防失败: ${getErrorMessage(err)}`,
        );
      }
    }

    this.deps.eventBus.emit('security.emergencyCompleted', {
      ...results,
      mode: cfg.mode,
      timestamp: new Date().toISOString(),
    });

    this.deps.logger.warn(
      `求救联动完成: 自定义 ${results.executed}, 警报器 ${results.sirens}, 灯具 ${results.lights}, 失败 ${results.failed}`,
    );
    return results;
  }
}
