<template>
  <div class="eb-root">
    <!-- 工具栏：标题 + 编辑按钮 -->
    <div :class="['eb-toolbar', embedded && 'eb-toolbar--embedded']">
      <div v-if="!embedded" class="eb-header-left">
        <Wallet class="w-3.5 h-3.5 eb-icon" />
        <span class="eb-title">{{ '能源预算' }}</span>
      </div>
      <div v-else class="eb-toolbar-label">{{ '月度预算' }}</div>
      <button
        v-if="isAdmin"
        class="eb-edit"
        :aria-label="'编辑'"
        :title="'编辑'"
        @click="editing = !editing"
      >
        <Settings2 class="w-3 h-3" />
      </button>
    </div>

    <div class="eb-body">
      <ApiQueryState
        :loading="loading"
        :error="error"
        error-title="能源预算加载失败"
        @retry="query.retry()"
      >
        <!-- 预算设置：管理员可编辑月度电量与电费预算 -->
        <div v-if="editing" class="eb-edit-box">
          <label class="eb-field">
            <span>{{ '月度电量预算 (kWh)' }}</span>
            <input v-model.number="form.monthlyKwh" type="number" min="0" class="eb-input" />
          </label>
          <label class="eb-field">
            <span>{{ '月度电费预算 (元)' }}</span>
            <input v-model.number="form.monthlyCost" type="number" min="0" class="eb-input" />
          </label>
          <div class="eb-edit-actions">
            <button class="eb-btn eb-btn--primary" :disabled="busy" @click="saveBudget">
              {{ '保存' }}
            </button>
            <button class="eb-btn eb-btn--ghost" @click="editing = false">{{ '取消' }}</button>
          </div>
        </div>

        <template v-else-if="!meterBound">
          <VEmptyState
            compact
            tone="amber"
            title="未绑定电表实体"
            description="绑定主电表后才会显示本月用电与预算进度"
          >
            <template #action>
              <RouterLink :to="SETTINGS_ROUTES.setupWizard()" class="eb-setup-link">{{
                '前往首装向导绑定'
              }}</RouterLink>
            </template>
          </VEmptyState>
        </template>

        <template v-else>
          <!-- 预算展示：进度条 + 侧栏信息 -->
          <div class="eb-stage">
            <!-- 预算进度：电量 / 电费 -->
            <div class="eb-progress">
              <div class="eb-progress-item">
                <span class="eb-progress-item__label">{{ '电量预算' }}</span>
                <div class="eb-pct" :style="{ color: budgetStyle(s.kwhUsedPct).textColor }">
                  {{ s.kwhUsedPct ?? '—' }}<span>%</span>
                </div>
                <VProgressBar
                  :value="s.kwhUsedPct ?? 0"
                  variant="budget"
                  :color-value="s.kwhUsedPct"
                  size="xs"
                  auto-glow
                />
                <div class="eb-sub">
                  {{ `${s.monthUsage ?? 0} / ${s.budget?.monthlyKwh || '未设'} kWh` }}
                </div>
              </div>
              <div class="eb-progress-item">
                <span class="eb-progress-item__label">{{ '电费预算' }}</span>
                <div class="eb-pct" :style="{ color: budgetStyle(s.costUsedPct).textColor }">
                  {{ s.costUsedPct ?? '—' }}<span>%</span>
                </div>
                <VProgressBar
                  :value="s.costUsedPct ?? 0"
                  variant="budget"
                  :color-value="s.costUsedPct"
                  size="xs"
                  auto-glow
                />
                <div class="eb-sub">
                  {{ `${s.monthCost ?? 0} / ${s.budget?.monthlyCost || '未设'} 元` }}
                </div>
              </div>
            </div>

            <!-- 侧栏：月末预估 / 未来预测 / 告警 -->
            <div class="eb-side">
              <div class="eb-info-row">
                <span>{{ '预计月末' }}</span>
                <span class="eb-info-val">{{
                  `${s.projectedKwh ?? '—'} kWh · ${s.projectedCost ?? '—'} 元`
                }}</span>
              </div>

              <div v-if="s.forecast?.next7DaysKwh != null" class="eb-forecast">
                <span class="eb-forecast-label">{{ '未来7天预估' }}</span>
                <span class="eb-forecast-val">{{ s.forecast.next7DaysKwh }} kWh</span>
                <span v-if="s.forecast.next30DaysKwh != null" class="eb-forecast-sub">{{
                  '30天 {v} kWh'.replace('{v}', String(s.forecast.next30DaysKwh))
                }}</span>
              </div>

              <div v-if="(s.warnings || []).length" class="eb-warn">
                <AlertTriangle class="w-3 h-3 shrink-0" />
                <span>{{ s.warnings[0] }}</span>
              </div>
            </div>
          </div>
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * 能源预算面板 EnergyBudgetPanel
 *
 * 所属模块：frontend/widgets/energy
 * 职责：展示本月用电/电费预算使用进度，支持管理员编辑月度预算，
 *       提供月末预估与未来用量预测。
 * API:
 *   GET  /energy/budget
 *   PUT  /energy/budget { monthlyKwh, monthlyCost }
 * 依赖：
 *   - vue (ref/reactive/computed/watch)
 *   - vue-router (RouterLink)
 *   - @lucide/vue 图标
 *   - @/services/api/energy（getEnergyBudget / updateEnergyBudget）
 *   - @/stores/chrome.store、@/stores/auth.store
 *   - @/composables/api/useWidgetApiQuery
 *   - @/components/common/ApiQueryState、VEmptyState、VProgressBar
 *   - @/utils/ui/progress-bar.util（budgetPctColors 预算进度配色）
 *   - @/utils/registry/settings-route.util
 */
