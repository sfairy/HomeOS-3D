/**
 * @file UtilityMeterInfoPopup.vue
 * @module components/entities/popups
 * @brief 公事业仪表信息弹窗（水/电/气）
 *
 * 职责：
 * - 基于 AnchoredPopupShell 渲染水电气仪表详细信息面板
 * - 展示余额、阶梯电价、用量统计与展开面板（UtilityMeterExpandPanel）
 * - 通过 useUtilityMeterPopup 聚合数据加载、图表渲染与日历逻辑
 *
 * 依赖：
 * - vue（computed）、@lucide/vue
 * - ./AnchoredPopupShell、./UtilityMeterPopupShell、./UtilityMeterTierSection、./UtilityMeterExpandPanel
 * - @/composables/energy/useUtilityMeterPopup、useUtilityBalanceFields
 * - @/composables/energy/utility-entity-helpers、@/utils/energy/popup-read.util
 * - entities.store、layout.store、utility-meter-presets、useEntityType
 */
<template>
  <!-- UtilityMeterInfoPopup 公事业仪表信息弹窗：展示水电气等仪表详细信息 -->
  <AnchoredPopupShell
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="preset.width"
    :height="preset.height"
    :margin="16"
    :class="preset.shellClass"
    :inner-class="preset.innerClass"
    :close-class="preset.closeClass"
    @close="$emit('close')"
  >
    <UtilityMeterPopupShell
      :theme="preset.theme"
      :title="preset.title"
      :subtitle="accountLabel(activeEntityId)"
      :show-subtitle="accountOptions.length <= 1"
      :active-entity-id="activeEntityId"
      :account-options="accountOptions"
      :account-label="accountLabel"
      :balance-label="resolvedBalanceLabel"
      :balance="balance"
      :price-label="preset.priceLabel"
      :price="resolvedPrice"
      :price-unit="preset.priceUnit"
      :estimated-use-label="'预计用'"
      :rem-days="remDays"
      :rem-date="remDate"
      :day-unit="'天'"
      :data-date-label="preset.dataDateLabel"
      :data-date="dataDate"
      :rel-label="relLabel"
      :rel-class="relClass"
      :usage-overview-label="'用量概览'"
      :stat-cards="statCards"
      :usage-unit="preset.usageUnit"
      :cost-unit="'元'"
      :has-chart-data="hasChartData"
      :daily-bar-label="preset.dailyBarLabel"
      :d-usage="dUsage"
      :d-cost="dCost"
      :expanded="exp"
      :exp-tab="expTab"
      @update:active-entity-id="onActiveEntityIdUpdate"
      @open-tab="openTab"
    >
      <template #icon>
        <component :is="preset.icon" class="w-4 h-4" />
      </template>
      <template v-if="preset.hasTierSection && preset.tierTitle && preset.tierUnit" #before-stats>
        <UtilityMeterTierSection
          v-if="pmode === 'tiered'"
          :title="preset.tierTitle"
          :tier-label="tLabel"
          :active-tier="at"
          :t1l="t1l"
          :t2l="t2l"
          :t1p="t1p"
          :t2p="t2p"
          :t3p="t3p"
          :unit="preset.tierUnit"
          :price-unit="preset.priceUnit"
        />
      </template>
      <UtilityMeterExpandPanel
        v-if="exp"
        :prefix="preset.expandPrefix"
        :exp-tab="expTab"
        :summary-label="summaryLabel"
        :sum-usage="sumUsage"
        :sum-cost="sumCost"
        :unit-label="preset.usageUnit"
        :cur-list="curList"
        :cal-year="calYear"
        :cal-month="calMonth"
        :cal-day-names="calDayNames"
        :cal-cells="calCells"
        :cal-month-usage="calMonthUsage"
        :cal-month-cost="calMonthCost"
        :set-day-chart-ref="setDayChartRef"
        :set-month-chart-ref="setMonthChartRef"
        :set-year-chart-ref="setYearChartRef"
        @switch-tab="switchTab"
        @close-expand="closeExpand"
        @cal-prev="onCalPrev"
        @cal-next="onCalNext"
        @cal-today="onCalToday"
        @open-day-tab="openDayTab"
      />
    </UtilityMeterPopupShell>
  </AnchoredPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 UtilityMeterInfoPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * UtilityMeterInfoPopup - 公事业仪表信息弹窗组件
 * 功能特性：
 * - 展示水、电、气等仪表详细信息
 * - 显示使用量和历史数据
 * - 可能包含费用计算
 * - 弹出式面板
 */
import { computed } from 'vue'
import AnchoredPopupShell from '@/components/entities/popups/AnchoredPopupShell.vue'
import UtilityMeterPopupShell from '@/components/entities/popups/UtilityMeterPopupShell.vue'
import UtilityMeterTierSection from '@/components/entities/popups/UtilityMeterTierSection.vue'
import UtilityMeterExpandPanel from '@/components/entities/popups/UtilityMeterExpandPanel.vue'
import { useUtilityMeterPopup } from '@/composables/energy/useUtilityMeterPopup'
import { useUtilityBalanceFields } from '@/composables/energy/useUtilityBalanceFields'
import { parseJsonAttr } from '@/composables/energy/utility-entity-helpers'
import { readPopupAttr } from '@/utils/energy/popup-read.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { resolveUtilityMeterPreset } from '@/constants/utility-meter-presets'
import {
  isElectricityEntity,
  isGasEntity,
  isWaterEntity,
} from '@/composables/entity/useEntityType'

