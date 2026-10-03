<!--
  GeekDryRunPanel.vue
  职责：试运行评估的结果展示面板，根据传入的评估结果渲染触发就绪、条件满足与动作预览。
  所属模块：geek-automation。
  关键依赖：@lucide/vue 的 AlertTriangle（警告）/ Loader2（加载 spinner）。
  Props：
    - busy：评估进行中态。
    - error：评估失败时的错误信息。
    - result：评估结果对象，含 wouldFire / triggerReady / conditionsPass / warnings /
      triggers / conditions / actions 等字段。
  Emits：rerun —— 重新评估。
  关键交互：
    - 三态切换：加载中 / 失败 / 结果展示。
    - 结果区按触发/条件/动作三段分别列出，并支持条件分组子项展示。
    - 顶部 hero 区按 wouldFire 决定主视觉态（绿色就绪 / 灰色 idle）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekDryRunPanel 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * 试运行评估结果面板：加载态 / 失败态 / 结果详情（触发就绪、条件满足、动作预览）。
 */
import { AlertTriangle, Loader2 } from '@lucide/vue'

defineProps({
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  result: { type: Object, default: null },
})

defineEmits(['rerun'])
</script>

<template>
  <template v-if="busy">
    <div class="geek-builder__dryrun-empty">
      <Loader2 class="w-5 h-5 animate-spin" />
      <span>{{ '正在按当前状态评估…' }}</span>
    </div>
  </template>
  <template v-else-if="error">
    <div class="geek-builder__dryrun-error">
      <p class="geek-builder__dryrun-error-title">{{ '评估失败' }}</p>
      <p>{{ error }}</p>
    </div>
  </template>
  <template v-else-if="result">
    <div class="geek-builder__dryrun-hero" :class="result.wouldFire ? 'is-ready' : 'is-idle'">
      <div class="geek-builder__dryrun-hero-icon">
        {{ result.wouldFire ? '▶' : '⏸' }}
      </div>
      <div>
        <strong>
          {{ result.wouldFire ? '按当前状态即会执行' : '当前状态下不会执行' }}
        </strong>
        <p>
          触发就绪 {{ result.triggerReady ? '✓' : '✗' }}
          · 条件满足 {{ result.conditionsPass ? '✓' : '✗' }}
        </p>
      </div>
    </div>

    <ul v-if="result.warnings.length" class="geek-builder__dryrun-warnings">
      <li v-for="(w, i) in result.warnings" :key="i">
        <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
        <span>{{ w }}</span>
      </li>
    </ul>

    <section class="geek-builder__dryrun-section">
      <h4>{{ '触发评估' }}</h4>
      <ul class="geek-builder__dryrun-list">
        <li v-if="!result.triggers.length" class="geek-builder__dryrun-none">
          {{ '未配置触发器（仅可手动触发）' }}
        </li>
        <li v-for="(t, i) in result.triggers" :key="i" class="geek-builder__dryrun-row">
          <span
            class="geek-builder__dryrun-tag"
            :class="t.static ? (t.ready ? 'is-ready' : 'is-idle') : 'is-wait'"
          >
            {{ t.static ? (t.ready ? '就绪' : '未就绪') : '等待' }}
          </span>
          <div class="geek-builder__dryrun-row-main">
            <p class="geek-builder__dryrun-row-label">{{ t.label }}</p>
            <p class="geek-builder__dryrun-row-detail">{{ t.detail }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section class="geek-builder__dryrun-section">
      <h4>{{ '条件评估' }}</h4>
      <ul class="geek-builder__dryrun-list">
        <li v-if="!result.conditions.length" class="geek-builder__dryrun-none">
          {{ '未配置条件（始终满足）' }}
        </li>
        <template v-for="(c, i) in result.conditions" :key="i">
          <li class="geek-builder__dryrun-row">
            <span class="geek-builder__dryrun-tag" :class="c.ok ? 'is-ready' : 'is-idle'">
              {{ c.ok ? '满足' : '不满足' }}
            </span>
            <div class="geek-builder__dryrun-row-main">
              <p class="geek-builder__dryrun-row-label">{{ c.detail }}</p>
            </div>
          </li>
          <template v-if="c.children && c.children.length">
            <li
              v-for="(sub, j) in c.children"
              :key="`${i}-${j}`"
              class="geek-builder__dryrun-row geek-builder__dryrun-row--sub"
            >
              <span class="geek-builder__dryrun-tag" :class="sub.ok ? 'is-ready' : 'is-idle'">
                {{ sub.ok ? '满足' : '不满足' }}
              </span>
              <div class="geek-builder__dryrun-row-main">
                <p class="geek-builder__dryrun-row-label">{{ sub.detail }}</p>
              </div>
            </li>
          </template>
        </template>
      </ul>
    </section>

    <section class="geek-builder__dryrun-section">
      <h4>{{ '动作预览' }}</h4>
      <ul class="geek-builder__dryrun-list">
        <li v-if="!result.actions.length" class="geek-builder__dryrun-none">
          {{ '未配置动作（触发后不会有任何操作）' }}
        </li>
        <li v-for="(a, i) in result.actions" :key="i" class="geek-builder__dryrun-row">
          <span class="geek-builder__dryrun-tag geek-builder__dryrun-tag--action">
            {{ '动作' }}
          </span>
          <div class="geek-builder__dryrun-row-main">
            <p class="geek-builder__dryrun-row-label">{{ a.label }}</p>
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
.geek-builder__dryrun-warnings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.geek-builder__dryrun-warnings li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(251, 191, 36, 0.28);
  background: rgba(251, 191, 36, 0.06);
  color: #fcd34d;
  font-size: var(--premium-fs-micro);
  line-height: 1.4;
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
.geek-builder__dryrun-none {
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px dashed rgba(148, 163, 184, 0.25);
  color: #94a3b8;
  font-size: var(--premium-fs-micro);
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
