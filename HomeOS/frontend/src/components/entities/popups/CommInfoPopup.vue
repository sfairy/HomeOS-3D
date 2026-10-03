/** * 通信账户信息弹窗 * 展示余额、月费、欠费及套餐配额（电信/联通） */

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 CommInfoPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */

import AnchoredPopupShell from '@/components/entities/popups/AnchoredPopupShell.vue'

import CommInfoHeader from '@/components/entities/popups/comm-info/CommInfoHeader.vue'

import CommInfoBalance from '@/components/entities/popups/comm-info/CommInfoBalance.vue'

import CommInfoQuotaSection from '@/components/entities/popups/comm-info/CommInfoQuotaSection.vue'

import CommInfoFlowBreakdown from '@/components/entities/popups/comm-info/CommInfoFlowBreakdown.vue'

import { useCommInfoPopup } from '@/composables/energy/useCommInfoPopup'

import '@/components/entities/popups/comm-info/popup.css'



const props = defineProps({

  entityId: { type: String, default: '' },

  title: { type: String, default: '' },

  xPct: { type: [Number, String], default: 50 },

  yPct: { type: [Number, String], default: 50 },

  anchorX: { type: Number, default: null },

  anchorY: { type: Number, default: null },

})

defineEmits(['close'])



const {

  activeEntityId,

  commBrand,

  commBrandLabel,

  commBrandBadge,

  accountOptions,

  accountLabel,

  balance,

  monthlyFee,

  arrear,

  creditLimit,

  points,

  refreshTime,

  relLabel,

  relClass,

  quotaCards,

  flowBreakdown,

} = useCommInfoPopup(props)

</script>



<template>

  <AnchoredPopupShell

    :x-pct="xPct"

    :y-pct="yPct"

    :anchor-x="anchorX"

    :anchor-y="anchorY"

    :width="400"

    :height="flowBreakdown.length ? 440 : 360"

    :margin="16"

    class="comm-popup"

    :class="`comm-popup--${commBrand}`"

    inner-class="comm-popup__inner"

    close-class="comm-popup__close"

    @close="$emit('close')"

  >

    <CommInfoHeader

      v-model:active-entity-id="activeEntityId"

      :comm-brand="commBrand"

      :comm-brand-label="commBrandLabel"

      :comm-brand-badge="commBrandBadge"

      :account-options="accountOptions"

      :account-label="accountLabel"

    />

    <CommInfoBalance

      :balance="balance"

      :monthly-fee="monthlyFee"

      :arrear="arrear"

      :credit-limit="creditLimit"

      :points="points"

      :refresh-time="refreshTime"

      :rel-label="relLabel"

      :rel-class="relClass"

    />

    <CommInfoQuotaSection :quota-cards="quotaCards" />

    <CommInfoFlowBreakdown :rows="flowBreakdown" />

  </AnchoredPopupShell>

</template>

