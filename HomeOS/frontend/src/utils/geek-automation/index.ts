/**
 * 极客自动化（Geek Automation）模块对外统一出口（barrel）
 *
 * 职责：
 * - 聚合极客自动化画布的对外工具：图模型、模板、画布布局与摘要。
 * - 供设置页「自动化画布」与编排器统一 import，避免散落引用子模块。
 *
 * 依赖：./graph-types、./templates、./canvas.util 子模块。
 */
export {
  createEmptyGeekGraph,
  GEEK_ACTION_LABELS,
  type GeekGraph,
} from './graph-types'
export {
  getGeekTemplate,
  geekTemplateStats,
  isGeekGraphNonEmpty,
} from './templates'
export {
  layoutCanvasFromGraph,
  triggerSummary,
  conditionSummary,
  actionSummary,
} from './canvas.util'
