<script setup lang="ts">
/**
 * 设备健康：离线设备与可用固件更新。
 *
 * 之所以单独做一个区块：``/system/device-health/summary`` 之前**没有任何前端消费者** ——
 * 后端算出了「离线 N 台 / 有 M 个更新」，界面上却无处可看。固件更新也只做了检测、
 * 没有安装入口，等于半个功能。
 *
 * ## 视觉：必须用 `SettingsCard`，不要手写容器
 *
 * 本区段挂在「诊断」页里，同级卡片（`OverviewSection` 的四张卡）都是
 * `<SettingsCard full static extra-class="...">` → `hos-panel--glass`（20px 圆角、
 * accent 光晕、分层阴影、backdrop blur）。
 *
 * 第一版这里是手写的 `<section>`：14px 圆角、纯 `surface-1` 平面底、无阴影 —— 于是它在同一屏里
 * 看起来「像另一套产品」。**面板 chrome 一律交给设计系统**，本文件只写内部布局
 * （KPI 行、域 chip、样本行），不覆盖 border / background / radius / shadow。
 *
 * ## 信息层级
 *
 * 1. **KPI 行**（22px 数字）：离线台数 / 固件待更新 / 实体总数。数字是主角 ——
 *    第一版把 15px 计数挤在分组标题右侧，扫一眼读不到。
 * 2. **域分解 chip**：可点，跳到 `/devices?domain=…&status=offline` 的同一批实体。
 * 3. **样本列表**：采样上限 8，只展示前几条；差额明确写出，别让「9」被读成「3」。
 *
 * 安装是**破坏性**动作：只逐个安装（不做批量），点击后二次确认，失败原样展示 HA 的错误。
 */
import { computed, onMounted, ref } from 'vue'
import { Download, RefreshCw, WifiOff } from '@lucide/vue'
import SettingsCard from '@/features/settings/shell/SettingsCard.vue'
import { getDeviceHealthSummary, installFirmwareUpdate } from '@/domain/api/device'
import type { DeviceHealthDomainCount, DeviceHealthSample } from '@/domain/api/device'
import { getDomainLabel } from '@/domain/device/labels'
import { formatLocaleNumber, formatLocaleTime } from '@/kernel/format'
import '@/kernel/ui/hos-icon-btn.css'

interface HealthBucket {
  count: number
  samples: DeviceHealthSample[]
  byDomain?: DeviceHealthDomainCount[]
}

/** 列表里最多渲染几行。采样上限是 8×2，全渲染会变成一张长表。 */
const ROW_LIMIT = 6

/** 域分解里最多几项可点；其余并成不可点的「其它」—— 多个域的合计点进去对不上数字。 */
const BREAKDOWN_LIMIT = 5

const loading = ref(false)
const busyId = ref('')
const error = ref('')
const offline = ref<HealthBucket>({ count: 0, samples: [] })
const firmware = ref<HealthBucket>({ count: 0, samples: [] })
const totalEntities = ref(0)
const generatedAt = ref('')

const allHealthy = computed(
  () => !loading.value && !error.value && offline.value.count === 0 && firmware.value.count === 0,
)

/** 离线占比：没有分母时留空，不显示「0.0%」这种假精度。 */
const offlineRatio = computed(() => {
  if (totalEntities.value <= 0 || offline.value.count <= 0) return ''
  return `${((offline.value.count / totalEntities.value) * 100).toFixed(1)}%`
})

interface ChipEntry {
  domain: string
  label: string
  count: number
  to: { path: string; query: Record<string, string> }
}

/** 域分解：前 N 项可点，其余并成合计。 */
const breakdown = computed(() => {
  const items = offline.value.byDomain ?? []
  return {
    chips: items.slice(0, BREAKDOWN_LIMIT).map<ChipEntry>((item) => ({
      domain: item.domain,
      label: getDomainLabel(item.domain) || item.domain,
      count: item.count,
      to: { path: '/devices', query: { domain: item.domain, status: 'offline' } },
    })),
    rest: items.slice(BREAKDOWN_LIMIT).reduce((total, item) => total + item.count, 0),
  }
})

interface RowEntry {
  entityId: string
  name: string
  domainLabel: string
  kind: 'offline' | 'firmware'
}

