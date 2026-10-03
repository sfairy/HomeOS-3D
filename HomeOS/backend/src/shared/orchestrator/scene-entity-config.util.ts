/**
 * 场景（scene）实体配置工具
 *
 * 原为 common/orchestrator/config.util.ts 的 scene-entity-config.util 段，现独立成文件。
 * 职责：
 * - SceneEntityConfig / SceneFadeConfig 类型定义
 * - 单实体配置 → HA service 调用数据（buildSceneServiceData / resolveSceneEntityAction）
 * - 本地执行展开（expandSceneEntityConfigs：climate 两步、cover position、灯光 N 步渐变）
 * - Builder entities JSON ↔ HA scene Config API entities map 双向转换
 */
import { getEntityDomain } from '@homeos/shared';

/**
 * 场景渐变序列配置：灯光本地 N 步渐亮/渐暗编排。
 * 运行时按 steps 将亮度从 fromBrightness 插值到 toBrightness，
 * 每步间隔 intervalMs（毫秒），替代仅单次 transition 透传的固定渐变。
 */
interface SceneFadeConfig {
  /** 渐变总步数（>=2；小于 2 视为无渐变） */
  steps?: number;
  /** 每步间隔毫秒（缺省 500） */
  intervalMs?: number;
  /** 起始亮度百分比 0-100（缺省 0） */
  fromBrightness?: number;
  /** 目标亮度百分比 0-100（缺省取 config.brightness；均未设置时为 0 → 最后一步关灯） */
  toBrightness?: number;
}

/**
 * SceneEntityConfig：业务接口定义。
 * - 表示：shared/orchestrator/scene-entity-config.util.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface SceneEntityConfig {
  entity_id?: string;
  entityId?: string;
  domain?: string;
  service?: string;
  service_data?: Record<string, unknown>;
  state?: string;
  customState?: string;
  brightness?: number | null;
  colorTemp?: number | null;
  rgbColor?: string;
  transition?: number | null;
  effect?: string;
  position?: number | null;
  temperature?: number | null;
  hvacMode?: string;
  volume?: number | null;
  source?: string;
  percentage?: number | null;
  code?: string;
  option?: string;
  value?: number | null;
  humidity?: number | null;
  fanSpeed?: string;
  delay?: number;
  /** 灯光渐变序列（仅本地执行展开；HA 同步忽略该字段） */
  fade?: SceneFadeConfig | null;
}

function buildSceneServiceData(config: SceneEntityConfig): Record<string, unknown> {
  if (config.service_data) return config.service_data;
  const data: Record<string, unknown> = {};
  const eid = config.entity_id || config.entityId || '';
  const dom = getEntityDomain(eid);
  if (dom === 'light') {
    if (config.brightness != null && config.brightness > 0)
      data.brightness = Math.round((config.brightness / 100) * 255);
    if (config.colorTemp != null && config.colorTemp > 0)
      data.color_temp = Math.round(1000000 / config.colorTemp);
    if (config.rgbColor && config.rgbColor !== '#FFD700') {
      const r = parseInt(config.rgbColor.slice(1, 3), 16);
      const g = parseInt(config.rgbColor.slice(3, 5), 16);
      const b = parseInt(config.rgbColor.slice(5, 7), 16);
      data.rgb_color = [r, g, b];
    }
    if (config.transition != null && config.transition > 0) data.transition = config.transition;
    if (config.effect) data.effect = config.effect;
  }
  if (dom === 'cover' && config.position != null) data.position = config.position;
  if (dom === 'climate') {
    if (config.temperature != null) data.temperature = config.temperature;
    if (config.hvacMode) data.hvac_mode = config.hvacMode;
  }
  if (dom === 'media_player') {
    if (config.volume != null) data.volume_level = config.volume;
    if (config.source) data.source = config.source;
  }
  if (dom === 'fan' && config.percentage != null) data.percentage = config.percentage;
  if (dom === 'input_select' && config.option) data.option = config.option;
  if (dom === 'input_number' && config.value != null) data.value = config.value;
  if (dom === 'humidifier' && config.humidity != null) data.humidity = config.humidity;
  if (dom === 'lock' && config.code) data.code = config.code;
  if (dom === 'vacuum' && config.fanSpeed) data.fan_speed = config.fanSpeed;
  return data;
}

