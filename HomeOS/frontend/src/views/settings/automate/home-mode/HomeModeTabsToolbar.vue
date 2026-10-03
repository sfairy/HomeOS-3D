/**
 * 组件：HomeModeTabsToolbar.vue
 *
 * 所属模块：frontend / src / views / settings / automate / home-mode
 * 职责：家庭模式 Tab 工具栏。基于 SettingsOrchTabs 渲染可拖拽排序的模式 Tab，并提供
 *      初始化默认、导出、导入、新建模式等操作按钮。
 * 关键依赖：SettingsOrchTabs
 * 数据来源：父级透传的 activeTab / displayModeTabs / isAdmin
 */
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/HomeModeTabsToolbar 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Download, Upload, Plus, Sparkles } from '@lucide/vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'

// 入参：当前激活 Tab、展示用模式 Tab 列表、是否管理员
defineProps({
  activeTab: { type: String, required: true },
  displayModeTabs: { type: Array, required: true },
  isAdmin: { type: Boolean, default: false },
})

// 对外事件：切换 Tab、拖拽排序、初始化默认、导出/导入、新建模式
const emit = defineEmits(['update:activeTab', 'reorder', 'seed', 'export', 'import', 'create'])

// Tab 切换时向上透传新激活 id
function onTabChange(id) {
  emit('update:activeTab', id)
}
</script>

<template>
  <SettingsOrchTabs
    :model-value="activeTab"
    :tabs="displayModeTabs"
    toolbar
    sortable
    class="hm-mode-tabs-toolbar shrink-0"
    @update:model-value="onTabChange"
    @reorder="emit('reorder', $event)"
  >
    <template #actions>
      <button
        v-if="isAdmin"
        type="button"
        class="orch-toolbar-btn orch-toolbar-btn--compact"
        :title="'初始化默认'"
        :aria-label="'初始化默认'"
        @click="emit('seed')"
      >
        <Sparkles class="w-3.5 h-3.5 shrink-0" />
        <span class="orch-toolbar-btn-label">{{ '初始化默认' }}</span>
      </button>
      <button
        type="button"
        class="orch-toolbar-btn orch-toolbar-btn--compact icon-btn"
        :title="'导出'"
        :aria-label="'导出'"
        @click="emit('export')"
      >
        <Download class="w-3.5 h-3.5" />
      </button>
      <label
        class="orch-toolbar-btn orch-toolbar-btn--compact cursor-pointer icon-btn"
        :title="'导入'"
        aria-label="导入"
      >
        <Upload class="w-3.5 h-3.5" />
        <input
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="emit('import', $event)"
        />
      </label>
      <button
        type="button"
        class="orch-toolbar-btn orch-toolbar-btn--accent orch-toolbar-btn--compact"
        :title="'新建模式'"
        :aria-label="'新建模式'"
        @click="emit('create')"
      >
        <Plus class="w-3.5 h-3.5 shrink-0" />
        <span class="orch-toolbar-btn-label">{{ '新建模式' }}</span>
      </button>
    </template>
  </SettingsOrchTabs>
</template>
