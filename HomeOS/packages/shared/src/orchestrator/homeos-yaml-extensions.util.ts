/**
 * @file homeos-yaml-extensions.util.ts
 * @module @homeos/shared/orchestrator
 * @brief 检测联动 YAML 是否含仅 HomeOS 本地引擎可执行的扩展（禁止 runOnHa 时避免 HA 静默忽略）。
 *
 * 职责：
 *  - 提供 yamlContainsHomeosExtensions 函数，识别 homeos.* 扩展语法、notification.homeos、homeos_meta、HomeOS 裸 UUID 实体等。
 *
 * 关键依赖：
 *  - 后端画布保存/校验层在决定「是否允许 runOnHa」前调用本函数做预检；
 *  - 前端自动化编辑器可据此灰显或禁用 runOnHa 开关。
 *
 * 约定：
 *  - YAML 为空或仅空白时返回 false（不扩展即视为可在 HA 运行）；
 *  - 检测为正则判断：命中任一扩展正则即返回 true（宁误判勿漏判）。
 */
const HOMEOS_EXTENSION_RE =
  /(?:^|[\s"'`])(?:homeos\.(?:variable_|var_changed|interval\.|automation\.|scene\.|script\.)|homeos_variable|notification\.homeos|#\s*homeos_meta|service:\s*homeos\.)/im;

/** 裸 UUID 作为 entity_id（本地 HomeOS 场景/脚本/自动化 ID，非 HA 实体） */
const BARE_HOMEOS_UUID_ENTITY_RE =
  /entity_id:\s*['"]?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/**
 * 检测 YAML 文本中是否包含仅 HomeOS 本地引擎可识别/执行的扩展语法。
 * 命中后应禁止 runOnHa（或强制本地执行），避免 HA 侧静默忽略这些扩展动作/触发器。
 *
 * @param yaml 待检测的 YAML 字符串（允许 null/undefined/空串，空输入返回 false）
 * @returns true 表示检测到 HomeOS 专有扩展；false 表示未检测到或 YAML 为空
 * @throws 不抛任何异常；空/仅空白 YAML 视为"无扩展"安全返回 false
 */
export function yamlContainsHomeosExtensions(yaml: string): boolean {
  const text = String(yaml || '');
  if (!text.trim()) return false;
  return HOMEOS_EXTENSION_RE.test(text) || BARE_HOMEOS_UUID_ENTITY_RE.test(text);
}
