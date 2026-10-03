/**
 * @file appliance-type-infer.ts
 * @module @homeos/shared/template
 * @brief 家电模板实体类型推断与槽位反向解析（编辑 / 导入共用）。
 *
 * 职责：
 *  - 从 YAML / 名称 / unique_id 推断模板实体类型（trigger_sensor / 家电类型 / yaml_import）；
 *  - 识别"占位 stub + 功率类命名"避免误判为洗衣机等 platform 默认；
 *  - 推断类型后从 YAML 反向解析槽位 mapping（inferTemplateEntityImportMeta）；
 *  - 合并 slotMapping 与 YAML 反向解析补全槽位（hydrateTemplateEntitySlots）。
 *
 * 关键依赖：
 *  - appliance-catalog 提供类型目录 / 内置槽位 / 类型 id 集合；
 *  - yaml-blocks 提供 trigger-based 判定与首个平台实体项提取；
 *  - slot-schema 提供 payload 归一化与槽位恢复；
 *  - slot-parse 提供 mapYamlToSlotsByKey 反向解析；
 *  - yaml/ha-yaml 提供 YAML 解析。
 *
 * 约定：
 *  - 推断优先级：storedType(trigger_sensor) > 占位stub+功率命名 > storedType(家电) >
 *    trigger-based > 家电聚合 YAML 平台推断 > 关键词命中 > 兜底 storedType/yaml_import；
 *  - 裸 sensor stub 禁止默认成洗衣机，须有关键词或家电聚合 YAML 特征；
 *  - 电视功率/状态类命名（含拼音 dian_shi）归为 trigger_sensor。
 */
import { loadHaYamlObject } from '../yaml/ha-yaml';
import { APPLIANCE_TYPE_IDS, APPLIANCE_TYPES, getBuiltinSlots } from './appliance-catalog';
import {
  extractFirstTemplateItemFromParsed,
  isTriggerBasedTemplateParsed,
} from './yaml-blocks';
import { buildSlotPayload, normalizeSlotPayload, restoreSlotsFromPayload } from './slot-schema';
import { mapYamlToSlotsByKey } from './slot-parse';

const CN_APPLIANCE_HINTS: Array<[string, string]> = [
  ['吸油烟', 'range_hood'],
  ['油烟', 'range_hood'],
  ['洗衣', 'washing_machine'],
  ['烘干', 'dryer'],
  ['冰箱', 'refrigerator'],
  ['烤箱', 'oven'],
  ['蒸烤', 'oven'],
  ['洗碗', 'dishwasher'],
  ['净水', 'water_purifier'],
  ['管线', 'water_dispenser'],
  ['饮水', 'water_dispenser'],
  ['空气净化', 'air_purifier'],
  ['净化器', 'air_purifier'],
  ['空调', 'air_conditioner'],
  ['扫地', 'robot_vacuum'],
  ['除湿', 'dehumidifier'],
  ['加湿', 'humidifier_ha'],
  ['热水器', 'water_heater'],
  ['壁挂炉', 'water_heater'],
  ['风扇', 'ceiling_fan'],
  ['吊扇', 'ceiling_fan'],
  ['窗帘', 'smart_curtain'],
  ['门锁', 'smart_lock'],
  ['电视', 'tv'],
  ['dian_shi', 'tv'],
  ['dianshi', 'tv'],
  ['微波', 'microwave'],
  ['电饭', 'rice_cooker'],
  ['新风', 'fresh_air'],
  ['地暖', 'floor_heating'],
  ['插座', 'smart_plug'],
  ['排插', 'smart_plug'],
];

/** HA 未返回原文时的占位 stub（无 trigger 段，不能按 platform 默认成洗衣机等） */
function isStubOrIncompleteYaml(yamlStr: string): boolean {
  return /占位片段|占位：HA 未返回|#\s*占位/.test(yamlStr);
}

const PLATFORM_CANDIDATES: Record<string, string[]> = {
  fan: ['range_hood', 'air_purifier', 'ceiling_fan', 'fresh_air'],
  media_player: ['tv'],
  vacuum: ['robot_vacuum'],
  cover: ['smart_curtain'],
  lock: ['smart_lock'],
  climate: ['air_conditioner', 'floor_heating'],
  water_heater: ['water_heater'],
  humidifier: ['humidifier_ha'],
  switch: [
    'dishwasher',
    'water_purifier',
    'water_dispenser',
    'smart_plug',
    'microwave',
    'rice_cooker',
    'dehumidifier',
  ],
  sensor: ['washing_machine', 'dryer', 'refrigerator', 'oven'],
};

function isTriggerPowerSensorHint(uniqueId: string, name: string): boolean {
  const hay = `${uniqueId} ${name}`.toLowerCase();
  if (/power_state|_power_|electric_power|功率|开关状态|threshold/.test(hay)) return true;
  // 电视功率/状态类命名（含拼音 dian_shi），常见于 trigger-based template sensor
  if (/电视|dian_shi|dianshi|(^|[^a-z])tv([^a-z]|$)/.test(hay)) return true;
  return false;
}

