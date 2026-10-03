/**
 * 场景定时调度服务
 *
 * 职责：
 * - 场景定时条目的 CRUD（持久化到 SceneSchedule 表）
 * - 定时扫描到期条目并触发 SceneService.execute
 * - 按分钟去重、仅 HA-WS Leader 执行，避免多副本双触发
 *
 * 依赖：PrismaService、AppConfigService、JobRegistryService、HaWsLeaderService。
 * SceneService 经 ModuleRef 惰性解析，避免与 scene/service 的 CommonJS 循环依赖。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { normalizeHomeModeTimeAt } from '@homeos/shared';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import { badRequest } from '../../common/utils/business-exception';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { parseJsonArray, toInputJson } from '../../common/utils/json-field.util';
import {
  isSceneScheduleDue,
  isValidCron,
  sceneScheduleFireKey,
  type SceneScheduleItem,
} from './scene-schedule.util';

@Injectable()
/**
 * SceneScheduleService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class SceneScheduleService
 */
export class SceneScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SceneScheduleService.name);

  /** 场景定时扫描周期：30 秒（按分钟粒度去重，周期 < 1 分钟不会重复触发） */
  private static readonly SCENE_SCHEDULE_SCAN_INTERVAL_MS = 30_000;

  /** 场景定时条目（内存缓存，变更即持久化到 SceneSchedule 表） */
  private sceneSchedules: SceneScheduleItem[] = [];
  /** 已触发去重 key（sceneId → 最近触发分钟 key），防止同一分钟重复执行 */
  private readonly sceneScheduleLastFire = new Map<string, string>();
  /** 场景定时扫描定时器 */
  private sceneScheduleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly jobs: JobRegistryService,
    private readonly haLeader: HaWsLeaderService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** 惰性解析 SceneService，打断与 service.ts 的顶层互相 require */
  private async getSceneService() {
    const { SceneService } = await import('./service');
    return this.moduleRef.get(SceneService, { strict: false });
  }

  /** 恢复场景定时配置并启动定时扫描 */
  onModuleInit() {
    void this.loadSceneSchedules().catch((err) => {
      this.logger.warn(`加载场景定时配置失败: ${getErrorMessage(err)}`);
    });
    this.sceneScheduleTimer = setInterval(() => {
      void this.jobs
        .run(
          'scene-schedule-scan',
          {
            description: '场景定时调度扫描',
            intervalMs: SceneScheduleService.SCENE_SCHEDULE_SCAN_INTERVAL_MS,
          },
          () => this.runScheduledScenes(),
        )
        .catch(() => {
          // jobs.run 已记录错误，避免 unhandled rejection
        });
    }, SceneScheduleService.SCENE_SCHEDULE_SCAN_INTERVAL_MS);
    this.sceneScheduleTimer.unref?.();
  }

  /** 停止定时扫描并清空去重缓存 */
  onModuleDestroy() {
    if (this.sceneScheduleTimer) {
      clearInterval(this.sceneScheduleTimer);
      this.sceneScheduleTimer = null;
    }
    this.sceneScheduleLastFire.clear();
  }

  /** 将单条场景定时写入 SceneSchedule 表，失败时抛错（避免 API 误报成功） */
  private async persistSceneSchedule(item: SceneScheduleItem) {
    try {
      const days = toInputJson(item.days ?? [], []);
      await this.prisma.sceneSchedule.upsert({
        where: { sceneId: item.sceneId },
        create: {
          sceneId: item.sceneId,
          sceneName: item.sceneName ?? '',
          cron: item.cron ?? null,
          at: item.at ?? null,
          days,
          enabled: item.enabled,
        },
        update: {
          sceneName: item.sceneName ?? '',
          cron: item.cron ?? null,
          at: item.at ?? null,
          days,
          enabled: item.enabled,
        },
      });
    } catch (err) {
      this.logger.warn(`持久化场景定时配置失败: ${getErrorMessage(err)}`);
      throw new BusinessException(ErrorCode.DB_ERROR, API_ERROR.SCENE_SCHEDULE_PERSIST_FAILED);
    }
  }

  private rowToItem(row: {
    sceneId: string;
    sceneName: string;
    cron: string | null;
    at: string | null;
    days: unknown;
    enabled: boolean;
  }): SceneScheduleItem {
    const days = parseJsonArray<number>(row.days).filter(
      (d) => Number.isInteger(d) && d >= 0 && d <= 6,
    );
    return {
      sceneId: row.sceneId,
      sceneName: row.sceneName || undefined,
      cron: row.cron || undefined,
      at: row.at || undefined,
      days: days.length ? days : undefined,
      enabled: row.enabled,
    };
  }

  /** 服务启动时从 SceneSchedule 表恢复到内存 */
  private async loadSceneSchedules() {
    const rows = await this.prisma.sceneSchedule.findMany({ take: 500 });
    this.sceneSchedules = rows.map((r) => this.rowToItem(r));
    if (this.sceneSchedules.length) {
      this.logger.log(`已恢复场景定时配置: ${this.sceneSchedules.length} 条`);
    }
  }

  /** 场景定时条目列表（仅启用或含有效触发方式的项） */
  async listSceneSchedules(): Promise<SceneScheduleItem[]> {
    return this.sceneSchedules.map((s) => ({ ...s }));
  }

  /**
   * 新增 / 更新场景定时条目。
   * cron 与 at 至少填一项（cron 优先）；校验 cron 5 段、at HH:mm、days 0-6。
   */
  async upsertSceneSchedule(input: {
    sceneId: string;
    sceneName?: string;
    cron?: string;
    at?: string;
    days?: number[];
    enabled?: boolean;
  }): Promise<SceneScheduleItem> {
    const sceneId = String(input?.sceneId || '').trim();
    if (!sceneId) badRequest(API_ERROR.VALIDATION_ID_REQUIRED);
    const scene = await (await this.getSceneService()).findOne(sceneId);
    if (!scene) throw new BusinessException(ErrorCode.NOT_FOUND, API_ERROR.SCENE_NOT_FOUND);
    const sceneRecord = scene as Record<string, unknown>;

    const cron = String(input.cron ?? '').trim();
    const at = String(input.at ?? '').trim();
    if (!cron && !at) badRequest(API_ERROR.SCENE_SCHEDULE_INVALID);
    if (cron && !isValidCron(cron)) badRequest(API_ERROR.SCENE_SCHEDULE_INVALID_CRON);
    if (at && !normalizeHomeModeTimeAt(at)) badRequest(API_ERROR.SCENE_SCHEDULE_INVALID_AT);
    if (input.days !== undefined && !Array.isArray(input.days)) {
      badRequest(API_ERROR.SCENE_SCHEDULE_INVALID_DAYS);
    }
    if (
      Array.isArray(input.days) &&
      !input.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ) {
      badRequest(API_ERROR.SCENE_SCHEDULE_INVALID_DAYS);
    }

    const item: SceneScheduleItem = {
      sceneId,
      sceneName: String(input.sceneName || sceneRecord.name || sceneId),
      cron: cron || undefined,
      at: at ? normalizeHomeModeTimeAt(at) ?? undefined : undefined,
      days: Array.isArray(input.days) && input.days.length > 0 ? [...new Set(input.days)] : undefined,
      enabled: input.enabled !== false,
    };
    const idx = this.sceneSchedules.findIndex((s) => s.sceneId === sceneId);
    if (idx >= 0) this.sceneSchedules[idx] = item;
    else this.sceneSchedules.push(item);
    this.sceneScheduleLastFire.delete(sceneId);
    await this.persistSceneSchedule(item);
    return { ...item };
  }

  /** 删除场景定时条目 */
  async removeSceneSchedule(sceneId: string): Promise<{ removed: boolean }> {
    const before = this.sceneSchedules.length;
    this.sceneSchedules = this.sceneSchedules.filter((s) => s.sceneId !== sceneId);
    this.sceneScheduleLastFire.delete(sceneId);
    if (this.sceneSchedules.length === before) {
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.SCENE_SCHEDULE_NOT_FOUND);
    }
    try {
      await this.prisma.sceneSchedule.deleteMany({ where: { sceneId } });
    } catch (err) {
      this.logger.warn(`删除场景定时配置失败: ${getErrorMessage(err)}`);
      throw new BusinessException(ErrorCode.DB_ERROR, API_ERROR.SCENE_SCHEDULE_PERSIST_FAILED);
    }
    return { removed: true };
  }

  /** 定时扫描：对到期条目执行场景（按分钟去重），仅 HA-WS Leader 执行，避免多副本双触发 */
  async runScheduledScenes(): Promise<{ fired: number; failed: number }> {
    if (!this.haLeader.isHaWsLeader()) return { fired: 0, failed: 0 };
    const now = new Date();
    const tz = this.appConfig.getHomeTimezone();
    let fired = 0;
    let failed = 0;
    for (const item of this.sceneSchedules) {
      if (!isSceneScheduleDue(item, now, tz)) continue;
      const key = sceneScheduleFireKey(item, now, tz);
      if (this.sceneScheduleLastFire.get(item.sceneId) === key) continue;
      this.sceneScheduleLastFire.set(item.sceneId, key);
      try {
        const result = await (await this.getSceneService()).execute(item.sceneId);
        fired++;
        this.logger.log(
          `场景定时触发 [${item.sceneName || item.sceneId}]:${result.executed}/${result.total} 成功`,
        );
      } catch (err) {
        failed++;
        this.logger.warn(
          `场景定时触发失败 [${item.sceneName || item.sceneId}]: ${getErrorMessage(err)}`,
        );
        // 触发失败：清除去重 key，下次扫描可重试
        this.sceneScheduleLastFire.delete(item.sceneId);
      }
    }
    return { fired, failed };
  }
}
