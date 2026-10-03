/**
 * @file smart-advisor-usage.helper.ts
 * @module awareness
 * @description 设备使用统计与遗忘检测 helper。跟踪设备开关次数与运行时长，
 * 按日持久化到 DeviceUsageStat；并基于房间设备映射检测「灯关了但空调/媒体还开着」
 * 等遗忘场景。同时处理实体 TTS 自定义告警匹配与播报。
 *
 * 依赖（SmartAdvisorUsageDeps）：
 * - prisma / appConfig / haConnector / stateStore / stateRouter：数据与状态来源。
 * - voiceConfig / entityTtsAlerts / customAlerts / queueSpeak：TTS 告警出口。
 * - pushTip / roomLabel：建议推送与房间标签。
 */
import { Logger } from '@nestjs/common';
import {
  getEntityDomain,
  entityMatchesEnvRoom,
  isRoomHiddenInMap,
  listVisibleEnvSensorMapRoomIds,
} from '@homeos/shared';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import type { AppConfigData } from '../../shared/app-config/types';
import { HaConnectorService } from '../ha-connector/service';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import type { HaStateChangeEvent } from '../../shared/types';
import { StateStoreService } from '../state-store/service';
import { getErrorMessage, localDateKey } from '../../common/utils';
import {
  applyAlertTemplate,
  matchCustomEntityAlert,
  matchEntityTtsAlert,
  resolveVoiceAlertRules,
  type CustomTtsAlertRule,
  type EntityTtsAlertRule,
} from '../../common/alert-support/voice-alert.util';

/** 设备使用统计与遗忘检测依赖注入接口 */
interface SmartAdvisorUsageDeps {
  prisma: PrismaService;
  appConfig: AppConfigService;
  haConnector: HaConnectorService;
  stateStore: StateStoreService;
  stateRouter: HaStateChangeRouterService;
  logger: Logger;
  pushTip: (title: string, message: string, category: string) => void;
  roomLabel: (room: string) => string;
  voiceConfig: () => AppConfigData['voice'];
  entityTtsAlerts: () => EntityTtsAlertRule[];
  customAlerts: () => CustomTtsAlertRule[];
  queueSpeak: (message: string, dedupKey: string, opts?: { bypassDnd?: boolean }) => void;
}

/**
 * 设备使用统计与遗忘检测 helper。
 *
 * 职责：
 * - 跟踪设备开关次数与运行时长（内存缓存 + DeviceUsageStat 持久化）。
 * - 构建房间设备映射，检测遗忘开启的设备。
 * - 匹配实体 TTS 自定义告警并播报。
 * - 提供使用报告、单设备统计、异常提示等查询。
 *
 * 由 SmartAdvisorService 持有，非 @Injectable，通过 deps 注入依赖。
 */
export class SmartAdvisorUsageHelper {
  /** 设备使用统计（内存缓存 lastOn，持久化至 DeviceUsageStat） */
/** 设备使用统计内存缓存（entityId → onCount/lastOn/totalRuntime），异步持久化至 DeviceUsageStat */
  readonly deviceUsage = new Map<
    string,
    { onCount: number; lastOn: number; totalRuntime: number }
  >();

  /** 房间到设备映射（用于"忘了关..."检测） */
/** 房间到设备映射（用于「忘了关...」检测） */
  private roomDeviceMap: Record<string, string[]> = {};

