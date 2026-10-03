/**
 * 应用配置导入规范化工具：备份/导入前修正越界值、剥离遗留键，避免阻断校验。
 *
 * 所属模块：backend/src/shared/app-config
 * 职责：
 *   - normalizeAppConfigForImport：备份/导入前规范化运行参数入口；
 *   - stripUnknownSections：剥离 schema 外顶层分区（如历史空分区 weather）；
 *   - normalizeRebuildDebounceMs：将 frontend.rebuildDebounceMs clamp 至合法范围；
 *   - stripFrontendLayoutOnlyKeys：剥离应属于 ProjectConfig.layout 的布局字段。
 * 关键依赖：./defaults#DEFAULT_APP_CONFIG（已知分区集合与默认值基准）。
 */
import { DEFAULT_APP_CONFIG } from './defaults';

/** rebuildDebounceMs 合法区间上下限与默认值（超出时 clamp） */
const REBUILD_DEBOUNCE_MIN = 10;
const REBUILD_DEBOUNCE_MAX = 2000;
const REBUILD_DEBOUNCE_DEFAULT = DEFAULT_APP_CONFIG.frontend.rebuildDebounceMs;

/** 历史上误写入 AppConfig.frontend 的布局字段（应在 ProjectConfig.layout）；导入时剥离 */
const FRONTEND_LAYOUT_ONLY_KEYS = ['glassEffect', 'floorplanRenderer', 'performanceMode'] as const;

/** 当前 schema 允许的顶层分区（备份里偶发残留空的 weather 等遗留键） */
const KNOWN_APP_CONFIG_SECTIONS = new Set(Object.keys(DEFAULT_APP_CONFIG));

/** 校验并修正 frontend.rebuildDebounceMs：空/非数字取默认值，越界时 clamp 至合法区间 */
function normalizeRebuildDebounceMs(frontend: Record<string, unknown>, changes: string[]): void {
  if ('rebuildDebounceMs' in frontend) {
    const raw = frontend.rebuildDebounceMs;
    if (raw == null || raw === '') {
      frontend.rebuildDebounceMs = REBUILD_DEBOUNCE_DEFAULT;
      changes.push(
        `frontend.rebuildDebounceMs: 无效值 ${JSON.stringify(raw)} → ${REBUILD_DEBOUNCE_DEFAULT}`,
      );
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        frontend.rebuildDebounceMs = REBUILD_DEBOUNCE_DEFAULT;
        changes.push(
          `frontend.rebuildDebounceMs: 无效值 ${JSON.stringify(raw)} → ${REBUILD_DEBOUNCE_DEFAULT}`,
        );
      } else if (n < REBUILD_DEBOUNCE_MIN || n > REBUILD_DEBOUNCE_MAX) {
        const clamped = Math.min(REBUILD_DEBOUNCE_MAX, Math.max(REBUILD_DEBOUNCE_MIN, n));
        frontend.rebuildDebounceMs = clamped;
        changes.push(
          `frontend.rebuildDebounceMs: ${n} → ${clamped}（clamp 至 ${REBUILD_DEBOUNCE_MIN}–${REBUILD_DEBOUNCE_MAX}）`,
        );
      }
    }
  }
}

/** 剥离应属于显示方案 layout 的字段（非运行参数），避免导入后污染 frontend 分区 */
function stripFrontendLayoutOnlyKeys(frontend: Record<string, unknown>, changes: string[]): void {
  for (const key of FRONTEND_LAYOUT_ONLY_KEYS) {
    if (!(key in frontend)) continue;
    Reflect.deleteProperty(frontend, key);
    changes.push(`frontend.${key}: 已移除（属于显示方案 layout，非运行参数）`);
  }
}

/** 剥离 schema 外顶层分区（如历史空分区 weather），避免还原时报「未知配置分区」 */
function stripUnknownSections(config: Record<string, unknown>, changes: string[]): void {
  for (const key of Object.keys(config)) {
    if (KNOWN_APP_CONFIG_SECTIONS.has(key)) continue;
    Reflect.deleteProperty(config, key);
    changes.push(`${key}: 已忽略未知配置分区`);
  }
}

/** 修正 frontend 分区数值（DB 加载与导入共用） */
function normalizeFrontendNumericFields(frontend: Record<string, unknown>): string[] {
  const changes: string[] = [];
  normalizeRebuildDebounceMs(frontend, changes);
  return changes;
}

/** 备份/导入前规范化运行参数，避免越界值阻断校验 */
export function normalizeAppConfigForImport(config: Record<string, unknown>): {
  config: Record<string, unknown>;
  changes: string[];
} {
  const changes: string[] = [];
  stripUnknownSections(config, changes);
  const frontend = config.frontend;
  if (frontend && typeof frontend === 'object' && !Array.isArray(frontend)) {
    const fe = frontend as Record<string, unknown>;
    changes.push(...normalizeFrontendNumericFields(fe));
    stripFrontendLayoutOnlyKeys(fe, changes);
  }
  return { config, changes };
}
