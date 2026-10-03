<template>
  <!-- 本地引擎能力面板：可折叠展示 hints/sections/limitations -->
  <div
    v-if="visible"
    class="wr-engine-panel"
    :class="{ 'wr-engine-panel--collapsed': collapsible && collapsed }"
  >
    <!-- 可折叠时的标题栏按钮 -->
    <button
      v-if="collapsible"
      type="button"
      class="wr-engine-panel__head"
      :aria-expanded="!collapsed"
      @click="onToggle"
    >
      <Cpu class="wr-engine-panel__icon" aria-hidden="true" />
      <span class="wr-engine-panel__title">{{ title }}</span>
      <span v-if="collapsed && summary" class="wr-engine-panel__summary">{{ summary }}</span>
      <ChevronDown
        :class="['wr-engine-panel__chev', !collapsed && 'wr-engine-panel__chev--open']"
      />
    </button>
    <!-- 不可折叠时的静态标题 -->
    <div v-else class="wr-engine-panel__head wr-engine-panel__head--static">
      <Cpu class="wr-engine-panel__icon" aria-hidden="true" />
      <span class="wr-engine-panel__title">{{ title }}</span>
    </div>

    <div v-show="!collapsible || !collapsed" class="wr-engine-panel__body">
      <!-- 提示项列表 -->
      <div v-if="hints.length" class="wr-engine-panel__hints">
        <p v-for="(hint, i) in hints" :key="i" class="wr-engine-hint">
          <span v-if="hint.label" class="wr-engine-hint__label">{{ hint.label }}</span>
          <span class="wr-engine-hint__text">{{ hint.text }}</span>
        </p>
      </div>

      <!-- 能力分组：每个 section 含若干 chip -->
      <div v-if="sections.length" class="wr-engine-panel__sections">
        <div v-for="section in sections" :key="section.label" class="wr-engine-section">
          <span :class="['wr-engine-section__label', sectionVariantClass(section.variant)]">
            {{ section.label }}
          </span>
          <div class="wr-engine-section__chips">
            <span
              v-for="(item, i) in section.items"
              :key="`${section.label}-${i}-${item}`"
              :class="['wr-engine-chip', chipVariantClass(section.variant)]"
              >{{ item }}</span
            >
          </div>
        </div>
      </div>

      <!-- 能力边界详情：折叠态展示数量，展开后列出完整限制列表 -->
      <details v-if="limitations.length" class="wr-engine-limits">
        <summary class="wr-engine-limits__summary">
          <AlertTriangle class="wr-engine-limits__icon" aria-hidden="true" />
          <span>{{ limitsTitle }}</span>
          <span class="wr-engine-limits__count">{{ limitations.length }}</span>
        </summary>
        <ul class="wr-engine-limits__list">
          <li v-for="(lim, i) in limitations" :key="i">{{ lim }}</li>
        </ul>
      </details>
    </div>
  </div>
</template>

<script setup>
/**
 * OrchestratorEngineCapsPanel.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：本地 HomeOS 执行引擎的能力说明面板。展示提示项（hints）、能力分组（sections）、
 *      能力边界（limitations）。支持折叠与持久化。
 * 依赖：vue、@lucide/vue（Cpu/ChevronDown/AlertTriangle）、
 *      useOrchestratorDockCollapse。
 */
import { computed } from 'vue'
import { AlertTriangle, ChevronDown, Cpu } from '@lucide/vue'
import { useOrchestratorDockCollapse } from '@/composables/orchestrator/useOrchestratorDockCollapse'

/**
 * 组件 Props
 * @property {string}   title            - 面板标题
 * @property {Array}    hints             - 提示项数组 [{label?, text}]
 * @property {Array}    sections          - 能力分组 [{label, variant, items}]
 * @property {Array}    limitations       - 能力边界说明列表
 * @property {string}   limitsTitle       - 能力边界 section 标题
 * @property {boolean}  collapsible       - 是否允许折叠
 * @property {boolean}  defaultCollapsed - 默认是否折叠
 * @property {string}   storageKey       - localStorage 键
 */
const props = defineProps({
  title: { type: String, default: '本地引擎能力' },
  hints: { type: Array, default: () => [] },
  sections: { type: Array, default: () => [] },
  limitations: { type: Array, default: () => [] },
  limitsTitle: { type: String, default: '能力边界' },
  collapsible: { type: Boolean, default: true },
  defaultCollapsed: { type: Boolean, default: true },
  storageKey: { type: String, default: 'homeos_orch_engine_caps' },
})

const independent = useOrchestratorDockCollapse(props.storageKey || null, props.defaultCollapsed)

const collapsed = computed(() => independent.collapsed.value)

/**
 * 切换折叠状态
 */
function onToggle() {
  independent.toggle()
}

/**
 * 是否显示面板
 * 任意一项有内容（hints / sections 内 items / limitations）时显示
 * @returns {boolean}
 */
const visible = computed(
  () =>
    props.hints.length > 0 ||
    props.sections.some((s) => s.items?.length) ||
    props.limitations.length > 0,
)

/**
 * 折叠态摘要文案
 * - 有能力 chip：`${n} 项能力`
 * - 有能力边界：`${n} 条说明`
 * - 否则：`展开查看`
 */
const summary = computed(() => {
  const chipCount = props.sections.reduce((n, s) => n + (s.items?.length ?? 0), 0)
  if (chipCount > 0) return `${chipCount} 项能力`
  if (props.limitations.length) return `${props.limitations.length} 条说明`
  return '展开查看'
})

/**
 * section 标签的 variant class
 * @param {string} variant - variant 名称（如 success/warn）
 * @returns {string} 对应 CSS class 或空字符串
 */
function sectionVariantClass(variant) {
  return variant ? `wr-engine-section__label--${variant}` : ''
}

/**
 * section chip 的 variant class
 * @param {string} variant - variant 名称
 * @returns {string} 对应 CSS class 或空字符串
 */
function chipVariantClass(variant) {
  return variant ? `wr-engine-chip--${variant}` : ''
}
</script>

<style scoped src="./styles/OrchestratorEngineCapsPanel.css"></style>