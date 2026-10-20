/** - 按家电类型（range_hood / washing_machine / air_conditioner 等）生成对应平台的 */
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
  lines: string[],
  indent: string,
  action: string,
  entityId: string,
  data?: Record<string, string>,
) {
  lines.push(`${indent}- action: ${action}`);
  lines.push(`${indent}  target:`);
  lines.push(`${indent}    entity_id: ${entityId}`);
  if (data) {
    lines.push(`${indent}  data:`);
    for (const [key, value] of Object.entries(data)) {
      lines.push(`${indent}    ${key}: ${value}`);
    }
  }
}

function pushTurnOnOff(lines: string[], indent: string, domain: string, entityId: string) {
  lines.push(`${indent}turn_on:`);
  pushAction(lines, indent + '  ', `${domain}.turn_on`, entityId);
  lines.push(`${indent}turn_off:`);
  pushAction(lines, indent + '  ', `${domain}.turn_off`, entityId);
}

function pushStateBool(
  lines: string[],
  indent: string,
  entityId: string,
  onVal = 'on',
  offVal = 'off',
) {
  lines.push(`${indent}state: >`);
  lines.push(`${indent}  {% if is_state('${entityId}', 'on') %}${onVal}{% else %}${offVal}{% endif %}`);
}

function pushStateRaw(lines: string[], indent: string, expr: string) {
  lines.push(`${indent}state: >`);
  lines.push(`${indent}  ${expr}`);
}

class AttrCollector {
  private lines: string[] = [];

  pushState(key: string, entityId: string) {
    this.lines.push(`        ${key}: "{{ states('${entityId}') }}"`);
  }

  pushBool(key: string, entityId: string) {
    this.lines.push(`        ${key}: "{{ is_state('${entityId}', 'on') }}"`);
  }

  flush(lines: string[]) {
    if (!this.lines.length) return;
    lines.push('      attributes:');
    lines.push(...this.lines);
  }
}

