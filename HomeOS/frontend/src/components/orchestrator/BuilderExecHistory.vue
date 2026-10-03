<template>
  <!-- BuilderExecHistory 构建器执行历史：自动化/场景/脚本最近运行结果列表 -->
  <div
    class="beh-block"
    :class="{
      'beh-block--flow': flow,
      'beh-block--collapsed': collapsible && collapsed,
    }"
  >
    <div class="wr-side-head">
      <button
        v-if="collapsible"
        type="button"
        class="wr-side-head__toggle"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? `展开${title}` : `收起${title}`"
        @click="onToggle"
      >
        <ChevronDown :class="['wr-side-head__chev', !collapsed && 'wr-side-head__chev--open']" />
        <span class="wr-side-head__title">{{ title }}</span>
        <span v-if="collapsed && summaryLabel" class="wr-side-head__summary">{{
          summaryLabel
        }}</span>
      </button>
      <span v-else class="wr-side-head__title wr-side-head__title--static">{{ title }}</span>
      <button type="button" class="wr-side-copy" @click.stop="load">{{ '刷新' }}</button>
    </div>
    <div
      v-show="!collapsible || !collapsed"
      class="wr-exec-list"
      :class="{
        'wr-exec-list--compact': compact && !flow,
        'wr-exec-list--flow': flow,
      }"
    >
      <div v-if="loading" class="wr-exec-state">
        <Loader2 class="wr-exec-state__icon animate-spin" />
        <span>{{ '加载中…' }}</span>
      </div>
      <div v-else-if="loadError" class="wr-exec-state wr-exec-state--empty">
        <History class="wr-exec-state__icon" />
        <span class="wr-exec-state__title">{{ '加载失败' }}</span>
        <span class="wr-exec-state__desc">{{ loadError }}</span>
      </div>
      <div v-else-if="records.length === 0" class="wr-exec-state wr-exec-state--empty">
        <History class="wr-exec-state__icon" />
        <span class="wr-exec-state__title">{{ '暂无记录' }}</span>
        <span class="wr-exec-state__desc">{{ '执行后将在此显示最近运行历史' }}</span>
      </div>
      <article
        v-for="rec in records"
        :key="rec.id"
        :class="['wr-exec-card', rec.success ? 'wr-exec-card--ok' : 'wr-exec-card--fail']"
      >
        <span
          :class="[
            'wr-exec-card__status',
            rec.success ? 'wr-exec-card__status--ok' : 'wr-exec-card__status--fail',
          ]"
        >
          {{ rec.success ? '✓' : '✗' }}
        </span>
        <div class="wr-exec-card__body">
          <span class="wr-exec-card__name">{{ rec.name }}</span>
          <span class="wr-exec-card__meta"
            >{{ typeLabel(rec.type) }} · {{ formatShortDateTimeOrDash(rec.executedAt) }}</span
          >
          <span v-if="rec.triggerNote" class="wr-exec-card__trigger">{{ rec.triggerNote }}</span>
          <span v-if="rec.detail" class="wr-exec-card__detail">{{ rec.detail }}</span>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
/**
 * BuilderExecHistory - 构建器执行历史组件
 * 职责：在自动化/场景/脚本构建器侧栏展示最近执行记录，支持折叠、刷新与按类型过滤。
 * 关键依赖：
 * - apiGet：从指定 endpoint 拉取执行历史；
 * - useOrchestratorDockCollapse：侧栏折叠状态（持久化到 storageKey）；
 * - formatShortDateTimeOrDash / getApiErrorMessage：时间与错误文案。
 * Props:
 * - endpoint/params/limit：拉取接口、查询参数与最大条数；
 * - typeFilter：仅展示该类型的记录；
 * - mapRecord：原始数据行映射函数；
 * - compact/flow/collapsible/defaultCollapsed/storageKey：布局与折叠行为。
 * 暴露方法：load（手动刷新）、collapsed、toggle（外部控制折叠）。
 */
import { computed, ref, onMounted, watch } from 'vue'
import { Loader2, History, ChevronDown } from '@lucide/vue'
import { apiGet } from '@/services/api'
import { formatShortDateTimeOrDash } from '@/utils/format/locale-format.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useOrchestratorDockCollapse } from '@/composables/orchestrator/useOrchestratorDockCollapse'

const TYPE_LABELS = {
  automation: '自动化',
  scene: '场景',
  script: '脚本',
  home_mode: '家庭模式',
  alert: '告警',
}

function typeLabel(type) {
  return TYPE_LABELS[type] ?? type
}

const props = defineProps({
  title: { type: String, default: '' },
  endpoint: { type: String, required: true },
  params: { type: Object, default: () => ({}) },
  limit: { type: Number, default: 8 },
  typeFilter: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  flow: { type: Boolean, default: false },
  collapsible: { type: Boolean, default: true },
  defaultCollapsed: { type: Boolean, default: true },
  storageKey: { type: String, default: 'homeos_orch_exec_history' },
  mapRecord: { type: Function, default: null },
})

const independent = useOrchestratorDockCollapse(props.storageKey || null, props.defaultCollapsed)

const collapsed = computed(() => independent.collapsed.value)

function onToggle() {
  independent.toggle()
}

watch(
  () => props.defaultCollapsed,
  (value) => {
    if (!props.storageKey) independent.setCollapsed(value)
  },
)

const loading = ref(false)
const loadError = ref('')
const records = ref([])

const summaryLabel = computed(() => {
  if (loading.value) return '加载中…'
  if (loadError.value) return '加载失败'
  const n = records.value.length
  return n > 0 ? `${n} 条记录` : '暂无记录'
})


async function load(options = {}) {
  // silent 模式不显示骨架屏；首屏加载或显式刷新时才进入 loading
  const showLoading = !options.silent && records.value.length === 0
  if (showLoading) loading.value = true
  try {
    const { data } = await apiGet(props.endpoint, {
      params: { limit: props.limit, ...props.params },
    })
    let rows = Array.isArray(data) ? data : []
    if (props.mapRecord) rows = rows.map(props.mapRecord)
    if (props.typeFilter) rows = rows.filter((r) => r.type === props.typeFilter)
    records.value = rows.slice(0, props.limit)
    loadError.value = ''
  } catch (e) {
    if (showLoading) records.value = []
    loadError.value = getApiErrorMessage(e, '无法加载执行历史')
  } finally {
    if (showLoading) loading.value = false
  }
}

onMounted(load)
// endpoint/params/typeFilter 变化时自动重新拉取
watch(() => [props.endpoint, props.params, props.typeFilter], load, { deep: true })

defineExpose({ load, collapsed, toggle: onToggle })
</script>

<style scoped src="./styles/builder-exec-history.css"></style>
