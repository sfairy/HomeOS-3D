<!--
  AwaySimulationPanel.vue / components/widgets/security
  离家模拟面板：安防 Hub 下用于外出时按学习规律随机点亮灯具降低空屋风险，
  可配置灯具池、活跃时段、启用/停止模拟，并结合日历外出给出启用建议。
  Props: embedded 嵌入态 / zones 区域过滤数组 / config 附加配置
  依赖：services/api/security 状态/启用/停止 + 学习模式 buckets 接口；
        services/api/home-modes 日历外出上下文；
        composables: useScheduledPoll 轮询 + useAwaySimulationSettings 高级参数；
        Pinia: useEntitiesStore + useChromeStore + useLayoutStore；
        EntityMultiSelect 灯具池多选组件。
  注意：启用态下展示最近点亮设备名与启用时间；学习模式样本来自 historical bucket。
-->
<template>
  <div :class="['as-root', embedded && 'as-root--embedded']">
    <div v-if="!embedded" class="as-header">
      <div class="as-header-left">
        <Plane :class="['w-3.5 h-3.5', status.enabled ? 'as-icon-active' : 'text-white/30']" />
        <span class="as-title">{{ '离家模拟' }}</span>
      </div>
      <span :class="['as-badge', status.enabled ? 'as-badge--on' : 'as-badge--off']">
        {{ status.enabled ? '模拟中' : '未启用' }}
      </span>
    </div>

    <div class="as-body">
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        error-title="离家模拟加载失败"
        @retry="fetchStatus"
      >
        <div class="as-stack">
          <div
            v-if="!embedded"
            :class="['as-hero', status.enabled && 'as-hero--active']"
          >
            <div class="as-hero__lead">
              <span :class="['as-hero__icon', status.enabled && 'is-active']">
                <Plane class="w-4 h-4" />
              </span>
              <div class="as-hero__text">
                <p class="as-hero__title">{{ '离家模拟' }}</p>
                <p class="as-hero__desc">
                  {{
                    status.enabled
                      ? '正在按学习规律随机亮灯，模拟有人在家'
                      : '外出时随机点亮灯具，降低被盯上风险'
                  }}
                </p>
              </div>
            </div>
            <span :class="['as-badge', status.enabled ? 'as-badge--on' : 'as-badge--off']">
              {{ status.enabled ? '模拟中' : '未启用' }}
            </span>
          </div>

          <p v-else-if="embedded" class="as-embed-desc">
            {{
              status.enabled
                ? '正在按学习规律随机亮灯，模拟有人在家'
                : '外出时随机点亮灯具，降低被盯上风险'
            }}
          </p>

          <div v-if="modeContext.calendarAway" class="as-away-hint">
            <Calendar class="w-3.5 h-3.5 as-icon-calendar shrink-0" />
            <span>{{ '日历标记为外出，建议启用离家模拟' }}</span>
          </div>

          <button
            type="button"
            :class="['as-cta', status.enabled ? 'as-cta--danger' : 'as-cta--primary']"
            :disabled="busy"
            @click="toggle"
          >
            <Loader2 v-if="busy" class="w-4 h-4 animate-spin" />
            <span>{{ status.enabled ? '停止模拟' : '启用离家模拟' }}</span>
          </button>

          <div v-if="status.enabled" class="as-stats">
            <div class="as-stat">
              <span class="as-stat__label">{{ '活跃时段' }}</span>
              <strong class="as-stat__value">{{ activeHoursLabel }}</strong>
            </div>
            <div class="as-stat">
              <span class="as-stat__label">{{ '灯具池' }}</span>
              <strong class="as-stat__value">{{ `${status.poolSize || 0} 盏` }}</strong>
            </div>
            <div v-if="status.lastToggled" class="as-stat as-stat--wide">
              <span class="as-stat__label">{{ '当前点亮' }}</span>
              <strong class="as-stat__value">{{ shortName(status.lastToggled) }}</strong>
            </div>
            <div v-if="status.startedAt" class="as-stat as-stat--wide">
              <span class="as-stat__label">{{ '启用时间' }}</span>
              <strong class="as-stat__value">{{ formatShortDateTimeOrDash(status.startedAt) }}</strong>
            </div>
          </div>

          <template v-if="!status.enabled">
            <section class="as-card">
              <header class="as-card__head">
                <div>
                  <h4 class="as-card__title">{{ '灯具池' }}</h4>
                  <p class="as-card__desc">
                    {{
                      lightPoolDraft.length
                        ? `已选 ${lightPoolDraft.length} 盏参与模拟`
                        : '留空则启用时使用全部 light 实体'
                    }}
                  </p>
                </div>
                <button
                  type="button"
                  class="as-card__action"
                  :disabled="poolSaving || !poolDirty"
                  @click="saveLightPool"
                >
                  {{ poolSaving ? '保存中…' : poolDirty ? '保存' : '已同步' }}
                </button>
              </header>
              <EntityMultiSelect
                v-model="lightPoolDraft"
                :allowed-domains="['light']"
                :placeholder="'搜索并选择灯具'"
                wrapper-class="as-pool-multiselect"
                :dropdown-min-width="280"
                :dropdown-max-height="260"
              />
            </section>

            <section class="as-card">
              <header class="as-card__head">
                <div>
                  <h4 class="as-card__title">{{ '活跃时段' }}</h4>
                  <p class="as-card__desc">{{ '仅在该时段内执行随机亮灯动作' }}</p>
                </div>
                <span class="as-card__pill">{{ activeHoursLabel }}</span>
              </header>
              <div class="as-hours">
                <label class="as-hour-wrap">
                  <span class="as-hour-label">{{ '开始' }}</span>
                  <input
                    :value="startHourDraft"
                    type="number"
                    min="0"
                    max="23"
                    inputmode="numeric"
                    class="as-hour"
                    @focus="startHourFocused = true"
                    @input="startHourDraft = $event.target.value"
                    @blur="commitStartHour"
                  />
                </label>
                <span class="as-hour-sep">{{ '至' }}</span>
                <label class="as-hour-wrap">
                  <span class="as-hour-label">{{ '结束' }}</span>
                  <input
                    :value="endHourDraft"
                    type="number"
                    min="0"
                    max="23"
                    inputmode="numeric"
                    class="as-hour"
                    @focus="endHourFocused = true"
                    @input="endHourDraft = $event.target.value"
                    @blur="commitEndHour"
                  />
                </label>
              </div>
            </section>
          </template>

          <section v-if="patternBuckets.length" class="as-card as-card--compact">
            <header class="as-card__head">
              <div>
                <h4 class="as-card__title">{{ '学习模式' }}</h4>
                <p class="as-card__desc">
                  {{
                    '已学习 {n} 个时段样本'.replace(
                      '{n}',
                      String(patternMeta.bucketCount || patternBuckets.length),
                    )
                  }}
                </p>
              </div>
            </header>
            <div class="as-patterns-grid">
              <div
                v-for="b in patternBuckets.slice(0, 16)"
                :key="`${b.dow}-${b.hour}`"
                class="as-pattern-cell"
                :style="{ opacity: 0.28 + b.lightOnProb * 0.72 }"
                :title="patternCellTitle(b)"
              />
            </div>
          </section>

          <details class="as-card as-advanced">
            <summary class="as-advanced__summary">
              <span>{{ '模拟参数' }}</span>
              <span class="as-advanced__summary-meta">{{ advancedSummary }}</span>
            </summary>
            <div class="as-advanced__body">
              <div class="as-advanced__field">
                <span class="as-advanced__label">{{ '离家布防时自动启用' }}</span>
                <div class="as-toggle" role="group">
                  <button
                    type="button"
                    :class="['as-toggle__opt', !simLinkOnArmAway && 'as-toggle__opt--active']"
                    :disabled="!simCanEdit || simAdvSaving"
                    @click="simLinkOnArmAway = false"
                  >
                    {{ '关闭' }}
                  </button>
                  <button
                    type="button"
                    :class="['as-toggle__opt', simLinkOnArmAway && 'as-toggle__opt--active']"
                    :disabled="!simCanEdit || simAdvSaving"
                    @click="simLinkOnArmAway = true"
                  >
                    {{ '开启' }}
                  </button>
                </div>
              </div>

              <div class="as-advanced__group">
                <span class="as-advanced__group-label">{{ '亮度' }}</span>
                <div class="as-advanced__grid">
                  <label class="as-advanced__input-wrap">
                    <span class="as-advanced__label">{{ '最低 %' }}</span>
                    <input
                      v-model.number="simBrightnessMin"
                      type="number"
                      min="1"
                      max="100"
                      class="as-advanced__input"
                      :disabled="!simCanEdit || simAdvSaving"
                    />
                  </label>
                  <label class="as-advanced__input-wrap">
                    <span class="as-advanced__label">{{ '随机范围' }}</span>
                    <input
                      v-model.number="simBrightnessRange"
                      type="number"
                      min="0"
                      max="100"
                      class="as-advanced__input"
                      :disabled="!simCanEdit || simAdvSaving"
                    />
                  </label>
                </div>
              </div>

              <div class="as-advanced__group">
                <span class="as-advanced__group-label">{{ '动作间隔（分钟）' }}</span>
                <div class="as-advanced__grid">
                  <label class="as-advanced__input-wrap">
                    <span class="as-advanced__label">{{ '最小' }}</span>
                    <input
                      v-model.number="simIntervalMin"
                      type="number"
                      min="1"
                      max="120"
                      class="as-advanced__input"
                      :disabled="!simCanEdit || simAdvSaving"
                    />
                  </label>
                  <label class="as-advanced__input-wrap">
                    <span class="as-advanced__label">{{ '最大' }}</span>
                    <input
                      v-model.number="simIntervalMax"
                      type="number"
                      min="1"
                      max="180"
                      class="as-advanced__input"
                      :disabled="!simCanEdit || simAdvSaving"
                    />
                  </label>
                </div>
              </div>

              <p v-if="!simCanEdit" class="as-advanced__hint as-advanced__hint--warn">
                {{ '仅管理员可修改模拟参数' }}
              </p>

              <button
                type="button"
                class="as-advanced__save"
                :disabled="!simCanEdit || simAdvSaving || simAdvLoading"
                @click="saveSimulationSettings"
              >
                {{ simAdvSaving ? '保存中…' : '保存模拟参数' }}
              </button>
            </div>
          </details>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * 离家模拟面板
 * API: GET  /security-panel/away-sim/status
 *      POST /security-panel/away-sim/enable { activeStartHour, activeEndHour }
 *      POST /security-panel/away-sim/disable
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import { formatShortDateTimeOrDash } from '@/utils/format/locale-format.util'
import { Plane, Calendar, Loader2 } from '@lucide/vue'
import {
  fetchAwaySimPattern,
  fetchAwaySimStatus,
  enableAwaySim,
  disableAwaySim,
} from '@/services/api/security'
import { fetchHomeModeContext } from '@/services/api/home-modes'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { useAwaySimulationSettings } from '@/composables/security/useAwaySimulationSettings'

