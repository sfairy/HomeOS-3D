/**
 * @file slot-parse.ts
 * @module @homeos/shared/template
 * @brief 家电 template YAML → 槽位 entity_id 反向解析（编辑 / 导入补全槽位）。
 *
 * 职责：
 *  - 从 YAML 文本提取所有引用的 entity_id（extractEntityIdsFromTemplateYaml）；
 *  - 按 attributes 字段名 / climate 顶层字段 / 主 state 块 / pwr 动作块等
 *    多种正则模式反向匹配槽位 key → entity_id（mapYamlToSlotsByKey）；
 *  - 支持按家电类型覆盖 attributes 字段映射（如冰箱 temperature → fridgeTemp）；
 *  - 槽位优先按 key 命中，未命中再按 domain 兜底匹配剩余 entity_id。
 *
 * 关键依赖：
 *  - entity/domain 提供 getEntityDomain 校验槽位 domain 一致性；
 *  - appliance-type-infer 调用 mapYamlToSlotsByKey 反向解析槽位。
 *
 * 约定：
 *  - 同一 entity_id 只能绑定到一个槽位（used 集合去重）；
 *  - tryAssign 要求槽位 def 的 domain 与 entity_id 的 domain 一致才赋值；
 *  - 正则均忽略大小写 / 多行，匹配首个命中即停止该槽位。
 */
import { getEntityDomain } from '../entity/domain';

/**
 * slot-parse 反向解析使用的「最小槽位定义形状」：只需要 key（匹配字段）和 domain（校验 entity_id 域）两个字段。
 * 与 ApplianceSlotDef 兼容（子集），供 mapYamlToSlotsByKey 等反向解析函数传参使用。
 */
export interface TemplateSlotDef {
  key: string;    /** 槽位英文 key（如 pwr / fan / temp），唯一 */
  domain: string; /** 匹配的 HA entity domain（switch / sensor / fan / climate 等） */
}

