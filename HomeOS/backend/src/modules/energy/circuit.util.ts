/**
 * @file energy/circuit.util.ts
 * @module backend/src/modules
 *
 * 分路用电计量工具：将首装向导保存的扁平 entity_id 列表转为
 * circuit-breakdown API 所需的「分类名 → entity_id 列表」映射。
 */

/**
 * 将扁平 entity_id 列表转为 circuit-breakdown API 所需 map。
 * 标签由 entity_id 后缀（点号后部分）按 _ 切空格生成；重名时附加 (entity_id) 后缀。
 */
export function buildCircuitMapFromEntityIds(entityIds: string[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const raw of entityIds) {
    const id = raw?.trim();
    if (!id) continue;
    const suffix = id.includes('.') ? (id.split('.').pop() ?? id) : id;
    const label = suffix.replace(/_/g, ' ');
    const key = map[label] ? `${label} (${id})` : label;
    map[key] = [id];
  }
  return map;
}

/**
 * 从配置解析分路 entity_id 列表。
 * 非数组或空值返回空数组，保证调用方安全使用。
 */
export function parseCircuitEntityIds(
  config: { circuitEntityIds?: string[] | null } | undefined,
): string[] {
  const ids = config?.circuitEntityIds;
  if (!Array.isArray(ids)) return [];
  return ids.map((s) => String(s).trim()).filter(Boolean);
}
