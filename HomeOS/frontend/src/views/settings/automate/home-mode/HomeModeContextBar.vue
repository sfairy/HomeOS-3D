/**
 * 组件：HomeModeContextBar.vue
 *
 * 所属模块：frontend / src / views / settings / automate / home-mode
 * 职责：家庭模式编辑器顶部「上下文概览」条。以 pill 形式展示当前模式的关键上下文
 *      （如动作数、触发数、激活态等），嵌入设置页时包装为可折叠 DockPanel。
 * 关键依赖：
 *  - OrchestratorDockPanel：嵌入态下的可折叠面板容器
 * 数据来源：父级透传的 contextPills / contextLoadWarnings
 */
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/HomeModeContextBar 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import OrchestratorDockPanel from '@/components/dashboard/OrchestratorDockPanel.vue'

// 入参：上下文加载告警列表、上下文 pills、是否嵌入设置页
const props = defineProps({
  contextLoadWarnings: { type: Array, default: () => [] },
  contextPills: { type: Array, required: true },
  embedded: { type: Boolean, default: false },
})

const isCollapsible = computed(() => props.embedded)
/** 嵌入设置页时默认折叠，把纵向空间留给编辑区 */
const isDefaultCollapsed = computed(() => props.embedded)
// DockPanel 摘要文本：将各 pill 的「标签 值」用 · 拼接
const dockSummary = computed(() =>
  props.contextPills.map((pill) => `${pill.label} ${pill.value}`).join(' · '),
)
const emit = defineEmits(['pill-click'])

// 点击带 section 的 pill 时向上透传 section 标识，用于跳转到对应分区
function onPillClick(pill) {
  if (pill.section) emit('pill-click', pill.section)
}
</script>

<template>
  <div v-if="contextLoadWarnings.length" class="px-6 py-2 shrink-0">
    <div class="settings-inline-hint settings-inline-hint--amber text-xs">
      <span>{{ '部分上下文加载失败：' }}{{ contextLoadWarnings.join('、') }}</span>
    </div>
  </div>

  <OrchestratorDockPanel
    v-if="embedded"
    :title="'上下文概览'"
    :summary="dockSummary"
    :collapsible="isCollapsible"
    :default-collapsed="isDefaultCollapsed"
    storage-key="homeos_orch_hm_context"
    panel-class="hm-context-dock"
  >
    <div class="hm-context-pills px-6 py-3 shrink-0">
      <div
        v-for="pill in contextPills"
        :key="pill.id"
        :class="[
          'hm-context-pill',
          pill.tone && `hm-context-pill--${pill.tone}`,
          pill.section && 'hm-context-pill--clickable',
        ]"
        :role="pill.section ? 'button' : undefined"
        :tabindex="pill.section ? 0 : undefined"
        @click="onPillClick(pill)"
        @keydown.enter.prevent="onPillClick(pill)"
        @keydown.space.prevent="onPillClick(pill)"
      >
        <div class="hm-context-pill__icon">
          <component :is="pill.icon" class="w-3.5 h-3.5" />
        </div>
        <div class="hm-context-pill__body">
          <span class="hm-context-pill__label">{{ pill.label }}</span>
          <span class="hm-context-pill__val">{{ pill.value }}</span>
        </div>
      </div>
    </div>
  </OrchestratorDockPanel>

  <div v-else class="hm-context-pills px-6 py-3 shrink-0">
    <div
      v-for="pill in contextPills"
      :key="pill.id"
      :class="[
        'hm-context-pill',
        pill.tone && `hm-context-pill--${pill.tone}`,
        pill.section && 'hm-context-pill--clickable',
      ]"
      :role="pill.section ? 'button' : undefined"
      :tabindex="pill.section ? 0 : undefined"
      @click="onPillClick(pill)"
      @keydown.enter.prevent="onPillClick(pill)"
      @keydown.space.prevent="onPillClick(pill)"
    >
      <div class="hm-context-pill__icon">
        <component :is="pill.icon" class="w-3.5 h-3.5" />
      </div>
      <div class="hm-context-pill__body">
        <span class="hm-context-pill__label">{{ pill.label }}</span>
        <span class="hm-context-pill__val">{{ pill.value }}</span>
      </div>
    </div>
  </div>
</template>
<style src="@/components/dashboard/styles/OrchestratorBuilder.shared.css"></style>
