/**
 * 场景实体表单模型与 YAML 互转工具
 *
 * 职责：
 * - 定义场景实体表单模型（SceneEntityForm），数值类字段统一为 number | null。
 * - 提供场景 YAML ↔ 表单的互转、实体状态可选值解析、保存前校验等工具。
 *
 * 依赖：
 * - @homeos/shared 的 loadHaYaml / isPlaceholderEntityId。
 * - @/utils/ui/progress-bar.util 的 miredsToKelvin（色温转换）。
 * - @/utils/entity/state-options.util 的 possibleStatesForEntity。
 *
 * 注意：
 * - entityId / state 为 HA 标识符与 state 值，不翻译。
 * - 仅面向用户的字段说明使用简体中文。
 */
import { loadHaYaml, isPlaceholderEntityId } from '@homeos/shared'
import { miredsToKelvin } from '@/utils/ui/progress-bar.util'
import { possibleStatesForEntity } from '@/utils/entity/state-options.util'

/** 场景实体表单模型：数值类字段统一为 number | null */
export interface SceneEntityForm {
  entityId: string
  state: string
  customState: string
  _show: boolean
  brightness: number | null
  colorTemp: number | null
  rgbColor: string
  transition: number | null
  effect: string
  position: number | null
  temperature: number | null
  hvacMode: string
  volume: number | null
  source: string
  percentage: number | null
  code: string
  option: string
  value: number | null
  humidity: number | null
  fanSpeed: string
}

interface HaSceneEntityAttrs {
  state?: unknown
  brightness?: unknown
  brightness_pct?: unknown
  color_temp?: unknown
  color_temp_kelvin?: unknown
  rgb_color?: unknown
  transition?: unknown
  effect?: unknown
  position?: unknown
  temperature?: unknown
  hvac_mode?: unknown
  volume_level?: unknown
  source?: unknown
  percentage?: unknown
  option?: unknown
  value?: unknown
  humidity?: unknown
  code?: unknown
  fan_speed?: unknown
}

interface HaSceneYaml {
  name?: unknown
  entities?: Record<string, HaSceneEntityAttrs>
}

/** newSceneEntityDefaults：函数，按签名入参返回处理结果。 */
export function newSceneEntityDefaults(): SceneEntityForm {
  return {
    entityId: '',
    state: 'on',
    customState: '',
    _show: true,
    brightness: null,
    colorTemp: null,
    rgbColor: '',
    transition: null,
    effect: '',
    position: null,
    temperature: null,
    hvacMode: '',
    volume: null,
    source: '',
    percentage: null,
    code: '',
    option: '',
    value: null,
    humidity: null,
    fanSpeed: '',
  }
}

function applyHaAttrsToSceneEntity(ent: SceneEntityForm, attrs: HaSceneEntityAttrs) {
  if (attrs.state != null) ent.state = String(attrs.state)
  if (attrs.brightness_pct != null) {
    const pct = Math.round(Number(attrs.brightness_pct))
    if (Number.isFinite(pct)) ent.brightness = Math.max(0, Math.min(100, pct))
  } else if (attrs.brightness != null) {
    const raw = Number(attrs.brightness)
    if (Number.isFinite(raw) && raw > 0) {
      ent.brightness = Math.max(1, Math.round((raw / 255) * 100))
    } else if (raw === 0) {
      ent.brightness = 0
    }
  }
  if (attrs.color_temp_kelvin != null) {
    const k = Math.round(Number(attrs.color_temp_kelvin))
    if (Number.isFinite(k) && k > 0) ent.colorTemp = k
  } else if (attrs.color_temp != null) {
    const ct = Number(attrs.color_temp)
    ent.colorTemp = ct >= 1000 ? ct : miredsToKelvin(ct)
  }
  if (attrs.rgb_color != null) {
    const rgb = attrs.rgb_color
    if (Array.isArray(rgb) && rgb.length >= 3) {
      const [r, g, b] = rgb.map((v: unknown) => Number(v))
      ent.rgbColor = `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`
    }
  }
  if (attrs.transition != null) ent.transition = Number(attrs.transition)
  if (attrs.effect != null) ent.effect = String(attrs.effect)
  if (attrs.position != null) ent.position = Number(attrs.position)
  if (attrs.temperature != null) ent.temperature = Number(attrs.temperature)
  if (attrs.hvac_mode != null) ent.hvacMode = String(attrs.hvac_mode)
  if (attrs.volume_level != null) ent.volume = Number(attrs.volume_level)
  if (attrs.source != null) ent.source = String(attrs.source)
  if (attrs.percentage != null) ent.percentage = Number(attrs.percentage)
  if (attrs.option != null) ent.option = String(attrs.option)
  if (attrs.value != null) ent.value = Number(attrs.value)
  if (attrs.humidity != null) ent.humidity = Number(attrs.humidity)
  if (attrs.code != null) ent.code = String(attrs.code)
  if (attrs.fan_speed != null) ent.fanSpeed = String(attrs.fan_speed)
}

/** 非预设 state 归一为自定义，避免 UI 选中丢失 */
function normalizeSceneEntityStateChoice(ent: SceneEntityForm) {
  const st = String(ent.state || '')
  if (!st || st === '__custom__') return
  const eid = String(ent.entityId || '').trim()
  if (!eid) return
  const opts = possibleStatesForEntity(eid)
  if (opts.includes(st)) return
  ent.customState = st
  ent.state = '__custom__'
}

/** 解析 HA scene YAML 为表单实体列表 */
export function parseSceneYamlIntoForm(text: string): {
  sceneName?: string
  entities: SceneEntityForm[]
} {
  const parsedRaw = loadHaYaml(text)
  if (!parsedRaw || typeof parsedRaw !== 'object') {
    throw new Error('YAML 格式无效')
  }
  const parsed = parsedRaw as HaSceneYaml
  const sceneName = parsed.name != null ? String(parsed.name) : undefined
  const map = parsed.entities
  if (!map || typeof map !== 'object') {
    return { sceneName, entities: [] }
  }
  const entities = Object.entries(map).map(([entityId, attrs]) => {
    const ent = newSceneEntityDefaults()
    ent.entityId = entityId
    if (attrs && typeof attrs === 'object') {
      applyHaAttrsToSceneEntity(ent, attrs)
    }
    normalizeSceneEntityStateChoice(ent)
    return ent
  })
  return { sceneName, entities }
}

/** 保存前校验场景实体列表 */
export function validateSceneEntitiesForSave(entities: SceneEntityForm[]): string | null {
  if (!entities.length) return '请至少添加一个实体'
  const emptyIdx = entities.findIndex((e) => !String(e.entityId || '').trim())
  if (emptyIdx >= 0) return `第 ${emptyIdx + 1} 个实体尚未选择设备，请补全后再保存`
  if (entities.some((e) => isPlaceholderEntityId(e.entityId || ''))) {
    return '实体含 _placeholder 占位符，请替换为真实 entity_id'
  }
  const ids = entities.map((e) => String(e.entityId || '').trim()).filter(Boolean)
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) return `实体 ID 重复：${id}（同步到 HA 时后者会覆盖前者）`
    seen.add(id)
  }
  return null
}
