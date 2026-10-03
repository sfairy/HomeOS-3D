/**
 * 所属模块：backend/modules/notification
 * 职责：
 *  - 通知分发前规则（聚合/合并/窗口）；
 * 关键依赖：
 *  - notification-dispatch.helper；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { API_ERROR } from '../../common/errors/api-error-messages';
import { badRequest, rethrowIfHttpException } from '../../common/utils/business-exception';
import { evaluateCondition } from '../../common/utils/evaluate-condition.util';
import { AlertRuleWatchIndexService } from '../../shared/ha/watch-index.services';
import { formatAlertRuleMessage } from '../../common/alert-support/alert-message-template.util';
import { resolveAlertRuleChannels } from '../../common/alert-support/notification-channels.util';
import { PrismaService } from '../../shared/prisma/service';
import { loadRuntimeKv, persistRuntimeKv } from '../../shared/prisma/runtime-kv.util';
import { Prisma } from '../../generated/prisma/client';
import { parseJsonArray } from '../../common/utils/json-field.util';
import type { AlertLevel, AlertRule, AlertRuleConditionRevision, Notification } from './service';
import { Logger } from '@nestjs/common';

/** NotificationRulesHelper 的依赖注入接口 */
interface NotificationRulesDeps {
  logger: Logger;
  prisma: PrismaService;
  alertRuleWatchIndex: AlertRuleWatchIndexService;
  isDndActive: () => boolean;
  /** security.alertBypassDnd：告警规则是否穿透普通 DND（danger 始终穿透） */
  isAlertBypassDnd: () => boolean;
  isInCooldown: (key: string) => boolean;
  setCooldown: (key: string, minutes: number) => void;
  persistEdgeState?: (matchedKeys: string[]) => void;
  restoreEdgeState?: () => Promise<string[]>;
  notify: (
    level: AlertLevel,
    message: string,
    source?: string,
    entityId?: string,
    opts?: { channels?: string[]; bypassDnd?: boolean; title?: string },
  ) => Promise<Notification | null>;
}

/**
 * 告警规则 Helper。
 * 管理告警规则的 CRUD、条件求值、边沿触发与冷却控制。
 * - 规则缓存：仅保留启用的规则，CRUD 后刷新
 * - 边沿触发：同一规则+实体从"未匹配→匹配"时才通知，持续匹配不重复
 * - 冷却：触发后进入冷却期，期内不重复触发
 * - DND：非 danger 级别在免打扰时段不触发（除非 security.alertBypassDnd）
 * - 修订历史：条件变更时记录旧条件，持久化到 SystemConfig
 */
export class NotificationRulesHelper {
  private static readonly RULE_REVISIONS_ID = 'alert-rule-revisions';

  /** 启用的告警规则内存缓存（CRUD 后刷新） */
  private rulesCache: AlertRule[] = [];
  /** 规则缓存是否过期（DB 刷新失败时置 true，成功后重置） */
  private rulesCacheStale = false;
  /** 规则条件修订历史（内存，最近 20 条/规则） */
  private readonly ruleConditionHistory = new Map<string, AlertRuleConditionRevision[]>();
  /** 边沿触发：ruleId:entityId → 上次是否已匹配 */
  private readonly ruleMatchState = new Map<string, boolean>();

  constructor(private readonly deps: NotificationRulesDeps) {}

  /**
   * 从 RuntimeKv 加载条件修订历史到内存。
   * 每条规则最多保留 20 条修订。
   */
  async loadConditionHistory() {
    const data = await loadRuntimeKv<Record<string, AlertRuleConditionRevision[]>>(
      this.deps.prisma,
      NotificationRulesHelper.RULE_REVISIONS_ID,
    );
    if (data && typeof data === 'object') {
      for (const [ruleId, revisions] of Object.entries(data)) {
        if (Array.isArray(revisions)) {
          this.ruleConditionHistory.set(ruleId, revisions.slice(0, 20));
        }
      }
    }
  }

  /** 从 Redis 恢复边沿匹配态，避免 Leader 切换后对仍成立的条件重复告警 */
  async loadEdgeState() {
    const keys = await this.deps.restoreEdgeState?.();
    if (!keys?.length) return;
    this.ruleMatchState.clear();
    for (const key of keys) {
      if (key) this.ruleMatchState.set(key, true);
    }
  }

