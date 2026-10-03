<!--
  PricingAlertPanel.vue / components/widgets/energy
  电价提醒面板：能源子 Tab 或 Insight 中嵌入使用，展示当前电价档位、本月用电、
  预估全月电费、尖峰平谷时间表与可编辑峰谷价快捷编辑、阶梯电价保存。
  Props: embedded 嵌入态时隐藏独立标题 / panel-visible 父容器可见性控制轮询
  依赖：services/api/energy getEnergyPricing + savePricingConfig 接口；
        composables: useWidgetApiQuery 查询包装 + useScheduledPoll 周期刷新；
        Pinia: useAuthStore isAdmin 控制「快捷编辑」按钮可见；
        SETTINGS_ROUTES 跳转高级参数页；
        ApiQueryState 加载/错误态容器 + VEmptyState 未绑电表空态引导。
  注意：meterBound 未绑定时显示首装向导入口；savings 为预估节能金额。
-->
<template>
  <div :class="['pa-root', embedded && 'pa-root--embedded']">
    <div :class="['pa-header', embedded && 'pa-header--embedded']">
      <div v-if="!embedded" class="pa-header-left">
        <DollarSign class="w-3.5 h-3.5 pa-icon" />
        <span class="pa-title">{{ '电价提醒' }}</span>
      </div>
      <div v-else class="pa-toolbar-label">{{ '电价提醒' }}</div>
      <div class="pa-header-right">
        <button v-if="isAdmin && !editing" type="button" class="pa-edit-link" @click="startEdit">
          {{ '快捷编辑' }}
        </button>
        <router-link
          :to="SETTINGS_ROUTES.params('pricing')"
          class="pa-edit-link"
          :title="'在高级参数中编辑电价'"
          >{{ '高级设置' }}</router-link
        >
        <div v-if="data.currentTier" :class="['pa-tier-badge', tierBadgeClass]">
          {{ data.currentTier }}
        </div>
      </div>
    </div>

    <div class="pa-body">
      <ApiQueryState
        :loading="loading"
        :error="error"
        tone="amber"
        error-title="电价数据加载失败"
        @retry="() => query.execute()"
      >
        <VEmptyState
          v-if="!meterBound && !editing"
          compact
          tone="amber"
          title="未绑定电表实体"
          description="绑定主电表后才会显示本月用电、预估全月与节省估算"
        >
          <template #action>
            <RouterLink :to="SETTINGS_ROUTES.setupWizard()" class="pa-setup-link">{{
              '前往首装向导绑定'
            }}</RouterLink>
          </template>
        </VEmptyState>

        <template v-else-if="meterBound">
          <div class="pa-bento">
            <div class="pa-hero">
              <span class="pa-hero__label">{{ '当前电价' }}</span>
              <div class="pa-hero__main">
                <span class="pa-hero__val pa-stat-amber">{{ formatPrice(data.currentPrice) }}</span>
                <span class="pa-hero__unit">{{ '元/kWh' }}</span>
              </div>
              <div v-if="data.currentTier" :class="['pa-tier-badge', tierBadgeClass]">
                {{ data.currentTier }}
              </div>
            </div>
            <div class="pa-stats">
              <div class="pa-stat">
                <span class="pa-stat-label">{{ '本月用电' }}</span>
                <span class="pa-stat-val"
                  >{{ formatKwh(data.monthUsage) }}<span class="pa-unit"> kWh</span></span
                >
              </div>
              <div class="pa-stat">
                <span class="pa-stat-label">{{ '预估全月' }}</span>
                <span :class="['pa-stat-val', data.warning ? 'pa-stat-warn' : '']">
                  {{ formatKwh(data.estimatedMonth, 0) }}<span class="pa-unit"> kWh</span>
                </span>
              </div>
              <div v-if="savings?.estimatedMonthlySavingsYuan != null" class="pa-stat pa-stat--wide">
                <span class="pa-stat-label">{{ '预估月节省' }}</span>
                <span class="pa-stat-val pa-stat-amber"
                  >{{ formatPrice(savings.estimatedMonthlySavingsYuan, 1)
                  }}<span class="pa-unit">{{ '元' }}</span></span
                >
              </div>
            </div>
          </div>

          <p v-if="savings?.note" class="pa-hint pa-hint--muted">{{ savings.note }}</p>
          <p v-if="externalPriceHint" class="pa-hint pa-hint--muted">{{ externalPriceHint }}</p>
          <div v-if="savings?.weekOverWeek" class="pa-hint pa-hint--muted">
            {{ '峰段周环比' }}：{{ savings.weekOverWeek.thisWeekPeakKwh }} kWh → 上周
            {{ savings.weekOverWeek.lastWeekPeakKwh }} kWh
            <template v-if="savings.weekOverWeek.improved">
              （↓ {{ Math.abs(savings.weekOverWeek.peakKwhDelta) }} kWh）
            </template>
          </div>

          <div v-if="data.warning" class="pa-warning">
            <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
            <span>{{ data.warning }}</span>
          </div>

          <div v-if="data.timePeriod && !editing" class="pa-hint pa-hint--muted">
            {{ '当前时段' }}：{{ timePeriodLabel(data.timePeriod) }}
            <template
              v-if="
                data.timeOfUseEnabled &&
                data.baseUnitPrice != null &&
                data.baseUnitPrice !== data.currentPrice
              "
            >
              · {{ isFixedMode ? '基础单价' : '阶梯档' }} {{ data.baseUnitPrice }}
              {{ '元/kWh' }}
            </template>
          </div>

          <div
            v-if="data.timeOfUseEnabled && data.periodPrices && !editing"
            class="pa-period-prices"
          >
            <div class="pa-period-row">
              <span>{{ '峰' }}</span><span>{{ data.periodPrices.peak }}</span>
            </div>
            <div class="pa-period-row">
              <span>{{ '平' }}</span><span>{{ data.periodPrices.flat }}</span>
            </div>
            <div class="pa-period-row">
              <span>{{ '谷' }}</span><span>{{ data.periodPrices.valley }}</span>
            </div>
          </div>
        </template>

        <div v-if="editing" class="pa-edit-form">
          <div class="pa-edit-tabs">
            <button
              type="button"
              :class="['pa-edit-tab', editTab === 'billing' && 'pa-edit-tab--active']"
              @click="editTab = 'billing'"
            >
              {{ '阶梯/固定' }}
            </button>
            <button
              type="button"
              :class="['pa-edit-tab', editTab === 'tou' && 'pa-edit-tab--active']"
              @click="editTab = 'tou'"
            >
              {{ '峰谷平' }}
            </button>
          </div>

          <div v-if="editTab === 'billing'" class="pa-edit-section">
            <div class="pa-edit-row">
              <span>{{ '计费模式' }}</span>
              <HosSelect
                v-model="editBilling.pricingMode"
                variant="inline"
                trigger-class="pa-edit-select"
              >
                <option value="tiered">{{ '年阶梯' }}</option>
                <option value="fixed">{{ '固定单价' }}</option>
              </HosSelect>
            </div>

            <p v-if="editBilling.pricingMode === 'fixed'" class="pa-edit-hint pa-edit-hint--warn">
              {{ '固定单价地区通常无需峰谷平；如需分时计费请在「峰谷平」页签手动开启' }}
            </p>

            <template v-if="editBilling.pricingMode === 'fixed'">
              <div class="pa-edit-row">
                <span>{{ '固定单价' }}</span>
                <input
                  v-model.number="editBilling.fixedPrice"
                  type="number"
                  step="0.0001"
                  min="0"
                  class="pa-edit-input"
                />
              </div>
              <div class="pa-edit-row">
                <span>{{ '地区名称' }}</span>
                <input v-model="editBilling.regionLabel" type="text" class="pa-edit-input pa-edit-input--wide" />
              </div>
            </template>

            <template v-else>
              <p class="pa-edit-hint">{{ '调整三档单价（元/kWh）' }}</p>
              <div v-for="(tier, idx) in editTiers" :key="idx" class="pa-edit-row">
                <span>{{ tier.label }}</span>
                <input
                  v-model.number="editTiers[idx].price"
                  type="number"
                  step="0.0001"
                  min="0"
                  class="pa-edit-input"
                />
              </div>
            </template>
          </div>

          <div v-else class="pa-edit-section">
            <label class="pa-edit-toggle">
              <input v-model="editTou.timeOfUseEnabled" type="checkbox" />
              <span>{{ '启用峰谷平分时电价' }}</span>
            </label>
            <p class="pa-edit-hint">
              {{ editTou.timeOfUseEnabled ? '按当前时段使用峰/平/谷单价' : '统一使用阶梯档或固定单价' }}
            </p>

            <template v-if="editTou.timeOfUseEnabled">
              <div class="pa-edit-subhead">{{ '峰段时段' }}</div>
              <div class="pa-edit-row">
                <span>{{ '峰段一' }}</span>
                <div class="pa-edit-time-range">
                  <input v-model="editTou.peakStart1" type="text" placeholder="8:00" class="pa-edit-input pa-edit-input--time" />
                  <span>–</span>
                  <input v-model="editTou.peakEnd1" type="text" placeholder="11:00" class="pa-edit-input pa-edit-input--time" />
                </div>
              </div>
              <div class="pa-edit-row">
                <span>{{ '峰段二' }}</span>
                <div class="pa-edit-time-range">
                  <input v-model="editTou.peakStart2" type="text" placeholder="18:00" class="pa-edit-input pa-edit-input--time" />
                  <span>–</span>
                  <input v-model="editTou.peakEnd2" type="text" placeholder="23:00" class="pa-edit-input pa-edit-input--time" />
                </div>
              </div>
              <div class="pa-edit-row">
                <span>{{ '谷段' }}</span>
                <div class="pa-edit-time-range">
                  <input v-model="editTou.valleyStart" type="text" placeholder="23:00" class="pa-edit-input pa-edit-input--time" />
                  <span>–</span>
                  <input v-model="editTou.valleyEnd" type="text" placeholder="7:00" class="pa-edit-input pa-edit-input--time" />
                </div>
              </div>

              <div class="pa-edit-subhead">{{ '分时单价（0=自动推导）' }}</div>
              <div class="pa-edit-row">
                <span>{{ '峰' }}</span>
                <input v-model.number="editTou.peakPrice" type="number" step="0.0001" min="0" class="pa-edit-input" />
              </div>
              <div class="pa-edit-row">
                <span>{{ '平' }}</span>
                <input v-model.number="editTou.flatPrice" type="number" step="0.0001" min="0" class="pa-edit-input" />
              </div>
              <div class="pa-edit-row">
                <span>{{ '谷' }}</span>
                <input v-model.number="editTou.valleyPrice" type="number" step="0.0001" min="0" class="pa-edit-input" />
              </div>
            </template>
          </div>

          <div class="pa-edit-actions">
            <button
              type="button"
              class="pa-edit-btn pa-edit-btn--primary"
              :disabled="saving"
              @click="savePricing"
            >
              {{ saving ? '保存中…' : '保存' }}
            </button>
            <button type="button" class="pa-edit-btn" @click="cancelEdit">{{ '取消' }}</button>
          </div>
        </div>

        <div v-else-if="meterBound" class="pa-tiers">
          <div
            v-for="(tier, idx) in data.tiers || []"
            :key="idx"
            :class="['pa-tier', tier.active ? 'pa-tier--active' : '']"
          >
            <div class="pa-tier-left">
              <div :class="['pa-tier-dot', tier.active ? 'pa-tier-dot--active' : '']" />
              <span class="pa-tier-label">{{ tier.label }}</span>
            </div>
            <div class="pa-tier-right">
              <span class="pa-tier-range">{{ tier.maxKwh }}</span>
              <span class="pa-tier-price">{{ tier.price }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="meterBound && data.priceIncrease && !isFixedMode && !isMaxTierIncrease(data.priceIncrease)"
          class="pa-hint"
        >
          {{ '即将超出当前档位，下档电价涨幅' }}
          <span class="pa-increase font-bold ml-1">{{ data.priceIncrease }}</span>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * @file PricingAlertPanel.vue
 * @module widgets/energy
 * @description 电价告警面板：展示当前电价/峰谷时段/节能建议，管理员可编辑峰谷时段与电价，
 *              支持外部电价查询与节能方案预估。
 * @dependencies
 *  - vue: computed/ref/watch 响应式与监听
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: DollarSign / AlertTriangle 图标
 *  - @/components/common/base/HosSelect.vue: 下拉选择
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/services/api/energy: 电价/节能/外部电价接口
 *  - @/composables/api/useWidgetApiQuery: Widget 数据查询 composable
 *  - @/stores/auth.store: 鉴权状态（判断 admin 角色）
 *  - @/stores/chrome.store: 全局通知
 *  - @/utils/core/error-message: 错误信息提取
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 *  - @homeos/shared: validateTouWindows 峰谷时段校验
 */
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { DollarSign, AlertTriangle } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { getEnergyPricing, getEnergySavings, updateEnergyPricing, getExternalElectricityPrice } from '@/services/api/energy'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { validateTouWindows } from '@homeos/shared'

function parseNonNegNumber(raw, label) {
  if (raw === '' || raw === null || raw === undefined) return { error: `${label}不能为空` }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return { error: `${label}须为大于等于 0 的数字` }
  return { value: n }
}

const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

const authStore = useAuthStore()
const chrome = useChromeStore()
const isAdmin = computed(() => authStore.role === 'admin')
const editing = ref(false)
const editTab = ref('billing')
const saving = ref(false)
const editTiers = ref([])
const editBilling = ref({ pricingMode: 'tiered', fixedPrice: 0.4883, regionLabel: '' })
const editTou = ref({
  timeOfUseEnabled: true,
  peakStart1: '8:00',
  peakEnd1: '11:00',
  peakStart2: '18:00',
  peakEnd2: '23:00',
  valleyStart: '23:00',
  valleyEnd: '7:00',
  peakPrice: 0,
  valleyPrice: 0,
  flatPrice: 0,
})

const query = useWidgetApiQuery(
  'pricingAlert',
  async () => {
    const [{ data: res }, savingsRes, externalRes] = await Promise.all([
      getEnergyPricing(),
      getEnergySavings().catch(() => ({ data: null })),
      getExternalElectricityPrice().catch(() => ({ data: null })),
    ])
    return {
      data: {
        ...(res || {}),
        _savings: savingsRes?.data || null,
        _externalPrice: externalRes?.data || null,
      },
    }
  },
  60_000,
  {
    pollKey: 'widget:PricingAlertPanel',
    panelVisible: () => props.panelVisible !== false,
    immediate: false,
  },
)

const loading = query.loading
const error = query.error
const data = computed(() => {
  const raw = query.data?.value || {}
  const { _savings, _externalPrice, ...rest } = raw
  return rest
})
const savings = computed(() => query.data?.value?._savings || null)
const externalPriceHint = computed(() => {
  const ext = query.data?.value?._externalPrice
  if (!ext || typeof ext !== 'object') return ''
  if (ext.dynamicPricing === true && ext.periodLabel && ext.pricePerKwh != null) {
    return `动态电价（${ext.periodLabel}）：${Number(ext.pricePerKwh).toFixed(4)} 元/kWh`
  }
  const period = ext.period || ext.timePeriod || ext.tier || ''
  const price = ext.price ?? ext.currentPrice ?? ext.rate
  if (price == null && !period) return ''
  const priceText = price != null ? `${Number(price).toFixed(4)} 元/kWh` : ''
  const periodText = period ? String(period) : ''
  return `外部参考价${periodText ? `（${periodText}）` : ''}：${priceText || '暂无'}`
})
const isFixedMode = computed(() => data.value?.pricingMode === 'fixed')
const meterBound = computed(() => data.value?.meterBound === true)

watch(
  () => props.panelVisible,
  (visible) => {
    if (visible !== false) void query.execute()
  },
  { immediate: true },
)

watch(
  () => editBilling.value.pricingMode,
  (mode) => {
    if (mode === 'fixed') editTou.value.timeOfUseEnabled = false
  },
)
const tierBadgeClass = computed(() => {
  if (isFixedMode.value) return 'pa-badge--green'
  const tier = data.value?.currentTier
  if (tier === '一档') return 'pa-badge--green'
  if (tier === '二档') return 'pa-badge--amber'
  return 'pa-badge--red'
})

function isMaxTierIncrease(value) {
  return value === '已是最高档' || value === '固定单价'
}

function timePeriodLabel(period) {
  if (period === 'peak') return '峰段'
  if (period === 'valley') return '谷段'
  if (period === 'flat') return '平段'
  return ''
}

function formatKwh(value, digits = 1) {
  if (value == null || value === '' || value === '--') return '--'
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits)
}

