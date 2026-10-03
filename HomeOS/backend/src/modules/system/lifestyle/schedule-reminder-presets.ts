/**
 * 循环日程提醒预设包
 *
 * 模块：system/lifestyle
 * 职责：
 *  - 定义可一键应用的预设包（垃圾分类 / 家务清洁 / 设备维护）
 *  - 提供 formatSchedulePresetItemLabel 把频率 + 日期格式化为可读文案
 *  - 提供 findSchedulePreset 按 ID 查找预设
 *
 * 被 ScheduleReminderService 调用，用于初始化默认提醒与 UI 预设展示。
 */

/**
 * 单条预设条目
 */
type SchedulePresetItem = {
  /** 类型分组（recycle / cleaning / maintenance 等，用于图标与统计） */
  type: string;
  /** 显示名称（如 "可回收垃圾"） */
  label: string;
  /** emoji 图标 */
  icon: string;
  /** 频率：weekly 每周 / biweekly 每双周 / monthly 每月 / daily 每天 / custom 自定义 */
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'daily' | 'custom';
  /** 周几（0=周日, 1=周一, ..., 6=周六），仅 weekly / biweekly 使用 */
  dayOfWeek: number;
  /** 每月的日期列表（1~31），仅 monthly 使用 */
  customDays: number[];
  /** 提醒时间 HH:MM（默认 07:00） */
  time?: string;
  /** UI 显示颜色（hex） */
  color: string;
};

/**
 * 预设包
 */
type SchedulePreset = {
  /** 预设 ID（如 waste-sorting） */
  id: string;
  /** 预设名称 */
  name: string;
  /** 预设说明 */
  description: string;
  /** 条目列表 */
  items: SchedulePresetItem[];
};

/** 周几中文标签（0=周日 ... 6=周六），用于 formatSchedulePresetItemLabel 拼接 */
const DOW_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 将预设条目格式化为可读周期文案（供 API / 设置页展示）。
 *
 * @param item 预设条目（仅取 frequency / dayOfWeek / customDays）
 * @returns 如 "每周三" / "每双周五" / "每月 1、15 号" / "每天"
 */
export function formatSchedulePresetItemLabel(
  item: Pick<SchedulePresetItem, 'frequency' | 'dayOfWeek' | 'customDays'>,
): string {
  switch (item.frequency) {
    case 'daily':
      return '每天';
    case 'weekly':
      return `每周${DOW_LABELS[item.dayOfWeek] ?? ''}`;
    case 'biweekly':
      return `每双周${DOW_LABELS[item.dayOfWeek] ?? ''}`;
    case 'monthly': {
      // 每月模式：把 customDays 排序后拼接（如 "每月 1、15 号"）
      const days = [...item.customDays].filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b);
      if (!days.length) return '每月';
      if (days.length === 1) return `每月 ${days[0]} 号`;
      return `每月 ${days.join('、')} 号`;
    }
    default:
      return item.frequency;
  }
}
/**
 * 循环日程提醒预设包（共 3 套）
 *  1. waste-sorting     垃圾分类（按上海等城市常见四分类投放节奏）
 *  2. household-cleaning 家务清洁（日常保洁 + 周期性深度清洁）
 *  3. device-maintenance 设备维护（家电滤芯 / 滤网 / 耗材保养）
 */