  private persistEdgeState() {
    const matched = [...this.ruleMatchState.entries()]
      .filter(([, on]) => on)
      .map(([key]) => key);
    this.deps.persistEdgeState?.(matched);
  }

  /** 将条件修订历史持久化到 RuntimeKv。 */
  private persistConditionHistory() {
    const payload: Record<string, AlertRuleConditionRevision[]> = {};
    for (const [ruleId, revisions] of this.ruleConditionHistory) {
      payload[ruleId] = revisions;
    }
    persistRuntimeKv(
      this.deps.logger,
      '告警规则修订历史持久化',
      this.deps.prisma,
      NotificationRulesHelper.RULE_REVISIONS_ID,
      payload,
    );
  }

  /**
   * 刷新告警规则缓存（仅保留启用的规则）。
   * 同时更新 HA 实体订阅索引。
   * 加载失败时保留旧缓存并标记 stale（仅首次加载、无旧缓存时才保持为空），
   * 避免 DB 瞬时故障清空缓存导致告警规则静默失效；DB 恢复后下次刷新整体原子替换。
   */
  async refreshRulesCache() {
    try {
      const all = await this.fetchRulesFromDb();
      this.rulesCache = all.filter((r) => r.enabled);
      this.deps.alertRuleWatchIndex.updateFromRules(this.rulesCache);
      this.rulesCacheStale = false;
      this.deps.logger.log(`告警规则已加载: ${this.rulesCache.length} 条启用`);
    } catch (err) {
      // 刷新失败：保留旧缓存与 HA 订阅索引并标记 stale，
      // 旧缓存继续参与规则评估，DB 恢复后下次刷新自动替换，避免告警规则静默失效。
      this.rulesCacheStale = true;
      this.deps.logger.warn(
        `刷新告警规则缓存失败,保留旧缓存 ${this.rulesCache.length} 条(标记 stale): ${(err as Error).message}`,
      );
    }
  }

  /**
   * 记录条件修订历史。
   * 新修订插入到列表头部，最多保留 20 条。
   * @param ruleId 规则 ID
   * @param condition 旧条件表达式
   */
  private pushConditionHistory(ruleId: string, condition: string) {
    const list = this.ruleConditionHistory.get(ruleId) || [];
    list.unshift({ condition, at: new Date().toISOString() });
    this.ruleConditionHistory.set(ruleId, list.slice(0, 20));
    this.persistConditionHistory();
  }

