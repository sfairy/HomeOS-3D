<!--
组件：AlertRulesEarthquakeConnPanel.vue
所属模块：frontend / src / views / settings / interact / alert-rules
职责：地震预警 · 数据连接状态面板。展示各数据源（Wolfx / USGS）的连接状态、最近轮询/成功时间、
      被阈值过滤的最近事件，以及未启用时的引导提示。
Props：
  - loading：是否正在刷新状态
  - payload：EarthquakeStatusPayload，含 sources / recentFilters / hint / enabled
Emits：
  - refresh：点击「刷新」按钮时触发，由父级重新拉取状态
关键依赖：
  - SettingsCard / SettingsSectionHead：卡片容器与区段标题
  - EarthquakeStatusPayload：地震状态数据类型
  - formatLocaleString：时间戳格式化（绝对/相对）
数据来源：父级透传的 payload（由 useEarthquakeStatusQuery 拉取）
-->
<template>
  <SettingsCard static extra-class="alert-eew-conn-card">
    <SettingsSectionHead
      :icon="Radio"
      icon-class="eew-ic-amber"
      orb-class="eew-orb-amber"
      eyebrow="遥测"
      title="数据连接状态"
      description="各源连接/轮询时间，以及被阈值过滤的事件。"
      bordered
    >
      <template #actions>
        <button
          type="button"
          class="settings-btn-ghost text-xs shrink-0"
          :disabled="loading"
          @click="$emit('refresh')"
        >
          <Loader2 v-if="loading" class="w-3.5 h-3.5 animate-spin" />
          刷新
        </button>
      </template>
    </SettingsSectionHead>

    <p v-if="hint" class="alert-eew-conn-hint mt-3">{{ hint }}</p>

    <div class="alert-eew-conn-grid mt-4">
      <article
        v-for="src in sources"
        :key="src.id"
        class="alert-eew-conn-source"
        :class="[
          src.active ? 'alert-eew-conn-source--on' : 'alert-eew-conn-source--off',
          `alert-eew-conn-source--${src.id}`,
        ]"
      >
        <div class="alert-eew-conn-source__head">
          <span class="alert-eew-conn-source__dot" />
          <span class="alert-eew-conn-source__name">{{ src.label }}</span>
          <span
            class="alert-eew-conn-source__badge"
            :class="src.active ? 'alert-eew-conn-source__badge--on' : ''"
          >
            {{ sourceBadge(src) }}
          </span>
        </div>
        <dl class="alert-eew-conn-source__meta">
          <div class="alert-eew-conn-source__row">
            <dt>最近轮询</dt>
            <dd :title="formatTsFull(src.lastPollAt)">{{ formatTsRel(src.lastPollAt) }}</dd>
          </div>
          <div class="alert-eew-conn-source__row">
            <dt>最近成功</dt>
            <dd :title="formatTsFull(src.lastSuccessAt)">{{ formatTsRel(src.lastSuccessAt) }}</dd>
          </div>
          <div v-if="src.lastError" class="alert-eew-conn-source__row alert-eew-conn-source__err">
            <dt>错误</dt>
            <dd :title="src.lastError">{{ src.lastError }}</dd>
          </div>
        </dl>
      </article>
    </div>

    <div class="alert-eew-conn-filters mt-4">
      <div class="alert-eew-conn-filters__head">
        <p class="alert-eew-conn-filters__title">最近过滤</p>
        <span v-if="filters.length" class="alert-eew-conn-filters__count">{{ filters.length }}</span>
      </div>
      <p v-if="!filters.length" class="alert-eew-conn-filters__empty">
        {{
          eewEnabled
            ? '暂无。事件因震级/距离/烈度/去重被跳过时会出现在这里。'
            : '启用预警后，被阈值拦住的事件会显示在这里。'
        }}
      </p>
      <ul v-else class="alert-eew-conn-filters__list">
        <li v-for="(row, i) in filters.slice(0, 12)" :key="`${row.at}-${i}`">
          <span class="alert-eew-conn-filters__time" :title="formatTsFull(row.at)">
            {{ formatTsRel(row.at) }}
          </span>
          <span class="alert-eew-conn-filters__src">{{ row.source }}</span>
          <span class="alert-eew-conn-filters__reason" :title="row.reason">{{ row.reason }}</span>
        </li>
      </ul>
    </div>
  </SettingsCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, Radio } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import type { EarthquakeStatusPayload } from '@/services/api/earthquake'
import { formatLocaleString } from '@/utils/format/locale-format.util'

const props = defineProps<{
  loading?: boolean
  payload?: EarthquakeStatusPayload | null
}>()

defineEmits<{ refresh: [] }>()

const sources = computed(() => props.payload?.sources || [])
const filters = computed(() => props.payload?.recentFilters || [])
const hint = computed(() => {
  const text = props.payload?.hint
  if (typeof text === 'string' && text.trim()) return text.trim()
  if (props.payload && props.payload.enabled === false) {
    return '地震预警未启用：打开上方开关后，点本页「保存地震预警」，才会连接 Wolfx 并轮询 SC/CENC。'
  }
  return ''
})
const eewEnabled = computed(() => props.payload?.enabled !== false)

function sourceBadge(src: { id: string; active: boolean }) {
  if (!eewEnabled.value) return '未启用'
  if (src.active) {
    if (src.id === 'wolfx') return '已连接'
    if (src.id === 'usgs') return '兜底中'
    return '轮询中'
  }
  if (src.id === 'usgs') return '备用待命'
  if (src.id === 'wolfx') return '未连接'
  return '未承担'
}

function formatTsFull(ts: number | null | undefined) {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return ''
  try {
    return formatLocaleString(ts, { hour12: false })
  } catch {
    return ''
  }
}

function formatTsRel(ts: number | null | undefined) {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '—'
  const diff = Date.now() - ts
  if (diff < 0) return formatTsFull(ts) || '—'
  if (diff < 15_000) return '刚刚'
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return formatTsFull(ts) || '—'
}
</script>