function formatPrice(value, digits = 3) {
  if (value == null || value === '' || value === '--') return '--'
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  return n.toFixed(digits)
}

function startEdit() {
  const settings = data.value.pricingSettings || {}
  editBilling.value = {
    pricingMode: data.value.pricingMode || settings.pricingMode || 'tiered',
    fixedPrice: Number(settings.fixedPrice ?? data.value.tiers?.[0]?.price ?? 0.4883),
    regionLabel: String(settings.regionLabel ?? data.value.regionLabel ?? ''),
  }
  editTou.value = {
    timeOfUseEnabled: settings.timeOfUseEnabled !== false,
    peakStart1: settings.peakStart1 || '8:00',
    peakEnd1: settings.peakEnd1 || '11:00',
    peakStart2: settings.peakStart2 || '18:00',
    peakEnd2: settings.peakEnd2 || '23:00',
    valleyStart: settings.valleyStart || '23:00',
    valleyEnd: settings.valleyEnd || '7:00',
    peakPrice: Number(settings.peakPrice) || 0,
    valleyPrice: Number(settings.valleyPrice) || 0,
    flatPrice: Number(settings.flatPrice) || 0,
  }
  editTiers.value = (data.value.tiers || []).map((t) => ({
    label: t.label,
    price: Number(t.price) || 0,
    maxKwh:
      t.maxKwh === '以上' || t.maxKwh === '固定单价'
        ? Infinity
        : Number(String(t.maxKwh).replace(/\D/g, '')) || Infinity,
  }))
  editTab.value = data.value.timeOfUseEnabled ? 'tou' : 'billing'
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  editTiers.value = []
}