defineProps({
  embedded: { type: Boolean, default: false },
  zones: { type: Array, default: () => [] },
  config: { type: Object, default: () => ({}) },
})

function padHour(h) {
  return `${String(h).padStart(2, '0')}:00`
}

const es = useEntitiesStore()
const chrome = useChromeStore()
const layout = useLayoutStore()
const {
  loading: simAdvLoading,
  saving: simAdvSaving,
  brightnessMin: simBrightnessMin,
  brightnessRange: simBrightnessRange,
  intervalMin: simIntervalMin,
  intervalMax: simIntervalMax,
  linkOnArmAway: simLinkOnArmAway,
  canEdit: simCanEdit,
  refresh: refreshSimSettings,
  save: saveSimulationSettings,
} = useAwaySimulationSettings()
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const status = ref({})
const modeContext = ref({ calendarAway: false })
const patternMeta = ref({ bucketCount: 0 })
const patternBuckets = ref([])
const activeStartHour = ref(18)
const activeEndHour = ref(23)
const startHourDraft = ref('18')
const endHourDraft = ref('23')
const startHourFocused = ref(false)
const endHourFocused = ref(false)
const lightPoolDraft = ref([])
const poolSaving = ref(false)

watch(activeStartHour, (v) => {
  if (!startHourFocused.value) startHourDraft.value = String(clampHour(v, 18))
})
watch(activeEndHour, (v) => {
  if (!endHourFocused.value) endHourDraft.value = String(clampHour(v, 23))
})

