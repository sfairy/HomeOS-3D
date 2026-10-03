/**
 * 户型图热点部件类型 → 显示标签
 *
 * 职责：
 * - 维护户型图热点可挂载的部件类型（Widget Type）到中文显示名的映射。
 * - 供户型图编辑器部件选择器、部件列表、设置页等共用。
 *
 * 依赖：无外部依赖，纯静态映射。
 *
 * 注意：
 * - 对象 key 为部件类型标识符（widget type key），与代码中的组件名对齐，不翻译。
 * - 仅 value（面向用户的显示文案）使用简体中文。
 */
const WIDGET_TYPE_LABELS: Record<string, string> = {
  AirPurifierWidget: '空气净化器',
  AlarmWidget: '安防面板',
  BadgeWidget: '徽章 / 传感器',
  CameraWidget: '摄像头',
  ClimateWidget: '空调',
  CoSensorWidget: '一氧化碳传感器',
  CoverWidget: '窗帘 / 卷帘',
  DispenserWidget: '管线机',
  EnvironmentSensorWidget: '环境传感器',
  FanWidget: '风扇',
  FridgeWidget: '冰箱',
  FreshAirWidget: '全热交换器',
  GasSensorWidget: '燃气传感器',
  GasStoveWidget: '燃气灶',
  HumidifierWidget: '加湿器',
  LeakSensorWidget: '浸水传感器',
  LockWidget: '门锁',
  MediaWidget: '多媒体',
  MotionSensorWidget: '人体传感器',
  RangeHoodWidget: '吸油烟机',
  RemoteWidget: '遥控器',
  SceneWidget: '场景 / 脚本',
  SirenWidget: '警报器',
  SmokeSensorWidget: '烟雾传感器',
  ToggleWidget: '开关 / 灯光',
  VacuumWidget: '扫地机器人',
  ValveWidget: '水阀 / 气阀',
  WashingMachineWidget: '洗衣机',
  WaterHeaterWidget: '燃气热水器',
  WaterPurifierWidget: '净水机',
}

/**
 * 根据部件类型 key 解析中文显示名。
 *
 * @param type - 部件类型标识符（如 `AlarmWidget`、`ClimateWidget`）。
 * @returns 面向用户的中文显示名；若未在映射表中且 `type` 非空，则回退为原始 key。
 *          当 `type` 为空字符串或 `null` / `undefined` 时返回空字符串。
 */
export function widgetTypeLabel(type: string | null | undefined): string {
  if (!type) return ''
  return WIDGET_TYPE_LABELS[type] ?? type
}
