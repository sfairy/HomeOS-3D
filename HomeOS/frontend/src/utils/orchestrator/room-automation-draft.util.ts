/**
 * 房间快捷自动化 YAML 草案生成
 *
 * 职责：
 * - 从房间传感器映射生成常见快捷自动化 YAML 草案（人来灯亮 / 夜间夜灯 / 等）。
 * - 提供草案类型（RoomDraftKind）与可替换 entity_id 解析，供一键创建自动化。
 *
 * 依赖：
 * - @homeos/shared 的 findReplaceableEntityIdsInYaml。
 * - @/utils/orchestrator/room-draft-entity-resolve.util 的 ResolvedRoomDraftSources。
 *
 * 注意：
 * - YAML key 与 HA service 字段对齐，不翻译。
 * - 草案中 `placeholder` 实体为占位哨兵，不翻译。
 */
/** 从房间传感器映射生成快捷自动化 YAML 草案 */
import { findReplaceableEntityIdsInYaml } from '@homeos/shared'
import type { ResolvedRoomDraftSources } from '@/utils/orchestrator/room-draft-entity-resolve.util'

function buildRoomMotionLightDraft(opts: {
  roomLabel: string
  motionEntityId?: string
  lightEntityId?: string
}) {
  const motion = opts.motionEntityId?.trim() || 'binary_sensor.motion_placeholder'
  const light = opts.lightEntityId?.trim() || 'light.placeholder'
  const alias = `${opts.roomLabel || '房间'} · 人来灯亮`
  return `alias: "${alias}"
description: "由房间快捷规则生成，请替换占位 entity_id"
triggers:
  - platform: state
    entity_id: ${motion}
    to: "on"
    for: "0:00:02"
conditions:
  - condition: sun
    after: sunset
    after_offset: "-00:30"
actions:
  - service: light.turn_on
    target:
      entity_id: ${light}
    data:
      brightness_pct: 75
  - delay: "0:05:00"
  - service: light.turn_off
    target:
      entity_id: ${light}
`
}

function buildRoomClimateDraft(opts: {
  roomLabel: string
  tempEntityId?: string
  tempAttribute?: string
  climateEntityId?: string
  highTemp?: number
}) {
  const sensor = opts.tempEntityId?.trim() || 'sensor.temp_placeholder'
  const climate = opts.climateEntityId?.trim() || 'climate.placeholder'
  const threshold = opts.highTemp ?? 28
  const attributeLine = opts.tempAttribute?.trim()
    ? `    attribute: ${opts.tempAttribute}\n`
    : ''
  const alias = `${opts.roomLabel || '房间'} · 高温空调`
  return `alias: "${alias}"
description: "由房间快捷规则生成，请替换占位 entity_id"
triggers:
  - platform: numeric_state
    entity_id: ${sensor}
${attributeLine}    above: ${threshold}
    for: "0:10:00"
conditions: []
actions:
  - service: climate.set_hvac_mode
    target:
      entity_id: ${climate}
    data:
      hvac_mode: cool
  - service: climate.set_temperature
    target:
      entity_id: ${climate}
    data:
      temperature: 26
`
}

/** RoomDraftKind：类型定义，字段语义见声明。 */
export type RoomDraftKind = 'motion' | 'climate'

/** roomDraftName：函数，按签名入参返回处理结果。 */
export function roomDraftName(kind: RoomDraftKind, roomLabel: string) {
  const label = roomLabel?.trim() || '房间'
  return kind === 'climate' ? `${label} · 高温空调` : `${label} · 人来灯亮`
}

/** buildRoomDraftFromSources：函数，按签名入参返回处理结果。 */
export function buildRoomDraftFromSources(
  kind: RoomDraftKind,
  roomLabel: string,
  sources: ResolvedRoomDraftSources,
) {
  if (kind === 'climate') {
    return buildRoomClimateDraft({
      roomLabel,
      tempEntityId: sources.temperature?.entityId,
      tempAttribute: sources.temperature?.attribute,
      climateEntityId: sources.climate?.entityId,
    })
  }
  return buildRoomMotionLightDraft({
    roomLabel,
    motionEntityId: sources.motion?.entityId,
    lightEntityId: sources.light?.entityId,
  })
}

/** roomDraftNeedsWizard：函数，按签名入参返回处理结果。 */
export function roomDraftNeedsWizard(yaml: string): boolean {
  return findReplaceableEntityIdsInYaml(yaml).length > 0
}

type OrchestratorDraftListItem = {
  id?: string | number
  name?: string
  yaml?: string
  enabled?: boolean
}

/** 查找可更新的同名禁用草案（仍含占位符） */
export function findReusableRoomDraft(
  list: OrchestratorDraftListItem[],
  name: string,
): OrchestratorDraftListItem | undefined {
  return list.find((row) => {
    if (String(row?.name || '') !== name) return false
    if (row.enabled) return false
    return roomDraftNeedsWizard(String(row.yaml || ''))
  })
}

const ORCHESTRATOR_AUTOMATION_DRAFT_KEY = 'homeos:orchestrator:automation:draft'

/** stashAutomationDraftYaml：函数，按签名入参返回处理结果。 */
export function stashAutomationDraftYaml(yaml: string) {
  try {
    sessionStorage.setItem(ORCHESTRATOR_AUTOMATION_DRAFT_KEY, yaml)
  } catch {
    /* 忽略配额 */
  }
}

/** consumeAutomationDraftYaml：函数，按签名入参返回处理结果。 */
export function consumeAutomationDraftYaml(): string {
  try {
    const v = sessionStorage.getItem(ORCHESTRATOR_AUTOMATION_DRAFT_KEY) || ''
    sessionStorage.removeItem(ORCHESTRATOR_AUTOMATION_DRAFT_KEY)
    return v
  } catch {
    return ''
  }
}
