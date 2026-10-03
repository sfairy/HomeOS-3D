<!--
  GeekTraceRail.vue
  职责：geek-automation 编辑器试运行时的「执行轨迹」侧栏组件。
       以有序列表回放每一步执行结果，支持 上一步 / 下一步 / 全部 / 点击跳步 四种交互。
       每步根据 ok 字段标记命中（绿）/未命中（红）/当前激活态。
  所属模块：geek-automation。
  关键依赖：formatTraceStep（来自 execution-trace-display.util，把单步轨迹对象格式化为可读文本）。
  Props：
    - trace：执行轨迹数组（每项含 ok / 节点信息等）。
    - success：整体成功态（true/false/null，用于头部状态标签）。
    - step：当前激活步索引（-1 表示未选）。
  Emits：
    - prev：点击「上一步」。
    - next：点击「下一步」。
    - reset：点击「全部」（取消单步聚焦，回到全部视图）。
    - jump：点击某一步时触发（带回索引）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekTraceRail 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * 执行轨迹侧栏：逐步回放（上一步 / 下一步 / 全部 / 点击跳步）。
 */
import { formatTraceStep } from '@/utils/orchestrator/execution-trace-display.util'

defineProps({
  trace: { type: Array, default: () => [] },
  success: { type: Boolean, default: null },
  step: { type: Number, default: -1 },
})

const emit = defineEmits(['prev', 'next', 'reset', 'jump'])
</script>

<template>
  <aside class="geek-builder__trace-rail" aria-label="执行轨迹">
    <header class="geek-builder__trace-rail-head">
      <strong>{{ '执行轨迹' }}</strong>
      <em :class="success === false ? 'is-bad' : 'is-ok'">
        {{ success === false ? '失败' : success === true ? '成功' : '记录' }}
      </em>
    </header>
    <ol class="geek-builder__trace-list">
      <li
        v-for="(step, i) in trace"
        :key="i"
        :class="[
          'geek-builder__trace-item',
          step === i && 'is-active',
          step.ok === false && 'is-miss',
          step.ok === true && 'is-hit',
        ]"
      >
        <button type="button" @click="emit('jump', i)">
          <span>{{ i + 1 }}</span>
          <strong>{{ formatTraceStep(step) }}</strong>
        </button>
      </li>
    </ol>
    <div class="geek-builder__trace-rail-actions">
      <button type="button" class="list-page__btn" :disabled="step <= 0" @click="emit('prev')">
        {{ '上一步' }}
      </button>
      <button
        type="button"
        class="list-page__btn"
        :disabled="step >= trace.length - 1"
        @click="emit('next')"
      >
        {{ '下一步' }}
      </button>
      <button type="button" class="list-page__link-btn" @click="emit('reset')">{{ '全部' }}</button>
    </div>
  </aside>
</template>

<style scoped>
.geek-builder__trace-rail {
  flex: 0 0 200px;
  width: 200px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  margin: 12px 0 12px 12px;
  border-radius: var(--hos-radius-panel);
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.geek-builder__trace-rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  font-size: var(--premium-fs-micro);
}
.geek-builder__trace-rail-head em {
  font-style: normal;
  opacity: 0.8;
}
.geek-builder__trace-rail-head em.is-ok {
  color: #34d399;
}
.geek-builder__trace-rail-head em.is-bad {
  color: #f87171;
}
.geek-builder__trace-list {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  padding: 8px;
  list-style: none;
  overflow: auto;
  display: grid;
  gap: 4px;
  align-content: start;
}
.geek-builder__trace-item button {
  width: 100%;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  text-align: left;
  padding: 8px;
  border-radius: var(--hos-radius-card);
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: var(--premium-fs-micro);
}
.geek-builder__trace-item button span {
  opacity: 0.45;
  font-variant-numeric: tabular-nums;
}
.geek-builder__trace-item button strong {
  font-weight: 550;
  word-break: break-word;
}
.geek-builder__trace-item.is-active button {
  border-color: rgba(96, 165, 250, 0.7);
  background: rgba(59, 130, 246, 0.16);
}
.geek-builder__trace-item.is-hit button strong {
  color: #6ee7b7;
}
.geek-builder__trace-item.is-miss button strong {
  color: #fca5a5;
}
.geek-builder__trace-rail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}
</style>

<style>
@media (max-width: 720px) {
  .app-shell:not(.app-shell--scaling) .geek-builder__trace-rail {
    flex: 0 0 auto;
    width: auto;
    margin: 8px 12px 0;
    max-height: 140px;
  }
}
</style>
