/**
 * @file appliance-yaml-gen.ts
 * @module @homeos/shared/template
 * @brief 家电 template YAML 生成器（按家电类型 + 槽位 mapping 输出 HA template 配置）。
 *
 * 职责：
 *  - 按家电类型（range_hood / washing_machine / air_conditioner 等）生成对应平台的
 *    template YAML（switch / sensor / fan / climate / vacuum / cover / lock / media_player /
 *    water_heater / humidifier）；
 *  - 处理 state / turn_on/off / set_percentage / open_cover / lock 等动作块与 attributes；
 *  - 自定义槽位（非内置 key）按 domain 生成对应 attributes 表达式；
 *  - 附带 extraUnit / extraDeviceClass / extraIcon 顶层字段。
 *
 * 关键依赖：
 *  - appliance-catalog 提供 getApplianceType / getBuiltinSlots / ApplianceSlotDef；
 *  - 前端编辑器与后端持久化调用 buildApplianceTemplateYaml 生成 YAML。
 *
 * 约定：
 *  - 现代 HA template action 语法（- action: domain.service + target.entity_id）；
 *  - attributes 用 "{{ states('id') }}" / "{{ is_state('id','on') }}" 模板；
 *  - 未知家电类型返回 '# 未知家电类型'，不支持的类型返回 '# 不支持的家电类型'。
 */
import { getApplianceType, getBuiltinSlots, type ApplianceSlotDef } from './appliance-catalog';

/**
 * buildApplianceTemplateYaml 生成家电 YAML 的输入结构：家电类型 + 展示名 + 槽位 entity_id 映射 + 可选扩展字段。
 * slots 为 flat key→entityId；slotsList 提供元信息（支持用户自定义槽位 custom=true，内部 _key 关联）。
 */
export interface BuildApplianceYamlInput {
  entType: string;  /** 家电类型 ID（如 air_conditioner / range_hood） */
  entName: string;  /** 实体显示名（用于 template.name / slugId 兜底） */
  slots: Record<string, string>; /** 槽位 key → 绑定 entity_id 字符串映射（必填槽不能为空） */
  slotsList?: Array<ApplianceSlotDef & { _key?: string; custom?: boolean }>; /** 完整槽位定义列表（含自定义槽位） */
  extraUnit?: string; /** 顶层 unit_of_measurement 扩展（传感器类有用） */
  extraDeviceClass?: string; /** 顶层 device_class 扩展（sensor platform 使用） */
  extraIcon?: string; /** 顶层 icon 扩展（自定义 emoji 覆盖默认） */
}

function slugId(name: string, fallback: string) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '');
  return slug || fallback;
}

function escName(name: string) {
  return String(name || '').replace(/"/g, '\\"');
}

/** 现代 HA template action 语法 */
function pushAction(
  L: string[],
  indent: string,
  action: string,
  entityId: string,
  data?: Record<string, string>,
) {
  L.push(`${indent}- action: ${action}`);
  L.push(`${indent}  target:`);
  L.push(`${indent}    entity_id: ${entityId}`);
  if (data) {
    L.push(`${indent}  data:`);
    for (const [k, v] of Object.entries(data)) {
      L.push(`${indent}    ${k}: ${v}`);
    }
  }
}

function pushTurnOnOff(L: string[], indent: string, domain: string, entityId: string) {
  L.push(`${indent}turn_on:`);
  pushAction(L, indent + '  ', `${domain}.turn_on`, entityId);
  L.push(`${indent}turn_off:`);
  pushAction(L, indent + '  ', `${domain}.turn_off`, entityId);
}

function pushStateBool(
  L: string[],
  indent: string,
  entityId: string,
  onVal = 'on',
  offVal = 'off',
) {
  L.push(`${indent}state: >`);
  L.push(`${indent}  {% if is_state('${entityId}', 'on') %}${onVal}{% else %}${offVal}{% endif %}`);
}

function pushStateRaw(L: string[], indent: string, expr: string) {
  L.push(`${indent}state: >`);
  L.push(`${indent}  ${expr}`);
}

class AttrCollector {
  private lines: string[] = [];

  pushState(key: string, entityId: string) {
    this.lines.push(`        ${key}: "{{ states('${entityId}') }}"`);
  }

  pushBool(key: string, entityId: string) {
    this.lines.push(`        ${key}: "{{ is_state('${entityId}', 'on') }}"`);
  }

  flush(L: string[]) {
    if (!this.lines.length) return;
    L.push('      attributes:');
    L.push(...this.lines);
  }
}

function pushExtras(
  L: string[],
  extra: Pick<BuildApplianceYamlInput, 'extraUnit' | 'extraDeviceClass' | 'extraIcon'>,
) {
  if (extra.extraUnit) L.push(`      unit_of_measurement: "${extra.extraUnit}"`);
  if (extra.extraDeviceClass) L.push(`      device_class: ${extra.extraDeviceClass}`);
  if (extra.extraIcon) L.push(`      icon: ${extra.extraIcon}`);
}

function slugAttrKey(label: string, key: string) {
  return (
    String(label || key)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '') || key
  );
}

