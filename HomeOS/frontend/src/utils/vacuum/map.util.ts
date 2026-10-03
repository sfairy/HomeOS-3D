/**
 * 扫地机地图绑定与房间解析工具
 *
 * 职责：
 * - 解析扫地机实体与地图 camera 的绑定关系（vaccumMaps）。
 * - 从 camera 实体属性解析房间分区 / 标定点 / 坐标变换。
 * - 提供房间列表、点击命中房间、坐标到房间号的查询函数。
 *
 * 依赖：
 * - @/types/layout 的 VacuumMapBinding 类型。
 * - @/types/entity-store 的 HaEntityState 类型。
 *
 * 注意：
 * - 房间 id 为扫地机集成约定的数值标识符，不翻译。
 * - 仅面向用户的房间 name 使用简体中文。
 */
import type { VacuumMapBinding } from '@/types/layout'
import type { HaEntityState } from '@/types/entity-store'

interface VacuumRoomOption {
  id: number
  name: string
}

interface CalibrationPoint {
  vacuum: { x: number; y: number }
  map: { x: number; y: number }
}

/** 保证 vacuumMaps 为数组 */
export function ensureVacuumMaps(
  hc: { vacuumMaps?: VacuumMapBinding[] } | null | undefined,
): VacuumMapBinding[] {
  if (!hc) return []
  if (!Array.isArray(hc.vacuumMaps)) hc.vacuumMaps = []
  return hc.vacuumMaps
}

/** 按绑定表解析扫地机对应的地图 camera entity_id */
export function resolveVacuumMapCameraId(
  vacuumEntityId: string,
  vacuumMaps: VacuumMapBinding[] | undefined | null,
  entities?: Record<string, HaEntityState | undefined>,
): string {
  const vacId = String(vacuumEntityId || '').trim()
  if (!vacId) return ''

  const bindings = Array.isArray(vacuumMaps) ? vacuumMaps : []
  const bound = bindings.find(
    (b) => String(b?.vacuumEntityId || '').trim() === vacId && String(b?.mapCameraEntityId || '').trim(),
  )
  if (bound?.mapCameraEntityId) return String(bound.mapCameraEntityId).trim()

  if (!entities) return ''
  const vacSuffix = vacId.includes('.') ? vacId.slice(vacId.indexOf('.') + 1) : vacId
  const cameraIds = Object.keys(entities).filter((id) => id.startsWith('camera.'))

  const exact = cameraIds.find((id) => id === `camera.${vacSuffix}`)
  if (exact) return exact

  const mapExtractors = cameraIds.filter(
    (id) =>
      /xiaomi_cloud_map|map_extractor|vacuum_map|_map$/i.test(id) ||
      (vacSuffix && id.includes(vacSuffix)),
  )
  if (mapExtractors.length === 1) return mapExtractors[0]
  if (vacSuffix) {
    const bySuffix = mapExtractors.find((id) => id.includes(vacSuffix))
    if (bySuffix) return bySuffix
  }
  return mapExtractors[0] || ''
}

/** 从地图 camera attributes 解析房间列表 */
export function parseVacuumRooms(attrs: Record<string, unknown> | null | undefined): VacuumRoomOption[] {
  if (!attrs) return []
  const out: VacuumRoomOption[] = []
  const seen = new Set<number>()

  const push = (id: unknown, name?: unknown) => {
    const n = Number(id)
    if (!Number.isFinite(n) || seen.has(n)) return
    seen.add(n)
    const label = typeof name === 'string' && name.trim() ? name.trim() : `房间 ${n}`
    out.push({ id: n, name: label })
  }

  const roomNumbers = attrs.room_numbers
  if (roomNumbers && typeof roomNumbers === 'object' && !Array.isArray(roomNumbers)) {
    for (const [k, v] of Object.entries(roomNumbers as Record<string, unknown>)) {
      push(k, typeof v === 'string' ? v : k)
    }
  } else if (Array.isArray(roomNumbers)) {
    for (const item of roomNumbers) {
      if (typeof item === 'number' || typeof item === 'string') push(item)
      else if (item && typeof item === 'object') {
        const row = item as { id?: unknown; number?: unknown; name?: unknown }
        push(row.id ?? row.number, row.name)
      }
    }
  }

  const rooms = attrs.rooms
  if (rooms && typeof rooms === 'object' && !Array.isArray(rooms)) {
    for (const [k, v] of Object.entries(rooms as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const row = v as { name?: unknown; number?: unknown }
        push(row.number ?? k, row.name)
      } else {
        push(k, typeof v === 'string' ? v : undefined)
      }
    }
  }

  return out.sort((a, b) => a.id - b.id)
}

/** 已清扫房间 id 集合（extractor cleaned_rooms） */
export function parseCleanedRoomIds(attrs: Record<string, unknown> | null | undefined): Set<number> {
  const out = new Set<number>()
  const raw = attrs?.cleaned_rooms
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const n = Number(item)
      if (Number.isFinite(n)) out.add(n)
    }
  } else if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw as object)) {
      const n = Number(k)
      if (Number.isFinite(n)) out.add(n)
    }
  }
  return out
}

interface VacuumMapMeta {
  mapName: string
  model: string
  usedApi: string
  twoFactorUrl: string
  isEmpty: boolean
  vacuumPosition: { x: number; y: number; a?: number } | null
}

