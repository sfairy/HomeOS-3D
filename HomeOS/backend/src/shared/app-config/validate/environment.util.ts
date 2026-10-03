/**
 * @file environment.util.ts
 * @module backend/src/shared/app-config/validate
 */
/** 应用配置校验：用水、昼夜节律、自适应气候、天气特效、环境传感器映射 */
import {
  AppConfigFieldError,
  numIn,
  requireBool,
  validateOptionalEntityId,
  validateOptionalNonEmptyString,
} from './primitives.util';

/** 校验 IAQ（室内空气质量）配置段。 */
export function validateIaqSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('iaqAlertThreshold' in partial)
    numIn(section, 'iaqAlertThreshold', partial.iaqAlertThreshold, 1, 100, errors);
  if ('moldAlertCooldownMin' in partial)
    numIn(section, 'moldAlertCooldownMin', partial.moldAlertCooldownMin, 1, 1440, errors);
  if ('iaqTargetTemp' in partial) numIn(section, 'iaqTargetTemp', partial.iaqTargetTemp, 10, 35, errors);
  if ('iaqTargetHumidity' in partial)
    numIn(section, 'iaqTargetHumidity', partial.iaqTargetHumidity, 10, 90, errors);
  for (const k of [
    'iaqWeightPm25',
    'iaqWeightCo2',
    'iaqWeightTvoc',
    'iaqWeightTemp',
    'iaqWeightHumidity',
  ] as const) {
    if (k in partial) numIn(section, k, partial[k], 0, 100, errors);
  }
  for (const k of ['linkageIaqFanEntityId', 'linkageDehumidifierEntityId'] as const) {
    if (k in partial) validateOptionalEntityId(section, k, partial[k], errors);
  }
  for (const k of ['linkageMoldSceneId', 'linkageIaqSceneId'] as const) {
    if (k in partial) validateOptionalNonEmptyString(section, k, partial[k], errors);
  }
}

// ── 用水 ── ────────────────────
/** 校验用水配置段。 */
export function validateWaterSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('continuousFlowCount' in partial)
    numIn(section, 'continuousFlowCount', partial.continuousFlowCount, 1, 100, errors);
  if ('dailyLimitM3' in partial)
    numIn(section, 'dailyLimitM3', partial.dailyLimitM3, 0.1, 100, errors);
  if ('anomalyCooldownMin' in partial)
    numIn(section, 'anomalyCooldownMin', partial.anomalyCooldownMin, 1, 1440, errors);
  if ('mainValveEntityId' in partial)
    validateOptionalEntityId(section, 'mainValveEntityId', partial.mainValveEntityId, errors);
  if ('linkageWaterEnabled' in partial)
    requireBool(section, 'linkageWaterEnabled', partial.linkageWaterEnabled, errors);
  for (const k of ['linkageWaterAnomalySceneId', 'linkageWaterAnomalyModeId'] as const) {
    if (k in partial) validateOptionalNonEmptyString(section, k, partial[k], errors);
  }
  if ('linkageWaterAnomalyCooldownMin' in partial)
    numIn(section, 'linkageWaterAnomalyCooldownMin', partial.linkageWaterAnomalyCooldownMin, 1, 1440, errors);
}

// ── 昼夜节律 ── ────────────────────
/** 校验昼夜节律配置段（光照反馈、预报预调、分房间与学习覆盖开关、目标照度） */
export function validateCircadianSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  for (const k of [
    'luxFeedbackEnabled',
    'forecastPreAdjust',
    'perRoomEnabled',
    'overrideLearningEnabled',
  ] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('luxTargetDay' in partial)
    numIn(section, 'luxTargetDay', partial.luxTargetDay, 50, 2000, errors);
  if ('weatherEntityId' in partial)
    validateOptionalEntityId(section, 'weatherEntityId', partial.weatherEntityId, errors);
}

// ── 自适应气候 ── ────────────────────
/** 校验自适应气候配置段。 */
export function validateAdaptiveClimateSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  for (const k of [
    'forecastPreAdjust',
    'perRoomEnabled',
    'overrideLearningEnabled',
    'autoApplyEnabled',
  ] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('closedLoopToleranceC' in partial) {
    numIn(section, 'closedLoopToleranceC', partial.closedLoopToleranceC, 0.1, 3, errors);
  }
  if ('autoApplyIntervalMin' in partial) {
    numIn(section, 'autoApplyIntervalMin', partial.autoApplyIntervalMin, 5, 1440, errors);
  }
  if ('manualHoldMin' in partial) {
    numIn(section, 'manualHoldMin', partial.manualHoldMin, 0, 1440, errors);
  }
}