/**
 * 根据实体 unique_id + 名称（中英文）做家电类型关键词猜测：先排除功率/电视类触发传感器命名，再按 CN_APPLIANCE_HINTS 与家电 ID 子串命中识别。
 *
 * @param uniqueId 实体 unique_id（可空，默认空串）
 * @param name     实体名称（可空，默认空串）
 * @returns 命中时返回家电类型 ID（如 range_hood / air_conditioner）；未命中或匹配到功率命名特征时返回空串
 */
export function inferAppTypeFromHints(uniqueId = '', name = ''): string {
  const raw = `${uniqueId} ${name}`;
  const hay = raw.toLowerCase();
  if (isTriggerPowerSensorHint(uniqueId, name)) return '';
  for (const [cn, type] of CN_APPLIANCE_HINTS) {
    if (type === 'tv' && isTriggerPowerSensorHint(uniqueId, name)) continue;
    if (hay.includes(cn.toLowerCase()) || raw.includes(cn)) return type;
  }
  for (const id of APPLIANCE_TYPE_IDS) {
    if (id === 'tv' && isTriggerPowerSensorHint(uniqueId, name)) continue;
    if (hay.includes(id)) return id;
  }
  return '';
}

function isApplianceCompositeYaml(yamlStr: string): boolean {
  if (!yamlStr?.trim()) return false;
  if (/\btrigger\s*:/m.test(yamlStr)) return false;
  if (
    /turn_on:|turn_off:|set_percentage:|open_cover:|volume_set:|start:|return_to_base:|- action:/m.test(
      yamlStr,
    )
  ) {
    return true;
  }
  if (/service:\s*[a-z_]+\.[a-z_]+/m.test(yamlStr)) return true;
  try {
    const parsed = loadHaYamlObject(yamlStr) as Record<string, unknown>;
    const hit = extractFirstTemplateItemFromParsed(parsed);
    const compositePlatforms = new Set([
      'fan',
      'climate',
      'switch',
      'vacuum',
      'cover',
      'lock',
      'media_player',
      'water_heater',
      'humidifier',
    ]);
    if (!hit?.platform || !compositePlatforms.has(hit.platform)) return false;
    const entityCount = (yamlStr.match(/entity_id:/g) || []).length;
    return entityCount >= 2;
  } catch {
    return false;
  }
}

function inferFromPlatform(
  platform: string,
  uniqueId: string,
  name: string,
  yamlStr: string,
): string {
  const candidates = PLATFORM_CANDIDATES[platform];
  if (!candidates?.length) return '';
  const byHint = inferAppTypeFromHints(uniqueId, name);
  if (byHint && candidates.includes(byHint)) return byHint;
  const hay = `${uniqueId} ${name} ${yamlStr}`.toLowerCase();
  if (platform === 'fan') {
    if (/pm25|油烟|hood|range/.test(hay)) return 'range_hood';
    if (/filter|净化|purifier/.test(hay)) return 'air_purifier';
    if (/ceiling|吊扇/.test(hay)) return 'ceiling_fan';
    if (/新风|fresh/.test(hay)) return 'fresh_air';
    return candidates[0];
  }
  if (platform === 'switch') {
    if (/child_lock|energy|voltage|current|插座|排插/.test(hay)) return 'smart_plug';
    if (/tds|净水/.test(hay)) return 'water_purifier';
    if (/微波|microwave/.test(hay)) return 'microwave';
    if (/洗碗|dishwasher/.test(hay)) return 'dishwasher';
    if (/管线|饮水|dispenser/.test(hay)) return 'water_dispenser';
    if (/除湿|dehumid|tank_full|humidity/.test(hay)) return 'dehumidifier';
    if (/电饭|rice/.test(hay)) return 'rice_cooker';
  }
  if (platform === 'climate') {
    if (/空调|air_condition|cool|heat/.test(hay)) return 'air_conditioner';
    if (/地暖|floor/.test(hay)) return 'floor_heating';
  }
  if (platform === 'water_heater') {
    if (/壁挂|boiler|gas|热水器|water_heater/.test(hay)) return 'water_heater';
    return 'water_heater';
  }
  if (platform === 'humidifier') {
    if (/除湿|dehumid|tank/.test(hay)) return 'dehumidifier';
    return 'humidifier_ha';
  }
  if (platform === 'sensor') {
    // sensor 平台候选很多，禁止无关键词时默认成 washing_machine
    if (/冰箱|fridge|freezer|refrigerat/.test(hay)) return 'refrigerator';
    if (/烤箱|oven/.test(hay)) return 'oven';
    if (/洗衣|wash|washing/.test(hay)) return 'washing_machine';
    if (/烘干|dryer/.test(hay)) return 'dryer';
    return '';
  }
  const catalogMatch = APPLIANCE_TYPES.filter((t) => t.platform === platform);
  if (catalogMatch.length === 1) return catalogMatch[0].id;
  return candidates[0] || '';
}

