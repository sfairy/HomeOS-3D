/**
 * @file catalog.ts
 * @module @homeos/shared/room
 * @brief 全屋默认房间目录与环境传感器映射（前后端单一真相源）。
 *
 * 职责：
 *  - 维护"房间 ID → 中文标签 / emoji / 语音关键词 / 推断关键词 / HA area 匹配模式"的目录；
 *  - 提供 EnvSensorMapEntry 结构（环境传感器到房间的绑定）；
 *  - 暴露按 area / 语音 / 关键词推断房间 ID 的工具函数。
 *
 * 关键依赖：
 *  - 语音控制 / Widget 卡片 / 环境健康页均按本目录渲染房间标签与图标；
 *  - ha-area-env-map.ts 反查 HA area_registry 与本目录的对应关系。
 *
 * 约定：
 *  - fixed: true 的房间不可被用户删除（基础房间）；
 *  - _hidden: true 的 env 条目仅用于绑定，不展示在房间列表；
 *  - inferKeywords 用于从 entity_id 反推房间，voiceKeywords 用于语音解析。
 */

/**
 * 单个房间目录条目。
 */
export interface RoomCatalogEntry {
  /** 房间 ID（如 "living" / "master_bedroom"） */
  id: string;
  /** 默认中文标签（如 "客厅"） */
  defaultLabel: string;
  /** 是否为固定房间（不可删除） */
  fixed: boolean;
  /** emoji 图标 */
  emoji: string;
  /** 语音控制关键词（含中英文） */
  voiceKeywords: string[];
  /** entity_id 推断关键词 */
  inferKeywords: string[];
  /** HA area_registry 名称匹配模式 */
  areaPatterns: string[];
  /** 设备分组 key（用于按房间聚合设备列表） */
  deviceGroupKey: string;
}

/** 全屋默认房间目录 — 环境映射 / 语音 / Widget 推断的统一来源 */
export const DEFAULT_ROOM_CATALOG: readonly RoomCatalogEntry[] = [
  {
    id: 'living',
    defaultLabel: '客厅',
    fixed: true,
    emoji: '🛋️',
    voiceKeywords: ['客厅', 'living', 'living_room', 'lounge', '起居室', '大厅'],
    inferKeywords: ['living', '客厅', 'living_room', 'lounge', '起居室', '大厅'],
    areaPatterns: ['living room', 'living', '客厅'],
    deviceGroupKey: 'living',
  },
  {
    id: 'dining',
    defaultLabel: '餐厅',
    fixed: true,
    emoji: '🍽️',
    voiceKeywords: ['餐厅', 'dining', 'dining_room', '饭厅'],
    inferKeywords: ['dining', '餐厅', 'dining_room', '饭厅'],
    areaPatterns: ['dining room', 'dining', '餐厅'],
    deviceGroupKey: 'dining',
  },
  {
    id: 'master_bedroom',
    defaultLabel: '主卧',
    fixed: true,
    emoji: '🛏️',
    voiceKeywords: ['主卧', 'master_bed', 'master_bedroom', '主卧室', '主人房'],
    inferKeywords: ['master_bed', 'master_bedroom', '主卧', '主卧室', '主人房'],
    areaPatterns: ['master bedroom', '主卧', '主卧室', 'bedroom'],
    deviceGroupKey: 'masterBed',
  },
  {
    id: 'elder_bedroom',
    defaultLabel: '老人房',
    fixed: true,
    emoji: '🛏️',
    voiceKeywords: ['老人', '老人房', 'elder', 'elderly', '父母', '父母房', '长辈房'],
    inferKeywords: [
      'elder',
      'elderly',
      '老人',
      '老人房',
      '父母',
      '父母房',
      '长辈房',
      'lao_ren',
      'lao_ren_fang',
      'laoren',
    ],
    areaPatterns: ['elder room', '老人房', 'lao ren fang', 'lao_ren_fang'],
    deviceGroupKey: 'elder',
  },
  {
    id: 'kids_bedroom',
    defaultLabel: '儿童房',
    fixed: true,
    emoji: '🛏️',
    voiceKeywords: ['儿童', '儿童房', 'kids', 'child', 'nursery', '婴儿房', '小孩房'],
    inferKeywords: ['kids', 'child', '儿童', '儿童房', 'nursery', '婴儿房', '小孩房'],
    areaPatterns: ['kids room', 'children', '儿童房'],
    deviceGroupKey: 'child',
  },
  {
    id: 'master_bath',
    defaultLabel: '主卫',
    fixed: true,
    emoji: '🛁',
    voiceKeywords: ['主卫', 'master_bath', 'master_bathroom', '主卫生间', '主卧卫生间'],
    inferKeywords: ['master_bath', 'master_bathroom', '主卫', '主卫生间', '主卧卫生间'],
    areaPatterns: ['master bathroom', '主卫', '主卫生间'],
    deviceGroupKey: 'masterBath',
  },
  {
    id: 'guest_bath',
    defaultLabel: '客卫',
    fixed: true,
    emoji: '🛁',
    voiceKeywords: ['客卫', '公卫', '次卫', 'guest_bath', 'guest_bathroom', '客用卫生间'],
    inferKeywords: ['guest_bath', 'guest_bathroom', '客卫', '公卫', '次卫', '客用卫生间'],
    areaPatterns: ['guest bathroom', 'guest bath', '客卫'],
    deviceGroupKey: 'guestBath',
  },
] as const;

