import { getEntityDomain } from '@homeos/shared'

/** HA 实体 state → 中文标签工具函数 */

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
function formatEventLogStateLabel(entityId: string | null | undefined, state: string | null | undefined): string {
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
export function displayEntityStateLabel(entityId: string | null | undefined, state: string | null | undefined): string {
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
  const mode = String(state || '')
    .trim()
    .toLowerCase()
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

/** HA 实体 state → 中文标签 + 语义色单表映射 */

/** HA 实体 state 元信息：中文短标签 + 可选语义色 */
interface EntityStateMeta {
  label: string
  color?: string
}

/** HA 实体 state → { label, color } 单表 */
const ENTITY_STATE_META: Record<string, EntityStateMeta> = {
  any: { label: '任意' },
  on: { label: '开启', color: '#FFD60A' },
  off: { label: '关闭', color: '#64748B' },
  open: { label: '开', color: '#34D399' },
  closed: { label: '关', color: '#64748B' },
  opening: { label: '开中', color: '#818CF8' },
  closing: { label: '关中', color: '#A78BFA' },
  cool: { label: '制冷', color: '#0A84FF' },
  heat: { label: '制热', color: '#FF9F0A' },
  heat_cool: { label: '冷暖' },
  auto: { label: '自动', color: '#30D158' },
  dry: { label: '除湿', color: '#5AC8FA' },
  fan_only: { label: '送风', color: '#64D2FF' },
  locked: { label: '已锁', color: '#FFD60A' },
  unlocked: { label: '已解锁', color: '#30D158' },
  locking: { label: '上锁中', color: '#FF9F0A' },
  unlocking: { label: '解锁中', color: '#64D2FF' },
  jammed: { label: '卡住', color: '#FF453A' },
  cleaning: { label: '清扫', color: '#BF5AF2' },
  docked: { label: '回充', color: '#64D2FF' },
  returning: { label: '返回', color: '#A78BFA' },
  idle: { label: '空闲', color: '#94A3B8' },
  paused: { label: '暂停', color: '#F5A623' },
  playing: { label: '播放', color: '#BF5AF2' },
  error: { label: '异常', color: '#FF453A' },
  triggered: { label: '已触发', color: '#FF453A' },
  armed_away: { label: '离家', color: '#FF453A' },
  armed_home: { label: '居家', color: '#FF9F0A' },
  armed_night: { label: '夜间', color: '#7C3AED' },
  disarmed: { label: '撤防', color: '#30D158' },
  sounding: { label: '鸣响中', color: '#FF453A' },
  gas: { label: '燃气', color: '#F5A623' },
  detected: { label: '检测到', color: '#FF453A' },
  clear: { label: '正常', color: '#30D158' },
  home: { label: '在家', color: '#30D158' },
  not_home: { label: '外出', color: '#64748B' },
  streaming: { label: '直播中', color: '#F472B6' },
  recording: { label: '录制中', color: '#EF4444' },
  charging: { label: '充电中', color: '#34D399' },
  unavailable: { label: '离线', color: '#475569' },
  unknown: { label: '未知', color: '#64748B' },
}

/**
 * 根据 HA 实体 state 值查询中文短标签。
 *
 * @param state - HA 实体 state 值（如 `on`、`locked`、`unavailable`）。
 * @returns 对应的中文短标签；未命中映射或 state 为空时返回空字符串，
 *          再退而返回原始 state。
 */
export function entityStateLabel(state: string | null | undefined): string {
  if (!state) return ''
  return ENTITY_STATE_META[state]?.label ?? state
}
