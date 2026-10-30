/**
 * T6：studio 生命周期回收的跨文件契约（0.8.2 审计）。
 *
 * 三条链路各自「编译期完全合法、运行期静默失效」，只能靠源契约钉住：
 *
 * - createStudioRenderer：在 canvas/document 上登记的指针与可见性监听过去只挂 pagehide
 *   （整页卸载才触发）。SPA 内路由切换不触发 pagehide，必须把清理函数返回给宿主。
 * - studio-app：宿主回收必须在 renderer 置空之前调用该清理函数，否则监听闭包包住整个
 *   appCtx，真 pagehide 时还会打到已释放的渲染器。
 * - StudioView / EditorView：teardownStudio/teardownEditor 是 async，onBeforeUnmount 不会
 *   await；必须串行化（下次挂载先等链尾）并捕获失败，否则跨实例 resetFacade 竞态 +
 *   unhandled rejection。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL('../../../../' + relativePath, import.meta.url)), 'utf8')

const renderer = read(
  'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/functions/createStudioRenderer.ts',
)
const studioApp = read('homeos/frontend/src/studio/app/3d-studio/authoring/studio-app.ts')
const studioView = read('homeos/frontend/src/studio/entries/StudioView.vue')
const editorView = read('homeos/frontend/src/studio/entries/EditorView.vue')

// --- createStudioRenderer：清理函数可复用、幂等、被返回 ---------------------

test('createStudioRenderer 捕获 domElement，清理函数不再回读可能已置空的 appCtx.threeRenderer', () => {
  assert.ok(
    renderer.includes('const rendererDomElement = appCtx.threeRenderer.domElement;'),
    '清理函数必须使用捕获到的 rendererDomElement（teardown 会把 threeRenderer 置 null）',
  )
  const disposeIndex = renderer.indexOf('disposeRendererEvents = () => {')
  assert.ok(disposeIndex > 0, '缺少可复用的 disposeRendererEvents 清理函数')
  const afterDispose = renderer.slice(disposeIndex)
  assert.ok(
    afterDispose.includes('rendererDomElement.removeEventListener('),
    '清理函数必须用捕获的 rendererDomElement 摘监听',
  )
  assert.ok(
    !afterDispose.includes('appCtx.threeRenderer.domElement.removeEventListener('),
    '清理函数不得回读 appCtx.threeRenderer.domElement（SPA 拆卸已置 null，真 pagehide 会 TypeError）',
  )
})

test('createStudioRenderer 清理函数幂等，且同时挂给 pagehide 与宿主回收', () => {
  assert.ok(
    renderer.includes('if (rendererEventsDisposed) return;'),
    'pagehide 与显式回收可能先后各调一次，清理必须幂等',
  )
  assert.ok(
    renderer.includes('window.addEventListener("pagehide", disposeRendererEvents, { once: true });'),
    '整页卸载路径必须继续走同一个清理函数',
  )
  assert.ok(
    renderer.includes('return disposeRendererEvents;'),
    '清理函数必须返回给 createStudioRenderer 的调用方（StudioApp 回收）',
  )
  assert.ok(
    renderer.includes('document.removeEventListener("visibilitychange", handlePageVisibility);'),
    '清理必须摘掉 document 的 visibilitychange',
  )
})

// --- studio-app：回收接线 + 顺序 -----------------------------------------

test('studio-app 的显式回收调用 renderer 清理函数，且早于 renderer 释放', () => {
  assert.ok(
    studioApp.includes('typeof studioRendererCleanup === "function"'),
    'createStudioRenderer 包装必须识别 Impl 返回的清理函数',
  )
  const callIndex = studioApp.indexOf('disposeStudioRendererEvents?.()')
  assert.ok(callIndex > 0, 'innerCleanup 必须调用 disposeStudioRendererEvents')
  const orbitIndex = studioApp.indexOf('appCtx.orbitControls?.dispose?.()')
  assert.ok(
    orbitIndex > callIndex,
    'renderer 清理必须在 orbitControls/renderer.dispose 之前（监听闭包仍持有 appCtx）',
  )
  assert.ok(
    studioApp.includes('disposeStudioRendererEvents = null'),
    '回收后必须复位模块级句柄，避免下一次引导误用上一次的清理函数',
  )
})

// --- StudioView / EditorView：串行化 + 失败兜底 + 全局副作用收回 -----------

test('StudioView 卸载串行化：下次挂载先等上一次异步 teardown', () => {
  const setupIndex = studioView.indexOf('<script setup lang="ts">')
  const moduleIndex = studioView.indexOf('<script lang="ts">')
  assert.ok(moduleIndex >= 0 && moduleIndex < setupIndex, '串行链必须声明在 script setup 之外的模块作用域')
  const mountedIndex = studioView.indexOf('onMounted(async () => {')
  const awaitIndex = studioView.indexOf('await pendingStudioTeardown')
  const bindIndex = studioView.indexOf('floorplanStore.bindFacade()')
  assert.ok(awaitIndex > mountedIndex, 'onMounted 必须先等待 pendingStudioTeardown')
  assert.ok(bindIndex > awaitIndex, 'bindFacade 必须排在等待链尾之后（否则会被旧实例 resetStudioFacade 清掉）')
  assert.ok(studioView.includes('void scheduleStudioTeardown(dispose)'), 'onBeforeUnmount 必须把异步回收交给串行链')
  assert.ok(
    studioView.includes('window.HomeOSLog?.error?.(error, { phase: "studio-view-teardown" })'),
    'teardown 失败必须被捕获并记录，不能产生 unhandled rejection',
  )
})

test('StudioView 嵌入态 resize rAF 在卸载时取消', () => {
  assert.ok(studioView.includes('embeddedResizeFrame = requestAnimationFrame('), '嵌入态 resize rAF 必须保存句柄')
  assert.ok(
    studioView.includes('cancelAnimationFrame(embeddedResizeFrame)'),
    'onBeforeUnmount 必须取消未执行的 resize rAF（否则卸载后仍向 window dispatch resize）',
  )
})

test('EditorView 卸载串行化且收回 canvasZoom 的全局副作用', () => {
  const setupIndex = editorView.indexOf('<script setup lang="ts">')
  const moduleIndex = editorView.indexOf('<script lang="ts">')
  assert.ok(moduleIndex >= 0 && moduleIndex < setupIndex, '串行链必须声明在 script setup 之外的模块作用域')
  const mountedIndex = editorView.indexOf('onMounted(async () => {')
  const awaitIndex = editorView.indexOf('await pendingEditorTeardown')
  const bindIndex = editorView.indexOf('editorStore.bindFacade()')
  assert.ok(awaitIndex > mountedIndex, 'onMounted 必须先等待 pendingEditorTeardown')
  assert.ok(bindIndex > awaitIndex, 'bindFacade 必须排在等待链尾之后')
  assert.ok(editorView.includes('void scheduleEditorTeardown(dispose)'), 'onBeforeUnmount 必须把异步回收交给串行链')
  assert.ok(
    editorView.includes('document.documentElement.style.removeProperty("--sc-canvas-zoom");'),
    '卸载必须清掉全局 CSS 变量，否则离开编辑器后仪表盘预览仍带编辑器缩放',
  )
  assert.ok(
    editorView.includes('getElementById("editor-canvas")?.classList.remove("sc-canvas-zoom")'),
    '卸载必须收回 #editor-canvas 的 sc-canvas-zoom class',
  )
  assert.ok(
    editorView.includes('getElementById("dashboard-preview")?.classList.remove("sc-canvas-zoom")'),
    '卸载必须收回 #dashboard-preview 的 sc-canvas-zoom class',
  )
})