/** 房间环境传感器映射条目：房间 → 各维度实体 ID 的绑定。 */
export type EnvSensorMapEntry = {
  /** 房间自定义标签（覆盖 catalog.defaultLabel） */
  label?: string;
  /** 绑定的 HA area_registry area_id（键即 area_id 时可省略，用于从 HA 注册表反推房间归属） */
  haAreaId?: string;
  /** 温度传感器 entity_id（如 sensor.living_temperature） */
  temperature?: string;
  /** 湿度传感器 entity_id */
  humidity?: string;
  /** PM2.5 传感器 entity_id（µg/m³） */
  pm25?: string;
  /** CO₂ 传感器 entity_id（ppm） */
  co2?: string;
  /** 总挥发性有机物（TVOC）传感器 entity_id（参与 IAQ 综合评分） */
  tvoc?: string;
  /** 人体/移动传感器 entity_id（快捷规则：人来灯亮） */
  motion?: string;
  /** 灯光实体 entity_id（快捷规则：人来灯亮） */
  light?: string;
  /** 空调/恒温器 entity_id（快捷规则：高温自动开空调） */
  climate?: string;
  /** 仅绑定不展示在房间列表（工具间/走廊等后台环境监测点） */
  _hidden?: boolean;
};

/**
 * 房间环境传感器映射字典：键为房间 slug（或 HA area_id），值为对应的 EnvSensorMapEntry。
 * 缺失键 / 键值为 undefined 均表示该房间未配置任何环境传感器绑定。
 */
export type EnvSensorMap = Record<string, EnvSensorMapEntry | undefined>;

/**
 * 获取默认房间目录的可写深拷贝（防止调用方修改只读常量）。
 *
 * @returns RoomCatalogEntry 数组（所有 keywords/patterns 字段均为新数组）
 */
export function getDefaultRoomCatalog(): RoomCatalogEntry[] {
  return DEFAULT_ROOM_CATALOG.map((entry) => ({
    ...entry,
    voiceKeywords: [...entry.voiceKeywords],
    inferKeywords: [...entry.inferKeywords],
    areaPatterns: [...entry.areaPatterns],
  }));
}

/**
 * 提取默认目录中房间的最小元信息（id + defaultLabel + fixed），用于初始化配置。
 *
 * @returns { id, defaultLabel, fixed } 元信息数组；与 DEFAULT_ROOM_CATALOG 顺序一致
 */
export function getDefaultEnvRoomDefs() {
  return DEFAULT_ROOM_CATALOG.map(({ id, defaultLabel, fixed }) => ({ id, defaultLabel, fixed }));
}

