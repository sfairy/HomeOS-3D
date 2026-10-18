/** HA 实体 state → 中文标签 + 语义色单表映射 */

/** HA 实体 state 元信息：中文短标签 + 可选语义色 */
interface EntityStateMeta {
  label: string
  color?: string
}

/** HA 实体 state → { label, color } 单表 */
const ENTITY_STATE_META: Record<string, EntityStateMeta> = {
  any: { label: '任意' },
  // 状态色只表达语义：激活/进行中 → 暖铜；正常/在线 → 绿；待机/关闭 → 中性；
  // 告警/危险 → 珊瑚红；过渡/自动 → 青或琥珀。不再逐状态使用 iOS 彩虹色。
  on: { label: '开启', color: '#ffc46a' },
  off: { label: '关闭', color: '#6f7f90' },
  open: { label: '开', color: '#3ddc97' },
  closed: { label: '关', color: '#6f7f90' },
  opening: { label: '开中', color: '#59d3c0' },
  closing: { label: '关中', color: '#59d3c0' },
  cool: { label: '制冷', color: '#59d3c0' },
  heat: { label: '制热', color: '#ffb020' },
  heat_cool: { label: '冷暖' },
  auto: { label: '自动', color: '#3ddc97' },
  dry: { label: '除湿', color: '#59d3c0' },
  fan_only: { label: '送风', color: '#59d3c0' },
  locked: { label: '已锁', color: '#ffc46a' },
  unlocked: { label: '已解锁', color: '#3ddc97' },
  locking: { label: '上锁中', color: '#ffb020' },
  unlocking: { label: '解锁中', color: '#59d3c0' },
  jammed: { label: '卡住', color: '#ff5a5f' },
  cleaning: { label: '清扫', color: '#59d3c0' },
  docked: { label: '回充', color: '#59d3c0' },
  returning: { label: '返回', color: '#59d3c0' },
  idle: { label: '空闲', color: '#a7b4c2' },
  paused: { label: '暂停', color: '#ffb020' },
  playing: { label: '播放', color: '#59d3c0' },
  error: { label: '异常', color: '#ff5a5f' },
  triggered: { label: '已触发', color: '#ff5a5f' },
  armed_away: { label: '离家', color: '#ff5a5f' },
  armed_home: { label: '居家', color: '#ffb020' },
  armed_night: { label: '夜间', color: '#e09523' },
  disarmed: { label: '撤防', color: '#3ddc97' },
  sounding: { label: '鸣响中', color: '#ff5a5f' },
  gas: { label: '燃气', color: '#ffb020' },
  detected: { label: '检测到', color: '#ff5a5f' },
  clear: { label: '正常', color: '#3ddc97' },
  home: { label: '在家', color: '#3ddc97' },
  not_home: { label: '外出', color: '#6f7f90' },
  streaming: { label: '直播中', color: '#59d3c0' },
  recording: { label: '录制中', color: '#ff5a5f' },
  charging: { label: '充电中', color: '#3ddc97' },
  unavailable: { label: '离线', color: '#475569' },
  unknown: { label: '未知', color: '#6f7f90' },
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
