/**
 * @file config-insights.service.ts
 * @module awareness
 * @description 配置型洞察服务。基于设备绑定缺口、实体同步状态、EventLog 性能、
 * 常用设备统计、告警规则覆盖、家庭模式触发、全屋关闭排除等维度，聚合生成
 * 面向用户配置页的洞察卡片（ConfigInsightItem）。
 *
 * 依赖：
 * - SetupWizardService：获取绑定缺口与 HA 配置快照。
 * - StateStoreService：实体状态查询。
 * - EventLogQueryService：24h 事件统计。
 * - PrismaService：commandAudit 聚合查询。
 * - HomeModeService：家庭模式触发日志。
 * - AppConfigService：ops / haConnector 配置读取。
 */
import { Injectable, Logger } from '@nestjs/common';
import { getEntityDomain, buildHazardBindingMap } from '@homeos/shared';
import type { BindingGapItem } from '@homeos/shared';
import { AppConfigService } from '../../shared/app-config/service';
import { PrismaService } from '../../shared/prisma/service';
import { SetupWizardService } from '../system/setup/wizard.service';
import { StateStoreService } from '../state-store/service';
import { EventLogQueryService } from '../state-store/event-log/query.service';
import { HomeModeService } from '../home-mode/service';

/**
 * 危险传感器 device_class → 内部危险类型映射。
 * 烟雾、燃气（含 CO/甲烷）、水浸共用三类语义。
 */
const HAZARD_DEVICE_CLASS: Record<string, 'smoke' | 'gas' | 'leak'> = {
  smoke: 'smoke',
  gas: 'gas',
  carbon_monoxide: 'gas',
  methane: 'gas',
  moisture: 'leak',
  water: 'leak',
};

/** 配置洞察卡片中的 chip（标签胶囊）结构 */
interface ConfigInsightChip {
  id: string;
  label: string;
  meta?: string;
  title?: string;
  variant?: string;
  route?: string;
  payload?: Record<string, unknown>;
}

/** 配置洞察分组：一组相关 chip 的集合 */
interface ConfigInsightGroup {
  id: string;
  label: string;
  chips: ConfigInsightChip[];
}

/** 配置洞察横幅：单条强提示，可带行动按钮 */
interface ConfigInsightBanner {
  id: string;
  label: string;
  actionLabel?: string;
}

/** 单条配置洞察：一个域（bindings/entity-sync/...）下的整体建议 */
interface ConfigInsightItem {
  domain: string;
  title: string;
  summary: string;
  meta?: string;
  hasActionable: boolean;
  linkTo?: string;
  linkLabel?: string;
  groups?: ConfigInsightGroup[];
  banners?: ConfigInsightBanner[];
}

@Injectable()
/**
 * ConfigInsightsService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class ConfigInsightsService
 */
export class ConfigInsightsService {
  private readonly logger = new Logger(ConfigInsightsService.name);