/** 自定义槽位 → attributes */
function appendCustomSlots(
  L: string[],
  slots: Record<string, string>,
  knownKeys: Set<string>,
  slotsList: BuildApplianceYamlInput['slotsList'] = [],
) {
  const metaByKey = new Map<string, ApplianceSlotDef & { _key?: string }>();
  for (const s of slotsList || []) {
    const k = s._key || s.key;
    if (k) metaByKey.set(k, s);
  }
  const attrLines: string[] = [];
  for (const [key, entityId] of Object.entries(slots || {})) {
    const eid = String(entityId || '').trim();
    if (!eid || knownKeys.has(key)) continue;
    const meta = metaByKey.get(key);
    const attrKey = slugAttrKey(meta?.label || '', key);
    const dom = meta?.domain || '';
    if (dom === 'switch' || dom === 'binary_sensor') {
      attrLines.push(`      ${attrKey}: "{{ is_state('${eid}', 'on') }}"`);
    } else if (dom === 'fan') {
      attrLines.push(`      ${attrKey}: "{{ state_attr('${eid}', 'percentage') }}"`);
    } else if (dom === 'cover') {
      attrLines.push(`      ${attrKey}: "{{ state_attr('${eid}', 'current_position') }}"`);
    } else if (dom === 'media_player') {
      attrLines.push(`      ${attrKey}: "{{ state_attr('${eid}', 'volume_level') }}"`);
    } else {
      attrLines.push(`      ${attrKey}: "{{ states('${eid}') }}"`);
    }
  }
  if (!attrLines.length) return;
  const attrIdx = L.findIndex((l) => l.trim() === 'attributes:');
  if (attrIdx < 0) {
    L.push('      attributes:');
    L.push(...attrLines.map((l) => l.replace(/^ {6}/, '        ')));
  } else {
    L.splice(attrIdx + 1, 0, ...attrLines.map((l) => l.replace(/^ {6}/, '        ')));
  }
}

function hasAnySlot(slots: Record<string, string>, keys: string[]) {
  return keys.some((k) => slots[k]?.trim());
}

function buildPlatformHeader(
  L: string[],
  platform: string,
  id: string,
  name: string,
  defaultName: string,
) {
  L.push(`  - ${platform}:`);
  L.push(`    - unique_id: ${id}`);
  L.push(`      name: "${escName(name) || defaultName}"`);
}