function resolveUtilityKind(kind, entityId) {
  if (kind === 'gas' || kind === 'grid' || kind === 'water') return kind
  if (isElectricityEntity(entityId)) return 'grid'
  if (isGasEntity(entityId)) return 'gas'
  if (isWaterEntity(entityId)) return 'water'
  return 'grid'
}

const props = defineProps({
  kind: { type: String, default: '' },
  entityId: { type: String, default: '' },
  title: { type: String, default: '' },
  xPct: { type: [Number, String], default: 50 },
  yPct: { type: [Number, String], default: 50 },
  anchorX: { type: Number, default: null },
  anchorY: { type: Number, default: null },
})

defineEmits(['close'])

const resolvedKind = resolveUtilityKind(props.kind, props.entityId)
const presetConfig = resolveUtilityMeterPreset(resolvedKind)
const preset = computed(() => resolveUtilityMeterPreset(resolveUtilityKind(props.kind, props.entityId)))
const es = useEntitiesStore()
const layout = useLayoutStore()

const {
  activeEntityId,
  accountOptions,
  accountLabel,
  popField,
  popNum,
  ent,
  hasChartData,
  exp,
  expTab,
  curList,
  sumUsage,
  sumCost,
  summaryLabel,
  mTrendStr,
  mTrendDir,
  lmTrendStr,
  lmTrendDir,
  setDayChartRef,
  setMonthChartRef,
  setYearChartRef,
  calYear,
  calMonth,
  calDayNames,
  calCells,
  calMonthUsage,
  calMonthCost,
  openTab,
  switchTab,
  closeExpand,
  openDayTab,
  onCalPrev,
  onCalNext,
  onCalToday,
  sourceCfg,
} = useUtilityMeterPopup({
  props,
  sourceKey: presetConfig.sourceKey,
  accentColor: presetConfig.accentColor,
  unitLabelKey: presetConfig.unitLabelKey,
  calClassPrefix: presetConfig.calClassPrefix,
  parseDayItem: presetConfig.parseDayItem,
  parseMonthItem: presetConfig.parseMonthItem,
  parseYearItem: presetConfig.parseYearItem,
})

const {
  balance,
  dataDate,
  relLabel,
  relClass,
  pmode,
  at,
  tLabel,
  t1l,
  t2l,
  t1p,
  t2p,
  t3p,
  price,
  remDays,
  remDate,
  curYear,
  mUsage,
  mCost,
  yUsage,
  yCost,
  lmUsage,
  lmCost,
  dUsage,
  dCost,
  bs: gridBs,
} = useUtilityBalanceFields({
  popField,
  popNum,
  ent,
  amountKey: presetConfig.amountKey,
  usageKey: presetConfig.usageKey,
  relClassPrefix: 'um',
  ...(presetConfig.tierFieldMap ? { tierFieldMap: presetConfig.tierFieldMap } : {}),
})

const resolvedBalanceLabel = computed(() => {
  if (resolvedKind !== 'grid') return preset.value.balanceLabel
  const prepaid =
    readPopupAttr(
      'grid',
      'is_prepaid',
      layout.layoutConfig.statsSensors,
      es.entities,
      activeEntityId.value,
      sourceCfg.value,
    ) ?? gridBs.value?.is_prepaid
  return prepaid ? '账户余额' : '当期账单'
})

function j(v) {
  return parseJsonAttr(v)
}

const resolvedPrice = computed(() => {
  if (resolvedKind !== 'grid') return price.value
  const c =
    parseFloat(gridBs.value?.平均单价) ||
    parseFloat(gridBs.value?.avg_price) ||
    parseFloat(gridBs.value?.fixed_price)
  if (c > 0) return c.toFixed(3)
  const d = j(popField('daylist'))
  if (Array.isArray(d) && d.length) {
    const l = d[d.length - 1]
    const u = parseFloat(l.dayEleNum || 0)
    const amt = parseFloat(l.dayEleCost || 0)
    if (u > 0 && amt > 0) {
      const p = amt / u
      if (!isNaN(p) && p > 0) return p.toFixed(3)
    }
  }
  return '--'
})

const statCards = computed(() => [
  {
    key: 'month',
    tab: 'month',
    trendStr: mTrendStr.value,
    trendDir: mTrendDir.value,
    label: preset.value.statMonthLabel,
    usage: mUsage.value,
    cost: mCost.value,
  },
  {
    key: 'lastMonth',
    tab: 'month',
    trendStr: lmTrendStr.value,
    trendDir: lmTrendDir.value,
    label: preset.value.statLastMonthLabel,
    usage: lmUsage.value,
    cost: lmCost.value,
  },
  {
    key: 'year',
    tab: 'year',
    label: `${curYear.value}${preset.value.statYearSuffix}`,
    usage: yUsage.value,
    cost: yCost.value,
  },
])

function onActiveEntityIdUpdate(id) {
  if (preset.value.syncActiveEntityId) activeEntityId.value = id
}
</script>

<style scoped>
@import '@/assets/styles/utility-meter-popup.css';
</style>
