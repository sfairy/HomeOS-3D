<script setup lang="ts">
/**
 * 用水安全卡片：主水阀状态 + 实时流量 + 手动关阀。
 *
 * 分工说明（避免重复告警与误导）：
 * - **水浸传感器**（device_class water/moisture）由安防危险联动负责 —— 那条链路会按 3D
 *   布局里的危险绑定执行关阀/排风，并发出 ``security.alarm``；后端用水监测刻意不重复告警。
 * - 本卡片提供「持续流水」之外的手动关阀入口：洗浴、换水都是短时大流量，自动关阀的
 *   误报代价是全屋断水，所以这里要求明确点击。
 *
 * 三种呈现（而不是一律渲染两个数字）：
 * - **未接入**：没有主水阀也没有流量传感器时只给一条配置引导，不摆「0.00 L/min」；
 * - **正常**：状态胶囊 + 两块指标瓦片 + 操作按钮；
 * - **异常**：出错时给可重试的错误行，而不是静默显示 0。
 *
 * 布局：两段式。头部（标题 / 副标题 / 状态 / 刷新）恒定一行；下面「指标 + 操作」是一条
 * 可换行的横排 —— 大屏时并成一行（不用媒体查询，因为画布宽度由缩放决定而非视口宽度），
 * 窄屏时自然折成两行，且全程不产生横向滚动。
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Droplets, RefreshCw, ShieldAlert, Waves } from '@lucide/vue'
import { closeWaterValve, getWaterStatus, openWaterValve } from '@/domain/api/water'
import type { WaterStatus } from '@/domain/api/water'
import '@/app/styles/hos-icon-btn.css'

const loading = ref(true)
const busy = ref(false)
const error = ref('')
const status = ref<WaterStatus>({
  valveEntityId: '',
  valveState: null,
  flows: [],
  todayCubicMeters: null,
})

const hasValve = computed(() => Boolean(status.value.valveEntityId))
const flows = computed(() => status.value.flows || [])
const valveClosed = computed(() => {
  const state = String(status.value.valveState || '').toLowerCase()
  return state === 'closed' || state === 'off'
})
const totalFlow = computed(() => flows.value.reduce((sum, item) => sum + (Number(item.lpm) || 0), 0))
/** 是否接了流量传感器：没接就不该显示 0.00 —— 那是「没有数据」，不是「没有用水」。 */
const hasFlowSensor = computed(() => flows.value.length > 0)
/** 是否有任何可展示的内容；两者都没有时只给一条紧凑的配置引导。 */
const configured = computed(() => hasValve.value || hasFlowSensor.value)
/** 未接入时的一行说明（完整含义保留，只是不再单独占一块虚线区域）。 */
const unconfiguredHint = '尚未接入主水阀或流量传感器 · 水浸告警仍由安防联动处理'

type Tone = 'ok' | 'warn' | 'off' | 'flow'
const valveTone = computed<Tone>(() => {
  if (!hasValve.value) return 'off'
  if (valveClosed.value) return 'warn'
  return totalFlow.value > 0.01 ? 'flow' : 'ok'
})
const valveLabel = computed(() => {
  if (!hasValve.value) return '主水阀未配置'
  if (valveClosed.value) return '主水阀已关闭'
  return totalFlow.value > 0.01 ? '正在用水' : '主水阀正常'
})
const flowText = computed(() => (hasFlowSensor.value ? totalFlow.value.toFixed(2) : '未接入'))
/** 今日累计用水（m³）：只有接了累计水表才有；没有这一项时整块瓦片不渲染。 */
const todayUsage = computed(() => {
  const value = status.value.todayCubicMeters
  return typeof value === 'number' ? value : null
})

async function refresh() {
  loading.value = true
  try {
    const response = await getWaterStatus()
    status.value = response.data ?? status.value
    error.value = ''
  } catch (err) {
    error.value = (err as { message?: string })?.message || '读取用水状态失败'
  } finally {
    loading.value = false
  }
}