  constructor(private readonly deps: SmartAdvisorUsageDeps) {}

/**
   * 注册房间设备列表。
   *
   * @param room 房间标识。
   * @param entityIds 该房间内的实体 ID 列表。
   */
  registerRoomDevices(room: string, entityIds: string[]) {
    this.roomDeviceMap[room] = entityIds;
  }

/**
   * 根据 envSensorMap 配置构建房间设备映射。
   *
   * 拉取 light / climate / media_player 三域实体，按房间匹配后注册。
   * 副作用：更新 roomDeviceMap。异常：内部 catch 后仅记录 warn。
   */
  async buildRoomDeviceMapFromConfig() {
    const map = this.deps.appConfig.get('envSensorMap') || {};
    const rooms = listVisibleEnvSensorMapRoomIds(map);
    if (!rooms.length) return;

    this.roomDeviceMap = {};

    try {
      const [lights, climates, media] = await Promise.all([
        this.deps.haConnector.fetchEntitiesByDomain('light'),
        this.deps.haConnector.fetchEntitiesByDomain('climate'),
        this.deps.haConnector.fetchEntitiesByDomain('media_player'),
      ]);
      const entities = [...lights, ...climates, ...media];

      for (const room of rooms) {
        if (isRoomHiddenInMap(map, room)) continue;
        const ids = entities
          .filter((e) =>
            entityMatchesEnvRoom(
              e.entity_id,
              String(e.attributes?.friendly_name || ''),
              String(e.attributes?.area_id || e.attributes?.area_name || ''),
              room,
              map,
            ),
          )
          .map((e) => e.entity_id);
        if (ids.length) this.registerRoomDevices(room, ids);
      }
      this.deps.logger.log(`房间设备映射已建立: ${Object.keys(this.roomDeviceMap).length} 个房间`);
    } catch (err) {
      this.deps.logger.warn(`建立房间设备映射失败: ${getErrorMessage(err)}`);
    }
  }

/**
   * 构建 light / climate / media_player 实体状态映射。
   *
   * 优先从 HA 实时拉取；若为空则回退到 StateStore 缓存。
   *
   * @returns entityId → { state, attributes } 映射。
   */
  async buildEntityStateMap(): Promise<
    Map<string, { state: string; attributes?: Record<string, unknown> }>
  > {
    const map = new Map<string, { state: string; attributes?: Record<string, unknown> }>();
    const domains = ['light', 'climate', 'media_player'] as const;
    for (const domain of domains) {
      const entities = await this.deps.haConnector.fetchEntitiesByDomain(domain);
      for (const e of entities) {
        map.set(e.entity_id, {
          state: e.state,
          attributes: e.attributes as Record<string, unknown> | undefined,
        });
      }
    }
    if (map.size === 0) {
      for (const e of this.deps.stateStore.getAll()) {
        const domain = getEntityDomain(e.entity_id);
        if (!domains.includes(domain as (typeof domains)[number])) continue;
        map.set(e.entity_id, {
          state: e.state,
          attributes: e.attributes as Record<string, unknown> | undefined,
        });
      }
    }
    return map;
  }

/**
   * 检测遗忘设备：房间灯全关但空调/媒体仍运行。
   *
   * 仅在 06:00–23:00 时段检测，避免夜间误报。
   *
   * @param entities 实体状态映射。
   * @returns 遗忘设备列表，含 entityId / friendlyName / reason。
   */
  detectForgottenDevices(
    entities: Map<string, { state: string; attributes?: Record<string, unknown> }>,
  ): Array<{ entityId: string; friendlyName: string; reason: string }> {
    const forgotten: Array<{ entityId: string; friendlyName: string; reason: string }> = [];
    const h = new Date().getHours();
    if (h < 6 || h > 23) return forgotten;

    for (const [room, deviceIds] of Object.entries(this.roomDeviceMap)) {
      const roomLights = deviceIds.filter((id) => id.startsWith('light.'));
      const roomClimate = deviceIds.filter((id) => id.startsWith('climate.'));
      const roomMedia = deviceIds.filter((id) => id.startsWith('media_player.'));

      const lightsOff =
        roomLights.length > 0 &&
        roomLights.every((id) => {
          const e = entities.get(id);
          return e && e.state === 'off';
        });

      if (lightsOff) {
        for (const cId of roomClimate) {
          const e = entities.get(cId);
          if (e && (e.state === 'heat' || e.state === 'cool' || e.state === 'heat_cool')) {
            const name = (e.attributes?.friendly_name as string) || cId;
            forgotten.push({
              entityId: cId,
              friendlyName: name,
              reason: `${this.deps.roomLabel(room)}的灯已关，但空调还开着`,
            });
          }
        }
        for (const mId of roomMedia) {
          const e = entities.get(mId);
          if (e && (e.state === 'playing' || e.state === 'on')) {
            const name = (e.attributes?.friendly_name as string) || mId;
            forgotten.push({
              entityId: mId,
              friendlyName: name,
              reason: `${this.deps.roomLabel(room)}的灯已关，但媒体设备还在播放`,
            });
          }
        }
      }
    }

    return forgotten;
  }

/**
   * 离家时检测遗忘设备并推送建议。
   * 副作用：调用 pushTip。异常：内部 catch 后仅记录 warn。
   */
  async checkForgottenOnLeave() {
    try {
      const entities = await this.buildEntityStateMap();
      const forgotten = this.detectForgottenDevices(entities);
      for (const item of forgotten) {
        this.deps.pushTip(`可能忘了关：${item.friendlyName}`, item.reason, 'comfort');
      }
    } catch (err) {
      this.deps.logger.warn(`离家遗忘设备检测失败: ${getErrorMessage(err)}`);
    }
  }

/**
   * 定时检测遗忘设备并推送建议（由 SmartAdvisorService Cron 调用）。
   * 副作用：调用 pushTip。异常：内部 catch 后仅记录 warn。
   */
  async checkForgottenCron() {
    try {
      const entities = await this.buildEntityStateMap();
      const forgotten = this.detectForgottenDevices(entities);
      for (const item of forgotten) {
        this.deps.pushTip(`可能忘了关：${item.friendlyName}`, item.reason, 'comfort');
      }
    } catch (err) {
      this.deps.logger.warn(`遗忘设备检测失败: ${getErrorMessage(err)}`);
    }
  }

/**
   * 查询当前遗忘设备列表（不推送，仅返回数据）。
   *
   * @returns 遗忘设备列表。
   */
  async getForgottenDevices(): Promise<
    Array<{ entityId: string; friendlyName: string; reason: string }>
  > {
    const entities = await this.buildEntityStateMap();
    return this.detectForgottenDevices(entities);
  }