/**
 * 合并成一个列表：离线在前（要处理的问题），固件在后（有安装按钮）。
 *
 * 离线优先给它更多名额（最多 4 行），剩余给固件 —— 固件通常只有个位数，
 * 而离线动辄几十上百，平分会把有用的那几行挤掉。
 */
const rows = computed<RowEntry[]>(() => {
  const offlineQuota = Math.min(offline.value.samples.length, firmware.value.count > 0 ? 4 : ROW_LIMIT)
  const picked: RowEntry[] = []
  for (const item of offline.value.samples.slice(0, offlineQuota)) {
    picked.push({
      entityId: item.entityId,
      name: item.name,
      domainLabel: item.domain ? getDomainLabel(item.domain) || item.domain : '',
      kind: 'offline',
    })
  }
  for (const item of firmware.value.samples.slice(0, ROW_LIMIT - picked.length)) {
    picked.push({
      entityId: item.entityId,
      name: item.name,
      domainLabel: item.domain ? getDomainLabel(item.domain) || item.domain : '',
      kind: 'firmware',
    })
  }
  return picked
})

/** 未列出的台数：计数是全量、列表是采样，差额必须写出来。 */
const hidden = computed(() => {
  const shownOffline = rows.value.filter((row) => row.kind === 'offline').length
  return {
    offline: Math.max(0, offline.value.count - shownOffline),
    firmware: Math.max(0, firmware.value.count - rows.value.filter((row) => row.kind === 'firmware').length),
  }
})

const hasHidden = computed(() => hidden.value.offline > 0 || hidden.value.firmware > 0)