  /** 获取指定规则的条件修订历史（返回副本）。 */
  getRuleConditionHistory(ruleId: string): AlertRuleConditionRevision[] {
    return [...(this.ruleConditionHistory.get(ruleId) || [])];
  }
  /**
   * 针对单个状态变更评估所有匹配的告警规则。
   * 关键路径：HA 状态变更 → 规则条件求值 → 边沿触发 → 冷却检查 → DND 检查 → 通知。
   * - 仅评估启用且（无 entityId 或 entityId 匹配）的规则
   * - 边沿触发：从"未匹配→匹配"时才通知，持续匹配不重复
   * - 冷却期内或 DND 时段（非 danger）不触发
   * @param entityId HA 实体 ID
   * @param state 实体当前状态
   * @param attributes 实体属性
   */
  async evaluateRules(entityId: string, state: string, attributes?: Record<string, unknown>) {
    if (this.rulesCache.length === 0) return;
    for (const rule of this.rulesCache) {
      if (rule.entityId && rule.entityId !== entityId) continue;
      let matched = false;
      try {
        matched = evaluateCondition(rule.condition, state, attributes);
      } catch {
        matched = false;
      }
      const edgeKey = `${rule.id || rule.name}:${entityId}`;
      if (!matched) {
        if (this.ruleMatchState.get(edgeKey) === true) {
          this.ruleMatchState.set(edgeKey, false);
          this.persistEdgeState();
        }
        continue;
      }
      const wasMatched = this.ruleMatchState.get(edgeKey) === true;
      this.ruleMatchState.set(edgeKey, true);
      if (!wasMatched) this.persistEdgeState();
      // 电平持续匹配时不重复通知，仅在边沿（未匹配→匹配）触发
      if (wasMatched) continue;

      const cooldownKey = `rule:${rule.id || rule.name}:${entityId}`;
      if (this.deps.isInCooldown(cooldownKey)) continue;
      const bypassDnd = rule.level === 'danger' || this.deps.isAlertBypassDnd();
      if (this.deps.isDndActive() && !bypassDnd) continue;
      const friendlyName = (attributes?.friendly_name as string) || entityId;
      // 数值型传感器（风速 / 温湿度 / 电量 / 功率）额外透出单位，供 {{unit}} 插值
      const unit = (attributes?.unit_of_measurement as string) || '';
      const message = formatAlertRuleMessage(rule.messageTemplate, {
        entity_id: entityId,
        entity: entityId,
        state,
        value: state,
        unit,
        name: friendlyName,
        friendly_name: friendlyName,
        rule: rule.name,
      });
      let delivered: Notification | null = null;
      try {
        delivered = await this.deps.notify(rule.level, message, 'alert-rule', entityId, {
          // 空渠道语义为「仅站内 + 实时」，避免落库为 [] 时被 resolveLanChannels 当作全渠道外发
          channels: resolveAlertRuleChannels(rule.channels),
          // 规则自定义推送标题；缺省由各通道内置标题兜底
          title: rule.title,
          bypassDnd: bypassDnd && rule.level !== 'danger' ? true : undefined,
        });
      } catch (err) {
        this.deps.logger.warn(`告警规则通知失败: ${(err as Error).message}`);
      }
      if (delivered) {
        // 冷却 0 视为不抑制（门铃等事件型规则每次都要通知）；非法值回退默认 60 分钟
        const cooldownMin = Number.isFinite(rule.cooldownMinutes)
          ? Math.max(0, rule.cooldownMinutes)
          : 60;
        this.deps.setCooldown(cooldownKey, cooldownMin);
      } else {
        // 通知未投递（返回 null 或抛异常）：回滚边沿匹配状态，
        // 保证条件持续匹配期间可重试，避免被误判为已通知而漏报。
        // 冷却/免打扰拦截发生在 notify 之前（continue 跳过），不受影响。
        this.ruleMatchState.set(edgeKey, false);
        this.persistEdgeState();
      }
    }
  }

  /** 从数据库读取全部告警规则（按创建时间倒序）。读取失败时返回空数组。 */
  async getRules(): Promise<AlertRule[]> {
    try {
      return await this.fetchRulesFromDb();
    } catch (err) {
      this.deps.logger.warn(`读取告警规则失败: ${(err as Error).message}`);
      return [];
    }
  }

