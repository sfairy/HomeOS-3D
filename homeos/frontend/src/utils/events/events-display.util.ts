/**
 * 事件中心展示工具
 *
 * 职责：
 * - 把后端返回的「按域聚合」数据归一化为统一的 { domain, count } 列表。
 * - 提供小时窗口选项的短标签（h / d）与中文展示文案。
 * - 提供事件计数的本地化格式化（千 / 万 / M 缩写）。
 * - 从 entity_id 提取 domain / object_id；展示状态列优先用属性变更的中文描述。
 *
 * 依赖：
 * - @homeos/shared 提供 getEntityDomain。
 * - @/constants/entity-state-labels 提供 displayEntityStateLabel。
 * - @/utils/entity/control-attr-change.util 提供 parseAttrStateDiff。
 *
 * 注意：domain / object_id 为 HA 标识符片段，不翻译；缩写 h / d / k / M 为单位，不翻译。
 */
import { getEntityDomain } from '@homeos/shared'
import { displayEntityStateLabel } from '@/constants/entity-state-labels'
import { parseAttrStateDiff } from '@/utils/entity/control-attr-change.util'

/**
 * 归一化「按域聚合」数据为数组（兼容数组 / 对象两种返回形态）。
 *
 * @param byDomain 后端返回的按域聚合（数组形态或 Record<domain, count>）
 * @returns 排序后的 { domain, count } 数组；空输入返回空数组
 */
export function normalizeByDomain(byDomain: unknown) {
  if (!byDomain) return []
  if (Array.isArray(byDomain)) {
    return byDomain
      .filter((row) => row?.domain != null)
      .map((row) => ({ domain: row.domain, count: Number(row.count) || 0 }))
  }
  if (typeof byDomain === 'object') {
    return Object.entries(byDomain as Record<string, unknown>)
      .map(([domain, count]) => ({ domain, count: Number(count) || 0 }))
      .sort((a, b) => b.count - a.count)
  }
  return []
}


/**
 * 小时窗口短标签（紧凑英文）：不足 24 小时为 `Nh`，24 小时为 `24h`，
 * 整天为 `Nd`，否则为 `Nh`。
 *
 * @param h 小时数
 * @returns 紧凑短标签字符串
 */
export function hoursLabel(h: number) {
  if (h < 24) return `${h}h`
  if (h === 24) return '24h'
  if (h % 24 === 0) return `${h / 24}d`
  return `${h}h`
}

/**
 * 小时窗口中文展示文案：不足 24 小时为 `N 小时`，整天为 `N 天`。
 *
 * @param h 小时数
 * @returns 中文展示文案
 */
export function formatHourOption(h: number) {
  if (h < 24) return `${h} 小时`
  if (h === 24) return '24 小时'
  if (h % 24 === 0) return `${h / 24} 天`
  return `${h} 小时`
}


/**
 * 格式化事件计数：百万级用 M，万级以上用 k，否则用本地化千分位。
 *
 * @param n 计数原始值
 * @returns 紧凑展示字符串
 */
export function formatCount(n: unknown) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}k`
  return new Intl.NumberFormat('zh-CN').format(v)
}

/**
 * 从 entity_id 提取 domain；缺失时返回「—」。
 *
 * @param entityId HA 实体 id
 * @returns domain 字符串或「—」
 */
export function entityDomain(entityId: string) {
  return getEntityDomain(entityId) || '—'
}

/**
 * 从 entity_id 提取 object_id（点号之后部分）。
 *
 * @param entityId HA 实体 id
 * @returns object_id；无点号时原样返回
 */
export function entityObjectId(entityId: string) {
  const dot = entityId.indexOf('.')
  return dot >= 0 ? entityId.slice(dot + 1) : entityId
}



/**
 * 展示状态列：属性变更优先用中文描述。
 *
 * 优先级：attrText（stateDiff 可解析时用解析结果）→ entity state 中文标签 → 「—」。
 *
 * @param evt 事件对象（含 entityId / attrText / stateDiff / state）
 * @returns 展示用字符串
 */
export function displayEventState(evt: {
  entityId?: string | null
  attrText?: string | null
  stateDiff?: string | null
  state?: string | null
}) {
  if (evt.attrText) {
    const fromDiff = evt.stateDiff?.startsWith('attr:') ? parseAttrStateDiff(evt.stateDiff) : null
    return fromDiff || evt.attrText
  }
  if (evt.state) return displayEntityStateLabel(evt.entityId, evt.state)
  return '—'
}
