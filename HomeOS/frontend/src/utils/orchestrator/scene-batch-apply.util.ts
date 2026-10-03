/**
 * 场景批量参数应用工具
 *
 * 职责：
 * - 按各 domain 的合理默认值填充批量预设（仅当用户未设置时）。
 * - 根据批量参数把字段写到单个场景实体表单。
 *
 * 依赖：
 * - @/utils/orchestrator/scene-yaml-builder.util 的 domain 判定。
 * - @/utils/orchestrator/scene-yaml-form.util 的 SceneEntityForm 类型。
 *
 * 注意：domain / 字段名为 HA 配置值，不翻译；state='__nochange__' 表示保持原状态。
 */
import {
  isAlarmControlDomain,
  isClimateDomain,
  isCoverDomain,
  isFanDomain,
  isHumidifierDomain,
  isInputNumberDomain,
  isInputSelectDomain,
  isLightDomain,
  isLockDomain,
  isMediaDomain,
  isVacuumDomain,
} from '@/utils/orchestrator/scene-yaml-builder.util'
import type { SceneEntityForm } from '@/utils/orchestrator/scene-yaml-form.util'

/** 场景批量参数：覆盖各 domain 可能的字段（null / 空串表示不修改） */
interface SceneBatchParams {
  state: string
  brightness: number | null
  colorTemp: number | null
  /** 灯光颜色；空字符串表示不设置 */
  rgbColor: string
  transition: number | null
  effect: string
  position: number | null
  temperature: number | null
  hvacMode: string
  volume: number | null
  source: string
  fanPercentage: number | null
  option: string
  value: number | null
  humidity: number | null
  code: string
  fanSpeed: string
}

/** 各 domain 批量预设的推荐默认值（与 SceneEntityParamsPanel 语义对齐） */
const SCENE_BATCH_PRESET_DEFAULTS: Partial<
  Record<
    string,
    Partial<
      Pick<
        SceneBatchParams,
        | 'brightness'
        | 'colorTemp'
        | 'position'
        | 'temperature'
        | 'fanPercentage'
        | 'humidity'
        | 'volume'
      >
    >
  >
> = {
  light: { brightness: 80, colorTemp: 4000 },
  climate: { temperature: 24 },
  cover: { position: 100 },
  fan: { fanPercentage: 50 },
  humidifier: { humidity: 50 },
  media_player: { volume: 0.5 },
}

/** 批量预设的数值字段子集 */
type BatchPresetNumericFields = Pick<
  SceneBatchParams,
  'brightness' | 'colorTemp' | 'position' | 'temperature' | 'fanPercentage' | 'humidity' | 'volume'
>

/** 仅填充仍为 null 的字段，避免覆盖用户已调节的值 */
export function applyPresetDefaultsForDomain(
  domain: string,
  current: BatchPresetNumericFields,
): BatchPresetNumericFields {
  const defs = SCENE_BATCH_PRESET_DEFAULTS[domain]
  if (!defs) return { ...current }
  const out = { ...current }
  for (const key of Object.keys(defs) as (keyof typeof defs)[]) {
    if (out[key] == null && defs[key] != null) out[key] = defs[key]!
  }
  return out
}

/**
 * 根据批量参数填充单个场景实体表单字段。
 *
 * - state='__nochange__' 时保留原状态。
 * - 按 entityId 所属 domain 写入对应字段，null / 空串字段跳过。
 * - 返回新的 SceneEntityForm（不修改入参 base）。
 */
export function applyBatchParamsToSceneEntity(
  entityId: string,
  batch: SceneBatchParams,
  base: SceneEntityForm,
): SceneEntityForm {
  const ent = { ...base, entityId }
  if (batch.state !== '__nochange__') ent.state = batch.state
  if (isLightDomain(entityId)) {
    if (batch.brightness != null) ent.brightness = batch.brightness
    if (batch.colorTemp != null) ent.colorTemp = batch.colorTemp
    if (batch.rgbColor && /^#[0-9a-fA-F]{6}$/.test(batch.rgbColor)) {
      ent.rgbColor = batch.rgbColor
    }
    if (batch.transition != null && batch.transition >= 0) ent.transition = batch.transition
    if (batch.effect) ent.effect = batch.effect
  }
  if (isCoverDomain(entityId) && batch.position != null) ent.position = batch.position
  if (isClimateDomain(entityId)) {
    if (batch.temperature != null) ent.temperature = batch.temperature
    if (batch.hvacMode) ent.hvacMode = batch.hvacMode
  }
  if (isMediaDomain(entityId)) {
    if (batch.volume != null) ent.volume = batch.volume
    if (batch.source) ent.source = batch.source
  }
  if (isFanDomain(entityId) && batch.fanPercentage != null) ent.percentage = batch.fanPercentage
  if (isInputSelectDomain(entityId) && batch.option) ent.option = batch.option
  if (isInputNumberDomain(entityId) && batch.value != null) ent.value = batch.value
  if (isHumidifierDomain(entityId) && batch.humidity != null) ent.humidity = batch.humidity
  if (isLockDomain(entityId) && batch.code) ent.code = batch.code
  if (isVacuumDomain(entityId) && batch.fanSpeed) ent.fanSpeed = batch.fanSpeed
  if (isAlarmControlDomain(entityId) && batch.code) ent.code = batch.code
  return ent
}
