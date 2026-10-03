/**
 * 面板部件「转为自定义代码」：按当前部件的 class / 作用域样式生成可编辑 Vue 源码，
 * 而不是默认示例，也不是把像素尺寸冻成截图。
 */
import {
  createApp,
  h,
  nextTick,
  type App,
  type AppContext,
  type Component,
} from 'vue'
import { getActivePinia } from 'pinia'
import type { PanelWidget } from '@/types/layout'
import { useLayoutStore } from '@/stores/layout.store'
import {
  getWidgetComponent,
  getWidgetProps,
  getSidebarWidgetClass,
} from '@/utils/registry/widget-registry'
import {
  clampPanelCardHeightPx,
  resolveSidebarWidgetHeightPx,
} from '@/utils/widget/panel-widget-height.util'
import clockWidgetCss from '@/components/widgets/system/styles/ClockWidget.css?raw'

const PANEL_WIDGET_ID_ATTR = 'data-panel-widget-id'

const SKIP_ATTR_PREFIXES = ['data-v-', 'data-panel-widget', 'data-widget-eject']
const SKIP_ATTR_NAMES = new Set([
  PANEL_WIDGET_ID_ATTR,
  'data-widget-eject-root',
  'data-widget-eject-host',
])
const SKIPPABLE_WRAPPER_CLASS = [
  'error-boundary-root',
  'error-boundary-root__content',
  'error-boundary-root--compact',
  'error-boundary-root--fill',
]

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/** 对齐侧栏 .info-card 的底、边框、顶光线、底光和悬停；内边距只用时钟自己的 16px 20px */
const CLOCK_CONTENT_HEIGHT_PX = 99
const CLOCK_SHELL_CSS = `.clock.eject-root{
  position:relative;
  box-sizing:border-box;
  width:100%;
  height:100%;
  min-height:72px;
  font-family:inherit;
  -webkit-font-smoothing:antialiased;
  isolation:isolate;
  background:var(--page-card-tint-soft),var(--hos-surface-1,rgba(255,255,255,.045));
  -webkit-backdrop-filter:blur(30px) saturate(200%);
  backdrop-filter:blur(30px) saturate(200%);
  border:var(--hos-hairline) solid var(--hos-border-subtle,rgba(255,255,255,.08));
  border-radius:var(--hos-radius-panel,20px);
  box-shadow:var(--hos-shadow-card,0 4px 18px rgba(0,0,0,.28));
  overflow:hidden;
  -webkit-backface-visibility:hidden;
  backface-visibility:hidden;
  transition:transform var(--hos-transition-panel,.25s cubic-bezier(.32,.72,0,1)),box-shadow var(--hos-transition-panel,.25s cubic-bezier(.32,.72,0,1)),border-color var(--hos-transition-panel,.25s cubic-bezier(.32,.72,0,1)),background var(--hos-transition-panel,.25s cubic-bezier(.32,.72,0,1));
}
.clock.eject-root:hover{
  background:var(--hos-surface-2,rgba(255,255,255,.075));
  border-color:var(--hos-border-strong,var(--premium-border-strong));
  transform:translateY(var(--hos-hover-lift,-1px));
  box-shadow:var(--hos-shadow-card-hover,0 6px 20px rgba(0,0,0,.28));
}
.clock.eject-root::before{
  content:'';
  position:absolute;
  top:0;left:12%;right:12%;
  height:var(--hos-hairline);
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--page-accent,#0a84ff) 40%,white),color-mix(in srgb,var(--page-accent,#0a84ff) 20%,white),transparent);
  z-index:2;
  pointer-events:none;
}
.clock.eject-root::after{
  content:'';
  position:absolute;
  inset:0;
  background:linear-gradient(180deg,transparent 88%,rgba(255,255,255,.01));
  pointer-events:none;
  border-radius:inherit;
}`