  trackUsage(event: HaStateChangeEvent) {
    if (!this.deps.stateRouter.shouldProcess('smart_advisor_usage', event)) return;
    const snap = {
      entity_id: event?.entity_id,
      new_state: event?.new_state ?? undefined,
      old_state: event?.old_state ?? undefined,
    };
    setImmediate(() => {
      this.handleStateChange(snap);
      this.handleCustomEntityAlerts(snap);
    });
  }

  handleCustomEntityAlerts(event: {
    entity_id?: string;
    new_state?: { state?: string; attributes?: Record<string, unknown> };
    old_state?: { state?: string };
  }) {
    if (!resolveVoiceAlertRules(this.deps.voiceConfig()).enabled) return;
    const entityId = event?.entity_id;
    const newState = event?.new_state?.state;
    if (!entityId || !newState) return;
    const oldState = event?.old_state?.state;
    const friendlyName = String(event?.new_state?.attributes?.friendly_name || entityId);
    for (const rule of this.deps.entityTtsAlerts()) {
      if (!matchEntityTtsAlert(entityId, newState, oldState, rule)) continue;
      const msg = applyAlertTemplate(rule.messageTemplate, {
        entity_id: entityId,
        name: friendlyName,
        friendly_name: friendlyName,
        state: newState,
        old_state: oldState || '',
      });
      if (msg) this.deps.queueSpeak(msg, `entity_tts:${rule.id}:${entityId}`);
    }
    for (const rule of this.deps.customAlerts()) {
      if (!matchCustomEntityAlert(entityId, newState, oldState, rule)) continue;
      const msg = applyAlertTemplate(rule.messageTemplate, {
        entity_id: entityId,
        name: friendlyName,
        friendly_name: friendlyName,
        state: newState,
        old_state: oldState || '',
      });
      if (msg) this.deps.queueSpeak(msg, `custom_entity:${rule.id}:${entityId}`);
    }
  }

  handleStateChange(event: {
    entity_id?: string;
    new_state?: { state?: string; attributes?: Record<string, unknown> };
    old_state?: { state?: string };
  }) {
    const entityId = event?.entity_id;
    const newState = event?.new_state?.state;
    if (!entityId || !newState) return;

    let entry = this.deviceUsage.get(entityId);
    if (!entry) {
      entry = { onCount: 0, lastOn: 0, totalRuntime: 0 };
      this.deviceUsage.set(entityId, entry);
    }

    const day = this.todayKey();
    const now = Date.now();

    if (this.isOnState(newState)) {
      entry.onCount++;
      entry.lastOn = now;
      this.persistUsageStat(entityId, day, { onCount: 1, lastOn: new Date(now) });
    } else if (this.isOffState(newState) && entry.lastOn > 0) {
      const runtimeMs = now - entry.lastOn;
      entry.totalRuntime += runtimeMs;
      entry.lastOn = 0;
      this.persistUsageStat(entityId, day, { totalRuntimeMs: runtimeMs, lastOn: null });
    }
  }

