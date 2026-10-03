<!--
  CustomHtmlSnippetPanel.vue / components/widgets/custom-html
  自定义 HTML 微件模板片段面板：Widget Builder 中的代码片段选择器，
  展示预置卡片（id/标题/描述/预览代码），提供插入（追加或分块写入当前激活面板）
  与替换（整体替换完整源码）两种应用操作按钮。
  Props: snippets 片段数组，每项含 id、label、desc、code 四个字段
  Emit: apply(id) 选择插入；replace(id) 选择整段替换
  Slot: 无
  依赖：纯展示型组件，无 store 无 composable 无 API。
        注意 snippet.code 展示前 180 字符加省略号，非完整源码预览。
-->
<script setup>
/**
 * CustomHtmlSnippetPanel - 自定义 HTML 微件模板片段面板
 * 职责：展示预置代码片段卡片，提供「插入」与「替换」两种应用方式。
 * Props:
 * - snippets：片段数组，每项含 id、label、desc、code。
 * Emits:
 * - apply：插入到当前激活面板（分块模式）或追加到完整源码；
 * - replace：用该片段完整替换源码。
 */
defineProps({
  snippets: { type: Array, required: true },
})

const emit = defineEmits(['apply', 'replace'])
</script>

<template>
  <div class="chwt-snippets">
    <p class="chwt-snippets__lead">
      {{ '选择模板快速起步；「插入」在分块编辑时写入当前 Script/Template/Style 面板，否则追加到完整源码。' }}
    </p>
    <div class="chwt-snippets__grid">
      <article v-for="snippet in snippets" :key="snippet.id" class="chwt-snippets__card">
        <div class="chwt-snippets__card-head">
          <h3 class="chwt-snippets__card-title">{{ snippet.label }}</h3>
          <p class="chwt-snippets__card-desc">{{ snippet.desc }}</p>
        </div>
        <pre class="chwt-snippets__preview">{{ snippet.code.slice(0, 180) }}…</pre>
        <div class="chwt-snippets__actions">
          <button type="button" class="chwt-snippets__btn" @click="emit('apply', snippet.id)">
            {{ '插入' }}
          </button>
          <button
            type="button"
            class="chwt-snippets__btn chwt-snippets__btn--ghost"
            @click="emit('replace', snippet.id)"
          >
            {{ '替换' }}
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped src="./styles/CustomHtmlSnippetPanel.css"></style>