/** 上次统计时间：只取时分，日期对「刚才还是几分钟前」没有信息量。 */
const refreshedAt = computed(() => {
  if (!generatedAt.value) return ''
  const parsed = new Date(generatedAt.value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatLocaleTime(parsed, { hour: '2-digit', minute: '2-digit' })
})

/** 实体总数的展示值：没有数据时给破折号，不显示「0」假装统计成功。 */
const totalText = computed(() => (totalEntities.value > 0 ? formatLocaleNumber(totalEntities.value) : '—'))

/** 「还有 N 台」的跳转：全量离线实体。 */
const offlineAllLink = { path: '/devices', query: { status: 'offline' } }
/** 固件更新没有「离线」语义，按域筛即可。 */
const firmwareAllLink = { path: '/devices', query: { domain: 'update' } }

async function refresh() {
  loading.value = true
  try {
    const response = await getDeviceHealthSummary()
    const data = response.data ?? {}
    offline.value = data.offline ?? { count: 0, samples: [] }
    firmware.value = data.firmwareUpdates ?? { count: 0, samples: [] }
    totalEntities.value = data.totalEntities ?? 0
    generatedAt.value = data.generatedAt ?? ''
    error.value = ''
  } catch (err) {
    error.value = (err as { message?: string })?.message || '读取设备健康失败'
  } finally {
    loading.value = false
  }
}

async function install(entityId: string) {
  if (busyId.value) return
  if (!window.confirm(`确认安装该设备的固件更新？\n${entityId}\n安装过程中设备可能短暂离线。`)) return
  busyId.value = entityId
  error.value = ''
  try {
    await installFirmwareUpdate(entityId)
    await refresh()
  } catch (err) {
    error.value = (err as { message?: string })?.message || '固件更新下发失败'
  } finally {
    busyId.value = ''
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <SettingsCard full static extra-class="device-health">
    <header class="device-health__head">
      <div class="device-health__heading">
        <h3 class="device-health__title">设备健康</h3>
        <p class="device-health__sub">
          <template v-if="refreshedAt">离线设备与固件更新 · 统计于 {{ refreshedAt }}</template>
          <template v-else>离线设备与固件更新</template>
        </p>
      </div>
      <button type="button" class="hos-icon-btn" :disabled="loading" aria-label="刷新设备健康" @click="refresh">
        <RefreshCw class="hos-icon-btn__icon" :class="{ 'is-spinning': loading }" />
      </button>
    </header>

    <p v-if="allHealthy" class="device-health__ok">全部设备在线，没有待安装的更新。</p>

    <template v-else>
      <div class="device-health__kpis">
        <div class="device-health__kpi" :data-tone="offline.count > 0 ? 'warn' : 'ok'">
          <span class="device-health__kpi-label">离线</span>
          <span class="device-health__kpi-value">
            {{ offline.count }}<span class="device-health__kpi-unit">台</span>
          </span>
          <span class="device-health__kpi-note">{{ offlineRatio ? `占全部 ${offlineRatio}` : '无离线设备' }}</span>
        </div>
        <div class="device-health__kpi" :data-tone="firmware.count > 0 ? 'warn' : 'ok'">
          <span class="device-health__kpi-label">固件待更新</span>
          <span class="device-health__kpi-value">
            {{ firmware.count }}<span class="device-health__kpi-unit">个</span>
          </span>
          <span class="device-health__kpi-note">{{ firmware.count > 0 ? '可逐个安装' : '均已是最新' }}</span>
        </div>
        <div class="device-health__kpi" data-tone="neutral">
          <span class="device-health__kpi-label">实体总数</span>
          <span class="device-health__kpi-value">
            {{ totalText }}<span v-if="totalEntities > 0" class="device-health__kpi-unit">项</span>
          </span>
          <span class="device-health__kpi-note">已同步</span>
        </div>
      </div>

      <div v-if="breakdown.chips.length || breakdown.rest > 0" class="device-health__breakdown">
        <span class="device-health__breakdown-label">离线分布</span>
        <router-link
          v-for="chip in breakdown.chips"
          :key="chip.domain"
          class="device-health__chip-link"
          :to="chip.to"
          :title="`查看全部离线的${chip.label}`"
        >
          {{ chip.label }}<span class="device-health__chip-count">{{ chip.count }}</span>
        </router-link>
        <span v-if="breakdown.rest > 0" class="device-health__chip-rest">其它 {{ breakdown.rest }}</span>
      </div>

      <ul v-if="rows.length" class="device-health__list">
        <li v-for="row in rows" :key="row.entityId" class="device-health__row">
          <span v-if="row.kind === 'offline'" class="device-health__dot" aria-hidden="true">
            <WifiOff class="device-health__dot-icon" />
          </span>
          <span class="device-health__row-name" :title="row.name">{{ row.name }}</span>
          <span v-if="row.domainLabel" class="device-health__row-chip">{{ row.domainLabel }}</span>
          <button
            v-if="row.kind === 'firmware'"
            type="button"
            class="device-health__install"
            :disabled="Boolean(busyId)"
            @click="install(row.entityId)"
          >
            <Download class="device-health__install-icon" aria-hidden="true" />
            {{ busyId === row.entityId ? '下发中…' : '安装' }}
          </button>
        </li>
      </ul>

      <p v-if="hasHidden" class="device-health__more">
        <template v-if="hidden.offline > 0">
          还有 {{ hidden.offline }} 台离线
          <router-link class="device-health__more-link" :to="offlineAllLink">查看全部</router-link>
        </template>
        <template v-if="hidden.offline > 0 && hidden.firmware > 0"> · </template>
        <template v-if="hidden.firmware > 0">
          还有 {{ hidden.firmware }} 个更新
          <router-link class="device-health__more-link" :to="firmwareAllLink">查看全部</router-link>
        </template>
      </p>
    </template>

    <p v-if="error" class="device-health__error" role="alert">{{ error }}</p>
  </SettingsCard>
</template>

<style scoped>
/**
 * 只写内部布局。
 *
 * 面板 chrome（圆角 / 背景 / 阴影 / 边框 / 内外边距）一律由 `SettingsCard` +
 * `hos-panel` 提供 —— 那是本页其他卡片用的同一套。任何一处在这里重声明背景或圆角，
 * 都会让这块重新「看起来像另一套产品」，也正是第一版的问题所在。
 */
.device-health {
  display: flex;
  flex-direction: column;
  gap: var(--hos-space-3);
}

.device-health__head {
  display: flex;
  align-items: flex-start;
  gap: var(--hos-space-3);
  min-width: 0;
}

.device-health__heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.device-health__head .hos-icon-btn {
  margin-left: auto;
  flex: 0 0 auto;
}

.device-health__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--hos-text-strong);
}

.device-health__sub {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--hos-text-tertiary);
}

.device-health__ok {
  margin: 0;
  font-size: 12px;
  color: var(--hos-color-success);
}

