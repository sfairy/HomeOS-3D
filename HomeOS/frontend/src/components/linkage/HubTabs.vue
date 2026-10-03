<!--
  组件文件：HubTabs.vue（LinkageHubTabs 别名）
  所属模块：frontend/src/components/linkage
  组件职责：联动中心（Linkage Hub）视图的顶部标签栏，用于切换自动化 / 场景 / 脚本三大资产分类视图，
    支持展示标签名称以及可选的数量徽章；实现标签切换时 v-model 向上同步当前激活 id。
  Props:
    - modelValue (string)：当前激活标签 id；
    - tabs (TabItem[])：标签配置数组，每项必填 id / label，可选 count。
  Emits:
    - update:modelValue(newId)：点击其他标签触发，父组件通过 v-model 接收。
  依赖：仅 Vue 组合式 API，无外部 Pinia store。
-->
<template>
  <!-- LinkageHubTabs 联动中心视图标签栏：用于切换联动资产分类视图 -->
  <div class="list-page__tabs linkage-hub__tabs" role="tablist" aria-label="联动中心视图">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.id"
      :class="['list-page__tab', modelValue === tab.id && 'list-page__tab--on']"
      @click.stop="onSelect(tab.id)"
    >
      {{ tab.label }}
      <span v-if="tab.count != null" class="list-page__tab-count">{{ tab.count }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * LinkageHubTabs - 联动中心视图标签栏组件
 * 职责：渲染联动中心顶部分类标签，通过 v-model 双向绑定当前激活标签。
 * Props:
 * - modelValue：当前激活的标签 id；
 * - tabs：标签列表，每项含 id、label 与可选数量 count。
 * Emits:
 * - update:modelValue：选中不同标签时触发，附带新标签 id。
 */
const props = defineProps<{
  modelValue: string
  tabs: Array<{ id: string; label: string; count?: number }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onSelect(id: string) {
  // 重复点击当前激活项时跳过，避免无意义更新
  if (id === props.modelValue) return
  emit('update:modelValue', id)
}
</script>
