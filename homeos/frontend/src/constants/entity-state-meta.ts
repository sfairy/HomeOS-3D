/**
 * HA 实体 state → 中文标签 + 语义色单表映射
 *
 * 职责：
 * - 维护 HA 实体 state 值到「中文短标签 + 语义色（HEX）」的一体化映射表，
 *   供部件设置、3D 热点、状态本地化共用（由原 entity-state-labels /
 *   entity-state-colors 双表合并而来，新增状态只需改这一处）。
 * - 提供状态标签 / 语义色查询函数（保持原双表的 fallback 行为）。
 *
 * 依赖：无外部依赖，纯静态映射与纯函数。
 *
 * 配色约定：按状态含义配色——冷蓝、热橙、开启琥珀、告警红、安全绿等。
 *
 * 注意：
 * - 对象 key 为 HA 实体 state 值（如 on / off / heat），属于配置 key，不翻译。
 * - label 为面向用户的中文短标签，color 为 CSS HEX 颜色值，均不翻译。
 * - 仅标签表独有的状态（any / heat_cool）不带 color，查色时回退 null。
 */

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

/**
 * 根据 HA 实体 state 查询语义色。
 *
 * @param state - HA 实体 state 值（如 `on`、`heat`、`unavailable`）。
 * @returns 对应的 HEX 颜色字符串；未命中映射或 state 为空时返回 null。
 */
export function entityStateColor(state: string | null | undefined): string | null {
  if (!state) return null
  return ENTITY_STATE_META[state]?.color ?? null
}
