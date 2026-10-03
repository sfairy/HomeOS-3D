/**
 * @file service.ts
 * @module backend/src/shared/app-config
 */
/**
 * 应用配置服务：系统运行参数的内存缓存、DB 持久化、跨副本同步、脱敏与审计。
 *
 * 职责：
 *   - 启动时从 DB 加载配置并合并默认值（带重试），缺失分区/字段自动迁移补全；
 *   - getAll/get/getSection/getPublic：按角色脱敏下发，admin 可见全部、adult 仅可见部分分区、
 *     访客/儿童仅见公开分区；
 *   - update/reset/replaceAll：局部 patch / 整体重置 / 全量替换，乐观锁原子化持久化，
 *     合并后补全缺失嵌套默认字段，广播 APP_CONFIG_UPDATED 事件供各服务热更新；
 *   - 分区克隆缓存（sectionCache + configGeneration）：同一 config generation 内共享克隆，
 *     避免热路径每次 structuredClone；
 *   - 配置审计：记录分区变更时间与被修改键，可选持久化至 RuntimeKv。
 * 关键依赖：
 *   - ../prisma/service#PrismaService（systemConfig / runtimeKv 表读写）
 *   - ../redis/event-bus.service#EventBusService（跨副本广播配置变更）
 *   - ./validate/core.util#validateAppConfigPartial（局部 patch 校验）
 *   - ./config-mask.util（脱敏与角色裁剪）
 */
import { randomBytes } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { badRequest } from '../../common/utils/business-exception';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@generated/prisma';
import { PrismaService } from '../prisma/service';
import { HOMEOS_EVENTS } from '../homeos-events';
import { EventBusService } from '../redis/event-bus.service';
import {
  APP_CONFIG_SCHEMA_VERSION,
  CONFIG_AUDIT_STORAGE_ID,
  CONFIG_REPLACE_ON_UPDATE_SECTIONS,
  CONFIG_REPLACE_NESTED_FIELDS,
  PUBLIC_CONFIG_SECTIONS,
} from './constants';
/** 配置变更事件名：任意分区被更新后广播，携带被更新的分区键数组 */
export const APP_CONFIG_UPDATED = HOMEOS_EVENTS.APP_CONFIG_UPDATED;


import {
  applyImportReplacePreservingSecrets,
  isMaskedValue,
  maskSensitiveFieldsByKey,
  restoreClientPowerReportTokens,
  stripMaskedPlaceholders,
} from './config-mask.util';
import { BusinessException, ErrorCode, getErrorMessage, rethrowIfHttpException } from '../../common/utils';
import { resolveVoiceRooms } from '../../common/alert-support/voice-command.util';
import { buildClientPowerWakePublic, buildPublicRoomMeta } from '@homeos/shared';
import { validateAppConfigPartial } from './validate/core.util';
import { normalizePricingPatch } from './validate/energy.util';
import {
  buildEnergyPublicMeta,
  buildEventLogPublicMeta,
  resolveOrchestratorHistoryLimit,
} from '../../common/database/event-log-retention.util';
import type { AppConfigData, ConfigAuditEntry, DeepPartialAppConfigData } from './types';

/** 为未配置上报密钥的终端自动生成 reportToken */
function ensureClientPowerReportTokens(clientPower: AppConfigData['clientPower']): boolean {
  let changed = false;
  for (const client of clientPower.clients) {
    if (!String(client.reportToken || '').trim() || isMaskedValue(client.reportToken)) {
      client.reportToken = randomBytes(24).toString('hex');
      changed = true;
    }
  }
  return changed;
}

export type { AppConfigData } from './types';

import { DEFAULT_APP_CONFIG } from './defaults';
import { buildPaginatedResult } from '../../common/crud/pagination.util';
import { applyAdaptiveBackendPerfInPlace } from '../../common/observability/adaptive-backend-perf.util';
import { normalizeAppConfigForImport } from './import-normalize.util';

// ──────── 服务 ────────

