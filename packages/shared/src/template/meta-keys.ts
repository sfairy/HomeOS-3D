/**
 * @file meta-keys.ts
 * @module @homeos/shared/template
 * @brief HA template YAML 元数据键集合（非平台段的 trigger / action / sequence 等）。
 *
 * 职责：
 *  - 收敛 template YAML 中"非平台段"的元数据键（trigger / condition / action /
 *    choose / sequence / repeat / parallel / delay / wait_template 等）；
 *  - 供 yaml-blocks 在提取平台实体项 / 归一化根节点时跳过这些键。
 *
 * 关键依赖：
 *  - yaml-blocks.ts 的 extractFirstTemplateItemFromParsed / normalizeTemplateRoot 使用本集合。
 *
 * 约定：
 *  - 同时收录单数与复数形式（trigger/triggers、action/actions 等）；
 *  - 不包含 platform 段名（sensor / fan / switch 等）。
 */
/** HA template YAML 元数据键（非 template 平台段） */
export const TEMPLATE_META_KEYS = new Set([
  'trigger',
  'triggers',
  'condition',
  'conditions',
  'variables',
  'action',
  'actions',
  'choose',
  'sequence',
  'repeat',
  'parallel',
  'delay',
  'wait_template',
]);
