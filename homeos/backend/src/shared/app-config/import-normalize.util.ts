/**
 * 应用配置导入规范化工具：备份/导入前修正越界值、剥离遗留键，避免阻断校验。
 *
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

/**
 * schema v17 下线的字段 → 从持久化/备份中剥离，避免旧值残留后再被写回。
 * 键为分区名，值为该分区内已下线的字段名。
 * 注：整段下线的分区（intelligence / automation / device）由 stripUnknownSections 统一剥离。
 */
const REMOVED_CONFIG_KEYS: Record<string, readonly string[]> = {
  security: [
    'bathroomLongStayHighMin',
    'bathroomLongStayMediumMin',
    'bedroomInactiveHours',
    'deepNightStart',
    'deepNightEnd',
    'nightStart',
    'nightEnd',
    'wholeHouseInactiveDayHours',
    'wholeHouseInactiveNightHours',
    'kitchenStayWarnMin',
    'anomalyCooldownMin',
    'anomalyPeriodicIntervalMin',
  ],
  circadian: [
    'luxFeedbackEnabled',
    'forecastPreAdjust',
    'perRoomEnabled',
    'overrideLearningEnabled',
    'luxTargetDay',
  ],
  water: [
    'linkageWaterEnabled',
    'linkageWaterAnomalySceneId',
    'linkageWaterAnomalyModeId',
    'linkageWaterAnomalyCooldownMin',
    'continuousFlowCount',
    'dailyLimitM3',
  ],
  iaq: [
    'iaqTargetTemp',
    'iaqTargetHumidity',
    'iaqWeightPm25',
    'iaqWeightCo2',
    'iaqWeightTvoc',
    'iaqWeightTemp',
    'iaqWeightHumidity',
    'iaqAlertThreshold',
    'linkageIaqSceneId',
    'linkageMoldSceneId',
    'linkageIaqFanEntityId',
    'linkageDehumidifierEntityId',
  ],
  energy: [
    'linkageEnabled',
    'linkageBudgetModeId',
    'linkageAnomalySceneId',
    'linkageClimateApply',
    'linkageWaterHeaterEco',
    'meterAnchorKwh',
    'meterAnchorMonth',
    'meterAnchorEntityId',
    'meterAnchorUpdatedAt',
    'storageDispatchEnabled',
    'storageDispatchBatteryEntityId',
    'storageDispatchChargeEntities',
    'storageDispatchDischargeEntities',
    'storageDispatchChargeSocTarget',
    'storageDispatchDischargeSocThreshold',
    'storageDispatchDischargeSocMin',
    'storageDispatchCooldownMin',
    'baselineSize',
    'sustainedMs',
    'standbyThresholdW',
    'spikeRatio',
    'linkageWaterHeaterEntityId',
  ],
  pricing: ['tier2Kwh'],
  frontend: ['defaultWidgetPollMs'],
  ops: ['orchestratorImportMaxRetry', 'sceneOverlayUndoTtlMin'],
};

/** 已下线字段中位于 Record 子对象里的键：[分区, Record 字段, 子键] */
const REMOVED_RECORD_KEYS: ReadonlyArray<readonly [string, string, string]> = [];

/** 剥离 schema v17 下线字段（含分区内嵌套 Record 键），避免旧值随持久化长期残留 */
function stripRemovedConfigKeys(config: Record<string, unknown>, changes: string[]): void {
  for (const [section, keys] of Object.entries(REMOVED_CONFIG_KEYS)) {
    const sec = config[section];
    if (!sec || typeof sec !== 'object' || Array.isArray(sec)) continue;
    for (const key of keys) {
      if (key in sec) {
        Reflect.deleteProperty(sec, key);
        changes.push(`${section}.${key}: 已移除（字段下线）`);
      }
    }
  }
  for (const [section, record, key] of REMOVED_RECORD_KEYS) {
    const sec = config[section];
    if (!sec || typeof sec !== 'object' || Array.isArray(sec)) continue;
    const rec = (sec as Record<string, unknown>)[record];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    if (key in rec) {
      Reflect.deleteProperty(rec, key);
      changes.push(`${section}.${record}.${key}: 已移除（字段下线）`);
    }
  }
}

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
  stripRemovedConfigKeys(config, changes);
  const frontend = config.frontend;
  if (frontend && typeof frontend === 'object' && !Array.isArray(frontend)) {
    const fe = frontend as Record<string, unknown>;
    changes.push(...normalizeFrontendNumericFields(fe));
    stripFrontendLayoutOnlyKeys(fe, changes);
  }
  return { config, changes };
}