@Injectable()
/**
 * AppConfigService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class AppConfigService
 */
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name);
  private config: AppConfigData = structuredClone(DEFAULT_APP_CONFIG as AppConfigData);
  private readonly auditLog: ConfigAuditEntry[] = [];
  private configUpdatedAt: Date | null = null;

  /** 分区克隆缓存：同一 config generation 内共享，避免热路径每次 structuredClone */
  private readonly sectionCache = new Map<
    keyof AppConfigData,
    { gen: number; value: AppConfigData[keyof AppConfigData] }
  >();
  /** config 变更代数：任何原地修改 / 整体替换后递增，使缓存整体失效 */
  private configGeneration = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: EventBusService,
  ) {}

  /** 启动时从 DB 加载配置（带重试），失败则回退默认值 */
  async onModuleInit() {
    await this.loadWithRetry();
  }

  /**
   * 本进程内二次兜底：若已由 EventBus peer 路径重载则 no-op。
   * 单副本无 Redis 时不需要；保留以便未来直连 EventEmitter 的入口。
   */
  @OnEvent(APP_CONFIG_UPDATED)
  async onAppConfigUpdatedBridged() {
    try {
      await this.reloadFromDbIfStale();
    } catch (err) {
      this.logger.warn(`跨副本重载系统配置失败: ${getErrorMessage(err)}`);
    }
  }

  /** 若 DB updatedAt 新于本地缓存则重载（不触发 migrate/persist） */
  async reloadFromDbIfStale(): Promise<boolean> {
    const record = await this.prisma.systemConfig.findUnique({ where: { id: 'default' } });
    if (!record) return false;
    if (this.configUpdatedAt && record.updatedAt.getTime() <= this.configUpdatedAt.getTime()) {
      return false;
    }
    await this.hydrateFromDb(record);
    this.logger.log('系统配置已从 DB 同步(跨副本)');
    return true;
  }

  /** 从 DB 记录水合配置：规范化 → 以默认值为基底 deep merge DB 数据 → 迁移缺失分区 */
  private async hydrateFromDb(record: {
    data: unknown;
    updatedAt: Date;
  }) {
    const rawDb = record.data as Record<string, unknown>;
    const { config: db } = normalizeAppConfigForImport(rawDb);
    this.config = structuredClone(DEFAULT_APP_CONFIG as AppConfigData);
    this.mergeDeep(
      this.config as unknown as Record<string, unknown>,
      db as Record<string, unknown>,
    );
    this.migrateMissingSections();
    this.configUpdatedAt = record.updatedAt;
    this.bumpConfigGeneration();
  }

  /** 加载配置带重试：失败时线性退避重试，超过最大次数后回退默认值并告警 */
  private async loadWithRetry(attempt = 1, maxAttempts = 3): Promise<void> {
    try {
      await this.load();
    } catch (err) {
      const msg = getErrorMessage(err);
      if (attempt < maxAttempts) {
        const delayMs = 1000 * attempt;
        this.logger.warn(
          `加载系统配置失败(第 ${attempt}/${maxAttempts} 次),${delayMs}ms 后重试:${msg}`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
        return this.loadWithRetry(attempt + 1, maxAttempts);
      }
      this.logger.warn(`加载系统配置失败,使用默认值: ${msg}`);
    }
  }

  /**
   * 从 DB 加载配置：存在则 deep merge + 迁移缺失分区/规范化后回写；
   * 不存在则初始化默认值；同时补全客户端 reportToken 与审计日志。
   */
  private async load() {
    try {
      const record = await this.prisma.systemConfig.findUnique({ where: { id: 'default' } });
      if (record) {
        const rawDb = record.data as Record<string, unknown>;
        const { config: db, changes: normalizeChanges } = normalizeAppConfigForImport(rawDb);
        this.mergeDeep(
          this.config as unknown as Record<string, unknown>,
          db as Record<string, unknown>,
        );
        this.configUpdatedAt = record.updatedAt;
        let migrated = normalizeChanges.length > 0;
        if (this.migrateMissingSections()) migrated = true;
        if (migrated) {
          await this.persist();
          if (normalizeChanges.length) {
            this.logger.log(`系统配置规范化:${normalizeChanges.join(';')}`);
          }
        }
        this.logger.log('系统配置已从 DB 加载');
      } else {
        const created = await this.prisma.systemConfig.create({
          data: { id: 'default', data: this.config as unknown as Prisma.InputJsonValue },
        });
        this.configUpdatedAt = created.updatedAt;
        this.logger.log('系统配置已初始化默认值');
      }
      if (ensureClientPowerReportTokens(this.config.clientPower)) {
        await this.persist();
        this.logger.log('已为既有客户端充放电策略补全 reportToken');
      }
      await this.hydrateAuditLog();
      this.bumpConfigGeneration();
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /** 从 RuntimeKv 加载已持久化的配置审计日志（仅在 configAuditPersistEnabled 时执行） */
  private async hydrateAuditLog() {
    if (!this.config.ops?.configAuditPersistEnabled) return;
    try {
      const row = await this.prisma.runtimeKv.findUnique({
        where: { id: CONFIG_AUDIT_STORAGE_ID },
      });
      const stored = row?.data;
      if (Array.isArray(stored)) {
        this.auditLog.push(...(stored as unknown as ConfigAuditEntry[]));
        const max = this.getMaxAudit();
        if (this.auditLog.length > max) this.auditLog.length = max;
      }
    } catch (err) {
      this.logger.warn(`加载配置审计失败: ${(err as Error).message}`);
    }
  }

  /** 递归补全缺失字段：仅补 target 中缺失的键，绝不覆盖用户已设置的值；数组不递归展开 */
  private mergeDefaultsRecursive(
    target: Record<string, unknown>,
    defaults: Record<string, unknown>,
  ): boolean {
    let changed = false;
    for (const key of Object.keys(defaults)) {
      if (!(key in target)) {
        // 缺失键：整棵子树克隆自默认值
        target[key] = structuredClone(defaults[key]);
        changed = true;
      } else if (
        target[key] &&
        defaults[key] &&
        typeof target[key] === 'object' &&
        typeof defaults[key] === 'object' &&
        !Array.isArray(target[key]) &&
        !Array.isArray(defaults[key])
      ) {
        // 两侧均为普通对象：继续递归补缺
        if (
          this.mergeDefaultsRecursive(
            target[key] as Record<string, unknown>,
            defaults[key] as Record<string, unknown>,
          )
        ) {
          changed = true;
        }
      }
      // 其它情况（默认值为标量/数组，或 target 侧为标量/数组/非对象）：保持现状，不覆盖用户值
    }
    return changed;
  }

  /** 补全新增分区与字段（自 DEFAULT_APP_CONFIG 仅补缺失项，递归至嵌套层） */
  private migrateMissingSections(): boolean {
    let changed = false;
    for (const section of Object.keys(DEFAULT_APP_CONFIG) as (keyof AppConfigData)[]) {
      const cfg = this.config as unknown as Record<string, unknown>;
      if (!(section in cfg)) {
        cfg[section] = structuredClone(DEFAULT_APP_CONFIG[section]);
        changed = true;
        continue;
      }
      const rawTarget = cfg[section];
      const defaults = DEFAULT_APP_CONFIG[section] as Record<string, unknown>;
      if (rawTarget && typeof rawTarget === 'object' && !Array.isArray(rawTarget)) {
        if (this.mergeDefaultsRecursive(rawTarget as Record<string, unknown>, defaults)) {
          changed = true;
        }
      }
    }
    // 旧默认 criticalDomains 缺 lock；与 WS_PUSH_CRITICAL_DOMAINS / 前端快路径对齐
    const domains = this.config.wsPush?.criticalDomains;
    if (
      Array.isArray(domains) &&
      domains.includes('light') &&
      domains.includes('switch') &&
      !domains.includes('lock')
    ) {
      this.config.wsPush.criticalDomains = [...domains, 'lock'];
      changed = true;
    }
    return changed;
  }

  /** 审计日志最大条数（取 ops.configAuditMaxEntries，<=0 时回退 100） */
  private getMaxAudit(): number {
    const n = this.config.ops?.configAuditMaxEntries;
    return n > 0 ? n : 100;
  }

  /** 配置被原地修改 / 整体替换后调用，使分区克隆缓存失效 */
  private bumpConfigGeneration(): void {
    this.configGeneration += 1;
    this.sectionCache.clear();
  }

  /** 递归 deep merge：对象类型递归合并，标量/数组直接覆盖 */
  private mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(source)) {
      const value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
          target[key] = {};
        }
        this.mergeDeep(target[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        target[key] = value;
      }
    }
  }

  /** 合并分区 patch：指定嵌套 Record 字段整段替换以支持删除键 */
  private mergeSection(
    targetSection: Record<string, unknown>,
    patchSection: Record<string, unknown>,
    nestedReplaceKeys: readonly string[] = [],
  ): void {
    const replaceSet = new Set(nestedReplaceKeys.filter((k) => k in patchSection));
    for (const key of replaceSet) {
      targetSection[key] = structuredClone(patchSection[key]);
    }
    const rest = Object.fromEntries(
      Object.entries(patchSection).filter(([k]) => !replaceSet.has(k)),
    );
    if (Object.keys(rest).length) {
      this.mergeDeep(targetSection, rest);
    }
  }

  /** 合并 partial 配置：pricing 分区先 normalize，再按分区 deep merge 或整段替换嵌套字段 */
  private mergePartialConfig(cfg: Record<string, unknown>, partial: Record<string, unknown>): void {
    for (const [sectionKey, sectionPatch] of Object.entries(partial)) {
      if (sectionPatch && typeof sectionPatch === 'object' && !Array.isArray(sectionPatch)) {
        const patch =
          sectionKey === 'pricing'
            ? normalizePricingPatch(sectionPatch as Record<string, unknown>)
            : sectionPatch;
        if (
          !cfg[sectionKey] ||
          typeof cfg[sectionKey] !== 'object' ||
          Array.isArray(cfg[sectionKey])
        ) {
          cfg[sectionKey] = {};
        }
        const nestedKeys = CONFIG_REPLACE_NESTED_FIELDS[sectionKey] ?? [];
        this.mergeSection(
          cfg[sectionKey] as Record<string, unknown>,
          patch as Record<string, unknown>,
          nestedKeys,
        );
      } else {
        cfg[sectionKey] = sectionPatch;
      }
    }
  }

  /** 读取全部配置（含 schema 版本，仅管理员可见；敏感字段脱敏） */
  getAll(): AppConfigData & { _version: number; _configUpdatedAt?: string } {
    const raw = structuredClone(this.config) as unknown as Record<string, unknown>;
    this.maskSensitiveFields(raw);
    const updatedAt = this.configUpdatedAt?.toISOString();
    return {
      ...(raw as unknown as AppConfigData),
      _version: APP_CONFIG_SCHEMA_VERSION,
      ...(updatedAt ? { _configUpdatedAt: updatedAt } : {}),
    };
  }

  /** 读取未脱敏配置（仅服务内部使用） */
  getAllRaw(): AppConfigData {
    return structuredClone(this.config);
  }

  /** 读取审计日志前 N 条（limit 上限为 configAuditMaxEntries） */
  getAuditLog(limit = 50): ConfigAuditEntry[] {
    return this.auditLog.slice(0, Math.min(limit, this.getMaxAudit()));
  }

  /** 分页读取审计日志（page 从 1 起，pageSize 上限 100） */
  getAuditLogPaginated(page = 1, pageSize = 20) {
    const max = this.getMaxAudit();
    const total = Math.min(this.auditLog.length, max);
    const safePage = Math.max(1, page);
    const safeSize = Math.min(Math.max(pageSize, 1), 100);
    const start = (safePage - 1) * safeSize;
    const items = this.auditLog.slice(start, start + safeSize);
    return buildPaginatedResult(items, total, safePage, safeSize);
  }

  /** 对外下发前递归脱敏敏感字段（password/token/secret 等） */
  private maskSensitiveFields(obj: Record<string, unknown>) {
    maskSensitiveFieldsByKey(obj);
  }

  /** 对比更新前后配置，收集发生变化的分区与键，生成审计条目 */
  private collectChanges(
    before: AppConfigData,
    after: AppConfigData,
    sections: string[],
  ): ConfigAuditEntry[] {
    const entries: ConfigAuditEntry[] = [];
    const at = new Date().toISOString();
    for (const section of sections) {
      const prev = (before as unknown as Record<string, unknown>)[section];
      const next = (after as unknown as Record<string, unknown>)[section];
      if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') continue;
      const keys: string[] = [];
      for (const key of Object.keys(next)) {
        const a = (prev as Record<string, unknown>)[key];
        const b = (next as Record<string, unknown>)[key];
        if (JSON.stringify(a) !== JSON.stringify(b)) keys.push(key);
      }
      if (keys.length) entries.push({ at, section, keys, action: 'update' });
    }
    return entries;
  }

  /** 将审计条目写入内存日志头部并裁剪至最大条数，异步持久化至 RuntimeKv */
  private pushAudit(entries: ConfigAuditEntry[]) {
    if (!entries.length) return;
    this.auditLog.unshift(...entries);
    const max = this.getMaxAudit();
    if (this.auditLog.length > max) {
      this.auditLog.length = max;
    }
    void this.persistAuditLog();
  }

  /** 将当前审计日志 upsert 至 RuntimeKv（CONFIG_AUDIT_STORAGE_ID），失败仅告警不抛错 */
  private async persistAuditLog() {
    if (!this.config.ops?.configAuditPersistEnabled) return;
    try {
      const data = this.auditLog.slice(0, this.getMaxAudit());
      await this.prisma.runtimeKv.upsert({
        where: { id: CONFIG_AUDIT_STORAGE_ID },
        create: { id: CONFIG_AUDIT_STORAGE_ID, data: data as unknown as Prisma.InputJsonValue },
        update: { data: data as unknown as Prisma.InputJsonValue },
      });
    } catch (err) {
      this.logger.warn(`持久化配置审计失败: ${(err as Error).message}`);
    }
  }

  /** 读取可公开（免鉴权）下发给前端的安全分区 */
  getPublic(): Partial<AppConfigData> & { _version: number } {
    const out: Record<string, unknown> = { _version: APP_CONFIG_SCHEMA_VERSION };
    for (const section of PUBLIC_CONFIG_SECTIONS) {
      out[section] = structuredClone(this.config[section]);
    }
    const voice = out.voice as
      | (AppConfigData['voice'] & {
          rooms?: string[];
          /** 运行时镜像 external.ttsMediaPlayerId，供前端公开配置消费 */
          ttsMediaPlayerId?: string;
          /** 运行时镜像 external.ttsMediaPlayerIds，供前端公开配置消费 */
          ttsMediaPlayerIds?: string[];
        })
      | undefined;
    if (voice) {
      voice.ttsMediaPlayerId = this.config.external.ttsMediaPlayerId || '';
      voice.ttsMediaPlayerIds = this.config.external.ttsMediaPlayerIds || [];
      voice.rooms = resolveVoiceRooms(this.config.envSensorMap).map((r) => r.label);
    }
    out.roomMeta = buildPublicRoomMeta(this.config.envSensorMap);
    out.wsPush = {
      coldEntityOnDemand: this.config.wsPush.coldEntityOnDemand,
      roomBatchEmit: this.config.wsPush.roomBatchEmit,
    };
    out.eventLog = buildEventLogPublicMeta(
      this.config.retention?.eventLog ?? this.config.other.eventlogRetentionDays,
      {
        eventLogTimelineMax: this.config.ops.eventLogTimelineMax,
        eventLogTimelineHours: this.config.ops.eventLogTimelineHours,
        eventLogOverlayHours: this.config.ops.eventLogOverlayHours,
      },
    );
    out.energy = buildEnergyPublicMeta(this.config.energy.learningPeriodDays);
    out.orchestrator = {
      executionHistoryLimit: resolveOrchestratorHistoryLimit(this.config.ops),
    };
    out.intelligence = {
      recommendationMaxPending: this.config.intelligence.recommendationMaxPending,
    };
    out.guest = {
      defaultHours: this.config.other.guestPassDefaultHours,
      extendHours: this.config.other.guestPassExtendHours,
    };
    out.security = {
      sensorAlertCooldownSec: this.config.security.sensorAlertCooldownSec,
      armExitGraceSeconds: this.config.security.armExitGraceSeconds,
    };
    out.automation = {
      defaultRunOnHa: Boolean(this.config.automation.defaultRunOnHa),
    };
    out.clientPowerWake = buildClientPowerWakePublic(this.config.clientPower);
    const tipActions = this.config.other?.advisorTipActions as
      Record<string, { id?: string }> | undefined;
    out.other = {
      advisorTipActionsBound: Object.keys(tipActions || {}).filter((k) =>
        tipActions?.[k]?.id?.trim(),
      ),
    };
    return out as Partial<AppConfigData> & { _version: number };
  }

  /** 按区域读取（类型安全） */
  get<K extends keyof AppConfigData>(section: K): AppConfigData[K] {
    const fallback = DEFAULT_APP_CONFIG[section];
    const value = this.config[section] ?? fallback;
    if (value === undefined) {
      return structuredClone(fallback);
    }
    const cached = this.sectionCache.get(section);
    if (cached && cached.gen === this.configGeneration) {
      return cached.value as AppConfigData[K];
    }
    let cloned: AppConfigData[K];
    try {
      cloned = structuredClone(value);
    } catch {
      cloned = structuredClone(fallback);
    }
    this.sectionCache.set(section, { gen: this.configGeneration, value: cloned });
    return cloned;
  }

  /** 按区域读取（别名，语义更清晰） */
  getSection<K extends keyof AppConfigData>(section: K): AppConfigData[K] {
    return this.get(section);
  }

  /** 家庭本地 IANA 时区；未配置时返回 undefined（调用方回退进程本地时区） */
  getHomeTimezone(): string | undefined {
    const tz = this.get('ops').homeTimezone?.trim();
    return tz || undefined;
  }

  /** 按实体规模热更新 WS 批处理参数（不持久化） */
  applyRuntimePerfTuning(entityCount: number): boolean {
    const changed = applyAdaptiveBackendPerfInPlace(this.config, entityCount);
    if (changed) this.bumpConfigGeneration();
    return changed;
  }

  /** 恢复默认值（整体或指定分区）并持久化 */
  async reset(section?: keyof AppConfigData) {
    if (section !== undefined && !(section in DEFAULT_APP_CONFIG)) {
      badRequest(API_ERROR.VALIDATION_CONFIG_SECTION_INVALID(section));
    }
    const sections = section ? [section] : Object.keys(this.config);
    this.pushAudit(
      sections.map((s) => ({
        at: new Date().toISOString(),
        section: String(s),
        keys: ['*'],
        action: 'reset' as const,
      })),
    );
    if (section) {
      (this.config as Record<keyof AppConfigData, AppConfigData[keyof AppConfigData]>)[section] =
        structuredClone(DEFAULT_APP_CONFIG[section]);
    } else {
      this.config = structuredClone(DEFAULT_APP_CONFIG);
    }
    this.bumpConfigGeneration();
    await this.persist();
    this.eventBus.emit(APP_CONFIG_UPDATED, section ? [section] : Object.keys(this.config));
    return this.getAll();
  }

  /** 更新配置并持久化，广播变更分区供各服务热更新 */
  async update(partial: DeepPartialAppConfigData, opts?: { expectedUpdatedAt?: string }) {
    const before = structuredClone(this.config);
    const stripped = stripMaskedPlaceholders(partial);
    const changedSections = Object.keys(stripped);
    if (!changedSections.length) return;
    validateAppConfigPartial(
      stripped as DeepPartialAppConfigData,
      this.config as unknown as Record<string, unknown>,
    );
    const toMerge = { ...stripped } as Record<string, unknown>;
    const cfg = this.config as unknown as Record<string, unknown>;
    const replacedSections = new Set<string>();
    for (const section of CONFIG_REPLACE_ON_UPDATE_SECTIONS) {
      if (!(section in toMerge)) continue;
      cfg[section] = structuredClone(toMerge[section]);
      replacedSections.add(section);
    }
    const toMergeRest = Object.fromEntries(
      Object.entries(toMerge).filter(([key]) => !replacedSections.has(key)),
    );
    if (Object.keys(toMergeRest).length) {
      this.mergePartialConfig(cfg, toMergeRest);
    }
    if (changedSections.includes('clientPower')) {
      restoreClientPowerReportTokens(this.config.clientPower, before.clientPower);
      if (ensureClientPowerReportTokens(this.config.clientPower)) {
        this.logger.log('已为客户端充放电策略自动生成 reportToken');
      }
    }
    // 合并后补全缺失的嵌套默认字段（仅补缺失键，不覆盖用户值），再审计并持久化
    this.migrateMissingSections();
    this.pushAudit(this.collectChanges(before, this.config, changedSections));
    this.bumpConfigGeneration();
    try {
      await this.persist(opts?.expectedUpdatedAt);
    } catch (err) {
      // 乐观锁冲突：回滚内存配置并抛错，避免内存与 DB 分裂
      this.config = structuredClone(before);
      this.migrateMissingSections();
      this.bumpConfigGeneration();
      throw err;
    }
    this.eventBus.emit(APP_CONFIG_UPDATED, changedSections);
  }

  /** 全量替换配置（import replace），需已通过校验；脱敏占位符字段保留当前真实值 */
  async replaceAll(next: AppConfigData) {
    const merged = applyImportReplacePreservingSecrets(
      next as unknown as Record<string, unknown>,
      this.config as unknown as Record<string, unknown>,
    ) as unknown as AppConfigData;
    this.config = structuredClone(merged);
    this.migrateMissingSections();
    this.bumpConfigGeneration();
    this.pushAudit([
      {
        at: new Date().toISOString(),
        section: '*',
        keys: ['import-replace'],
        action: 'update',
      },
    ]);
    await this.persist();
    this.eventBus.emit(APP_CONFIG_UPDATED, Object.keys(this.config));
    return this.getAll();
  }

  /** 导出未脱敏配置（admin backup） */
  exportRaw(): AppConfigData {
    return structuredClone(this.config);
  }

  /**
   * 持久化配置（乐观锁原子化）。
   *
   * 带 expectedUpdatedAt 时执行单条条件 UPDATE（WHERE id AND updatedAt = $expected），
   * 命中数 0 即判定冲突：避免「先查 revision 再 upsert」两步间的竞态，
   * 多实例并发更新时后提交者无法覆盖他人已提交的修改。
   */
  private async persist(expectedUpdatedAt?: string) {
    try {
      if (expectedUpdatedAt) {
        const expectedDate = new Date(expectedUpdatedAt);
        if (Number.isNaN(expectedDate.getTime())) {
          badRequest('expectedUpdatedAt 不是有效时间');
        }
        const res = await this.prisma.systemConfig.updateMany({
          where: { id: 'default', updatedAt: expectedDate },
          data: { data: this.config as unknown as Prisma.InputJsonValue },
        });
        if (res.count === 0) {
          throw new BusinessException(ErrorCode.CONFLICT, '配置已被他人修改，请刷新后重试');
        }
        // updateMany 不返回记录，读取落库后的 updatedAt 作为新 revision
        const record = await this.prisma.systemConfig.findUnique({
          where: { id: 'default' },
          select: { updatedAt: true },
        });
        this.configUpdatedAt = record?.updatedAt ?? new Date();
        return;
      }
      const record = await this.prisma.systemConfig.upsert({
        where: { id: 'default' },
        create: { id: 'default', data: this.config as unknown as Prisma.InputJsonValue },
        update: { data: this.config as unknown as Prisma.InputJsonValue },
      });
      this.configUpdatedAt = record.updatedAt;
    } catch (err) {
      // 乐观锁冲突 / 参数校验等业务异常不可包成 DB_ERROR，否则前端收到 500 而非 409/400
      rethrowIfHttpException(err);
      const msg = (err as Error).message;
      this.logger.error(`保存系统配置失败: ${msg}`);
      throw new BusinessException(ErrorCode.DB_ERROR, `保存系统配置失败: ${msg}`);
    }
  }
}
