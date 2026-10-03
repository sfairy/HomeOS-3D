/**
 * 模板实体 Builder：设备类型与槽位定义工具。
 *
 * 职责：
 * - 提供家电类型下拉选项（含图标、分组、关键词检索）
 * - 维护家电类型 → 槽位定义（slots）映射
 *
 * 依赖：@homeos/shared 的 APPLIANCE_TYPES。
 */

import { APPLIANCE_TYPES } from '@homeos/shared'

/** 特殊模板类型下拉选项（非家电聚合类） */
const SPECIAL_TYPE_OPTIONS = [
  { value: 'trigger_sensor', label: '⚡ 触发式模板传感器' },
  { value: 'yaml_import', label: '📄 YAML 导入（HA 配置）' },
] as const

/**
 * 家电类型 ID → 展示图标 emoji 映射。
 * 下拉/卡片中作为类型图标；存在同名 emoji 重复项时以中文注释区分。
 */
const APPLIANCE_ICONS: Record<string, string> = {
  range_hood: '🔥', // 吸油烟机
  washing_machine: '👕', // 洗衣机
  dryer: '👖', // 烘干机
  refrigerator: '🧊', // 冰箱
  oven: '🍳', // 烤箱/蒸烤箱
  dishwasher: '🍽', // 洗碗机
  water_purifier: '💧', // 净水机
  water_dispenser: '🚰', // 管线机/饮水机
  air_purifier: '🌬', // 空气净化器
  air_conditioner: '❄', // 空调
  robot_vacuum: '🧹', // 扫地机器人
  dehumidifier: '💨', // 除湿机
  ceiling_fan: '🪭', // 电风扇/吊扇
  smart_curtain: '🪟', // 电动窗帘
  smart_lock: '🔐', // 智能门锁
  tv: '📺', // 电视
  microwave: '📡', // 微波炉
  rice_cooker: '🍚', // 电饭煲
  fresh_air: '🌿', // 新风机
  floor_heating: '🔥', // 地暖（与吸油烟机同图标，按类型区分）
  smart_plug: '🔌', // 智能插座/排插
  water_heater: '♨', // 热水器/壁挂炉
  humidifier_ha: '💧', // 加湿器(HA)（与净水机同图标，按类型区分）
}

/** 家电类型分组（下拉 optgroup） */
export const APPLIANCE_TYPE_GROUPS: Array<{ id: string; label: string; typeIds: string[] }> = [
  {
    id: 'kitchen',
    label: '厨房 / 餐饮',
    typeIds: [
      'range_hood',
      'oven',
      'microwave',
      'rice_cooker',
      'dishwasher',
      'water_purifier',
      'water_dispenser',
    ],
  },
  {
    id: 'climate',
    label: '空调 / 新风 / 采暖 / 热水',
    typeIds: [
      'air_conditioner',
      'floor_heating',
      'air_purifier',
      'fresh_air',
      'ceiling_fan',
      'water_heater',
      'humidifier_ha',
      'dehumidifier',
    ],
  },
  {
    id: 'laundry',
    label: '洗护',
    typeIds: ['washing_machine', 'dryer'],
  },
  {
    id: 'smart',
    label: '影音 / 机器人 / 门窗',
    typeIds: ['tv', 'robot_vacuum', 'smart_curtain', 'smart_lock', 'smart_plug'],
  },
  {
    id: 'cold',
    label: '冷链 / 储存',
    typeIds: ['refrigerator'],
  },
  {
    id: 'advanced',
    label: '高级模式',
    typeIds: ['trigger_sensor', 'yaml_import'],
  },
]

/**
 * 家电类型下拉选项结构。
 * label 含图标前缀，shortLabel 为去图标后的短名，keywords 供模糊检索。
 */
export interface TemplateAppTypeOption {
  value: string
  label: string
  shortLabel: string
  deployMode?: string
  kind?: string
  platform?: string
  description?: string
  keywords: string
}

/**
 * 将 @homeos/shared 的家电类型定义转换为下拉选项（含图标前缀与检索关键词）。
 *
 * @param t 家电类型定义
 * @returns 含 label/shortLabel/keywords 等字段的选项对象
 */
function buildTypeOption(t: (typeof APPLIANCE_TYPES)[number]): TemplateAppTypeOption {
  const icon = APPLIANCE_ICONS[t.id] || '📦'
  return {
    value: t.id,
    label: `${icon} ${t.label}`,
    shortLabel: t.label,
    deployMode: t.deployMode,
    kind: t.kind,
    platform: t.platform,
    description: t.description,
    keywords: `${t.id} ${t.label} ${t.platform} ${t.kind}`.toLowerCase(),
  }
}

/** 模板实体 Builder：设备类型与槽位定义（来自 @homeos/shared 目录） */
export const TEMPLATE_APP_TYPES: TemplateAppTypeOption[] = [
  ...APPLIANCE_TYPES.map(buildTypeOption),
  ...SPECIAL_TYPE_OPTIONS.map((t) => ({
    value: t.value,
    label: t.label,
    shortLabel: t.label.replace(/^[^\s]+\s/, ''),
    keywords: `${t.value} ${t.label}`.toLowerCase(),
  })),
]

/**
 * 家电类型 ID → 槽位定义数组映射。
 * 由 @homeos/shared 的 APPLIANCE_TYPES 动态构建；键为家电类型 id，值为该类型可用的 slot 列表。
 * UI Builder 据此渲染槽位表单并校验必填项。
 */
export const TEMPLATE_SLOT_DEFS = Object.fromEntries(
  APPLIANCE_TYPES.map((t) => [t.id, t.slots]),
) as Record<string, (typeof APPLIANCE_TYPES)[number]['slots']>

/** 家电/特殊类型展示图标（画布节点等） */
export function templateTypeIcon(typeId: string | null | undefined): string {
  const id = String(typeId || '').trim()
  if (!id) return '🧩'
  if (id === 'trigger_sensor') return '⚡'
  if (id === 'yaml_import') return '📄'
  return APPLIANCE_ICONS[id] || '📦'
}
