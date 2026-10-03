/**
 * 自定义 HTML 微件：源码解析与沙盒 API 辅助
 *
 * 职责：
 * - 解析自定义 HTML 微件源码（template / script / style 三段）。
 * - 提供沙盒 API 辅助：HA 实体查询、服务调用、状态订阅的受控注入。
 * - 提供解析错误收集与回退渲染，避免用户代码异常导致面板崩溃。
 *
 * 依赖：调用方注入的 HA 实体 / service 调用上下文。
 *
 * 注意：
 * - 用户源码中的 HTML / CSS / JS 为用户内容，不翻译。
 * - 仅面向用户的错误文案 / 提示使用简体中文。
 */

type CustomHtmlParseResult = {
  template: string
  scriptExport: Record<string, unknown>
  styles: string
  scoped: boolean
  parseError: string | null
  /** 非管理员等场景下忽略了 <script> 块 */
  scriptsStripped: boolean
}

const STYLE_REGEX = /<style(\s[^>]*)?>([\s\S]*?)<\/style>/gi
const SCRIPT_REGEX = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi
const SCRIPT_TAG_TEST = /<script\b/i
const TEMPLATE_REGEX = /<template>([\s\S]*?)<\/template>/i
const EXPORT_DEFAULT_REGEX = /export\s+default\s+({[\s\S]*})/i