/** 生成家电 template YAML */
export function buildApplianceTemplateYaml(input: BuildApplianceYamlInput): string {
  const { entType, entName, slots, slotsList = [] } = input;
  const typeDef = getApplianceType(entType);
  if (!typeDef) return '# 未知家电类型';

  const id = slugId(entName, `${entType}_composite`);
  const knownKeys = new Set(getBuiltinSlots(entType).map((s) => s.key));
  const L: string[] = ['template:'];
  const I = '    ';
  const attrs = new AttrCollector();

  switch (entType) {
    case 'range_hood': {
      buildPlatformHeader(L, 'fan', id, entName, '吸油烟机');
      if (slots.pwr) {
        pushStateBool(L, I, slots.pwr);
        pushTurnOnOff(L, I, 'switch', slots.pwr);
      }
      if (slots.fan) {
        L.push(`${I}percentage: "{{ state_attr('${slots.fan}', 'percentage') }}"`);
        L.push(`${I}set_percentage:`);
        pushAction(L, I + '  ', 'fan.set_percentage', slots.fan, {
          percentage: '{{ percentage }}',
        });
      }
      if (slots.light) {
        L.push(`${I}turn_on:`);
        pushAction(L, I + '  ', 'light.turn_on', slots.light);
        L.push(`${I}turn_off:`);
        pushAction(L, I + '  ', 'light.turn_off', slots.light);
      }
      if (slots.temp) attrs.pushState('temperature', slots.temp);
      if (slots.pm25) attrs.pushState('pm25', slots.pm25);
      attrs.flush(L);
      break;
    }
    case 'washing_machine':
    case 'dryer': {
      const label = entType === 'washing_machine' ? '洗衣机' : '烘干机';
      buildPlatformHeader(L, 'sensor', id, entName, label);
      if (slots.state) {
        pushStateRaw(L, I, `{{ states('${slots.state}') }}`);
      } else if (slots.pwr) {
        pushStateBool(L, I, slots.pwr, 'on', 'off');
      }
      if (slots.mode) attrs.pushState('mode', slots.mode);
      if (slots.remain) attrs.pushState('remaining_time', slots.remain);
      if (slots.temp) attrs.pushState('temperature', slots.temp);
      if (entType === 'washing_machine' && slots.speed) attrs.pushState('speed', slots.speed);
      attrs.flush(L);
      break;
    }
    case 'refrigerator': {
      buildPlatformHeader(L, 'sensor', id, entName, '冰箱');
      if (slots.fridgeTemp) pushStateRaw(L, I, `{{ states('${slots.fridgeTemp}') }}`);
      else if (slots.freezerTemp) pushStateRaw(L, I, `{{ states('${slots.freezerTemp}') }}`);
      else if (slots.pwr) pushStateBool(L, I, slots.pwr, 'on', 'off');
      if (slots.fridgeTemp) attrs.pushState('temperature', slots.fridgeTemp);
      if (slots.freezerTemp) attrs.pushState('freezer_temp', slots.freezerTemp);
      if (slots.door) attrs.pushBool('door_open', slots.door);
      if (slots.mode) attrs.pushState('mode', slots.mode);
      if (slots.pwr) attrs.pushBool('power', slots.pwr);
      attrs.flush(L);
      break;
    }
    case 'oven': {
      buildPlatformHeader(L, 'sensor', id, entName, '烤箱');
      if (slots.temp) pushStateRaw(L, I, `{{ states('${slots.temp}') }}`);
      else if (slots.pwr) pushStateBool(L, I, slots.pwr, 'on', 'off');
      if (slots.temp) attrs.pushState('temperature', slots.temp);
      if (slots.setTemp) attrs.pushState('target_temperature', slots.setTemp);
      if (slots.remain) attrs.pushState('remaining_time', slots.remain);
      if (slots.mode) attrs.pushState('mode', slots.mode);
      if (slots.pwr) attrs.pushBool('power', slots.pwr);
      attrs.flush(L);
      break;
    }
    case 'dishwasher':
    case 'water_purifier':
    case 'water_dispenser':
    case 'microwave':
    case 'rice_cooker':
    case 'smart_plug':
    case 'dehumidifier': {
      const names: Record<string, string> = {
        dishwasher: '洗碗机',
        water_purifier: '净水机',
        water_dispenser: '管线机',
        microwave: '微波炉',
        rice_cooker: '电饭煲',
        smart_plug: '智能插座',
        dehumidifier: '除湿机',
      };
      buildPlatformHeader(L, 'switch', id, entName, names[entType] || entType);
      if (slots.pwr) {
        pushStateBool(L, I, slots.pwr);
        pushTurnOnOff(L, I, 'switch', slots.pwr);
      }
      if (entType === 'dishwasher') {
        if (slots.mode) attrs.pushState('mode', slots.mode);
        if (slots.state) attrs.pushState('status', slots.state);
        if (slots.remain) attrs.pushState('remaining_time', slots.remain);
      }
      if (entType === 'water_purifier') {
        if (slots.tds) attrs.pushState('tds', slots.tds);
        if (slots.temp) attrs.pushState('temperature', slots.temp);
        if (slots.filter) attrs.pushState('filter_life', slots.filter);
        if (slots.status) attrs.pushState('status', slots.status);
      }
      if (entType === 'water_dispenser') {
        if (slots.temp) attrs.pushState('temperature', slots.temp);
        if (slots.setTemp) attrs.pushState('set_temperature', slots.setTemp);
        if (slots.tds) attrs.pushState('tds', slots.tds);
        if (slots.childLock) attrs.pushBool('child_lock', slots.childLock);
      }
      if (entType === 'microwave') {
        if (slots.mode) attrs.pushState('mode', slots.mode);
        if (slots.time) attrs.pushState('time', slots.time);
        if (slots.state) attrs.pushState('status', slots.state);
      }
      if (entType === 'rice_cooker') {
        if (slots.mode) attrs.pushState('mode', slots.mode);
        if (slots.state) attrs.pushState('status', slots.state);
        if (slots.remain) attrs.pushState('remaining_time', slots.remain);
        if (slots.temp) attrs.pushState('temperature', slots.temp);
      }
      if (entType === 'smart_plug') {
        if (slots.power) attrs.pushState('power', slots.power);
        if (slots.energy) attrs.pushState('energy', slots.energy);
        if (slots.voltage) attrs.pushState('voltage', slots.voltage);
        if (slots.current) attrs.pushState('current', slots.current);
        if (slots.childLock) attrs.pushBool('child_lock', slots.childLock);
      }
      if (entType === 'dehumidifier') {
        if (slots.humidity) attrs.pushState('humidity', slots.humidity);
        if (slots.setHumidity) attrs.pushState('target_humidity', slots.setHumidity);
        if (slots.mode) attrs.pushState('mode', slots.mode);
        if (slots.tank) attrs.pushBool('tank_full', slots.tank);
      }
      attrs.flush(L);
      break;
    }
    case 'air_purifier':
    case 'ceiling_fan':
    case 'fresh_air': {
      const names = { air_purifier: '空气净化器', ceiling_fan: '电风扇', fresh_air: '新风机' };
      buildPlatformHeader(L, 'fan', id, entName, names[entType as keyof typeof names]);
      if (slots.pwr) {
        pushStateBool(L, I, slots.pwr);
        pushTurnOnOff(L, I, 'switch', slots.pwr);
      } else if (hasAnySlot(slots, ['fan', 'speedNum'])) {
        pushStateRaw(L, I, 'on');
      }
      const fanEid = slots.fan || slots.speedNum;
      if (fanEid) {
        L.push(`${I}percentage: "{{ state_attr('${fanEid}', 'percentage') }}"`);
        L.push(`${I}set_percentage:`);
        pushAction(L, I + '  ', 'fan.set_percentage', fanEid, { percentage: '{{ percentage }}' });
      }
      if (entType === 'air_purifier') {
        if (slots.pm25) attrs.pushState('pm25', slots.pm25);
        if (slots.filter) attrs.pushState('filter_life', slots.filter);
        if (slots.mode) attrs.pushState('preset_mode', slots.mode);
      }
      if (entType === 'ceiling_fan') {
        if (slots.speed) attrs.pushState('preset_mode', slots.speed);
        if (slots.light) attrs.pushBool('light', slots.light);
        if (slots.direction) attrs.pushBool('direction', slots.direction);
      }
      if (entType === 'fresh_air') {
        if (slots.pm25) attrs.pushState('pm25', slots.pm25);
        if (slots.co2) attrs.pushState('co2', slots.co2);
        if (slots.filter) attrs.pushState('filter_life', slots.filter);
        if (slots.temp) attrs.pushState('temperature', slots.temp);
      }
      attrs.flush(L);
      break;
    }
    case 'air_conditioner':
    case 'floor_heating': {
      const label = entType === 'air_conditioner' ? '空调' : '地暖';
      buildPlatformHeader(L, 'climate', id, entName, label);
      L.push(`${I}hvac_modes: ["off", "heat", "cool"]`);
      if (slots.pwr) {
        pushStateRaw(
          L,
          I,
          `{% if is_state('${slots.pwr}', 'on') %}${entType === 'floor_heating' ? 'heat' : 'cool'}{% else %}off{% endif %}`,
        );
        pushTurnOnOff(L, I, 'switch', slots.pwr);
      }
      if (slots.temp) L.push(`${I}current_temperature: "{{ states('${slots.temp}') }}"`);
      if (slots.setTemp) L.push(`${I}temperature: "{{ states('${slots.setTemp}') }}"`);
      if (slots.roomTemp) attrs.pushState('room_temperature', slots.roomTemp);
      if (slots.mode) L.push(`${I}preset_mode: "{{ states('${slots.mode}') }}"`);
      if (slots.fan) L.push(`${I}fan_mode: "{{ states('${slots.fan}') }}"`);
      if (slots.swing) L.push(`${I}swing_mode: "{{ is_state('${slots.swing}', 'on') }}"`);
      attrs.flush(L);
      break;
    }
    case 'robot_vacuum': {
      buildPlatformHeader(L, 'vacuum', id, entName, '扫地机器人');
      if (slots.state) {
        pushStateRaw(L, I, `{{ states('${slots.state}') }}`);
      } else if (slots.pwr) {
        pushStateBool(L, I, slots.pwr, 'cleaning', 'docked');
      }
      const startEid = slots.pwr || slots.state;
      if (startEid) {
        L.push(`${I}start:`);
        pushAction(L, I + '  ', 'vacuum.start', startEid);
        L.push(`${I}stop:`);
        pushAction(L, I + '  ', 'vacuum.stop', startEid);
      }
      const dockEid = slots.dock || slots.pwr;
      if (dockEid) {
        L.push(`${I}return_to_base:`);
        pushAction(L, I + '  ', 'vacuum.return_to_base', dockEid);
      }
      if (slots.battery) attrs.pushState('battery_level', slots.battery);
      if (slots.fan) attrs.pushState('fan_speed', slots.fan);
      attrs.flush(L);
      break;
    }
    case 'smart_curtain': {
      buildPlatformHeader(L, 'cover', id, entName, '电动窗帘');
      const motor = slots.motor || slots.position;
      if (motor) {
        if (slots.position) {
          L.push(`${I}position: "{{ state_attr('${slots.position}', 'current_position') }}"`);
        }
        if (slots.motor) {
          pushStateRaw(L, I, `{{ states('${slots.motor}') }}`);
        } else if (slots.position) {
          pushStateRaw(L, I, `{{ state_attr('${slots.position}', 'current_position') }}`);
        }
        L.push(`${I}open_cover:`);
        pushAction(L, I + '  ', 'cover.open_cover', motor);
        L.push(`${I}close_cover:`);
        pushAction(L, I + '  ', 'cover.close_cover', motor);
        L.push(`${I}stop_cover:`);
        pushAction(L, I + '  ', 'cover.stop_cover', motor);
        if (slots.position) {
          L.push(`${I}set_cover_position:`);
          pushAction(L, I + '  ', 'cover.set_cover_position', motor, {
            position: '{{ position }}',
          });
        }
      }
      if (slots.pwr) attrs.pushBool('power', slots.pwr);
      if (slots.battery) attrs.pushState('battery', slots.battery);
      attrs.flush(L);
      break;
    }
    case 'smart_lock': {
      buildPlatformHeader(L, 'lock', id, entName, '智能门锁');
      if (slots.pwr) {
        pushStateRaw(L, I, `{{ states('${slots.pwr}') }}`);
        L.push(`${I}lock:`);
        pushAction(L, I + '  ', 'lock.lock', slots.pwr);
        L.push(`${I}unlock:`);
        pushAction(L, I + '  ', 'lock.unlock', slots.pwr);
      }
      if (slots.battery) attrs.pushState('battery', slots.battery);
      if (slots.door) attrs.pushBool('door', slots.door);
      if (slots.unlockMethod) attrs.pushState('unlock_method', slots.unlockMethod);
      attrs.flush(L);
      break;
    }
    case 'tv': {
      buildPlatformHeader(L, 'media_player', id, entName, '电视');
      if (slots.pwr) {
        pushStateBool(L, I, slots.pwr, 'playing', 'off');
        pushTurnOnOff(L, I, 'switch', slots.pwr);
      }
      if (slots.volume) {
        L.push(`${I}volume_level: "{{ state_attr('${slots.volume}', 'volume_level') }}"`);
        L.push(`${I}volume_set:`);
        pushAction(L, I + '  ', 'media_player.volume_set', slots.volume, {
          volume_level: '{{ volume_level }}',
        });
      }
      if (slots.source) attrs.pushState('source', slots.source);
      if (slots.app) attrs.pushState('app', slots.app);
      attrs.flush(L);
      break;
    }
    case 'water_heater': {
      buildPlatformHeader(L, 'water_heater', id, entName, '热水器');
      if (slots.pwr) {
        pushStateRaw(L, I, `{% if is_state('${slots.pwr}', 'on') %}heat{% else %}off{% endif %}`);
        pushTurnOnOff(L, I, 'switch', slots.pwr);
      } else if (slots.state) {
        pushStateRaw(L, I, `{{ states('${slots.state}') }}`);
      }
      if (slots.temp) L.push(`${I}current_temperature: "{{ states('${slots.temp}') }}"`);
      if (slots.setTemp) {
        L.push(`${I}temperature: "{{ states('${slots.setTemp}') }}"`);
        L.push(`${I}set_temperature:`);
        pushAction(L, I + '  ', 'number.set_value', slots.setTemp, { value: '{{ temperature }}' });
      }
      if (slots.mode) {
        L.push(`${I}operation_mode: "{{ states('${slots.mode}') }}"`);
        L.push(`${I}set_operation_mode:`);
        pushAction(L, I + '  ', 'select.select_option', slots.mode, {
          option: '{{ operation_mode }}',
        });
      }
      if (slots.state && !slots.pwr) attrs.pushState('status', slots.state);
      attrs.flush(L);
      break;
    }
    case 'humidifier_ha': {
      buildPlatformHeader(L, 'humidifier', id, entName, '加湿器');
      if (slots.pwr) {
        pushStateBool(L, I, slots.pwr);
        pushTurnOnOff(L, I, 'switch', slots.pwr);
      }
      if (slots.humidity) L.push(`${I}current_humidity: "{{ states('${slots.humidity}') }}"`);
      if (slots.setHumidity) {
        L.push(`${I}humidity: "{{ states('${slots.setHumidity}') }}"`);
        L.push(`${I}set_humidity:`);
        pushAction(L, I + '  ', 'number.set_value', slots.setHumidity, { value: '{{ humidity }}' });
      }
      if (slots.mode) {
        L.push(`${I}mode: "{{ states('${slots.mode}') }}"`);
        L.push(`${I}set_mode:`);
        pushAction(L, I + '  ', 'select.select_option', slots.mode, { option: '{{ mode }}' });
      }
      if (slots.fan) attrs.pushState('fan_mode', slots.fan);
      attrs.flush(L);
      break;
    }
    default:
      return '# 不支持的家电类型';
  }

  appendCustomSlots(L, slots, knownKeys, slotsList);
  pushExtras(L, input);

  const joined = L.join('\n');
  if (
    !hasAnySlot(slots, [...knownKeys]) &&
    !slotsList.some((s) => slots[s._key || s.key]?.trim())
  ) {
    return joined;
  }
  return joined;
}