async function toggleValve() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const action = valveClosed.value ? openWaterValve : closeWaterValve
    await action()
    await refresh()
  } catch (err) {
    error.value = (err as { message?: string })?.message || '操作主水阀失败'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <!-- 未接入时降级为单行提示条：
       原先「头部 + 虚线引导块」两段共约 130px，却没有任何可操作数据可看；
       这里收成一行（高度 ~52px），把省下的高度全部让给上方区域卡片与传感器列表。 -->
  <section
    class="water-safety"
    :class="{ 'water-safety--idle': loading, 'water-safety--compact': !configured && !loading }"
    aria-label="用水安全"
  >
    <header class="water-safety__head">
      <span class="water-safety__badge" aria-hidden="true">
        <Droplets class="water-safety__badge-icon" />
      </span>
      <div class="water-safety__heading">
        <h3 class="water-safety__title">用水安全</h3>
        <p class="water-safety__sub" :title="configured ? undefined : unconfiguredHint">
          {{ configured ? '水浸告警由安防联动处理 · 短时大流量不会自动关阀' : unconfiguredHint }}
        </p>
      </div>
      <span v-if="configured" class="water-safety__pill" :data-tone="valveTone">{{ valveLabel }}</span>
      <RouterLink
        v-if="!configured && !loading"
        class="water-safety__link water-safety__head-link"
        to="/settings?tab=params&section=water"
      >
        去配置
      </RouterLink>
      <button
        type="button"
        class="hos-icon-btn"
        :disabled="loading"
        aria-label="刷新用水状态"
        title="刷新"
        @click="refresh"
      >
        <RefreshCw class="hos-icon-btn__icon" :class="{ 'is-spinning': loading }" />
      </button>
    </header>

    <div v-if="configured" class="water-safety__bar">
      <div class="water-safety__metrics">
        <article class="water-safety__metric" :data-empty="hasFlowSensor ? 'false' : 'true'">
          <Waves class="water-safety__metric-icon" aria-hidden="true" />
          <div class="water-safety__metric-body">
            <span class="water-safety__metric-label">当前流量</span>
            <span class="water-safety__metric-value">
              {{ flowText }}<i v-if="hasFlowSensor" class="water-safety__metric-unit">L/min</i>
            </span>
          </div>
        </article>
        <article class="water-safety__metric" :data-empty="hasValve ? 'false' : 'true'">
          <ShieldAlert class="water-safety__metric-icon" aria-hidden="true" />
          <div class="water-safety__metric-body">
            <span class="water-safety__metric-label">主水阀</span>
            <span class="water-safety__metric-value">
              {{ hasValve ? (valveClosed ? '已关闭' : '开启') : '未接入' }}
            </span>
          </div>
        </article>
        <article v-if="todayUsage !== null" class="water-safety__metric" data-empty="false">
          <Droplets class="water-safety__metric-icon" aria-hidden="true" />
          <div class="water-safety__metric-body">
            <span class="water-safety__metric-label">今日用水</span>
            <span class="water-safety__metric-value">
              {{ todayUsage.toFixed(3) }}<i class="water-safety__metric-unit">m³</i>
            </span>
          </div>
        </article>
      </div>

      <div class="water-safety__actions">
        <button
          v-if="hasValve"
          type="button"
          class="water-safety__btn"
          :data-danger="valveClosed ? 'false' : 'true'"
          :disabled="busy"
          @click="toggleValve"
        >
          {{ valveClosed ? '打开主水阀' : '立即关闭主水阀' }}
        </button>
        <RouterLink v-else class="water-safety__link" to="/settings?tab=params&section=water">
          配置主水阀
        </RouterLink>
      </div>
    </div>

    <ul v-if="flows.length > 1" class="water-safety__flows">
      <li v-for="flow in flows" :key="flow.entityId" class="water-safety__flow">
        <span class="water-safety__flow-name">{{ flow.name }}</span>
        <span class="water-safety__flow-value">{{ flow.lpm }} L/min</span>
      </li>
    </ul>

    <p v-if="error" class="water-safety__error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.water-safety {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--hos-space-md) var(--hos-space-lg);
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline) solid var(--hos-border-hairline);
  /* 与安防面板同族的实体感：渐变面板 + 顶部 inset 高光，避免在半透明底上看成一条空带 */
  background: var(--hos-surface-panel);
  box-shadow: var(--hos-shadow-card), var(--hos-surface-inset);
  transition: opacity var(--hos-dur-base) var(--hos-ease-out);
}

.water-safety--idle {
  /* 首次加载只做轻微降透明，不做骨架屏：卡片通常在几百毫秒内就有数据 */
  opacity: 0.72;
}

/* ── 头部（恒定一行，窄屏时副标题折行） ── */
.water-safety__head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.water-safety__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: var(--hos-radius-control);
  border: var(--hos-hairline) solid var(--hos-border-subtle);
  background: var(--hos-surface-1);
  color: var(--security-hub-accent, var(--hos-color-accent));
}

.water-safety__badge-icon {
  width: 16px;
  height: 16px;
}

.water-safety__heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 允许标题区吸收剩余宽度：副标题超长时才能正确出现省略号，
   * 而不是把右侧的状态胶囊 / 去配置链接挤出容器。 */
  flex: 1 1 auto;
  min-width: 0;
}

.water-safety__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--hos-text-strong);
}

.water-safety__sub {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--hos-text-tertiary);
  /* 允许在任意位置折行：页面禁止横向滚动，长文案不能把胶囊挤出去 */
  overflow-wrap: anywhere;
}

/* ── 状态胶囊 ── */
.water-safety__pill {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 3px 10px;
  border-radius: var(--hos-radius-pill);
  border: var(--hos-hairline) solid var(--hos-border-hairline);
  background: var(--hos-surface-1);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--hos-text-secondary);
}

