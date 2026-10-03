/**
 * 场景图 / 表单 → HA Scene YAML 构建器
 *
 * 职责：把场景实体表单（state + 各 domain 专属字段）编译为 HA Scene YAML（name / entities）。
 *
 * 依赖：
 * - ./yaml-preview-helpers.util 的 YAML 标量 / map key / 占位工具。
 * - ../ui/progress-bar.util 的 kelvinToMireds（色温转换）。
 * - ./domain-capabilities.util 的 domain 判定。
 * - @/types/orchestrator-builder 的 BuildSceneYamlInput。
 *
 * 注意：YAML key（state / brightness / color_temp / rgb_color / position / temperature /
 * hvac_mode / volume_level / source / percentage / option / value / humidity / code / fan_speed）
 * 与 HA Scene 字段对齐，不翻译；空实体列表以占位符返回。
 */
import { formatYamlMapKey, formatYamlScalar, yamlPreviewPlaceholder } from './yaml-preview-helpers.util'
import { kelvinToMireds } from '../ui/progress-bar.util'
import {
  isLightDomain,
  isCoverDomain,
  isClimateDomain,
  isMediaDomain,
  isFanDomain,
  isLockDomain,
} from './domain-capabilities.util'
import type { BuildSceneYamlInput } from '@/types/orchestrator-builder'

export { isLightDomain, isCoverDomain, isClimateDomain, isMediaDomain, isFanDomain, isLockDomain }
/** 是否为 input_select 实体 */
export function isInputSelectDomain(eid: string | null | undefined) {
  return !!(eid && eid.startsWith('input_select.'))
}
/** 是否为 input_number 实体 */
export function isInputNumberDomain(eid: string | null | undefined) {
  return !!(eid && eid.startsWith('input_number.'))
}
/** 是否为加湿器实体 */
export function isHumidifierDomain(eid: string | null | undefined) {
  return !!(eid && eid.startsWith('humidifier.'))
}
/** 是否为扫地机实体 */
export function isVacuumDomain(eid: string | null | undefined) {
  return !!(eid && eid.startsWith('vacuum.'))
}
/** 是否为报警控制面板实体 */
export function isAlarmControlDomain(eid: string | null | undefined) {
  return !!(eid && eid.startsWith('alarm_control_panel.'))
}

/**
 * 从场景表单 / 图画布状态生成 HA scene YAML。
 *
 * 入参：sceneName / entities 列表（含 state 与各 domain 专属字段）。
 * 各 domain 按字段裁剪：light（brightness/color_temp/rgb_color/transition/effect）、
 * cover（position）、climate（temperature/hvac_mode）、media_player（volume_level/source）、
 * fan（percentage）、input_select（option）、input_number（value）、humidifier（humidity）、
 * lock（code）、vacuum（fan_speed）、alarm_control_panel（code）。
 * 边界：无 entities 时返回占位文案。
 */
export function buildSceneYaml({ sceneName, entities }: BuildSceneYamlInput) {
  if (entities.length === 0) return yamlPreviewPlaceholder('addEntities')
  const L: string[] = []
  L.push(`name: ${formatYamlScalar(sceneName || '场景')}`)
  L.push('entities:')
  for (const e of entities) {
    if (!e.entityId) continue
    L.push(`  ${formatYamlMapKey(e.entityId)}:`)
    const state = e.state === '__custom__' ? e.customState || 'on' : e.state
    L.push(`    state: ${formatYamlScalar(state)}`)
    if (isLightDomain(e.entityId)) {
      if (e.brightness != null && e.brightness > 0)
        L.push(`    brightness: ${Math.round((e.brightness / 100) * 255)}`)
      if (e.colorTemp != null && e.colorTemp > 0) {
        const mireds = kelvinToMireds(e.colorTemp)
        if (mireds != null) L.push(`    color_temp: ${mireds}`)
      }
      if (e.rgbColor && /^#[0-9a-fA-F]{6}$/.test(e.rgbColor)) {
        const r = parseInt(e.rgbColor.slice(1, 3), 16)
        const g = parseInt(e.rgbColor.slice(3, 5), 16)
        const b = parseInt(e.rgbColor.slice(5, 7), 16)
        L.push(`    rgb_color: [${r}, ${g}, ${b}]`)
      }
      if (e.transition != null && e.transition > 0) L.push(`    transition: ${e.transition}`)
      if (e.effect) L.push(`    effect: ${formatYamlScalar(e.effect)}`)
    }
    if (isCoverDomain(e.entityId) && e.position != null) L.push(`    position: ${e.position}`)
    if (isClimateDomain(e.entityId)) {
      if (e.temperature != null) L.push(`    temperature: ${e.temperature}`)
      if (e.hvacMode) L.push(`    hvac_mode: ${formatYamlScalar(e.hvacMode)}`)
    }
    if (isMediaDomain(e.entityId)) {
      if (e.volume != null) L.push(`    volume_level: ${e.volume}`)
      if (e.source) L.push(`    source: ${formatYamlScalar(e.source)}`)
    }
    if (isFanDomain(e.entityId) && e.percentage != null) L.push(`    percentage: ${e.percentage}`)
    if (isInputSelectDomain(e.entityId) && e.option)
      L.push(`    option: ${formatYamlScalar(e.option)}`)
    if (isInputNumberDomain(e.entityId) && e.value != null) L.push(`    value: ${e.value}`)
    if (isHumidifierDomain(e.entityId) && e.humidity != null) L.push(`    humidity: ${e.humidity}`)
    if (isLockDomain(e.entityId) && e.code) L.push(`    code: ${formatYamlScalar(e.code)}`)
    if (isVacuumDomain(e.entityId) && e.fanSpeed)
      L.push(`    fan_speed: ${formatYamlScalar(e.fanSpeed)}`)
    if (isAlarmControlDomain(e.entityId) && e.code) L.push(`    code: ${formatYamlScalar(e.code)}`)
  }
  return L.join('\n')
}
