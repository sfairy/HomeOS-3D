/**
 * @file recommendation.service.ts
 * @module awareness
 * @description 习惯学习与推荐挖掘服务。定时（Cron 每天 03:00）从执行历史挖掘
 * 高频场景执行时段、自动化定时模式、手动控制重复模式与家庭模式触发缺口，
 * 生成可采纳/忽略的推荐（Recommendation），并支持草稿 YAML 占位实体替换。
 *
 * 依赖：
 * - PrismaService：sceneExecution / automationExecution / commandAudit / recommendation 读写。
 * - AppConfigService：intelligence.recommendationMiningEnabled 开关与 maxPending 配置。
 * - StateStoreService：实体列表，用于占位实体建议。
 * - @homeos/shared：YAML 占位符构建与替换工具。
 * - stats.util：bucketHourDow / findDominantHour 聚合工具。
 */
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { notFound } from '../../common/utils/business-exception';
import { Cron } from '@nestjs/schedule';
import { AppConfigService } from '../../shared/app-config/service';
import { PrismaService } from '../../shared/prisma/service';
import type { RecommendationStatus } from '../../generated/prisma/client';
import { cloneJsonPayload } from '../../shared/prisma/runtime-kv.util';
import { bucketHourDow, findDominantHour } from '../../common/utils/stats.util';
import { readJsonArray } from '../../common/utils/json-field.util';
import { buildPlaceholderSuggestions, findReplaceableEntityIdsInYaml, getEntityDomain, replaceEntityIdsInYaml } from '@homeos/shared';
import { StateStoreService } from '../state-store/service';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';

/** 推荐项 DTO（面向前端展示） */
interface RecommendationDto {
  id: string;
  type: string;
  title: string;
  payload: Record<string, unknown>;
  score: number;
  status: string;
  createdAt: Date;
  draftYaml?: string;
  /** 推荐依据（哪段历史、多少样本） */
  basis?: string;
}

/**
 * 习惯学习 — 从执行历史挖掘高频模式并生成推荐
 */
@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly stateStore: StateStoreService,
    private readonly lock: DistributedLockService,
  ) {}

