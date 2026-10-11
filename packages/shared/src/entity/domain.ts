/**
 * 实体 domain 提取模块
 *
 * 职责：
 *  - 从 HA entity_id 中提取 domain 部分（点号前缀）。
 *
 * 关键依赖：
 *  - HA entity_id 格式约定："<domain>.<object_id>"，如 "light.living_room"。
 *
 * 约定：
 *  - 输入为空或不含 "." 时返回空字符串（不抛异常）；
 *  - 不校验 domain 合法性，仅做字符串切分。
 */

/** 从 entity_id 提取 domain（如 light.living → light） */
export function getEntityDomain(entityId: string): string {
  // 防御性转换：容忍 null / undefined / 非字符串输入
  const id = String(entityId || '');
  const dot = id.indexOf('.');
  // dot > 0 确保 domain 非空（避免 ".living" 返回空串时误判）
  return dot > 0 ? id.slice(0, dot) : '';
}

/**
 * 从 entity_id 提取 object_id（末段，如 light.living_room → living_room）。
 *
 * 等价于 `id.split('.').pop() || id`：无 "." 时返回原值，末段为空（如 "light."）时同样回退原值，
 * 供前端展示兜底文案、后端生成变量名等场景统一使用，避免各处自行切分导致空串/undefined 差异。
 */
export function getEntityLeaf(entityId: string): string {
  const id = String(entityId || '');
  const dot = id.lastIndexOf('.');
  if (dot < 0) return id;
  const leaf = id.slice(dot + 1);
  return leaf || id;
}