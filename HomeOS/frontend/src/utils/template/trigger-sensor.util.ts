/**
 * 触发式模板传感器（trigger-based template）YAML 解析与构建工具。
 *
 * 职责：
 * - 在可视化表单 ↔ trigger-based template YAML 之间双向转换
 * - 识别功率阈值/直接引用等常见 state 表达式，回退到全文正则扫描
 * - 判断 YAML 是否为占位片段、是否疑似功率/开关类 trigger 模板
 *
 * 关键算法：通过预定义正则匹配 HA Jinja2 state 表达式（POWER_THRESHOLD_RE /
 * POWER_THRESHOLD_BLOCK_RE / DIRECT_STATE_RE），不依赖完整 js-yaml 解析即可识别常用模式。
 *
 * 依赖：@homeos/shared 的 loadHaYaml / collectTemplateBlocks。
 */

import { loadHaYaml } from '@homeos/shared'
import { collectTemplateBlocks } from '@homeos/shared'

/** 默认可视化表单 */
export function defaultTriggerSensorForm() {
  return {
    uniqueId: '',
    platform: 'sensor',
    stateMode: 'power_threshold',
    triggerEntityId: '',
    threshold: 80,
    thresholdOp: '>=',
    onValue: 'on',
    offValue: 'off',
    homeassistantStart: true,
    customState: '',
    recognized: true,
  }
}

/** 功率阈值比较符（长运算符优先匹配，避免 `>` 吃掉 `>=`） */
const THRESHOLD_OPS = ['>=', '<=', '==', '!=', '>', '<'] as const
const THRESHOLD_OP_SET = new Set<string>(THRESHOLD_OPS)
const THRESHOLD_OP_RE = '(?:>=|<=|==|!=|>|<)'