const activeHoursLabel = computed(() => {
  const start = clampHour(activeStartHour.value, 18)
  const end = clampHour(activeEndHour.value, 23)
  if (start <= end) return `${padHour(start)} – ${padHour(end)}`
  return `${padHour(start)} – 次日 ${padHour(end)}`
})

const advancedSummary = computed(() => {
  const parts = [
    simLinkOnArmAway.value ? '联动开' : '联动关',
    `亮度 ${simBrightnessMin.value}%+${simBrightnessRange.value}`,
    `间隔 ${simIntervalMin.value}-${simIntervalMax.value}分`,
  ]
  return parts.join(' · ')
})

const lightPool = computed(() => layout.layoutConfig.awaySimulationLightPool || [])

const poolDirty = computed(() => {
  const saved = lightPool.value
  const draft = lightPoolDraft.value
  if (saved.length !== draft.length) return true
  const set = new Set(saved)
  return draft.some((id) => !set.has(id))
})

function syncLightPoolDraft() {
  lightPoolDraft.value = [...(layout.layoutConfig.awaySimulationLightPool || [])]
}

async function saveLightPool() {
  const list = lightPoolDraft.value
    .map((id) => String(id || '').trim())
    .filter((id) => id.startsWith('light.'))
  poolSaving.value = true
  try {
    layout.layoutConfig.awaySimulationLightPool = list
    const ok = await layout.saveLayout()
    if (!ok) return
    syncLightPoolDraft()
    chrome.notify(
      list.length ? `已保存 ${list.length} 个灯具` : '已清空灯具池，启用时将使用全部灯具',
      'success',
    )
  } finally {
    poolSaving.value = false
  }
}

