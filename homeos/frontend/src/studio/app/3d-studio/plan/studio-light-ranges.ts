/**
 * 绘制页与 3D 交互控件**共用**的柔光范围存储（0.8.9 `studio-light-ranges.js`）。
 *
 * 背景：0.8.9 之前，柔光范围只存在 3D 控件的 `properties.lightRegionOverrides` 里，
 * 户型绘制页的「轻量柔光」预览看不到它；0.8.9 把它上提成**按场景（sceneId）共享**的
 * 一份数据，绘制页写入、控件读取并同步，反之亦然。
 *
 * 存储位置（studio 草稿 / 文档）：
 * - `lightRegionOverrides[sceneId][regionKey] = descriptor`
 * - `lightRangeArchive[sceneId] = [{ floorId, itemId, previous, at }, …]`
 *
 * `regionKey` 由运行时范围编辑器生成（不透明字符串），本模块只做**净化**与**按场景解析**，
 * 不解析键的内部结构 —— 这样编辑器换键格式不会波及存储层。
 *
 * 注意：`theme` 之外的场景风格（如自然木语）没有柔光支持，由 `FLOOR`/光照层判断，
 * 本模块不参与。
 */

/** 绘制页自身的柔光范围所用的保留 scene id。与 0.8.9 `STUDIO_RANGE_SCENE_ID` 同义。 */
export const STUDIO_RANGE_SCENE_ID = '__studio-floorplan__'

/** 一个区域描述符（编辑器写出的形状；本层只做数值夹取，不重排语义）。 */
export type LightRegionDescriptor = {
  shape?: 'circle' | 'square' | 'strip'
  width?: number
  depth?: number
  rotation?: number
  softness?: number
  heightMin?: number
  heightMax?: number
  offsetX?: number
  offsetZ?: number
  moveCenter?: boolean
}

/** `regionKey → descriptor`。 */
export type LightRegionOverrides = Record<string, LightRegionDescriptor>

/** `sceneId → regionKey → descriptor`。 */
export type LightRegionOverrideStore = Record<string, LightRegionOverrides>

/** 撤销记录：保留「改之前的范围」，用于在绘制页撤销柔光调整。 */
export type LightRangeArchiveEntry = {
  floorId: string
  itemId: string
  /** 改之前的描述符；`null` 表示之前没有自定义（回到模型默认）。 */
  previous: LightRegionDescriptor | null
  /** 记录时间（毫秒），仅用于裁剪与展示。 */
  at: number
}

/** `sceneId → 撤销记录[]`。 */
export type LightRangeArchiveStore = Record<string, LightRangeArchiveEntry[]>

const MAX_SCENES = 64
const MAX_REGIONS_PER_SCENE = 512
const MAX_ARCHIVE_ENTRIES = 200
const MAX_KEY_LENGTH = 96
const MAX_ROTATION = 180

const PROFILE_KEYS = new Set([
  'shape',
  'width',
  'depth',
  'rotation',
  'softness',
  'heightMin',
  'heightMax',
  'offsetX',
  'offsetZ',
  'moveCenter',
])

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function clampOptional(value: number | undefined, min: number, max: number): number | undefined {
  return value === undefined ? undefined : value < min ? min : value > max ? max : value
}

/** 数值字段名（`NUMERIC_FIELDS` 的键只可能是这几个）。 */
type NumericProfileKey = 'width' | 'depth' | 'rotation' | 'softness' | 'heightMin' | 'heightMax' | 'offsetX' | 'offsetZ'

/** 数值字段表：顺序即写回顺序。 */
const NUMERIC_FIELDS: ReadonlyArray<readonly [NumericProfileKey, number, number]> = [
  ['width', 0.5, 20],
  ['depth', 0.5, 20],
  ['rotation', -MAX_ROTATION, MAX_ROTATION],
  ['softness', 5, 100],
  ['heightMin', 0, 20],
  ['heightMax', 0, 20],
  ['offsetX', -50, 50],
  ['offsetZ', -50, 50],
]

function normalizeShape(value: unknown): LightRegionDescriptor['shape'] | undefined {
  return value === 'circle' || value === 'square' || value === 'strip' ? value : undefined
}

