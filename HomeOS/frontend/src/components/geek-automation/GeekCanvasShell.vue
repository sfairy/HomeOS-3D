<!--
  GeekCanvasShell.vue
  职责：geek-builder 系列画布的「外壳」组件，提供左侧投放栏（rail）+ 舞台（stage）布局。
       领域画布只需通过插槽填充 rail / 默认 / main-before / overlay 即可复用统一外壳。
  所属模块：geek-automation（被 FlowCanvas、SceneCanvas、TemplateCanvas 等复用）。
  关键依赖：useGeekCanvasRailCollapsed（投放栏折叠态持久化）。
  Props：
    - rootClass：领域根 class，供 stage 选择器与领域 scoped CSS 使用。
    - setStageRef/setRootRef：父级回调，用于绑定舞台与画布根 DOM。
    - railAriaLabel/railTitle/tip：投放栏的辅助文本与提示。
    - storageKey：折叠态持久化 key。
    - showLayout/layoutDisabled/layoutTitle：是否显示「自动排版」按钮。
    - expandTitle/collapseTitle：折叠按钮提示。
    - tabindex：根节点 tabindex，便于键盘焦点接入。
    - hydrateOnMount：mounted 后再从 localStorage 读折叠态（与 Scene 原行为对齐）。
  Emits：layout —— 排版按钮点击。
  Slots：
    - rail：左侧投放栏内容，插槽 prop collapsed 表示当前是否折叠。
    - 默认插槽：舞台主内容，插槽 prop collapsed。
    - main-before：舞台前置区（与主舞台一起垂直排布）。
    - tip：投放栏底部提示文字。
    - overlay：浮层（modals / teleport 等自由覆盖）。
-->
<template>
  <div
    :ref="setRootEl"
    :class="[rootClass, 'geek-canvas-shell', railCollapsed && 'is-rail-collapsed']"
    :tabindex="tabindex"
  >
    <aside class="geek-canvas-shell__rail" :aria-label="railAriaLabel">
      <header class="geek-canvas-shell__rail-head">
        <strong v-if="!railCollapsed">{{ railTitle }}</strong>
        <button
          type="button"
          class="geek-canvas-shell__rail-toggle"
          :title="railCollapsed ? expandTitle : collapseTitle"
          :aria-expanded="!railCollapsed"
          @click="toggleRail"
        >
          {{ railCollapsed ? '»' : '«' }}
        </button>
      </header>

      <div class="geek-canvas-shell__rail-scroll">
        <slot name="rail" :collapsed="railCollapsed" />
      </div>

      <footer class="geek-canvas-shell__rail-foot">
        <button
          v-if="showLayout"
          type="button"
          class="geek-canvas-shell__rail-layout"
          :title="layoutTitle"
          :disabled="layoutDisabled"
          @click="$emit('layout')"
        >
          <i aria-hidden="true">{{ '▦' }}</i>
          <span v-if="!railCollapsed">{{ '排版' }}</span>
        </button>
        <p v-if="!railCollapsed" class="geek-canvas-shell__rail-tip">
          <slot name="tip">{{ tip }}</slot>
        </p>
      </footer>
    </aside>

    <div v-if="$slots['main-before']" class="geek-canvas-shell__main">
      <slot name="main-before" />
      <div :ref="setStageEl" class="geek-canvas-shell__stage">
        <slot :collapsed="railCollapsed" />
      </div>
    </div>
    <div v-else :ref="setStageEl" class="geek-canvas-shell__stage">
      <slot :collapsed="railCollapsed" />
    </div>

    <slot name="overlay" />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useGeekCanvasRailCollapsed } from '@/composables/orchestrator/useGeekCanvasRailCollapsed'

const props = defineProps({
  /** 领域根 class，供 builder stage 选择器与领域 scoped CSS 使用 */
  rootClass: { type: String, required: true },
  /** 绑定舞台 DOM：`(el: Element | null) => void` */
  setStageRef: { type: Function, required: true },
  /** 可选：绑定画布根 DOM（如 Flow 键盘焦点 contains） */
  setRootRef: { type: Function, default: null },
  railAriaLabel: { type: String, default: '投放栏' },
  railTitle: { type: String, default: '' },
  tip: { type: String, default: '' },
  storageKey: { type: String, default: '' },
  showLayout: { type: Boolean, default: true },
  layoutDisabled: { type: Boolean, default: false },
  layoutTitle: { type: String, default: '自动排版' },
  expandTitle: { type: String, default: '展开投放栏' },
  collapseTitle: { type: String, default: '收起投放栏' },
  tabindex: { type: [String, Number], default: undefined },
  /** mounted 后再从 localStorage 读（对齐 Scene 原行为） */
  hydrateOnMount: { type: Boolean, default: false },
})

defineEmits(['layout'])

const { railCollapsed, toggleRail, hydrateRailCollapsed } = useGeekCanvasRailCollapsed(
  props.storageKey,
)

