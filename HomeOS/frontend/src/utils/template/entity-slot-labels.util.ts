/**
 * 模板实体 Builder：槽位标签与类型展示文案工具。
 *
 * 职责：
 * - 维护家电类型各槽位的中文 label / hint 文案
 * - 维护家电类型 → 中文展示名（含图标前缀）映射
 * - 对外暴露获取类型选项、分组、槽位定义、自定义提示等 helper
 *
 * 依赖：./entity-slot-defs.util 的 TEMPLATE_APP_TYPES / TEMPLATE_SLOT_DEFS / APPLIANCE_TYPE_GROUPS。
 */

/**
 * 槽位文案表。键名遵循 builder.template.slot.{type}.{slotKey}.{label|hint} 规约：
 * - label 为槽位展示名，hint 为输入提示；值均为面向用户的中文文案。
 * - 被 slotText() 读取，供 getSlotDefs() 注入到槽位定义。
 */
const TEXT: Record<string, string> = {
  'builder.template.slot.air_conditioner.fan.hint': '风速档位',
  'builder.template.slot.air_conditioner.fan.label': '风速',
  'builder.template.slot.air_conditioner.mode.hint': '制冷/制热/送风/除湿',
  'builder.template.slot.air_conditioner.mode.label': '模式选择',
  'builder.template.slot.air_conditioner.pwr.hint': '空调主电源',
  'builder.template.slot.air_conditioner.pwr.label': '电源开关',
  'builder.template.slot.air_conditioner.setTemp.hint': '设定温度值',
  'builder.template.slot.air_conditioner.setTemp.label': '目标温度',
  'builder.template.slot.air_conditioner.swing.hint': '上下/左右摆风',
  'builder.template.slot.air_conditioner.swing.label': '摆风',
  'builder.template.slot.air_conditioner.temp.hint': '室内温度读数',
  'builder.template.slot.air_conditioner.temp.label': '当前温度',
  'builder.template.slot.air_purifier.fan.hint': '风速控制',
  'builder.template.slot.air_purifier.fan.label': '风机/风速',
  'builder.template.slot.air_purifier.filter.hint': '滤芯剩余比例',
  'builder.template.slot.air_purifier.filter.label': '滤芯寿命',
  'builder.template.slot.air_purifier.mode.hint': '自动/睡眠/强力',
  'builder.template.slot.air_purifier.mode.label': '模式选择',
  'builder.template.slot.air_purifier.pm25.hint': '颗粒物读数',
  'builder.template.slot.air_purifier.pm25.label': 'PM2.5 传感器',
  'builder.template.slot.air_purifier.pwr.hint': '净化器电源',
  'builder.template.slot.air_purifier.pwr.label': '电源开关',
  'builder.template.slot.ceiling_fan.direction.hint': '正转/反转',
  'builder.template.slot.ceiling_fan.direction.label': '正反转',
  'builder.template.slot.ceiling_fan.light.hint': '风扇灯(如有)',
  'builder.template.slot.ceiling_fan.light.label': '照明灯',
  'builder.template.slot.ceiling_fan.pwr.hint': '风扇主电源',
  'builder.template.slot.ceiling_fan.pwr.label': '电源开关',
  'builder.template.slot.ceiling_fan.speed.hint': '低/中/高',
  'builder.template.slot.ceiling_fan.speed.label': '风速档位',
  'builder.template.slot.ceiling_fan.speedNum.hint': '百分比调速',
  'builder.template.slot.ceiling_fan.speedNum.label': '风速百分比',
  'builder.template.slot.custom.hint': '自定义映射',
  'builder.template.slot.dehumidifier.humidity.hint': '当前湿度读数',
  'builder.template.slot.dehumidifier.humidity.label': '当前湿度',
  'builder.template.slot.dehumidifier.mode.hint': '自动/连续/静音',
  'builder.template.slot.dehumidifier.mode.label': '模式选择',
  'builder.template.slot.dehumidifier.pwr.hint': '除湿机电源',
  'builder.template.slot.dehumidifier.pwr.label': '电源开关',
  'builder.template.slot.dehumidifier.setHumidity.hint': '设定湿度值',
  'builder.template.slot.dehumidifier.setHumidity.label': '目标湿度',
  'builder.template.slot.dehumidifier.tank.hint': '水箱满检测',
  'builder.template.slot.dehumidifier.tank.label': '水箱状态',
  'builder.template.slot.dishwasher.mode.hint': '洗涤模式',
  'builder.template.slot.dishwasher.mode.label': '模式选择',
  'builder.template.slot.dishwasher.pwr.hint': '洗碗机主电源',
  'builder.template.slot.dishwasher.pwr.label': '电源开关',
  'builder.template.slot.dishwasher.remain.hint': '倒计时',
  'builder.template.slot.dishwasher.remain.label': '剩余时间',
  'builder.template.slot.dishwasher.state.hint': '当前状态',
  'builder.template.slot.dishwasher.state.label': '运行状态',
  'builder.template.slot.dryer.mode.hint': '烘干模式',
  'builder.template.slot.dryer.mode.label': '模式/程序',
  'builder.template.slot.dryer.pwr.hint': '烘干机主电源',
  'builder.template.slot.dryer.pwr.label': '电源开关',
  'builder.template.slot.dryer.remain.hint': '剩余时间读数',
  'builder.template.slot.dryer.remain.label': '剩余时间',
  'builder.template.slot.dryer.state.hint': '当前运行状态',
  'builder.template.slot.dryer.state.label': '运行状态',
  'builder.template.slot.dryer.temp.hint': '烘干温度',
  'builder.template.slot.dryer.temp.label': '温度',
  'builder.template.slot.floor_heating.mode.hint': '节能/舒适/防冻',
  'builder.template.slot.floor_heating.mode.label': '模式',
  'builder.template.slot.floor_heating.pwr.hint': '地暖主控',
  'builder.template.slot.floor_heating.pwr.label': '电源开关',
  'builder.template.slot.floor_heating.roomTemp.hint': '室内空气温度',
  'builder.template.slot.floor_heating.roomTemp.label': '室温',
  'builder.template.slot.floor_heating.setTemp.hint': '设定温度值',
  'builder.template.slot.floor_heating.setTemp.label': '目标温度',
  'builder.template.slot.floor_heating.temp.hint': '地面温度',
  'builder.template.slot.floor_heating.temp.label': '当前温度',
  'builder.template.slot.fresh_air.co2.hint': '二氧化碳读数',
  'builder.template.slot.fresh_air.co2.label': 'CO2 传感器',
  'builder.template.slot.fresh_air.fan.hint': '风速控制',
  'builder.template.slot.fresh_air.fan.label': '风机/风速',
  'builder.template.slot.fresh_air.filter.hint': '滤芯剩余比例',
  'builder.template.slot.fresh_air.filter.label': '滤芯寿命',
  'builder.template.slot.fresh_air.pm25.hint': '室内颗粒物',
  'builder.template.slot.fresh_air.pm25.label': 'PM2.5 传感器',
  'builder.template.slot.fresh_air.pwr.hint': '新风机电源',
  'builder.template.slot.fresh_air.pwr.label': '电源开关',
  'builder.template.slot.fresh_air.temp.hint': '室内温度',
  'builder.template.slot.fresh_air.temp.label': '温度',
  'builder.template.slot.microwave.mode.hint': '微波/烧烤/解冻',
  'builder.template.slot.microwave.mode.label': '模式选择',
  'builder.template.slot.microwave.pwr.hint': '微波炉电源',
  'builder.template.slot.microwave.pwr.label': '电源开关',
  'builder.template.slot.microwave.state.hint': '工作中/待机',
  'builder.template.slot.microwave.state.label': '运行状态',
  'builder.template.slot.microwave.time.hint': '烹饪时间',
  'builder.template.slot.microwave.time.label': '时间设定',
  'builder.template.slot.oven.mode.hint': '烘焙模式',
  'builder.template.slot.oven.mode.label': '模式选择',
  'builder.template.slot.oven.pwr.hint': '烤箱主电源',
  'builder.template.slot.oven.pwr.label': '电源开关',
  'builder.template.slot.oven.remain.hint': '倒计时',
  'builder.template.slot.oven.remain.label': '剩余时间',
  'builder.template.slot.oven.setTemp.hint': '设定温度传感器',
  'builder.template.slot.oven.setTemp.label': '目标温度',
  'builder.template.slot.oven.temp.hint': '炉内温度',
  'builder.template.slot.oven.temp.label': '当前温度',
  'builder.template.slot.range_hood.fan.hint': '风机控制实体',
  'builder.template.slot.range_hood.fan.label': '风机开关/调速',
  'builder.template.slot.range_hood.light.hint': '照明灯开关',
  'builder.template.slot.range_hood.light.label': '照明灯',
  'builder.template.slot.range_hood.pm25.hint': '空气质量',
  'builder.template.slot.range_hood.pm25.label': 'PM2.5/油烟传感器',
  'builder.template.slot.range_hood.pwr.hint': '吸油烟机主电源',
  'builder.template.slot.range_hood.pwr.label': '电源开关',
  'builder.template.slot.range_hood.temp.hint': '温度读数',
  'builder.template.slot.range_hood.temp.label': '温度传感器',
  'builder.template.slot.refrigerator.door.hint': '门开关检测',
  'builder.template.slot.refrigerator.door.label': '门磁传感器',
  'builder.template.slot.refrigerator.freezerTemp.hint': '冷冻室温度',
  'builder.template.slot.refrigerator.freezerTemp.label': '冷冻温度',
  'builder.template.slot.refrigerator.fridgeTemp.hint': '冷藏室温度',
  'builder.template.slot.refrigerator.fridgeTemp.label': '冷藏温度',
  'builder.template.slot.refrigerator.mode.hint': '运转模式',
  'builder.template.slot.refrigerator.mode.label': '模式选择',
  'builder.template.slot.refrigerator.pwr.hint': '冰箱主电源',
  'builder.template.slot.refrigerator.pwr.label': '电源开关',
  'builder.template.slot.rice_cooker.mode.hint': '煮饭/煮粥/煲汤/蛋糕',
  'builder.template.slot.rice_cooker.mode.label': '模式选择',
  'builder.template.slot.rice_cooker.pwr.hint': '电饭煲电源',
  'builder.template.slot.rice_cooker.pwr.label': '电源开关',
  'builder.template.slot.rice_cooker.remain.hint': '倒计时',
  'builder.template.slot.rice_cooker.remain.label': '剩余时间',
  'builder.template.slot.rice_cooker.state.hint': '烹饪/保温/待机',
  'builder.template.slot.rice_cooker.state.label': '运行状态',
  'builder.template.slot.rice_cooker.temp.hint': '当前温度',
  'builder.template.slot.rice_cooker.temp.label': '温度',
  'builder.template.slot.robot_vacuum.battery.hint': '电池电量百分比',
  'builder.template.slot.robot_vacuum.battery.label': '电量',
  'builder.template.slot.robot_vacuum.dock.hint': '回充指令',
  'builder.template.slot.robot_vacuum.dock.label': '回充/归位',
  'builder.template.slot.robot_vacuum.fan.hint': '吸力档位',
  'builder.template.slot.robot_vacuum.fan.label': '吸力/风速',
  'builder.template.slot.robot_vacuum.pwr.hint': '扫地机启动',
  'builder.template.slot.robot_vacuum.pwr.label': '电源/启动',
  'builder.template.slot.robot_vacuum.state.hint': '清扫/回充/待机',
  'builder.template.slot.robot_vacuum.state.label': '运行状态',
  'builder.template.slot.smart_curtain.battery.hint': '电池电量(无线款)',
  'builder.template.slot.smart_curtain.battery.label': '电量',
  'builder.template.slot.smart_curtain.motor.hint': '开/关/停',
  'builder.template.slot.smart_curtain.motor.label': '电机控制',
  'builder.template.slot.smart_curtain.position.hint': '开合位置',
  'builder.template.slot.smart_curtain.position.label': '位置百分比',
  'builder.template.slot.smart_curtain.pwr.hint': '窗帘电机开关',
  'builder.template.slot.smart_curtain.pwr.label': '开关',
  'builder.template.slot.smart_lock.battery.hint': '电池电量',
  'builder.template.slot.smart_lock.battery.label': '电量',
  'builder.template.slot.smart_lock.door.hint': '门开/关检测',
  'builder.template.slot.smart_lock.door.label': '门磁',
  'builder.template.slot.smart_lock.pwr.hint': '锁定/解锁状态',
  'builder.template.slot.smart_lock.pwr.label': '锁状态',
  'builder.template.slot.smart_lock.unlockMethod.hint': '指纹/密码/钥匙',
  'builder.template.slot.smart_lock.unlockMethod.label': '开锁方式',
  'builder.template.slot.smart_plug.childLock.hint': '物理按键锁定',
  'builder.template.slot.smart_plug.childLock.label': '童锁',
  'builder.template.slot.smart_plug.current.hint': '电流读数',
  'builder.template.slot.smart_plug.current.label': '电流',
  'builder.template.slot.smart_plug.energy.hint': '累计电量',
  'builder.template.slot.smart_plug.energy.label': '用电量',
  'builder.template.slot.smart_plug.power.hint': '当前功率读数',
  'builder.template.slot.smart_plug.power.label': '功率',
  'builder.template.slot.smart_plug.pwr.hint': '插座总开关',
  'builder.template.slot.smart_plug.pwr.label': '主开关',
  'builder.template.slot.smart_plug.voltage.hint': '电压读数',
  'builder.template.slot.smart_plug.voltage.label': '电压',
  'builder.template.slot.tv.app.hint': 'Netflix/YouTube等',
  'builder.template.slot.tv.app.label': '应用启动',
  'builder.template.slot.tv.pwr.hint': '电视电源',
  'builder.template.slot.tv.pwr.label': '电源开关',
  'builder.template.slot.tv.source.hint': 'HDMI1/HDMI2/AV',
  'builder.template.slot.tv.source.label': '输入源',
  'builder.template.slot.tv.volume.hint': '音量控制',
  'builder.template.slot.tv.volume.label': '音量',
  'builder.template.slot.washing_machine.mode.hint': '洗衣模式',
  'builder.template.slot.washing_machine.mode.label': '模式/程序选择',
  'builder.template.slot.washing_machine.pwr.hint': '洗衣机主电源',
  'builder.template.slot.washing_machine.pwr.label': '电源开关',
  'builder.template.slot.washing_machine.remain.hint': '剩余时间读数',
  'builder.template.slot.washing_machine.remain.label': '剩余时间',
  'builder.template.slot.washing_machine.speed.hint': '脱水转速',
  'builder.template.slot.washing_machine.speed.label': '转速',
  'builder.template.slot.washing_machine.state.hint': '当前运行状态',
  'builder.template.slot.washing_machine.state.label': '运行状态',
  'builder.template.slot.washing_machine.temp.hint': '水温传感器',
  'builder.template.slot.washing_machine.temp.label': '水温',
  'builder.template.slot.water_dispenser.childLock.hint': '童锁开关',
  'builder.template.slot.water_dispenser.childLock.label': '童锁',
  'builder.template.slot.water_dispenser.pwr.hint': '管线机电源',
  'builder.template.slot.water_dispenser.pwr.label': '电源开关',
  'builder.template.slot.water_dispenser.setTemp.hint': '目标出水温度',
  'builder.template.slot.water_dispenser.setTemp.label': '设定温度',
  'builder.template.slot.water_dispenser.tds.hint': 'TDS 读数',
  'builder.template.slot.water_dispenser.tds.label': 'TDS 水质',
  'builder.template.slot.water_dispenser.temp.hint': '当前水温',
  'builder.template.slot.water_dispenser.temp.label': '出水温度',
  'builder.template.slot.water_purifier.filter.hint': '滤芯剩余比例',
  'builder.template.slot.water_purifier.filter.label': '滤芯寿命',
  'builder.template.slot.water_purifier.pwr.hint': '净水机电源',
  'builder.template.slot.water_purifier.pwr.label': '电源开关',
  'builder.template.slot.water_purifier.status.hint': '制水/冲洗/待机',
  'builder.template.slot.water_purifier.status.label': '运行状态',
  'builder.template.slot.water_purifier.tds.hint': 'TDS 读数',
  'builder.template.slot.water_purifier.tds.label': 'TDS 水质',
  'builder.template.slot.water_purifier.temp.hint': '水温读数',
  'builder.template.slot.water_purifier.temp.label': '水温',
}
/**
 * 按文案键取中文文案，未命中时返回空串。
 * @param key 形如 builder.template.slot.{type}.{slotKey}.{label|hint} 的键
 * @returns 对应中文文案或空串
 */
