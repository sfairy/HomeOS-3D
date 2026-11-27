import { armSecurityPanel, disarmSecurityPanel, updateSecurityPanelZones } from '@/domain/api/security'
import { hapticAlert } from '@/kernel/utils/ui'
import { type SecurityModeSocketPayload } from '@/kernel/utils/bridge/store-bridge'
import { type FloatingWidget, type UILayoutConfig } from '@/kernel/types/layout'
import { getApiErrorMessage, isUnauthorizedError } from '@/kernel/utils/core'

/**
 * 安防布防/撤防结果的纯函数解读（无外部依赖，便于独立回归测试）。
 *
 * 与 `panel-arm.util.ts` 分离的原因：后者会 import API / 触感反馈模块，
 * 在 Node 的纯函数测试里无法解析 `@/` 别名。这里只保留「把后端结果翻译成
 * 用户可读结论」的逻辑。
 */

/** 布防/撤防 API 响应结果 */
export interface SecurityArmResult {
  success?: boolean
  mode?: string
  /** 是否跳过（如当前已是目标模式） */
  skipped?: boolean
  /** 模式已提交但联动有失败（撤防 fail-open） */
  degraded?: boolean
  /** 模式是否已落库；`false` 表示只改了内存，重启会回退到上一次成功落库的模式 */
  persisted?: boolean
  actions?: { executed?: number; failed?: number }
  /** 实际执行成功的联动条数 */
  appliedCount?: number
  /** 布防失败后被回滚的联动条数 */
  compensated?: number
  failedItems?: Array<{ entity_id?: string; message?: string }>
  /** 补偿动作自身失败的条目（二次告警，不能吞） */
  compensationFailures?: Array<{ entity_id?: string; message?: string }>
  /** 已经执行且无法撤销的联动（scene / script / button 等） */
  irreversibleItems?: Array<{ entity_id?: string; service?: string }>
  /** 已下发但状态未确认的联动条数（门锁/阀门等） */
  unverifiedCount?: number
  unverified?: number
  unverifiedItems?: Array<{ entity_id?: string; message?: string }>
}

function pushCountPart(parts: string[], count: number, label: string): void {
  if (count > 0) parts.push(`${label} ${count} 条`)
}

function namedItemLabels(
  items: Array<{ entity_id?: string; message?: string }> | undefined,
  preferMessage = true,
): string[] {
  return (items || [])
    .map((item) => (preferMessage ? item.entity_id || item.message || '' : item.entity_id || ''))
    .filter(Boolean)
    .slice(0, 3)
}

function pushNamedPart(parts: string[], label: string, names: string[]): void {
  if (names.length) parts.push(`${label}：${names.join('、')}`)
}

/**
 * 把「已执行 / 未执行 / 已补偿」压成一行给安防页显示。
 *
 * 布防失败时用户最需要的不是「失败」两个字，而是「哪些设备被改过、有没有改回来」。
 */
export function describeSecurityArmItems(data?: SecurityArmResult): string {
  if (!data) return ''
  const parts: string[] = []
  pushCountPart(parts, Number(data.appliedCount ?? data.actions?.executed ?? 0), '已执行')
  pushCountPart(parts, Number(data.actions?.failed ?? 0), '未执行')
  pushCountPart(parts, Number(data.unverifiedCount ?? data.unverified ?? 0), '未确认')
  pushCountPart(parts, Number(data.compensated ?? 0), '已补偿')
  pushNamedPart(parts, '失败设备', namedItemLabels(data.failedItems))
  pushNamedPart(parts, '未确认设备', namedItemLabels(data.unverifiedItems))
  pushNamedPart(parts, '不可撤销', namedItemLabels(data.irreversibleItems, false))
  if ((data.compensationFailures || []).length) parts.push('补偿未完成，请检查 HA')
  return parts.join('｜')
}

/** 给 UI 层的布防/撤防结果解读 */
export type SecurityArmUiOutcome =
  | { kind: 'failed'; message: string }
  | { kind: 'partial'; message: string }
  | { kind: 'skipped' }
  | { kind: 'ok' }

const PERSIST_WARNING = '（未能写入本机存储，重启后可能回退）'