/** 将单实体场景配置解析为可执行的 HA 服务调用（推导 domain / service / data） */
export function resolveSceneEntityAction(config: SceneEntityConfig): {
  entityId: string;
  domain: string;
  service: string;
  data: Record<string, unknown>;
} {
  const entityId = config.entity_id || config.entityId || '';
  const domain = config.domain || getEntityDomain(entityId);
  const state = config.state === '__custom__' ? config.customState || 'on' : config.state || 'on';
  let service = config.service;
  if (!service) {
    if (domain === 'cover')
      service =
        config.position != null
          ? 'set_cover_position'
          : state === 'open'
            ? 'open_cover'
            : state === 'closed'
              ? 'close_cover'
              : 'set_cover_position';
    else if (domain === 'lock') service = state === 'locked' ? 'lock' : 'unlock';
    else if (domain === 'climate') {
      if (state === 'off') service = 'turn_off';
      else if (config.temperature != null && !config.hvacMode) service = 'set_temperature';
      else service = 'set_hvac_mode';
    } else service = state === 'off' ? 'turn_off' : 'turn_on';
  }
  const data = buildSceneServiceData(config);
  // 按 service 裁剪 data，避免 set_hvac_mode 附带 temperature 被 HA 忽略
  if (service === 'set_hvac_mode') {
    const next: Record<string, unknown> = {};
    if (data.hvac_mode != null) next.hvac_mode = data.hvac_mode;
    return { entityId, domain, service, data: next };
  }
  if (service === 'set_temperature') {
    const next: Record<string, unknown> = {};
    if (data.temperature != null) next.temperature = data.temperature;
    return { entityId, domain, service, data: next };
  }
  return { entityId, domain, service, data };
}

/**
 * 将单实体场景配置展开为本地可执行的服务序列。
 * climate：先 set_hvac_mode，再 set_temperature；cover 有 position 时用 set_cover_position。
 */
export function expandSceneEntityConfigs(config: SceneEntityConfig): SceneEntityConfig[] {
  const entityId = config.entity_id || config.entityId || '';
  const domain = config.domain || getEntityDomain(entityId);
  const state = config.state === '__custom__' ? config.customState || '' : config.state || '';

  if (domain === 'climate') {
    if (state === 'off') {
      return [{ ...config, entityId, entity_id: entityId, domain, service: 'turn_off' }];
    }
    const out: SceneEntityConfig[] = [];
    const mode = config.hvacMode || (state && state !== 'on' ? state : '');
    if (mode) {
      out.push({
        entityId,
        entity_id: entityId,
        domain: 'climate',
        service: 'set_hvac_mode',
        hvacMode: mode,
        delay: config.delay,
      });
    }
    if (config.temperature != null) {
      out.push({
        entityId,
        entity_id: entityId,
        domain: 'climate',
        service: 'set_temperature',
        temperature: config.temperature,
      });
    }
    return out.length
      ? out
      : [{ ...config, entityId, entity_id: entityId, domain, service: 'set_hvac_mode' }];
  }

  if (domain === 'cover' && config.position != null) {
    return [{ ...config, entityId, entity_id: entityId, domain, service: 'set_cover_position' }];
  }

  // 灯光渐变序列：本地 N 步渐亮/渐暗编排
  // 将单次 turn_on 展开为 steps 次亮度插值调用，中间步带 intervalMs 延时，
  // 逐步逼近目标亮度；目标为 0 时最后一步改发 turn_off（渐暗至关闭）。
  if (domain === 'light' && config.fade && typeof config.fade === 'object') {
    const stepsRaw = Number(config.fade.steps);
    const steps = Number.isFinite(stepsRaw)
      ? Math.min(Math.max(Math.round(stepsRaw), 2), 60)
      : 0;
    if (steps >= 2) {
      const intervalMsRaw = Number(config.fade.intervalMs);
      const intervalMs = Number.isFinite(intervalMsRaw) && intervalMsRaw > 0 ? intervalMsRaw : 500;
      const clampPct = (v: number) => Math.min(Math.max(Math.round(v), 0), 100);
      const toRaw = Number(config.fade.toBrightness);
      const target = Number.isFinite(toRaw)
        ? clampPct(toRaw)
        : config.brightness != null && config.brightness > 0
          ? clampPct(config.brightness)
          : 0;
      const fromRaw = Number(config.fade.fromBrightness);
      const from = Number.isFinite(fromRaw) ? clampPct(fromRaw) : 0;
      const transition = Math.max(0.1, intervalMs / 1000);
      const out: SceneEntityConfig[] = [];
      for (let k = 1; k <= steps; k++) {
        const isLast = k === steps;
        if (isLast && target === 0) {
          // 最后一步目标为关灯：发 turn_off（剥离亮度/渐变透传）
          out.push({
            ...config,
            entityId,
            entity_id: entityId,
            domain: 'light',
            service: 'turn_off',
            state: 'off',
            brightness: null,
            transition: null,
            delay: intervalMs,
            fade: null,
          });
          continue;
        }
        const brightness = isLast
          ? target
          : Math.max(1, Math.round(from + ((target - from) * k) / steps));
        out.push({
          ...config,
          entityId,
          entity_id: entityId,
          domain: 'light',
          service: 'turn_on',
          state: 'on',
          brightness,
          transition,
          delay: k === 1 ? config.delay ?? 0 : intervalMs,
          fade: null,
        });
      }
      return out;
    }
  }

  return [config];
}

