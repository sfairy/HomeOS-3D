<!--
  GeekDuplicatePanel.vue
  职责：规则查重的结果展示面板，列出与当前规则语义重复的现有自动化。
  所属模块：geek-automation。
  关键依赖：@lucide/vue 的 Loader2（加载 spinner）。复用 GeekDryRunPanel 同套 CSS。
  Props：
    - busy：查重进行中态。
    - error：查重失败时的错误信息。
    - result：命中列表数组（每项含 id / name）。
  Emits：rerun —— 重新查重。
  关键交互：
    - 三态切换：加载中 / 失败 / 结果展示。
    - 顶部 hero 区按命中数量决定主视觉态（命中=idle 黄色 / 无命中=ready 绿色）。
    - 命中项以列表形式展示名称与 id，便于人工核对去重。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekDuplicatePanel 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * 规则查重结果面板：加载态 / 失败态 / 命中列表。
 */
import { Loader2 } from '@lucide/vue'

defineProps({
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  result: { type: Array, default: null },
})

defineEmits(['rerun'])
</script>

<template>
  <template v-if="busy">
    <div class="geek-builder__dryrun-empty">
      <Loader2 class="w-5 h-5 animate-spin" />
      <span>{{ '正在比对现有规则签名…' }}</span>
    </div>
  </template>
  <template v-else-if="error">
    <div class="geek-builder__dryrun-error">
      <p class="geek-builder__dryrun-error-title">{{ '查重失败' }}</p>
      <p>{{ error }}</p>
    </div>
  </template>
  <template v-else>
    <div
      class="geek-builder__dryrun-hero"
      :class="result && result.length ? 'is-idle' : 'is-ready'"
    >
      <div class="geek-builder__dryrun-hero-icon">
        {{ result && result.length ? '⚠' : '✓' }}
      </div>
      <div>
        <strong>
          {{
            result && result.length
              ? `发现 ${result.length} 条语义重复的自动化`
              : '未发现语义重复的自动化'
          }}
        </strong>
        <p v-if="result && result.length">
          {{ '建议核对后删除或停用重复规则，避免重复触发' }}
        </p>
        <p v-else>{{ '当前规则签名在现有自动化中唯一' }}</p>
      </div>
    </div>

    <section v-if="result && result.length" class="geek-builder__dryrun-section">
      <h4>{{ '重复命中' }}</h4>
      <ul class="geek-builder__dryrun-list">
        <li
          v-for="(hit, i) in result"
          :key="hit.id || i"
          class="geek-builder__dryrun-row geek-builder__dryrun-row--dup"
        >
          <span class="geek-builder__dryrun-tag geek-builder__dryrun-tag--action">
            {{ '重复' }}
          </span>
          <div class="geek-builder__dryrun-row-main">
            <p class="geek-builder__dryrun-row-label">{{ hit.name }}</p>
            <p class="geek-builder__dryrun-row-detail">{{ hit.id }}</p>
          </div>
        </li>
      </ul>
    </section>
  </template>
</template>

<style scoped>
.geek-builder__dryrun-empty,
.geek-builder__dryrun-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 22px 16px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.5);
  color: #94a3b8;
  font-size: var(--premium-fs-micro);
}
.geek-builder__dryrun-empty {
  justify-content: center;
}
.geek-builder__dryrun-error {
  flex-direction: column;
  align-items: flex-start;
  border-color: rgba(248, 113, 113, 0.35);
  color: #fca5a5;
}
.geek-builder__dryrun-error-title {
  margin: 0;
  font-size: var(--premium-fs-caption);
  font-weight: 700;
  color: #f87171;
}
.geek-builder__dryrun-error p {
  margin: 0;
}
.geek-builder__dryrun-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.6);
}
.geek-builder__dryrun-hero.is-ready {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(16, 185, 129, 0.08);
}
.geek-builder__dryrun-hero.is-idle {
  border-color: rgba(148, 163, 184, 0.25);
  background: rgba(100, 116, 139, 0.1);
}
.geek-builder__dryrun-hero-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: var(--hos-radius-card);
  font-size: 16px;
  background: rgba(148, 163, 184, 0.16);
  color: #94a3b8;
}
.geek-builder__dryrun-hero.is-ready .geek-builder__dryrun-hero-icon {
  background: rgba(52, 211, 153, 0.16);
  color: #34d399;
}
.geek-builder__dryrun-hero strong {
  display: block;
  font-size: var(--premium-fs-body);
  color: #e2e8f0;
}
.geek-builder__dryrun-hero p {
  margin: 4px 0 0;
  font-size: var(--premium-fs-micro);
  color: #94a3b8;
}
.geek-builder__dryrun-section h4 {
  margin: 0 0 8px;
  font-size: var(--premium-fs-caption);
  font-weight: 700;
  color: #cbd5e1;
}
.geek-builder__dryrun-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.geek-builder__dryrun-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.45);
}
.geek-builder__dryrun-row--sub {
  margin-left: 26px;
  background: rgba(15, 23, 42, 0.28);
}
.geek-builder__dryrun-row--dup {
  border-color: rgba(251, 191, 36, 0.28);
  background: rgba(251, 191, 36, 0.06);
}
.geek-builder__dryrun-tag {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: var(--hos-radius-pill);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  border: 1px solid transparent;
}
.geek-builder__dryrun-tag.is-ready {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(16, 185, 129, 0.1);
}
.geek-builder__dryrun-tag.is-idle {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(239, 68, 68, 0.08);
}
.geek-builder__dryrun-tag.is-wait {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.35);
  background: rgba(251, 191, 36, 0.08);
}
.geek-builder__dryrun-tag--action {
  color: #93c5fd;
  border-color: rgba(96, 165, 250, 0.35);
  background: rgba(59, 130, 246, 0.1);
}
.geek-builder__dryrun-row-main {
  min-width: 0;
  flex: 1 1 auto;
}
.geek-builder__dryrun-row-label {
  margin: 0;
  font-size: var(--premium-fs-micro);
  color: #e2e8f0;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.geek-builder__dryrun-row-detail {
  margin: 2px 0 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
</style>