function pushExtras(
  lines: string[],
  extra: Pick<BuildApplianceYamlInput, 'extraUnit' | 'extraDeviceClass' | 'extraIcon'>,
) {
  if (extra.extraUnit) lines.push(`      unit_of_measurement: "${extra.extraUnit}"`);
  if (extra.extraDeviceClass) lines.push(`      device_class: ${extra.extraDeviceClass}`);
  if (extra.extraIcon) lines.push(`      icon: ${extra.extraIcon}`);
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
  lines: string[],
  slots: Record<string, string>,
  knownKeys: Set<string>,
  slotsList: BuildApplianceYamlInput['slotsList'] = [],
) {
  const metaByKey = new Map<string, ApplianceSlotDef & { _key?: string }>();
  for (const slot of slotsList || []) {
    const key = slot._key || slot.key;
    if (key) metaByKey.set(key, slot);
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
  const attrIdx = lines.findIndex((line) => line.trim() === 'attributes:');
  if (attrIdx < 0) {
    lines.push('      attributes:');
    lines.push(...attrLines.map((line) => line.replace(/^ {6}/, '        ')));
  } else {
    lines.splice(attrIdx + 1, 0, ...attrLines.map((line) => line.replace(/^ {6}/, '        ')));
  }
}

function hasAnySlot(slots: Record<string, string>, keys: string[]) {
  return keys.some((k) => slots[k]?.trim());
}

function buildPlatformHeader(
  lines: string[],
  platform: string,
  id: string,
  name: string,
  defaultName: string,
) {
  lines.push(`  - ${platform}:`);
  lines.push(`    - unique_id: ${id}`);
  lines.push(`      name: "${escName(name) || defaultName}"`);
}

/** 生成家电 template YAML */
export function buildApplianceTemplateYaml(input: BuildApplianceYamlInput): string {
  const { entType, entName, slots, slotsList = [] } = input;
  const typeDef = getApplianceType(entType);
  if (!typeDef) return '# 未知家电类型';

  const id = slugId(entName, `${entType}_composite`);
  const knownKeys = new Set(getBuiltinSlots(entType).map((slot) => slot.key));
  const lines: string[] = ['template:'];
  const baseIndent = '    ';
  const attrs = new AttrCollector();

  switch (entType) {
    case 'range_hood': {
      buildPlatformHeader(lines, 'fan', id, entName, '吸油烟机');
      if (slots.pwr) {
        pushStateBool(lines, baseIndent, slots.pwr);
        pushTurnOnOff(lines, baseIndent, 'switch', slots.pwr);
      }
      if (slots.fan) {
        lines.push(`${baseIndent}percentage: "{{ state_attr('${slots.fan}', 'percentage') }}"`);
        lines.push(`${baseIndent}set_percentage:`);
        pushAction(lines, baseIndent + '  ', 'fan.set_percentage', slots.fan, {
          percentage: '{{ percentage }}',
        });
      }
      if (slots.light) {
        lines.push(`${baseIndent}turn_on:`);
        pushAction(lines, baseIndent + '  ', 'light.turn_on', slots.light);
        lines.push(`${baseIndent}turn_off:`);
        pushAction(lines, baseIndent + '  ', 'light.turn_off', slots.light);
      }
      if (slots.temp) attrs.pushState('temperature', slots.temp);
      if (slots.pm25) attrs.pushState('pm25', slots.pm25);
      attrs.flush(lines);
      break;
    }
    case 'washing_machine':
    case 'dryer': {
      const label = entType === 'washing_machine' ? '洗衣机' : '烘干机';
      buildPlatformHeader(lines, 'sensor', id, entName, label);
      if (slots.state) {
        pushStateRaw(lines, baseIndent, `{{ states('${slots.state}') }}`);
      } else if (slots.pwr) {
        pushStateBool(lines, baseIndent, slots.pwr, 'on', 'off');
      }
      if (slots.mode) attrs.pushState('mode', slots.mode);
      if (slots.remain) attrs.pushState('remaining_time', slots.remain);
      if (slots.temp) attrs.pushState('temperature', slots.temp);
      if (entType === 'washing_machine' && slots.speed) attrs.pushState('speed', slots.speed);
      attrs.flush(lines);
      break;
    }
    case 'refrigerator': {
      buildPlatformHeader(lines, 'sensor', id, entName, '冰箱');
      if (slots.fridgeTemp) pushStateRaw(lines, baseIndent, `{{ states('${slots.fridgeTemp}') }}`);
      else if (slots.freezerTemp) pushStateRaw(lines, baseIndent, `{{ states('${slots.freezerTemp}') }}`);
      else if (slots.pwr) pushStateBool(lines, baseIndent, slots.pwr, 'on', 'off');
      if (slots.fridgeTemp) attrs.pushState('temperature', slots.fridgeTemp);
      if (slots.freezerTemp) attrs.pushState('freezer_temp', slots.freezerTemp);
      if (slots.door) attrs.pushBool('door_open', slots.door);
      if (slots.mode) attrs.pushState('mode', slots.mode);
      if (slots.pwr) attrs.pushBool('power', slots.pwr);
      attrs.flush(lines);
      break;
    }
    case 'oven': {
      buildPlatformHeader(lines, 'sensor', id, entName, '烤箱');
      if (slots.temp) pushStateRaw(lines, baseIndent, `{{ states('${slots.temp}') }}`);
      else if (slots.pwr) pushStateBool(lines, baseIndent, slots.pwr, 'on', 'off');
      if (slots.temp) attrs.pushState('temperature', slots.temp);
      if (slots.setTemp) attrs.pushState('target_temperature', slots.setTemp);
      if (slots.remain) attrs.pushState('remaining_time', slots.remain);
      if (slots.mode) attrs.pushState('mode', slots.mode);
      if (slots.pwr) attrs.pushBool('power', slots.pwr);
      attrs.flush(lines);
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
      buildPlatformHeader(lines, 'switch', id, entName, names[entType] || entType);
      if (slots.pwr) {
        pushStateBool(lines, baseIndent, slots.pwr);
        pushTurnOnOff(lines, baseIndent, 'switch', slots.pwr);
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
      attrs.flush(lines);
      break;
    }
    case 'air_purifier':
    case 'ceiling_fan':
    case 'fresh_air': {
      const names = { air_purifier: '空气净化器', ceiling_fan: '电风扇', fresh_air: '新风机' };
      buildPlatformHeader(lines, 'fan', id, entName, names[entType as keyof typeof names]);
      if (slots.pwr) {
        pushStateBool(lines, baseIndent, slots.pwr);
        pushTurnOnOff(lines, baseIndent, 'switch', slots.pwr);
      } else if (hasAnySlot(slots, ['fan', 'speedNum'])) {
        pushStateRaw(lines, baseIndent, 'on');
      }
      const fanEid = slots.fan || slots.speedNum;
      if (fanEid) {
        lines.push(`${baseIndent}percentage: "{{ state_attr('${fanEid}', 'percentage') }}"`);
        lines.push(`${baseIndent}set_percentage:`);
        pushAction(lines, baseIndent + '  ', 'fan.set_percentage', fanEid, { percentage: '{{ percentage }}' });
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
      attrs.flush(lines);
      break;
    }
    case 'air_conditioner':
    case 'floor_heating': {
      const label = entType === 'air_conditioner' ? '空调' : '地暖';
      buildPlatformHeader(lines, 'climate', id, entName, label);
      lines.push(`${baseIndent}hvac_modes: ["off", "heat", "cool"]`);
      if (slots.pwr) {
        pushStateRaw(
          lines,
          baseIndent,
          `{% if is_state('${slots.pwr}', 'on') %}${entType === 'floor_heating' ? 'heat' : 'cool'}{% else %}off{% endif %}`,
        );
        pushTurnOnOff(lines, baseIndent, 'switch', slots.pwr);
      }
      if (slots.temp) lines.push(`${baseIndent}current_temperature: "{{ states('${slots.temp}') }}"`);
      if (slots.setTemp) lines.push(`${baseIndent}temperature: "{{ states('${slots.setTemp}') }}"`);
      if (slots.roomTemp) attrs.pushState('room_temperature', slots.roomTemp);
      if (slots.mode) lines.push(`${baseIndent}preset_mode: "{{ states('${slots.mode}') }}"`);
      if (slots.fan) lines.push(`${baseIndent}fan_mode: "{{ states('${slots.fan}') }}"`);
      if (slots.swing) lines.push(`${baseIndent}swing_mode: "{{ is_state('${slots.swing}', 'on') }}"`);
      attrs.flush(lines);
      break;
    }
    case 'robot_vacuum': {
      buildPlatformHeader(lines, 'vacuum', id, entName, '扫地机器人');
      if (slots.state) {
        pushStateRaw(lines, baseIndent, `{{ states('${slots.state}') }}`);
      } else if (slots.pwr) {
        pushStateBool(lines, baseIndent, slots.pwr, 'cleaning', 'docked');
      }
      const startEid = slots.pwr || slots.state;
      if (startEid) {
        lines.push(`${baseIndent}start:`);
        pushAction(lines, baseIndent + '  ', 'vacuum.start', startEid);
        lines.push(`${baseIndent}stop:`);
        pushAction(lines, baseIndent + '  ', 'vacuum.stop', startEid);
      }
      const dockEid = slots.dock || slots.pwr;
      if (dockEid) {
        lines.push(`${baseIndent}return_to_base:`);
        pushAction(lines, baseIndent + '  ', 'vacuum.return_to_base', dockEid);
      }
      if (slots.battery) attrs.pushState('battery_level', slots.battery);
      if (slots.fan) attrs.pushState('fan_speed', slots.fan);
      attrs.flush(lines);
      break;
    }
    case 'smart_curtain': {
      buildPlatformHeader(lines, 'cover', id, entName, '电动窗帘');
      const motor = slots.motor || slots.position;
      if (motor) {
        if (slots.position) {
          lines.push(`${baseIndent}position: "{{ state_attr('${slots.position}', 'current_position') }}"`);
        }
        if (slots.motor) {
          pushStateRaw(lines, baseIndent, `{{ states('${slots.motor}') }}`);
        } else if (slots.position) {
          pushStateRaw(lines, baseIndent, `{{ state_attr('${slots.position}', 'current_position') }}`);
        }
        lines.push(`${baseIndent}open_cover:`);
        pushAction(lines, baseIndent + '  ', 'cover.open_cover', motor);
        lines.push(`${baseIndent}close_cover:`);
        pushAction(lines, baseIndent + '  ', 'cover.close_cover', motor);
        lines.push(`${baseIndent}stop_cover:`);
        pushAction(lines, baseIndent + '  ', 'cover.stop_cover', motor);
        if (slots.position) {
          lines.push(`${baseIndent}set_cover_position:`);
          pushAction(lines, baseIndent + '  ', 'cover.set_cover_position', motor, {
            position: '{{ position }}',
          });
        }
      }
      if (slots.pwr) attrs.pushBool('power', slots.pwr);
      if (slots.battery) attrs.pushState('battery', slots.battery);
      attrs.flush(lines);
      break;
    }
    case 'smart_lock': {
      buildPlatformHeader(lines, 'lock', id, entName, '智能门锁');
      if (slots.pwr) {
        pushStateRaw(lines, baseIndent, `{{ states('${slots.pwr}') }}`);
        lines.push(`${baseIndent}lock:`);
        pushAction(lines, baseIndent + '  ', 'lock.lock', slots.pwr);
        lines.push(`${baseIndent}unlock:`);
        pushAction(lines, baseIndent + '  ', 'lock.unlock', slots.pwr);
      }
      if (slots.battery) attrs.pushState('battery', slots.battery);
      if (slots.door) attrs.pushBool('door', slots.door);
      if (slots.unlockMethod) attrs.pushState('unlock_method', slots.unlockMethod);
      attrs.flush(lines);
      break;
    }
    case 'tv': {
      buildPlatformHeader(lines, 'media_player', id, entName, '电视');
      if (slots.pwr) {
        pushStateBool(lines, baseIndent, slots.pwr, 'playing', 'off');
        pushTurnOnOff(lines, baseIndent, 'switch', slots.pwr);
      }
      if (slots.volume) {
        lines.push(`${baseIndent}volume_level: "{{ state_attr('${slots.volume}', 'volume_level') }}"`);
        lines.push(`${baseIndent}volume_set:`);
        pushAction(lines, baseIndent + '  ', 'media_player.volume_set', slots.volume, {
          volume_level: '{{ volume_level }}',
        });
      }
      if (slots.source) attrs.pushState('source', slots.source);
      if (slots.app) attrs.pushState('app', slots.app);
      attrs.flush(lines);
      break;
    }
    case 'water_heater': {
      buildPlatformHeader(lines, 'water_heater', id, entName, '热水器');
      if (slots.pwr) {
        pushStateRaw(lines, baseIndent, `{% if is_state('${slots.pwr}', 'on') %}heat{% else %}off{% endif %}`);
        pushTurnOnOff(lines, baseIndent, 'switch', slots.pwr);
      } else if (slots.state) {
        pushStateRaw(lines, baseIndent, `{{ states('${slots.state}') }}`);
      }
      if (slots.temp) lines.push(`${baseIndent}current_temperature: "{{ states('${slots.temp}') }}"`);
      if (slots.setTemp) {
        lines.push(`${baseIndent}temperature: "{{ states('${slots.setTemp}') }}"`);
        lines.push(`${baseIndent}set_temperature:`);
        pushAction(lines, baseIndent + '  ', 'number.set_value', slots.setTemp, { value: '{{ temperature }}' });
      }
      if (slots.mode) {
        lines.push(`${baseIndent}operation_mode: "{{ states('${slots.mode}') }}"`);
        lines.push(`${baseIndent}set_operation_mode:`);
        pushAction(lines, baseIndent + '  ', 'select.select_option', slots.mode, {
          option: '{{ operation_mode }}',
        });
      }
      if (slots.state && !slots.pwr) attrs.pushState('status', slots.state);
      attrs.flush(lines);
      break;
    }
    case 'humidifier_ha': {
      buildPlatformHeader(lines, 'humidifier', id, entName, '加湿器');
      if (slots.pwr) {
        pushStateBool(lines, baseIndent, slots.pwr);
        pushTurnOnOff(lines, baseIndent, 'switch', slots.pwr);
      }
      if (slots.humidity) lines.push(`${baseIndent}current_humidity: "{{ states('${slots.humidity}') }}"`);
      if (slots.setHumidity) {
        lines.push(`${baseIndent}humidity: "{{ states('${slots.setHumidity}') }}"`);
        lines.push(`${baseIndent}set_humidity:`);
        pushAction(lines, baseIndent + '  ', 'number.set_value', slots.setHumidity, { value: '{{ humidity }}' });
      }
      if (slots.mode) {
        lines.push(`${baseIndent}mode: "{{ states('${slots.mode}') }}"`);
        lines.push(`${baseIndent}set_mode:`);
        pushAction(lines, baseIndent + '  ', 'select.select_option', slots.mode, { option: '{{ mode }}' });
      }
      if (slots.fan) attrs.pushState('fan_mode', slots.fan);
      attrs.flush(lines);
      break;
    }
    default:
      return '# 不支持的家电类型';
  }

  appendCustomSlots(lines, slots, knownKeys, slotsList);
  pushExtras(lines, input);

  const joined = lines.join('\n');
  if (
    !hasAnySlot(slots, [...knownKeys]) &&
    !slotsList.some((slot) => slots[slot._key || slot.key]?.trim())
  ) {
    return joined;
  }
  return joined;
}
