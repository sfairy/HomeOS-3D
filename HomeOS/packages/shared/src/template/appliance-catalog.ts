/**
 * @file appliance-catalog.ts
 * @module @homeos/shared/template
 * @brief 家电模板目录（前后端单一真相源）。
 *
 * 职责：
 *  - 维护家电类型定义表（APPLIANCE_TYPES）：含 id / 平台 / 部署模式 / 槽位 / 必填槽位组；
 *  - 提供按 id 查询类型定义（getApplianceType）、内置槽位（getBuiltinSlots）、
 *    必填槽位组（getRequiredSlotGroups）；
 *  - 暴露类型 id 集合（APPLIANCE_TYPE_IDS）与 special 类型集合（trigger_sensor / yaml_import）。
 *
 * 关键依赖：
 *  - appliance-yaml-gen.ts 按本目录生成家电 template YAML；
 *  - appliance-type-infer.ts 按本目录反向推断家电类型；
 *  - entity-validate.ts 复用 getRequiredSlotGroups 做槽位完整性校验。
 *
 * 约定：
 *  - deployMode：helper（helper 模板）/ config_yaml（需 configuration.yaml）/ either（均可）；
 *  - kind：composite（聚合控制）/ display（仅展示）/ control（控制）；
 *  - requiredSlotGroups 为"或"关系（任一组满足即可），组内为"且"。
 */

/** 家电模板目录 — 前后端单一真相源 */

/**
 * 家电模板部署模式字面量联合：helper（helper 模板，不需要 configuration.yaml 注入）/
 * config_yaml（需配置 YAML 注入）/ either（两种方式都能工作）。
 */
export type ApplianceDeployMode = 'helper' | 'config_yaml' | 'either';

/**
 * 家电模板的功能分类字面量联合：composite（聚合控制+展示，多槽位联动）/ display（只读展示）/ control（可控制）。
 * 前端 UI 按 kind 决定渲染「控制器」还是「展示卡片」。
 */
export type ApplianceKind = 'composite' | 'display' | 'control';

/**
 * 单个家电槽位定义（前端表单项 + 后端反向解析共用最小结构）。
 * 一个家电由多个槽位组成，每个槽位绑定一个 HA 实体（domain 限定校验用）。
 */
export interface ApplianceSlotDef {
  key: string;    /** 槽位英文 key（唯一，如 pwr / fan / temp） */
  label: string;  /** 中文展示标签（表单项标题） */
  hint: string;   /** 中文占位提示文案 */
  domain: string; /** 绑定实体的 HA domain（如 switch / sensor / fan / climate） */
  icon: string;   /** emoji 图标，用于表单项左侧标识 */
}

/**
 * 家电模板类型定义（家电目录 APPLIANCE_TYPES 的条目）。
 * 描述该类家电对应的 HA template platform / 功能分类 / 部署模式 / 槽位清单 / 必填槽位组。
 */
export interface ApplianceTypeDef {
  id: string;                 /** 类型 ID（如 range_hood / washing_machine），全局唯一 */
  label: string;              /** 中文展示名（目录标题） */
  platform: string;           /** 对应的 HA template platform（fan/sensor/switch/climate/vacuum 等） */
  kind: ApplianceKind;        /** 功能分类：composite / display / control */
  deployMode: ApplianceDeployMode; /** 部署模式：helper / config_yaml / either */
  description: string;        /** 中文说明（提示该类型聚合哪些实体，是否需要 config_yaml） */
  slots: ApplianceSlotDef[];  /** 槽位定义列表（前后端表单最小字段） */
  requiredSlotGroups: string[][]; /** 必填槽位组：组间「或」，组内「且」；任一组全部满足即可提交 */
}

const slot = (
  key: string,
  label: string,
  hint: string,
  domain: string,
  icon: string,
): ApplianceSlotDef => ({ key, label, hint, domain, icon });

/**
 * 家电模板目录数组（单一真相源）：内置 20+ 类家电的类型定义。
 * APPLIANCE_TYPE_MAP / APPLIANCE_TYPE_IDS 从本常量派生，请勿直接修改。
 */
