/**
 * 能源绑定双写桥：系统配置 `config.energy` ↔ 生活账户面板 `statsSensors.energySources.grid`。
 *
 * 为什么必须有这一层：这两份配置物理上分开存放，各有各的读者。
 *
 * - `config.energy` 是后端能耗聚合与报表的输入（按主电表差分 / 读表）；
 * - `statsSensors` 是前端能耗面板、弹窗、底栏的输入。
 *
 * 写入路径也分叉：首装向导写前者，绑定页写后者。只在其中一侧写，用户就会看到
 * 「明明绑了电表，统计还是没数」。所以两个方向都要显式对齐一次：
 * 保存时面板 → 配置（沿用天气实体的既有约定：界面侧是操作真源，配置是给后端的投影），
 * 挂载时配置 → 空白面板（只在面板完全没配置时继承，绝不覆盖用户已有选择）。
 *
 * 判定「面板这一侧能否唯一表达一块主电表」的逻辑只写在这里：约定命名模式推导出的
 * 实体 ID、多账户模式下的多块表，后端都只能认一块，硬同步会把统计指到错的表上。
 */

export type PanelEnergyBinding = {
  /** 面板这一侧能否唯一、忠实地映射为 `config.energy.meterEntityId` */
  expressible: boolean
  /** 面板当前的主电表（不可表达时仍返回主行，供提示文案使用） */
  meterEntityId: string
  /** 不可同步的原因；可同步时为 null */
  blockedBy: 'missing' | 'mode' | 'multi-account' | 'empty' | null
}

type PanelAccountRow = {
  number?: string
  label?: string
  entityId?: string
  entityMap?: Record<string, string>
}

/** 与后端 `energy_meter._REJECT_*` 对齐：这些 device_class / 单位一定不是累计电量 */
const REJECT_DEVICE_CLASSES = new Set(['power', 'current', 'voltage', 'apparent_power'])
const REJECT_UNITS = new Set(['w', 'kw', 'mw', 'va', 'kva', 'a', 'v'])

type PanelSource = {
  mode?: string
  account?: string
  entityId?: string
  accountEntries?: Array<PanelAccountRow | undefined>
  accountEntities?: Array<PanelAccountRow | undefined>
  multiAccounts?: Array<PanelAccountRow | undefined>
  attrMap?: Record<string, string>
  entityMap?: Record<string, string>
}

/** 统一的非空判断：null / undefined / 空白串都算空 */
function hasText(value: unknown): boolean {
  return String(value ?? '').trim().length > 0
}

/** 映射表里是否已经填过任何值（字段映射也算「已配置」） */
function mapHasText(map?: Record<string, string>): boolean {
  return Object.values(map ?? {}).some((value) => hasText(value))
}

/**
 * 读取面板侧的 grid 数据源。
 *
 * layout 里 `energySources` 是 `Record<string, unknown>`，这里收窄成最小结构后再判断，
 * 避免调用方各自 `as` 断言出不同结果。
 */
function readGridSource(statsSensors: unknown): PanelSource | null {
  const stats = statsSensors as { energySources?: Record<string, unknown> } | null | undefined
  const raw = stats?.energySources?.grid
  return raw && typeof raw === 'object' ? (raw as PanelSource) : null
}

/** 统一的「不可同步」返回值，避免每个早退分支各写一份字段 */
function blockedBinding(blockedBy: PanelEnergyBinding['blockedBy']): PanelEnergyBinding {
  return { expressible: false, meterEntityId: '', blockedBy }
}

/** 收集面板各账户行上已填的实体（空行不算，否则「多账户」会被空行误判） */
function rowMeters(src: PanelSource): string[] {
  const rows = Array.isArray(src.accountEntities) ? src.accountEntities : []
  const meters: string[] = []
  for (const row of rows) {
    const meter = String(row?.entityId ?? '').trim()
    if (meter) meters.push(meter)
  }
  return meters
}

/** 面板主电表：镜像字段优先，缺省时回退到首个账户行 */
function primaryMeter(src: PanelSource, meters: string[]): string {
  return String(src.entityId ?? '').trim() || meters[0] || ''
}

/** 账户号 / 综合实体是否已经填过 */
function hasAnyAccountConfig(src: PanelSource): boolean {
  if (hasText(src.account) || hasText(src.entityId)) return true
  if ((src.accountEntries ?? []).some((row) => hasText(row?.number))) return true
  return (src.accountEntities ?? []).some((row) => hasText(row?.entityId))
}

/** 多账户行上的实体或字段映射是否已经填过 */
function hasAnyMultiAccountConfig(src: PanelSource): boolean {
  const rows = src.multiAccounts ?? []
  return rows.some((row) => hasText(row?.entityId)) || rows.some((row) => mapHasText(row?.entityMap))
}