  /** 查询全部告警规则（不吞错，供 refreshRulesCache 感知 DB 失败并保留旧缓存）。 */
  private async fetchRulesFromDb(): Promise<AlertRule[]> {
    const records = await this.deps.prisma.alertRule.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      entityId: r.entityId || undefined,
      condition: r.condition,
      level: r.level as AlertLevel,
      channels: parseJsonArray(r.channels),
      cooldownMinutes: r.cooldownMinutes,
      enabled: r.enabled,
      messageTemplate: r.messageTemplate || undefined,
      title: r.title || undefined,
    }));
  }

  /**
   * 新增告警规则。
   * 校验名称与条件非空，写入数据库后刷新缓存。
   * @param rule 规则定义
   */
  async addRule(rule: AlertRule): Promise<AlertRule> {
    const name = rule.name?.trim();
    const condition = rule.condition?.trim();
    if (!name) badRequest(API_ERROR.ALERT_RULE_NAME_REQUIRED);
    if (!condition) badRequest(API_ERROR.ALERT_RULE_CONDITION_REQUIRED);
    const entityId = rule.entityId?.trim() || null;
    const duplicate = await this.deps.prisma.alertRule.findFirst({
      where: {
        condition,
        entityId,
      },
      select: { id: true },
    });
    if (duplicate) badRequest(API_ERROR.ALERT_RULE_DUPLICATE);
    try {
      const record = await this.deps.prisma.alertRule.create({
        data: {
          name,
          entityId,
          condition,
          level: rule.level || 'warn',
          channels: rule.channels || [],
          // 保留 0（不抑制）语义；未提供时回退默认 60 分钟
          cooldownMinutes: Number.isFinite(rule.cooldownMinutes)
            ? Math.max(0, rule.cooldownMinutes)
            : 60,
          enabled: rule.enabled !== false,
          messageTemplate: rule.messageTemplate?.trim() || null,
          title: rule.title?.trim() || null,
        },
      });
      await this.refreshRulesCache();
      return {
        id: record.id,
        name: record.name,
        entityId: record.entityId || undefined,
        condition: record.condition,
        level: record.level as AlertLevel,
        channels: parseJsonArray(record.channels),
        cooldownMinutes: record.cooldownMinutes,
        enabled: record.enabled,
        messageTemplate: record.messageTemplate || undefined,
        title: record.title || undefined,
      };
    } catch (err) {
      this.deps.logger.error(`创建告警规则失败: ${(err as Error).message}`);
      throw err;
    }
  }
  /**
   * 更新告警规则（部分字段）。
   * 条件变更时记录旧条件到修订历史。
   * @param ruleId 规则 ID
   * @param partial 待更新字段
   * @returns 更新后的规则（含 previousCondition）；规则不存在时返回 null
   */
  async updateRule(ruleId: string, partial: Partial<AlertRule>) {
    try {
      const existing = await this.deps.prisma.alertRule.findUnique({ where: { id: ruleId } });
      if (!existing) return null;

      if (partial.name !== undefined && !partial.name?.trim()) {
        badRequest(API_ERROR.ALERT_RULE_NAME_REQUIRED);
      }
      if (partial.condition !== undefined && !partial.condition?.trim()) {
        badRequest(API_ERROR.ALERT_RULE_CONDITION_REQUIRED);
      }

      const data: Prisma.AlertRuleUpdateInput = {};
      if (partial.name !== undefined) data.name = partial.name.trim();
      if (partial.entityId !== undefined) data.entityId = partial.entityId;
      if (partial.condition !== undefined) data.condition = partial.condition;
      if (partial.level !== undefined) data.level = partial.level;
      if (partial.channels !== undefined) data.channels = partial.channels;
      if (partial.cooldownMinutes !== undefined) {
        // 0 保留为"不抑制"；负数与非法值 clamp 到 0
        const cd = Number(partial.cooldownMinutes);
        data.cooldownMinutes = Number.isFinite(cd) ? Math.max(0, Math.floor(cd)) : 60;
      }
      if (partial.enabled !== undefined) data.enabled = partial.enabled;
      if (partial.messageTemplate !== undefined) {
        data.messageTemplate = partial.messageTemplate?.trim() || null;
      }
      if (partial.title !== undefined) {
        data.title = partial.title?.trim() || null;
      }

      let previousCondition: string | undefined;
      if (partial.condition !== undefined && partial.condition !== existing.condition) {
        previousCondition = existing.condition;
        this.pushConditionHistory(ruleId, existing.condition);
      }

      const record = await this.deps.prisma.alertRule.update({
        where: { id: ruleId },
        data,
      });
      await this.refreshRulesCache();
      return {
        id: record.id,
        name: record.name,
        entityId: record.entityId || undefined,
        condition: record.condition,
        level: record.level as AlertLevel,
        channels: parseJsonArray(record.channels),
        cooldownMinutes: record.cooldownMinutes,
        enabled: record.enabled,
        messageTemplate: record.messageTemplate || undefined,
        title: record.title || undefined,
        previousCondition,
      };
    } catch (err) {
      // 业务校验异常（badRequest 等）必须向上抛出，否则前端会把「条件为空」误读为「规则不存在(404)」
      rethrowIfHttpException(err);
      this.deps.logger.warn(`更新告警规则失败: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * 模拟评估告警条件（不触发通知）。
   * @param condition 条件表达式
   * @param state 实体状态
   * @param attributes 实体属性
   * @returns { matched, state, condition }
   */
  testCondition(
    condition: string,
    state: string,
    attributes?: Record<string, unknown>,
  ): { matched: boolean; state: string; condition: string } {
    const matched = evaluateCondition(condition, state, attributes);
    return { matched, state, condition };
  }

  /**
   * 删除告警规则。
   * @param ruleId 规则 ID
   * @returns { success: boolean }
   */
  async deleteRule(ruleId: string) {
    try {
      await this.deps.prisma.alertRule.delete({ where: { id: ruleId } });
      await this.refreshRulesCache();
      return { success: true };
    } catch (err) {
      this.deps.logger.warn(`删除告警规则失败: ${(err as Error).message}`);
      return { success: false };
    }
  }
}
