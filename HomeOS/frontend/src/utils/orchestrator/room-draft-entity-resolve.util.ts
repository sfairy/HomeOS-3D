/**
 * 房间快捷自动化草案实体解析
 *
 * 职责：
 * - 从房间绑定 + HA 实体注册表解析快捷规则草案所用的 entity_id
 *   （人体传感器 / 灯光 / 温控 / 环境传感器等）。
 * - 输出 ResolvedRoomDraftSources，供 room-automation-draft 生成 YAML。
 *
 * 依赖：
 * - @homeos/shared 的 buildRoomInferKeywordsMap / EnvSensorMap。
 * - @/utils/entity/derived.util 的 getEntityDisplayName。
 * - @/utils/orchestrator/room-automation-draft.util 的 RoomDraftKind 类型。
 *
 * 注意：
 * - entity_id 为 HA 标识符，不翻译。
 * - `RoomDraftKind`（motionLight / ...）为草案类型 key，不翻译。
 */
/** 从房间绑定 + HA 实体注册表解析快捷规则草案所用 entity_id */
import { buildRoomInferKeywordsMap, type EnvSensorMap } from '@homeos/shared'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { RoomDraftKind } from '@/utils/orchestrator/room-automation-draft.util'

interface HaEntityRef {
  state?: string
  attributes?: {
    area_id?: string
    device_class?: string
    friendly_name?: string
  }
}

type RoomDraftEntitySource = 'binding' | 'inference' | 'placeholder'

interface ResolvedRoomDraftEntity {
  entityId: string
  source: RoomDraftEntitySource
  attribute?: string
}

/** ResolvedRoomDraftSources：类型定义，字段语义见声明。 */
export interface ResolvedRoomDraftSources {
  motion?: ResolvedRoomDraftEntity
  light?: ResolvedRoomDraftEntity
  temperature?: ResolvedRoomDraftEntity
  climate?: ResolvedRoomDraftEntity
}

interface ResolveRoomDraftContext {
  roomLabel?: string
  sensorMap?: EnvSensorMap
}

const MOTION_DEVICE_CLASSES = new Set([
  'motion',
  'occupancy',
  'moving',
  'presence',
])
const SKIP_LIGHT_RE = /(?:^light\.all$|\.all$|placeholder)/i
const ROOM_KEYWORDS = buildRoomInferKeywordsMap()

/** 实体 ID / 友好名中暗示人感的中英文词 */
const MOTION_NAME_RE =
  /motion|occupancy|presence|pir|人体|移动|存在|占用|人感|红外|雷达/i
/** 温度传感器命名启发式 */
const TEMP_NAME_RE = /temperature|_temp(?:_|$)|气温|室温|温度/i
/** 空调命名启发式（辅助 climate. 域外兜底，仍要求 climate. 前缀） */
const CLIMATE_NAME_RE = /climate|ac_|hvac|空调|冷气|暖气/i

function entityAreaId(ent: HaEntityRef | undefined): string {
  return String(ent?.attributes?.area_id || '').trim()
}

function isAvailable(ent: HaEntityRef | undefined): boolean {
  const state = String(ent?.state || '').toLowerCase()
  return state !== 'unavailable' && state !== 'unknown'
}

function entityHaystack(eid: string, ent: HaEntityRef): string {
  const friendlyName = getEntityDisplayName(eid, ent)
  return `${eid} ${friendlyName || ''}`
}