/**
 * 面板在该类别上是否完全没配置过。
 *
 * 只有这种状态下才允许把向导的主电表「继承」过来：任何账户号、账户实体、
 * 多账户行或字段映射都代表用户已经做过选择，替 ta 改模式会直接打乱绑定。
 */
function isPristineSource(src: PanelSource): boolean {
  if (hasAnyAccountConfig(src)) return false
  if (hasAnyMultiAccountConfig(src)) return false
  return !mapHasText(src.attrMap) && !mapHasText(src.entityMap)
}

/**
 * 面板侧的主电表绑定及其可同步性。
 *
 * @param statsSensors `layoutConfig.statsSensors`
 * @returns 主电表、是否可同步、不可同步的原因
 */
export function readPanelEnergyBinding(statsSensors: unknown): PanelEnergyBinding {
  const src = readGridSource(statsSensors)
  if (!src) return blockedBinding('missing')
  if (src.mode !== 'entity') return blockedBinding('mode')
  const meters = rowMeters(src)
  const meter = primaryMeter(src, meters)
  if (!meter) return blockedBinding('empty')
  // 多账户意味着有多块表；config.energy 只有单个主表槽位，同步会静默丢掉其它表。
  if (new Set(meters).size > 1) {
    return { expressible: false, meterEntityId: meter, blockedBy: 'multi-account' }
  }
  return { expressible: true, meterEntityId: meter, blockedBy: null }
}

/**
 * 读取系统配置里的主电表 entity_id。
 *
 * @param energy `config.energy` 分区（可能未加载）
 * @returns 去空白后的 entity_id；缺失时为空串
 */
export function readConfigEnergyMeter(energy: unknown): string {
  const section = energy as { meterEntityId?: unknown } | null | undefined
  const value = section?.meterEntityId
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 把系统配置里的主电表补进「完全没配置」的面板（单向、不覆盖）。
 *
 * 向导绑定的是单块综合实体电表，所以空白面板会一并从默认的约定命名切到 entity 模式；
 * 只要用户填过任何东西就原样保留，让 ta 自己决定要不要用综合实体。
 *
 * @param statsSensors `layoutConfig.statsSensors`（会被就地修改）
 * @param meterEntityId 系统配置里的主电表
 * @returns 是否发生了写入（调用方据此决定要不要保存布局）
 */
export function seedPanelEnergyMeter(statsSensors: unknown, meterEntityId: string): boolean {
  const meter = String(meterEntityId || '').trim()
  if (!meter) return false
  const src = readGridSource(statsSensors)
  if (!src) return false
  if (primaryMeter(src, rowMeters(src))) return false
  if (!isPristineSource(src)) return false
  src.mode = 'entity'
  src.entityId = meter
  if (Array.isArray(src.accountEntities) && src.accountEntities.length) {
    const firstRow = src.accountEntities[0]
    if (firstRow && typeof firstRow === 'object') firstRow.entityId = meter
  } else {
    src.accountEntities = [{ entityId: meter, label: '' }]
  }
  return true
}

/**
 * 渲染主电表与能耗统计差异提示、并在保存时决定「能不能把这块表交给统计」。
 *
 * 与后端 `is_cumulative_energy_meter` 同口径（`device_class=energy` 或 Wh/kWh/MWh）：
 * 生活账户里的综合实体常常是「余额」（¥），而能耗聚合要的是累计电量。把余额表写进
 * `config.energy` 会让曲线恒为 0 或负数，后端也会拒绝，所以这里先拦住并说清原因。
 * 查不到 attributes 时放行（实体还没同步，交由后端同口径校验）。
 */
export function isCumulativeEnergyMeter(attrs: unknown): boolean {
  const raw = attrs as { device_class?: unknown; unit_of_measurement?: unknown } | null | undefined
  if (!raw) return false
  const deviceClass = String(raw.device_class ?? '').toLowerCase()
  const unit = String(raw.unit_of_measurement ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
  if (REJECT_DEVICE_CLASSES.has(deviceClass) || REJECT_UNITS.has(unit)) return false
  if (deviceClass === 'energy') return true
  return unit === 'kwh' || unit === 'wh' || unit === 'mwh'
}

/**
 * 生成「面板 → 系统配置」的能源补丁；不可同步时返回 null。
 *
 * @param statsSensors `layoutConfig.statsSensors`
 * @returns `{ energy: { meterEntityId } }`，或 null 表示本次不该写配置
 */
export function buildEnergyConfigPatch(statsSensors: unknown): {
  energy: { meterEntityId: string }
} | null {
  const binding = readPanelEnergyBinding(statsSensors)
  if (!binding.expressible || !binding.meterEntityId) return null
  return { energy: { meterEntityId: binding.meterEntityId } }
}