  async getUsageReport(): Promise<{
    topDevices: Array<{ entityId: string; onCount: number; totalRuntimeMs: number }>;
    totalDevices: number;
    days: number;
  }> {
    const summary = await this.getUsageSummary(7);
    return {
      topDevices: summary.topDevices.slice(0, 10),
      totalDevices: summary.totalDevices,
      days: summary.days,
    };
  }

  async getEntityUsage(
    entityId: string,
    days = 7,
  ): Promise<{
    daily: Array<{ day: string; onCount: number; totalRuntimeMs: number; lastOn: string | null }>;
    summary: { onCount: number; totalRuntimeMs: number; avgDaily: number };
  }> {
    const safeDays = Math.min(Math.max(days, 1), 90);
    const sinceDay = new Date();
    sinceDay.setDate(sinceDay.getDate() - safeDays);
    const since = localDateKey(sinceDay);

    const rows = await this.deps.prisma.deviceUsageStat.findMany({
      where: { entityId, day: { gte: since } },
      orderBy: { day: 'asc' },
      take: 200,
    });

    const daily = rows.map((r) => ({
      day: r.day,
      onCount: r.onCount,
      totalRuntimeMs: Number(r.totalRuntimeMs ?? 0),
      lastOn: r.lastOn ? r.lastOn.toISOString() : null,
    }));

    const onCount = daily.reduce((s, d) => s + d.onCount, 0);
    const totalRuntimeMs = daily.reduce((s, d) => s + d.totalRuntimeMs, 0);
    const avgDaily = daily.length ? Math.round(onCount / daily.length) : 0;

    return { daily, summary: { onCount, totalRuntimeMs, avgDaily } };
  }

  async getUsageSummary(days = 7): Promise<{
    topDevices: Array<{ entityId: string; onCount: number; totalRuntimeMs: number }>;
    totalDevices: number;
    days: number;
    dailyTotals: Array<{ day: string; onCount: number; totalRuntimeMs: number }>;
    domainBreakdown: Array<{
      domain: string;
      onCount: number;
      totalRuntimeMs: number;
      deviceCount: number;
    }>;
    anomalyHints: Array<{
      entityId: string;
      type: 'spike' | 'forgotten' | 'unused';
      message: string;
    }>;
    topDeviceDaily: Array<{ entityId: string; daily: Array<{ day: string; onCount: number }> }>;
  }> {
    const safeDays = Math.min(Math.max(days, 1), 90);
    const sinceDay = new Date();
    sinceDay.setDate(sinceDay.getDate() - safeDays);
    const since = localDateKey(sinceDay);

    const [entityRows, dailyRows] = await Promise.all([
      this.deps.prisma.deviceUsageStat.groupBy({
        by: ['entityId'],
        where: { day: { gte: since } },
        _sum: { onCount: true, totalRuntimeMs: true },
      }),
      this.deps.prisma.deviceUsageStat.groupBy({
        by: ['day'],
        where: { day: { gte: since } },
        _sum: { onCount: true, totalRuntimeMs: true },
        orderBy: { day: 'asc' },
      }),
    ]);

    const topDevices = entityRows
      .map((r) => ({
        entityId: r.entityId,
        onCount: r._sum.onCount ?? 0,
        totalRuntimeMs: Number(r._sum.totalRuntimeMs ?? 0),
      }))
      .sort((a, b) => b.onCount - a.onCount || b.totalRuntimeMs - a.totalRuntimeMs);

    const domainMap = new Map<
      string,
      { onCount: number; totalRuntimeMs: number; deviceCount: number }
    >();
    for (const row of topDevices) {
      const domain = getEntityDomain(row.entityId) || 'unknown';
      const prev = domainMap.get(domain) || { onCount: 0, totalRuntimeMs: 0, deviceCount: 0 };
      domainMap.set(domain, {
        onCount: prev.onCount + row.onCount,
        totalRuntimeMs: prev.totalRuntimeMs + row.totalRuntimeMs,
        deviceCount: prev.deviceCount + 1,
      });
    }

    const dailyTotals = dailyRows.map((r) => ({
      day: r.day,
      onCount: r._sum.onCount ?? 0,
      totalRuntimeMs: Number(r._sum.totalRuntimeMs ?? 0),
    }));

    const anomalyHints = await this.buildAnomalyHints(topDevices, safeDays);

    const topIds = topDevices.slice(0, 6).map((d) => d.entityId);
    const topDailyRows = topIds.length
      ? await this.deps.prisma.deviceUsageStat.findMany({
          where: { entityId: { in: topIds }, day: { gte: since } },
          orderBy: [{ entityId: 'asc' }, { day: 'asc' }],
          select: { entityId: true, day: true, onCount: true },
          take: 600,
        })
      : [];
    const topDailyMap = new Map<string, Array<{ day: string; onCount: number }>>();
    for (const row of topDailyRows) {
      const list = topDailyMap.get(row.entityId) || [];
      list.push({ day: row.day, onCount: row.onCount });
      topDailyMap.set(row.entityId, list);
    }
    const topDeviceDaily = topIds.map((entityId) => ({
      entityId,
      daily: topDailyMap.get(entityId) || [],
    }));

    return {
      topDevices,
      totalDevices: entityRows.length,
      days: safeDays,
      dailyTotals,
      domainBreakdown: [...domainMap.entries()]
        .map(([domain, v]) => ({ domain, ...v }))
        .sort((a, b) => b.onCount - a.onCount),
      anomalyHints,
      topDeviceDaily,
    };
  }

