<!--
组件：AdvisorTipActionsCard.vue
所属模块：frontend / src / views / settings / interact
职责：顾问建议一键执行绑定卡片。按类别（安全/环境/能耗/用水）展示绑定动作（切换家庭模式/执行场景），
      支持目标选择、校验失效目标、统一保存。仅对已绑定类别在 Dashboard 顾问卡片显示「一键执行」。
关键依赖：
  - HosSelect：动作与目标下拉
  - ADVISOR_TIP_CATEGORIES / useAdvisorTipActions：类别常量与绑定 composable
  - useRegisterSettingsTabPending：Tab 级离开拦截
数据来源：useAdvisorTipActions() 返回的 rows / categories / 各类校验
-->
<template>
  <div id="tip-actions" class="advisor-tab-panel advisor-tab-panel--actions">
    <div
      v-if="loading"
      class="settings-premium-empty settings-premium-empty--amber ata-loading"
    >
      <Loader2 class="settings-premium-empty__icon animate-spin" />
      <p class="settings-premium-empty__title">{{ '加载绑定配置…' }}</p>
    </div>

    <template v-else>
      <div class="advisor-tab-panel__body advisor-tab-panel__body--actions">
        <div class="ata-toolbar">
        <span :class="['ata-summary', boundCount > 0 && 'ata-summary--bound']">
          {{ summaryText }}
        </span>
      </div>

      <div class="ata-grid" role="list" aria-label="顾问建议一键执行绑定">
        <article
          v-for="cat in categories"
          :key="cat"
          :class="[
            'ata-card',
            isRowBound(cat) && 'ata-card--bound',
            isRowInvalid(cat) && 'ata-card--invalid',
          ]"
          role="listitem"
        >
          <header class="ata-card__head">
            <span :class="['ata-card__icon', `ata-card__icon--${cat}`]">
              <component :is="categoryIcon(cat)" class="w-4 h-4" />
            </span>
            <div class="ata-card__copy">
              <span class="ata-card__label">{{ categoryLabel(cat) }}</span>
              <span class="ata-card__hint">{{ categoryHint(cat) }}</span>
            </div>
          </header>

          <div class="ata-card__body">
            <span class="ata-card__field-label">{{ '绑定动作' }}</span>
            <div class="ata-card__binding">
              <HosSelect
                v-if="rows[cat]"
                variant="settings"
                block
                trigger-class="ata-select"
                v-model="rows[cat].type"
                @change="onTypeChange(cat)"
              >
                <option value="">{{ '不绑定' }}</option>
                <option value="home_mode">{{ '切换家庭模式' }}</option>
                <option value="scene">{{ '执行场景' }}</option>
              </HosSelect>

              <template v-if="rows[cat]?.type">
                <HosSelect variant="settings" block v-model="rows[cat].id">
                  <option value="">{{ '选择目标…' }}</option>
                  <option
                    v-for="opt in targetOptions(rows[cat].type)"
                    :key="opt.id"
                    :value="opt.id"
                  >
                    {{ opt.label }}
                  </option>
                </HosSelect>
                <p v-if="isRowInvalid(cat)" class="ata-card__error">
                  {{ '目标已不存在，请重新选择' }}
                </p>
              </template>
            </div>
          </div>
        </article>
      </div>

      <div class="ata-footer">
        <p class="ata-footnote">
          {{ '仅对已绑定类别在 Dashboard 顾问卡片显示「一键执行」；留空则仅展示文字建议。' }}
        </p>
        <button
          type="button"
          class="settings-btn-accent ata-save"
          :disabled="saving || !isDirty"
          @click="save"
        >
          <Save class="w-3.5 h-3.5" />
          {{ saving ? '保存中…' : isDirty ? '保存绑定' : '已保存' }}
        </button>
      </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { onMounted } from 'vue'
import { Zap, Shield, Leaf, Droplets, Save, Loader2 } from '@lucide/vue'
import { ADVISOR_TIP_CATEGORIES, useAdvisorTipActions } from '@/composables/advisor/hub-presence-advisor.internals'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'

// 顾问建议类别列表
const categories = ADVISOR_TIP_CATEGORIES

// 类别 → 图标映射
const CATEGORY_ICONS = {
  security: Shield,
  env: Leaf,
  energy: Zap,
  water: Droplets,
}

// 取类别对应图标（缺失回退 Zap）
function categoryIcon(cat) {
  return CATEGORY_ICONS[cat] || Zap
}

const {
  loading,
  saving,
  rows,
  isDirty,
  boundCount,
  summaryText,
  categoryLabel,
  categoryHint,
  load,
  save,
  onTypeChange,
  targetOptions,
  isRowBound,
  isRowInvalid,
} = useAdvisorTipActions()

useRegisterSettingsTabPending('smart-services', () => isDirty.value)

onMounted(load)
</script>

<style scoped src="./smart-services/styles/smart-services.css"></style>
