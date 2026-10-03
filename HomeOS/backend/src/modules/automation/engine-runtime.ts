/**
 * 自动化引擎对其他 Nest 模块的公开导出面（运行时类型）。
 *
 * 所属模块：backend/modules/automation
 * 职责：聚合 internals 中需要被外部 Nest 模块（script / scene 等）复用的类型与函数，
 *  避免外部模块直接 import *.internals 文件，保持 internals 的内部可见性。
 * 导出内容：AutomationTraceStep、条件判定相关工具与依赖类型。
 */
export type { AutomationTraceStep } from './engine-actions.internals';

export {
  checkAutomationConditionList,
  automationEntityIdsOf,
  checkAutomationSunCondition,
  checkAutomationTimeCondition,
  resolveAutomationTemplateWithRuntime,
  type AutomationConditionDeps,
} from './engine-conditions.internals';

export { waitForTriggers } from './engine-triggers.internals';
