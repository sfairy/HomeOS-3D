<!--
  组件文件：WidgetBuilderScaffoldPanel.vue
  所属模块：frontend/src/components/widgets/custom-html
  组件职责：自定义 HTML 微件脚手架面板，提供四种脚手架类型（单开关/传感器/多开关/静态卡片）
    的可视化选择与实体绑定入口，一键为 Widget Builder 生成初始示例代码，降低小部件自定义门槛。
  主要 v-model / emits：
    - v-model:kind（字符串）：脚手架类型；
    - v-model:selectedEntityIds（string[]）：已绑定的实体 ID 列表；
    - emit('generate')：触发代码生成，附带 kind 与实体数组；
    - emit('open-entity-picker')：请求父组件打开实体选择器。
  依赖关系：@lucide/vue 图标；CustomHtmlScaffoldKind 类型来自 utils/widget/custom-html-widget.util。
  注意事项：多开关脚手架必须至少绑定一个实体才允许生成，静态卡片可零实体生成示例代码。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/components
 * 职责：实现 WidgetBuilderScaffoldPanel 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'
import { Zap, Thermometer, LayoutTemplate, List } from '@lucide/vue'
import type { CustomHtmlScaffoldKind } from '@/utils/widget/custom-html-widget.util'

const kind = defineModel('kind', { type: String, default: 'toggle' })
const selectedEntityIds = defineModel<string[]>('selectedEntityIds', { default: () => [] })

const emit = defineEmits(['generate', 'open-entity-picker'])

const kinds = [
  { id: 'toggle', label: '单开关', desc: '一个可点击切换的开关/布尔实体', icon: Zap },
  { id: 'sensor', label: '传感器', desc: '展示单个传感器数值与单位', icon: Thermometer },
  { id: 'multi-toggle', label: '多开关', desc: '多个实体纵向排列，适合快捷控制', icon: List },
  { id: 'static', label: '静态卡片', desc: '纯展示内容，不绑定实体', icon: LayoutTemplate },
] as const

const canGenerate = computed(() => {
  // 多开关必须至少绑定一个实体；其余类型允许空实体生成示例代码
  if (kind.value === 'static') return true
  if (kind.value === 'multi-toggle') return selectedEntityIds.value.length > 0
  return true
})

const entitiesHint = computed(() => {
  if (kind.value === 'multi-toggle' && !selectedEntityIds.value.length) {
    return '多开关至少选择一个实体后才能生成。'
  }
  if (!selectedEntityIds.value.length) {
    return '未选择时将使用示例实体 ID，生成后请替换。'
  }
  return ''
})

function onGenerate() {
  if (!canGenerate.value) return
  emit('generate', {
    kind: kind.value as CustomHtmlScaffoldKind,
    entityIds: [...selectedEntityIds.value],
  })
}
</script>

<!--
  WidgetBuilderScaffoldPanel.vue / components/widgets/custom-html
  自定义 HTML 微件脚手架面板：Widget Builder 的起步选择器，提供单开关/温度计/
  多开关组/静态列表四种预置 kind，带实体多选，点击生成按钮输出初始模板代码。
  v-model: kind 当前脚手架类型 + selectedEntityIds 已绑定实体 ID 数组
  Emit: generate(kind, entityIds) 通知外层生成代码
        / open-entity-picker 打开实体批量选择弹窗
  依赖：lucide Zap/Thermometer/LayoutTemplate/List 四类图标；
        custom-html-widget.util CustomHtmlScaffoldKind 类型定义。
  注意：kind 为 multi-toggle 时需多个实体，其它 kind 通常取第一个实体。
-->
<template>
  <div class="builder-scaffold">
    <p class="builder-scaffold__lead">
      {{ '选择面板类型并绑定实体，一键生成可运行的 Script + Template，随后在「分块编辑」中微调。' }}
    </p>

    <div class="builder-scaffold__grid">
      <button
        v-for="item in kinds"
        :key="item.id"
        type="button"
        class="builder-scaffold__kind"
        :class="{ 'builder-scaffold__kind--active': kind === item.id }"
        @click="kind = item.id"
      >
        <component :is="item.icon" class="builder-scaffold__kind-icon" />
        <span class="builder-scaffold__kind-label">{{ item.label }}</span>
        <span class="builder-scaffold__kind-desc">{{ item.desc }}</span>
      </button>
    </div>

    <div v-if="kind !== 'static'" class="builder-scaffold__entities">
      <div class="builder-scaffold__entities-head">
        <span class="builder-scaffold__entities-title">
          {{ kind === 'multi-toggle' ? '选择多个实体' : '选择实体' }}
        </span>
        <button type="button" class="builder-toolbar-btn" @click="emit('open-entity-picker')">
          {{ selectedEntityIds.length ? `已选 ${selectedEntityIds.length} 个 · 更改` : '选择实体' }}
        </button>
      </div>
      <div v-if="selectedEntityIds.length" class="builder-scaffold__entity-chips">
        <code v-for="id in selectedEntityIds" :key="id" class="builder-scaffold__entity-chip">{{ id }}</code>
      </div>
      <p v-if="entitiesHint" class="builder-scaffold__entities-hint">{{ entitiesHint }}</p>
    </div>

    <button
      type="button"
      class="builder-scaffold__generate"
      :disabled="!canGenerate"
      @click="onGenerate"
    >
      {{ '生成面板代码并进入编辑' }}
    </button>
  </div>
</template>

<style scoped src="./styles/WidgetBuilderScaffoldPanel.css"></style>