.water-safety__pill[data-tone='ok'] {
  border-color: color-mix(in srgb, var(--hos-color-success) 45%, transparent);
  background: color-mix(in srgb, var(--hos-color-success) 14%, transparent);
  color: var(--hos-color-success);
}

.water-safety__pill[data-tone='warn'] {
  border-color: color-mix(in srgb, var(--hos-color-warning) 45%, transparent);
  background: color-mix(in srgb, var(--hos-color-warning) 14%, transparent);
  color: var(--hos-color-warning);
}

.water-safety__pill[data-tone='flow'] {
  border-color: color-mix(in srgb, var(--security-hub-accent, var(--hos-color-accent)) 50%, transparent);
  background: color-mix(in srgb, var(--security-hub-accent, var(--hos-color-accent)) 16%, transparent);
  color: var(--security-hub-accent, var(--hos-color-accent));
}

/* ── 指标 + 操作：一条可换行的横排 ──
 * 不用媒体查询：画布宽度由缩放决定，视口断点在这里是错的判据。 */
.water-safety__bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--hos-space-sm) var(--hos-space-md);
}

.water-safety__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hos-space-sm);
  /* 允许收缩（窄屏折行）但不许增长到把按钮挤走 */
  flex: 1 1 320px;
  min-width: 0;
}

.water-safety__metric {
  display: flex;
  align-items: center;
  gap: var(--hos-space-sm);
  /* 内容驱动宽度：大屏下不会拉成一条巨型空瓦片 */
  flex: 0 1 auto;
  min-width: 148px;
  padding: 8px var(--hos-space-md);
  border-radius: var(--hos-radius-control);
  border: var(--hos-hairline) solid var(--hos-border-hairline);
  background: var(--hos-surface-1);
  box-shadow: var(--hos-surface-inset);
}

.water-safety__metric[data-empty='true'] {
  /* 未接入时整块压暗：一眼看出「没数据」，而不是误读成「读数为 0」 */
  background: transparent;
  box-shadow: none;
  border-style: dashed;
}

.water-safety__metric-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--hos-text-tertiary);
}

.water-safety__metric-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.water-safety__metric-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--hos-text-label);
}

.water-safety__metric-value {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--hos-text-strong);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.water-safety__metric[data-empty='true'] .water-safety__metric-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--hos-text-tertiary);
}

.water-safety__metric-unit {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 500;
  font-style: normal;
  color: var(--hos-text-tertiary);
}

/* ── 操作区 ── */
.water-safety__actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  margin-left: auto;
}

.water-safety__btn {
  flex: 0 0 auto;
  padding: 6px 14px;
  border-radius: var(--hos-radius-pill);
  border: var(--hos-hairline) solid var(--hos-border-subtle);
  background: var(--hos-surface-2);
  color: var(--hos-text-primary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--hos-dur-base) var(--hos-ease-out),
    border-color var(--hos-dur-base) var(--hos-ease-out),
    color var(--hos-dur-base) var(--hos-ease-out);
}

.water-safety__btn:hover:not(:disabled) {
  background: var(--hos-surface-3);
  border-color: var(--hos-border-strong);
}

/* 关阀是破坏性操作：用危险色提示；阀已关时同一按钮中性化（它变成了「恢复」） */
.water-safety__btn[data-danger='true'] {
  border-color: color-mix(in srgb, var(--hos-color-danger) 48%, transparent);
  background: color-mix(in srgb, var(--hos-color-danger) 16%, transparent);
  color: var(--hos-color-danger);
}

.water-safety__btn[data-danger='true']:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--hos-color-danger) 72%, transparent);
  background: color-mix(in srgb, var(--hos-color-danger) 26%, transparent);
}

.water-safety__btn:disabled {
  cursor: default;
  opacity: 0.55;
}

/* ── 未接入：整张卡片降级成单行提示条 ── */
.water-safety--compact {
  gap: 0;
  padding-block: var(--hos-space-sm);
}

/* 单行时副标题只占一行，过长由 title 提示兜底 */
.water-safety--compact .water-safety__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.water-safety__head-link {
  margin-left: auto;
}

.water-safety__link {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--security-hub-accent, var(--hos-color-accent));
  text-decoration: none;
  border-bottom: var(--hos-hairline) solid color-mix(in srgb, currentColor 45%, transparent);
}

.water-safety__link:hover {
  color: var(--hos-text-strong);
}

/* ── 分传感器明细 ── */
.water-safety__flows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.water-safety__flow {
  display: flex;
  align-items: center;
  gap: var(--hos-space-sm);
  padding: 5px 2px;
  font-size: 12px;
  color: var(--hos-text-secondary);
}

.water-safety__flow + .water-safety__flow {
  border-top: var(--hos-hairline) solid var(--hos-border-hairline);
}

.water-safety__flow-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.water-safety__flow-value {
  margin-left: auto;
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: var(--hos-text-body);
}

.water-safety__error {
  margin: 0;
  font-size: 11px;
  color: var(--hos-color-danger);
}
</style>
