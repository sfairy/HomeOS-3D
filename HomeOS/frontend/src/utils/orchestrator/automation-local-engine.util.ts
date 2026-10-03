/**
 * 本地自动化引擎能力检测与适配工具。
 *
 * 所属模块：联动器 / Orchestrator
 * 职责：
 *   1. 检测 YAML 中是否存在本地自动化引擎（前端/网关侧）不支持的 Home Assistant
 *      特性（如 mqtt、webhook、device 等触发器 / device_id 动作），用于决定是否
 *      必须勾选"由 HA 执行"。
 *   2. 结合后端下发的 `EngineCapabilitiesHint`（引擎能力清单）进一步精确判断：
 *      后端已支持的本地动作不再标为 HA-only。
 *   3. 将联动器表单（Form）的触发器/条件/动作类型映射到本地引擎识别的 platform /
 *      condition / action 键，供表单实时提示"该类型本地引擎暂不支持"。
 *
 * 依赖：纯本地工具，无外部 import；输入为 YAML 文本与可选的能力清单。
 *
 * 关键算法说明：
 *   - 特性检测采用"正则匹配 + 跳过规则"策略，例如 `value_template:` 命中时，
 *     若同时匹配本地可解析模板（contains / states|state_attr | float 比较），
 *     则视为本地引擎可解析，跳过该项告警。
 *   - 脚本与自动化共用 HA_ONLY_PATTERNS；脚本表单另用 SCRIPT_LOCAL_HA_ONLY_ACTIONS。
 */

/** 本地自动化引擎不支持的 HA 触发器/特性（需 runOnHa） */
interface HaExecutionMismatch {
  /** 不支持特性的稳定 id，用于去重与能力清单过滤 */
  id: string
  /** 面向用户展示的中文标签（含原 HA 关键字，便于用户定位） */
  label: string
}

/**
 * 引擎能力提示：由后端下发的本地引擎已支持的动作/条件/触发器清单。
 * 未下发或字段缺失时，按"全量支持"处理（避免误报）。
 */
export interface EngineCapabilitiesHint {
  /** 已支持的 action 类型键（如 call_service、delay） */
  actions?: string[]
  /** 已支持的 condition 类型键（如 state、numeric_state） */
  conditions?: string[]
  /** 已支持的 trigger platform 键（如 state、time） */
  triggers?: string[]
}

/**
 * 本地引擎不支持的 HA 特性规则表（自动化维度）。
 * 每条对应一个 HA 专有触发器/模板，需通过正则在 YAML 文本中匹配。
 */
const HA_ONLY_RULES: HaExecutionMismatch[] = [
  { id: 'value_template', label: 'value_template（复杂模板）' },
  { id: 'condition_template', label: 'condition: template（复杂模板条件）' },
  { id: 'platform_mqtt', label: 'platform: mqtt（MQTT 触发器）' },
  { id: 'platform_geo_location', label: 'platform: geo_location（地理定位）' },
  { id: 'platform_tag', label: 'platform: tag（NFC 标签）' },
  { id: 'platform_nfc', label: 'platform: nfc（NFC）' },
  { id: 'device_action', label: 'device_id（HA 设备动作）' },
]

/**
 * 本地引擎可解析的简单 value_template（contains / 数值比较）。
 * 用于跳过「整文件仅含此类模板」时的 HA-only 误报。
 */