/** pending 推荐数量上限：取 intelligence.recommendationMaxPending，限幅 1–100，默认 20 */
  private get maxPending(): number {
    const intel = this.appConfig.get('intelligence');
    const n = intel?.recommendationMaxPending;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100) : 20;
  }

  /** 实体展示名：优先 HA friendly_name，否则 object_id */
  private resolveEntityDisplayName(entityId: string): string {
    const id = String(entityId || '').trim();
    if (!id) return '';
    const direct = this.stateStore.getById(id);
    const fromDirect = String(direct?.attributes?.friendly_name || '').trim();
    if (fromDirect) return fromDirect;
    // 审计里偶发域不一致时，按 object_id 兜底查找
    const slug = id.includes('.') ? id.split('.').pop() || '' : id;
    if (slug) {
      const hit = this.stateStore.getAll().find((e) => {
        const eid = String(e.entity_id || '');
        return eid === id || eid.endsWith(`.${slug}`);
      });
      const fromHit = String(hit?.attributes?.friendly_name || '').trim();
      if (fromHit) return fromHit;
    }
    return slug || id;
  }

  /**
   * 将标题 / YAML alias 中的 object_id 换成友好名；保留 actions 里的 entity_id 不变。
   */
  private withFriendlyEntityLabels(
    title: string,
    draftYaml: string | undefined,
    entityId: string,
  ): { title: string; draftYaml?: string } {
    const display = this.resolveEntityDisplayName(entityId);
    const slug = entityId.split('.').pop() || entityId;
    if (!display || display === slug) {
      return { title, draftYaml };
    }
    const nextTitle = title.includes(slug) ? title.split(slug).join(display) : title;
    let nextYaml = draftYaml;
    if (nextYaml) {
      nextYaml = nextYaml.replace(/^(alias:\s*")([^"]*)(")/m, (_m, prefix: string, mid: string, suffix: string) =>
        `${prefix}${mid.includes(slug) ? mid.split(slug).join(display) : mid}${suffix}`,
      );
    }
    return { title: nextTitle, draftYaml: nextYaml };
  }

  @Cron('0 3 * * *')
  async minePatterns() {
    if (!this.appConfig.get('intelligence')?.recommendationMiningEnabled) return;
    try {
      await this.lock.runExclusive(
        'recommendation-mining',
        async () => {
          // 先扫描已采纳推荐的结果：若生成的自动化被删除/停用，视为负反馈并转为 dismissed，
          // 使同一模式不会再被推荐（增量学习）
          await this.sweepAdoptedOutcomes();
          await this.trimPendingIfNeeded();
          const dismissed = await this.loadDismissedPatternCounts();
          await this.mineScenePatterns(dismissed);
          await this.mineAutomationPatterns(dismissed);
          await this.mineManualControlPatterns(dismissed);
          await this.mineModeTriggers(dismissed);
        },
        45 * 60_000,
      );
    } catch (err) {
      if (err instanceof ConflictException) {
        const msg = String((err as ConflictException).message || '');
        this.logger.debug(
          msg.includes(API_ERROR.LOCK_REDIS_UNAVAILABLE)
            ? '跳过习惯推荐挖掘:多副本下 Redis 锁不可用'
            : '跳过习惯推荐挖掘:其他实例持有锁',
        );
        return;
      }
      this.logger.warn(`习惯推荐挖掘失败: ${(err as Error).message}`);
    }
  }

  /**
   * 采纳结果扫描：对被采纳且已生成自动化的推荐，检查自动化是否仍启用。
   * 若用户删除或停用了采纳生成的自动化，则将该推荐转为 dismissed 并累计负反馈次数，
   * 后续挖掘不会再推荐同一模式（增量学习闭环）。
   */
  private async sweepAdoptedOutcomes() {
    try {
      const rows = await this.prisma.recommendation.findMany({
        where: { status: 'adopted' },
        select: { id: true, type: true, payload: true },
        take: 500,
      });
      const candidates = rows
        .map((r) => {
          const p = (r.payload ?? {}) as Record<string, unknown>;
          const createdId =
            r.type === 'automation' && typeof p.createdAutomationId === 'string'
              ? p.createdAutomationId
              : '';
          return createdId ? { r, p, createdId } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      if (!candidates.length) return;

      const autoIds = [...new Set(candidates.map((c) => c.createdId))];
      const autos = await this.prisma.automation.findMany({
        where: { id: { in: autoIds } },
        select: { id: true, enabled: true },
        take: autoIds.length,
      });
      const autoById = new Map(autos.map((a) => [a.id, a]));
      const now = new Date();

      for (const { r, p, createdId } of candidates) {
        const auto = autoById.get(createdId);
        if (auto?.enabled) continue;
        const dismissedCount = (Number(p.dismissedCount) || 0) + 1;
        await this.prisma.recommendation.update({
          where: { id: r.id },
          data: {
            status: 'dismissed',
            updatedAt: now,
            payload: cloneJsonPayload({
              ...p,
              dismissedCount,
              adoptedOutcome: auto ? 'disabled' : 'removed',
            }),
          },
        });
        this.logger.log(
          `采纳结果负反馈:自动化 ${createdId} ${auto ? '被停用' : '已删除'},模式转为 dismissed`,
        );
      }
    } catch (err) {
      this.logger.warn(`采纳结果扫描失败: ${(err as Error).message}`);
    }
  }

  /**
   * 聚合已被 dismiss 的模式及其累计负反馈次数。
   * 键规则：scene:{sceneId} / mode:{modeId} / automation:{automationId} / entity:{entityId}:{hour}
   * 挖掘时跳过累计次数 >= 2 的模式，避免向用户反复推荐已拒绝的内容。
   */
  private async loadDismissedPatternCounts(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    try {
      const rows = await this.prisma.recommendation.findMany({
        where: { status: 'dismissed' },
        select: { type: true, payload: true },
        take: 1000,
      });
      for (const r of rows) {
        const p = (r.payload ?? {}) as Record<string, unknown>;
        const count = Math.max(1, Number(p.dismissedCount) || 1);
        let key = '';
        if (r.type === 'scene' && p.sceneId) key = `scene:${String(p.sceneId)}`;
        else if (r.type === 'home_mode' && p.modeId) key = `mode:${String(p.modeId)}`;
        else if (r.type === 'automation' && p.automationId) key = `automation:${String(p.automationId)}`;
        else if (r.type === 'automation' && p.entityId && p.hour != null)
          key = `entity:${String(p.entityId)}:${Number(p.hour)}`;
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + count);
      }
    } catch (err) {
      this.logger.warn(`加载已拒绝模式失败: ${(err as Error).message}`);
    }
    return counts;
  }

  /** 累计负反馈 >= 该次数时不再推荐同一模式 */
  private static readonly DISMISS_RECOMMEND_THRESHOLD = 2;

  private isPatternRejected(dismissed: Map<string, number>, key: string): boolean {
    return (dismissed.get(key) || 0) >= RecommendationService.DISMISS_RECOMMEND_THRESHOLD;
  }

/**
   * 裁剪 pending 推荐至 maxPending 上限，移除最旧的条目。
   */
  private async trimPendingIfNeeded() {
    const max = this.maxPending;
    const count = await this.prisma.recommendation.count({ where: { status: 'pending' } });
    if (count <= max) return;
    const excess = await this.prisma.recommendation.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: count - max,
    });
    if (excess.length === 0) return;
    await this.prisma.recommendation.deleteMany({
      where: { id: { in: excess.map((r) => r.id) } },
    });
    this.logger.log(`习惯推荐 pending 已裁剪至 ${max} 条(移除 ${excess.length} 条最旧)`);
  }

  /** 挖掘高频场景执行时段 */
  private async mineScenePatterns(dismissed: Map<string, number>) {
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await this.prisma.sceneExecution.findMany({
      where: { executedAt: { gte: since }, success: true },
      select: { sceneId: true, sceneName: true, executedAt: true },
      orderBy: { executedAt: 'desc' },
      take: 5000,
    });
    const buckets = new Map<string, { name: string; hours: number[] }>();
    for (const r of rows) {
      const hour = r.executedAt.getHours();
      let bucket = buckets.get(r.sceneId);
      if (!bucket) {
        bucket = { name: r.sceneName, hours: [] };
        buckets.set(r.sceneId, bucket);
      }
      bucket.hours.push(hour);
    }
    const candidates: Array<{
      type: string;
      title: string;
      score: number;
      payload: Record<string, unknown>;
    }> = [];
    for (const [sceneId, { name, hours }] of buckets) {
      if (this.isPatternRejected(dismissed, `scene:${sceneId}`)) continue;
      const dominant = findDominantHour(hours, { minSamples: 3, minScore: 0.4 });
      if (!dominant) continue;
      candidates.push({
        type: 'scene',
        title: `建议在 ${String(dominant.hour).padStart(2, '0')}:00 自动执行「${name}」`,
        score: dominant.score,
        payload: {
          sceneId,
          suggestedHour: dominant.hour,
          pattern: 'hourly_repeat',
          evidence: {
            source: 'scene_execution',
            windowDays: 30,
            sampleCount: hours.length,
            dominantHour: dominant.hour,
            summary: `依据近 30 天 ${hours.length} 次场景执行，约 ${Math.round(dominant.score * 100)}% 发生在 ${String(dominant.hour).padStart(2, '0')}:00`,
          },
        },
      });
    }
    await this.createRecommendationsBatch(candidates);
  }

