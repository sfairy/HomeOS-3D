/**
 * @module shared/ha
 * @file entity-area-enrich.util.ts
 * @brief HA 实体区域（Area）与设备 ID 信息增强工具。
 *
 * 职责：
 *  - 基于 HA 实体注册表 / 设备注册表 / 区域注册表，构建 entity_id -> { area_id, area_name, device_id } 索引；
 *  - 将区域与 device_id 回填到实体 attributes，统一前后端展示与分组；
 *  - 通过发布 HA_ENTITY_REGISTRY_UPDATED 事件通知缓存失效。
 */
import type { HaEntity } from '../types';
import type { HaEntityRegistryEntry } from './entity-registry.util';

/** 实体注册表更新事件名（HA WebSocket 事件名，保持原样不翻译） */
export const HA_ENTITY_REGISTRY_UPDATED = 'ha.entity_registry_updated';

/** 区域索引缓存有效期（毫秒），避免频繁拉取注册表 */
export const ENTITY_AREA_CACHE_MS = 30_000;

/**
 * 实体区域索引：entity_id -> { area_id, area_name, device_id? }。
 */
export type EntityAreaIndex = Map<
  string,
  { area_id: string; area_name: string; device_id?: string }
>;

/**
 * 构建 area_id -> area_name 映射。
 */
export function buildAreaNameMap(
  areas: Array<{ area_id: string; name: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const area of areas) {
    const id = String(area.area_id || '').trim();
    if (!id) continue;
    map.set(id, String(area.name || id).trim() || id);
  }
  return map;
}

/**
 * 构建 device_id -> area_id 映射。
 */
export function buildDeviceAreaMap(
  devices: Array<{ device_id: string; area_id: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const device of devices) {
    const deviceId = String(device.device_id || '').trim();
    const areaId = String(device.area_id || '').trim();
    if (!deviceId || !areaId) continue;
    map.set(deviceId, areaId);
  }
  return map;
}

/**
 * 构建实体区域索引：entity_id -> { area_id, area_name, device_id? }。
 *
 * 优先级：实体注册表自身的 area_id > 设备所属 area_id（deviceAreaById）。
 * 仅有 device_id、无区域时也会入索引（便于前端按设备分组）。
 */
export function buildEntityAreaIndex(
  registry: HaEntityRegistryEntry[],
  areaNameById: Map<string, string>,
  deviceAreaById: Map<string, string> = new Map(),
): EntityAreaIndex {
  const index: EntityAreaIndex = new Map();
  for (const entry of registry) {
    if (!entry.entity_id) continue;
    const deviceId = String(entry.device_id || '').trim();
    let areaId = String(entry.area_id || '').trim();
    if (!areaId && deviceId) {
      areaId = String(deviceAreaById.get(deviceId) || '').trim();
    }
    if (!areaId && !deviceId) continue;
    index.set(entry.entity_id, {
      area_id: areaId,
      area_name: areaId ? areaNameById.get(areaId) || areaId : '',
      ...(deviceId ? { device_id: deviceId } : {}),
    });
  }
  return index;
}

/**
 * 用区域索引增强单个实体的 attributes（area_id / area_name / device_id）。
 */
export function enrichEntityAreas(entity: HaEntity, index: EntityAreaIndex): HaEntity {
  const fromRegistry = index.get(entity.entity_id);
  const attrs = entity.attributes || {};
  const attrId = String(attrs.area_id || '').trim();
  const attrName = String(attrs.area_name || '').trim();
  const attrDevice = String(attrs.device_id || '').trim();

  if (fromRegistry) {
    const area_id = String(fromRegistry.area_id || '').trim();
    const area_name = String(fromRegistry.area_name || area_id).trim();
    const device_id = String(fromRegistry.device_id || '').trim();
    const areaOk = !area_id || (attrId === area_id && attrName === area_name);
    const deviceOk = !device_id || attrDevice === device_id;
    if (areaOk && deviceOk) return entity;
    return {
      ...entity,
      attributes: {
        ...attrs,
        ...(area_id ? { area_id, area_name: area_name || area_id } : {}),
        ...(device_id ? { device_id } : {}),
      },
    };
  }

  if (!attrId && !attrName) return entity;

  const area_id = attrId || attrName;
  const area_name = attrName || attrId;
  if (attrId === area_id && attrName === area_name) return entity;
  return {
    ...entity,
    attributes: {
      ...attrs,
      area_id,
      area_name,
    },
  };
}

/**
 * 批量增强实体区域信息。
 */
export function enrichEntitiesAreas(entities: HaEntity[], index: EntityAreaIndex): HaEntity[] {
  if (!index.size) return entities;
  let changed = false;
  const next = entities.map((entity) => {
    const enriched = enrichEntityAreas(entity, index);
    if (enriched !== entity) changed = true;
    return enriched;
  });
  return changed ? next : entities;
}