/* ── KPI 行：数字是主角 ── */
.device-health__kpis {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  /* 用列间距而不是竖分隔线：窄容器换行时，行尾那条分隔线会变成一段悬空的短线
     （CSS 无法判断「自己是不是这一行的最后一个」）。数字本身 22px 足够分组。 */
  gap: var(--hos-space-3) var(--hos-space-6);
}

.device-health__kpi {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 108px;
}

.device-health__kpi-label {
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--hos-text-label);
}

.device-health__kpi-value {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 22px;
  font-weight: 650;
  line-height: 1.15;
  color: var(--hos-text-strong);
  /* 等宽数字：刷新时数字变化不会让整行左右跳 */
  font-variant-numeric: tabular-nums;
}

.device-health__kpi[data-tone='warn'] .device-health__kpi-value {
  color: var(--hos-color-warning);
}

.device-health__kpi[data-tone='ok'] .device-health__kpi-value {
  color: var(--hos-color-success);
}

.device-health__kpi-unit {
  font-size: 11px;
  font-weight: 500;
  color: var(--hos-text-tertiary);
}

.device-health__kpi-note {
  font-size: 10.5px;
  color: var(--hos-text-tertiary);
}

/* ── 域分解 chip（可点） ── */
.device-health__breakdown {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.device-health__breakdown-label {
  margin-right: 2px;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--hos-text-label);
}

.device-health__chip-link {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--hos-radius-pill);
  border: var(--hos-hairline) solid var(--hos-border-hairline);
  background: var(--hos-surface-1);
  font-size: 11px;
  color: var(--hos-text-secondary);
  text-decoration: none;
  transition:
    border-color var(--hos-dur-fast) var(--hos-ease-out),
    background var(--hos-dur-fast) var(--hos-ease-out),
    color var(--hos-dur-fast) var(--hos-ease-out);
}

.device-health__chip-link:hover {
  border-color: var(--hos-border-subtle);
  background: var(--hos-surface-3);
  color: var(--hos-text-primary);
}

.device-health__chip-link:focus-visible {
  outline: var(--hos-focus-outline);
  outline-offset: var(--hos-focus-offset);
}

.device-health__chip-count {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--hos-text-body);
}

.device-health__chip-rest {
  padding: 2px;
  font-size: 11px;
  color: var(--hos-text-faint);
}

/* ── 样本列表 ── */
.device-health__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.device-health__row {
  display: flex;
  align-items: center;
  gap: var(--hos-space-2);
  min-width: 0;
  padding: 3px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--hos-text-body);
}

.device-health__row + .device-health__row {
  border-top: var(--hos-hairline) solid var(--hos-border-hairline);
}

/* 离线行用一个极小图标做区分，而不是再加一列文字 —— 列表里多数行都是离线 */
.device-health__dot {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--hos-color-warning);
  opacity: 0.75;
}

.device-health__dot-icon {
  width: 11px;
  height: 11px;
}

.device-health__row-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-health__row-chip {
  flex: 0 0 auto;
  padding: 0 5px;
  border-radius: 5px;
  background: var(--hos-surface-3);
  font-size: 10px;
  line-height: 1.65;
  color: var(--hos-text-tertiary);
}

.device-health__install {
  margin-left: auto;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  border-radius: var(--hos-radius-pill);
  border: var(--hos-hairline) solid var(--hos-border-subtle);
  background: var(--hos-surface-3);
  color: var(--hos-text-primary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--hos-dur-base) var(--hos-ease-out),
    border-color var(--hos-dur-base) var(--hos-ease-out);
}

.device-health__install:hover:not(:disabled) {
  border-color: var(--hos-border-strong);
  background: var(--hos-surface-panel-hover);
}

.device-health__install:disabled {
  cursor: default;
  opacity: 0.55;
}

.device-health__install-icon {
  width: 10px;
  height: 10px;
}

.device-health__more {
  margin: 0;
  font-size: 11px;
  color: var(--hos-text-tertiary);
}

.device-health__more-link {
  color: var(--hos-text-secondary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.device-health__more-link:hover {
  color: var(--hos-text-primary);
}

.device-health__error {
  margin: 0;
  font-size: 11px;
  color: var(--hos-color-danger);
}
</style>
