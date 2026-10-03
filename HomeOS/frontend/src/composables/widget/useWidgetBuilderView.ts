/**
 * 微件构建器视图组合式函数。
 *
 * 所属模块：widget/composables
 * 职责：为「自定义 HTML 微件构建器」页面提供完整状态与方法，包括：
 *   - 源码 / 分块编辑 / 快速搭建 / 片段 / 贴士 多视图切换
 *   - rawHtml 与 editorParts（script/template/style）双向同步
 *   - 实体选择器（插入 / 脚手架两种模式）
 *   - 保存 / 重置 / 撤销编辑、Ctrl+S 全局快捷键
 *   - 路由离开确认、未保存修改提示
 * 依赖：
 *   - vue（ref / computed / watch / onMounted / onBeforeUnmount）
 *   - vue-router（useRoute / useRouter / onBeforeRouteLeave）
 *   - @/stores/layout.store（布局配置与保存）
 *   - @/services/notify（错误提示）
 *   - @/utils/registry/settings-route.util（设置路由）
 *   - @/utils/widget/custom-html-widget.util（代码片段、脚手架、文本插入工具）
 *   - @/utils/widget/panel-widget-height.util（面板高度解析）
 *   - @/composables/widget/useCustomHtmlEditor（HTML 编辑器组合式函数）
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { notifyError } from '@/services/notify'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import {
  CUSTOM_HTML_WIDGET_API_ITEMS,
  CUSTOM_HTML_WIDGET_SNIPPETS,
  decomposeCustomHtmlWidget,
  composeCustomHtmlWidget,
  buildCustomHtmlScaffold,
  handleCodeTextareaKeydown,
  insertTextAtSelection,
  applyCustomHtmlSnippet,
  type CustomHtmlEditorParts,
  type CustomHtmlScaffoldKind,
} from '@/utils/widget/custom-html-widget.util'
import { parsePanelCardHeightPx } from '@/utils/widget/panel-widget-height.util'
import { useCustomHtmlEditor } from '@/composables/widget/useCustomHtmlEditor'

// 拆分为字符串拼接，避免 HTML 解析器在源码中误识别 <script> 标签
const SCRIPT_OPEN = '<' + 'script>'
const SCRIPT_CLOSE = '</' + 'script>'

/** 微件构建器默认模板：包含一个示例 toggle 按钮，演示 haStore / entityState / toggleEntity 用法 */
export const WIDGET_BUILDER_DEFAULT_TEMPLATE = `${SCRIPT_OPEN}
export default {
  setup({ haStore, entityState, toggleEntity }) {
    const { ref, computed } = window.require('vue');
    const entityId = ref('input_boolean.example');
    const isOn = computed(() => haStore.entities[entityId.value]?.state === 'on');
    return { entityId, isOn, entityState, toggleEntity };
  }
}
${SCRIPT_CLOSE}

<template>
  <div class="bg-gray-800/50 rounded-xl p-4 border border-white/5 space-y-3">
    <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider">快捷示例</h3>
    <p class="text-sm text-gray-300">点击下方按钮切换实体状态（请把 entityId 改成你的实体）</p>
    <button
      type="button"
      @click="toggleEntity(entityId)"
      class="p-3 rounded-lg border transition-all w-full text-left"
      :class="isOn
        ? 'bg-blue-600/30 border-blue-500/50 text-blue-400'
        : 'bg-black/40 border-white/5 text-gray-400 hover:border-white/20'"
    >
      <span class="text-sm font-medium">{{ entityState(entityId) || 'unknown' }}</span>
      <span class="block text-[12px] opacity-60 mt-1">{{ entityId }}</span>
    </button>
  </div>
</template>`
/** 构建器顶部 Tab 列表：scaffold 快速搭建 / edit 分块编辑 / source 完整源码 / snippets 代码片段 / tips 开发贴士 */
const WIDGET_BUILDER_TABS = [
  { id: 'scaffold', label: '快速搭建', emoji: '⚡', accent: 'var(--module-accent-layout)' },
  { id: 'edit', label: '分块编辑', emoji: '🧱', accent: 'var(--module-accent-layout)' },
  { id: 'source', label: '完整源码', emoji: '💻', accent: 'var(--module-accent-layout-sub)' },
  { id: 'snippets', label: '代码片段', emoji: '🧩', accent: 'var(--module-accent-layout-sub)' },
  { id: 'tips', label: '开发贴士', emoji: '💡', accent: 'var(--module-accent-layout-sub)' },
]

