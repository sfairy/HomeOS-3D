<!--
  组件文件：WidgetConfigCustomHtml.vue
  所属模块：frontend/src/views/settings/display/widgets
  组件职责：小部件配置面板中的自定义 HTML/Tailwind 注入子面板，提供代码片段快速插入、
    文本区粘贴，以及「全屏编辑」按钮跳转实时预览编辑器。底部说明草稿与持久化的两级保存机制。
  主要 props / emits：
    - props draftDirty：草稿是否有未存改动，驱动 Footer 脏态显示
    - emit save：点击保存草稿到布局编辑态
    - emit open-builder：点击全屏编辑按钮
    - emit cancel：取消当前编辑，恢复打开时内容
  依赖关系：通过 inject(WIDGET_PANEL_CONFIG_KEY) 获取 widgetConfig 上下文引用 rawHtml
    字段；引用 custom-html-widget.util 的 CUSTOM_HTML_WIDGET_API_ITEMS、
    CUSTOM_HTML_WIDGET_SNIPPETS 与 applyCustomHtmlSnippet 工具函数。
  注意事项：代码片段仅追加不覆盖；草稿保存后仍需点击页头「保存布局」才会真正写入后端。
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/WidgetConfigCustomHtml 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Code } from '@lucide/vue'
import { inject } from 'vue'
import WidgetConfigShell from './WidgetConfigShell.vue'
import WidgetConfigFooter from './WidgetConfigFooter.vue'
import { WIDGET_PANEL_CONFIG_KEY } from '@/composables/settings/display/layout-panel-widgets.internals'
import {
  CUSTOM_HTML_WIDGET_API_ITEMS,
  CUSTOM_HTML_WIDGET_SNIPPETS,
  applyCustomHtmlSnippet,
} from '@/utils/widget/custom-html-widget.util'

defineProps({
  draftDirty: { type: Boolean, default: false },
})

defineEmits(['save', 'open-builder', 'cancel'])

const widgetConfig = inject(WIDGET_PANEL_CONFIG_KEY)
const apiItems = CUSTOM_HTML_WIDGET_API_ITEMS.slice(0, 4)
const quickSnippets = CUSTOM_HTML_WIDGET_SNIPPETS.slice(0, 3)

function applySnippet(snippetId) {
  const snippet = CUSTOM_HTML_WIDGET_SNIPPETS.find((s) => s.id === snippetId)
  if (!snippet || !widgetConfig) return
  widgetConfig.rawHtml = applyCustomHtmlSnippet(String(widgetConfig.rawHtml || ''), snippet.code)
}
</script>

<template>
  <WidgetConfigShell
    :icon="Code"
    tone="purple"
    eyebrow="自定义代码"
    title="HTML 与 Tailwind 注入"
    description="行内可快速粘贴；复杂布局建议打开全屏编辑器实时预览。"
  >
    <template #head-actions>
      <button type="button" class="settings-btn-ghost settings-btn-ghost--purple text-xs" @click="$emit('open-builder')">
        {{ '全屏编辑' }}
      </button>
    </template>

    <div class="wpr-snippet-row">
      <button
        v-for="snippet in quickSnippets"
        :key="snippet.id"
        type="button"
        class="wpr-snippet-chip"
        :title="snippet.desc"
        @click="applySnippet(snippet.id)"
      >
        {{ snippet.label }}
      </button>
    </div>

    <textarea
      v-model="widgetConfig.rawHtml"
      rows="8"
      class="settings-field resize-y font-mono text-xs wpr-code-input min-h-[8rem]"
      :placeholder="`<div class=&quot;p-4 text-white bg-white/10 rounded-xl&quot;>${'你好世界'}</div>`"
    />

    <div class="wpr-api-hints">
      <p class="wpr-api-hints__title">{{ '可用 API（setup({ haStore, ... }) 或模板内直接使用）' }}</p>
      <ul class="wpr-api-hints__list">
        <li v-for="item in apiItems" :key="item.name">
          <code>{{ item.name }}</code>
          <span>{{ item.desc }}</span>
        </li>
      </ul>
    </div>

    <div class="widget-config-shell__note">
      <p class="widget-config-shell__note-text">
        {{ '「应用草稿」仅写入当前布局草稿；须再点页面顶部「保存布局」才会同步到服务端。全屏编辑器的 Ctrl+S 会直接保存到服务端。「取消」将放弃未保存修改并恢复为打开面板时的内容。' }}
      </p>
    </div>

    <template #footer>
      <WidgetConfigFooter
        save-label="应用草稿"
        show-cancel
        :dirty="draftDirty"
        dirty-label="草稿已修改"
        @save="$emit('save')"
        @cancel="$emit('cancel')"
      />
    </template>
  </WidgetConfigShell>
</template>

<style scoped src="./styles/WidgetConfigCustomHtml.css"></style>
