/**
 * @file ha-area-env-map.ts
 * @module @homeos/shared/room
 * @brief HA area_registry 与 HomeOS 房间目录的双向映射。
 *
 * 职责：
 *  - 提供 HA area → 房间目录条目的查找（按 area name / id 匹配 areaPatterns）；
 *  - 提供房间目录 → HA area 的反查（先按 id 直查，再按 areaPatterns / inferKeywords 模糊匹配）；
 *  - 合并 envSensorMap 条目，过滤仅保留已对齐 HA area 的条目。
 *
 * 关键依赖：
 *  - DEFAULT_ROOM_CATALOG / EnvSensorMap / buildPublicRoomMeta 等来自 ./catalog；
 *  - 后端在 HA area 变化时调用本模块重新对齐 envSensorMap。
 *
 * 约定：
 *  - 反查优先按 id 直接命中，未命中再走模糊匹配；
 *  - mergeEnvEntries：patch 优先，base 兜底（label / 各 sensor 字段都按 trim 后非空优先）。
 */
import {
  DEFAULT_ROOM_CATALOG,
  type EnvSensorMap,
  type EnvSensorMapEntry,
  type RoomCatalogEntry,
  buildPublicRoomMeta,
  isRoomHiddenInMap,
  resolveRoomLabel,
} from './catalog';

/** HA area_registry 引用（id + name） */
export type HaAreaRef = { id: string; name: string };

/**
 * 按 area_id 在 HA area 列表中查找。
 *
 * @param areaId HA area_id
 * @param areas  HA area 列表
 * @returns 命中的 HaAreaRef；空 id 返回 undefined
 */
export function lookupHaArea(areaId: string, areas: readonly HaAreaRef[]): HaAreaRef | undefined {
  const id = String(areaId || '').trim();
  if (!id) return undefined;
  return areas.find((area) => area.id === id);
}

/**
 * 按 HA area 名称 / id 匹配房间目录条目。
 *
 * @param area    HA area（id + name）
 * @param catalog 房间目录（默认 DEFAULT_ROOM_CATALOG）
 * @returns 命中的 RoomCatalogEntry；未命中返回 undefined
 */
export function findCatalogForHaArea(
  area: HaAreaRef,
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): RoomCatalogEntry | undefined {
  const hay = `${area.id} ${area.name}`.toLowerCase();
  return catalog.find((room) =>
    room.areaPatterns.some((pattern) => hay.includes(pattern.toLowerCase())),
  );
}

/**
 * 由目录 room slug 反查对应的 HA area（resolveRoom 推断后对齐 area_registry）。
 *
 * @param catalogRoomId 房间目录 ID（如 "living"）
 * @param areas         HA area 列表
 * @param catalog       房间目录（默认 DEFAULT_ROOM_CATALOG）
 * @returns 命中的 HaAreaRef；未命中返回 undefined
 *
 * 查找顺序：
 *  1. area.id === roomId 直接命中；
 *  2. catalogForHaArea 反查命中的 area；
 *  3. 按 catalogEntry.areaPatterns / inferKeywords 模糊匹配。
 */
export function findHaAreaForCatalogRoom(
  catalogRoomId: string,
  areas: readonly HaAreaRef[],
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): HaAreaRef | undefined {
  const roomId = String(catalogRoomId || '').trim();
  if (!roomId || !areas.length) return undefined;

  const direct = lookupHaArea(roomId, areas);
  if (direct) return direct;

  const catalogEntry = catalog.find((room) => room.id === roomId);
  for (const area of areas) {
    if (findCatalogForHaArea(area, catalog)?.id === roomId) return area;
    if (!catalogEntry) continue;
    const hay = `${area.id} ${area.name}`.toLowerCase();
    if (catalogEntry.areaPatterns.some((pattern) => hay.includes(pattern.toLowerCase()))) {
      return area;
    }
    if (catalogEntry.inferKeywords.some((kw) => hay.includes(kw.toLowerCase()))) {
      return area;
    }
  }
  return undefined;
}

/**
 * 合并两个 env 条目（patch 优先，base 兜底）。
 * - label / 各 sensor 字段：trim 后非空优先 patch；
 * - _hidden：patch 显式提供时优先，否则沿用 base。
 */
