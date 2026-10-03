<template>
  <footer v-if="showFooter" class="power-panel animate-stagger-3">
    <div v-if="hasDisplayData" class="power-panel__glow" />
    <!-- 空态 1：未配置显示项 -->
    <div v-if="!hasEnabledItems" class="power-panel-empty">
      <VEmptyState
        :icon-component="LayoutGrid"
        tone="amber"
        compact
        :title="'未配置显示项'"
        :description="'在布局设置中为底部信息栏添加卡片，可绑定账户用量或任意 HA 实体'"
      >
        <template #action>
          <RouterLink :to="SETTINGS_ROUTES.layout('footer')" class="v-empty__link">
            {{ '前往配置' }}
          </RouterLink>
        </template>
      </VEmptyState>
    </div>
    <!-- 空态 2：缺少账户用量绑定 -->
    <div
      v-else-if="needsAccountBinding && !hasAccountBinding && !hasDisplayData"
      class="power-panel-empty"
    >
      <VEmptyState
        :icon-component="Unlink"
        tone="amber"
        compact
        :title="'账户用量未配置'"
        :description="missingAccountHint"
      >
        <template #action>
          <RouterLink :to="missingAccountRoute" class="v-empty__link">
            {{ '前往账户用量' }}
          </RouterLink>
        </template>
      </VEmptyState>
    </div>
    <!-- 空态 3：已启用项缺少实体 ID 或绑定字段 -->
    <div v-else-if="visibleItems.length === 0" class="power-panel-empty">
      <VEmptyState
        :icon-component="CircleSlash"
        tone="amber"
        compact
        :title="'显示项无效'"
        :description="'已启用的底栏项缺少实体 ID 或绑定字段，请在布局设置中检查配置'"
      >
        <template #action>
          <RouterLink :to="SETTINGS_ROUTES.layout('footer')" class="v-empty__link">
            {{ '前往检查' }}
          </RouterLink>
        </template>
      </VEmptyState>
    </div>
    <!-- 正常态：渲染可见项卡片 -->
    <div v-else class="power-panel__body">
      <div
        v-for="item in visibleItems"
        :key="item.id"
        :class="['power-card', `power-card--${item.color}`]"
      >
        <PowerCardBody :item="item" :format-unit="formatUnit" />
      </div>
    </div>
  </footer>
</template>

<script setup>
/**
 * DashboardFooter.vue
 *
 * 所属模块：dashboard（仪表盘底部信息栏）
 * 职责：仪表盘底部的多卡片信息栏。根据用户在布局设置中的配置渲染账户用量卡片
 *      或任意 HA 实体卡片；并在缺少配置、缺少账户绑定、配置无效时给出对应空态。
 * 依赖：vue、vue-router、useDashboardFooter 组合式函数、account-binding-meta 常量。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { CircleSlash, LayoutGrid, Unlink } from '@lucide/vue'
import PowerCardBody from '@/components/dashboard/PowerCardBody.vue'
import { useDashboardFooter } from '@/composables/ui/useDashboardFooter'
import { formatMissingAccountBindingHint } from '@/constants/account-binding-meta'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

// 来自 useDashboardFooter 的核心状态：是否展示底栏、可见项、各类空态判定标志
const {
  showFooter,
  visibleItems,
  hasEnabledItems,
  needsAccountBinding,
  hasAccountBinding,
  missingAccountSources,
  hasDisplayData,
} = useDashboardFooter()

/**
 * 缺少账户绑定的提示文案
 * @returns {string} 由 formatMissingAccountBindingHint 根据 missingAccountSources 生成
 */
const missingAccountHint = computed(() =>
  formatMissingAccountBindingHint(missingAccountSources.value),
)

/** 跳转到账户用量设置的路由对象 */
const missingAccountRoute = computed(() => SETTINGS_ROUTES.lifeAccounts())

/**
 * 单位格式化：将货币符号 ¥ 渲染为汉字“元”，其他单位原样返回
 * @param {string} unit - 单位字符串
 * @returns {string}
 */
function formatUnit(unit) {
  if (unit === '¥') return '元'
  return unit
}
</script>

<style scoped src="./styles/Footer.css"></style>