/** 半成功 / 未确认场景的文案（degraded、撤防 fail-open、unverified）。 */
function mapPartialOrUnverifiedArmResult(
  requestedMode: string,
  modeLabel: string,
  data: SecurityArmResult | undefined,
  failed: number,
  unverified: number,
): SecurityArmUiOutcome {
  const detail = describeSecurityArmItems(data)
  const partialReason =
    failed > 0 ? `${failed} 条联动失败` : unverified > 0 ? `${unverified} 条联动未确认` : '部分联动未完成'
  const head = requestedMode === 'disarmed' ? `已撤防，但 ${partialReason}` : `${modeLabel}已生效，但 ${partialReason}`
  return {
    kind: 'partial',
    message: head + (detail ? `（${detail}）` : '') + (data?.persisted === false ? PERSIST_WARNING : ''),
  }
}

/**
 * 解读布防/撤防 API 结果，供总览页与浮动 widget 共用提示文案。
 *
 * - 布防 fail-closed：`success===false` → failed
 * - 撤防 fail-open：模式已是 disarmed 但联动失败 → partial（警告，非错误）
 * - `degraded` 且 success → partial
 * - `unverifiedCount`/`unverified` > 0 → partial（已下发未确认，不得全绿）
 * - `persisted===false`：模式已生效但没落库 → 仍按已生效提示，不谎报失败
 */
function mapFailedArmResult(
  modeLabel: string,
  data: SecurityArmResult | undefined,
  failed: number,
): SecurityArmUiOutcome {
  const detail = describeSecurityArmItems(data)
  const head = failed > 0 ? `${modeLabel}未生效：${failed} 条联动失败，布防已取消` : `${modeLabel}未生效`
  return { kind: 'failed', message: head + (detail ? `（${detail}）` : '') }
}

function mapPersistWarningOutcome(requestedMode: string, modeLabel: string): SecurityArmUiOutcome {
  return {
    kind: 'partial',
    message: requestedMode === 'disarmed' ? `已撤防${PERSIST_WARNING}` : `${modeLabel}已生效${PERSIST_WARNING}`,
  }
}

export function interpretSecurityArmResult(
  requestedMode: string,
  modeLabel: string,
  data?: SecurityArmResult,
): SecurityArmUiOutcome {
  const failed = data?.actions?.failed ?? 0
  const unverified = Number(data?.unverifiedCount ?? data?.unverified ?? 0)
  const committedDisarm = data?.mode === 'disarmed' && requestedMode === 'disarmed'

  if (data?.success === false && !committedDisarm) {
    return mapFailedArmResult(modeLabel, data, failed)
  }

  if (data?.skipped) return { kind: 'skipped' }

  if (data?.degraded || (committedDisarm && failed > 0) || unverified > 0) {
    return mapPartialOrUnverifiedArmResult(requestedMode, modeLabel, data, failed, unverified)
  }

  // 模式已生效但没落库：不能当完全成功（重启会回退），也不该谎报失败。
  if (data?.persisted === false) return mapPersistWarningOutcome(requestedMode, modeLabel)

  return { kind: 'ok' }
}

/** 安防面板布防/撤防工具模块。 */
/** 安防面板布防/撤防 API + 本地状态 patch（总览页与浮动 widget 共用） */


/**
 * 根据布防响应本地 patch 安防模式状态。
 *
 * 逻辑：
 * - 响应 mode 为 disarmed 时，patch 为撤防并清空区域；
 * - 否则 patch 为对应布防模式，区域列表优先用传入 zoneIds，为空时回退到全量 zones。
 *
 * @param mode 请求的目标模式
 * @param zoneIds 目标区域 ID 列表
 * @param zones 全量区域列表（zoneIds 为空时用作回退）
 * @param patchModeFromSocket 状态 patch 回调
 * @param data API 响应数据
 */