  constructor(
    private readonly setupWizard: SetupWizardService,
    private readonly stateStore: StateStoreService,
    private readonly eventLogQuery: EventLogQueryService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly homeMode: HomeModeService,
  ) {}

/**
   * 聚合所有配置洞察。
   *
   * 并行拉取绑定缺口、24h 事件统计、近 7 天高频命令实体、遗忘实体、HA 配置快照，
   * 组装成 ConfigInsightItem 列表，并统计可执行建议数量。
   *
   * @returns `{ insights, pendingCount }`：洞察列表与可执行建议计数。
   * 副作用：无。异常：内部 catch 后返回空列表与 0 计数，不向外抛出。
   */
  async getInsights(): Promise<{ insights: ConfigInsightItem[]; pendingCount: number }> {
    try {
      const [gapsResult, stats, commandRows, forgotten, haConfig] = await Promise.all([
        this.setupWizard.getBindingGaps(),
        this.eventLogQuery.getStats(24, null).catch(() => null),
        this.loadTopCommandEntities(),
        this.loadForgottenEntityIds(),
        this.setupWizard.getHaConfigSnapshot(),
      ]);

      const ops = this.appConfig.get('ops') as Record<string, unknown>;
      const haConnector = this.appConfig.get('haConnector') as Record<string, unknown>;
      const insights: ConfigInsightItem[] = [
        this.buildBindingsInsight(gapsResult.gaps, haConfig),
        this.buildEntitySyncInsight(haConnector),
      ];
      if (stats) {
        insights.push(this.buildEventLogPerfInsight(stats, ops, haConnector));
        insights.push(this.buildFavoritesInsight(stats, commandRows));
        insights.push(this.buildAlertRulesInsight(stats));
      }
      insights.push(this.buildHomeModeInsight());
      insights.push(this.buildWholeHomeOffInsight(forgotten));

      const pendingCount = insights.filter((i) => i.hasActionable).length;
      return { insights, pendingCount };
    } catch (err) {
      this.logger.error(`获取配置洞察失败: ${(err as Error).message}`);
      return { insights: [], pendingCount: 0 };
    }
  }

/**
   * 查询近 7 天成功执行的高频命令实体（top 10）。
   *
   * @returns 实体 ID 与执行次数列表；查询失败时返回空数组。
   */
  private async loadTopCommandEntities(): Promise<Array<{ entityId: string; count: number }>> {
    const since = new Date(Date.now() - 7 * 86400000);
    try {
      const rows = await this.prisma.commandAudit.groupBy({
        by: ['entityId'],
        where: { createdAt: { gte: since }, success: true },
        _count: { entityId: true },
        orderBy: { _count: { entityId: 'desc' } },
        take: 10,
      });
      return rows.map((r) => ({ entityId: r.entityId, count: r._count.entityId }));
    } catch {
      return [];
    }
  }

/**
   * 加载当前处于开启状态的 climate / media_player / light 实体（最多 8 个）。
   * 用于「全屋关闭」场景下的常开设备排除建议。
   *
   * @returns 实体 ID 列表；查询失败时返回空数组。
   */
  private loadForgottenEntityIds(): string[] {
    try {
      return this.stateStore
        .getAll()
        .filter((e) => {
          const domain = getEntityDomain(e.entity_id);
          if (!['climate', 'media_player', 'light'].includes(domain)) return false;
          return String(e.state || '').toLowerCase() === 'on';
        })
        .slice(0, 8)
        .map((e) => e.entity_id);
    } catch {
      return [];
    }
  }

/**
   * 构建「集成绑定推荐」洞察：
   * - 扫描未绑定的危险传感器（binary_sensor，含 smoke/gas/leak device_class）。
   * - 整合 setupWizard 返回的配置缺口。
   *
   * @param gaps 配置缺口列表。
   * @param haConfig HA 配置快照，用于 buildHazardBindingMap。
   * @returns 绑定建议洞察项。
   */
  private buildBindingsInsight(
    gaps: BindingGapItem[],
    haConfig: Record<string, unknown>,
  ): ConfigInsightItem {
    const all = this.stateStore.getAll();
    const bound = buildHazardBindingMap(haConfig);
    const chips: ConfigInsightChip[] = [];
    for (const ent of all) {
      const id = ent.entity_id;
      if (getEntityDomain(id) !== 'binary_sensor' || bound.has(id)) continue;
      const deviceClass = String(ent.attributes?.device_class || '').toLowerCase();
      const kind = HAZARD_DEVICE_CLASS[deviceClass];
      if (!kind) continue;
      chips.push({
        id,
        label: String(ent.attributes?.friendly_name || id.split('.').pop() || id),
        meta: kind === 'smoke' ? '烟雾' : kind === 'gas' ? '燃气' : '水浸',
        title: id,
        variant: 'entity',
        payload: { entityId: id, kind },
      });
      if (chips.length >= 8) break;
    }

    const groups: ConfigInsightGroup[] = [];
    if (chips.length) groups.push({ id: 'hazard-sensors', label: '可绑定的危险传感器', chips });
    if (gaps.length) {
      groups.push({
        id: 'gaps',
        label: '配置缺口',
        chips: gaps.slice(0, 8).map((g) => ({
          id: g.id,
          label: g.label,
          meta: g.severity === 'warn' ? '重要' : '可选',
          variant: 'link',
          route: g.route,
        })),
      });
    }

    const hasActionable = chips.length > 0 || gaps.some((g) => g.severity === 'warn');
    return {
      domain: 'bindings',
      title: '集成绑定推荐',
      summary: hasActionable
        ? [
            chips.length ? `发现 ${chips.length} 个可绑定传感器` : '',
            gaps.length ? `${gaps.length} 项缺口` : '',
          ]
            .filter(Boolean)
            .join('，')
        : '集成绑定配置完整',
      meta: gaps.length ? `${gaps.length} 项缺口` : undefined,
      hasActionable,
      groups,
      linkTo: '/settings?tab=bindings',
      linkLabel: '打开绑定设置',
    };
  }

/**
   * 构建「实体同步建议」洞察：根据实体总量给出过滤开启 / 刷新提示。
   *
   * @param haConnector haConnector 配置段，关注 syncOnlyEnabledEntities。
   * @returns 实体同步建议洞察项。
   */
  private buildEntitySyncInsight(haConnector: Record<string, unknown>): ConfigInsightItem {
    const total = this.stateStore.getAll().length;
    const syncOnly = haConnector.syncOnlyEnabledEntities !== false;
    const banners: ConfigInsightBanner[] = [];
    if (total > 2000 && !syncOnly) {
      banners.push({
        id: 'enable-sync-filter',
        label: '实体较多，建议开启 registry 过滤',
        actionLabel: '前往设置',
      });
    }
    if (total > 0 && total < 100) {
      banners.push({
        id: 'refresh-entities',
        label: '实体偏少，建议刷新',
        actionLabel: '刷新实体',
      });
    }
    return {
      domain: 'entity-sync',
      title: '实体同步建议',
      summary: banners.length
        ? `当前 ${total} 个实体`
        : total > 0
          ? `同步正常（${total} 个）`
          : '请先刷新实体',
      hasActionable: banners.length > 0,
      banners,
      linkTo: '/settings?tab=connection&section=entities',
      linkLabel: '打开实体同步',
    };
  }

/**
   * 构建「EventLog 性能调优」洞察：
   * - 传感器事件占比过高时建议开启实体筛选。
   * - 总事件量较大时建议开启入口合并。
   *
   * @param stats 24h 事件统计（含 total 与 byDomain）。
   * @param ops ops 配置段，关注 eventLogRecordFilterEnabled。
   * @param haConnector haConnector 配置段，关注 ingressCoalesceEnabled。
   * @returns EventLog 性能建议洞察项。
   */
  private buildEventLogPerfInsight(
    stats: { total: number; byDomain: Record<string, number> },
    ops: Record<string, unknown>,
    haConnector: Record<string, unknown>,
  ): ConfigInsightItem {
    const total = stats.total || 0;
    const sensorCount =
      Number(stats.byDomain?.sensor || 0) + Number(stats.byDomain?.binary_sensor || 0);
    const sensorShare = total > 0 ? sensorCount / total : 0;
    const banners: ConfigInsightBanner[] = [];
    if (sensorShare >= 0.5 && ops.eventLogRecordFilterEnabled !== true) {
      banners.push({
        id: 'enable-filter',
        label: '建议启用 EventLog 实体筛选',
        actionLabel: '前往配置',
      });
    }
    if (total > 5000 && haConnector.ingressCoalesceEnabled === false) {
      banners.push({ id: 'ingress-coalesce', label: '建议开启入口合并', actionLabel: '高级参数' });
    }
    return {
      domain: 'eventlog-perf',
      title: 'EventLog 性能调优',
      summary: banners.length
        ? `24h ${total} 条，传感器约 ${Math.round(sensorShare * 100)}%`
        : '写入结构合理',
      hasActionable: banners.length > 0,
      banners,
      linkTo: '/settings?tab=connection&section=entities',
      linkLabel: '筛选设置',
    };
  }

/**
   * 构建「常用设备推荐」洞察：合并 EventLog topEntities 与 commandAudit 高频实体，
   * 仅保留可控域（light/switch/climate/cover/fan/media_player/lock）。
   *
   * @param stats 24h 事件统计，提供 topEntities。
   * @param commandRows 近 7 天 commandAudit top 实体。
   * @returns 常用设备推荐洞察项。
   */
  private buildFavoritesInsight(
    stats: { topEntities?: Array<{ entityId: string; count: number }> },
    commandRows: Array<{ entityId: string; count: number }>,
  ): ConfigInsightItem {
    const controlDomains = new Set([
      'light',
      'switch',
      'climate',
      'cover',
      'fan',
      'media_player',
      'lock',
    ]);
    const merged = new Map<string, number>();
    for (const row of [...(stats.topEntities || []), ...commandRows]) {
      const id = String(row.entityId || '').trim();
      if (!id || !controlDomains.has(getEntityDomain(id))) continue;
      merged.set(id, Math.max(merged.get(id) || 0, Number(row.count) || 0));
    }
    const chips = [...merged.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([entityId, count]) => ({
        id: entityId,
        label: entityId.split('.').pop() || entityId,
        meta: String(count),
        title: entityId,
        variant: 'entity',
        payload: { entityId },
      }));
    return {
      domain: 'favorites',
      title: '常用设备推荐',
      summary: chips.length ? `建议加入 ${chips.length} 个高频实体` : '覆盖良好',
      hasActionable: chips.length > 0,
      groups: chips.length ? [{ id: 'entities', label: '高频控制实体', chips }] : [],
      linkTo: '/settings?tab=favorites',
      linkLabel: '常用设备',
    };
  }

/**
   * 构建「告警规则推荐」洞察：聚焦 binary_sensor / lock / alarm_control_panel，
   * 建议为高频触发实体配置 TTS 告警规则。
   *
   * @param stats 24h 事件统计，提供 topEntities。
   * @returns 告警规则推荐洞察项。
   */
  private buildAlertRulesInsight(stats: {
    topEntities?: Array<{ entityId: string; count: number }>;
  }): ConfigInsightItem {
    const chips = (stats.topEntities || [])
      .filter((row) =>
        ['binary_sensor', 'lock', 'alarm_control_panel'].includes(getEntityDomain(row.entityId)),
      )
      .slice(0, 6)
      .map((row) => ({
        id: row.entityId,
        label: row.entityId.split('.').pop() || row.entityId,
        meta: String(row.count),
        title: row.entityId,
        variant: 'entity',
        payload: { entityId: row.entityId },
      }));
    return {
      domain: 'alert-rules',
      title: '告警规则推荐',
      summary: chips.length ? `建议配置 ${chips.length} 个实体 TTS` : '覆盖良好',
      hasActionable: chips.length > 0,
      groups: chips.length ? [{ id: 'entities', label: '推荐实体', chips }] : [],
      linkTo: '/settings?tab=alerts',
      linkLabel: '告警规则',
    };
  }

/**
   * 构建「家庭模式推荐」洞察：
   * - 统计近 30 天触发来源。
   * - everyone_left 触发 ≥3 次时建议配置离家模式自动触发。
   *
   * @returns 家庭模式推荐洞察项。
   */
  private buildHomeModeInsight(): ConfigInsightItem {
    const logs = this.homeMode.getTriggerLogs(30);
    const sourceCounts = new Map<string, number>();
    for (const log of logs) {
      const src = String(log.source || 'manual');
      sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
    }
    const banners: ConfigInsightBanner[] = [];
    if ((sourceCounts.get('everyone_left') || 0) >= 3) {
      banners.push({
        id: 'everyone-left',
        label: '建议配置离家模式自动触发',
        actionLabel: '编辑模式',
      });
    }
    const chips = [...sourceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([src, count]) => ({
        id: src,
        label: src,
        meta: String(count),
        variant: 'default',
      }));
    return {
      domain: 'home-mode',
      title: '家庭模式推荐',
      summary: banners.length ? '可优化自动触发' : '触发正常',
      hasActionable: banners.length > 0,
      banners,
      groups: chips.length ? [{ id: 'sources', label: '近期触发来源', chips }] : [],
      linkTo: '/settings?tab=home-mode',
      linkLabel: '家庭模式',
    };
  }

/**
   * 构建「全屋关闭推荐」洞察：列出常开设备（最多 6 个），建议加入排除列表。
   *
   * @param forgottenIds 当前处于开启状态的实体 ID 列表。
   * @returns 全屋关闭排除建议洞察项。
   */
  private buildWholeHomeOffInsight(forgottenIds: string[]): ConfigInsightItem {
    const chips = forgottenIds.slice(0, 6).map((id) => ({
      id,
      label: id.split('.').pop() || id,
      meta: '常开',
      title: id,
      variant: 'entity',
      payload: { entityId: id },
    }));
    return {
      domain: 'whole-home-off',
      title: '全屋关闭推荐',
      summary: chips.length ? `建议排除 ${chips.length} 个常开设备` : '排除列表合理',
      hasActionable: chips.length > 0,
      groups: chips.length ? [{ id: 'exclude', label: '建议排除', chips }] : [],
      linkTo: '/settings?tab=general&section=whole-home-off',
      linkLabel: '全屋关闭',
    };
  }
}
