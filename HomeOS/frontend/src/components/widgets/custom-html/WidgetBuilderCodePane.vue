<!--
  组件文件：WidgetBuilderCodePane.vue
  所属模块：frontend/src/components/widgets/custom-html
  组件职责：小部件构建器代码面板组件，作为自定义 HTML 小部件的核心编辑区，展示带行号的代码编辑
    容器，支持 HTML/CSS/JS 多语法文本输入、textarea 原生 DOM 暴露、键盘事件上传与实时预览对接。
  主要 props / emits：
    - props.modelValue (String)：当前编辑的代码文本；
    - props.rows (Number 16 默认)：textarea 可见行数；
    - props.placeholder / props.label：占位提示与外显标签；
    - emit('update:modelValue')：代码文本变更；
    - emit('keydown')：键盘事件向上冒泡；
    - emit('textarea-bind', el)：将原生 textarea DOM 节点暴露给父组件用于外层绑定与自定义快捷键。
  依赖关系：纯 Vue 组合式 API，无外部 store 依赖。
  注意事项：行号区仅随 modelValue 的换行同步更新，不做语法高亮（高亮由父组件或外部 Monaco/CodeMirror 挂载）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 WidgetBuilderCodePane 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  rows: { type: Number, default: 16 },
  placeholder: { type: String, default: '' },
  label: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'keydown', 'textarea-bind'])

const lineNumbers = computed(() => {
  const count = Math.max(1, String(props.modelValue || '').split('\n').length)
  return Array.from({ length: count }, (_, i) => i + 1)
})

function bindTextarea(el) {
  emit('textarea-bind', el)
}

function onInput(event) {
  emit('update:modelValue', event.target.value)
}

function onKeydown(event) {
  emit('keydown', event)
}
</script>

<!--
  WidgetBuilderCodePane.vue / components/widgets/custom-html
  Widget Builder 代码编辑面板：左侧行号 + 中间 textarea 源码编辑的极简代码镜，
  通过 v-model 双向绑定源码字符串，向上冒泡 keydown 与 textarea 原生 DOM 引用。
  Props: modelValue 源码字符串 / rows 可视行数 / placeholder 占位文字 / label 栏标题
  Emit: update:modelValue 文本变更 / keydown 键盘事件透传
        / textarea-bind 挂载后回传 textarea 元素引用（外层做快捷键）
  Slot: 无
  依赖：纯展示型，无 store 无 composable 无 API。lineNumbers 由 modelValue 行数推导。
  注意：textarea 使用等宽字体（mono）与行号列对齐，高亮样式由外层 scoped CSS 决定。
-->
<template>
  <!-- WidgetBuilderCodePane 小部件构建器代码面板：自定义 HTML 小部件的代码编辑区 -->
  <div class="builder-code-pane">
    <div v-if="label" class="builder-code-pane__label">{{ label }}</div>
    <div class="builder-code-pane__editor">
      <div class="builder-code-pane__gutter" aria-hidden="true">
        <div v-for="n in lineNumbers" :key="n" class="builder-code-pane__line-num">{{ n }}</div>
      </div>
      <textarea
        :ref="bindTextarea"
        :value="modelValue"
        :rows="rows"
        spellcheck="false"
        class="builder-code-pane__textarea"
        :placeholder="placeholder"
        @input="onInput"
        @keydown="onKeydown"
      />
    </div>
  </div>
</template>

<style scoped src="./styles/WidgetBuilderCodePane.css"></style>
