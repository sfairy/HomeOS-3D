/**
 * @file UtilityMeterExpandPanel.vue
 * @module components/entities/popups
 * @brief 公事业仪表展开面板
 *
 * 职责：
 * - 仪表弹窗的展开视图：按日/月/年 Tab 切换用量与费用图表
 * - 日历视图：按日单元格展示用量热力，支持月份切换与「今天」跳转
 * - 顶部展示汇总用量与费用；所有数据与图表 ref 由父组件透传，本身仅负责展示与事件冒泡
 *
 * 依赖：
 * - @lucide/vue（X 图标）
 * - 父组件通过 props 传入汇总、日历、图表 ref 与回调
 */
<template>
  <div :class="`${prefix}-expand`">
    <div :class="`${prefix}-expand-tabs`">
      <button
        :class="[`${prefix}-expand-tab`, expTab === 'day' && `${prefix}-expand-tab--active`]"
        @click.stop="$emit('switchTab', 'day')"
      >
        {{ '日' }}
      </button>
      <button
        :class="[`${prefix}-expand-tab`, expTab === 'month' && `${prefix}-expand-tab--active`]"
        @click.stop="$emit('switchTab', 'month')"
      >
        {{ '月' }}
      </button>
      <button
        :class="[`${prefix}-expand-tab`, expTab === 'year' && `${prefix}-expand-tab--active`]"
        @click.stop="$emit('switchTab', 'year')"
      >
        {{ '年' }}
      </button>
      <button
        :class="[`${prefix}-expand-tab`, expTab === 'calendar' && `${prefix}-expand-tab--active`]"
        @click.stop="$emit('switchTab', 'calendar')"
      >
        {{ '日历' }}
      </button>
      <button
        type="button"
        :class="`${prefix}-expand-close`"
        :aria-label="'关闭'"
        @click.stop="$emit('closeExpand')"
      >
        <X class="w-3 h-3" />
      </button>
    </div>

    <div v-if="expTab !== 'calendar'" :class="`${prefix}-expand-summary`">
      <span>{{ summaryLabel }} </span>
      <span class="green">{{ sumUsage }}</span>
      <span :class="`${prefix}-sum-u`"> {{ unitLabel }}</span>
      <span :class="`${prefix}-sum-sep`">|</span>
      <span class="yellow">{{ sumCost }}</span>
      <span :class="`${prefix}-sum-u`"> {{ '元' }}</span>
    </div>

    <div v-if="expTab === 'day'" :ref="setDayChartRef" :class="`${prefix}-chart-container`" />
    <div v-if="expTab === 'month'" :ref="setMonthChartRef" :class="`${prefix}-chart-container`" />
    <div v-if="expTab === 'year'" :ref="setYearChartRef" :class="`${prefix}-chart-container`" />

    <div v-if="expTab === 'calendar'" :class="`${prefix}-calendar`">
      <div :class="`${prefix}-calendar-header`">
        <button :class="`${prefix}-cal-nav`" @click.stop="$emit('calPrev')">&lt;</button>
        <span :class="`${prefix}-cal-title`">{{ `${calYear}年${calMonth}月` }}</span>
        <button :class="`${prefix}-cal-nav`" @click.stop="$emit('calNext')">&gt;</button>
        <button :class="`${prefix}-cal-today`" @click.stop="$emit('calToday')">{{ '本月' }}</button>
      </div>
      <div :class="`${prefix}-cal-grid`">
        <div :class="`${prefix}-cal-dow`" v-for="d in calDayNames" :key="d">{{ d }}</div>
        <div
          v-for="(cell, idx) in calCells"
          :key="idx"
          :class="[`${prefix}-cal-cell`, cell.cls]"
          @click.stop="cell._data && $emit('openDayTab', cell)"
        >
          <span :class="`${prefix}-cal-date`">{{ cell.day }}</span>
          <span v-if="cell._data" :class="`${prefix}-cal-val`">{{ cell._usage }}</span>
          <span v-if="cell._data" :class="`${prefix}-cal-cost`">{{ cell._cost }}</span>
        </div>
      </div>
      <div :class="`${prefix}-cal-stats`">
        <span
          >{{ '月用量:' }} <b class="green">{{ calMonthUsage }}</b
          >{{ unitLabel }}</span
        >
        <span
          >{{ '月费用:' }} <b class="yellow">{{ calMonthCost }}</b
          >{{ '元' }}</span
        >
      </div>
    </div>

    <div v-if="expTab !== 'calendar'" :class="`${prefix}-list`">
      <div :class="`${prefix}-list-hd`">
        <span>{{ '日期' }}</span>
        <span>{{ `用量(${unitLabel})` }}</span>
        <span>{{ '费用(元)' }}</span>
      </div>
      <div :class="`${prefix}-list-body`">
        <div
          v-for="(d, i) in curList"
          :key="i"
          :class="[
            `${prefix}-list-row`,
            { [`${prefix}-list-row--max`]: d._isMax, [`${prefix}-list-row--min`]: d._isMin },
          ]"
        >
          <span :class="`${prefix}-list-day`">{{ d._label || d._time || '--' }}</span>
          <span :class="`${prefix}-list-val green`">{{ d._usage || '--' }}</span>
          <span :class="`${prefix}-list-val yellow`">{{ d._cost || '--' }}</span>
        </div>
        <div v-if="!curList.length" :class="`${prefix}-list-empty`">{{ '暂无数据' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 职责：实现 UtilityMeterExpandPanel 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { X } from '@lucide/vue'
defineProps({
  prefix: { type: String, required: true },
  expTab: { type: String, default: 'day' },
  summaryLabel: { type: String, default: '' },
  sumUsage: { type: [String, Number], default: '--' },
  sumCost: { type: [String, Number], default: '--' },
  unitLabel: { type: String, default: '' },
  curList: { type: Array, default: () => [] },
  calYear: { type: Number, default: 0 },
  calMonth: { type: Number, default: 0 },
  calDayNames: { type: Array, default: () => [] },
  calCells: { type: Array, default: () => [] },
  calMonthUsage: { type: [String, Number], default: '--' },
  calMonthCost: { type: [String, Number], default: '--' },
  setDayChartRef: { type: Function, default: null },
  setMonthChartRef: { type: Function, default: null },
  setYearChartRef: { type: Function, default: null },
})

defineEmits(['switchTab', 'closeExpand', 'calPrev', 'calNext', 'calToday', 'openDayTab'])
</script>