/** 地图 camera 元信息（extractor extra_state_attributes） */
export function parseVacuumMapMeta(attrs: Record<string, unknown> | null | undefined): VacuumMapMeta {
  const a = attrs || {}
  const pos = a.vacuum_position
  let vacuumPosition: VacuumMapMeta['vacuumPosition'] = null
  if (pos && typeof pos === 'object') {
    const row = pos as { x?: unknown; y?: unknown; a?: unknown }
    const x = Number(row.x)
    const y = Number(row.y)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      vacuumPosition = { x, y }
      const ang = Number(row.a)
      if (Number.isFinite(ang)) vacuumPosition.a = ang
    }
  }
  return {
    mapName: typeof a.map_name === 'string' ? a.map_name : '',
    model: typeof a.model === 'string' ? a.model : '',
    usedApi: typeof a.used_api === 'string' ? a.used_api : '',
    twoFactorUrl: typeof a.url_2fa === 'string' ? a.url_2fa : '',
    isEmpty: a.is_empty === true,
    vacuumPosition,
  }
}

/** parseCalibrationPoints：函数，按签名入参返回处理结果。 */
export function parseCalibrationPoints(
  attrs: Record<string, unknown> | null | undefined,
): CalibrationPoint[] {
  const raw = attrs?.calibration_points
  if (!Array.isArray(raw)) return []
  const points: CalibrationPoint[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const row = p as { vacuum?: { x?: unknown; y?: unknown }; map?: { x?: unknown; y?: unknown } }
    const vx = Number(row.vacuum?.x)
    const vy = Number(row.vacuum?.y)
    const mx = Number(row.map?.x)
    const my = Number(row.map?.y)
    if (![vx, vy, mx, my].every(Number.isFinite)) continue
    points.push({ vacuum: { x: vx, y: vy }, map: { x: mx, y: my } })
  }
  return points
}

/**
 * 三点仿射：地图像素 → 扫地机坐标。
 * 需要至少 3 个 calibration_points。
 */
export function mapImageToVacuumCoords(
  mapX: number,
  mapY: number,
  calibration: CalibrationPoint[],
): { x: number; y: number } | null {
  if (calibration.length < 3) return null
  const [p0, p1, p2] = calibration
  const m = [
    [p0.map.x, p0.map.y, 1],
    [p1.map.x, p1.map.y, 1],
    [p2.map.x, p2.map.y, 1],
  ]
  const vx = [p0.vacuum.x, p1.vacuum.x, p2.vacuum.x]
  const vy = [p0.vacuum.y, p1.vacuum.y, p2.vacuum.y]
  const ax = solve3(m, vx)
  const ay = solve3(m, vy)
  if (!ax || !ay) return null
  return {
    x: Math.round(ax[0] * mapX + ax[1] * mapY + ax[2]),
    y: Math.round(ay[0] * mapX + ay[1] * mapY + ay[2]),
  }
}

function solve3(A: number[][], b: number[]): number[] | null {
  const M = [
    [A[0][0], A[0][1], A[0][2], b[0]],
    [A[1][0], A[1][1], A[1][2], b[1]],
    [A[2][0], A[2][1], A[2][2], b[2]],
  ]
  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row
    }
    if (Math.abs(M[pivot][col]) < 1e-9) return null
    if (pivot !== col) {
      const tmp = M[col]
      M[col] = M[pivot]
      M[pivot] = tmp
    }
    const div = M[col][col]
    for (let j = col; j < 4; j++) M[col][j] /= div
    for (let row = 0; row < 3; row++) {
      if (row === col) continue
      const factor = M[row][col]
      for (let j = col; j < 4; j++) M[row][j] -= factor * M[col][j]
    }
  }
  return [M[0][3], M[1][3], M[2][3]]
}

/** 将点击位置映射到 intrinsic 图像像素（object-fit: contain） */
export function clientPointToImagePixel(
  img: HTMLImageElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = img.getBoundingClientRect()
  if (!rect.width || !rect.height || !img.naturalWidth || !img.naturalHeight) return null
  const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
  const dispW = img.naturalWidth * scale
  const dispH = img.naturalHeight * scale
  const offsetX = (rect.width - dispW) / 2
  const offsetY = (rect.height - dispH) / 2
  const x = (clientX - rect.left - offsetX) / scale
  const y = (clientY - rect.top - offsetY) / scale
  if (x < 0 || y < 0 || x > img.naturalWidth || y > img.naturalHeight) return null
  return { x, y }
}

/** 地图像素 → 相对 img 元素的百分比（用于划区框 overlay） */
export function imagePixelToElementPercent(
  img: HTMLImageElement,
  mapX: number,
  mapY: number,
): { left: number; top: number } | null {
  const rect = img.getBoundingClientRect()
  if (!rect.width || !rect.height || !img.naturalWidth || !img.naturalHeight) return null
  const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
  const dispW = img.naturalWidth * scale
  const dispH = img.naturalHeight * scale
  const offsetX = (rect.width - dispW) / 2
  const offsetY = (rect.height - dispH) / 2
  const px = offsetX + mapX * scale
  const py = offsetY + mapY * scale
  return {
    left: (px / rect.width) * 100,
    top: (py / rect.height) * 100,
  }
}