const CHROME_CSS = `
[data-widget-eject-host]{box-sizing:border-box;color:inherit}
[data-widget-eject-host] .widget-wrapper{display:flex;flex-direction:column;width:100%;min-height:0}
[data-widget-eject-host] .widget-wrapper--custom-h{content-visibility:visible!important}
[data-widget-eject-host] .info-card{
  background:var(--page-card-tint-soft),var(--hos-surface-1,rgba(255,255,255,.025));
  border-radius:var(--hos-radius-panel,var(--radius-ipad-xl));
}
`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function findLiveWidgetSlot(widgetId: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const safe = widgetId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const el = document.querySelector<HTMLElement>(`[${PANEL_WIDGET_ID_ATTR}="${safe}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width < 8 || rect.height < 8) return null
  return el
}

function isSkippableWrapper(el: Element): boolean {
  return SKIPPABLE_WRAPPER_CLASS.some((cls) => el.classList.contains(cls))
}

/** 取真正的视觉根：时钟含 info-card，其它跳过错误边界与面板外壳 */
function pickVisualRoot(slotRoot: HTMLElement): HTMLElement {
  const card = slotRoot.querySelector<HTMLElement>('.info-card')
  if (card) return card
  const content = slotRoot.querySelector<HTMLElement>('.error-boundary-root__content')
  const inner = content?.firstElementChild
  if (inner instanceof HTMLElement) return inner
  const child = slotRoot.firstElementChild
  return child instanceof HTMLElement ? child : slotRoot
}

function collectScopeAttrs(root: HTMLElement): string[] {
  const hashes = new Set<string>()
  const walk = (el: Element) => {
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-v-')) hashes.add(attr.name)
    }
    for (const child of el.children) walk(child)
  }
  walk(root)
  return [...hashes]
}

function stripScopeFromSelector(selector: string, hashes: string[]): string {
  let next = selector
  for (const hash of hashes) {
    next = next.split(`[${hash}]`).join('')
  }
  return next.replace(/\s+/g, ' ').trim()
}

function extractScopedCss(root: HTMLElement): string {
  const hashes = collectScopeAttrs(root)
  if (!hashes.length) return ''
  const out: string[] = []
  const visit = (rule: CSSRule) => {
    if (rule instanceof CSSStyleRule) {
      if (!hashes.some((hash) => rule.selectorText.includes(`[${hash}]`))) return
      const sel = stripScopeFromSelector(rule.selectorText, hashes)
      if (!sel) return
      out.push(`${sel}{${rule.style.cssText}}`)
      return
    }
    if (rule instanceof CSSMediaRule) {
      const inner: string[] = []
      const start = out.length
      for (const child of rule.cssRules) visit(child)
      if (out.length > start) {
        inner.push(...out.splice(start))
        out.push(`@media ${rule.conditionText}{\n${inner.join('\n')}\n}`)
      }
      return
    }
    if (rule instanceof CSSKeyframesRule) {
      out.push(rule.cssText)
    }
  }
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of rules) visit(rule)
  }
  return out.join('\n')
}

function shouldKeepAttr(name: string): boolean {
  if (SKIP_ATTR_NAMES.has(name)) return false
  if (SKIP_ATTR_PREFIXES.some((p) => name.startsWith(p))) return false
  if (name.startsWith('on')) return false
  return true
}

function serializeAttrs(el: Element): string {
  const bits: string[] = []
  for (const attr of el.attributes) {
    if (!shouldKeepAttr(attr.name)) continue
    if (attr.value === '') bits.push(attr.name)
    else bits.push(`${attr.name}="${escapeHtml(attr.value)}"`)
  }
  return bits.length ? ` ${bits.join(' ')}` : ''
}

function serializeText(text: string): string {
  return escapeHtml(text).replace(/\{\{/g, '{\u200b{').replace(/\}\}/g, '}\u200b}')
}

function serializeCanvas(canvas: HTMLCanvasElement): string {
  try {
    const url = canvas.toDataURL('image/png')
    if (url && url.length > 32) {
      return `<img class="widget-eject-canvas" alt="" src="${url}" />`
    }
  } catch {
    /* tainted canvas */
  }
  return '<div class="widget-eject-canvas">图表区域（请按需用实体数据重绘）</div>'
}

function serializeElement(el: Element, indent: string): string {
  if (isSkippableWrapper(el)) {
    return Array.from(el.childNodes)
      .map((node) => serializeNode(node, indent))
      .join('')
  }
  const tag = el.tagName.toLowerCase()
  if (tag === 'canvas' && el instanceof HTMLCanvasElement) {
    return `${indent}${serializeCanvas(el)}\n`
  }
  if (tag === 'svg') {
    const clone = el.cloneNode(true) as Element
    stripRuntimeTree(clone)
    return `${indent}${clone.outerHTML}\n`
  }
  const attrs = serializeAttrs(el)
  if (VOID_TAGS.has(tag)) return `${indent}<${tag}${attrs} />\n`
  const children = Array.from(el.childNodes)
    .map((node) => serializeNode(node, `${indent}  `))
    .join('')
  if (!children.trim()) return `${indent}<${tag}${attrs}></${tag}>\n`
  return `${indent}<${tag}${attrs}>\n${children}${indent}</${tag}>\n`
}

function serializeNode(node: Node, indent: string): string {
  if (node.nodeType === Node.COMMENT_NODE) return ''
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || ''
    if (!text.trim()) return text.includes('\n') ? '' : text
    return `${indent}${serializeText(text)}\n`
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    if (/^(SCRIPT|STYLE|LINK|NOSCRIPT|IFRAME)$/.test(el.tagName)) return ''
    return serializeElement(el, indent)
  }
  return ''
}

function stripRuntimeTree(root: Element): void {
  const walk = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      if (!shouldKeepAttr(attr.name)) el.removeAttribute(attr.name)
    }
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(root)
}

function wrapSfc(
  html: string,
  css: string,
  meta: { name: string; type: string },
  script: string,
): string {
  const safeHtml = html.replace(/<\/template/gi, '<\\/template')
  const SCRIPT_OPEN = '<' + 'script>'
  const SCRIPT_CLOSE = '</' + 'script>'
  return `${SCRIPT_OPEN}
${script.trim()}
${SCRIPT_CLOSE}

<template>
  <!-- ${escapeHtml(meta.name)} · 原类型 ${escapeHtml(meta.type)} · 按当前样式生成 -->
${safeHtml.trim()}
</template>

<style scoped>
.eject-root{width:100%;height:100%;min-height:0;box-sizing:border-box}
.widget-eject-canvas{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:72px;border:1px dashed rgba(255,255,255,.18);border-radius:12px;color:rgba(255,255,255,.45);font-size:12px;object-fit:cover}
${css.trim()}
</style>
`
}

const DEFAULT_SCRIPT = `export default {
  setup({ haStore, entityState, entityName, entityAttr, toggleEntity, callService }) {
    return { haStore, entityState, entityName, entityAttr, toggleEntity, callService }
  }
}`

function textOf(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim() || ''
}

function buildClockScript(live: HTMLElement): string {
  const lunarYear = JSON.stringify(textOf(live, '.clock__lunar-year'))
  const lunarDate = JSON.stringify(textOf(live, '.clock__lunar-date'))
  return `export default {
  setup() {
    const { ref, computed, onMounted, onUnmounted } = window.require('vue')
    const now = ref(new Date())
    let timer = 0
    const pad = (n) => String(n).padStart(2, '0')
    const timeMain = computed(() => pad(now.value.getHours()) + ':' + pad(now.value.getMinutes()))
    const timeSecond = computed(() => pad(now.value.getSeconds()))
    const dateStr = computed(() => now.value.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'short', day: 'numeric', weekday: 'short',
    }))
    const lunarYear = ${lunarYear}
    const lunarDate = ${lunarDate}
    onMounted(() => { timer = window.setInterval(() => { now.value = new Date() }, 1000) })
    onUnmounted(() => { window.clearInterval(timer) })
    return { timeMain, timeSecond, dateStr, lunarYear, lunarDate }
  }
}`
}

function buildClockHtml(): string {
  return `<div class="clock eject-root">
  <div class="clock__left">
    <div class="clock__time">
      <span class="clock__time-main">{{ timeMain }}</span>
      <span class="clock__time-second">{{ timeSecond }}</span>
    </div>
    <div class="clock__date">{{ dateStr }}</div>
  </div>
  <div class="clock__right">
    <div class="clock__lunar-year">{{ lunarYear }}</div>
    <div class="clock__lunar-date">{{ lunarDate }}</div>
  </div>
