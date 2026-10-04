/**
 * @file flow-yaml-keys.ts
 * @module @homeos/shared/template
 * @brief Template Options Flow ↔ configuration.yaml 字段映射（单一真相源）。
 *
 * 职责：
 *  - 维护 Flow 字段名 ↔ YAML 字段名的双向映射表（含 turn_on/off 新旧语法别名）；
 *  - 提供 flowKeyToYamlKey / yamlKeyToFlowKey 查询，未命中时原样返回。
 *
 * 关键依赖：
 *  - 后端持久化 / 前端编辑器在 Flow 与 YAML 互转时调用本表对齐字段名。
 *
 * 约定：
 *  - FLOW_TO_YAML_ENTRIES 与 YAML_TO_FLOW_ENTRIES 须保持反向一致性；
 *  - on_action/off_action 在 Flow 侧对应 turn_on/turn_off（HA 新旧语法兼容）。
 */
/**
 * Template Options Flow ↔ configuration.yaml 字段映射（单一真相源）
 */
const FLOW_TO_YAML_ENTRIES: Record<string, string> = {
  state: 'state',
  value_template: 'value_template',
  unit_of_measurement: 'unit_of_measurement',
  device_class: 'device_class',
  state_class: 'state_class',
  icon: 'icon',
  availability: 'availability',
  turn_on: 'turn_on',
  turn_off: 'turn_off',
  level: 'level',
  level_action: 'level_action',
  percentage: 'percentage',
  set_percentage_action: 'set_percentage',
  on_action: 'turn_on',
  off_action: 'turn_off',
  lock: 'lock',
  unlock: 'unlock',
  open: 'open',
  position: 'position',
  open_action: 'open',
  close_action: 'close',
  stop_action: 'stop',
  position_action: 'set_position',
  options: 'options',
  select_option: 'select_option',
  min: 'min',
  max: 'max',
  step: 'step',
  set_value: 'set_value',
  press: 'press',
  event_type: 'event_type',
  event_types: 'event_types',
};

const YAML_TO_FLOW_ENTRIES: Record<string, string> = {
  state: 'state',
  state_template: 'state',
  value_template: 'value_template',
  unit_of_measurement: 'unit_of_measurement',
  device_class: 'device_class',
  state_class: 'state_class',
  icon: 'icon',
  availability: 'availability',
  turn_on: 'turn_on',
  turn_off: 'turn_off',
  level: 'level',
  level_action: 'level_action',
  percentage: 'percentage',
  set_percentage: 'set_percentage_action',
  set_percentage_action: 'set_percentage_action',
  on_action: 'on_action',
  off_action: 'off_action',
  lock: 'lock',
  unlock: 'unlock',
  open: 'open',
  position: 'position',
  open_action: 'open_action',
  close_action: 'close_action',
  stop_action: 'stop_action',
  set_position: 'position_action',
  position_action: 'position_action',
  options: 'options',
  select_option: 'select_option',
  min: 'min',
  max: 'max',
  step: 'step',
  set_value: 'set_value',
  press: 'press',
  event_type: 'event_type',
  event_types: 'event_types',
};

/**
 * Flow 表单字段 → HA configuration.yaml 字段的映射表（只读）：on_action 与 off_action 等新旧语法别名统一映射 turn_on/turn_off。
 * 单一真相源，前后端 Flow 与 YAML 互转都以本表为准。
 */
export const TEMPLATE_FLOW_TO_YAML_KEYS: Readonly<Record<string, string>> = FLOW_TO_YAML_ENTRIES;

/**
 * HA YAML 字段名 → Flow 字段名的反向映射表（只读）：state_template 等老写法也反归一化为 state；set_percentage → set_percentage_action。
 */
export const TEMPLATE_YAML_TO_FLOW_KEYS: Readonly<Record<string, string>> = YAML_TO_FLOW_ENTRIES;

/**
 * Flow 字段名查询对应 YAML 字段名；未命中按原样返回（允许透传扩展字段）。
 *
 * @param flowKey Flow 侧字段名
 * @returns 映射后的 YAML 字段名；未知 flowKey 原样返回
 */
export function flowKeyToYamlKey(flowKey: string): string {
  return TEMPLATE_FLOW_TO_YAML_KEYS[flowKey] ?? flowKey;
}

/**
 * YAML 字段名查询对应 Flow 字段名；未命中按原样返回（兼容 YAML 端新扩展字段）。
 *
 * @param yamlKey YAML 侧字段名（可能含 *_template 老写法）
 * @returns 映射后的 Flow 字段名；未知 yamlKey 原样返回
 */
export function yamlKeyToFlowKey(yamlKey: string): string {
  return TEMPLATE_YAML_TO_FLOW_KEYS[yamlKey] ?? yamlKey;
}