// ── 天气特效 ── ────────────────────
/** scenes.* 分字段校验范围（0–2 通用规则不适用于 ms / 层数等） */
const SCENE_FIELD_RANGES: Record<string, { min: number; max: number }> = {
  lightningMinMs: { min: 800, max: 8000 },
  lightningMaxMs: { min: 3000, max: 20000 },
  fogLayers: { min: 1, max: 6 },
  rainRatio: { min: 0, max: 1 },
  snowRatio: { min: 0, max: 1 },
  puddle: { min: 0, max: 1 },
};

const DEFAULT_SCENE_RANGE = { min: 0, max: 2 };

function sceneNum(
  section: string,
  prefix: string,
  key: string,
  val: unknown,
  errors: AppConfigFieldError[],
) {
  if (typeof val !== 'number') {
    errors.push({ section, key: `${prefix}.${key}`, message: '必须为数字' });
    return;
  }
  const range = SCENE_FIELD_RANGES[key] || DEFAULT_SCENE_RANGE;
  numIn(section, `${prefix}.${key}`, val, range.min, range.max, errors);
}

/** 校验天气特效配置段。 */
export function validateWeatherEffectsSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  for (const k of ['enabled', 'useEntityAttributes'] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('densityMultiplier' in partial)
    numIn(section, 'densityMultiplier', partial.densityMultiplier, 0.3, 2, errors);
  if ('windMultiplier' in partial)
    numIn(section, 'windMultiplier', partial.windMultiplier, 0, 3, errors);
  if ('attributeBlend' in partial)
    numIn(section, 'attributeBlend', partial.attributeBlend, 0, 1, errors);
  if ('starCount' in partial) numIn(section, 'starCount', partial.starCount, 50, 800, errors);
  if ('cloudLayers' in partial) numIn(section, 'cloudLayers', partial.cloudLayers, 2, 12, errors);
  if ('shootingStarRate' in partial)
    numIn(section, 'shootingStarRate', partial.shootingStarRate, 0, 0.01, errors);

  if ('displayRoutes' in partial) {
    const routes = partial.displayRoutes;
    if (!Array.isArray(routes)) {
      errors.push({ section, key: 'displayRoutes', message: 'displayRoutes 必须为字符串数组' });
    } else {
      for (let i = 0; i < routes.length; i++) {
        const r = routes[i];
        if (typeof r !== 'string' || !String(r).trim()) {
          errors.push({ section, key: `displayRoutes[${i}]`, message: '路由标识不能为空' });
        }
      }
    }
  }

  const scenes = partial.scenes;
  if (scenes && typeof scenes === 'object' && !Array.isArray(scenes)) {
    const s = scenes as Record<string, Record<string, unknown>>;
    for (const [sceneKey, sceneVal] of Object.entries(s)) {
      if (!sceneVal || typeof sceneVal !== 'object') continue;
      for (const [field, val] of Object.entries(sceneVal)) {
        sceneNum(section, `scenes.${sceneKey}`, field, val, errors);
      }
    }
  }
}

// ── 环境传感器映射 ── ────────────────────
const ENTITY_ID_RE = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/i;

/** 校验环境传感器映射配置段（按房间校验传感器标签与 entity_id 合法性） */
export function validateEnvSensorMapSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  for (const [roomId, entryRaw] of Object.entries(partial)) {
    if (!roomId.trim()) {
      errors.push({ section, key: roomId, message: '房间 ID 不能为空' });
      continue;
    }
    if (!entryRaw || typeof entryRaw !== 'object' || Array.isArray(entryRaw)) {
      errors.push({ section, key: roomId, message: '须为对象' });
      continue;
    }
    const entry = entryRaw as Record<string, unknown>;
    if (entry._hidden != null && typeof entry._hidden !== 'boolean') {
      errors.push({ section, key: `${roomId}._hidden`, message: '须为布尔值' });
    }
    for (const field of ['label', 'temperature', 'humidity', 'pm25', 'co2', 'tvoc'] as const) {
      const val = entry[field];
      if (val == null || val === '') continue;
      if (typeof val !== 'string') {
        errors.push({ section, key: `${roomId}.${field}`, message: '须为字符串' });
        continue;
      }
      if (field !== 'label' && !ENTITY_ID_RE.test(val.trim())) {
        errors.push({ section, key: `${roomId}.${field}`, message: '须为合法 entity_id' });
      }
    }
  }
}