/**
   * 挖掘自动化定时模式。
   *
   * 从近 30 天成功执行的自动化记录中，按 automationId 聚合 dow:hour，
   * 若某 dow:hour 占比 ≥ 35% 且样本 ≥ 5，生成定时自动化推荐（含草稿 YAML）。
   */
  private async mineAutomationPatterns(dismissed: Map<string, number>) {
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await this.prisma.automationExecution.findMany({
      where: { executedAt: { gte: since }, success: true },
      select: { automationId: true, name: true, executedAt: true },
      take: 5000,
    });
    const byAuto = new Map<string, { name: string; dowHours: string[] }>();
    for (const r of rows) {
      const { hour, dow } = bucketHourDow(r.executedAt);
      let auto = byAuto.get(r.automationId);
      if (!auto) {
        auto = { name: r.name, dowHours: [] };
        byAuto.set(r.automationId, auto);
      }
      auto.dowHours.push(`${dow}:${hour}`);
    }
    const candidates: Array<{
      type: string;
      title: string;
      score: number;
      payload: Record<string, unknown>;
    }> = [];
    for (const [automationId, { name, dowHours }] of byAuto) {
      if (this.isPatternRejected(dismissed, `automation:${automationId}`)) continue;
      if (dowHours.length < 5) continue;
      const freq = new Map<string, number>();
      for (const dh of dowHours) freq.set(dh, (freq.get(dh) || 0) + 1);
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top || top[1] / dowHours.length < 0.35) continue;
      const [dow, hour] = top[0].split(':');
      const title = `「${name}」常在周${dow} ${hour}点运行，可设为定时自动化`;
      const draftYaml = `alias: "推荐: ${name} 定时"
description: "由习惯推荐生成（本地引擎）；请确认 weekday 与触发时间"
# homeos_meta: run_on_ha=false local_automation_uuid
triggers:
  - platform: time
    at: "${String(hour).padStart(2, '0')}:00:00"
    weekday:
      - ${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][Number(dow)]}
conditions: []
actions:
  - service: automation.trigger
    entity_id: ${automationId}
`;
      candidates.push({
        type: 'automation',
        title,
        score: top[1] / dowHours.length,
        payload: {
          automationId,
          dow: Number(dow),
          hour: Number(hour),
          draftYaml,
          evidence: {
            source: 'automation_execution',
            windowDays: 30,
            sampleCount: dowHours.length,
            dow: Number(dow),
            hour: Number(hour),
            summary: `依据近 30 天 ${dowHours.length} 次自动化执行，周${dow} ${hour}点出现 ${top[1]} 次`,
          },
        },
      });
    }
    await this.createRecommendationsBatch(candidates);
  }

  /**
   * 从重复手动控制（同实体同时段）挖掘简易自动化。
   *
   * 从近 30 天 commandAudit 中按 entityId+service 聚合执行小时，
   * 使用 findDominantHour 找出主导时段（minSamples=4, minScore=0.35），
   * 生成定时自动化推荐（含草稿 YAML），最多 8 条。
   */
  private async mineManualControlPatterns(dismissed: Map<string, number>) {
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await this.prisma.commandAudit.findMany({
      where: { createdAt: { gte: since }, success: true },
      select: { entityId: true, domain: true, service: true, createdAt: true },
      take: 8000,
    });
    const buckets = new Map<
      string,
      { entityId: string; domain: string; service: string; hours: number[] }
    >();
    for (const row of rows) {
      const entityId = String(row.entityId || '').trim();
      if (!entityId) continue;
      const domain = String(row.domain || '').trim() || getEntityDomain(entityId);
      if (!['light', 'switch', 'cover', 'climate', 'fan', 'media_player'].includes(domain))
        continue;
      const hour = row.createdAt.getHours();
      const key = `${entityId}\0${row.service || 'turn_on'}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { entityId, domain, service: String(row.service || 'turn_on'), hours: [] };
        buckets.set(key, bucket);
      }
      bucket.hours.push(hour);
    }
    const candidates: Array<{
      type: string;
      title: string;
      score: number;
      payload: Record<string, unknown>;
    }> = [];
    const existingManual = await this.prisma.recommendation.findMany({
      where: { status: 'pending', type: 'automation' },
      select: { payload: true },
      take: 500,
    });
    const existingManualKeys = new Set(
      existingManual.flatMap((r) => {
        const p = r.payload as Record<string, unknown> | null;
        if (!p || p.pattern !== 'manual_control' || p.entityId == null) return [];
        return [`${String(p.entityId)}\0${Number(p.hour)}`];
      }),
    );
    for (const { entityId, domain, service, hours } of buckets.values()) {
      const dominant = findDominantHour(hours, { minSamples: 4, minScore: 0.35 });
      if (!dominant) continue;
      const bestHour = dominant.hour;
      if (this.isPatternRejected(dismissed, `entity:${entityId}:${bestHour}`)) continue;
      if (existingManualKeys.has(`${entityId}\0${bestHour}`)) continue;
      const name = this.resolveEntityDisplayName(entityId);
      const draftYaml = `alias: "推荐: ${name} ${String(bestHour).padStart(2, '0')}点"
description: "由手动控制习惯推荐生成，请确认时间与动作"
triggers:
  - platform: time
    at: "${String(bestHour).padStart(2, '0')}:00:00"
conditions: []
actions:
  - service: ${domain}.${service.includes('.') ? service.split('.').pop() : service}
    target:
      entity_id: ${entityId}
`;
      candidates.push({
        type: 'automation',
        title: `「${name}」常在 ${String(bestHour).padStart(2, '0')}:00 手动控制，可设为定时自动化`,
        score: dominant.score,
        payload: {
          entityId,
          domain,
          service,
          hour: bestHour,
          pattern: 'manual_control',
          draftYaml,
          evidence: {
            source: 'command_audit',
            windowDays: 30,
            sampleCount: hours.length,
            hour: bestHour,
            summary: `依据近 30 天 ${hours.length} 次手动控制，约 ${Math.round(dominant.score * 100)}% 发生在 ${String(bestHour).padStart(2, '0')}:00`,
          },
        },
      });
    }
    await this.createRecommendationsBatch(candidates.slice(0, 8));
  }

  /**
   * 家庭模式触发条件挖掘：无自动触发但手动切换频繁。
   *
   * 扫描所有家庭模式，若 triggers 为空则生成「建议配置定时或传感器触发」推荐，
   * 固定 score=0.6，最多 5 条。
   */
  private async mineModeTriggers(dismissed: Map<string, number>) {
    const modes = await this.prisma.homeMode.findMany({
      select: { id: true, name: true, triggers: true },
      take: 50,
    });
    const candidates: Array<{
      type: string;
      title: string;
      score: number;
      payload: Record<string, unknown>;
    }> = [];
    for (const mode of modes) {
      if (this.isPatternRejected(dismissed, `mode:${mode.id}`)) continue;
      let triggerCount = 0;
      try {
        const parsed = mode.triggers ? readJsonArray(mode.triggers) : [];
        triggerCount = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        triggerCount = 0;
      }
      if (triggerCount > 0) continue;
      candidates.push({
        type: 'home_mode',
        title: `模式「${mode.name}」尚无自动触发，建议配置定时或传感器触发`,
        score: 0.6,
        payload: {
          modeId: mode.id,
          modeName: mode.name,
          pattern: 'missing_triggers',
          evidence: {
            source: 'home_mode',
            summary: '该模式当前没有自动触发条件',
          },
        },
      });
    }
    await this.createRecommendationsBatch(candidates.slice(0, 5));
  }

/**
   * 批量创建推荐，按 type+title 去重（仅与 pending 推荐比较）。
   *
   * @param candidates 候选推荐列表。
   * 副作用：写入 Recommendation 表。
   */
  private async createRecommendationsBatch(
    candidates: Array<{
      type: string;
      title: string;
      score: number;
      payload: Record<string, unknown>;
    }>,
  ) {
    if (!candidates.length) return;
    const existing = await this.prisma.recommendation.findMany({
      where: {
        status: 'pending',
        OR: candidates.map((c) => ({ type: c.type, title: c.title })),
      },
      select: { type: true, title: true },
      take: Math.max(candidates.length, 100),
    });
    const existingKeys = new Set(existing.map((r) => `${r.type}\0${r.title}`));
    const toCreate = candidates.filter((c) => !existingKeys.has(`${c.type}\0${c.title}`));
    if (!toCreate.length) return;
    await this.prisma.recommendation.createMany({
      data: toCreate.map((c) => ({
        type: c.type,
        title: c.title,
        score: c.score,
        payload: cloneJsonPayload(c.payload),
      })),
    });
  }

/**
   * 列出推荐。
   *
   * @param status 状态过滤（pending/dismissed/adopted），默认 pending。
   * @param limit 返回上限，默认 maxPending，最大 100。
   * @returns 推荐 DTO 列表；查询失败返回空数组。
   */
  async list(status = 'pending', limit?: number): Promise<RecommendationDto[]> {
    try {
      const take = limit && limit > 0 ? Math.min(limit, 100) : this.maxPending;
      const rows = await this.prisma.recommendation.findMany({
        where: status ? { status: status as RecommendationStatus } : undefined,
        orderBy: { score: 'desc' },
        take,
      });
      return rows.map((r) => {
        const payload = (r.payload ?? {}) as Record<string, unknown>;
        const entityId = typeof payload.entityId === 'string' ? payload.entityId : '';
        const rawDraft =
          typeof payload.draftYaml === 'string' ? String(payload.draftYaml) : undefined;
        const labeled =
          entityId && payload.pattern === 'manual_control'
            ? this.withFriendlyEntityLabels(r.title, rawDraft, entityId)
            : { title: r.title, draftYaml: rawDraft };
        const evidence =
          payload.evidence && typeof payload.evidence === 'object'
            ? (payload.evidence as { summary?: unknown })
            : null;
        const basis = typeof evidence?.summary === 'string' ? evidence.summary : undefined;
        return {
          id: r.id,
          type: r.type,
          title: labeled.title,
          payload: entityId
            ? { ...payload, ...(labeled.draftYaml ? { draftYaml: labeled.draftYaml } : {}) }
            : payload,
          score: r.score,
          status: r.status,
          createdAt: r.createdAt,
          draftYaml: labeled.draftYaml,
          basis,
        };
      });
    } catch (err) {
      this.logger.error(`列出推荐失败: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * 轻量习惯摘要：房间活跃高峰 + 待处理推荐数 + 离家灯光概率。
   *
   * 并行查询 ActivityBaseline / Recommendation / AwayPatternBucket，
   * 返回 topRooms（活跃高峰）、pendingCount、awayLightHints 与基线状态提示。
   *
   * @returns 习惯摘要对象；查询失败返回兜底空值。
   */
  async getHabitSummary() {
    try {
      const [baselines, pendingCount, awayBuckets] = await Promise.all([
        this.prisma.activityBaseline.findMany({
          orderBy: { activityScore: 'desc' },
          take: 24,
        }),
        this.prisma.recommendation.count({ where: { status: 'pending' } }),
        this.prisma.awayPatternBucket.findMany({
          orderBy: { lightOnProb: 'desc' },
          take: 6,
        }),
      ]);
      const roomPeaks = new Map<string, { hour: number; dow: number; score: number }>();
      for (const b of baselines) {
        const prev = roomPeaks.get(b.room);
        if (!prev || b.activityScore > prev.score) {
          roomPeaks.set(b.room, { hour: b.hour, dow: b.dow, score: b.activityScore });
        }
      }
      const topRooms = [...roomPeaks.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 5)
        .map(([room, v]) => ({
          room,
          peakHour: v.hour,
          peakDow: v.dow,
          activityScore: +v.score.toFixed(1),
        }));
      const needsBaseline = topRooms.length === 0 && awayBuckets.length === 0;
      const miningOn = this.appConfig.get('intelligence')?.recommendationMiningEnabled !== false;
      return {
        pendingCount,
        topRooms,
        awayLightHints: awayBuckets.map((a) => ({
          dow: a.dow,
          hour: a.hour,
          lightOnProbability: +a.lightOnProb.toFixed(2),
        })),
        needsBaseline,
        canRebuild: true,
        miningEnabled: miningOn,
        note: needsBaseline
          ? miningOn
            ? '习惯基线尚在学习中：可点击「立即重建基线」，或保持日常使用 3–7 天后自动生成'
            : '习惯挖掘已关闭，请在专家配置启用 recommendationMiningEnabled，或手动重建基线'
          : '基于 ActivityBaseline / AwayPattern 的习惯摘要',
      };
    } catch (err) {
      this.logger.warn(`习惯摘要失败: ${(err as Error).message}`);
      return {
        pendingCount: 0,
        topRooms: [],
        awayLightHints: [],
        needsBaseline: true,
        canRebuild: true,
        miningEnabled: true,
        note: '习惯摘要暂不可用',
      };
    }
  }

/**
   * 忽略推荐（status → dismissed）。
   *
   * @param id 推荐 ID。
   * @returns `{ success: true }`。
   * 异常：记录不存在时抛 notFound(RECOMMENDATION_NOT_FOUND)。
   */
  async dismiss(id: string) {
    try {
      const existing = await this.prisma.recommendation.findUnique({
        where: { id },
        select: { payload: true },
      });
      const prev = (existing?.payload ?? {}) as Record<string, unknown>;
      const dismissedCount = (Number(prev.dismissedCount) || 0) + 1;
      await this.prisma.recommendation.update({
        where: { id },
        data: {
          status: 'dismissed',
          payload: cloneJsonPayload({ ...prev, dismissedCount }),
          updatedAt: new Date(),
        },
      });
      return { success: true, dismissedCount };
    } catch (err) {
      // P2025: Prisma 记录不存在
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'P2025'
      ) {
        notFound(API_ERROR.RECOMMENDATION_NOT_FOUND);
      }
      throw err;
    }
  }

/**
   * 采纳推荐：根据类型创建草稿自动化或标记场景/模式已采纳。
   *
   * - home_mode：标记 adopted，提示用户在家庭模式页配置触发器。
   * - scene：标记 adopted，提示用户在场景页确认定时。
   * - automation：创建草稿自动化（支持占位实体替换），无占位符时可立即启用。
   *
   * @param id 推荐 ID。
   * @param opts.replacements 占位实体替换映射。
   * @param opts.enableAfter 无占位符时是否立即启用。
   * @returns 采纳结果，含 success / message / createdId / draftYaml / remainingPlaceholders。
   */
  async adopt(
    id: string,
    opts?: { replacements?: Record<string, string>; enableAfter?: boolean },
  ): Promise<{
    success: boolean;
    message: string;
    createdId?: string;
    draftYaml?: string;
    remainingPlaceholders?: number;
  }> {
    const rec = await this.prisma.recommendation.findUnique({ where: { id } });
    if (!rec) return { success: false, message: API_ERROR.RECOMMENDATION_NOT_FOUND };
    const payload = rec.payload as Record<string, unknown>;
    const payloadDraft = typeof payload.draftYaml === 'string' ? payload.draftYaml : undefined;
    if (rec.type === 'home_mode' && payload.modeId) {
      await this.prisma.recommendation.update({
        where: { id },
        data: { status: 'adopted', updatedAt: new Date() },
      });
      return {
        success: true,
        message: '已标记采纳，请在家庭模式页配置触发器',
        createdId: String(payload.modeId),
      };
    }
    if (rec.type === 'scene' && payload.sceneId) {
      await this.prisma.recommendation.update({
        where: { id },
        data: { status: 'adopted', updatedAt: new Date() },
      });
      return {
        success: true,
        message: '已标记采纳，请在场景页确认定时配置',
        createdId: String(payload.sceneId),
      };
    }
    if (rec.type === 'automation' && (payload.automationId || payloadDraft)) {
      const hour = Number(payload.hour ?? 20);
      const dow = Number(payload.dow ?? 1);
      const entityId = typeof payload.entityId === 'string' ? payload.entityId : '';
      const labeledDraft =
        entityId && payload.pattern === 'manual_control' && payloadDraft
          ? this.withFriendlyEntityLabels(rec.title, payloadDraft, entityId).draftYaml
          : payloadDraft;
      let yaml =
        labeledDraft ||
        `alias: "推荐: ${rec.title.slice(0, 40)}"
description: "HomeOS 本地自动化（不可 runOnHa）"
# homeos_meta: run_on_ha=false
triggers:
  - platform: time
    at: "${String(hour).padStart(2, '0')}:00:00"
    weekday:
      - ${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dow]}
conditions: []
actions:
  - service: automation.trigger
    entity_id: ${payload.automationId}
`;
      const replacements = opts?.replacements;
      if (replacements && Object.keys(replacements).length) {
        yaml = replaceEntityIdsInYaml(yaml, replacements);
      }
      const remaining = findReplaceableEntityIdsInYaml(yaml).length;
      const created = await this.prisma.automation.create({
        data: {
          name: `推荐: ${rec.title.slice(0, 40)}`,
          yaml,
          enabled: Boolean(opts?.enableAfter && remaining === 0),
          runOnHa: false,
        },
      });
      await this.prisma.recommendation.update({
        where: { id },
        data: {
          status: 'adopted',
          updatedAt: new Date(),
          payload: cloneJsonPayload({ ...payload, createdAutomationId: created.id }),
        },
      });
      return {
        success: true,
        message:
          remaining > 0
            ? '已创建草稿自动化，请完成剩余实体替换后启用'
            : opts?.enableAfter
              ? '已创建并启用自动化'
              : '已创建自动化草稿',
        createdId: created.id,
        draftYaml: yaml,
        remainingPlaceholders: remaining,
      };
    }
    return { success: false, message: '无法采纳此推荐类型' };
  }

/**
   * 获取推荐草稿 YAML 中的占位实体建议。
   *
   * @param id 推荐 ID。
   * @returns `{ placeholders, suggestions, draftYaml }`。
   * 异常：记录不存在时抛 notFound(RECOMMENDATION_NOT_FOUND)。
   */
  async getPlaceholderSuggestions(id: string) {
    const rec = await this.prisma.recommendation.findUnique({ where: { id } });
    if (!rec) notFound(API_ERROR.RECOMMENDATION_NOT_FOUND);
    const payload = rec.payload as Record<string, unknown>;
    const yaml = typeof payload.draftYaml === 'string' ? payload.draftYaml : '';
    const entities = this.stateStore.getAll().map((e) => ({
      id: e.entity_id,
      name: String(e.attributes?.friendly_name || ''),
    }));
    const placeholders = findReplaceableEntityIdsInYaml(yaml);
    const suggestions = buildPlaceholderSuggestions(yaml, entities);
    return { placeholders, suggestions, draftYaml: yaml };
  }
}