function entityMatchesTargetRoom(
  eid: string,
  ent: HaEntityRef,
  targetRoomId: string,
  ctx: ResolveRoomDraftContext,
): boolean {
  const areaId = entityAreaId(ent)
  if (areaId && areaId === targetRoomId) return true

  const hay = entityHaystack(eid, ent).toLowerCase()
  const labels = new Set<string>()
  const roomLabel = String(ctx.roomLabel || '').trim().toLowerCase()
  if (roomLabel) labels.add(roomLabel)
  const mapLabel = String(ctx.sensorMap?.[targetRoomId]?.label || '')
    .trim()
    .toLowerCase()
  if (mapLabel) labels.add(mapLabel)
  for (const label of labels) {
    if (label && hay.includes(label)) return true
  }

  const keywords = ROOM_KEYWORDS[targetRoomId]
  if (keywords?.some((kw) => hay.includes(kw.toLowerCase()))) return true

  // 房间 id 本身出现在实体名中（如 living_room）
  const roomToken = String(targetRoomId || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
  if (roomToken && hay.includes(roomToken.replace(/\s+/g, '_'))) return true
  if (roomToken && hay.includes(roomToken)) return true

  return false
}

function pickInRoom(
  entities: Record<string, HaEntityRef>,
  roomId: string,
  ctx: ResolveRoomDraftContext,
  predicate: (id: string, ent: HaEntityRef) => boolean,
): string | null {
  const room = String(roomId || '').trim()
  if (!room) return null
  const candidates: string[] = []
  for (const [id, ent] of Object.entries(entities)) {
    if (!ent || !isAvailable(ent)) continue
    if (!entityMatchesTargetRoom(id, ent, room, ctx)) continue
    if (!predicate(id, ent)) continue
    candidates.push(id)
  }
  candidates.sort((a, b) => a.localeCompare(b))
  return candidates[0] || null
}

function resolveBound(
  raw: string | undefined | null,
  valid: (id: string) => boolean,
  placeholder: string,
  infer: () => string | null,
): ResolvedRoomDraftEntity {
  const bound = String(raw || '').trim()
  if (bound && valid(bound)) {
    return { entityId: bound, source: 'binding' }
  }
  const inferred = infer()
  if (inferred) {
    return { entityId: inferred, source: 'inference' }
  }
  return { entityId: placeholder, source: 'placeholder' }
}

function inferMotion(
  entities: Record<string, HaEntityRef>,
  roomId: string,
  ctx: ResolveRoomDraftContext,
): string | null {
  return pickInRoom(entities, roomId, ctx, (id, ent) => {
    if (!id.startsWith('binary_sensor.')) return false
    const dc = String(ent.attributes?.device_class || '').toLowerCase()
    if (dc && MOTION_DEVICE_CLASSES.has(dc)) return true
    return MOTION_NAME_RE.test(entityHaystack(id, ent))
  })
}

function inferLight(
  entities: Record<string, HaEntityRef>,
  roomId: string,
  ctx: ResolveRoomDraftContext,
): string | null {
  return pickInRoom(
    entities,
    roomId,
    ctx,
    (id) => id.startsWith('light.') && !SKIP_LIGHT_RE.test(id),
  )
}

function inferClimate(
  entities: Record<string, HaEntityRef>,
  roomId: string,
  ctx: ResolveRoomDraftContext,
): string | null {
  return pickInRoom(entities, roomId, ctx, (id, ent) => {
    if (!id.startsWith('climate.')) return false
    // 同房间任意 climate 均可；名称命中空调类词优先（由 sort 保底字母序，此处先全收）
    void CLIMATE_NAME_RE
    void ent
    return true
  })
}

function inferTemperatureSensor(
  entities: Record<string, HaEntityRef>,
  roomId: string,
  ctx: ResolveRoomDraftContext,
): string | null {
  return pickInRoom(entities, roomId, ctx, (id, ent) => {
    if (!id.startsWith('sensor.')) return false
    const dc = String(ent.attributes?.device_class || '').toLowerCase()
    if (dc === 'temperature') return true
    return TEMP_NAME_RE.test(entityHaystack(id, ent))
  })
}

function resolveTemperature(
  entry: Record<string, string | undefined | null>,
  entities: Record<string, HaEntityRef>,
  roomId: string,
  ctx: ResolveRoomDraftContext,
  climate?: ResolvedRoomDraftEntity,
): ResolvedRoomDraftEntity {
  const boundTemp = String(entry.temperature || '').trim()
  if (boundTemp.startsWith('sensor.')) {
    return { entityId: boundTemp, source: 'binding' }
  }

  const inferredSensor = inferTemperatureSensor(entities, roomId, ctx)
  if (inferredSensor) {
    return { entityId: inferredSensor, source: 'inference' }
  }

  const climateId =
    climate?.source !== 'placeholder'
      ? climate?.entityId
      : String(entry.climate || '').trim() || inferClimate(entities, roomId, ctx) || ''

  if (climateId?.startsWith('climate.')) {
    return {
      entityId: climateId,
      source: climate?.source === 'binding' ? 'binding' : 'inference',
      attribute: 'current_temperature',
    }
  }

  return { entityId: 'sensor.temp_placeholder', source: 'placeholder' }
}

/** resolveRoomDraftSources：函数，按签名入参返回处理结果。 */
export function resolveRoomDraftSources(
  kind: RoomDraftKind,
  entry: Record<string, string | undefined | null>,
  roomId: string,
  entities: Record<string, HaEntityRef> = {},
  ctx: ResolveRoomDraftContext = {},
): ResolvedRoomDraftSources {
  const resolveCtx: ResolveRoomDraftContext = {
    roomLabel: ctx.roomLabel || entry.label || '',
    sensorMap: ctx.sensorMap,
  }

  if (kind === 'motion') {
    return {
      motion: resolveBound(
        entry.motion,
        (id) => id.startsWith('binary_sensor.'),
        'binary_sensor.motion_placeholder',
        () => inferMotion(entities, roomId, resolveCtx),
      ),
      light: resolveBound(
        entry.light,
        (id) => id.startsWith('light.') && !SKIP_LIGHT_RE.test(id),
        'light.placeholder',
        () => inferLight(entities, roomId, resolveCtx),
      ),
    }
  }

  const climate = resolveBound(
    entry.climate,
    (id) => id.startsWith('climate.'),
    'climate.placeholder',
    () => inferClimate(entities, roomId, resolveCtx),
  )

  return {
    climate,
    temperature: resolveTemperature(entry, entities, roomId, resolveCtx, climate),
  }
}

/** describeResolvedEntity：函数，按签名入参返回处理结果。 */
export function describeResolvedEntity(
  label: string,
  row: ResolvedRoomDraftEntity | undefined,
): string {
  if (!row) return `${label}未配置`
  if (row.source === 'placeholder') return `${label}待绑定`
  const via = row.source === 'binding' ? '已绑定' : '已从 HA 区域推断'
  const attr = row.attribute ? `（${row.attribute}）` : ''
  return `${label}：${via} ${row.entityId}${attr}`
}

/** isRoomDraftFullyResolved：函数，按签名入参返回处理结果。 */
export function isRoomDraftFullyResolved(
  kind: RoomDraftKind,
  sources: ResolvedRoomDraftSources,
): boolean {
  if (kind === 'motion') {
    return (
      sources.motion?.source !== 'placeholder' && sources.light?.source !== 'placeholder'
    )
  }
  return (
    sources.temperature?.source !== 'placeholder' && sources.climate?.source !== 'placeholder'
  )
}