function applyNumericFields(target: LightRegionDescriptor, source: Record<string, unknown>): void {
  for (const [key, min, max] of NUMERIC_FIELDS) {
    const value = clampOptional(toNumber(source[key]), min, max)
    if (value !== undefined) target[key] = value
  }
}

/** 最低照到 ≤ 最高照到：与编辑器一致，冲突时把最高抬到最低之上。 */
function normalizeHeightOrder(descriptor: LightRegionDescriptor): void {
  const { heightMin, heightMax } = descriptor
  if (heightMin === undefined || heightMax === undefined || heightMax >= heightMin) return
  descriptor.heightMax = heightMin
}

/**
 * 单个区域描述符净化。
 *
 * 只保留已知字段（`PROFILE_KEYS`），数值按绘制面板的输入范围夹取 —— 与后端
 * `valid_light_region_overrides` 同一口径，避免「前端能存、后端拒收」。
 */
export function normalizeLightRegionDescriptor(raw: unknown): LightRegionDescriptor | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  // 全是未知键时视为「没有描述符」：存档里不堆无用对象。
  if (!Object.keys(source).some((key) => PROFILE_KEYS.has(key))) return null
  const descriptor: LightRegionDescriptor = {}
  const shape = normalizeShape(source.shape)
  if (shape) descriptor.shape = shape
  applyNumericFields(descriptor, source)
  normalizeHeightOrder(descriptor)
  if (typeof source.moveCenter === 'boolean') descriptor.moveCenter = source.moveCenter
  // 只有 `shape` 的空对象等价于「没有描述符」，直接丢弃，省得存档里堆 `{}`。
  return Object.keys(descriptor).length ? descriptor : null
}

/** 单个场景的 `regionKey → descriptor` 净化。 */
export function normalizeLightRegionOverridesForScene(raw: unknown): LightRegionOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const overrides: LightRegionOverrides = {}
  let count = 0
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_REGIONS_PER_SCENE) break
    if (!key || key.length > MAX_KEY_LENGTH) continue
    const descriptor = normalizeLightRegionDescriptor(value)
    if (!descriptor) continue
    overrides[key] = descriptor
    count++
  }
  return overrides
}

/** `sceneId → overrides` 的整表净化（丢掉空场景，避免存档膨胀）。 */
export function normalizeLightRegionOverrides(raw: unknown): LightRegionOverrideStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const store: LightRegionOverrideStore = {}
  let scenes = 0
  for (const [sceneId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (scenes >= MAX_SCENES) break
    if (!sceneId || sceneId.length > MAX_KEY_LENGTH) continue
    const overrides = normalizeLightRegionOverridesForScene(value)
    if (!Object.keys(overrides).length) continue
    store[sceneId] = overrides
    scenes++
  }
  return store
}

/** 键长度受限的字符串：超长视为无效（返回空串）。 */
function boundedKey(value: unknown): string {
  const key = String(value || '')
  return key.length > MAX_KEY_LENGTH ? '' : key
}

/** 单条撤销记录净化；结构不完整返回 null。 */
function normalizeArchiveEntry(rawEntry: unknown): LightRangeArchiveEntry | null {
  if (!rawEntry || typeof rawEntry !== 'object') return null
  const entry = rawEntry as Record<string, unknown>
  const floorId = boundedKey(entry.floorId)
  const itemId = boundedKey(entry.itemId)
  if (!floorId || !itemId) return null
  const previous = entry.previous === null ? null : normalizeLightRegionDescriptor(entry.previous)
  return { floorId, itemId, previous, at: toNumber(entry.at) ?? 0 }
}

/** 单个场景的撤销记录：结构净化 + 按时间升序 + 截断到上限。 */
function normalizeArchiveScene(value: unknown): LightRangeArchiveEntry[] {
  if (!Array.isArray(value)) return []
  const entries: LightRangeArchiveEntry[] = []
  for (const rawEntry of value) {
    const entry = normalizeArchiveEntry(rawEntry)
    if (entry) entries.push(entry)
  }
  entries.sort((left, right) => left.at - right.at)
  return entries.slice(-MAX_ARCHIVE_ENTRIES)
}