</div>`
}

function buildGenericHtml(visualRoot: HTMLElement): string {
  const body = serializeElement(visualRoot, '  ')
  return `<div class="eject-root" v-pre>\n${body}</div>`
}

function buildGenericCss(visualRoot: HTMLElement): string {
  return extractScopedCss(visualRoot)
}

function serializeWidgetDomToCustomHtml(
  liveRoot: HTMLElement,
  meta: { name: string; type: string },
): string {
  const visual = pickVisualRoot(liveRoot)
  if (meta.type === 'clock' || visual.querySelector('.clock') || visual.classList.contains('clock')) {
    const clockEl = visual.classList.contains('clock')
      ? visual
      : visual.querySelector<HTMLElement>('.clock') || visual
    return wrapSfc(
      buildClockHtml(),
      `${clockWidgetCss}\n${CLOCK_SHELL_CSS}`,
      meta,
      buildClockScript(clockEl),
    )
  }
  return wrapSfc(buildGenericHtml(visual), buildGenericCss(visual), meta, DEFAULT_SCRIPT)
}

function fallbackCustomHtml(name: string, widget: PanelWidget): string {
  const type = widget.type || 'widget'
  return wrapSfc(
    `<div class="eject-root widget-eject-fallback">
  <p class="widget-eject-fallback__k">${escapeHtml(type)}</p>
  <p class="widget-eject-fallback__t">${escapeHtml(name)}</p>
</div>`,
    `.widget-eject-fallback{padding:14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.widget-eject-fallback__k{margin:0 0 4px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.42)}