/**
 * 构建一份默认的环境传感器映射（每个房间仅写入 label=defaultLabel，sensor 字段留空）。
 *
 * @returns EnvSensorMap 字典；键为 catalog 中的房间 id
 */
export function buildDefaultEnvSensorMap(): EnvSensorMap {
  const map: EnvSensorMap = {};
  for (const room of DEFAULT_ROOM_CATALOG) {
    map[room.id] = { label: room.defaultLabel };
  }
  return map;
}

/**
 * 返回默认目录中房间的中文标签字符串数组（如 ['客厅', '餐厅', '主卧' ...]），用于语音房间枚举下拉。
 *
 * @returns 按目录顺序排列的中文标签数组
 */
export function getDefaultVoiceRoomLabels(): string[] {
  return DEFAULT_ROOM_CATALOG.map((room) => room.defaultLabel);
}

/**
 * 从默认目录构建语音别名条目列表（label + keywords 浅拷贝），供 TTS 语音控制模块使用。
 *
 * @returns { label, keywords } 数组；keywords 已复制为新数组避免外部修改
 */
export function getVoiceRoomsFromCatalog() {
  return DEFAULT_ROOM_CATALOG.map((room) => ({
    label: room.defaultLabel,
    keywords: [...room.voiceKeywords],
  }));
}

/**
 * 解析房间展示名（自定义 sensorMap.label 优先 → 目录 defaultLabel → 兜底返回原 roomId）。
 *
 * @param roomId    房间主键（slug 或 HA area_id）
 * @param sensorMap 环境传感器映射（可能含自定义 label）
 * @param catalog   房间目录（默认 DEFAULT_ROOM_CATALOG）
 * @returns 展示名字符串；永不返回空（空 roomId 仍返回空字符串由上层决定）
 */
export function resolveRoomLabel(
  roomId: string,
  sensorMap: EnvSensorMap = {},
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): string {
  const custom = sensorMap[roomId]?.label?.trim();
  if (custom) return custom;
  const preset = catalog.find((room) => room.id === roomId);
  return preset?.defaultLabel || roomId;
}

/**
 * 获取房间 Tab 对应的 emoji 图标；未命中目录时返回默认📍（定位 pin）。
 *
 * @param roomId  房间主键
 * @param catalog 房间目录
 * @returns emoji 单字符字符串；未知房间返回 '📍'
 */
export function roomTabEmoji(
  roomId: string,
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): string {
  return catalog.find((room) => room.id === roomId)?.emoji || '📍';
}

/**
 * 构建「房间 ID → 实体推断关键词数组」的映射（用于从 HA entity_id 名反推房间归属）。
 *
 * @param catalog 房间目录
 * @returns { roomId: string[] } 映射；每个房间的 inferKeywords 已复制为新数组
 */
export function buildRoomInferKeywordsMap(
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const room of catalog) {
    map[room.id] = [...room.inferKeywords];
  }
  return map;
}

/**
 * 构建「HA area 匹配模式（小写）→ 房间 slug」的直接映射，用于 area name 模糊匹配后快速命中。
 *
 * @param catalog 房间目录
 * @returns { areaPatternLower: roomId } 映射；pattern 已按小写标准化
 */
export function buildAreaToRoomMap(
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const room of catalog) {
    for (const pattern of room.areaPatterns) {
      map[pattern.toLowerCase()] = room.id;
    }
  }
  return map;
}

/**
 * 获取设备分组（按房间聚合）的关键词元信息，供前端设备页按房间归类 UI 渲染。
 *
 * @param catalog 房间目录
 * @returns { key, names, roomId } 数组；names 是去重后的房间名 + inferKeywords 合并集合
 */
export function getDeviceGroupRoomKeywords(
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
) {
  return catalog.map((room) => ({
    key: room.deviceGroupKey,
    names: [...new Set([room.defaultLabel, ...room.inferKeywords])],
    roomId: room.id,
  }));
}

