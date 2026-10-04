/**
 * @file UtilityMeterPopupShell.vue
 * @module components/entities/popups
 * @brief 公事业仪表弹窗通用外壳
 *
 * 职责：
 * - 为水/电/气仪表弹窗提供统一外壳样式（主题色、标题、账户切换、余额展示）
 * - 包含标题栏、账户下拉、余额标签与默认插槽内容区
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（ChevronDown）、HosSelect
 * - 外部样式 @/assets/styles/utility-meter-popup.css
 */
<template>
  <!-- UtilityMeterPopupShell 公事业仪表弹窗外壳：仪表弹窗的通用外壳容器 -->
  <div class="um-popup" :style="themeStyle">
    <header class="um-header">
      <div class="um-header__main">
        <div class="um-header__icon"><slot name="icon" /></div>
        <div class="um-header__text">
          <span class="um-header__title">{{ title }}</span>
          <span v-if="showSubtitle" class="um-header__sub">{{ subtitle }}</span>
        </div>
      </div>
      <HosSelect
        v-if="accountOptions.length > 1"
        :value="activeEntityId"
        block
        trigger-class="um-account-select"
        @change="$emit('update:activeEntityId', $event)"
      >
        <option v-for="aid in accountOptions" :key="aid" :value="aid">
          {{ accountLabel(aid) }}
        </option>
      </HosSelect>
    </header>

    <section class="um-balance">
      <div class="um-balance__row">
        <div class="um-balance__primary">
          <span class="um-balance__tag">{{ balanceLabel }}</span>
          <span class="um-balance__amount"><em>¥</em>{{ balance }}</span>
        </div>
        <div class="um-balance__chips">
          <span class="um-balance__chip">
            <em>{{ priceLabel }}</em>
            <strong>{{ price }}</strong
            ><small>{{ priceUnit }}</small>
          </span>
          <span class="um-balance__chip">
            <em>{{ estimatedUseLabel }}</em>
            <strong>{{ remDays === '--' ? '--' : remDays }}</strong>
            <small v-if="remDays !== '--'">{{ dayUnit }}</small>
            <i v-if="remDate">{{ remDate }}</i>
          </span>
        </div>
      </div>
      <footer class="um-balance__foot">
        <span>{{ dataDateLabel }}{{ dataDate || '--' }}</span>
        <span v-if="relLabel" :class="['um-rel-tag', relClass]">{{ relLabel }}</span>
      </footer>
    </section>

    <slot name="before-stats" />

    <section class="um-usage">
      <h3 class="um-section-title">{{ usageOverviewLabel }}</h3>
      <div class="um-stats">
        <article
          v-for="card in statCards"
          :key="card.key"
          class="um-stat-card"
          :class="expTab === card.tab && 'um-stat-card--active'"
          @click.stop="$emit('open-tab', card.tab)"
        >
          <span v-if="card.trendStr" class="um-stat-trend" :class="card.trendDir">{{
            card.trendStr
          }}</span>
          <div class="um-stat-label">{{ card.label }}</div>
          <div class="um-stat-metrics">
            <div class="um-stat-metric um-stat-metric--usage">
              <span class="um-stat-val">{{ card.usage }}</span>
              <span class="um-stat-u">{{ usageUnit }}</span>
            </div>
            <div class="um-stat-metric um-stat-metric--cost">
              <span class="um-stat-val">{{ card.cost }}</span>
              <span class="um-stat-u">{{ costUnit }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <slot name="after-stats" />

    <button
      v-if="hasChartData"
      type="button"
      class="um-daily-bar"
      @click.stop="$emit('open-tab', 'day')"
    >
      <span class="um-daily-label">{{ dailyBarLabel }}</span>
      <span class="um-daily-vals">
        <span class="um-daily-val um-daily-val--usage">{{ dUsage }}</span>
        <span class="um-daily-u">{{ usageUnit }}</span>
        <span class="um-daily-sep">·</span>
        <span class="um-daily-val um-daily-val--cost">{{ dCost }}</span>
        <span class="um-daily-u">{{ costUnit }}</span>
        <ChevronDown :class="['um-exp-icon', expanded && 'um-exp-icon--open']" />
      </span>
    </button>

    <slot />
  </div>
</template>

<script setup>
/**
 * 职责：实现 UtilityMeterPopupShell 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * UtilityMeterPopupShell - 公事业仪表弹窗外壳组件
 * 功能特性：
 * - 提供仪表弹窗的通用外壳样式
 * - 包含标题、关闭按钮等通用元素
 * - 作为各类型仪表弹窗的容器
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed } from 'vue'
import { ChevronDown } from '@lucide/vue'
import '@/assets/styles/utility-meter-popup.css'

const props = defineProps({
  theme: {
    type: Object,
    default: () => ({
      accent: '#fb923c',
      accentSoft: 'rgba(249, 115, 22, 0.14)',
      usage: '#4ade80',
      cost: '#facc15',
    }),
  },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  showSubtitle: { type: Boolean, default: false },
  activeEntityId: { type: String, default: '' },
  accountOptions: { type: Array, default: () => [] },
  accountLabel: { type: Function, default: (id) => id },
  balanceLabel: { type: String, required: true },
  balance: { type: [String, Number], default: '--' },
  priceLabel: { type: String, required: true },
  price: { type: [String, Number], default: '--' },
  priceUnit: { type: String, default: '' },
  estimatedUseLabel: { type: String, required: true },
  remDays: { type: [String, Number], default: '--' },
  remDate: { type: String, default: '' },
  dayUnit: { type: String, default: '' },
  dataDateLabel: { type: String, required: true },
  dataDate: { type: String, default: '' },
  relLabel: { type: String, default: '' },
  relClass: { type: String, default: '' },
  usageOverviewLabel: { type: String, required: true },
  statCards: { type: Array, default: () => [] },
  usageUnit: { type: String, default: '' },
  costUnit: { type: String, default: '' },
  hasChartData: { type: Boolean, default: false },
  dailyBarLabel: { type: String, required: true },
  dUsage: { type: [String, Number], default: '--' },
  dCost: { type: [String, Number], default: '--' },
  expanded: { type: Boolean, default: false },
  expTab: { type: String, default: '' },
})

defineEmits(['update:activeEntityId', 'open-tab'])

const themeStyle = computed(() => ({
  '--um-accent': props.theme.accent,
  '--um-accent-soft': props.theme.accentSoft,
  '--um-usage': props.theme.usage,
  '--um-cost': props.theme.cost,
}))
</script>

<style src="./styles/PopupAccents.css"></style>
