/**
 * 占位实体 ID 标识模块。
 *
 * 模块职责：识别 YAML / 配置中的占位实体 ID（形如 xxx_placeholder 或 domain.placeholder），
 * 用于在导入模板 / 校验自动化时跳过或提示用户绑定真实实体。
 *
 * 关键依赖：无（纯常量 + 工具函数）
 */

/** 占位实体 ID：*_placeholder 或 *.placeholder */
export const ORCHESTRATOR_PLACEHOLDER_RE = /(?:_placeholder|\.placeholder)\b/i;

/**
 * 判断文本中是否包含占位实体 ID 标识。
 * @param text 任意字符串（YAML / entity_id / 配置值）
 * @returns 命中占位标识返回 true
 */
export function hasOrchestratorPlaceholder(text: string): boolean {
  return ORCHESTRATOR_PLACEHOLDER_RE.test(String(text || ''));
}