/**
 * 模板实体保存与保存后提示工具。
 *
 * 职责：
 * - 构建模板实体保存接口所需的 API payload（name/type/yaml/slotMapping）
 * - 保存成功后给出操作提示类型（推送 HA / YAML 不完整 / 非管理员 / 无）
 *
 * 依赖：仅依赖入参类型，本模块为纯函数，无副作用。
 */

/**
 * 构建模板实体保存 API payload。
 *
 * 调用场景：模板实体表单提交前，组装后端 /template-entity POST/PUT 所需的最小字段集合。
 *
 * @param name 实体名称
 * @param type 模板类型（家电类型 / trigger_sensor / yaml_import）
 * @param yaml 模板 YAML 字符串
 * @param slotMapping 槽位映射（已有结构或 undefined）
 * @returns 可直接作为请求体的扁平对象
 */
export function buildTemplateEntitySavePayload(
  name: string,
  type: string,
  yaml: string,
  slotMapping: unknown,
): Record<string, unknown> {
  return { name, type, yaml, slotMapping }
}

/** 模板实体保存成功后的提示类型联合 */
type TemplateEntityPostSaveHint =
  | { kind: 'push_ha'; row: { id?: string; yamlComplete?: boolean } }
  | { kind: 'incomplete_yaml' }
  | { kind: 'non_admin_saved' }
  | { kind: 'none' }

/**
 * 保存成功后提示管理员是否推送 HA。
 *
 * 判定优先级：非管理员 → 不提示推送；未进入编辑或无行记录 → none；
 * 行标记 yamlComplete=false → 提示 YAML 不完整；其余 → 提示推送 HA 并携带行引用。
 *
 * @param isAdmin 当前用户是否为管理员
 * @param editingId 正在编辑的记录 ID（新增时为 null）
 * @param row 已保存的行记录（含 id 与 yamlComplete 标记）
 * @returns 提示类型对象，供 UI 决定后续 Toast/弹窗
 */
export function templateEntityPostSaveHint(
  isAdmin: boolean,
  editingId: string | null,
  row: { id?: string; yamlComplete?: boolean } | undefined,
): TemplateEntityPostSaveHint {
  if (!isAdmin) return { kind: 'non_admin_saved' }
  if (!editingId || !row) return { kind: 'none' }
  if (row.yamlComplete === false) return { kind: 'incomplete_yaml' }
  return { kind: 'push_ha', row }
}