function patchArmedStateFromArmResponse(
  mode: string,
  zoneIds: string[],
  zones: Array<{ id: string }>,
  patchModeFromSocket: (data: SecurityModeSocketPayload) => void,
  data?: SecurityArmResult,
) {
  // 联动 fail-closed：后端未提交布防态时勿乐观 patch，避免 UI 假布防
  if (data?.success === false) {
    // 撤防 fail-open（含旧后端）：mode 已是 disarmed 时仍须同步 UI
    if (data.mode === 'disarmed') {
      patchModeFromSocket({ mode: 'disarmed', zones: [] })
    }
    return
  }
  // 同模式被跳过时后端没有改任何区域：按请求 zoneIds 覆盖会让 UI 与真实布防集合分叉。
  if (data?.skipped) return
  const resolvedMode = data?.mode || mode
  if (resolvedMode === 'disarmed') {
    patchModeFromSocket({ mode: 'disarmed', zones: [] })
    return
  }
  const armedIds = zoneIds.length ? zoneIds : zones.map((z) => z.id)
  patchModeFromSocket({ mode: resolvedMode, zones: armedIds })
}

/**
 * 执行安防面板布防/撤防：调用 API 并本地 patch 状态。
 *
 * @param mode 目标模式（如 armed_away、armed_home、disarmed）
 * @param zoneIds 目标区域 ID 列表
 * @param zones 全量区域列表
 * @param patchModeFromSocket 状态 patch 回调
 * @returns API 响应结果
 */
export async function executeSecurityPanelArm(
  mode: string,
  zoneIds: string[],
  zones: Array<{ id: string }>,
  patchModeFromSocket: (data: SecurityModeSocketPayload) => void,
): Promise<SecurityArmResult> {
  const { data } = mode === 'disarmed' ? await disarmSecurityPanel() : await armSecurityPanel(mode, zoneIds)
  // 高危操作触感反馈：仅真正提交成功且非跳过时触发（含撤防 degraded）
  if (data?.success !== false && !data?.skipped) hapticAlert()
  patchArmedStateFromArmResponse(mode, zoneIds, zones, patchModeFromSocket, data)
  return data || {}
}

/** 安防面板布局配置工具模块。 */
/** 从顶层 floatingWidgets 读写 securityPanel 区域配置 */

/**
 * 查找布局中所有启用的安防面板小部件。
 *
 * @param layout 布局配置
 * @returns 安防面板引用列表（enabled !== false 的）
 */
function findSecurityPanelWidgets(layout: UILayoutConfig): FloatingWidget[] {
  const refs: FloatingWidget[] = []
  for (const widget of layout.floatingWidgets || []) {
    if (widget.type === 'securityPanel' && widget.enabled !== false) {
      refs.push(widget)
    }
  }
  return refs
}

/**
 * 从布局中读取首个安防面板的区域配置。
 *
 * @param layout 布局配置
 * @returns 区域配置数组；无安防面板或无区域时返回空数组
 */
export function getSecurityPanelZonesFromLayout(layout: UILayoutConfig): SecurityZonePayload[] {
  for (const widget of findSecurityPanelWidgets(layout)) {
    const zones = widget.config?.zones
    if (Array.isArray(zones) && zones.length) {
      return zones as SecurityZonePayload[]
    }
  }
  return []
}

/**
 * 将区域配置镜像写入所有安防面板小部件的 config.zones。
 *
 * @param uiStore 布局 store，提供 layoutConfig 与 updateFloatingWidget
 * @param zones 待写入的区域配置
 * @returns true 表示至少更新了一个小部件；false 表示无安防面板小部件
 */
export function mirrorSecurityPanelZonesToLayout(
  uiStore: {
    layoutConfig: UILayoutConfig
    updateFloatingWidget: (id: string, updates: Partial<FloatingWidget>) => void
  },
  zones: SecurityZonePayload[],
): boolean {
  const widgets = findSecurityPanelWidgets(uiStore.layoutConfig)
  if (!widgets.length) return false
  for (const widget of widgets) {
    uiStore.updateFloatingWidget(widget.id, {
      config: { ...(widget.config || {}), zones },
    })
  }
  return true
}

/** 安防面板区域 bootstrap 去重模块。 */

/** 防止多个 SecurityPanelWidget 实例重复 bootstrap 区域到后端 */
//: 持久化标记：浏览器刷新后模块状态会重置，若只靠内存标记，用户在后端
//: 主动删除全部防区（合法操作）后刷新页面就会把旧区域重新推回去。
const STORAGE_KEY = 'homeos.security.panel-zones-bootstrapped'