/** 分块编辑可切换的子面板：script 脚本 / template 模板 / style 样式 */
const WIDGET_BUILDER_EDIT_PANES = [
  { id: 'script', label: '脚本' },
  { id: 'template', label: '模板' },
  { id: 'style', label: '样式' },
] as const

/** API 列表（透传自工具模块，供 UI 展示可用 API） */
const WIDGET_BUILDER_API_ITEMS = CUSTOM_HTML_WIDGET_API_ITEMS

/** API 插入片段：点击后在光标位置插入对应的 API 调用代码 */
const WIDGET_BUILDER_API_INSERTS = [
  { label: 'entityState', code: 'entityState(\'entity.id\')' },
  { label: 'entityAttr', code: 'entityAttr(\'entity.id\', \'friendly_name\')' },
  { label: 'entityName', code: 'entityName(\'entity.id\')' },
  { label: 'toggleEntity', code: 'toggleEntity(\'entity.id\')' },
  { label: 'callService', code: 'callService(\'light\', \'turn_on\', \'light.id\')' },
] as const

/**
 * 微件构建器视图组合式函数：管理构建器全部状态与方法。
 *
 * @returns 含 builderTab / editPane / rawHtml / editorParts / widgetId / isDirty / saveWidget /
 *          generateScaffold / insertSnippetInBuilder / onCodeKeydown 等状态与方法
 */