const LOCAL_ENGINE_TEMPLATE_RE =
  /(?:'\s*[^']*\s*'\s+in\s+states\s*\(\s*'[^']+'\s*\))|(?:(?:states\s*\(\s*'[^']+'\s*\)|state_attr\s*\(\s*'[^']+'\s*,\s*'[^']+'\s*\))\s*\|\s*float(?:\([^)]*\))?\s*(?:>=|<=|>|<)\s*[\d.]+)/i

/**
 * 自动化维度的不支持特性匹配规则：
 * - `re`：命中即视为出现该特性。
 * - `skipIf`：若同时命中，则认为是本地引擎可处理的简单情形，跳过告警。
 */
const HA_ONLY_PATTERNS: { rule: HaExecutionMismatch; re: RegExp; skipIf?: RegExp }[] = [
  // value_template：contains / float 比较本地可解析；template 触发器由本地引擎周期求值
  { rule: HA_ONLY_RULES[0], re: /value_template:/i, skipIf: /platform:\s*template|(?:'\s*[^']*\s*'\s+in\s+states\s*\(\s*'[^']+'\s*\))|(?:(?:states\s*\(\s*'[^']+'\s*\)|state_attr\s*\(\s*'[^']+'\s*,\s*'[^']+'\s*\))\s*\|\s*float(?:\([^)]*\))?\s*(?:>=|<=|>|<)\s*[\d.]+)/i },
  {
    rule: HA_ONLY_RULES[1],
    re: /condition:\s*template/i,
    skipIf: LOCAL_ENGINE_TEMPLATE_RE,
  },
  { rule: HA_ONLY_RULES[2], re: /platform:\s*mqtt/i },
  { rule: HA_ONLY_RULES[3], re: /platform:\s*geo_location/i },
  { rule: HA_ONLY_RULES[4], re: /platform:\s*tag/i },
  { rule: HA_ONLY_RULES[5], re: /platform:\s*nfc/i },
  // HA 设备动作（非 platform: device 触发器）
  { rule: HA_ONLY_RULES[6], re: /^\s*-?\s*device_id:\s*\S+/m },
]

/**
 * 脚本维度曾叠加的 HA-only 流控（repeat/parallel/wait/variables）已由本地脚本引擎支持。
 * 保留空表以便将来若有脚本独有缺口再叠加；当前与自动化共用 HA_ONLY_PATTERNS（如 device_id）。
 */
const SCRIPT_ONLY_PATTERNS: { rule: HaExecutionMismatch; re: RegExp }[] = []
/**
 * 按规则表顺序匹配 YAML 文本，返回命中的不支持特性列表（已去重）。
 *
 * 算法：
 *   1. 顺序遍历规则表，对每条规则用 `re.test(text)` 判定是否命中。
 *   2. 若该规则已命中过（按 id 去重）则跳过。
 *   3. 若规则带有 `skipIf` 且 `skipIf` 也命中，则视为本地可处理，跳过该项。
 *   4. 命中且未跳过的规则加入结果列表。
 *
 * @param text     - YAML 文本（已 String 化）。
 * @param patterns - 规则表（自动化或脚本维度）。
 * @returns 去重后的不支持特性列表，顺序与规则表一致。
 */
function matchRules(
  text: string,
  patterns: { rule: HaExecutionMismatch; re: RegExp; skipIf?: RegExp }[],
) {
  const seen = new Set<string>()
  const out: HaExecutionMismatch[] = []
  for (const { rule, re, skipIf } of patterns) {
    if (!re.test(text) || seen.has(rule.id)) continue
    if (skipIf && skipIf.test(text)) continue
    seen.add(rule.id)
    out.push(rule)
  }
  return out
}

/**
 * 与后端 capabilities 对齐：本地已支持的动作不再标为 HA-only。
 *
 * 背景：随着本地引擎能力扩展，某些原本不支持的特性（如 wait_for_trigger）
 * 可能已被后端实现；通过 `EngineCapabilitiesHint.actions` 反映。
 * 此函数据此过滤掉已支持的项，避免给用户过时的告警。
 *
 * @param reasons - 初步匹配出的不支持特性列表。
 * @param caps    - 后端下发的引擎能力提示，缺省时不过滤。
 * @returns 过滤后的不支持特性列表。
 */
function filterByEngineCaps(
  reasons: HaExecutionMismatch[],
  caps: EngineCapabilitiesHint | null | undefined,
) {
  if (!caps) return reasons
  const localActions = new Set(caps.actions || [])
  let out = reasons
  // wait_for_trigger / wait_template 已被本地引擎支持时，从告警中移除
  if (localActions.has('wait_for_trigger')) {
    out = out.filter((r) => r.id !== 'wait_for_trigger')
  }
  if (localActions.has('wait_template')) {
    out = out.filter((r) => r.id !== 'wait_template')
  }
  return out
}

/**
 * 检测自动化 YAML 中本地引擎不支持的特性。
 *
 * 调用场景：自动化保存前/编辑器实时校验，判断是否必须勾选"由 HA 执行"。
 *
 * @param yaml       - YAML 文本或任意值（内部会 String 化，空值视为空串）。
 * @param engineCaps - 可选的引擎能力提示，用于精确过滤。
 * @returns 不支持特性列表；为空表示可完全本地执行。
 */
export function getHaExecutionMismatchReasons(
  yaml: unknown,
  engineCaps?: EngineCapabilitiesHint | null,
): HaExecutionMismatch[] {
  const text = String(yaml || '')
  const matched = matchRules(text, HA_ONLY_PATTERNS)
  return filterByEngineCaps(matched, engineCaps)
}

/**
 * 检测脚本 YAML 中本地引擎不支持的特性。
 *
 * 与自动化检测的差异：可叠加 SCRIPT_ONLY_PATTERNS（当前为空）；
 * 流控 choose/repeat/parallel/wait/variables 已由本地脚本引擎支持。
 *
 * @param yaml       - 脚本 YAML 文本或任意值。
 * @param engineCaps - 可选的引擎能力提示。
 * @returns 合并去重后的不支持特性列表。
 */
export function getScriptHaExecutionMismatchReasons(
  yaml: unknown,
  engineCaps?: EngineCapabilitiesHint | null,
): HaExecutionMismatch[] {
  const text = String(yaml || '')
  const ha = getHaExecutionMismatchReasons(text, engineCaps)
  if (!SCRIPT_ONLY_PATTERNS.length) return ha
  const script = matchRules(text, SCRIPT_ONLY_PATTERNS)
  const seen = new Set(ha.map((r) => r.id))
  return [...ha, ...script.filter((r) => !seen.has(r.id))]
}

/**
 * 判断自动化 YAML 是否必须由 HA 执行（存在本地引擎不支持的特性）。
 *
 * @param yaml       - 自动化 YAML 文本或任意值。
 * @param engineCaps - 可选的引擎能力提示。
 * @returns true 表示需要勾选"由 HA 执行"。
 */
export function yamlNeedsHaExecution(yaml: unknown, engineCaps?: EngineCapabilitiesHint | null) {
  return getHaExecutionMismatchReasons(yaml, engineCaps).length > 0
}

/**
 * 判断脚本 YAML 是否必须由 HA 执行（存在本地引擎不支持的特性）。
 *
 * @param yaml       - 脚本 YAML 文本或任意值。
 * @param engineCaps - 可选的引擎能力提示。
 * @returns true 表示需要勾选"由 HA 执行"。
 */
export function scriptNeedsHaExecution(yaml: unknown, engineCaps?: EngineCapabilitiesHint | null) {
  return getScriptHaExecutionMismatchReasons(yaml, engineCaps).length > 0
}

/**
 * 将不支持特性列表格式化为面向用户的中文提示文案。
 *
 * 调用场景：编辑器/保存校验失败时的 Toast 或表单内联提示。
 *
 * @param reasons - 不支持特性列表。
 * @param opts    - 可选配置，`kind` 区分自动化与脚本，影响文案主语。
 * @returns 形如"自动化含本地引擎不支持的特性：xxx、yyy。请勾选「由 HA 执行」后再保存。"的文案。
 */
export function formatHaExecutionMismatchMessage(
  reasons: HaExecutionMismatch[],
  opts?: { kind?: 'automation' | 'script' },
) {
  const kind = opts?.kind === 'script' ? '脚本' : '自动化'
  const items = reasons.map((r) => r.label).join('、')
  return `${kind}含本地引擎不支持的特性：${items}。请勾选「由 HA 执行」后再保存。`
}
/**
 * 联动器表单触发器类型 → HA platform 名映射。
 * 用于把表单内部的简短类型（如 numeric）映射回 HA YAML 中的 platform 字段（numeric_state），
 * 以便与后端下发的引擎能力清单（triggers）比对。
 */
const FORM_TRIGGER_TO_PLATFORM: Record<string, string> = {
  state: 'state',
  numeric: 'numeric_state',
  time: 'time',
  sun: 'sun',
  homeassistant: 'homeassistant',
  event: 'event',
  presence: 'event',
  zone: 'zone',
  calendar: 'calendar',
  onload: 'event',
  interval: 'event',
  sequence: 'state',
  variable: 'event',
  device: 'device',
  webhook: 'webhook',
  template: 'template',
}

/**
 * 联动器表单条件算子 → 本地引擎 condition 类型映射。
 * 表单算子（eq/neq/gt/lt/contains/...）映射到 HA condition 维度
 * （state/numeric_state/template/sun/time），用于与引擎能力清单（conditions）比对。
 */
const FORM_CONDITION_TO_ENGINE: Record<string, string> = {
  eq: 'state',
  neq: 'state',
  gt: 'numeric_state',
  lt: 'numeric_state',
  gte: 'template',
  lte: 'template',
  contains: 'template',
  sun_after: 'sun',
  sun_before: 'sun',
  time_after: 'time',
  time_before: 'time',
  between: 'numeric_state',
  state_for: 'state',
  var_eq: 'homeos_variable',
  var_neq: 'homeos_variable',
  var_gt: 'homeos_variable',
  var_lt: 'homeos_variable',
  var_gte: 'homeos_variable',
  var_lte: 'homeos_variable',
  weekday: 'time',
}

/**
 * 联动器表单动作类型 → 本地引擎 action 类型映射。
 * 多种表单动作（notify/scene/script）统一归并到 call_service；
 * home_mode/notify_homeos 归并到 fire_event（本地通过事件总线触发）。
 */
const FORM_ACTION_TO_ENGINE: Record<string, string> = {
  callService: 'call_service',
  delay: 'delay',
  notify: 'call_service',
  scene: 'call_service',
  script: 'call_service',
  fire_event: 'fire_event',
  wait_for_trigger: 'wait_for_trigger',
  choose: 'choose',
  repeat: 'repeat',
  home_mode: 'fire_event',
  notify_homeos: 'fire_event',
  loop_start: 'fire_event',
  loop_stop: 'fire_event',
  variables: 'variables',
  variable_set: 'call_service',
  var_math: 'call_service',
  var_fn: 'call_service',
  var_concat: 'call_service',
  parallel: 'parallel',
  sequence: 'sequence',
  deviceAction: 'device_action',
  trigger_automation: 'call_service',
  debug: 'fire_event',
  stop: 'stop',
}

/**
 * 判断指定键是否被本地引擎支持。
 *
 * 约定：能力清单字段缺失或为空数组时，视为"全量支持"（返回 true），
 * 避免后端未下发能力清单时误报所有类型不支持。
 *
 * @param list - 能力清单（triggers/conditions/actions 之一）。
 * @param key  - 待检测的引擎键。
 * @returns true 表示支持（或清单未限定）。
 */
function engineSupports(list: string[] | undefined, key: string) {
  if (!list?.length) return true
  return list.includes(key)
}

/**
 * 判断表单触发器类型是否被本地引擎不支持。
 *
 * @param type - 表单触发器类型（state/numeric/time/...）。
 * @param caps - 可选的引擎能力提示。
 * @returns true 表示本地引擎不支持该触发器类型。
 */
export function isFormTriggerUnsupported(type: string, caps?: EngineCapabilitiesHint | null) {
  const platform = FORM_TRIGGER_TO_PLATFORM[type] || type
  return !engineSupports(caps?.triggers, platform)
}

/**
 * 判断表单条件算子是否被本地引擎不支持。
 *
 * @param operator - 表单条件算子（eq/neq/gt/lt/contains/...）。
 * @param caps     - 可选的引擎能力提示。
 * @returns true 表示本地引擎不支持该条件算子。
 */
export function isFormConditionUnsupported(operator: string, caps?: EngineCapabilitiesHint | null) {
  const cond = FORM_CONDITION_TO_ENGINE[operator] || 'state'
  return !engineSupports(caps?.conditions, cond)
}

/**
 * 判断表单动作类型是否被本地引擎不支持。
 *
 * @param type - 表单动作类型（callService/delay/notify/...）。
 * @param caps - 可选的引擎能力提示。
 * @returns true 表示本地引擎不支持该动作类型。
 */
export function isFormActionUnsupported(type: string, caps?: EngineCapabilitiesHint | null) {
  if (type === 'note') return false
  const action = FORM_ACTION_TO_ENGINE[type] || type
  return !engineSupports(caps?.actions, action)
}

/**
 * 脚本本地执行明确不支持的动作（即使自动化 engine caps 声称支持）。
 * 流控/等待/变量已由脚本服务本地支持；仅保留设备动作与触发自动化。
 */
export const SCRIPT_LOCAL_HA_ONLY_ACTIONS = new Set([
  'deviceAction',
  'trigger_automation',
])

/**
 * 脚本画布：在自动化 caps 之上叠加脚本本地能力边界。
 * stop 本地可执行，不再依赖 caps 是否声明 stop。
 */
export function isFormActionUnsupportedForScript(
  type: string,
  caps?: EngineCapabilitiesHint | null,
) {
  if (type === 'note' || type === 'stop') return false
  if (SCRIPT_LOCAL_HA_ONLY_ACTIONS.has(type)) return true
  return isFormActionUnsupported(type, caps)
}