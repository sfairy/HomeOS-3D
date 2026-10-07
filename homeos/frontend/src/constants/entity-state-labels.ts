/**
 * HA 实体 state → 中文标签工具函数
 *
 * 职责：
 * - 维护按域区分的弹窗状态文案表（lock / cover / valve / vacuum）。
 * - 提供状态标签解析、微件自定义优先、默认标签生成、事件日志文案等工具函数。
 * 依赖：
 * - @homeos/shared 中的 `getEntityDomain` 用于从 entity_id 提取域。
 * - entity-state-meta 中的 `entityStateLabel` / `ENTITY_STATE_META` 单表。
 *
 * 注意：
 * - 对象 key 为 HA 实体 state 值（如 on / off / locked）或域名（如 lock / cover），
 *   属于配置 key，不翻译。
 * - 仅 value（面向用户的中文文案）使用简体中文。
 */
import { getEntityDomain } from '@homeos/shared'
import { entityStateLabel } from './entity-state-meta'

/** 实体弹窗：按域展示的更完整状态文案 */
const POPUP_DOMAIN_STATE_LABELS = {
  lock: {
    locked: '已上锁',
    unlocked: '已解锁',
    locking: '上锁中',
    unlocking: '解锁中',
    jammed: '卡住',
  },
  cover: {
    open: '已打开',
    closed: '已关闭',
    opening: '打开中',
    closing: '关闭中',
  },
  valve: {
    open: '已打开',
    closed: '已关闭',
    opening: '打开中',
    closing: '关闭中',
  },
  vacuum: {
    cleaning: '清扫中',
    docked: '已回充',
    returning: '返回中',
    idle: '空闲',
    paused: '已暂停',
    off: '关闭',
    error: '异常',
  },
}

/**
 * 事件日志：传感器与开关类实体区分文案
 *
 * 对 on/off、open/closed、unavailable 等常见 state 做传感器 / 开关区分翻译，
 * 其余 state 走 `entityStateLabel`。
 *
 * @param entityId - HA 实体 ID，用于判断是否为 sensor 类。
 * @param state - HA 实体 state 值。
 * @returns 事件日志展示用的中文文案。
 */
function formatEventLogStateLabel(
  entityId: string | null | undefined,
  state: string | null | undefined,
): string {
  if (state === 'on' || state === 'open') {
    return entityId?.includes('sensor') ? '触发' : '开启'
  }
  if (state === 'off' || state === 'closed') {
    return entityId?.includes('sensor') ? '恢复' : '关闭'
  }
  if (state === 'unavailable') return '离线'
  return entityStateLabel(state)
}

/**
 * 查询指定域的弹窗状态文案。
 *
 * @param domain - HA 实体域名（如 `lock`、`cover`）。
 * @param state - HA 实体 state 值。
 * @returns 域专属中文文案；未命中时回退到通用标签，再回退到原始 state；state 为空时返回 `--`。
 */
export function popupDomainStateLabel(domain: string, state: string | null | undefined): string {
  if (!state) return '--'
  const domainLabels = POPUP_DOMAIN_STATE_LABELS[domain as keyof typeof POPUP_DOMAIN_STATE_LABELS]
  return domainLabels?.[state as keyof typeof domainLabels] ?? entityStateLabel(state) ?? state
}

/** 拥有专属弹窗状态文案的域集合 */
const POPUP_STATE_DOMAINS = new Set(['lock', 'cover', 'valve', 'vacuum'])

/**
 * 设备页 / 事件列表：实体 ID + 原始 state → 中文展示（数值类 state 保持原样）
 *
 * 对弹窗专属域优先使用域文案，其余走事件日志文案；state 为空时返回 `—`。
 *
 * @param entityId - HA 实体 ID。
 * @param state - HA 实体 state 值（数值类保持原样）。
 * @returns 面向用户的中文展示文案。
 */
export function displayEntityStateLabel(
  entityId: string | null | undefined,
  state: string | null | undefined,
): string {
  if (state == null || state === '') return '—'
  const domain = entityId ? getEntityDomain(entityId) : ''
  if (domain && POPUP_STATE_DOMAINS.has(domain)) {
    const label = popupDomainStateLabel(domain, state)
    if (label !== '--') return label
  }
  return formatEventLogStateLabel(entityId, state) || state
}

/**
 * climate / water_heater：state 是设定模式，hvac_action 才是压缩机实际动作。
 * 仅展示模式时，室温远高于设定却显示「制冷」+「待机」会让人误以为逻辑错误。
 */
export function displayClimateOperatingLabel(
  state: string | null | undefined,
  attrs?: Record<string, unknown> | null,
  actionLabels?: Record<string, string>,
  modeLabels?: Record<string, string>,
): string {
  const mode = String(state || '').trim().toLowerCase()
  if (!mode) return '—'
  if (mode === 'unavailable') return '离线'
  if (mode === 'unknown') return '未知'
  if (mode === 'off') return '关闭'

  const modeLabel = modeLabels?.[mode] || entityStateLabel(mode) || mode
  const action = String(attrs?.hvac_action ?? '')
    .trim()
    .toLowerCase()
  if (!action) return modeLabel

  const actionLabel = actionLabels?.[action]
  if (action !== 'idle' && action !== 'off' && actionLabel) return actionLabel
  if (action === 'idle') return `${modeLabel} · 待机`
  if (action === 'off') return `${modeLabel} · 未运转`
  return actionLabel || modeLabel
}