function mergeEnvEntries(base?: EnvSensorMapEntry, patch?: EnvSensorMapEntry): EnvSensorMapEntry {
  if (!base) return { ...(patch || {}) };
  if (!patch) return { ...base };
  return {
    label: patch.label?.trim() || base.label,
    haAreaId: patch.haAreaId || base.haAreaId,
    temperature: patch.temperature?.trim() || base.temperature,
    humidity: patch.humidity?.trim() || base.humidity,
    pm25: patch.pm25?.trim() || base.pm25,
    co2: patch.co2?.trim() || base.co2,
    tvoc: patch.tvoc?.trim() || base.tvoc,
    motion: patch.motion?.trim() || base.motion,
    light: patch.light?.trim() || base.light,
    climate: patch.climate?.trim() || base.climate,
    _hidden: patch._hidden ?? base._hidden,
  };
}

/** 仅保留 HA area_id 主键的 envSensorMap 条目 */
export function filterEnvSensorMapToKnownAreas(
  map: EnvSensorMap = {},
  areas: readonly HaAreaRef[],
): EnvSensorMap {
  if (!areas.length || !map || typeof map !== 'object') return map || {};
  const areaIds = new Set(areas.map((area) => area.id));
  const next: EnvSensorMap = {};
  for (const [key, entry] of Object.entries(map)) {
    if (!entry || !areaIds.has(key)) continue;
    next[key] = mergeEnvEntries(next[key], { ...entry, haAreaId: key });
  }
  return next;
}

/**
 * 以 HA area_registry 为源构建的房间列表条目（前端竖屏房间目录渲染用）。
 * fixed 字段标记该房间由 HA 真实 area 提供（不可从目录移除）。
 */
export type HaEnvRoomListItem = {
  id: string;            /** HA area_id（主键） */
  defaultLabel: string;  /** HA area 原生名称（兜底展示） */
  fixed: boolean;        /** 是否为 HA 真实绑定的固定房间 */
  displayLabel: string;  /** 最终展示名（envSensorMap.label 优先） */
};

/** 以 HA area_registry 为房间目录 */
export function buildRoomListFromHaAreas(
  areas: readonly HaAreaRef[],
  map: EnvSensorMap = {},
): HaEnvRoomListItem[] {
  return [...areas]
    .filter((area) => !isRoomHiddenInMap(map, area.id))
    .map((area) => ({
      id: area.id,
      defaultLabel: area.name,
      fixed: true,
      displayLabel: map[area.id]?.label?.trim() || area.name,
    }))
    .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, 'zh-CN'));
}

function isAsciiSlugLabel(label: string): boolean {
  const t = label.trim();
  if (!t) return true;
  if (/[\u4e00-\u9fff]/.test(t)) return false;
  return /^[a-z0-9_\-\s]+$/i.test(t);
}

/** 从 HA area id / 拼音 slug 反查目录默认中文名（如 lao_ren_fang → 老人房） */
function inferCatalogLabelFromAreaSlug(
  slug: string,
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): string | undefined {
  const hay = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/_/g, ' ');
  if (!hay) return undefined;
  for (const room of catalog) {
    if (room.inferKeywords.some((kw) => hay.includes(kw.toLowerCase()))) return room.defaultLabel;
    if (room.areaPatterns.some((pattern) => hay.includes(pattern.toLowerCase()))) {
      return room.defaultLabel;
    }
  }
  return undefined;
}

/**
 * 结合 HA area_registry 解析房间展示名（自定义 label → HA name → 目录推断 → slug 反查 → 目录默认，多级兜底）。
 *
 * @param roomId  房间主键（可能是 HA area_id 或目录 room slug）
 * @param map     环境传感器映射（含自定义 label）
 * @param areas   HA area 列表
 * @param catalog 房间目录（默认 DEFAULT_ROOM_CATALOG）
 * @returns 非空展示名字符串；空 roomId 或所有兜底失败返回空字符串
 */