/** Builder JSON 单实体 → HA scene entities map 条目 */
function sceneEntityConfigToHaAttrs(config: SceneEntityConfig): Record<string, unknown> {
  const state = config.state === '__custom__' ? config.customState || 'on' : config.state || 'on';
  return { state, ...buildSceneServiceData(config) };
}

/** 构建器实体 JSON → HA 场景 Config API 的 entities 映射 */
export function builderEntitiesToHaMap(
  entitiesJson: unknown,
): Record<string, Record<string, unknown>> {
  const list = Array.isArray(entitiesJson)
    ? (entitiesJson as SceneEntityConfig[])
    : typeof entitiesJson === 'string'
      ? (JSON.parse(entitiesJson || '[]') as SceneEntityConfig[])
      : [];
  const map: Record<string, Record<string, unknown>> = {};
  for (const e of list) {
    const eid = e.entityId || e.entity_id;
    if (!eid) continue;
    map[eid] = sceneEntityConfigToHaAttrs(e);
  }
  return map;
}

/** HA scene Config API entities map → HomeOS builder entities 数组（可写入 Prisma Json） */
export function haSceneMapToEntities(
  entities: Record<string, Record<string, unknown>>,
): SceneEntityConfig[] {
  const list: SceneEntityConfig[] = [];
  for (const [eid, attrs] of Object.entries(entities)) {
    const e: SceneEntityConfig = { entityId: eid, state: String(attrs.state || 'on') };
    if (typeof attrs.brightness === 'number')
      e.brightness = Math.round((attrs.brightness / 255) * 100);
    else if (typeof attrs.brightness_pct === 'number')
      e.brightness = Math.round(Number(attrs.brightness_pct));
    if (typeof attrs.color_temp === 'number') e.colorTemp = Math.round(1000000 / attrs.color_temp);
    else if (typeof attrs.color_temp_kelvin === 'number')
      e.colorTemp = Math.round(Number(attrs.color_temp_kelvin));
    if (Array.isArray(attrs.rgb_color)) {
      const [r, g, b] = attrs.rgb_color as number[];
      e.rgbColor = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
    if (typeof attrs.transition === 'number') e.transition = attrs.transition;
    if (typeof attrs.effect === 'string') e.effect = attrs.effect;
    if (typeof attrs.position === 'number') e.position = attrs.position;
    if (typeof attrs.temperature === 'number') e.temperature = attrs.temperature;
    if (typeof attrs.hvac_mode === 'string') e.hvacMode = attrs.hvac_mode;
    if (typeof attrs.volume_level === 'number') e.volume = attrs.volume_level;
    if (typeof attrs.source === 'string') e.source = attrs.source;
    if (typeof attrs.percentage === 'number') e.percentage = attrs.percentage;
    if (typeof attrs.option === 'string') e.option = attrs.option;
    if (typeof attrs.value === 'number') e.value = attrs.value;
    if (typeof attrs.humidity === 'number') e.humidity = attrs.humidity;
    if (typeof attrs.code === 'string') e.code = attrs.code;
    if (typeof attrs.fan_speed === 'string') e.fanSpeed = attrs.fan_speed;
    list.push(e);
  }
  return list;
}