export const APPLIANCE_TYPES: ApplianceTypeDef[] = [
  {
    id: 'range_hood',
    label: '吸油烟机',
    platform: 'fan',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '聚合电源、风机与照明为 fan 实体；含 turn_on/off 时需 configuration.yaml',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '吸油烟机主电源', 'switch', '⚡'),
      slot('fan', '风机开关/调速', '风机控制实体', 'fan', '🌀'),
      slot('light', '照明灯', '照明灯开关', 'light', '💡'),
      slot('temp', '温度传感器', '温度读数', 'sensor', '🌡'),
      slot('pm25', 'PM2.5/油烟传感器', '空气质量', 'sensor', '📊'),
    ],
  },
  {
    id: 'washing_machine',
    label: '洗衣机',
    platform: 'sensor',
    kind: 'display',
    deployMode: 'helper',
    description: '聚合状态读数为 sensor；扩展字段写入 attributes',
    requiredSlotGroups: [['pwr'], ['state']],
    slots: [
      slot('pwr', '电源开关', '洗衣机主电源', 'switch', '⚡'),
      slot('mode', '模式/程序选择', '洗衣模式', 'select', '📋'),
      slot('state', '运行状态', '当前运行状态', 'sensor', '📊'),
      slot('remain', '剩余时间', '剩余时间读数', 'sensor', '⏱'),
      slot('temp', '水温', '水温传感器', 'sensor', '🌡'),
      slot('speed', '转速', '脱水转速', 'sensor', '🌀'),
    ],
  },
  {
    id: 'dryer',
    label: '烘干机',
    platform: 'sensor',
    kind: 'display',
    deployMode: 'helper',
    description: '聚合状态读数为 sensor',
    requiredSlotGroups: [['pwr'], ['state']],
    slots: [
      slot('pwr', '电源开关', '烘干机主电源', 'switch', '⚡'),
      slot('mode', '模式/程序', '烘干模式', 'select', '📋'),
      slot('state', '运行状态', '当前运行状态', 'sensor', '📊'),
      slot('remain', '剩余时间', '剩余时间读数', 'sensor', '⏱'),
      slot('temp', '温度', '烘干温度', 'sensor', '🌡'),
    ],
  },
  {
    id: 'refrigerator',
    label: '冰箱',
    platform: 'sensor',
    kind: 'display',
    deployMode: 'helper',
    description: '温度与门磁聚合为 sensor（非 climate 设备）',
    requiredSlotGroups: [['fridgeTemp'], ['pwr']],
    slots: [
      slot('pwr', '电源开关', '冰箱主电源', 'switch', '⚡'),
      slot('fridgeTemp', '冷藏温度', '冷藏室温度', 'sensor', '🌡'),
      slot('freezerTemp', '冷冻温度', '冷冻室温度', 'sensor', '❄'),
      slot('mode', '模式选择', '运转模式', 'select', '📋'),
      slot('door', '门磁传感器', '门开关检测', 'binary_sensor', '🚪'),
    ],
  },
  {
    id: 'oven',
    label: '烤箱/蒸烤箱',
    platform: 'sensor',
    kind: 'display',
    deployMode: 'helper',
    description: '温度与状态聚合为 sensor',
    requiredSlotGroups: [['pwr'], ['temp']],
    slots: [
      slot('pwr', '电源开关', '烤箱主电源', 'switch', '⚡'),
      slot('mode', '模式选择', '烘焙模式', 'select', '📋'),
      slot('temp', '当前温度', '炉内温度', 'sensor', '🌡'),
      slot('setTemp', '目标温度', '设定温度', 'sensor', '🎯'),
      slot('remain', '剩余时间', '倒计时', 'sensor', '⏱'),
    ],
  },
  {
    id: 'dishwasher',
    label: '洗碗机',
    platform: 'switch',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '电源转发为 switch；含 turn_on/off',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '洗碗机主电源', 'switch', '⚡'),
      slot('mode', '模式选择', '洗涤模式', 'select', '📋'),
      slot('state', '运行状态', '当前状态', 'sensor', '📊'),
      slot('remain', '剩余时间', '倒计时', 'sensor', '⏱'),
    ],
  },
  {
    id: 'water_purifier',
    label: '净水机',
    platform: 'switch',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '电源转发为 switch',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '净水机电源', 'switch', '⚡'),
      slot('tds', 'TDS 水质', 'TDS 读数', 'sensor', '💧'),
      slot('temp', '水温', '水温读数', 'sensor', '🌡'),
      slot('filter', '滤芯寿命', '滤芯剩余比例', 'sensor', '🔄'),
      slot('status', '运行状态', '制水/冲洗/待机', 'sensor', '📊'),
    ],
  },
  {
    id: 'water_dispenser',
    label: '管线机/饮水机',
    platform: 'switch',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '电源转发为 switch',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '管线机电源', 'switch', '⚡'),
      slot('temp', '出水温度', '当前水温', 'sensor', '🌡'),
      slot('setTemp', '设定温度', '目标出水温度', 'number', '🎯'),
      slot('tds', 'TDS 水质', 'TDS 读数', 'sensor', '💧'),
      slot('childLock', '童锁', '童锁开关', 'switch', '🔒'),
    ],
  },
  {
    id: 'air_purifier',
    label: '空气净化器',
    platform: 'fan',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '风机聚合为 fan',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '净化器电源', 'switch', '⚡'),
      slot('fan', '风机/风速', '风速控制', 'fan', '🌀'),
      slot('pm25', 'PM2.5 传感器', '颗粒物读数', 'sensor', '📊'),
      slot('filter', '滤芯寿命', '滤芯剩余比例', 'sensor', '🔄'),
      slot('mode', '模式选择', '自动/睡眠/强力', 'select', '📋'),
    ],
  },
  {
    id: 'air_conditioner',
    label: '空调',
    platform: 'climate',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '温湿度与模式聚合为 climate；需 configuration.yaml',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '空调主电源', 'switch', '⚡'),
      slot('mode', '模式选择', '制冷/制热/送风/除湿', 'select', '📋'),
      slot('temp', '当前温度', '室内温度读数', 'sensor', '🌡'),
      slot('setTemp', '目标温度', '设定温度值', 'number', '🎯'),
      slot('fan', '风速', '风速档位', 'select', '🌀'),
      slot('swing', '摆风', '上下/左右摆风', 'switch', '🔄'),
    ],
  },
  {
    id: 'robot_vacuum',
    label: '扫地机器人',
    platform: 'vacuum',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '清扫/回充聚合为 vacuum；仅 configuration.yaml',
    requiredSlotGroups: [['pwr'], ['state']],
    slots: [
      slot('pwr', '电源/启动', '扫地机启动', 'switch', '⚡'),
      slot('state', '运行状态', '清扫/回充/待机', 'sensor', '📊'),
      slot('battery', '电量', '电池电量百分比', 'sensor', '🔋'),
      slot('fan', '吸力/风速', '吸力档位', 'select', '🌀'),
      slot('dock', '回充实体', '回充指令实体', 'vacuum', '🏠'),
    ],
  },
  {
    id: 'dehumidifier',
    label: '除湿机',
    platform: 'switch',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '电源与湿度聚合为 switch + attributes（非 humidifier 平台）',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '除湿机电源', 'switch', '⚡'),
      slot('humidity', '当前湿度', '当前湿度读数', 'sensor', '💧'),
      slot('setHumidity', '目标湿度', '设定湿度值', 'number', '🎯'),
      slot('mode', '模式选择', '自动/连续/静音', 'select', '📋'),
      slot('tank', '水箱状态', '水箱满检测', 'binary_sensor', '🪣'),
    ],
  },
  {
    id: 'ceiling_fan',
    label: '电风扇/吊扇',
    platform: 'fan',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '风速聚合为 fan',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '风扇主电源', 'switch', '⚡'),
      slot('speed', '风速档位', '低/中/高', 'select', '🌀'),
      slot('speedNum', '风速百分比', '百分比调速', 'fan', '🎚'),
      slot('light', '照明灯', '风扇灯(如有)', 'light', '💡'),
      slot('direction', '正反转', '正转/反转', 'switch', '🔄'),
    ],
  },
  {
    id: 'smart_curtain',
    label: '电动窗帘',
    platform: 'cover',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '位置与电机聚合为 cover',
    requiredSlotGroups: [['motor'], ['position']],
    slots: [
      slot('pwr', '开关', '窗帘电机开关', 'switch', '⚡'),
      slot('position', '位置百分比', '开合位置', 'cover', '📏'),
      slot('motor', '电机控制', '开/关/停', 'cover', '🎮'),
      slot('battery', '电量', '电池电量(无线款)', 'sensor', '🔋'),
    ],
  },
  {
    id: 'smart_lock',
    label: '智能门锁',
    platform: 'lock',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '锁状态聚合为 lock',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '锁状态', '锁定/解锁状态', 'lock', '🔒'),
      slot('battery', '电量', '电池电量', 'sensor', '🔋'),
      slot('door', '门磁', '门开/关检测', 'binary_sensor', '🚪'),
      slot('unlockMethod', '开锁方式', '指纹/密码/钥匙', 'sensor', '👆'),
    ],
  },
  {
    id: 'tv',
    label: '电视',
    platform: 'media_player',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '电源与音量聚合为 media_player',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '电视电源', 'switch', '⚡'),
      slot('source', '输入源', 'HDMI1/HDMI2/AV', 'select', '📡'),
      slot('volume', '音量', '音量控制', 'media_player', '🔊'),
      slot('app', '应用启动', 'Netflix/YouTube等', 'select', '📱'),
    ],
  },
  {
    id: 'microwave',
    label: '微波炉',
    platform: 'switch',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '电源聚合为 switch',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '微波炉电源', 'switch', '⚡'),
      slot('mode', '模式选择', '微波/烧烤/解冻', 'select', '📋'),
      slot('time', '时间设定', '烹饪时间', 'number', '⏱'),
      slot('state', '运行状态', '工作中/待机', 'sensor', '📊'),
    ],
  },
  {
    id: 'rice_cooker',
    label: '电饭煲',
    platform: 'switch',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '电源聚合为 switch',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '电饭煲电源', 'switch', '⚡'),
      slot('mode', '模式选择', '煮饭/煮粥/煲汤/蛋糕', 'select', '📋'),
      slot('state', '运行状态', '烹饪/保温/待机', 'sensor', '📊'),
      slot('remain', '剩余时间', '倒计时', 'sensor', '⏱'),
      slot('temp', '温度', '当前温度', 'sensor', '🌡'),
    ],
  },
  {
    id: 'fresh_air',
    label: '新风机',
    platform: 'fan',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '风机聚合为 fan',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '新风机电源', 'switch', '⚡'),
      slot('fan', '风机/风速', '风速控制', 'fan', '🌀'),
      slot('pm25', 'PM2.5 传感器', '室内颗粒物', 'sensor', '📊'),
      slot('co2', 'CO2 传感器', '二氧化碳读数', 'sensor', '🫁'),
      slot('filter', '滤芯寿命', '滤芯剩余比例', 'sensor', '🔄'),
      slot('temp', '温度', '室内温度', 'sensor', '🌡'),
    ],
  },
  {
    id: 'floor_heating',
    label: '地暖',
    platform: 'climate',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '温度聚合为 climate',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '地暖主控', 'switch', '⚡'),
      slot('temp', '当前温度', '地面温度', 'sensor', '🌡'),
      slot('setTemp', '目标温度', '设定温度值', 'number', '🎯'),
      slot('roomTemp', '室温', '室内空气温度', 'sensor', '🏠'),
      slot('mode', '模式', '节能/舒适/防冻', 'select', '📋'),
    ],
  },
  {
    id: 'smart_plug',
    label: '智能插座/排插',
    platform: 'switch',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '主开关聚合为 switch',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '主开关', '插座总开关', 'switch', '⚡'),
      slot('power', '功率', '当前功率读数', 'sensor', '⚡'),
      slot('energy', '用电量', '累计电量', 'sensor', '📊'),
      slot('voltage', '电压', '电压读数', 'sensor', '🔌'),
      slot('current', '电流', '电流读数', 'sensor', '⚡'),
      slot('childLock', '童锁', '物理按键锁定', 'switch', '🔒'),
    ],
  },
  {
    id: 'water_heater',
    label: '热水器/壁挂炉',
    platform: 'water_heater',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '水温与开关聚合为 water_heater 实体',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '热水器主开关', 'switch', '⚡'),
      slot('temp', '当前水温', '出水/储水温度', 'sensor', '🌡'),
      slot('setTemp', '目标温度', '设定温度', 'number', '🎯'),
      slot('mode', '工作模式', '加热/保温/ eco', 'select', '📋'),
      slot('state', '运行状态', '加热中/待机', 'sensor', '📊'),
    ],
  },
  {
    id: 'humidifier_ha',
    label: '加湿器(HA)',
    platform: 'humidifier',
    kind: 'control',
    deployMode: 'config_yaml',
    description: '湿度控制聚合为 HA humidifier 平台（区别于 switch 型除湿机）',
    requiredSlotGroups: [['pwr']],
    slots: [
      slot('pwr', '电源开关', '加湿器电源', 'switch', '⚡'),
      slot('humidity', '当前湿度', '室内湿度 %', 'sensor', '💧'),
      slot('setHumidity', '目标湿度', '设定湿度 %', 'number', '🎯'),
      slot('mode', '模式', '自动/睡眠/强力', 'select', '📋'),
      slot('fan', '雾化档位', '风速/档位', 'select', '🌀'),
    ],
  },
];

