<script setup>
import { Download, Upload, Plus, Sparkles } from '@lucide/vue'
import SettingsOrchTabs from '@/components/common/SettingsOrchTabs.vue'

defineProps({
  activeTab: { type: String, required: true },
  displayModeTabs: { type: Array, required: true },
})

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
