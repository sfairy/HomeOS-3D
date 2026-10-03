/**
 * 家庭模式运行日志缓冲与 JSON 规范化（从 home-mode.internals 拆出）。
 *
 * 所属模块：backend/modules/home-mode
 * 职责：
 *  - HomeModeRuntimeLogStore：内存中的触发日志 / 执行历史缓冲，支持防抖持久化到
 *    runtimeKv 表（500ms debounce），上限由 homeMode 配置控制。
 *  - normalizeHomeModeJsonArray：校验并规范化 config / triggers JSON 数组，
 *    含 entity_id 必填、time 格式、lock_unlock / state 触发器字段校验。
 * 由 HomeModeService 持有 HomeModeRuntimeLogStore 实例并委托调用。
 */
import { badRequest } from '../../common/utils/business-exception';
import { API_ERROR } from '../../common/errors/api-error-messages';
import type { PrismaService } from '../../shared/prisma/service';
import { loadRuntimeKv, persistRuntimeKv } from '../../shared/prisma/runtime-kv.util';
import {
  aggregateHomeModeTriggerLogs,
  normalizeHomeModeTimeAt,
  type HomeModeTriggerLogEntry,
} from '@homeos/shared';
import { clampInt } from '../../common/crud/pagination.util';
import type { Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

// ── home-mode-runtime.util ──
/**
 * HomeModeTriggerLog：业务类型别名。
 * - 表示：modules/home-mode/runtime.internals.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
export type HomeModeTriggerLog = HomeModeTriggerLogEntry;

/** 触发日志过滤条件（服务端过滤，保证分析与分页口径一致） */
export interface HomeModeTriggerLogFilters {
  source?: string;
  success?: boolean;
}

/**
 * HomeModeExecutionRecord：业务接口定义。
 * - 表示：modules/home-mode/runtime.internals.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface HomeModeExecutionRecord {
  id: string;
  modeId: string;
  modeName: string;
  success: boolean;
  executedAt: string;
  source: HomeModeTriggerLog['source'];
  reason?: string;
  executed: number;
  total: number;
  failedItems?: Array<{ entity_id?: string; service?: string; error?: string }>;
}

const HOME_MODE_RUNTIME_CONFIG_ID = 'home-mode-runtime';

type RuntimeLimits = {
  maxTriggerLogs: number;
  maxExecHistory: number;
};

/** 内存中的触发/执行日志缓冲 + 防抖持久化 */
export class HomeModeRuntimeLogStore {
  private triggerLogs: HomeModeTriggerLog[] = [];
  private executionHistory: HomeModeExecutionRecord[] = [];
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly getLimits: () => RuntimeLimits,
  ) {}

  async load(): Promise<void> {
    const { maxTriggerLogs, maxExecHistory } = this.getLimits();
    const data = await loadRuntimeKv<{
      triggerLogs?: HomeModeTriggerLog[];
      executionHistory?: HomeModeExecutionRecord[];
    }>(this.prisma, HOME_MODE_RUNTIME_CONFIG_ID);
    if (Array.isArray(data?.triggerLogs)) {
      this.triggerLogs = data.triggerLogs.slice(0, maxTriggerLogs);
    }
    if (Array.isArray(data?.executionHistory)) {
      this.executionHistory = data.executionHistory.slice(0, maxExecHistory);
    }
  }

  destroy(): void {
    void this.flushNow();
  }

  /** 取消 debounce 并立刻落库（关机 / 热更新前调用，避免丢最后一批日志） */
  async flushNow(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    persistRuntimeKv(
      this.logger,
      '家庭模式运行日志持久化',
      this.prisma,
      HOME_MODE_RUNTIME_CONFIG_ID,
      {
        triggerLogs: this.triggerLogs,
        executionHistory: this.executionHistory,
      },
    );
  }

  pushTriggerLog(entry: Omit<HomeModeTriggerLog, 'id' | 'executedAt'>): void {
    const { maxTriggerLogs } = this.getLimits();
    this.triggerLogs.unshift({
      ...entry,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      executedAt: new Date().toISOString(),
    });
    if (this.triggerLogs.length > maxTriggerLogs) {
      this.triggerLogs.length = maxTriggerLogs;
    }
    this.schedulePersist();
  }

  /** 追加一条执行历史到缓冲头部，超限时截断，并调度防抖持久化 */
  recordExecution(entry: Omit<HomeModeExecutionRecord, 'id' | 'executedAt'>): void {
    const { maxExecHistory } = this.getLimits();
    this.executionHistory.unshift({
      ...entry,
      id: `hm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      executedAt: new Date().toISOString(),
    });
    if (this.executionHistory.length > maxExecHistory) {
      this.executionHistory.length = maxExecHistory;
    }
    this.schedulePersist();
  }

  getTriggerLogs(limit = 20): HomeModeTriggerLog[] {
    const { maxTriggerLogs } = this.getLimits();
    return this.triggerLogs.slice(0, clampInt(limit, 1, maxTriggerLogs));
  }

  getTriggerLogsPaginated(
    page = 1,
    pageSize = 20,
    filters: HomeModeTriggerLogFilters = {},
  ) {
    const { maxTriggerLogs } = this.getLimits();
    const filtered = this.triggerLogs.filter((log) => {
      if (filters.source && String(log.source || 'manual') !== filters.source) return false;
      if (filters.success === true && log.success === false) return false;
      if (filters.success === false && log.success !== false) return false;
      return true;
    });
    const total = filtered.length;
    const safePage = Math.max(1, page);
    const safeSize = clampInt(pageSize, 1, maxTriggerLogs);
    const start = (safePage - 1) * safeSize;
    return {
      items: filtered.slice(start, start + safeSize),
      total,
      page: safePage,
      pageSize: safeSize,
      totalPages: Math.max(1, Math.ceil(total / safeSize)),
      // 分析基于完整过滤集合，避免「Hero 用全量、图表用当前页」口径不一致
      analytics: aggregateHomeModeTriggerLogs(filtered),
    };
  }

  getExecutionHistory(limit = 30): HomeModeExecutionRecord[] {
    const { maxExecHistory } = this.getLimits();
    return this.executionHistory.slice(0, clampInt(limit, 1, maxExecHistory));
  }

  clearExecutionHistory(): { deleted: number } {
    const deleted = this.executionHistory.length;
    this.executionHistory.length = 0;
    this.schedulePersist();
    return { deleted };
  }

  findExecutionByModeId(modeId: string): HomeModeExecutionRecord | undefined {
    return this.executionHistory.find((e) => e.modeId === modeId);
  }

  getLatestExecution(): HomeModeExecutionRecord | undefined {
    return this.executionHistory[0];
  }

  trimToLimits(): void {
    const { maxTriggerLogs, maxExecHistory } = this.getLimits();
    if (this.triggerLogs.length > maxTriggerLogs) {
      this.triggerLogs.length = maxTriggerLogs;
    }
    if (this.executionHistory.length > maxExecHistory) {
      this.executionHistory.length = maxExecHistory;
    }
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      persistRuntimeKv(
        this.logger,
        '家庭模式运行日志持久化',
        this.prisma,
        HOME_MODE_RUNTIME_CONFIG_ID,
        {
          triggerLogs: this.triggerLogs,
          executionHistory: this.executionHistory,
        },
      );
    }, 500);
  }
}

// ── home-mode-mode-json.util ──
/** 校验并规范化家庭模式 config/triggers JSON 数组（返回可写入 Prisma Json 的数组） */
export function normalizeHomeModeJsonArray(
  raw: unknown,
  label: string,
  requireEntityId = false,
): Prisma.InputJsonValue | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    badRequest(API_ERROR.VALIDATION_JSON_ARRAY_TYPE(label));
  }
  const parsed = raw;
  parsed.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      badRequest(API_ERROR.VALIDATION_ARRAY_ITEM_INVALID(label, i));
    }
    const row = item as Record<string, unknown>;
    if (requireEntityId && !String(row.entity_id || '').trim()) {
      badRequest(API_ERROR.VALIDATION_ARRAY_ITEM_ENTITY_ID(label, i));
    }
    if (!requireEntityId) {
      const type = String(row.type || '').trim();
      if (!type) {
        badRequest(API_ERROR.VALIDATION_ARRAY_ITEM_TYPE(label, i));
      }
      if (type === 'time') {
        const at = normalizeHomeModeTimeAt(String(row.at || ''));
        if (!at) {
          badRequest(API_ERROR.VALIDATION_ARRAY_ITEM_TIME(label, i));
        }
        row.at = at;
      }
      if (type === 'lock_unlock' && !String(row.entityId || '').trim()) {
        badRequest(API_ERROR.VALIDATION_ARRAY_ITEM_LOCK_ENTITY(label, i));
      }
      if (type === 'state') {
        if (!String(row.entityId || '').trim()) {
          badRequest(API_ERROR.VALIDATION_ARRAY_ITEM_STATE_ENTITY(label, i));
        }
        if (!String(row.to || '').trim()) {
          badRequest(API_ERROR.VALIDATION_ARRAY_ITEM_STATE_TO(label, i));
        }
      }
    }
  });
  return parsed as Prisma.InputJsonValue;
}