  private async buildAnomalyHints(
    topDevices: Array<{ entityId: string; onCount: number; totalRuntimeMs: number }>,
    days: number,
  ): Promise<Array<{ entityId: string; type: 'spike' | 'forgotten' | 'unused'; message: string }>> {
    const hints: Array<{
      entityId: string;
      type: 'spike' | 'forgotten' | 'unused';
      message: string;
    }> = [];
    const avgOnCount = topDevices.length
      ? topDevices.reduce((s, d) => s + d.onCount, 0) / topDevices.length
      : 0;

    for (const d of topDevices.slice(0, 20)) {
      if (avgOnCount > 0 && d.onCount >= avgOnCount * 2.5 && d.onCount >= 10) {
        hints.push({
          entityId: d.entityId,
          type: 'spike',
          message: `近 ${days} 天切换 ${d.onCount} 次，明显高于平均水平`,
        });
      }
    }

    for (const d of topDevices) {
      if (d.onCount === 0 && d.totalRuntimeMs === 0) {
        hints.push({
          entityId: d.entityId,
          type: 'unused',
          message: `近 ${days} 天无使用记录`,
        });
      }
    }

    try {
      const forgotten = await this.getForgottenDevices();
      for (const f of forgotten.slice(0, 5)) {
        hints.push({
          entityId: f.entityId,
          type: 'forgotten',
          message: f.reason || '可能遗忘开启',
        });
      }
    } catch {
      // 忽略遗忘设备查询失败
    }

    return hints.slice(0, 15);
  }

  async clearUsageStats(): Promise<{ deleted: number }> {
    const result = await this.deps.prisma.deviceUsageStat.deleteMany({});
    this.deviceUsage.clear();
    this.deps.logger.log(`设备使用统计已清除: ${result.count} 条记录`);
    return { deleted: result.count };
  }

  private todayKey(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private isOnState(state: string): boolean {
    return state === 'on' || state === 'home' || state === 'playing';
  }

  private isOffState(state: string): boolean {
    return state === 'off' || state === 'idle' || state === 'standby' || state === 'paused';
  }

  private persistUsageStat(
    entityId: string,
    day: string,
    patch: { onCount?: number; totalRuntimeMs?: number; lastOn?: Date | null },
  ) {
    setImmediate(() => {
      const create = {
        entityId,
        day,
        onCount: patch.onCount ?? 0,
        totalRuntimeMs: BigInt(patch.totalRuntimeMs ?? 0),
        lastOn: patch.lastOn === undefined ? undefined : patch.lastOn,
      };
      this.deps.prisma.deviceUsageStat
        .upsert({
          where: { entityId_day: { entityId, day } },
          create,
          update: {
            ...(patch.onCount != null ? { onCount: { increment: patch.onCount } } : {}),
            ...(patch.totalRuntimeMs != null
              ? { totalRuntimeMs: { increment: BigInt(patch.totalRuntimeMs) } }
              : {}),
            ...(patch.lastOn !== undefined ? { lastOn: patch.lastOn } : {}),
          },
        })
        .catch((err) => {
          this.deps.logger.debug(
            `DeviceUsageStat upsert 失败 [${entityId}]: ${getErrorMessage(err)}`,
          );
        });
    });
  }
}
