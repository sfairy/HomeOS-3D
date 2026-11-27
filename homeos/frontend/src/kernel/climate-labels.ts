/**
 * 气候 / 热水器 / 浴霸的展示标签（叶子常量，无任何 import）。
 *
 * 为什么集中在这里
 * ----------------
 * 这套表原本长在 `studio/app/shared/device/climate.ts`（那个文件同时包含能力归一、温度
 * 回填、命令构造与图标选择），而 `shared/constants/climate-labels.ts` 又有一份
 * `HVAC_MODE_LABELS` 与它部分重叠。同一个模式名在两处出现两个值，就等于「下拉里写制冷、
 * 弹窗里写冷气」这类不一致有了生长空间。
 *
 * 现在：
 * - 通用空调模式以 `HVAC_MODE_LABELS` 为底（与控件下拉一致），`CLIMATE_MODE_LABELS` 只补它
 *   没有的键；
 * - 浴霸 / 热水器是**另一套语义**（同一个 `heat` 在浴霸上是「取暖」、在热水器上是「加热」），
 *   必须各自独立成表，不能合并；
 * - 摆风与位置的文案只服务渲染层，一并放这里，避免它们在设备逻辑文件里继续膨胀。
 *
 * 判据（是否要做业务判断）不要读这些文案：文案是展示层，模式判定走 `normalizeClimateModeKey`
 * 与能力位。
 */

/** 通用空调 hvac 模式（与控件下拉、属性格式化共用）。 */
export const HVAC_MODE_LABELS: Record<string, string> = {
  auto: '自动',
  cool: '制冷',
  dry: '除湿',
  fan_only: '送风',
  heat: '制热',
  off: '关闭',
}

/** 风速档位。 */
export const FAN_MODE_LABELS: Record<string, string> = {
  auto: '自动',
  high: '高风',
  low: '低风',
  medium: '中风',
}

/** 预设模式。 */
export const PRESET_MODE_LABELS: Record<string, string> = {
  activity: '活动',
  anti_freeze: '防冻',
  away: '离家',
  boost: '强力',
  comfort: '舒适',
  eco: '节能',
  home: '在家',
  none: '无',
  sleep: '睡眠',
}

/**
 * 空调面板 / 弹窗上的模式文案：`HVAC_MODE_LABELS` 的超集。
 *
 * 多出来的键是 HA 集成常见但不在标准 hvac 列表里的取值（`fan` / `heat_cool` / 预设）以及
 * 离线态占位。以底表展开而不是重抄一遍，保证「同一个模式在两处永远同一个词」。
 */
export const CLIMATE_MODE_LABELS: Record<string, string> = {
  ...HVAC_MODE_LABELS,
  fan: '送风',
  heat_cool: '冷暖自动',
  unavailable: '不可用',
  unknown: '未知',
  idle: '待机',
  none: '无',
  eco: '节能',
  boost: '强劲',
  performance: '强劲',
  silent: '静音',
  sleep: '睡眠',
  comfort: '舒适',
  away: '离家',
  mold_prev: '防霉',
  eco_and_mold_prev: '节能＋防霉',
  eco_mold_prev: '节能＋防霉',
}

/**
 * 浴霸模式文案。
 *
 * 浴霸的 `heat` 是「取暖」而不是「制热」，`fan_only` 是「吹风」而不是「送风」——
 * 与空调同键不同义，**不能**复用 `HVAC_MODE_LABELS`。中文键是各家集成直接下发的模式名。
 */
export const BATH_HEATER_MODE_LABELS: Record<string, string> = {
  off: '关闭',
  heat: '取暖',
  heating: '取暖',
  fan_only: '吹风',
  fan: '吹风',
  ventilation: '换气',
  ventilate: '换气',
  vent: '换气',
  exhaust: '换气',
  air_exchange: '换气',
  defog: '除雾',
  defogging: '除雾',
  demist: '除雾',
  anti_fog: '除雾',
  quick_heat: '快速取暖',
  rapid_heat: '快速取暖',
  fast_heat: '快速取暖',
  quick_defog: '快速除雾',
  rapid_defog: '快速除雾',
  fast_defog: '快速除雾',
  dry: '干燥',
  drying: '干燥',
  auto: '自动',
  unavailable: '不可用',
  unknown: '未知',
  idle: '待机',
  standby: '待机',
  none: '无',
  eco: '节能',
  boost: '强劲',
  performance: '强劲',
  silent: '静音',
  sleep: '睡眠',
  mold_prev: '防霉',
  eco_and_mold_prev: '节能＋防霉',
  eco_mold_prev: '节能＋防霉',
  制热: '取暖',
  暖风: '取暖',
  取暖: '取暖',
  吹风: '吹风',
  换气: '换气',
  除雾: '除雾',
  干燥: '干燥',
  待机: '待机',
}

/** 热水器模式文案（HA `water_heater` 域的 operation 取值）。 */
export const WATER_HEATER_MODE_LABELS: Record<string, string> = {
  off: '关闭',
  normal: '普通',
  standard: '普通',
  eco: '节能',
  adaptive: '自适温',
  auto: '自适温',
  heat_pump: '热泵',
  electric: '电加热',
  gas: '燃气',
  performance: '强力',
  vacation: '假期',
  普通: '普通',
  自适温: '自适温',
  节能: '节能',
  加热: '加热',
  保温: '保温',
}

/** 上下摆风档位。 */
export const VERTICAL_SWING_LABELS: Record<string, string> = {
  off: '关闭',
  auto: '自动',
  default: '默认',
  full_swing: '全范围摆动',
  vertical: '上下摆动',
  horizontal: '左右摆动',
  both: '上下左右',
  fixed_upper: '固定上方',
  fixed_upper_middle: '固定中上',
  fixed_middle: '固定中间',
  fixed_lower_middle: '固定中下',
  fixed_lower: '固定下方',
  swing_upper: '上方摆动',
  swing_upper_middle: '中上摆动',
  swing_middle: '中间摆动',
  swing_lower_middle: '中下摆动',
  swing_lower: '下方摆动',
}

/** 左右摆风档位。 */
export const HORIZONTAL_SWING_LABELS: Record<string, string> = {
  off: '关闭',
  auto: '自动',
  default: '默认',
  full_swing: '全范围摆动',
  left: '固定左侧',
  left_center: '固定中左',
  center: '固定居中',
  right_center: '固定中右',
  right: '固定右侧',
}

/**
 * 横向摆风位置的文案（组合档位用，如 `horizontal_leftmost_and_vertical_swing`）。
 *
 * 与 `HORIZONTAL_SWING_LABELS` 分开：这里是**位置**（固定最左），那边是**摆风动作**（固定左侧），
 * 合成显示时会拼上「＋上下摆动」。
 */
export const HORIZONTAL_POSITION_LABELS: Record<string, string> = {
  horizontal_leftmost: '固定最左',
  horizontal_middle_left: '固定左中',
  horizontal_middle_right: '固定右中',
  horizontal_rightmost: '固定最右',
}