/** 匹配内联功率阈值 state：{{ 'on' if (states('sensor.x') | float(0)) >= 80 else 'off' }}，捕获 on 值/entity_id/比较符/阈值/off 值 */
const POWER_THRESHOLD_RE = new RegExp(
  String.raw`\{\{\s*['"]?(\w+)['"]?\s+if\s+\(\s*states\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\|\s*float\s*\(\s*0\s*\)\s*\)\s*(${THRESHOLD_OP_RE})\s*([\d.]+)\s+else\s+['"]?(\w+)['"]?\s*\}\}`,
  's',
)
/** 匹配块式功率阈值 state：{% if (states('sensor.x') | float(0)) >= 80 %}on{% else %}off{% endif %}，捕获 entity_id/比较符/阈值/on/off */
const POWER_THRESHOLD_BLOCK_RE = new RegExp(
  String.raw`\{%\s*if\s+\(\s*states\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\|\s*float\s*\(\s*0\s*\)\s*\)\s*(${THRESHOLD_OP_RE})\s*([\d.]+)\s*%\}\s*(\w+)\s*\{%\s*else\s*%\}\s*(\w+)\s*\{%\s*endif\s*%\}`,
  's',
)
/** 匹配直接引用 state：{{ states('sensor.x') }}，仅捕获被引用的 entity_id */
const DIRECT_STATE_RE = /\{\{\s*states\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/

/**
 * 归一化 YAML 中的引号与空白：把成对单引号还原为单个、压缩连续空白。
 * 便于后续正则匹配折叠标量/多行 state 文本。
 *
 * @param text 原始文本
 * @returns 归一化后的单行文本
 */
function normalizeQuoteText(text: unknown) {
  const singleQuote = '\u0027'
  return String(text || '')
    .replace(/''/g, singleQuote)
    .replace(/\s+/g, ' ')
    .trim()
}

/** stub / 折叠标量里的占位 state，不应写入生成 YAML */
function isPlaceholderStateText(stateText: unknown) {
  const t = normalizeQuoteText(stateText).replace(/^>-\s*/i, '')
  if (!t) return true
  return /^#\s*占位/.test(t) || /占位：HA 未返回/.test(t) || /占位片段/.test(t)
}

/**
 * 读取 platform 项的 state 文本并归一化；占位 state 文本返回空串。
 * @param item 单个 platform 项（sensor/binary_sensor 等）
 * @returns state 文本或空串
 */
function flattenStateText(item: Record<string, unknown> | null | undefined) {
  const raw = item?.state
  if (raw == null) return ''
  const text = normalizeQuoteText(raw)
  if (isPlaceholderStateText(text)) return ''
  return text
}

/**
 * 从 YAML 文本中用正则提取 state: 行内容（兼容内联与折叠标量）。
 * @param yamlStr YAML 文本
 * @returns 归一化后的 state 文本或空串
 */
function extractStateFromText(yamlStr: string) {
  const text = yamlStr
  const blockMatch = text.match(/state:\s*(?:>[-|]?\s*\n\s*)?(.+?)(?:\n\s{4,}\w+:|$)/s)
  if (blockMatch) return normalizeQuoteText(blockMatch[1])
  const inline = text.match(/state:\s*(.+)/)
  return inline ? normalizeQuoteText(inline[1]) : ''
}

/**
 * 将 state 表达式文本解析为可视化表单字段（stateMode/triggerEntityId/threshold 等）。
 * 依次尝试内联功率阈值 → 块式功率阈值 → 直接引用 → 占位文本，命中即返回 recognized=true。
 * @param stateText state 表达式文本
 * @returns 解析结果对象
 */
function parseStateExpression(stateText: string) {
  const result: Record<string, unknown> = {
    stateMode: 'custom',
    triggerEntityId: '',
    threshold: 80,
    thresholdOp: '>=',
    onValue: 'on',
    offValue: 'off',
    customState: stateText || '',
    recognized: false,
  }
  if (!stateText) return result

  const m1 = stateText.match(POWER_THRESHOLD_RE)
  if (m1) {
    return {
      stateMode: 'power_threshold',
      triggerEntityId: m1[2],
      threshold: parseFloat(m1[4]) || 80,
      thresholdOp: m1[3] || '>=',
      onValue: m1[1] || 'on',
      offValue: m1[5] || 'off',
      homeassistantStart: true,
      customState: '',
      recognized: true,
    }
  }

  const m2 = stateText.match(POWER_THRESHOLD_BLOCK_RE)
  if (m2) {
    return {
      stateMode: 'power_threshold',
      triggerEntityId: m2[1],
      threshold: parseFloat(m2[3]) || 80,
      thresholdOp: m2[2] || '>=',
      onValue: m2[4] || 'on',
      offValue: m2[5] || 'off',
      homeassistantStart: true,
      customState: '',
      recognized: true,
    }
  }

  const m3 = stateText.match(DIRECT_STATE_RE)
  if (m3 && stateText.trim() === m3[0].trim()) {
    return {
      stateMode: 'direct',
      triggerEntityId: m3[1],
      threshold: 80,
      thresholdOp: '>=',
      onValue: 'on',
      offValue: 'off',
      homeassistantStart: true,
      customState: '',
      recognized: true,
    }
  }

  if (isPlaceholderStateText(stateText)) {
    return {
      stateMode: 'power_threshold',
      triggerEntityId: '',
      threshold: 80,
      thresholdOp: '>=',
      onValue: 'on',
      offValue: 'off',
      homeassistantStart: true,
      customState: '',
      recognized: false,
    }
  }

  return result
}

/** 从 trigger 段的 platform: state 块中提取 entity_id（用于全文扫描兜底） */
const TRIGGER_ENTITY_ID_RE =
  /platform:\s*state[^\n]*\n\s*entity_id:\s*['"]?([a-z][a-z0-9_]*\.[a-z0-9_]+)['"]?/i

/** 从 YAML 全文扫描 trigger 段与 state 表达式（不依赖 js-yaml 完整解析） */
function scanTriggerFieldsFromYamlText(yamlStr: string) {
  const text = yamlStr
  const out: Record<string, unknown> = {
    triggerEntityId: '',
    stateMode: '',
    threshold: 80,
    thresholdOp: '>=',
    onValue: 'on',
    offValue: 'off',
    recognized: false,
  }
  if (!text.trim()) return out

  const triggerHit = yamlStr.match(TRIGGER_ENTITY_ID_RE)
  if (triggerHit) out.triggerEntityId = triggerHit[1]

  const m1 = yamlStr.match(POWER_THRESHOLD_RE)
  if (m1) {
    out.stateMode = 'power_threshold'
    out.triggerEntityId = out.triggerEntityId || m1[2]
    out.threshold = parseFloat(m1[4]) || 80
    out.thresholdOp = m1[3] || '>='
    out.onValue = m1[1] || 'on'
    out.offValue = m1[5] || 'off'
    out.recognized = true
    return out
  }

  const m2 = yamlStr.match(POWER_THRESHOLD_BLOCK_RE)
  if (m2) {
    out.stateMode = 'power_threshold'
    out.triggerEntityId = out.triggerEntityId || m2[1]
    out.threshold = parseFloat(m2[3]) || 80
    out.thresholdOp = m2[2] || '>='
    out.onValue = m2[4] || 'on'
    out.offValue = m2[5] || 'off'
    out.recognized = true
    return out
  }

  if (out.triggerEntityId) {
    out.stateMode = 'power_threshold'
    out.recognized = true
  }
  return out
}

/** 是否为 HA 导入占位 YAML（无完整 configuration.yaml 原文） */
export function isIncompleteTemplateYaml(yamlStr: unknown, yamlComplete: unknown) {
  if (yamlComplete === false) return true
  return /占位片段|占位：HA 未返回/.test(String(yamlStr || ''))
}

/** 是否像功率/开关类 trigger 模板（含占位片段） */
export function isLikelyTriggerSensorPattern(uniqueId: unknown, name: unknown, yamlStr: unknown = '') {
  const yamlText = String(yamlStr ?? '')
  const hay = `${uniqueId || ''} ${name || ''} ${yamlText}`.toLowerCase()
  if (/power_state|_power_|electric_power|功率|开关状态|threshold/.test(hay)) return true
  if (
    /电视|dian_shi|dianshi|(^|[^a-z])tv([^a-z]|$)/.test(hay) &&
    !/media_player/.test(yamlText) &&
    (/sensor:|binary_sensor:/.test(yamlText) || !yamlText.trim())
  )
    return true
  return false
}

/**
 * 按 meta（名称/haConfigId/触发实体/已引用 entity_id）补全表单默认值。
 * 对疑似功率/开关类或占位片段的表单，强制切到 power_threshold 模式；缺失触发实体时按命名启发式补全。
 * @param form 待补全表单
 * @param yamlStr YAML 文本
 * @param meta 元信息
 * @returns 补全后的表单
 */
function applyTriggerSensorMetaDefaults(form: Record<string, unknown>, yamlStr: unknown, meta: Record<string, unknown> = {}) {
  const name = meta.name || ''
  if (!form.uniqueId && meta.haConfigId) form.uniqueId = String(meta.haConfigId)
  const incomplete = isIncompleteTemplateYaml(yamlStr, meta.yamlComplete)
  const likely =
    isLikelyTriggerSensorPattern(form.uniqueId, name, yamlStr) ||
    (incomplete && !!form.uniqueId && isLikelyTriggerSensorPattern(form.uniqueId, name, ''))

  if (
    likely ||
    (incomplete && form.uniqueId && /power|state|电视|开关|sensor/.test(`${form.uniqueId} ${name}`))
  ) {
    const placeholderState = isPlaceholderStateText(form.customState)
    if (!form.recognized || (form.stateMode === 'custom' && placeholderState)) {
      form.recognized = true
      if (form.stateMode === 'custom' && placeholderState) {
        form.stateMode = 'power_threshold'
        form.customState = ''
      }
    }
  }

  if (!form.triggerEntityId && meta.triggerEntityId) {
    form.triggerEntityId = String(meta.triggerEntityId)
  }
  if (!form.triggerEntityId && Array.isArray(meta.entityIds)) {
    const selfId = String(meta.haEntityId || '')
    const ids = meta.entityIds.map((id) => String(id))
    const fromTrigger = ids.find(
      (id) => id !== selfId && /power|electric|功率|dian/.test(id) && id.startsWith('sensor.'),
    )
    const fromSensor = ids.find((id) => id !== selfId && id.startsWith('sensor.'))
    if (fromTrigger || fromSensor) form.triggerEntityId = fromTrigger || fromSensor
  }
  if (form.triggerEntityId && form.stateMode === 'power_threshold') form.recognized = true
  return form
}

/** 从 trigger-based YAML 解析为可视化表单 */
export function parseTriggerSensorYaml(yamlStr: unknown, meta: Record<string, unknown> = {}) {
  const form = defaultTriggerSensorForm()
  const text = String(yamlStr ?? '')
  if (!text.trim()) return form

  let block: Record<string, unknown> | null = null
  try {
    const parsed = loadHaYaml(text) as Record<string, unknown>
    const blocks = collectTemplateBlocks(parsed?.template ?? parsed)
    block = (blocks[0] || null) as Record<string, unknown> | null
  } catch {
    /* 文本回退 */
  }

  if (block) {
    const triggers = Array.isArray(block.trigger) ? (block.trigger as Record<string, unknown>[]) : []
    for (const tr of triggers) {
      if (!tr || typeof tr !== 'object') continue
      if (tr.platform === 'state') {
        const eid = tr.entity_id
        form.triggerEntityId = Array.isArray(eid) ? String(eid[0] || '') : String(eid || '')
      }
      if (tr.platform === 'homeassistant' && tr.event === 'start') {
        form.homeassistantStart = true
      }
    }
    if (
      triggers.length &&
      !triggers.some((t) => t?.platform === 'homeassistant' && t?.event === 'start')
    ) {
      form.homeassistantStart = false
    }

    for (const [platform, items] of Object.entries(block)) {
      if (platform === 'trigger' || !Array.isArray(items) || !items[0]) continue
      const item = items[0] as Record<string, unknown>
      form.platform = platform === 'binary_sensor' ? 'binary_sensor' : 'sensor'
      if (item.unique_id) form.uniqueId = String(item.unique_id)
      if (!meta.name && item.name) meta = { ...meta, name: String(item.name) }
      const stateParsed = parseStateExpression(flattenStateText(item))
      Object.assign(form, stateParsed)
      if (stateParsed.recognized) form.recognized = true
      break
    }
  }

  if (!form.uniqueId) {
    const uidMatch = text.match(/unique_id:\s*['"]?([a-zA-Z0-9_]+)['"]?/)
    if (uidMatch) form.uniqueId = uidMatch[1]
  }

  // 无 trigger 段的占位片段：从 state 行推断
  if (!form.triggerEntityId || !form.recognized) {
    const stateText = extractStateFromText(text)
    if (stateText && !isPlaceholderStateText(stateText)) {
      const stateParsed = parseStateExpression(stateText)
      if (stateParsed.recognized) Object.assign(form, stateParsed)
    }
  }

  // 全文扫描（完整 configuration.yaml 原文 / 粘贴导入）
  const scanned = scanTriggerFieldsFromYamlText(text)
  if (scanned.recognized || scanned.triggerEntityId) {
    if (scanned.triggerEntityId) form.triggerEntityId = String(scanned.triggerEntityId)
    if (scanned.stateMode) form.stateMode = String(scanned.stateMode)
    if (scanned.recognized) {
      form.threshold = Number(scanned.threshold) || 80
      form.thresholdOp = String(scanned.thresholdOp || '>=')
      form.onValue = String(scanned.onValue || 'on')
      form.offValue = String(scanned.offValue || 'off')
      form.customState = ''
      form.recognized = true
    }
  }

  if (form.triggerEntityId && form.stateMode === 'power_threshold') form.recognized = true
  if (form.triggerEntityId && form.stateMode === 'direct') form.recognized = true

  return applyTriggerSensorMetaDefaults(form, text, meta) as typeof form
}

/** 是否可用可视化模式编辑（可解析为功率阈值/直接引用等） */
export function canVisualEditTriggerYaml(yamlStr: unknown, meta: Record<string, unknown> = {}) {
  if (!String(yamlStr ?? '').trim()) return true
  const form = parseTriggerSensorYaml(yamlStr, meta)
  return form.recognized
}

/**
 * 由名称生成 slug 形式的 unique_id（小写、下划线、去除非单词字符）。
 * @param name 名称
 * @param fallback 名称为空时的回退值
 * @returns slug 字符串
 */
function slugUniqueId(name: unknown, fallback: string = 'trigger_sensor') {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '')
  return slug || fallback
}

/**
 * 由表单的 stateMode 构造 HA Jinja2 state 表达式字符串。
 * direct→直接引用；custom→自定义文本（占位文本回退到示例）；power_threshold→功率阈值表达式。
 * @param form 可视化表单
 * @returns Jinja2 state 表达式
 */
function buildStateExpression(form: Record<string, unknown>) {
  const eid = String(form.triggerEntityId || '').trim()
  if (form.stateMode === 'direct') {
    return `{{ states('${eid || 'sensor.example'}') }}`
  }
  if (form.stateMode === 'custom') {
    const custom = String(form.customState || '').trim()
    if (custom && !isPlaceholderStateText(custom)) return custom
    // eslint-disable-next-line quotes -- HA Jinja 模板含大量单引号，模板字面量与 Prettier 兼容
    if (!eid) return `{{ 'on' if (states('sensor.example') | float(0)) >= 80 else 'off' }}`
  }
  if (!eid) {
    // eslint-disable-next-line quotes
    return `{{ 'on' if (states('sensor.example') | float(0)) >= 80 else 'off' }}`
  }
  const onV = form.onValue || 'on'
  const offV = form.offValue || 'off'
  const rawOp = String(form.thresholdOp || '>=')
  const op = THRESHOLD_OP_SET.has(rawOp) ? rawOp : '>='
  const th = Number(form.threshold) || 80
  return `{{ '${onV}' if (states('${eid}') | float(0)) ${op} ${th} else '${offV}' }}`
}

/** 由可视化表单生成 trigger-based template YAML */
export function buildTriggerSensorYaml(form: Record<string, unknown>, entName: unknown = '') {
  const uniqueId = String(form.uniqueId ?? '').trim() || slugUniqueId(entName)
  const name = String(entName ?? '').trim() || '模板传感器'
  const platform = form.platform === 'binary_sensor' ? 'binary_sensor' : 'sensor'
  const triggerEntity = String(form.triggerEntityId ?? '').trim() || 'sensor.example'
  const stateExpr = buildStateExpression(form)

  const lines = ['template:', '  - trigger:']
  lines.push('      - platform: state')
  lines.push(`        entity_id: ${triggerEntity}`)
  if (form.homeassistantStart !== false) {
    lines.push('      - platform: homeassistant')
    lines.push('        event: start')
  }
  lines.push(`    ${platform}:`)
  lines.push(`      - name: "${name.replace(/"/g, '\\"')}"`)
  lines.push(`        unique_id: ${uniqueId}`)
  lines.push('        state: >-')
  lines.push(`          ${stateExpr}`)
  return lines.join('\n')
}