.widget-eject-fallback__t{margin:0;font-size:15px;font-weight:700}`,
    { name, type },
    DEFAULT_SCRIPT,
  )
}

function resolvePanelWidthPx(): number {
  try {
    const pinia = getActivePinia()
    if (!pinia) return 260
    const width = useLayoutStore(pinia).layoutConfig.rightPanelWidth
    return typeof width === 'number' && width > 80 ? width : 260
  } catch {
    return 260
  }
}

function attachAppContext(app: App, appContext?: AppContext | null) {
  if (appContext) app._context.provides = appContext.provides
  const pinia = getActivePinia()
  if (pinia) app.use(pinia)
}

async function waitForRendered(host: HTMLElement): Promise<HTMLElement | null> {
  for (let i = 0; i < 50; i += 1) {
    await nextTick()
    const root = host.querySelector<HTMLElement>('[data-widget-eject-root]')
    const inner = root?.querySelector('*')
    if (root && inner) {
      await new Promise((r) => setTimeout(r, 60))
      await nextTick()
      return root
    }
    await new Promise((r) => setTimeout(r, 40))
  }
  return host.querySelector<HTMLElement>('[data-widget-eject-root]')
}

async function snapshotOffscreen(
  widget: PanelWidget,
  name: string,
  appContext?: AppContext | null,
): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const Comp = getWidgetComponent(widget.type) as Component | null
  if (!Comp) return null

  const widthPx = resolvePanelWidthPx()
  const heightPx = resolveSidebarWidgetHeightPx(widget.type, widget.config?.cardHeight)
  const typeClass = getSidebarWidgetClass(widget.type)
  const host = document.createElement('div')
  host.setAttribute('data-widget-eject-host', '')
  host.style.cssText = `position:fixed;left:0;top:0;width:${widthPx}px;opacity:0;pointer-events:none;z-index:-1`
  const chrome = document.createElement('style')
  chrome.textContent = CHROME_CSS
  host.appendChild(chrome)
  document.body.appendChild(host)

  const widgetProps = {
    config: widget.config || {},
    panelVisible: true,
    class: 'h-full min-h-0',
    ...getWidgetProps(widget.type, widget),
  }

  const app = createApp({
    render: () =>
      h(
        'div',
        {
          'data-widget-eject-root': '',
          class: [
            'widget-wrapper',
            typeClass,
            heightPx > 0 ? 'widget-wrapper--custom-h' : '',
          ],
          style:
            heightPx > 0
              ? {
                  flex: 'none',
                  height: `${heightPx}px`,
                  minHeight: `${heightPx}px`,
                  maxHeight: `${heightPx}px`,
                }
              : undefined,
        },
        widget.type === 'clock'
          ? h('div', { class: 'info-card info-card--widget' }, [h(Comp, widgetProps)])
          : h(Comp, widgetProps),
      ),
  })
  attachAppContext(app, appContext)

  try {
    app.mount(host)
    const el = await waitForRendered(host)
    if (!el) return null
    return serializeWidgetDomToCustomHtml(el, { name, type: widget.type })
  } catch {
    return null
  } finally {
    app.unmount()
    host.remove()
  }
}

/** 转换后沿用原卡片高度，避免 customHtml 默认 480px 把时钟等部件撑变形 */
export function measureWidgetEjectHeightPx(widget: PanelWidget): number {
  const configured = resolveSidebarWidgetHeightPx(widget.type, widget.config?.cardHeight)
  if (configured > 0) return configured
  const live = findLiveWidgetSlot(widget.id)
  if (live) {
    const clock = live.querySelector<HTMLElement>('.clock')
    const visual = clock || pickVisualRoot(live)
    const measured = Math.round(Math.max(visual.getBoundingClientRect().height, visual.scrollHeight))
    if (widget.type === 'clock') {
      return clampPanelCardHeightPx(Math.max(measured, CLOCK_CONTENT_HEIGHT_PX))
    }
    return clampPanelCardHeightPx(measured)
  }
  return widget.type === 'clock' ? CLOCK_CONTENT_HEIGHT_PX : 0
}

/** 按当前部件外观生成自定义代码；无法快照时回退为带原配置的同风格卡片 */
export async function buildWidgetEjectHtml(
  widget: PanelWidget,
  name: string,
  appContext?: AppContext | null,
): Promise<string> {
  const live = findLiveWidgetSlot(widget.id)
  if (live) return serializeWidgetDomToCustomHtml(live, { name, type: widget.type })
  const offscreen = await snapshotOffscreen(widget, name, appContext)
  if (offscreen) return offscreen
  return fallbackCustomHtml(name, widget)
}