function slotText(key: string) {
  return TEXT[key] ?? ''
}

/**
 * 家电类型 ID → 含图标前缀的中文展示名映射。
 * 用于下拉选项与卡片标题本地化；未被覆盖的类型回退到 slot-defs 中的 label。
 */
const APP_LABELS: Record<string, string> = {
  air_conditioner: '❄ 空调',
  air_purifier: '🌬 空气净化器',
  ceiling_fan: '🪭 电风扇/吊扇',
  dehumidifier: '💨 除湿机',
  dishwasher: '🍽 洗碗机',
  dryer: '👖 烘干机',
  floor_heating: '🔥 地暖',
  fresh_air: '🌿 新风机',
  microwave: '📡 微波炉',
  oven: '🍳 烤箱/蒸烤箱',
  range_hood: '🔥 吸油烟机',
  refrigerator: '🧊 冰箱',
  rice_cooker: '🍚 电饭煲',
  robot_vacuum: '🧹 扫地机器人',
  smart_curtain: '🪟 电动窗帘',
  smart_lock: '🔐 智能门锁',
  smart_plug: '🔌 智能插座/排插',
  water_heater: '♨ 热水器/壁挂炉',
  humidifier_ha: '💧 加湿器(HA)',
  trigger_sensor: '⚡ 触发式模板传感器',
  tv: '📺 电视',
  washing_machine: '👕 洗衣机',
  water_dispenser: '🚰 管线机/饮水机',
  water_purifier: '💧 净水机',
  yaml_import: '📄 YAML 导入（HA 配置）',
}

