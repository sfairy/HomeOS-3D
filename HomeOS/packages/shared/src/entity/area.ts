/**
 * 实体房间（Area）解析模块
 *
 * 职责：
 *  - 从 HA 实体 attributes 中解析所属房间（area_id / area_name）。
 *  - 提供基于 area_id 的房间筛选匹配。
 *
 * 关键依赖：
 *  - HA area_registry：HomeOS 后端在实体同步阶段会把 registry 中的 area_id / area_name
 *    合并到实体 attributes，前端可直接消费，无需再次查表。
 *
 * 约定：
 *  - area_id 与 area_name 至少存在其一即视为有房间归属；
 *  - 二者可互为兜底（缺哪个就用另一个补）。
 */

/**
 * 实体 attributes 中与房间相关的字段（弱类型，来自 HA 原始数据）。
 */
export interface EntityAreaAttrs {
  /** HA area_registry 中的房间 ID（如 "living_room"） */
  area_id?: unknown;
  /** HA area_registry 中的房间显示名（如 "客厅"） */
  area_name?: unknown;
}

/**
 * 解析后的房间信息，id / name 均为非空字符串。
 */
export interface EntityAreaInfo {
  /** 房间 ID（优先使用 area_id，缺失时回退为 area_name） */
  id: string;
  /** 房间名（优先使用 area_name，缺失时回退为 area_id） */
  name: string;
  /** 前端展示用文本（当前等同于 name） */
  display: string;
}

/** 从实体 attributes 解析房间（优先 registry 补全后的 area_id + area_name） */
export function resolveEntityArea(attrs?: EntityAreaAttrs | null): EntityAreaInfo | null {
  const id = String(attrs?.area_id ?? '').trim();
  const name = String(attrs?.area_name ?? '').trim();
  // 两者皆空表示该实体未分配房间
  if (!id && !name) return null;
  // 互为兜底：缺哪个就用另一个补
  const resolvedId = id || name;
  const resolvedName = name || id;
  return {
    id: resolvedId,
    name: resolvedName,
    display: resolvedName,
  };
}

/**
 * 判断实体是否匹配指定的房间筛选条件。
 *
 * @param attrs       实体 attributes（含 area_id / area_name）
 * @param filterAreaId 筛选用 area_id；空字符串表示不限制房间
 * @returns true 表示该实体属于目标房间（或不限制房间时恒为 true）
 *
 * 匹配规则：area_id 或 area_name 任一命中 filterAreaId 即可，
 * 以兼容用户既可能按 ID 也可能按名称筛选的场景。
 */
export function entityMatchesAreaFilter(
  attrs: EntityAreaAttrs | undefined,
  filterAreaId: string,
): boolean {
  const filter = String(filterAreaId ?? '').trim();
  // 空筛选 = 不限制，直接放行
  if (!filter) return true;
  const area = resolveEntityArea(attrs);
  if (!area) return false;
  // 同时匹配 id 与 name，兼容按名称筛选
  return area.id === filter || area.name === filter;
}