async function savePricing() {
  saving.value = true
  try {
    if (editTou.value.timeOfUseEnabled) {
      const touErrs = validateTouWindows(editTou.value)
      if (touErrs.length) {
        chrome.notify(touErrs[0], 'error')
        return
      }
    }
    const peak = parseNonNegNumber(editTou.value.peakPrice, '峰电价')
    const valley = parseNonNegNumber(editTou.value.valleyPrice, '谷电价')
    const flat = parseNonNegNumber(editTou.value.flatPrice, '平电价')
    if (peak.error || valley.error || flat.error) {
      chrome.notify(peak.error || valley.error || flat.error, 'error')
      return
    }
    let fixedPrice = Number(editBilling.value.fixedPrice)
    if (editBilling.value.pricingMode === 'fixed') {
      if (!Number.isFinite(fixedPrice) || fixedPrice <= 0) {
        chrome.notify('固定单价须大于 0', 'error')
        return
      }
    } else if (!Number.isFinite(fixedPrice)) {
      fixedPrice = 0
    }
    const payload = {
      pricingMode: editBilling.value.pricingMode,
      fixedPrice,
      regionLabel: editBilling.value.regionLabel,
      timeOfUseEnabled: editTou.value.timeOfUseEnabled,
      peakStart1: editTou.value.peakStart1,
      peakEnd1: editTou.value.peakEnd1,
      peakStart2: editTou.value.peakStart2,
      peakEnd2: editTou.value.peakEnd2,
      valleyStart: editTou.value.valleyStart,
      valleyEnd: editTou.value.valleyEnd,
      peakPrice: peak.value,
      valleyPrice: valley.value,
      flatPrice: flat.value,
    }
    if (editBilling.value.pricingMode === 'tiered' && editTiers.value.length) {
      payload.tiers = editTiers.value.map((t) => ({
        label: t.label,
        pricePerKwh: Number(t.price),
        // Infinity 无法经 JSON 传输，开放档用 null 表示
        maxKwh: t.maxKwh === Infinity || !Number.isFinite(Number(t.maxKwh)) ? null : Number(t.maxKwh),
      }))
    }
    await updateEnergyPricing(payload)
    chrome.notify('电价设置已更新', 'success')
    editing.value = false
    await query.execute()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped src="./styles/PricingAlertPanel.css"></style>
