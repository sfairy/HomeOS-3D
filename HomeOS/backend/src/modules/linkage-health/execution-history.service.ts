/**
 * 统一执行历史聚合服务
 *
 * 所属模块：linkage-health（由 LinkageHealthModule 提供）
 * 职责：将自动化、场景、脚本、告警通知、家庭模式五类来源的执行历史合并为统一时间线，
 *  支持分页查询与按类型清理。
 * 依赖：
 *  - AutomationEngineService / SceneService / ScriptService：获取各自执行历史；
 *  - NotificationService：获取告警类通知作为"告警"来源；
 *  - HomeModeService：获取家庭模式切换记录；
 *  - AppConfigService：解析统一历史条数上限（ops 配置）。
 */
import { Injectable } from '@nestjs/common';
import { executionAlertSourceLabel } from '@homeos/shared';
import { AppConfigService } from '../../shared/app-config/service';
import { resolveOrchestratorHistoryLimit } from '../../common/database/event-log-retention.util';
import {
  alertSuccessFromLevel,
  EXECUTION_HISTORY_ALERT_SOURCES,
  sortAndLimitExecutionRecords,
} from './execution-history.util';
import { AutomationEngineService } from '../automation/engine.service';
import { SceneService } from '../scene/service';
import { NotificationService } from '../notification/service';
import { HomeModeService } from '../home-mode/service';
import { ScriptService } from '../script/service';

/** 统一执行记录的类型：自动化 / 场景 / 脚本 / 告警 / 家庭模式 */
export type ExecutionRecordType = 'automation' | 'scene' | 'script' | 'alert' | 'home_mode';

/**
 * 统一执行记录（跨来源归一化后的结构）。
 *
 * 各来源的原始记录形态不同，这里统一为 id/type/name/success/executedAt/detail/meta，
 * 便于前端按时间线展示与筛选。
 */
export interface UnifiedExecutionRecord {
  id: string;
  type: ExecutionRecordType;
  name: string;
  success: boolean;
  executedAt: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

/**
 * 统一执行历史聚合服务（可注入）。
 *
 * 通过并行拉取多来源历史、归一化为统一记录、按时间倒序合并截断，
 * 为前端"执行历史"面板与运维审计提供单一数据入口。
 */
@Injectable()
export class ExecutionHistoryService {
  constructor(
    private readonly automationEngine: AutomationEngineService,
    private readonly sceneService: SceneService,
    private readonly notificationService: NotificationService,
    private readonly homeModeService: HomeModeService,
    private readonly scriptService: ScriptService,
    private readonly appConfig: AppConfigService,
  ) {}

  /** 统一历史上限（来自 ops 配置，所有查询均会被夹在该上限内）。 */
  private get unifiedLimit(): number {
    return resolveOrchestratorHistoryLimit(this.appConfig.get('ops'));
  }