/**
 * 家电类型 ID → ApplianceTypeDef 的快速查找表（由 APPLIANCE_TYPES 派生），供 getApplianceType O(1) 查询。
 */
export const APPLIANCE_TYPE_MAP = Object.fromEntries(
  APPLIANCE_TYPES.map((t) => [t.id, t]),
) as Record<string, ApplianceTypeDef>;

/**
 * 家电类型 ID 集合（派生自 APPLIANCE_TYPES），用于 O(1) 判断一个字符串是否为合法的内置家电类型。
 */
export const APPLIANCE_TYPE_IDS = new Set(APPLIANCE_TYPES.map((t) => t.id));

/**
 * 特殊模板类型集合：trigger_sensor（触发式传感器，非家电聚合）/ yaml_import（未知原始 YAML 按导入原样保留）。
 * 不属于 APPLIANCE_TYPE_IDS；前后端 UI 据此分类显示为「触发传感器」或「导入 YAML」选项卡。
 */
export const SPECIAL_TEMPLATE_TYPES = new Set(['trigger_sensor', 'yaml_import']);

/**
 * 根据家电类型 ID 快速查询类型定义（来自 APPLIANCE_TYPE_MAP O(1)）。
 *
 * @param id 家电类型 ID（如 "air_conditioner"）
 * @returns ApplianceTypeDef；未知 ID 返回 undefined
 */
export function getApplianceType(id: string): ApplianceTypeDef | undefined {
  return APPLIANCE_TYPE_MAP[id];
}

/**
 * 获取某家电类型的内置槽位定义列表（表单渲染与反向解析使用）。
 *
 * @param typeId 家电类型 ID
 * @returns ApplianceSlotDef 数组；未知类型返回空数组（永不 null）
 */
export function getBuiltinSlots(typeId: string): ApplianceSlotDef[] {
  return getApplianceType(typeId)?.slots || [];
}

/**
 * 获取某家电类型的必填槽位组（组间「或」，组内「且」；默认兜底为 [['pwr']]）。
 *
 * @param typeId 家电类型 ID
 * @returns string[][] 必需槽位组；未知类型返回仅含 pwr 组的兜底
 */
export function getRequiredSlotGroups(typeId: string): string[][] {
  return getApplianceType(typeId)?.requiredSlotGroups || [['pwr']];
}