function setStageEl(el) {
  props.setStageRef?.(el || null)
}

function setRootEl(el) {
  props.setRootRef?.(el || null)
}

onMounted(() => {
  if (props.hydrateOnMount) hydrateRailCollapsed()
})

defineExpose({
  railCollapsed,
  toggleRail,
  hydrateRailCollapsed,
})
</script>

<style scoped>
.geek-canvas-shell {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  overflow: hidden;
  background: radial-gradient(
    ellipse 70% 60% at 50% 40%,
    rgba(56, 189, 248, 0.06) 0%,
    transparent 70%
  );
  outline: none;
}
.geek-canvas-shell__rail {
  flex: 0 0 168px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(8, 12, 22, 0.72);
}
.geek-canvas-shell.is-rail-collapsed .geek-canvas-shell__rail {
  flex-basis: 48px;
}
.geek-canvas-shell__rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 8px 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}
.geek-canvas-shell__rail-head strong {
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: rgba(226, 232, 240, 0.78);
}
.geek-canvas-shell__rail-toggle {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(30, 41, 59, 0.7);
  color: #e2e8f0;
  cursor: pointer;
}
.geek-canvas-shell__rail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 8px 6px;
}
.geek-canvas-shell__rail-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}
.geek-canvas-shell__rail-layout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(30, 41, 59, 0.55);
  color: rgba(241, 245, 249, 0.88);
  font-size: var(--premium-fs-micro);
  font-weight: 600;
  cursor: pointer;
}
.geek-canvas-shell.is-rail-collapsed .geek-canvas-shell__rail-layout {
  padding: 10px 4px;
}
.geek-canvas-shell__rail-layout i {
  font-style: normal;
  opacity: 0.9;
}
.geek-canvas-shell__rail-layout:hover:not(:disabled) {
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(56, 189, 248, 0.12);
}
.geek-canvas-shell__rail-layout:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.geek-canvas-shell__rail-tip {
  margin: 0;
  font-size: var(--premium-fs-micro);
  line-height: 1.4;
  color: rgba(148, 163, 184, 0.55);
}
.geek-canvas-shell__main {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.geek-canvas-shell__stage {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background:
    radial-gradient(ellipse 90% 55% at 12% -8%, rgba(95, 212, 255, 0.1), transparent 56%),
    radial-gradient(ellipse 70% 45% at 92% 8%, rgba(126, 184, 255, 0.06), transparent 52%),
    radial-gradient(ellipse 60% 40% at 70% 100%, rgba(95, 212, 255, 0.035), transparent 55%),
    #0a121c;
}
.geek-canvas-shell__stage :deep(.vue-flow) {
  width: 100%;
  height: 100%;
}
@media (max-width: 720px) {
  .geek-canvas-shell__rail {
    flex-basis: 168px;
  }
  .geek-canvas-shell.is-rail-collapsed .geek-canvas-shell__rail {
    flex-basis: 48px;
  }
}
</style>

<style>
/* 投放栏通用 item（领域 rail 槽内复用，避免三套 BEM 复制） */
.geek-canvas-shell__rail-section {
  margin-bottom: 8px;
}
.geek-canvas-shell__rail-group,
.geek-canvas-shell__rail-group-label {
  display: flex;
  width: 100%;
  padding: 4px 6px 6px;
  border: 0;
  background: transparent;
  color: rgba(148, 163, 184, 0.7);
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  text-align: left;
  margin: 0;
}
.geek-canvas-shell__rail-group {
  cursor: pointer;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.geek-canvas-shell__rail-group em {
  font-style: normal;
  opacity: 0.7;
}
.geek-canvas-shell__rail-group-mini {
  display: block;
  text-align: center;
  font-size: var(--premium-fs-micro);
  color: rgba(148, 163, 184, 0.55);
  margin-bottom: 6px;
  font-style: normal;
}
.geek-canvas-shell__rail-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.geek-canvas-shell__rail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border-radius: var(--hos-radius-card);
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(241, 245, 249, 0.88);
  font-size: var(--premium-fs-micro);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.geek-canvas-shell__rail-item:hover {
  border-color: rgba(56, 189, 248, 0.35);
  background: rgba(56, 189, 248, 0.1);
}
.geek-canvas-shell__rail-item i {
  flex: 0 0 20px;
  text-align: center;
  font-style: normal;
  opacity: 0.85;
}
.geek-canvas-shell.is-rail-collapsed .geek-canvas-shell__rail-item {
  justify-content: center;
  padding: 10px 4px;
}
.geek-canvas-shell__rail-ha {
  margin-left: auto;
  font-size: 0.65rem;
  font-style: normal;
  color: #7dd3fc;
  opacity: 0.85;
}
.geek-canvas-shell__rail-item.is-ha-only {
  border-color: rgba(56, 189, 248, 0.18);
}
</style>
