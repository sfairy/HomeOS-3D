/**
 * @module shared/ha
 * @file entity-registry.util.ts
 * @brief HA 实体注册表条目的类型定义与原始数据映射工具。
 *
 * 职责：
 *  - 定义 HaEntityRegistryEntry 结构（对应 HA /api/config/entity_registry 的响应字段）；
 *  - 将 HA 返回的原始对象映射为类型安全的 HaEntityRegistryEntry。
 *
 * 关键依赖：无外部依赖，仅类型定义与纯函数。
 *
 * 注意：entity_id / platform / unique_id / area_id / config_entry_id / device_id /
 *       disabled_by / hidden_by 均为 HA 原生字段名，不翻译。
 */
/**
 * HA 实体注册表条目。
 * 对应 HA 后端 config/entity_registry 的存储结构。
 */
export interface HaEntityRegistryEntry {
  /** 实体 ID，如 light.lylight1 */
  entity_id: string;
  /** 集成平台（集成 slug），如 hue / zha */
  platform: string;
  /** 全局唯一 ID（集成内部唯一） */
  unique_id?: string;
  /** 用户在 HA 里改过的名称（常为中文） */
  name?: string;
  /** 集成原始名称（未自定义时的中文 friendly_name 来源） */
  original_name?: string;
  /** 所属区域 ID */
  area_id?: string;
  /** 所属配置条目 ID（config entry） */
  config_entry_id?: string;
  /** 所属设备 ID */
  device_id?: string;
  /** HA 注册表：非空表示已禁用 */
  disabled_by?: string;
  /** HA 注册表：非空表示已在 HA UI 隐藏（如 "user"） */
  hidden_by?: string;
  /** 部分 API / 旧版可能直接返回 boolean */
  hidden?: boolean;
  /** HA 标签 ID 列表（label_registry） */
  labels?: string[];
}

function nonemptyStr(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

/**
 * 将 HA 原始注册表对象映射为 HaEntityRegistryEntry。
 *
 * 处理要点：
 *  - 空字符串统一归一化为 undefined（避免 "area_id: ''" 干扰判断）；
 *  - hidden_by 非空时 hidden 强制为 true；
 *  - entity_id 为空的条目视为无效，返回 null。
 *
 * @param e HA 返回的原始对象（Record<string, unknown>）。
 * @returns 映射后的 HaEntityRegistryEntry；entity_id 缺失时返回 null。
 */
export function mapHaEntityRegistryRow(e: Record<string, unknown>): HaEntityRegistryEntry | null {
  const entity_id = String(e.entity_id || '');
  if (!entity_id) return null;
  const disabledBy = e.disabled_by;
  const hiddenBy = e.hidden_by;
  // 空字符串归一化为 undefined，便于上层用 == null 判断
  const disabledByStr =
    disabledBy != null && String(disabledBy) !== '' ? String(disabledBy) : undefined;
  const hiddenByStr = hiddenBy != null && String(hiddenBy) !== '' ? String(hiddenBy) : undefined;
  return {
    entity_id,
    platform: String(e.platform || ''),
    unique_id: e.unique_id != null ? String(e.unique_id) : undefined,
    name: nonemptyStr(e.name),
    original_name: nonemptyStr(e.original_name),
    area_id: e.area_id != null && String(e.area_id) !== '' ? String(e.area_id) : undefined,
    config_entry_id: e.config_entry_id != null ? String(e.config_entry_id) : undefined,
    device_id: e.device_id != null ? String(e.device_id) : undefined,
    disabled_by: disabledByStr,
    hidden_by: hiddenByStr,
    // hidden_by 非空时强制 hidden 为 true，兼容旧版 boolean 返回
    hidden: e.hidden === true || !!hiddenByStr,
    labels: Array.isArray(e.labels)
      ? e.labels.filter((x): x is string => typeof x === 'string' && !!x)
      : undefined,
  };
}