export function resolveRoomLabelFromHaAreas(
  roomId: string,
  map: EnvSensorMap = {},
  areas: readonly HaAreaRef[] = [],
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): string {
  const id = String(roomId || '').trim();
  if (!id) return '';
  const custom = map[id]?.label?.trim();
  if (custom) return custom;
  const ha = lookupHaArea(id, areas);
  if (ha) {
    const haName = ha.name?.trim() || '';
    if (haName && !isAsciiSlugLabel(haName)) return haName;
    const fromCatalog = findCatalogForHaArea(ha, catalog);
    if (fromCatalog) return fromCatalog.defaultLabel;
    const fromSlug = inferCatalogLabelFromAreaSlug(ha.id, catalog);
    if (fromSlug) return fromSlug;
    if (haName) return haName;
  }
  const fromId = inferCatalogLabelFromAreaSlug(id, catalog);
  if (fromId) return fromId;
  return resolveRoomLabel(id, map, catalog);
}

/**
 * 语音交互使用的房间别名条目：展示 label + 识别关键词集合（去重，含 label / HA name / area_id / 目录 voiceKeywords）。
 */
export type VoiceRoomLike = { label: string; keywords: string[] };

/**
 * 从 HA area_registry 构建语音识别可用的房间别名列表（按 displayLabel 中文排序）。
 *
 * @param areas         HA area 列表（空时直接返回 fallbackRooms 副本）
 * @param map           环境传感器映射（过滤 _hidden 房间 + 取自定义 label）
 * @param catalog       房间目录（用于扩展 voiceKeywords）
 * @param fallbackRooms 无 HA 时的兜底房间列表（如默认目录构建结果）
 * @returns 语音别名 VoiceRoomLike 数组；已去重 keywords，按 displayLabel 升序排序
 */
export function resolveVoiceRoomsFromHaAreas(
  areas: readonly HaAreaRef[],
  map: EnvSensorMap = {},
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
  fallbackRooms: readonly VoiceRoomLike[] = [],
): VoiceRoomLike[] {
  if (!areas.length) return [...fallbackRooms];
  const rooms: VoiceRoomLike[] = [];
  for (const area of areas) {
    if (isRoomHiddenInMap(map, area.id)) continue;
    const label = map[area.id]?.label?.trim() || area.name;
    const catalogEntry = findCatalogForHaArea(area, catalog);
    const keywords = catalogEntry
      ? [...new Set([...catalogEntry.voiceKeywords, label, area.name, area.id])]
      : [...new Set([label, area.name, area.id, area.id.replace(/_/g, ' ')])];
    rooms.push({ label, keywords });
  }
  return rooms.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

/**
 * 面向公共 API / 前端初始化的房间元信息（roomLabels + deviceGroupLabels），优先以 HA area 为准，缺失部分由目录补齐。
 *
 * @param areas   HA area 列表（空时退化为 catalog + map 单独构建）
 * @param map     环境传感器映射（隐藏过滤 + displayLabel 来源）
 * @param catalog 房间目录（默认 DEFAULT_ROOM_CATALOG）
 * @returns { roomLabels, deviceGroupLabels } 两个映射对象；deviceGroupLabels 至少包含 '其他' 键
 */
export function buildPublicRoomMetaFromHaAreas(
  areas: readonly HaAreaRef[],
  map: EnvSensorMap = {},
  catalog: readonly RoomCatalogEntry[] = DEFAULT_ROOM_CATALOG,
): { roomLabels: Record<string, string>; deviceGroupLabels: Record<string, string> } {
  if (!areas.length) return buildPublicRoomMeta(map, catalog);

  const roomLabels: Record<string, string> = {};
  const deviceGroupLabels: Record<string, string> = { other: '其他' };

  for (const area of areas) {
    if (isRoomHiddenInMap(map, area.id)) continue;
    const label = map[area.id]?.label?.trim() || area.name;
    roomLabels[area.id] = label;
    const catalogEntry = findCatalogForHaArea(area, catalog);
    if (catalogEntry) {
      deviceGroupLabels[catalogEntry.deviceGroupKey] = label;
    }
  }

  for (const room of catalog) {
    if (deviceGroupLabels[room.deviceGroupKey]) continue;
    if (isRoomHiddenInMap(map, room.id)) continue;
    deviceGroupLabels[room.deviceGroupKey] = resolveRoomLabel(room.id, map, catalog);
  }

  return { roomLabels, deviceGroupLabels };
}