  /**
   * 获取合并后的统一执行历史。
   *
   * 策略：将请求条数 take 均分到 5 个来源（向上取整），并行拉取后归一化合并，
   * 再按 executedAt 倒序截断到 take 条。take 会被夹在 [1, unifiedLimit] 区间。
   *
   * @param limit 期望返回的条数（缺省使用 unifiedLimit）。
   * @returns 统一执行记录数组（按时间倒序）。
   */
  async getUnifiedHistory(limit?: number): Promise<UnifiedExecutionRecord[]> {
    const take = Math.min(Math.max(limit ?? this.unifiedLimit, 1), this.unifiedLimit);
    // 每个来源至少取 take/5 条，保证合并后能填满 take
    const perSource = Math.ceil(take / 5);

    const [automations, scenes, scripts, alerts, homeModes] = await Promise.all([
      this.automationEngine.getExecutionHistory(undefined, perSource),
      this.sceneService.getExecutionHistory(perSource),
      this.scriptService.getExecutionHistory(perSource),
      this.notificationService.getNotificationsBySources(
        [...EXECUTION_HISTORY_ALERT_SOURCES],
        perSource,
      ),
      Promise.resolve(this.homeModeService.getExecutionHistory(perSource)),
    ]);

    const records: UnifiedExecutionRecord[] = [];

    // 自动化：trace 中 ok===false 的步骤计为失败，detail 优先用错误信息或失败步数
    for (const row of automations) {
      const trace = (Array.isArray(row.trace) ? row.trace : []) as Array<{ ok?: boolean }>;
      const failed = trace.filter((t) => t.ok === false);
      records.push({
        id: `auto-${row.id}`,
        type: 'automation',
        name: row.name || row.automationId,
        success: row.success,
        executedAt: row.executedAt,
        detail: row.error || (failed.length ? `${failed.length} 步失败` : undefined),
        meta: { automationId: row.automationId, traceSteps: trace.length, trace },
      });
    }

    // 场景：无错误时展示"成功/总数"，有错误时同样展示进度
    for (const row of scenes) {
      records.push({
        id: `scene-${row.id}`,
        type: 'scene',
        name: row.sceneName,
        success: row.success,
        executedAt: row.executedAt,
        detail: row.errors?.length
          ? `${row.executed}/${row.total} 成功`
          : `${row.executed}/${row.total}`,
        meta: { sceneId: row.sceneId, errors: row.errors },
      });
    }

    // 脚本：同场景逻辑
    for (const row of scripts) {
      records.push({
        id: `script-${row.id}`,
        type: 'script',
        name: row.scriptName,
        success: row.success,
        executedAt: row.executedAt,
        detail: row.errors?.length
          ? `${row.executed}/${row.total} 成功`
          : `${row.executed}/${row.total}`,
        meta: { scriptId: row.scriptId, errors: row.errors },
      });
    }

    // 告警：由通知来源标签作为名称，级别为 danger 视为失败
    for (const row of alerts) {
      records.push({
        id: `alert-${row.id}`,
        type: 'alert',
        name: executionAlertSourceLabel(row.source),
        success: alertSuccessFromLevel(row.level),
        executedAt: row.createdAt,
        detail: row.message,
        meta: { level: row.level, entityId: row.entityId, source: row.source },
      });
    }

    // 家庭模式：detail 优先用切换原因，否则展示动作进度
    for (const row of homeModes) {
      records.push({
        id: `home-${row.id}`,
        type: 'home_mode',
        name: row.modeName,
        success: row.success,
        executedAt: row.executedAt,
        detail: row.reason || `${row.executed}/${row.total} 成功`,
        meta: { modeId: row.modeId, source: row.source },
      });
    }

    return sortAndLimitExecutionRecords(records, take);
  }

  /**
   * 清理统一执行历史。
   *
   * 不传 type 时清理全部五类来源；传入 type 时仅清理对应来源。
   * 各来源清理并行执行，返回累计删除条数。
   *
   * @param type 可选，仅清理指定类型的历史。
   * @returns { deleted } 累计删除条数。
   */
  async clearUnifiedHistory(type?: ExecutionRecordType): Promise<{ deleted: number }> {
    const tasks: Promise<{ deleted: number }>[] = [];

    if (!type || type === 'automation') {
      tasks.push(this.automationEngine.clearExecutionHistory());
    }
    if (!type || type === 'scene') {
      tasks.push(this.sceneService.clearExecutionHistory());
    }
    if (!type || type === 'script') {
      tasks.push(this.scriptService.clearExecutionHistory());
    }
    if (!type || type === 'alert') {
      tasks.push(this.notificationService.clearBySources([...EXECUTION_HISTORY_ALERT_SOURCES]));
    }
    if (!type || type === 'home_mode') {
      tasks.push(Promise.resolve(this.homeModeService.clearExecutionHistory()));
    }

    const results = await Promise.all(tasks);
    return { deleted: results.reduce((sum, row) => sum + row.deleted, 0) };
  }

  /**
   * 分页获取统一执行历史。
   *
   * 先拉取最多 cap*2（上限 200）条合并记录，再在内存中切片分页，
   * 适用于历史总量受 cap 限制、无需深分页的场景。
   *
   * @param page 页码（从 1 起，小于 1 视为 1）。
   * @param pageSize 每页条数（夹在 [1, cap] 区间）。
   * @returns 分页结果 { items, total, page, pageSize, totalPages }。
   */
  async getUnifiedHistoryPaginated(page = 1, pageSize = 20) {
    const safePage = Math.max(1, page);
    const cap = this.unifiedLimit;
    const safeSize = Math.min(Math.max(pageSize, 1), cap);
    const merged = await this.getUnifiedHistory(Math.min(cap * 2, 200));
    const total = merged.length;
    const start = (safePage - 1) * safeSize;
    return {
      items: merged.slice(start, start + safeSize),
      total,
      page: safePage,
      pageSize: safeSize,
      totalPages: Math.max(1, Math.ceil(total / safeSize)),
    };
  }
}