/**
 * inferTemplateEntityType 的可选参数：注入已存储的类型 / unique_id / 实体名称 作为推断附加提示（优先级比 YAML 高）。
 */
export interface InferTemplateEntityTypeOptions {
  storedType?: string; /** DB 已保存的模板类型（若非空且合法家电，直接沿用） */
  uniqueId?: string;   /** 实体 unique_id 用于功率类 stub 命名识别 */
  entName?: string;    /** 实体名称用于中文关键词推断 */
}

/** 从 YAML / 名称 / unique_id 推断模板实体类型 */
export function inferTemplateEntityType(
  yamlStr: string,
  opts: InferTemplateEntityTypeOptions = {},
): string {
  const stored = opts.storedType || '';
  if (stored === 'trigger_sensor') return 'trigger_sensor';

  const trimmed = yamlStr?.trim();
  const uniqueHint = opts.uniqueId || '';
  const nameHint = opts.entName || '';

  // 占位 stub + 功率/电视类命名 → 触发式传感器（勿落到洗衣机等 platform 默认）
  if (
    trimmed &&
    isStubOrIncompleteYaml(trimmed) &&
    isTriggerPowerSensorHint(uniqueHint, nameHint)
  ) {
    return 'trigger_sensor';
  }

  if (stored && stored !== 'yaml_import' && APPLIANCE_TYPE_IDS.has(stored)) return stored;

  if (!trimmed) return stored || 'yaml_import';

  let parsed: Record<string, unknown>;
  try {
    parsed = loadHaYamlObject(trimmed) as Record<string, unknown>;
  } catch {
    return stored || 'yaml_import';
  }

  if (isTriggerBasedTemplateParsed(parsed, trimmed)) return 'trigger_sensor';

  const hit = extractFirstTemplateItemFromParsed(parsed);
  const platform = hit?.platform || '';
  const uniqueId = uniqueHint || String(hit?.item?.unique_id || '');
  const entName = nameHint || String(hit?.item?.name || '');

  if (isStubOrIncompleteYaml(trimmed) && isTriggerPowerSensorHint(uniqueId, entName)) {
    return 'trigger_sensor';
  }

  const fromHint = inferAppTypeFromHints(uniqueId, entName);
  if (fromHint && (isApplianceCompositeYaml(trimmed) || platform === 'media_player'))
    return fromHint;

  // 仅在确认为家电聚合 YAML 时按 platform 推断；裸 sensor stub 不得默认洗衣机
  if (platform && isApplianceCompositeYaml(trimmed)) {
    const fromPlatform = inferFromPlatform(platform, uniqueId, entName, trimmed);
    if (fromPlatform) return fromPlatform;
  }

  if (fromHint && platform !== 'sensor') return fromHint;
  if (isTriggerPowerSensorHint(uniqueId, entName) && (platform === 'sensor' || platform === 'binary_sensor')) {
    return 'trigger_sensor';
  }
  return stored || 'yaml_import';
}

/** 推断类型并从 YAML 反向解析槽位 mapping */
export function inferTemplateEntityImportMeta(
  yamlStr: string,
  opts: InferTemplateEntityTypeOptions = {},
): { type: string; slotMapping?: ReturnType<typeof buildSlotPayload> } {
  const type = inferTemplateEntityType(yamlStr, opts);
  if (!APPLIANCE_TYPE_IDS.has(type)) {
    return { type };
  }
  const slots = getBuiltinSlots(type);
  const mapping = mapYamlToSlotsByKey(yamlStr, slots, type);
  if (!Object.keys(mapping).length) {
    return { type };
  }
  return {
    type,
    slotMapping: buildSlotPayload(
      mapping,
      slots.map((s) => ({ ...s, _key: s.key })),
    ),
  };
}

/** 编辑/导入：合并 slotMapping 与 YAML 反向解析，补全槽位 */
export function hydrateTemplateEntitySlots(
  typeId: string,
  yamlStr: string,
  slotMapping?: unknown,
  opts: InferTemplateEntityTypeOptions = {},
) {
  let payload = slotMapping;
  const normalized = normalizeSlotPayload(payload);
  if (!Object.keys(normalized.mapping).length && yamlStr?.trim()) {
    const inferred = inferTemplateEntityImportMeta(yamlStr, { ...opts, storedType: typeId });
    if (inferred.slotMapping) payload = inferred.slotMapping;
  }

  const restored = restoreSlotsFromPayload(payload, typeId);
  const fromYaml = mapYamlToSlotsByKey(yamlStr, getBuiltinSlots(typeId), typeId);
  const slots = { ...fromYaml, ...restored.slots };

  return { slotsList: restored.slotsList, slots };
}