import {
  TEMPLATE_APP_TYPES,
  TEMPLATE_SLOT_DEFS,
  APPLIANCE_TYPE_GROUPS,
  type TemplateAppTypeOption,
} from './entity-slot-defs.util'

/**
 * 获取全部家电类型下拉选项，应用 APP_LABELS 本地化 label/shortLabel，并把展示名并入检索关键词。
 * @returns 本地化后的选项数组
 */
export function getAppTypeOptions(): TemplateAppTypeOption[] {
  return TEMPLATE_APP_TYPES.map(
    ({ value, label, shortLabel, deployMode, kind, platform, description, keywords }) => {
      const localized = APP_LABELS[value]
      const display = localized ?? label
      return {
        value,
        label: display,
        shortLabel: localized ? localized.replace(/^[^\s]+\s/, '') : shortLabel,
        deployMode,
        kind,
        platform,
        description,
        keywords: `${keywords} ${display}`.toLowerCase(),
      }
    },
  )
}

/** 模板实体类型 → 展示标签 */
export function templateEntityTypeLabel(type?: string | null): string {
  const key = String(type || '').trim()
  if (!key) return '模板'
  if (APP_LABELS[key]) return APP_LABELS[key]
  const opt = TEMPLATE_APP_TYPES.find((row) => row.value === key)
  if (opt?.label) return APP_LABELS[key] ?? opt.label
  return key.replace(/_/g, ' ')
}