/** 撤销记录净化：只保留结构完整的条目，按时间升序、超出上限时丢最旧的。 */
export function normalizeLightRangeArchive(raw: unknown): LightRangeArchiveStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const store: LightRangeArchiveStore = {}
  for (const [sceneId, value] of Object.entries(raw as Record<string, unknown>)) {
    const entries = normalizeArchiveScene(value)
    if (!boundedKey(sceneId) || !entries.length) continue
    store[sceneId] = entries
  }
  return store
}

/**
 * 解析某个场景实际生效的柔光范围。
 *
 * 优先级：`sceneId` → `STUDIO_RANGE_SCENE_ID`（绘制页写入的公共范围）。
 * 内置模板没有自己的场景记录，始终走兜底（与 0.8.9「内置模板沿用控件自己的范围」一致）。
 */
export function resolveLightRanges(
  store: LightRegionOverrideStore | undefined,
  sceneId: string | null | undefined,
  { allowDefault = true }: { allowDefault?: boolean } = {},
): LightRegionOverrides {
  if (!store) return {}
  const explicit = sceneId ? store[sceneId] : undefined
  if (explicit && Object.keys(explicit).length) return explicit
  if (!allowDefault) return explicit || {}
  return store[STUDIO_RANGE_SCENE_ID] || explicit || {}
}

/** 写入某场景的范围（返回新表，不改入参 —— 便于 React/Vue 侧比较引用）。 */
export function withLightRanges(
  store: LightRegionOverrideStore | undefined,
  sceneId: string,
  overrides: LightRegionOverrides,
): LightRegionOverrideStore {
  const next: LightRegionOverrideStore = { ...(store || {}) }
  const normalized = normalizeLightRegionOverridesForScene(overrides)
  if (Object.keys(normalized).length) next[sceneId] = normalized
  else delete next[sceneId]
  return next
}

/** 附一条撤销记录（返回新表）。 */
export function withArchivedLightRange(
  store: LightRangeArchiveStore | undefined,
  sceneId: string,
  entry: Omit<LightRangeArchiveEntry, 'at'> & { at?: number },
): LightRangeArchiveStore {
  const next: LightRangeArchiveStore = { ...(store || {}) }
  const entries = [...(next[sceneId] || [])]
  entries.push({
    floorId: entry.floorId,
    itemId: entry.itemId,
    previous: entry.previous === null ? null : normalizeLightRegionDescriptor(entry.previous),
    at: entry.at ?? Date.now(),
  })
  next[sceneId] = entries.slice(-MAX_ARCHIVE_ENTRIES)
  return next
}

/** 取出并移除最后一条撤销记录；返回 `{ store, entry }`（`entry` 为 null 表示无可撤销）。 */
export function popArchivedLightRange(
  store: LightRangeArchiveStore | undefined,
  sceneId: string,
): { store: LightRangeArchiveStore; entry: LightRangeArchiveEntry | null } {
  const next: LightRangeArchiveStore = { ...(store || {}) }
  const entries = [...(next[sceneId] || [])]
  const entry = entries.pop() ?? null
  if (entries.length) next[sceneId] = entries
  else delete next[sceneId]
  return { store: next, entry }
}

/** 只比较柔光相关字段是否变化（保存前跳过无变化写入）。 */
export function sameLightRegionOverrides(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {})
}

/**
 * 柔光范围通道（0.8.9 `studioLightRangeChannel`）。
 *
 * 上游用「通道」把「场景级共享范围」与「控件级覆盖」分开取；本项目
 * `resolveLightRanges()` 已经把两者合成一份结果，这里只导出上游名字作为
 * 语义别名，避免调用方以为有两套数据源。
 */
export const studioLightRangeChannel = resolveLightRanges

/**
 * 保存后「只改了柔光范围」的判定（0.8.9 `savedLightRangesOnlyChanged`）。
 *
 * 用途：保存成功后决定要不要重建整层灯光。只为柔光范围而重建全场景是最常见
 * 的性能浪费（一次保存几百毫秒）。
 */
export function savedLightRangesOnlyChanged(previous: unknown, next: unknown): boolean {
  return sameLightRegionOverrides(previous, next)
}