/**
 * 根据 HA 实体的 entity_id + friendly name 推断设备分组归属（按目录顺序命中首个即返回）。
 *
 * @param entityId    HA entity_id（含 domain 前缀，如 light.living_ceiling）
 * @param name        友好名称（如「客厅吸顶灯」）
 * @param fallbackKey 未命中时的兜底分组 key，默认 'other'
 * @param catalog     房间目录
 * @returns 设备分组 key（对应 catalogEntry.deviceGroupKey）；未命中返回 fallbackKey
 */
export function inferDeviceGroupRoomFromCatalog(
  entityId: string,
  name: string,
  fallbackKey = 'other',
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): string {
  const lower = `${entityId || ''}${name || ''}`.toLowerCase();
  for (const room of catalog) {
    const names = [room.defaultLabel, ...room.inferKeywords];
    if (names.some((token) => lower.includes(token.toLowerCase()))) {
      return room.deviceGroupKey;
    }
  }
  return fallbackKey;
}

/**
 * 判断某房间在环境传感器映射中是否被标记为隐藏（仅绑定不展示，如工具间/走廊）。
 *
 * @param sensorMap 环境传感器映射
 * @param roomId    房间主键
 * @returns true 表示该房间条目存在且 _hidden===true；其他情况（含缺条目）均返回 false
 */
export function isRoomHiddenInMap(sensorMap: EnvSensorMap, roomId: string): boolean {
  return sensorMap?.[roomId]?._hidden === true;
}

/**
 * 列出环境传感器映射中所有非隐藏房间的主键（用于前端渲染竖屏房间列表可见项）。
 *
 * @param sensorMap 环境传感器映射
 * @returns 房间 id 数组（保持 Object.keys 原始顺序，sortEnvSensorMapRoomIds 可进一步排序）
 */
export function listVisibleEnvSensorMapRoomIds(sensorMap: EnvSensorMap = {}): string[] {
  return Object.keys(sensorMap).filter((id) => !isRoomHiddenInMap(sensorMap, id));
}

/** 按目录顺序排列房间 slug（自定义房间排在预设之后） */
export function sortEnvSensorMapRoomIds(
  roomIds: string[],
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): string[] {
  const order = new Map(catalog.map((room, index) => [room.id, index]));
  return [...roomIds].sort((a, b) => {
    const oa = order.has(a) ? order.get(a)! : 999;
    const ob = order.has(b) ? order.get(b)! : 999;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b, 'zh-CN');
  });
}

/**
 * 按设备分组 key 解析中文展示标签（other 直接返回「其他」，目录命中走 resolveRoomLabel，未知原样返回）。
 *
 * @param deviceGroupKey 设备分组 key（catalogEntry.deviceGroupKey，或 'other'）
 * @param sensorMap      环境传感器映射（含自定义房间 label）
 * @param catalog        房间目录
 * @returns 中文展示标签；空 key / 'other' → '其他'
 */
export function resolveDeviceGroupLabel(
  deviceGroupKey: string,
  sensorMap: EnvSensorMap = {},
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): string {
  if (!deviceGroupKey || deviceGroupKey === 'other') return '其他';
  const preset = catalog.find((room) => room.deviceGroupKey === deviceGroupKey);
  if (preset) return resolveRoomLabel(preset.id, sensorMap, catalog);
  return deviceGroupKey;
}

/**
 * 构建设备分组 key → 中文展示标签 的完整映射（至少含 other=其他；隐藏房间跳过）。
 *
 * @param sensorMap 环境传感器映射
 * @param catalog   房间目录
 * @returns { deviceGroupKey: label } 映射；供前端设备页分组标题渲染
 */
export function buildDeviceGroupLabelMap(
  sensorMap: EnvSensorMap = {},
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): Record<string, string> {
  const map: Record<string, string> = { other: '其他' };
  for (const room of catalog) {
    if (isRoomHiddenInMap(sensorMap, room.id)) continue;
    map[room.deviceGroupKey] = resolveRoomLabel(room.id, sensorMap, catalog);
  }
  return map;
}