/**
 * 按 APPLIANCE_TYPE_GROUPS 把类型选项分组（用于下拉 optgroup）。
 * 仅返回至少含一个选项的分组。
 * @returns 分组数组，每项含 id/label/options
 */
export function getAppTypeOptionGroups(): Array<{
  id: string
  label: string
  options: TemplateAppTypeOption[]
}> {
  const map = new Map(getAppTypeOptions().map((o) => [o.value, o]))
  return APPLIANCE_TYPE_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    options: g.typeIds.map((id) => map.get(id)).filter(Boolean) as TemplateAppTypeOption[],
  })).filter((g) => g.options.length)
}

export type { TemplateAppTypeOption }

/**
 * 读取指定家电类型的槽位定义，并用 TEXT 表覆盖 label/hint 文案。
 *
 * @param type 家电类型 ID
 * @returns 槽位定义数组（label/hint 已本地化）
 */
export function getSlotDefs(type: string) {
  const defs = (TEMPLATE_SLOT_DEFS as Record<string, unknown>)[type]
  const list = Array.isArray(defs) ? defs : []
  return list.map((d: { key: string; label?: string; hint?: string; domain?: string; icon?: string }) => ({
    ...d,
    label: slotText(`builder.template.slot.${type}.${d.key}.label`) || d.label,
    hint: slotText(`builder.template.slot.${type}.${d.key}.hint`) || d.hint,
  }))
}

/** 自定义槽位的输入提示文案 */
export function customSlotHint() {
  return '自定义映射'
}