function shortName(e) {
  const ent = es.entities[e]
  return getEntityDisplayName(e ?? '', ent)
}

const DOW_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function dowLabel(dow) {
  return DOW_LABELS[dow] ?? String(dow)
}

function patternCellTitle(b) {
  return `${dowLabel(b.dow)} ${b.hour}:00 · ${Math.round(b.lightOnProb * 100)}%`
}

function clampHour(value, fallback) {
  if (value === '' || value == null) return fallback
  if (typeof value === 'string' && value.trim() === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(23, Math.max(0, Math.round(n)))
}

function commitStartHour() {
  startHourFocused.value = false
  const next = clampHour(startHourDraft.value, activeStartHour.value)
  activeStartHour.value = next
  startHourDraft.value = String(next)
}

function commitEndHour() {
  endHourFocused.value = false
  const next = clampHour(endHourDraft.value, activeEndHour.value)
  activeEndHour.value = next
  endHourDraft.value = String(next)
}

async function fetchPattern() {
  try {
    const { data } = await fetchAwaySimPattern()
    patternMeta.value = { bucketCount: data?.bucketCount || 0 }
    patternBuckets.value = Array.isArray(data?.buckets) ? data.buckets : []
  } catch (e) {
    patternBuckets.value = []
    notifyError(e, '加载失败', { silent: true })
  }
}

async function fetchModeContext() {
  try {
    const { data } = await fetchHomeModeContext()
    modeContext.value = { calendarAway: !!data?.calendarAway }
  } catch (e) {
    modeContext.value = { calendarAway: false }
    notifyError(e, '加载失败', { silent: true })
  }
}

async function fetchStatus() {
  loadError.value = ''
  try {
    const { data } = await fetchAwaySimStatus()
    status.value = data || {}
    if (data && !data.enabled) {
      if (data.activeStartHour != null) activeStartHour.value = data.activeStartHour
      if (data.activeEndHour != null) activeEndHour.value = data.activeEndHour
    }
  } catch {
    loadError.value = '请检查网络连接后重试'
    chrome.notify('加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function toggle() {
  if (!status.value.enabled && poolDirty.value) {
    chrome.notify('灯具池有未保存的更改，请先点击「保存灯具池到布局」', 'warning')
    return
  }
  busy.value = true
  try {
    if (status.value.enabled) {
      const { data } = await disableAwaySim()
      status.value = data || status.value
      chrome.notify('离家模拟已停止', 'success')
    } else {
      const lights = lightPool.value.filter(Boolean)
      const { data } = await enableAwaySim({
        activeStartHour: activeStartHour.value,
        activeEndHour: activeEndHour.value,
        ...(lights.length ? { lights } : {}),
      })
      status.value = data || status.value
      chrome.notify('离家模拟已启用', 'success')
    }
  } catch (e) {
    chrome.notify(e?.response?.status === 403 ? '需要管理员权限' : '操作失败', 'error')
  } finally {
    busy.value = false
  }
}

const pollBoth = () => {
  fetchStatus()
  fetchModeContext()
  fetchPattern()
  void refreshSimSettings()
}
onMounted(() => {
  syncLightPoolDraft()
  pollBoth()
})
watch(
  () => layout.layoutConfig.awaySimulationLightPool,
  () => {
    if (!poolDirty.value) syncLightPoolDraft()
  },
  { deep: true },
)
useScheduledPoll(pollBoth, 30000, { key: 'widget:AwaySimulationPanel' })
</script>

<style scoped src="./styles/AwaySimulationPanel.css"></style>