/** 去掉原生 HTML 事件属性（on*），降低模板 XSS 面；Vue @ 事件仍由权限控制沙盒 API */
function sanitizeCustomHtmlTemplate(template: string): string {
  if (!template) return template
  return template
    .replace(/\s+on[a-zA-Z]+\s*=\s*(["'])[\s\S]*?\1/g, '')
    .replace(/\s+on[a-zA-Z]+\s*=\s*[^\s>]+/g, '')
}

const KEYFRAME_STOP_RE = /^(from|to|\d+(\.\d+)?%)$/i

/** 将 CSS 规则限定在微件作用域内（跳过 @keyframes 关键帧，避免把 0%/50% 误加上作用域前缀） */
export function scopeCustomHtmlCss(css: string, scopeSelector: string): string {
  if (!css.trim()) return ''
  return css.replace(/(^|})\s*([^@{}][^{]*)\{/g, (_match, prefix, selectors) => {
    const scoped = selectors
      .split(',')
      .map((s: string) => {
        const trimmed = s.trim()
        if (!trimmed || trimmed.startsWith('@') || KEYFRAME_STOP_RE.test(trimmed)) return trimmed
        return `${scopeSelector} ${trimmed}`
      })
      .join(', ')
    return `${prefix} ${scoped} {`
  })
}

function parseScriptExport(scriptContent: string): {
  scriptExport: Record<string, unknown>
  error: string | null
} {
  if (!scriptContent.trim()) return { scriptExport: {}, error: null }

  const exportMatch = EXPORT_DEFAULT_REGEX.exec(scriptContent)
  if (!exportMatch) {
    return { scriptExport: {}, error: null }
  }

  try {
    const scriptExport = Function(`return ${exportMatch[1]}`)() as Record<string, unknown>
    if (!scriptExport || typeof scriptExport !== 'object') {
      return { scriptExport: {}, error: '脚本 export default 必须返回对象' }
    }
    return { scriptExport, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { scriptExport: {}, error: `逻辑错误：${message}` }
  }
}

/**
 * 解析用户输入的 rawHtml
 * - 提取并移除 <style>、<script>、<template>
 * - allowScripts=false 时忽略 <script>（访客/儿童仅渲染静态模板）
 */
export function parseCustomHtmlWidget(
  raw: string,
  options: { allowScripts?: boolean } = {},
): CustomHtmlParseResult {
  const allowScripts = options.allowScripts !== false
  if (!raw?.trim()) {
    return {
      template: '',
      scriptExport: {},
      styles: '',
      scoped: false,
      parseError: null,
      scriptsStripped: false,
    }
  }

  const scriptsStripped = !allowScripts && SCRIPT_TAG_TEST.test(raw)

  let extractedStyles = ''
  let scoped = false
  let processed = raw
  let match: RegExpExecArray | null

  STYLE_REGEX.lastIndex = 0
  for (; (match = STYLE_REGEX.exec(raw)) !== null;) {
    const attrs = match[1] || ''
    if (/\bscoped\b/i.test(attrs)) scoped = true
    extractedStyles += match[2] + '\n'
  }
  processed = processed.replace(STYLE_REGEX, '')

  let scriptContent = ''
  if (allowScripts) {
    SCRIPT_REGEX.lastIndex = 0
    const scripts: string[] = []
    for (; (match = SCRIPT_REGEX.exec(raw)) !== null;) {
      scripts.push(match[1])
    }
    scriptContent = scripts.join('\n')
  }
  processed = processed.replace(SCRIPT_REGEX, '')

  const templateMatch = TEMPLATE_REGEX.exec(processed)
  if (templateMatch) {
    processed = templateMatch[1]
  }

  const { scriptExport, error: parseError } = allowScripts
    ? parseScriptExport(scriptContent)
    : { scriptExport: {}, error: null }

  return {
    template: sanitizeCustomHtmlTemplate(processed.trim()),
    scriptExport,
    styles: extractedStyles.trim(),
    scoped,
    parseError,
    scriptsStripped,
  }
}

/** CUSTOM_HTML_WIDGET_EMPTY_TEMPLATE：常量，取值语义见定义处。 */
export const CUSTOM_HTML_WIDGET_EMPTY_TEMPLATE =
  '<div class=\'p-4 text-center chwt-default-empty font-medium font-inter tracking-tight\'>✨ 客制化引擎已就绪</div>'

/** setup(ctx) 注入时可用的 API 键名 */
type CustomHtmlSetupContext = Partial<
  Record<
    | 'haStore'
    | 'uiStore'
    | 'widgetId'
    | 'entityState'
    | 'entityAttr'
    | 'entityName'
    | 'toggleEntity'
    | 'callService'
    | 'notify',
    unknown
  >
> &
  Record<string, unknown>

function normalizeSetupReturn(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/**
 * 调用用户 setup（显式接收沙盒 API ctx；setup 无参声明时 JS 会忽略多余实参，行为天然兼容）。
 * 必须在动态组件的 Vue setup() 同步阶段调用，onMounted / onUnmounted 才能绑定到当前实例。
 */
export function invokeCustomHtmlSetup(
  setupFn: (ctx?: CustomHtmlSetupContext) => Record<string, unknown> | void,
  ctx: CustomHtmlSetupContext,
): Record<string, unknown> {
  if (typeof setupFn !== 'function') return {}
  return normalizeSetupReturn(setupFn(ctx))
}

/** formatCustomHtmlSetupError：函数，按签名入参返回处理结果。 */
export function formatCustomHtmlSetupError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/^(haStore|uiStore|entityState|entityAttr|entityName|toggleEntity|callService|notify) is not defined$/.test(message)) {
    return `${message}。请在 setup 中解构沙盒 API，例如 setup({ haStore, entityState }) { ... }`
  }
  return message
}

/** CUSTOM_HTML_WIDGET_API_ITEMS：常量集合，成员语义见定义处。 */
export const CUSTOM_HTML_WIDGET_API_ITEMS = [
  {
    name: 'setup(ctx)',
    desc: '脚本 setup 接收沙盒 API 对象；模板中也可直接使用下列名称',
    example: 'setup({ haStore, entityState, toggleEntity }) { ... }',
  },
  {
    name: 'haStore',
    desc: '实体状态仓库（entities、callService 等）',
    example: 'haStore.entities[\'light.living_room\']?.state',
  },
  {
    name: 'uiStore',
    desc: '布局与 UI 配置、全局通知',
    example: 'uiStore.notify(\'操作成功\', \'success\')',
  },
  {
    name: 'entityState(id)',
    desc: '读取实体 state 字符串',
    example: 'entityState(\'sensor.temp\')',
  },
  {
    name: 'entityAttr(id, key)',
    desc: '读取实体 attributes',
    example: 'entityAttr(\'climate.ac\', \'temperature\')',
  },
  {
    name: 'entityName(id)',
    desc: '读取实体友好名称',
    example: 'entityName(\'light.living_room\')',
  },
  {
    name: 'toggleEntity(id)',
    desc: '切换开关类实体',
    example: 'toggleEntity(\'input_boolean.guest_mode\')',
  },
  {
    name: 'callService(domain, service, id, data?)',
    desc: '调用 HA 服务',
    example: 'callService(\'light\', \'turn_on\', \'light.kitchen\', { brightness: 200 })',
  },
  {
    name: 'widgetId',
    desc: '当前微件实例 ID',
    example: 'widgetId',
  },
] as const

type CustomHtmlSnippet = {
  id: string
  label: string
  desc: string
  code: string
}

const SCRIPT_OPEN = '<' + 'script>'
const SCRIPT_CLOSE = '</' + 'script>'

/** CUSTOM_HTML_WIDGET_SNIPPETS：常量集合，成员语义见定义处。 */
export const CUSTOM_HTML_WIDGET_SNIPPETS: CustomHtmlSnippet[] = [
  {
    id: 'toggle-switch',
    label: '开关按钮',
    desc: '点击切换单个开关/布尔实体',
    code: `${SCRIPT_OPEN}
export default {
  setup({ entityState, entityName, toggleEntity }) {
    const { ref } = window.require('vue');
    const entityId = ref('input_boolean.example');
    return { entityId, entityState, entityName, toggleEntity };
  }
}
${SCRIPT_CLOSE}

<template>
  <button
    type="button"
    class="p-3 rounded-xl border w-full text-left transition-all"
    :class="entityState(entityId) === 'on'
      ? 'bg-emerald-600/25 border-emerald-500/40 text-emerald-300'
      : 'bg-black/30 border-white/10 text-gray-400'"
    @click="toggleEntity(entityId)"
  >
    <span class="text-sm font-semibold">{{ entityName(entityId) }}</span>
    <span class="block text-[12px] opacity-60 mt-1">{{ entityState(entityId) }}</span>
  </button>
</template>`,
  },
  {
    id: 'sensor-card',
    label: '传感器卡片',
    desc: '展示传感器数值与单位',
    code: `<template>
  <div class="p-4 rounded-xl bg-white/5 border border-white/10">
    <p class="text-[12px] uppercase tracking-wider text-gray-500 mb-1">传感器</p>
    <p class="text-2xl font-bold text-white tabular-nums">
      {{ entityState('sensor.living_room_temperature') || '—' }}
      <span class="text-sm font-normal text-gray-400">{{ entityAttr('sensor.living_room_temperature', 'unit_of_measurement') }}</span>
    </p>
    <p class="text-xs text-gray-500 mt-1">{{ entityName('sensor.living_room_temperature') }}</p>
  </div>
</template>`,
  },
  {
    id: 'climate-summary',
    label: '空调摘要',
    desc: '显示目标温度与 HVAC 模式',
    code: `${SCRIPT_OPEN}
export default {
  setup({ entityState, entityAttr, callService }) {
    const entityId = 'climate.living_room';
    const setTemp = (delta) => {
      const cur = Number(entityAttr(entityId, 'temperature') || 22);
      callService('climate', 'set_temperature', entityId, { temperature: cur + delta });
    };
    return { entityId, entityState, entityAttr, setTemp };
  }
}
${SCRIPT_CLOSE}

<template>
  <div class="p-4 rounded-xl bg-sky-950/40 border border-sky-500/20 space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-sky-200">{{ entityName(entityId) }}</span>
      <span class="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300">{{ entityState(entityId) }}</span>
    </div>
    <p class="text-3xl font-bold text-white tabular-nums">{{ entityAttr(entityId, 'temperature') }}°</p>
    <div class="flex gap-2">
      <button type="button" class="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10" @click="setTemp(-1)">−</button>
      <button type="button" class="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10" @click="setTemp(1)">+</button>
    </div>
  </div>
</template>`,
  },
  {
    id: 'static-banner',
    label: '静态横幅',
    desc: '纯 HTML + Tailwind，无脚本',
    code: `<template>
  <div class="p-4 rounded-xl bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20 border border-white/10">
    <p class="text-xs font-bold uppercase tracking-widest text-violet-300 mb-2">HomeOS</p>
    <h3 class="text-lg font-bold text-white">自定义欢迎语</h3>
    <p class="text-sm text-white/60 mt-1">在此编写任意静态内容</p>
  </div>
</template>`,
  },
  {
    id: 'notify-action',
    label: '通知按钮',
    desc: '点击触发全局 toast 通知',
    code: `${SCRIPT_OPEN}
export default {
  setup({ notify }) {
    const onClick = () => notify('操作已执行', 'success');
    return { onClick };
  }
}
${SCRIPT_CLOSE}

<template>
  <button
    type="button"
    class="w-full py-3 rounded-xl bg-violet-600/30 border border-violet-500/40 text-violet-200 text-sm font-semibold hover:bg-violet-600/40 transition-colors"
    @click="onClick"
  >
    发送测试通知
  </button>
</template>`,
  },
]

/** 在 textarea 光标处插入文本，返回新全文 */
export function insertTextAtSelection(
  textarea: HTMLTextAreaElement | null,
  text: string,
  currentValue: string,
): string {
  if (!textarea) return currentValue + text

  const start = textarea.selectionStart ?? currentValue.length
  const end = textarea.selectionEnd ?? start
  const next = currentValue.slice(0, start) + text + currentValue.slice(end)

  const cursor = start + text.length
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursor, cursor)
  })

  return next
}

/** 将片段写入编辑器：空内容时整页替换，否则在光标处插入 */
export function applyCustomHtmlSnippet(
  current: string,
  snippetCode: string,
  options: { replaceIfEmpty?: boolean } = {},
): string {
  const replaceIfEmpty = options.replaceIfEmpty !== false
  if (replaceIfEmpty && !current.trim()) return snippetCode
  return current.trim() ? `${current.trimEnd()}\n\n${snippetCode}` : snippetCode
}

/** CustomHtmlEditorParts：类型定义，字段语义见声明。 */
export type CustomHtmlEditorParts = {
  script: string
  template: string
  style: string
  styleScoped: boolean
}

/** 将 rawHtml 拆为分块编辑器的 script / template / style */
export function decomposeCustomHtmlWidget(raw: string): CustomHtmlEditorParts {
  const parsed = parseCustomHtmlWidget(raw)
  const hasScript = SCRIPT_TAG_TEST.test(raw)
  const hasTemplate = /<template>/i.test(raw)
  const hasStyle = /<style/i.test(raw)

  let script = ''
  if (hasScript) {
    SCRIPT_REGEX.lastIndex = 0
    const scripts: string[] = []
    let match: RegExpExecArray | null
    for (; (match = SCRIPT_REGEX.exec(raw)) !== null;) {
      scripts.push(match[1].trim())
    }
    script = scripts.join('\n\n')
  }

  let template = ''
  if (hasTemplate) {
    template = parsed.template
  } else if (!hasScript && !hasStyle) {
    template = parsed.template
  } else {
    template = parsed.template
  }

  return {
    script: script,
    template: template || '',
    style: parsed.styles,
    styleScoped: parsed.scoped,
  }
}

/** 将分块编辑器内容合并为 rawHtml */
export function composeCustomHtmlWidget(parts: CustomHtmlEditorParts): string {
  const chunks: string[] = []
  const script = parts.script.trim()
  const template = parts.template.trim()
  const style = parts.style.trim()

  if (script) {
    chunks.push(`${SCRIPT_OPEN}\n${script}\n${SCRIPT_CLOSE}`)
  }
  if (template) {
    chunks.push(`<template>\n${template}\n</template>`)
  }
  if (style) {
    const scopedAttr = parts.styleScoped ? ' scoped' : ''
    chunks.push(`<style${scopedAttr}>\n${style}\n</style>`)
  }

  return chunks.join('\n\n')
}

/** CustomHtmlScaffoldKind：类型定义，字段语义见声明。 */
export type CustomHtmlScaffoldKind = 'toggle' | 'sensor' | 'static' | 'multi-toggle'

/** 根据实体与类型生成可立即预览的面板微件源码 */
export function buildCustomHtmlScaffold(
  kind: CustomHtmlScaffoldKind,
  entityIds: string[] = [],
): string {
  const primary = entityIds[0] || 'input_boolean.example'

  if (kind === 'static') {
    return composeCustomHtmlWidget({
      script: '',
      template: `<div class="p-4 rounded-xl bg-gradient-to-br from-violet-600/25 to-fuchsia-600/15 border border-white/10">
  <p class="text-[12px] uppercase tracking-widest text-violet-300 mb-2">自定义面板</p>
  <h3 class="text-base font-bold text-white">在此编写内容</h3>
  <p class="text-xs text-white/50 mt-1">纯静态卡片，无需绑定实体</p>
</div>`,
      style: '',
      styleScoped: false,
    })
  }

  if (kind === 'sensor') {
    return composeCustomHtmlWidget({
      script: '',
      template: `<div class="p-4 rounded-xl bg-white/5 border border-white/10">
  <p class="text-[12px] uppercase tracking-wider text-gray-500 mb-1">{{ entityName('${primary}') }}</p>
  <p class="text-2xl font-bold text-white tabular-nums">
    {{ entityState('${primary}') || '—' }}
    <span class="text-sm font-normal text-gray-400">{{ entityAttr('${primary}', 'unit_of_measurement') }}</span>
  </p>
</div>`,
      style: '',
      styleScoped: false,
    })
  }

  if (kind === 'multi-toggle' && entityIds.length > 0) {
    const buttons = entityIds
      .map(
        (id) => `    <button
      type="button"
      class="p-2.5 rounded-lg border text-left text-xs transition-all"
      :class="entityState('${id}') === 'on'
        ? 'bg-emerald-600/20 border-emerald-500/35 text-emerald-300'
        : 'bg-black/25 border-white/8 text-gray-400'"
      @click="toggleEntity('${id}')"
    >
      <span class="font-semibold block truncate">{{ entityName('${id}') }}</span>
      <span class="opacity-60">{{ entityState('${id}') }}</span>
    </button>`,
      )
      .join('\n')

    return composeCustomHtmlWidget({
      script: `export default {
  setup({ entityState, entityName, toggleEntity }) {
    return { entityState, entityName, toggleEntity };
  }
}`,
      template: `<div class="p-3 rounded-xl bg-black/20 border border-white/8 space-y-2">\n${buttons}\n</div>`,
      style: '',
      styleScoped: false,
    })
  }

  return composeCustomHtmlWidget({
    script: `export default {
  setup({ entityState, entityName, toggleEntity }) {
    const { ref } = window.require('vue');
    const entityId = ref('${primary}');
    return { entityId, entityState, entityName, toggleEntity };
  }
}`,
    template: `<button
  type="button"
  class="p-3 rounded-xl border w-full text-left transition-all"
  :class="entityState(entityId) === 'on'
    ? 'bg-emerald-600/25 border-emerald-500/40 text-emerald-300'
    : 'bg-black/30 border-white/10 text-gray-400'"
  @click="toggleEntity(entityId)"
>
  <span class="text-sm font-semibold">{{ entityName(entityId) }}</span>
  <span class="block text-[12px] opacity-60 mt-1">{{ entityState(entityId) }}</span>
</button>`,
    style: '',
    styleScoped: false,
  })
}

/** textarea 缩进：选中多行或当前行 Tab / Shift+Tab */
export function handleCodeTextareaKeydown(
  event: KeyboardEvent,
  currentValue: string,
  onValueChange: (next: string) => void,
  textarea: HTMLTextAreaElement | null,
): boolean {
  if (event.key !== 'Tab') return false
  event.preventDefault()
  if (!textarea) return true

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const indent = '  '

  if (start !== end) {
    const selected = currentValue.slice(start, end)
    const lines = selected.split('\n')
    const nextSelected = event.shiftKey
      ? lines.map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line.replace(/^\t/, ''))).join('\n')
      : lines.map((line) => indent + line).join('\n')
    const next = currentValue.slice(0, start) + nextSelected + currentValue.slice(end)
    onValueChange(next)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start, start + nextSelected.length)
    })
    return true
  }

  const next = insertTextAtSelection(textarea, event.shiftKey ? '' : indent, currentValue)
  if (!event.shiftKey) {
    onValueChange(next)
    return true
  }

  const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1
  const lineEndIdx = currentValue.indexOf('\n', start)
  const lineEnd = lineEndIdx === -1 ? currentValue.length : lineEndIdx
  const line = currentValue.slice(lineStart, lineEnd)
  let unindented = line
  if (line.startsWith(indent)) unindented = line.slice(indent.length)
  else if (line.startsWith('\t')) unindented = line.slice(1)
  else return true

  const outdentNext = currentValue.slice(0, lineStart) + unindented + currentValue.slice(lineEnd)
  onValueChange(outdentNext)
  const cursor = Math.max(lineStart, start - (line.length - unindented.length))
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursor, cursor)
  })
  return true
}