function readDoneMarker(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeDoneMarker(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, '1')
  } catch {
    // 隐私模式 / 配额满：退化为仅内存去重
  }
}

let bootstrapDone = readDoneMarker()
let bootstrapPromise: Promise<boolean> | null = null

/**
 * 保证 bootstrap 仅执行一次。
 *
 * 逻辑：
 * 1. 已完成（bootstrapDone=true）直接返回 true；
 * 2. 进行中（bootstrapPromise 非空）复用同一 Promise；
 * 3. 未开始则执行 run()，成功后标记 bootstrapDone，无论成败最终清空 Promise。
 *
 * @param run 实际执行 bootstrap 的异步函数，返回是否成功
 * @returns 是否成功（已完成或本次执行成功）
 */
export async function bootstrapSecurityPanelZonesOnce(run: () => Promise<boolean>): Promise<boolean> {
  if (bootstrapDone) return true
  if (bootstrapPromise) return bootstrapPromise
  bootstrapPromise = run()
    .then((ok) => {
      if (ok) {
        bootstrapDone = true
        writeDoneMarker()
      }
      return ok
    })
    .finally(() => {
      bootstrapPromise = null
    })
  return bootstrapPromise
}

/** 安防区域后端同步工具模块。 */
/** 将安防区域配置同步到后端 */

/** 安防区域 payload 结构（与后端 API 对齐） */
export interface SecurityZonePayload {
  id: string
  name: string
  zoneType?: string
  sensors?: string[]
  roomId?: string
}

/**
 * 保存前清洗区域配置：name 去空白，空名补「未命名区域」。
 *
 * @param zones 原始区域列表
 * @returns 清洗后的区域列表（浅拷贝）
 */
export function prepareZonesForSave(zones: SecurityZonePayload[]): SecurityZonePayload[] {
  return zones.map((z) => ({
    ...z,
    name: z.name?.trim() || '未命名区域',
  }))
}

/**
 * 将区域配置归一化为后端 API 所需格式。
 *
 * 规则：
 * - 过滤掉 id 或 name 为空的项；
 * - zoneType 缺失默认 'all'；
 * - sensors 去空白并过滤空值；
 * - roomId 为空时不包含该字段。
 *
 * @param zones 原始区域列表
 * @returns API payload 数组
 */
export function normalizeZonesForApi(zones: SecurityZonePayload[]) {
  return prepareZonesForSave(zones)
    .filter((z) => z.id && z.name?.trim())
    .map((z) => ({
      id: z.id,
      name: z.name.trim(),
      zoneType: z.zoneType || 'all',
      sensors: Array.isArray(z.sensors) ? z.sensors.map((s) => String(s || '').trim()).filter(Boolean) : [],
      ...(z.roomId?.trim() ? { roomId: z.roomId.trim() } : {}),
    }))
}

/**
 * 提交安防区域配置到后端。
 *
 * @param zones 区域列表
 * @returns 归一化后的 payload（已发送给后端）
 */
export async function postSecurityZones(zones: SecurityZonePayload[]) {
  const payload = normalizeZonesForApi(zones)
  // 空列表会清空全部防区：这是玩家在 UI 里显式保存的结果，需要带 confirmClear 才被后端接受。
  await updateSecurityPanelZones(payload, payload.length === 0)
  return payload
}

/**
 * 安全提交安防区域配置（不抛异常）。
 *
 * 成功返回 { ok: true, payload }，失败返回 { ok: false, error }，
 * 错误消息经 getApiErrorMessage 归一化，默认「同步安防区域失败」。
 * 401 时额外标记 unauthorized，便于 UI 交给全局登录引导、避免重复报错。
 *
 * @param zones 区域列表
 * @returns 成功/失败联合类型结果
 */
export async function postSecurityZonesSafe(zones: SecurityZonePayload[]) {
  try {
    const payload = await postSecurityZones(zones)
    return { ok: true as const, payload }
  } catch (e) {
    return {
      ok: false as const,
      error: getApiErrorMessage(e, '同步安防区域失败'),
      unauthorized: isUnauthorizedError(e),
    }
  }
}
