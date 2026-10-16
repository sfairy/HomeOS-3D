/**
 * @file env-sensor-map-fields.internals.ts
 * @module frontend/src/views
 */
/** 环境传感器 / 快捷规则字段元数据 */

export function getEnvSensorFields() {
  return {
    temperature: {
      key: 'temperature',
      label: '温度传感器',
      labelClass: 'text-orange-400/90',
      placeholder: 'sensor.living_room_temperature',
      hint: '用于露点与霉菌风险计算，建议绑定带 <span class="text-orange-400">device_class: temperature</span> 的实体。',
      deviceClass: 'temperature',
    },
    humidity: {
      key: 'humidity',
      label: '湿度传感器',
      labelClass: 'text-cyan-400/90',
      placeholder: 'sensor.living_room_humidity',
      hint: '与温度配对后可计算露点；建议绑定 <span class="text-cyan-400">device_class: humidity</span> 实体。',
      deviceClass: 'humidity',
    },
    pm25: {
      key: 'pm25',
      label: 'PM2.5 传感器',
      labelClass: 'text-violet-400/90',
      placeholder: 'sensor.living_room_pm25',
      hint: '参与 IAQ 综合评分；实体 ID 通常含 <span class="text-violet-400">pm25</span> 或 <span class="text-violet-400">pm2_5</span>。',
      deviceClass: 'pm25',
    },
    co2: {
      key: 'co2',
      label: 'CO₂ 传感器',
      labelClass: 'text-emerald-400/90',
      placeholder: 'sensor.living_room_co2',
      hint: '参与 IAQ 综合评分；实体 ID 通常含 <span class="text-emerald-400">co2</span> 或 <span class="text-emerald-400">carbon_dioxide</span>。',
      deviceClass: 'carbon_dioxide',
    },
    tvoc: {
      key: 'tvoc',
      label: 'TVOC 传感器',
      labelClass: 'text-fuchsia-400/90',
      placeholder: 'sensor.living_room_tvoc',
      hint: '参与 IAQ 综合评分；实体 ID 通常含 <span class="text-fuchsia-400">tvoc</span>，或 device_class: volatile_organic_compounds。',
      deviceClass: 'volatile_organic_compounds',
    },
  }
}

/** 快捷规则字段定义：返回人体感应等 binary_sensor 字段的标签、占位符、提示与 domain，供「人来灯亮」等快捷规则绑定使用 */
export function getQuickRuleFields() {
  return {
    motion: {
      key: 'motion',
      label: '人体传感器',
      labelClass: 'text-amber-400/90',
      placeholder: 'binary_sensor.living_motion',
      hint: '人来灯亮触发源；建议绑定 device_class: motion / occupancy 的实体。',
      domain: 'binary_sensor',
      deviceClass: 'motion',
      shortLabel: '人体',
    },
    light: {
      key: 'light',
      label: '灯光',
      labelClass: 'text-yellow-400/90',
      placeholder: 'light.living',
      hint: '人来灯亮动作目标。',
      domain: 'light',
      shortLabel: '灯光',
    },
    climate: {
      key: 'climate',
      label: '空调',
      labelClass: 'text-sky-400/90',
      placeholder: 'climate.living',
      hint: '高温空调动作目标。',
      domain: 'climate',
      shortLabel: '空调',
    },
  }
}
