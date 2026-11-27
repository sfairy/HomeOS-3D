/**
 * 触发器摘要文案（导航副标题）与日出/日落字段归一。
 *
 * 抽成纯函数的理由有两个：
 * 1. 触发器导航的副标题逻辑同时被「紧凑导航」与「列表卡片」使用，写进组件会让渲染函数
 *    的圈复杂度随触发器类型增加而线性上升（每加一种类型都多一层分支）；
 * 2. 日出/日落是新增类型，它的字段（event / offsetMinutes）需要与后端一致地归一，
 *    放在这里可以单独断言「负偏移显示为提前 / 0 偏移不显示」。
 */

/** 触发器数据的宽松形状：不同来源（后端记录 / 草稿）字段不一定齐全。 */
export interface TriggerLike {
  type?: string
  at?: string
  entityId?: string
  to?: string
  event?: string
  offsetMinutes?: number | string | null
}

/** 日出/日落事件的中文名（未知值按日出处理，与后端默认一致）。 */
export function sunEventLabel(event?: string | null): string {
  return event === 'sunset' ? '日落' : '日出'
}

/** 偏移分钟归一：非数值按 0；超出 ±180 夹紧（与后端上限一致）。 */
export function normalizeSunOffset(raw?: number | string | null): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return 0
  return Math.max(-180, Math.min(180, Math.round(value)))
}

/** 偏移的中文描述：0 不显示，正为推后、负为提前。 */
export function describeSunOffset(raw?: number | string | null): string {
  const offset = normalizeSunOffset(raw)
  if (offset === 0) return ''
  return `${offset > 0 ? '+' : ''}${offset} 分钟`
}

/** 导航副标题：时间 / 日出日落 / 实体 / 状态迁移，无可用信息时返回空串。 */
export function describeTriggerSubtitle(trigger: TriggerLike): string {
  if (trigger.type === 'time' && trigger.at) return trigger.at
  if (trigger.type === 'sun') {
    const label = sunEventLabel(trigger.event)
    const offset = describeSunOffset(trigger.offsetMinutes)
    return offset ? `${label} ${offset}` : label
  }
  if ((trigger.type === 'lock_unlock' || trigger.type === 'state') && trigger.entityId) {
    return trigger.entityId
  }
  if (trigger.type === 'state' && trigger.to) return `→ ${trigger.to}`
  return ''
}