export function useWidgetBuilderView() {
  const route = useRoute()
  const router = useRouter()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  /** 当前激活的构建器 Tab（scaffold / edit / source / snippets / tips） */
  const builderTab = ref('scaffold')
  /** 分块编辑中当前激活的子面板（script / template / style） */
  const editPane = ref<(typeof WIDGET_BUILDER_EDIT_PANES)[number]['id']>('template')
  /** 保存中标记（防止重复提交） */
  const isSaving = ref(false)
  /** 预览区错误信息 */
  const previewError = ref('')
  /** 完整 HTML 源码（script + template + style 合并） */
  const rawHtml = ref('')
  /** 已保存的 HTML 源码（用于脏检测） */
  const savedHtml = ref('')
  /** 分块编辑的三个部分（script / template / style + styleScoped 标记） */
  const editorParts = ref<CustomHtmlEditorParts>(decomposeCustomHtmlWidget(''))
  /** 脚手架模式选中的实体 ID 列表 */
  const scaffoldEntityIds = ref<string[]>([])
  /** 脚手架类型（toggle / multi-toggle 等） */
  const scaffoldKind = ref<CustomHtmlScaffoldKind>('toggle')
  /** 实体选择器模式：insert=插入到代码 / scaffold=用于脚手架生成 */
  const entityPickerMode = ref<'insert' | 'scaffold'>('insert')
  /** 当前已加载的微件 ID（用于检测微件切换） */
  const loadedWidgetId = ref('')
  // 防止 rawHtml 与 editorParts 双向同步时递归触发的标志位
  let syncingFromParts = false
  let syncingFromRaw = false

  // 当前微件 ID：从路由 params.id 解析，兼容数组形态
  const widgetId = computed(() => {
    const id = route.params.id
    return Array.isArray(id) ? String(id[0] || '') : String(id || '')
  })

  // 微件 ID 的短展示形式（取末 6 位，便于 UI 显示）
  const widgetIdShort = computed(() => widgetId.value.slice(-6) || '—')

  // 当前微件配置对象（从右侧面板 widget 列表中查找）
  const widget = computed(() =>
    layoutStore.layoutConfig.rightPanelWidgets?.find((w) => w.id === widgetId.value),
  )
  // 微件配置（仅含 rawHtml，用于预览）
  const widgetConfig = computed(() => ({ rawHtml: rawHtml.value }))
  // 脏检测：当前内容与已保存内容是否一致
  const isDirty = computed(() => rawHtml.value !== savedHtml.value)

  // 预览 iframe 的样式：宽度跟随右侧面板宽度，高度跟随配置的 cardHeight
  const previewFrameStyle = computed(() => {
    const width = layoutStore.layoutConfig.rightPanelWidth || 260
    const cardHeight = parsePanelCardHeightPx(widget.value?.config?.cardHeight)
    const style: Record<string, string> = { width: `min(100%, ${width}px)` }
    if (cardHeight > 0) {
      style.height = `${cardHeight}px`
      style.minHeight = `${cardHeight}px`
    }
    return style
  })

  /**
   * 从 rawHtml 解析出 editorParts（script/template/style）。
   * syncingFromParts 标志位避免双向同步时递归触发。
   */
  function syncPartsFromRaw() {
    if (syncingFromParts) return
    syncingFromRaw = true
    editorParts.value = decomposeCustomHtmlWidget(rawHtml.value)
    syncingFromRaw = false
  }

  /**
   * 从 editorParts 合成 rawHtml。
   * syncingFromRaw 标志位避免双向同步时递归触发。
   */
  function syncRawFromParts() {
    if (syncingFromRaw) return
    syncingFromParts = true
    rawHtml.value = composeCustomHtmlWidget(editorParts.value)
    syncingFromParts = false
  }

  /**
   * 更新某个编辑部分（script/template/style/styleScoped），并同步到 rawHtml。
   * @param {keyof CustomHtmlEditorParts} key  部分键
   * @param {string | boolean} value  新值
   */
  function updateEditorPart(key: keyof CustomHtmlEditorParts, value: string | boolean) {
    editorParts.value = { ...editorParts.value, [key]: value }
    syncRawFromParts()
  }

  /**
   * 预览区错误回调：更新 previewError 状态。
   * @param {string} msg  错误信息（空串表示清除）
   */
  function onPreviewError(msg: string) {
    previewError.value = msg || ''
  }
  /**
   * 在当前激活的编辑器（分块或源码）中插入文本。
   * @param {string} text  待插入文本
   */
  function insertAtActiveEditor(text: string) {
    const textarea = htmlEditor.textareaRef.value
    if (builderTab.value === 'edit') {
      // 分块模式：插入到当前子面板对应的部分
      const pane = editPane.value
      const current =
        pane === 'script'
          ? editorParts.value.script
          : pane === 'template'
            ? editorParts.value.template
            : editorParts.value.style
      updateEditorPart(pane, insertTextAtSelection(textarea, text, current))
      return
    }
    // 源码模式：直接插入到 rawHtml 并同步分块
    rawHtml.value = insertTextAtSelection(textarea, text, rawHtml.value)
    syncPartsFromRaw()
  }

  /**
   * 加载指定微件到编辑器：处理微件切换、未保存修改确认、配置读取等。
   * 切换微件且有未保存修改时，会弹出确认对话框；用户取消则回退到原微件。
   */
  async function loadWidgetEditor() {
    if (!layoutStore.isConfigLoaded) return

    // 检测是否在切换到另一个微件
    const switchingWidget = loadedWidgetId.value && loadedWidgetId.value !== widgetId.value
    if (switchingWidget && !(await confirmDiscardDirty())) {
      // 用户取消切换：回退到原微件路由
      if (loadedWidgetId.value) {
        router.replace(`/builder/${loadedWidgetId.value}`)
      }
      return
    }

    previewError.value = ''
    scaffoldEntityIds.value = []
    scaffoldKind.value = 'toggle'
    entityPickerMode.value = 'insert'
    const w = widget.value
    if (!w) {
      // 微件不存在：提示并跳回列表
      chrome.notify('找不到对应的微件，可能已被删除。', 'error')
      router.replace(SETTINGS_ROUTES.widgets())
      return
    }
    const configHtml = w.config?.rawHtml
    // 优先使用已配置的 HTML；否则使用默认模板
    const next =
      typeof configHtml === 'string' && configHtml ? configHtml : WIDGET_BUILDER_DEFAULT_TEMPLATE
    rawHtml.value = next
    savedHtml.value = next
    syncPartsFromRaw()
    loadedWidgetId.value = widgetId.value
    // 无配置时默认进入脚手架 Tab 引导用户搭建
    if (!configHtml) builderTab.value = 'scaffold'
  }

  // 监听微件 ID 与配置加载状态：变化时重新加载编辑器
  watch(
    [widgetId, () => layoutStore.isConfigLoaded],
    () => {
      void loadWidgetEditor()
    },
    { immediate: true },
  )

  // 监听 rawHtml 变化：同步到 editorParts（除非是 editorParts 触发的同步）
  watch(rawHtml, () => {
    if (!syncingFromParts) syncPartsFromRaw()
  })

  /**
   * 确认放弃未保存修改：若有脏数据则弹出确认对话框。
   * @returns {Promise<boolean>} true=可继续（无脏数据或用户确认放弃）；false=用户取消
   */
  async function confirmDiscardDirty(): Promise<boolean> {
    if (!isDirty.value) return true
    return chrome.confirm(
      '当前微件有未保存的修改，继续将丢失这些更改。是否放弃修改？',
      '未保存的修改',
    )
  }

  /** 返回上一页（带未保存修改确认） */
  async function goBack() {
    if (!(await confirmDiscardDirty())) return
    router.back()
  }

  // 路由离开前确认：避免误操作丢失未保存修改
  onBeforeRouteLeave(async () => confirmDiscardDirty())

  /**
   * 保存当前微件配置到服务端。
   * 失败时提示错误，成功时同步 savedHtml 并提示用户。
   */
  async function saveWidget() {
    if (!widget.value) return
    isSaving.value = true
    const idx = layoutStore.layoutConfig.rightPanelWidgets.findIndex((w) => w.id === widgetId.value)
    if (idx === -1) {
      // 微件已被删除：提示并中止保存
      chrome.notify('找不到对应的微件，可能已被删除。', 'error')
      isSaving.value = false
      return
    }
    layoutStore.layoutConfig.rightPanelWidgets[idx].config = {
      ...layoutStore.layoutConfig.rightPanelWidgets[idx].config,
      rawHtml: rawHtml.value,
    }
    try {
      const ok = await layoutStore.saveConfig()
      if (!ok) return
      savedHtml.value = rawHtml.value
      chrome.notify('已保存到服务端，侧栏微件立即生效', 'success')
    } catch (e) {
      notifyError(e, '保存微件')
    } finally {
      isSaving.value = false
    }
  }

  // 实例化 HTML 编辑器组合式函数（绑定 rawHtml 的 getter / setter）
  const htmlEditor = useCustomHtmlEditor(
    () => rawHtml.value,
    (v) => {
      rawHtml.value = v
    },
  )

  /** 重置为默认模板并切换到分块编辑视图 */
  function resetToDefaultTemplate() {
    rawHtml.value = WIDGET_BUILDER_DEFAULT_TEMPLATE
    syncPartsFromRaw()
    builderTab.value = 'edit'
    editPane.value = 'template'
  }

  /** 撤销当前未保存修改：恢复到 savedHtml 并同步分块 */
  function cancelWidgetEdits() {
    if (!isDirty.value) {
      chrome.notify('当前无未保存修改', 'info')
      return
    }
    rawHtml.value = savedHtml.value
    syncPartsFromRaw()
    previewError.value = ''
    chrome.notify('已恢复为上次保存的内容', 'success')
  }
  /**
   * 根据类型与实体生成脚手架代码。
   * @param {object} payload  含 kind（脚手架类型）与 entityIds（实体列表）
   */
  function generateScaffold(payload: {
    kind: CustomHtmlScaffoldKind
    entityIds: string[]
  }) {
    const ids = payload.entityIds.length ? payload.entityIds : scaffoldEntityIds.value
    if (payload.kind === 'multi-toggle' && !ids.length) {
      // 多开关模式必须至少选择一个实体
      chrome.notify('多开关模式请至少选择一个实体', 'warning')
      return
    }
    rawHtml.value = buildCustomHtmlScaffold(payload.kind, ids)
    syncPartsFromRaw()
    builderTab.value = 'edit'
    editPane.value = 'template'
    chrome.notify('面板代码已生成，可在分块编辑中继续调整', 'success')
  }

  /** 打开脚手架模式的实体选择器（用于选择脚手架生成的目标实体） */
  function openScaffoldEntityPicker() {
    entityPickerMode.value = 'scaffold'
    htmlEditor.entityPickerSeed.value = [...scaffoldEntityIds.value]
    htmlEditor.showEntityPicker.value = true
  }

  /** 打开插入模式的实体选择器（用于在代码中插入实体 ID 字面量） */
  function openInsertEntityPicker() {
    entityPickerMode.value = 'insert'
    htmlEditor.openEntityPicker()
  }

  /**
   * 实体选择器保存回调：根据模式分别处理。
   * - scaffold 模式：保存到 scaffoldEntityIds
   * - insert 模式：构造字面量并插入到当前编辑器
   * @param {string[]} ids  选中的实体 ID 列表
   */
  function onEntityPickerSave(ids: string[]) {
    if (entityPickerMode.value === 'scaffold') {
      scaffoldEntityIds.value = ids
      htmlEditor.showEntityPicker.value = false
      return
    }
    htmlEditor.showEntityPicker.value = false
    if (!ids.length) return
    // 单个实体：'entity_id'；多个实体：['id1', 'id2']
    const token =
      ids.length === 1 ? `'${ids[0]}'` : `[${ids.map((id) => `'${id}'`).join(', ')}]`
    insertAtActiveEditor(token)
  }

  /**
   * 插入代码片段到构建器。
   * - replace 模式：直接整体替换 rawHtml
   * - insert 模式（分块编辑）：将片段中对应部分合并到当前编辑部分
   * - insert 模式（源码）：合并到 rawHtml 末尾
   * @param {string} snippetId  片段 ID
   * @param {'insert' | 'replace'} [mode='insert']  插入模式
   */
  function insertSnippetInBuilder(snippetId: string, mode: 'insert' | 'replace' = 'insert') {
    const snippet = CUSTOM_HTML_WIDGET_SNIPPETS.find((s) => s.id === snippetId)
    if (!snippet) return

    if (mode === 'replace') {
      rawHtml.value = snippet.code
      syncPartsFromRaw()
      builderTab.value = 'edit'
      editPane.value = 'template'
      return
    }

    if (builderTab.value === 'edit') {
      // 分块模式：仅插入片段中对应部分的内容
      const parts = decomposeCustomHtmlWidget(snippet.code)
      const pane = editPane.value
      const partKey: 'script' | 'template' | 'style' =
        pane === 'script' ? 'script' : pane === 'template' ? 'template' : 'style'
      const chunk = parts[partKey]
      if (!chunk.trim()) {
        // 片段中该部分为空：提示用户无可插入内容
        const paneLabel = pane === 'script' ? '脚本' : pane === 'template' ? '模板' : '样式'
        chrome.notify(`该片段没有可插入的 ${paneLabel} 内容`, 'info')
        return
      }
      updateEditorPart(partKey, applyCustomHtmlSnippet(editorParts.value[partKey], chunk))
      // 若片段启用了 scoped 样式，同步开启当前编辑器的 styleScoped
      if (partKey === 'style' && parts.styleScoped) {
        updateEditorPart('styleScoped', true)
      }
      return
    }

    // 源码模式：合并到 rawHtml 末尾
    rawHtml.value = applyCustomHtmlSnippet(rawHtml.value, snippet.code)
    syncPartsFromRaw()
  }

  /**
   * 插入 API 调用片段（如 entityState('entity.id')）到当前编辑器。
   * @param {string} code  API 调用代码
   */
  function insertApiSnippet(code: string) {
    insertAtActiveEditor(code)
  }

  /**
   * 源码模式 textarea 键盘事件处理：
   * - Ctrl/Cmd+S：保存
   * - 其它：委托给 handleCodeTextareaKeydown 处理缩进等编辑行为
   * @param {KeyboardEvent} event  键盘事件
   */
  function onCodeKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (!isSaving.value && isDirty.value) void saveWidget()
      return
    }
    handleCodeTextareaKeydown(event, rawHtml.value, (v) => {
      rawHtml.value = v
      syncPartsFromRaw()
    }, htmlEditor.textareaRef.value)
  }

  /**
   * 分块编辑模式 textarea 键盘事件处理：
   * - Ctrl/Cmd+S：保存
   * - 其它：委托给 handleCodeTextareaKeydown 处理当前编辑部分
   * @param {KeyboardEvent} event  键盘事件
   */
  function onEditPaneKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (!isSaving.value && isDirty.value) void saveWidget()
      return
    }
    const current =
      editPane.value === 'script'
        ? editorParts.value.script
        : editPane.value === 'template'
          ? editorParts.value.template
          : editorParts.value.style

    handleCodeTextareaKeydown(event, current, (v) => {
      updateEditorPart(editPane.value, v)
    }, htmlEditor.textareaRef.value)
  }

  /**
   * 直接设置 rawHtml 并同步到分块。
   * @param {string} value  新的 HTML 源码
   */
  function setRawHtml(value: string) {
    rawHtml.value = value
    syncPartsFromRaw()
  }

  /**
   * 全局键盘事件处理：监听 Ctrl/Cmd+S 快捷键保存微件。
   * @param {KeyboardEvent} event  键盘事件
   */
  function onGlobalKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (!isSaving.value && isDirty.value) void saveWidget()
    }
  }

  // 挂载时注册全局快捷键监听
  onMounted(() => {
    window.addEventListener('keydown', onGlobalKeydown)
  })

  // 卸载前移除全局快捷键监听，避免内存泄漏
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onGlobalKeydown)
  })

  return {
    layoutStore,
    builderTab,
    builderTabs: WIDGET_BUILDER_TABS,
    builderEditPanes: WIDGET_BUILDER_EDIT_PANES,
    builderApiItems: WIDGET_BUILDER_API_ITEMS,
    builderApiInserts: WIDGET_BUILDER_API_INSERTS,
    editPane,
    editorParts,
    updateEditorPart,
    previewFrameStyle,
    scaffoldEntityIds,
    scaffoldKind,
    widgetId,
    widgetIdShort,
    isSaving,
    isDirty,
    previewError,
    rawHtml,
    widgetConfig,
    onPreviewError,
    goBack,
    saveWidget,
    cancelWidgetEdits,
    resetToDefaultTemplate,
    generateScaffold,
    openScaffoldEntityPicker,
    openInsertEntityPicker,
    insertApiSnippet,
    insertSnippetInBuilder,
    onCodeKeydown,
    onEditPaneKeydown,
    setRawHtml,
    ...htmlEditor,
    onEntityPickerSave,
  }
}