export const SCHEDULE_REMINDER_PRESETS: SchedulePreset[] = [
  {
    id: 'waste-sorting',
    name: '垃圾分类',
    description: '按上海等城市常见四分类投放节奏配置，可按小区规定微调星期',
    items: [
      {
        type: 'recycle',
        label: '可回收垃圾',
        icon: '♻️',
        frequency: 'weekly', // 每周二
        dayOfWeek: 2,
        customDays: [],
        color: '#3b82f6',
      },
      {
        type: 'recycle',
        label: '厨余垃圾',
        icon: '🍂',
        frequency: 'daily', // 每天
        dayOfWeek: 0,
        customDays: [],
        color: '#22c55e',
      },
      {
        type: 'recycle',
        label: '有害垃圾',
        icon: '☣️',
        frequency: 'monthly', // 每月 15 号
        dayOfWeek: 0,
        customDays: [15],
        color: '#ef4444',
      },
      {
        type: 'recycle',
        label: '其他垃圾（周一）',
        icon: '🗑️',
        frequency: 'weekly', // 每周一
        dayOfWeek: 1,
        customDays: [],
        color: '#6b7280',
      },
      {
        type: 'recycle',
        label: '其他垃圾（周四）',
        icon: '🗑️',
        frequency: 'weekly', // 每周四
        dayOfWeek: 4,
        customDays: [],
        color: '#94a3b8',
      },
    ],
  },
  {
    id: 'household-cleaning',
    name: '家务清洁',
    description: '日常保洁与周期性深度清洁，覆盖卧室、厨房与公共区域',
    items: [
      {
        type: 'cleaning',
        label: '周末大扫除',
        icon: '🧹',
        frequency: 'weekly', // 每周六
        dayOfWeek: 6,
        customDays: [],
        color: '#a78bfa',
      },
      {
        type: 'cleaning',
        label: '更换床品',
        icon: '🛏️',
        frequency: 'biweekly', // 每双周日
        dayOfWeek: 0,
        customDays: [],
        color: '#c4b5fd',
      },
      {
        type: 'cleaning',
        label: '厨房油污清洁',
        icon: '🍳',
        frequency: 'weekly', // 每周三
        dayOfWeek: 3,
        customDays: [],
        color: '#fbbf24',
      },
      {
        type: 'cleaning',
        label: '卫生间除垢',
        icon: '🚿',
        frequency: 'weekly', // 每周五
        dayOfWeek: 5,
        customDays: [],
        color: '#22d3ee',
      },
      {
        type: 'cleaning',
        label: '阳台/窗户清理',
        icon: '🪟',
        frequency: 'monthly', // 每月 1 号
        dayOfWeek: 0,
        customDays: [1],
        color: '#34d399',
      },
    ],
  },
  {
    id: 'device-maintenance',
    name: '设备维护',
    description: '家电滤芯、滤网与耗材保养，降低故障率与耗材过期风险',
    items: [
      {
        type: 'maintenance',
        label: '净水器滤芯',
        icon: '💧',
        frequency: 'monthly', // 每月 1 号
        dayOfWeek: 0,
        customDays: [1],
        color: '#38bdf8',
      },
      {
        type: 'maintenance',
        label: '空调滤网清洁',
        icon: '❄️',
        frequency: 'monthly', // 每月 15 号
        dayOfWeek: 0,
        customDays: [15],
        color: '#60a5fa',
      },
      {
        type: 'maintenance',
        label: '扫地机器人维护',
        icon: '🤖',
        frequency: 'weekly', // 每周日
        dayOfWeek: 0,
        customDays: [],
        color: '#a78bfa',
      },
      {
        type: 'maintenance',
        label: '洗衣机筒清洁',
        icon: '🧺',
        frequency: 'monthly', // 每月 1 号
        dayOfWeek: 0,
        customDays: [1],
        color: '#f59e0b',
      },
      {
        type: 'maintenance',
        label: '新风/净化器滤网',
        icon: '🌬️',
        frequency: 'biweekly', // 每双周六
        dayOfWeek: 6,
        customDays: [],
        color: '#2dd4bf',
      },
      {
        type: 'maintenance',
        label: '烟雾报警器自检',
        icon: '🔔',
        frequency: 'monthly', // 每月 1 号
        dayOfWeek: 0,
        customDays: [1],
        color: '#fb7185',
      },
    ],
  },
];

/**
 * 按 ID 查找预设包。
 *
 * @param presetId 预设 ID
 * @returns 命中则返回预设，否则 undefined
 */
export function findSchedulePreset(presetId: string): SchedulePreset | undefined {
  return SCHEDULE_REMINDER_PRESETS.find((p) => p.id === presetId);
}