import { ref, reactive, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Wallet, AlertTriangle, Settings2 } from '@lucide/vue'
import { getEnergyBudget, updateEnergyBudget } from '@/services/api/energy'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { notifyError } from '@/services/notify'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
import { budgetPctColors } from '@/utils/ui/progress-bar.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

/**
 * 组件 Props。
 * @property {boolean} embedded - 是否嵌入模式（隐藏标题改展示标签），默认 false
 * @property {boolean} panelVisible - 面板是否可见（控制轮询），默认 true
 */
const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

// UI 仓库（通知）
const chrome = useChromeStore()
// 鉴权仓库（判断 admin 角色）
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.role === 'admin')
const holdBudget = ref(null)
const busy = ref(false)
const editing = ref(false)
// 编辑表单（月度电量 kWh / 月度电费 元）
const form = reactive({ monthlyKwh: 0, monthlyCost: 0 })
/**
 * 根据预算使用百分比返回配色对象。
 * @param {number} p - 使用百分比
 * @returns {Object} 配色对象（含 textColor 等字段）
 */
function budgetStyle(p) {
  return budgetPctColors(p)
}

/**
 * 能源预算查询：基于 useWidgetApiQuery 封装，60s 轮询，panelVisible 控制启停。
 * @returns 查询对象（loading / error / data / execute / retry）
 */
const query = useWidgetApiQuery(
  'energyBudget',
  async () => {
    const { data } = await getEnergyBudget()
    return { data: data || {} }
  },
  60_000,
  {
    pollKey: 'widget:EnergyBudgetPanel',
    panelVisible: () => props.panelVisible !== false,
    immediate: false,
  },
)

// 加载中状态
const loading = query.loading
// 错误信息
const error = query.error
/** 预算数据快照 s（含 monthUsage/monthCost/budget/forecast/warnings 等）。 */
const s = computed(() => {
  const raw = query.data?.value || {}
  const hold = holdBudget.value
  if (hold && Date.now() < hold.until) {
    return {
      ...raw,
      budget: { ...(raw.budget || {}), monthlyKwh: hold.monthlyKwh, monthlyCost: hold.monthlyCost },
    }
  }
  return raw
})
/** 是否已绑定主电表实体（未绑定时引导前往设置）。 */
const meterBound = computed(() => s.value?.meterBound === true)

// 面板可见时立即执行一次查询
watch(
  () => props.panelVisible,
  (visible) => {
    if (visible !== false) void query.execute()
  },
  { immediate: true },
)

// 数据变化时同步编辑表单初值
watch(
  query.data,
  (data) => {
    if (editing.value || busy.value) return
    const hold = holdBudget.value
    if (hold && Date.now() < hold.until) {
      form.monthlyKwh = hold.monthlyKwh
      form.monthlyCost = hold.monthlyCost
      return
    }
    if (data?.budget) {
      form.monthlyKwh = data.budget.monthlyKwh || 0
      form.monthlyCost = data.budget.monthlyCost || 0
    }
  },
  { immediate: true },
)

/**
 * 保存能源预算：调用 updateEnergyBudget，成功后更新本地数据并通知。
 * 非管理员直接返回；失败时通过 notifyError 上报。
 * @returns {Promise<void>}
 */
async function saveBudget() {
  if (!isAdmin.value) return
  busy.value = true
  try {
    const { data } = await updateEnergyBudget({
      monthlyKwh: form.monthlyKwh,
      monthlyCost: form.monthlyCost,
    })
    if (data && query.data) query.data.value = data
    holdBudget.value = {
      monthlyKwh: form.monthlyKwh,
      monthlyCost: form.monthlyCost,
      until: Date.now() + 90_000,
    }
    editing.value = false
    chrome.notify('能源预算已保存', 'success')
  } catch (e) {
    notifyError(e, '保存能源预算')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped src="./styles/BudgetPanel.css"></style>
