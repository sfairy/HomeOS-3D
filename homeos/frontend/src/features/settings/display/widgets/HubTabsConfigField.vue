<!--
  组件文件：HubTabsConfigField.vue
  所属模块：frontend/src/features/settings/display/widgets
  组件职责：各类 Hub 小部件（天气/安防/快捷自动化/媒体）的通用 Tab 配置字段组件。
    上半部分为可见 Tab 勾选与排序（按点击顺序编号，至少保留 1 个），下半部分为默认
    Tab 段式选择（仅在可见 Tab 内切换）。
  主要 props / emits：
    - props tabSet：HubTabOption 数组（当前 Hub 类型支持的全部 Tab）
    - defineModel draft：双向绑定 { defaultTab, visibleTabs } 草稿对象
  依赖关系：引用 HubTabOption TS 类型；纯表单组件无外部 API 或 store。
  注意事项：visibleTabs 为空或类型异常时，resolveDraft 安全兜底为空数组避免崩溃；
    默认 Tab 必须在 visibleTabs 中才显示为选项。
-->
<template>
  <div class="hub-tabs-config">
    <div class="hub-tabs-config__section">
      <label class="settings-form-label">{{ '显示 Tab' }}</label>
      <p class="hub-tabs-config__hint">{{ '至少保留 1 个；未勾选的视图不会在 Tab 栏出现。' }}</p>
      <div class="hub-tabs-config__grid">
        <button
          v-for="tab in tabSet"
          :key="tab.id"
          type="button"
          :disabled="isTabVisible(tab.id) && visibleTabCount <= 1"
          :class="[
            'hub-tabs-config__toggle',
            isTabVisible(tab.id) && 'hub-tabs-config__toggle--on',
          ]"
          @click="toggleTab(tab.id)"
        >
          <span v-if="isTabVisible(tab.id)" class="hub-tabs-config__order">{{
            tabOrder(tab.id)
          }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <div class="hub-tabs-config__section">
      <label class="settings-form-label">{{ '默认 Tab' }}</label>
      <div class="hub-tabs-config__segments">
        <button
          v-for="tab in visibleTabOptions"
          :key="tab.id"
          type="button"
          :class="[
            'hub-tabs-config__segment',
            safeDraft.defaultTab === tab.id && 'hub-tabs-config__segment--active',
          ]"
          @click="setDefaultTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HubTabOption } from '@/utils/registry/hub-tabs-options'

const props = defineProps<{
  tabSet: HubTabOption[]
}>()

const draft = defineModel<{ defaultTab: string; visibleTabs: string[] }>({ required: true })

const EMPTY_DRAFT = { defaultTab: '', visibleTabs: [] as string[] }

function resolveDraft() {
  const raw = draft.value
  if (!raw || typeof raw !== 'object') return { ...EMPTY_DRAFT, visibleTabs: [] as string[] }
  return {
    defaultTab: String(raw.defaultTab || ''),
    visibleTabs: Array.isArray(raw.visibleTabs) ? raw.visibleTabs.map(String) : [],
  }
}

const safeDraft = computed(() => resolveDraft())

const visibleTabOptions = computed(() => {
  const { visibleTabs } = safeDraft.value
  return (props.tabSet || []).filter((tab) => visibleTabs.includes(tab.id))
})

const visibleTabCount = computed(() => resolveDraft().visibleTabs.length)

function isTabVisible(id: string) {
  return resolveDraft().visibleTabs.includes(id)
}

function tabOrder(id: string) {
  return resolveDraft().visibleTabs.indexOf(id) + 1
}

function setDefaultTab(id: string) {
  const current = resolveDraft()
  draft.value = { ...current, defaultTab: id }
}

function toggleTab(id: string) {
  const current = resolveDraft()
  const list = [...current.visibleTabs]
  const idx = list.indexOf(id)
  if (idx >= 0) {
    if (list.length <= 1) return
    list.splice(idx, 1)
    const defaultTab =
      current.defaultTab === id ? list[0] || props.tabSet[0]?.id || '' : current.defaultTab
    draft.value = { defaultTab, visibleTabs: list }
    return
  }
  list.push(id)
  list.sort(
    (a, b) =>
      (props.tabSet || []).findIndex((t) => t.id === a) -
      (props.tabSet || []).findIndex((t) => t.id === b),
  )
  draft.value = { ...current, visibleTabs: list }
}
</script>

<style scoped src="./styles/HubTabsConfigField.css"></style>