const ENTITY_REF_RE = /(?:states|is_state|state_attr)\s*\(\s*['"]([^'"]+)['"]/g;
const ENTITY_ID_LINE_RE = /entity_id:\s*['"]?([a-z][a-z0-9_]*\.[a-z0-9_]+)['"]?/gi;
/** entity_id: 下列表项（HA 常见写法） */
const ENTITY_ID_LIST_BLOCK_RE =
  /entity_id:\s*(?:\n[ \t]*-[ \t]*['"]?([a-z][a-z0-9_]*\.[a-z0-9_]+)['"]?)+/gi;
const ENTITY_ID_LIST_ITEM_RE = /[ \t]*-[ \t]*['"]?([a-z][a-z0-9_]*\.[a-z0-9_]+)['"]?/gi;

/** YAML attributes 字段名 → 槽位 key */
const ATTRIBUTE_TO_SLOT: Record<string, string> = {
  remaining_time: 'remain',
  target_temperature: 'setTemp',
  set_temperature: 'setTemp',
  room_temperature: 'roomTemp',
  filter_life: 'filter',
  preset_mode: 'mode',
  fan_speed: 'fan',
  battery_level: 'battery',
  child_lock: 'childLock',
  tank_full: 'tank',
  door_open: 'door',
  door: 'door',
  freezer_temp: 'freezerTemp',
  pm25: 'pm25',
  humidity: 'humidity',
  target_humidity: 'setHumidity',
  tds: 'tds',
  status: 'state',
  speed: 'speed',
  energy: 'energy',
  voltage: 'voltage',
  current: 'current',
  unlock_method: 'unlockMethod',
  source: 'source',
  app: 'app',
  co2: 'co2',
  time: 'time',
  light: 'light',
  power: 'power',
};

/** 按家电类型覆盖 attributes 字段映射 */
const TYPE_ATTRIBUTE_OVERRIDES: Record<string, Record<string, string>> = {
  refrigerator: { temperature: 'fridgeTemp' },
  oven: { temperature: 'temp' },
  smart_plug: { power: 'power' },
};

/** climate / 顶层 template 字段 → 槽位 key */
const TOP_LEVEL_FIELD_TO_SLOT: Record<string, string> = {
  current_temperature: 'temp',
  temperature: 'setTemp',
  current_humidity: 'humidity',
  humidity: 'setHumidity',
  operation_mode: 'mode',
  preset_mode: 'mode',
  fan_mode: 'fan',
  swing_mode: 'swing',
  percentage: 'fan',
  position: 'position',
  volume_level: 'volume',
};

/** 从 YAML 文本提取引用的 entity_id */
export function extractEntityIdsFromTemplateYaml(yamlStr: string): string[] {
  const seen = new Set<string>();
  const add = (id: string) => {
    const clean = String(id || '')
      .replace(/['"]/g, '')
      .trim();
    if (!clean.includes('.') || seen.has(clean)) return;
    seen.add(clean);
  };
  for (const m of yamlStr.matchAll(ENTITY_ID_LINE_RE)) add(m[1]);
  for (const block of yamlStr.matchAll(ENTITY_ID_LIST_BLOCK_RE)) {
    const chunk = block[0] || '';
    for (const item of chunk.matchAll(ENTITY_ID_LIST_ITEM_RE)) add(item[1]);
  }
  for (const m of yamlStr.matchAll(ENTITY_REF_RE)) add(m[1]);
  return [...seen];
}

function resolveAttrSlotKey(attrKey: string, typeId?: string): string {
  const typeOverride = typeId ? TYPE_ATTRIBUTE_OVERRIDES[typeId]?.[attrKey] : undefined;
  return typeOverride || ATTRIBUTE_TO_SLOT[attrKey] || attrKey;
}

function tryAssign(
  slots: Record<string, string>,
  used: Set<string>,
  slotDefs: TemplateSlotDef[],
  key: string,
  entityId: string,
) {
  if (!entityId || used.has(entityId)) return;
  const def = slotDefs.find((d) => d.key === key);
  if (!def) return;
  if (getEntityDomain(entityId) !== def.domain) return;
  slots[key] = entityId;
  used.add(entityId);
}

function parseAttributesBlock(
  yamlStr: string,
  slotDefs: TemplateSlotDef[],
  slots: Record<string, string>,
  used: Set<string>,
  typeId?: string,
) {
  const attrMatch = yamlStr.match(/attributes:\s*\n((?:[ \t]+.+\n?)+)/i);
  const attrSection = attrMatch?.[1];
  if (!attrSection) return;

  const attrLineRe = /^\s+([a-z_]+):\s*"\{\{\s*(?:states|is_state|state_attr)\('([^']+)'/gim;
  for (const m of attrSection.matchAll(attrLineRe)) {
    const slotKey = resolveAttrSlotKey(m[1], typeId);
    tryAssign(slots, used, slotDefs, slotKey, m[2]);
  }
}

function parseTopLevelFields(
  yamlStr: string,
  slotDefs: TemplateSlotDef[],
  slots: Record<string, string>,
  used: Set<string>,
) {
  for (const [field, slotKey] of Object.entries(TOP_LEVEL_FIELD_TO_SLOT)) {
    if (slots[slotKey]) continue;
    const def = slotDefs.find((d) => d.key === slotKey);
    if (!def) continue;

    if (field === 'swing_mode') {
      const m = yamlStr.match(/^\s+swing_mode:\s*"\{\{\s*is_state\('([^']+)'/im);
      if (m?.[1]) tryAssign(slots, used, slotDefs, slotKey, m[1]);
      continue;
    }

    const m = yamlStr.match(new RegExp(`^\\s+${field}:\\s*"\\{\\{\\s*states\\('([^']+)'`, 'im'));
    if (m?.[1]) tryAssign(slots, used, slotDefs, slotKey, m[1]);
  }
}

function parseMainStateBlock(
  yamlStr: string,
  slotDefs: TemplateSlotDef[],
  slots: Record<string, string>,
  used: Set<string>,
) {
  if (slots.state) return;
  const def = slotDefs.find((d) => d.key === 'state');
  if (!def) return;

  const patterns = [
    /^\s+state:\s*>\s*\n\s*\{\{\s*states\('([^']+)'/im,
    /^\s+state:\s*"\{\{\s*states\('([^']+)'/im,
    /^\s+state:\s*>\s*\n\s*\{%\s*if[^%]*states\('([^']+)'/im,
  ];
  for (const re of patterns) {
    const m = yamlStr.match(re);
    if (m?.[1]) {
      tryAssign(slots, used, slotDefs, 'state', m[1]);
      return;
    }
  }
}

function parseFridgeMainState(
  yamlStr: string,
  slotDefs: TemplateSlotDef[],
  slots: Record<string, string>,
  used: Set<string>,
) {
  if (slots.fridgeTemp || slots.freezerTemp) return;
  const def = slotDefs.find((d) => d.key === 'fridgeTemp' || d.key === 'freezerTemp');
  if (!def) return;

  const m =
    yamlStr.match(/^\s+state:\s*>\s*\n\s*\{\{\s*states\('([^']+)'/im) ||
    yamlStr.match(/^\s+state:\s*"\{\{\s*states\('([^']+)'/im);
  if (!m?.[1]) return;

  if (def.key === 'fridgeTemp') tryAssign(slots, used, slotDefs, 'fridgeTemp', m[1]);
  else tryAssign(slots, used, slotDefs, 'freezerTemp', m[1]);
}

/**
 * 按槽位 key 在 YAML 上下文中反向解析 entity_id（优先于纯 domain 匹配）
 */
export function mapYamlToSlotsByKey(
  yamlStr: string,
  slotDefs: TemplateSlotDef[],
  typeId?: string,
): Record<string, string> {
  const slots: Record<string, string> = {};
  if (!yamlStr?.trim() || !slotDefs?.length) return slots;

  const used = new Set<string>();

  const tryAssignKey = (key: string, entityId: string) => {
    tryAssign(slots, used, slotDefs, key, entityId);
  };

  for (const def of slotDefs) {
    const key = def.key;
    const patterns: RegExp[] = [];

    if (key === 'pwr') {
      patterns.push(
        new RegExp(
          `turn_on:[\\s\\S]*?entity_id:\\s*['"]?([a-z][a-z0-9_]*\\.${def.domain === 'switch' ? 'switch' : '[a-z0-9_]+'}[a-z0-9_.]*)['"]?`,
          'i',
        ),
        new RegExp(
          `- action:\\s*(?:switch|${def.domain})\\.turn_on[\\s\\S]*?entity_id:\\s*['"]?([a-z][a-z0-9_]*\\.[a-z0-9_.]+)['"]?`,
          'i',
        ),
        new RegExp(`is_state\\(\\s*['"]([a-z][a-z0-9_]*\\.${def.domain}[a-z0-9_.]*)['"]`, 'gi'),
      );
      if (def.domain === 'lock') {
        patterns.push(/lock:[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.lock[a-z0-9_.]*)['"]?/i);
        patterns.push(
          /- action:\s*lock\.lock[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.lock[a-z0-9_.]*)['"]?/i,
        );
      }
    }
    if (key === 'fan' || key === 'speedNum') {
      patterns.push(
        /set_percentage:[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.fan[a-z0-9_.]*)['"]?/i,
      );
      patterns.push(
        /- action:\s*fan\.set_percentage[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.fan[a-z0-9_.]*)['"]?/i,
      );
      patterns.push(/state_attr\(\s*['"]([a-z][a-z0-9_]*\.fan[a-z0-9_.]*)['"]/gi);
      patterns.push(/^\s+percentage:\s*"\{\{\s*state_attr\('([^']+)'/im);
    }
    if (key === 'light') {
      patterns.push(
        /- action:\s*light\.turn_on[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.light[a-z0-9_.]*)['"]?/i,
      );
      patterns.push(/entity_id:\s*['"]?([a-z][a-z0-9_]*\.light[a-z0-9_.]*)['"]?/gi);
    }
    if (key === 'volume') {
      patterns.push(
        /volume_set:[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.media_player[a-z0-9_.]*)['"]?/i,
      );
      patterns.push(
        /- action:\s*media_player\.volume_set[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.media_player[a-z0-9_.]*)['"]?/i,
      );
      patterns.push(/^\s+volume_level:\s*"\{\{\s*state_attr\('([^']+)'/im);
    }
    if (key === 'motor' || key === 'position') {
      patterns.push(
        /open_cover:[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.cover[a-z0-9_.]*)['"]?/i,
      );
      patterns.push(
        /- action:\s*cover\.open_cover[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.cover[a-z0-9_.]*)['"]?/i,
      );
      patterns.push(/position:\s*"\{\{\s*state_attr\('([^']+)'/i);
    }
    if (key === 'dock') {
      patterns.push(
        /return_to_base:[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.[a-z0-9_.]+)['"]?/i,
      );
      patterns.push(
        /- action:\s*vacuum\.return_to_base[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.[a-z0-9_.]+)['"]?/i,
      );
    }
    if (key === 'state') {
      patterns.push(/^\s+state:\s*>\s*\n\s*\{\{\s*states\('([^']+)'/im);
      patterns.push(/^\s+state:\s*"\{\{\s*states\('([^']+)'/im);
    }
    if (key === 'temp' && typeId !== 'refrigerator') {
      patterns.push(/^\s+current_temperature:\s*"\{\{\s*states\('([^']+)'/im);
    }
    if (key === 'setHumidity') {
      patterns.push(/^\s+humidity:\s*"\{\{\s*states\('([^']+)'/im);
      patterns.push(
        /set_humidity:[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.number[a-z0-9_.]*)['"]?/i,
      );
    }
    if (key === 'setTemp') {
      patterns.push(/^\s+temperature:\s*"\{\{\s*states\('([^']+)'/im);
      patterns.push(
        /set_temperature:[\s\S]*?entity_id:\s*['"]?([a-z][a-z0-9_]*\.number[a-z0-9_.]*)['"]?/i,
      );
    }
    if (key === 'mode' && typeId === 'water_heater') {
      patterns.push(/^\s+operation_mode:\s*"\{\{\s*states\('([^']+)'/im);
    }
    if (key === 'fridgeTemp' || key === 'freezerTemp') {
      patterns.push(/^\s+state:\s*>\s*\n\s*\{\{\s*states\('([^']+)'/im);
      patterns.push(/^\s+state:\s*"\{\{\s*states\('([^']+)'/im);
    }

    const attrKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    patterns.push(new RegExp(`${attrKey}:\\s*"\\{\\{\\s*states\\('([^']+)'`, 'i'));
    patterns.push(new RegExp(`\\s${attrKey}:\\s*"\\{\\{\\s*states\\('([^']+)'`, 'i'));
    patterns.push(new RegExp(`states\\('([a-z][a-z0-9_]*\\.${def.domain}[a-z0-9_.]*)'\\)`, 'gi'));

    for (const re of patterns) {
      const m = yamlStr.match(re);
      if (m?.[1]) {
        tryAssignKey(key, m[1]);
        break;
      }
    }
  }

  parseAttributesBlock(yamlStr, slotDefs, slots, used, typeId);
  parseTopLevelFields(yamlStr, slotDefs, slots, used);
  parseMainStateBlock(yamlStr, slotDefs, slots, used);
  if (typeId === 'refrigerator') parseFridgeMainState(yamlStr, slotDefs, slots, used);

  const entityIds = extractEntityIdsFromTemplateYaml(yamlStr);
  for (const def of slotDefs) {
    if (slots[def.key]) continue;
    const match = entityIds.find((id) => !used.has(id) && getEntityDomain(id) === def.domain);
    if (match) {
      slots[def.key] = match;
      used.add(match);
    }
  }

  return slots;
}
