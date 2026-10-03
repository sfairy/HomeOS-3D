/** 场景模板 ID（仅本文件内用于约束预设清单，无需对外导出） */
type AlertRulePresetId = 'doorbell' | 'wind' | 'door_window' | 'leak' | 'battery';

/** 单条告警规则场景模板：与 AlertRule 字段一一对应，供编辑弹窗直接套用 */
export interface AlertRulePreset {
  /** 模板唯一 ID */
  id: AlertRulePresetId;
  /** 模板展示名称（弹窗 chip 文案） */
  label: string;
  /** 模板用途说明 */
  description: string;
  /** 规则名称 */
  name: string;
  /** 示例触发实体 ID */
  entityId: string;
  /** 触发条件表达式（后端 evaluateCondition 语法） */
  condition: string;
  /** 告警级别，统一沿用现有三档 */
  level: 'info' | 'warn' | 'danger';
  /** 防抖冷却（分钟）：分钟级用于高频传感器，小时级以 60 的倍数表达 */
  cooldownMinutes: number;
  /** 通知标题模板 */
  title: string;
  /** 通知正文模板，支持 {{state}} / {{val}} / {{name}} / {{unit}} */
  messageTemplate: string;
}

/**
 * 内置场景模板列表（顺序即弹窗展示顺序）。
 *
 * 冷却周期设计：
 * - 门铃访客：0（事件型，不做抑制，确保每次按下都通知）
 * - 门窗安防：5 分钟（防止门窗反复开合刷屏）
 * - 水浸/烟雾：10 分钟
 * - 大风预警：30 分钟
 * - 设备低电量：720 分钟（12 小时，小时级冷却示例）
 */
export const ALERT_RULE_PRESETS: AlertRulePreset[] = [
  {
    id: 'doorbell',
    label: '门铃访客',
    description: '有人按门铃时立即通知，可联动摄像头查看实时画面',
    name: '门铃按下通知',
    entityId: 'binary_sensor.doorbell',
    condition: 'on',
    level: 'info',
    cooldownMinutes: 0,
    title: '访客来访',
    messageTemplate: '有人按下了门铃，请注意查看。',
  },
  {
    id: 'wind',
    label: '大风预警',
    description: '风速超过阈值时提醒关窗收物，数值型传感器条件',
    name: '户外大风预警',
    entityId: 'sensor.outdoor_wind_speed',
    condition: '> 12',
    level: 'warn',
    cooldownMinutes: 30,
    title: '户外大风预警',
    messageTemplate: '当前风速已达 {{state}} {{unit}}，请关好门窗并收回户外物品。',
  },
  {
    id: 'door_window',
    label: '门窗安防',
    description: '门窗磁被打开时提醒确认安全',
    name: '大门开启提醒',
    entityId: 'binary_sensor.front_door_contact',
    condition: 'on',
    level: 'warn',
    cooldownMinutes: 5,
    title: '门窗开启提醒',
    messageTemplate: '{{name}} 已被打开，请确认安全。',
  },
  {
    id: 'leak',
    label: '水浸/烟雾',
    description: '水浸或烟雾传感器触发时紧急告警',
    name: '水浸异常报警',
    entityId: 'binary_sensor.water_leak_sensor',
    condition: 'on',
    level: 'danger',
    cooldownMinutes: 10,
    title: '紧急水浸告警',
    messageTemplate: '检测到 {{name}} 发生异常浸水，请立即检查处理。',
  },
  {
    id: 'battery',
    label: '设备低电量',
    description: '电量低于阈值时提醒充电或换电池，小时级冷却',
    name: '智能门锁低电量',
    entityId: 'sensor.door_lock_battery',
    condition: '< 20',
    level: 'warn',
    cooldownMinutes: 720,
    title: '设备低电量提醒',
    messageTemplate: '{{name}} 当前剩余电量仅 {{val}} {{unit}}，请及时充电或更换电池。',
  },
]

/** 通知模板可用变量（点击插入到模板输入框） */
export const ALERT_TEMPLATE_VARIABLES: { key: string; hint: string }[] = [
  { key: '{{state}}', hint: '当前状态值' },
  { key: '{{val}}', hint: '数值型当前值' },
  { key: '{{name}}', hint: '设备名称' },
  { key: '{{unit}}', hint: '单位' },
]
