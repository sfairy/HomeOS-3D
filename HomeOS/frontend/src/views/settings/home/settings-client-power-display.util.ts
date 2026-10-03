/**
 * @file settings-client-power-display.util.ts
 * @module frontend/src/views/settings/home
 * 职责：客户端智能充放电面板的纯展示工具函数。封装实时状态索引、阈值校验与卡片标题生成逻辑，
 *       供 useClientPowerPanel / useClientPowerDisplay 与 Section 组件复用。
 * 关键依赖：
 *   - getClientDeviceKindLabel / getSystemInfoFromClientRow：读取设备类型与系统信息
 */
import {
  getClientDeviceKindLabel,
  getSystemInfoFromClientRow,
} from '@/utils/client/system-display.util'

/** 将实时客户端列表按 clientId 索引为 Map，便于按 id 查找行数据 */
export function buildClientStatusMap(liveClients: Array<{ clientId: string }>) {
  const map: Record<string, (typeof liveClients)[number]> = {}
  for (const c of liveClients) map[c.clientId] = c
  return map
}

/** 按 client.id 在状态 Map 中查找实时行；未找到返回 null */
export function resolveClientLiveRow<T extends { id: string }>(
  client: T,
  statusMap: Record<string, unknown>,
) {
  return (statusMap[client.id] as T | null) || null
}

/** 已启用但未绑定 chargerSwitch 实体时返回 true（用于提示「未绑定」徽章） */
export function clientNeedsChargerSwitch(client: {
  enabled?: boolean
  chargerSwitchEntityId?: string
}) {
  return client.enabled && !String(client.chargerSwitchEntityId || '').trim()
}

/** 校验滞回阈值：低电量须小于高电量，否则返回 true 表示无效 */
export function clientSelfChargeThresholdInvalid(client: {
  selfCharge?: { lowPercent?: number; highPercent?: number }
}) {
  const low = client.selfCharge?.lowPercent ?? 20
  const high = client.selfCharge?.highPercent ?? 80
  return low >= high
}

/** 生成已配置终端的卡片标题：优先用户自定义 label，其次「前缀 · id」，最终回退「未命名终端」 */
export function buildClientCardTitle(client: { id?: string; label?: string }, liveRow: unknown) {
  const kind = liveRow ? getClientDeviceKindLabel(getSystemInfoFromClientRow(liveRow)) : null
  const label = String(client.label || '').trim()
  const id = String(client.id || '').trim()

  if (label && !label.includes('…')) return label

  const prefix = label.includes('·') ? label.split('·')[0].trim() : kind || '终端'
  if (id) return `${prefix} · ${id}`
  return label || kind || '未命名终端'
}

/** 生成待配对终端的卡片标题：设备类型 · clientId（无 id 时仅显示设备类型） */
export function buildPendingCardTitle(p: { clientId?: string; systemInfo?: unknown }) {
  const kind = getClientDeviceKindLabel(getSystemInfoFromClientRow(p))
  const id = String(p.clientId || '').trim()
  return id ? `${kind} · ${id}` : kind
}
