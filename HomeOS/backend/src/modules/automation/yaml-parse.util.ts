/**
 * 自动化 YAML 解析工具。
 *
 * 所属模块：backend/modules/automation
 * 职责：把自动化 YAML 解析为本地引擎使用的 AutomationRule（含触发器 / 条件 / 动作 AST），
 *  并附加 id / enabled / name 等运行时元数据；同时输出引擎能力声明（用于审计哪些
 *  触发器 / 条件 / 动作由本地引擎支持、哪些须依赖 HA）。
 *  本文件是「薄包装」层：规范化 AST 在 @homeos/shared 中实现，这里只做挂载与能力审计。
 * 关键依赖：@homeos/shared（parseAutomationYamlCore / normalize* / validate*）。
 */
import {
  type ParsedTrigger,
  type ParsedCondition,
  type ParsedAction,
  AUTOMATION_ENGINE_CAPABILITIES,
  parseAutomationYamlCore,
  auditAutomationEngineSupport,
} from '@homeos/shared';

export type { ParsedTrigger, ParsedCondition, ParsedAction };
export { AUTOMATION_ENGINE_CAPABILITIES };

/**
 * AutomationRule：业务接口定义。
 * - 表示：modules/automation/yaml-parse.util.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface AutomationRule {
  id: string;
  name: string;
  triggers: ParsedTrigger[];
  conditions: ParsedCondition[];
  actions: ParsedAction[];
  mode: string;
  enabled: boolean;
  /** DAG 互斥组：同组自动化互斥执行 */
  mutexGroup?: string;
}

/** 解析自动化 YAML 为 AutomationRule（解析失败返回 null），并审计本地引擎能力支持 */
export function parseAutomationYaml(
  id: string,
  name: string,
  yamlStr: string,
  warn?: (message: string) => void,
): AutomationRule | null {
  const parsed = parseAutomationYamlCore(yamlStr, name, warn);
  if (!parsed) return null;
  const { core, rawActionCount } = parsed;

  auditAutomationEngineSupport(
    core.name,
    core.triggers,
    core.conditions,
    rawActionCount,
    core.actions,
    warn,
  );

  return {
    id,
    name: core.name,
    triggers: core.triggers,
    conditions: core.conditions,
    actions: core.actions,
    mode: core.mode,
    enabled: true,
    mutexGroup: core.mutexGroup,
  };
}
