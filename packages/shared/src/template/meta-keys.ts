/** - 收敛 template YAML 中"非平台段"的元数据键（trigger / condition / action / */
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