/**
 * 面向公共 API / 前端初始化的房间元信息（无 HA 时使用），包含 roomLabels（id→展示名）与 deviceGroupLabels（分组→展示名）。
 *
 * @param sensorMap 环境传感器映射（隐藏过滤 + 自定义 label 来源）
 * @param catalog   房间目录
 * @returns { roomLabels, deviceGroupLabels } 两个映射；roomLabels 已按 sortEnvSensorMapRoomIds 排序
 */
export function buildPublicRoomMeta(
  sensorMap: EnvSensorMap = {},
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): { roomLabels: Record<string, string>; deviceGroupLabels: Record<string, string> } {
  const roomLabels: Record<string, string> = {};
  const deviceGroupLabels = buildDeviceGroupLabelMap(sensorMap, catalog);
  for (const roomId of sortEnvSensorMapRoomIds(
    listVisibleEnvSensorMapRoomIds(sensorMap),
    catalog,
  )) {
    roomLabels[roomId] = resolveRoomLabel(roomId, sensorMap, catalog);
  }
  return { roomLabels, deviceGroupLabels };
}

/**
 * 构建某个房间的「实体归属匹配 token 集合」（id / deviceGroupKey / inferKeywords / voiceKeywords / areaPatterns / 自定义 label，全部小写去重）。
 *
 * @param roomId    目标房间主键
 * @param sensorMap 环境传感器映射（用于取自定义 label）
 * @param catalog   房间目录
 * @returns 小写 token 字符串数组（去重且过滤空）；用于 entityMatchesEnvRoom 子串匹配
 */
export function buildRoomEntityMatchers(
  roomId: string,
  sensorMap: EnvSensorMap = {},
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): string[] {
  const tokens = new Set<string>();
  const preset = catalog.find((room) => room.id === roomId);
  if (preset) {
    tokens.add(preset.id.toLowerCase());
    tokens.add(preset.deviceGroupKey.toLowerCase());
    for (const kw of preset.inferKeywords) tokens.add(kw.toLowerCase());
    for (const kw of preset.voiceKeywords) tokens.add(kw.toLowerCase());
    for (const pattern of preset.areaPatterns) tokens.add(pattern.toLowerCase());
  }
  const label = sensorMap[roomId]?.label?.trim();
  if (label) tokens.add(label.toLowerCase());
  return [...tokens].filter(Boolean);
}

/**
 * 判断某个 HA 实体是否归属给定房间（用实体 id + friendlyName + areaId 的小写拼接串，对房间 matcher token 做任一子串命中）。
 *
 * @param entityId     HA entity_id（必填）
 * @param friendlyName 实体友好名称（可 undefined）
 * @param areaId       实体绑定的 HA area_id（可 undefined）
 * @param roomId       目标房间 slug
 * @param sensorMap    环境传感器映射
 * @param catalog      房间目录
 * @returns 任一 token 命中子串即返回 true，否则 false
 */
export function entityMatchesEnvRoom(
  entityId: string,
  friendlyName: string | undefined,
  areaId: string | undefined,
  roomId: string,
  sensorMap: EnvSensorMap = {},
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): boolean {
  const hay = `${entityId} ${friendlyName || ''} ${areaId || ''}`.toLowerCase();
  return buildRoomEntityMatchers(roomId, sensorMap, catalog).some((token) => hay.includes(token));
}

/**
 * 从 HA entity_id 推断目录房间 slug（先按 inferKeywords 子串命中；sensor. 前缀实体取前两下划线片段作为兜底）。
 *
 * @param entityId HA entity_id
 * @param catalog  房间目录
 * @returns 命中则为 room slug；sensor. 实体未命中时返回前两段名；完全未识别返回 null
 */
export function inferRoomIdFromEntityId(
  entityId: string,
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): string | null {
  const id = entityId.toLowerCase();
  for (const room of catalog) {
    for (const kw of room.inferKeywords) {
      if (id.includes(kw.toLowerCase())) return room.id;
    }
  }
  if (id.startsWith('sensor.')) {
    const parts = id.replace('sensor.', '').split('_');
    return parts.slice(0, 2).join('_');
  }
  return null;
}
