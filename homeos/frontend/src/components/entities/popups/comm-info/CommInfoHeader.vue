/**
 * @file CommInfoHeader.vue
 * @module components/entities/popups/comm-info
 * @brief 通信信息弹窗头部
 *
 * 职责：
 * - 展示运营商品牌标签（电信/联通）、账户标签
 * - 多账户时提供 HosSelect 账户切换（v-model:activeEntityId）
 *
 * 依赖：
 * - vue、@lucide/vue（Signal）、HosSelect
 */
<script setup>
/**
 * 职责：实现 CommInfoHeader 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import { Signal } from '@lucide/vue'

defineProps({
  commBrand: { type: String, default: 'ct' },
  commBrandLabel: { type: String, default: '电信' },
  commBrandBadge: { type: String, default: 'CT' },
  accountOptions: { type: Array, default: () => [] },
  accountLabel: { type: Function, required: true },
})

const activeEntityId = defineModel('activeEntityId', { type: String, default: '' })
</script>

<template>
  <header class="comm-header">
    <div class="comm-header__main">
      <div class="comm-header__icon">
        <Signal class="w-4 h-4" />
      </div>
      <div class="comm-header__text">
        <div class="comm-header__title-row">
          <span class="comm-header__title">{{ commBrandLabel }}·信息</span>
          <span class="comm-header__badge">{{ commBrandBadge }}</span>
        </div>
        <span v-if="accountOptions.length <= 1" class="comm-header__sub">{{
          accountLabel(activeEntityId)
        }}</span>
      </div>
    </div>
    <HosSelect
      v-if="accountOptions.length > 1"
      v-model="activeEntityId"
      block
      trigger-class="comm-account-select"
    >
      <option v-for="aid in accountOptions" :key="aid" :value="aid">{{ accountLabel(aid) }}</option>
    </HosSelect>
  </header>
</template>
