<!--
组件：RuntimeLogsSection.vue
所属模块：frontend / src / views / settings / system / diagnostics
职责：后端运行日志区段。展示 Nest 进程内环形缓冲日志（admin），支持级别过滤、清空与导出。
      实时优先 SSE，失败时降级轮询。数据由 useDiagnosticsSection 注入。
关键依赖：
  - useDiagnosticsSection：注入 runtimeLogs / clearRuntimeLogs 等
数据来源：useDiagnosticsSection() 返回的 runtimeLogs 列表
-->
<template>
  <div class="settings-hub-section settings-hub-section--fill diag-page">
    <div class="diag-runtime-shell">
      <div class="diag-runtime-toolbar">
        <div class="diag-runtime-toolbar__meta">
          <p class="diag-hero-eyebrow">{{ '进程日志' }}</p>
          <h3 class="diag-runtime-toolbar__title">{{ '后端运行日志' }}</h3>
          <p class="diag-runtime-toolbar__desc">
            {{ '内存环形缓冲，重启后清空；实时优先 SSE，失败时降级轮询' }}
            <span v-if="capacity" class="diag-runtime-toolbar__stat">
              {{ buffered }} / {{ capacity }}
              <template v-if="dropped"> · {{ '已丢弃 ' }}{{ dropped }}</template>
              <template v-if="live && liveMode !== 'off'">
                · {{ liveMode === 'sse' ? 'SSE' : '轮询' }}
              </template>
            </span>
          </p>
        </div>
        <div class="diag-runtime-toolbar__actions">
          <button
            type="button"
            :class="['diag-action-btn', live && 'diag-action-btn--primary']"
            :aria-pressed="live"
            @click="live = !live"
          >
            <Radio :class="['w-5 h-5', live && 'diag-runtime-live-pulse']" />
            {{ live ? '实时中' : '已暂停' }}
          </button>
          <button type="button" class="diag-action-btn" :disabled="loading" @click="refresh">
            <RefreshCw :class="['w-5 h-5', loading && 'animate-spin']" /> {{ '刷新' }}
          </button>
          <button type="button" class="diag-action-btn" :disabled="!items.length" @click="clearLogs">
            <Trash2 class="w-5 h-5" /> {{ '清空' }}
          </button>
        </div>
      </div>

      <div class="diag-runtime-filters">
        <div class="diag-runtime-levels" role="tablist" :aria-label="'日志级别'">
          <button
            v-for="opt in levelOptions"
            :key="opt.id"
            type="button"
            role="tab"
            :class="['diag-runtime-level', levelFilter === opt.id && 'diag-runtime-level--active']"
            :aria-selected="levelFilter === opt.id"
            @click="levelFilter = opt.id"
          >
            {{ opt.label }}
          </button>
        </div>
        <label class="diag-runtime-search">
          <Search class="w-4 h-4 shrink-0 opacity-60" />
          <input
            v-model.trim="query"
            type="search"
            class="diag-runtime-search__input"
            :placeholder="'搜索 message / context / traceId'"
            autocomplete="off"
          />
        </label>
      </div>

      <div
        v-if="loadError"
        class="settings-premium-empty settings-premium-empty--amber diag-runtime-error"
      >
        <AlertCircle class="settings-premium-empty__icon" />
        <p class="settings-premium-empty__title">{{ '运行日志加载失败' }}</p>
        <p class="settings-premium-empty__desc">{{ loadError }}</p>
        <button
          type="button"
          class="settings-premium-empty__btn settings-premium-empty__btn--accent"
          :disabled="loading"
          @click="refresh"
        >
          <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" />
          {{ '重试' }}
        </button>
      </div>

      <div v-else ref="scrollerEl" class="diag-runtime-console" @scroll="onScroll">
        <div v-if="loading && !items.length" class="diag-runtime-empty">
          <RefreshCw class="w-6 h-6 animate-spin" />
          <span>{{ '正在拉取日志…' }}</span>
        </div>
        <div v-else-if="!items.length" class="diag-runtime-empty">
          <Terminal class="w-6 h-6 opacity-50" />
          <span>{{ '暂无匹配日志；操作后端或放宽筛选后重试' }}</span>
        </div>
        <div
          v-for="row in items"
          :key="row.id"
          :class="['diag-runtime-line', `diag-runtime-line--${row.level}`]"
        >
          <span class="diag-runtime-line__ts">{{ formatTs(row.ts) }}</span>
          <span class="diag-runtime-line__level">{{ row.level }}</span>
          <span class="diag-runtime-line__body">
            <span v-if="row.context" class="diag-runtime-line__ctx">[{{ row.context }}]</span>
            <span class="diag-runtime-line__msg">{{ row.message }}</span>
          </span>
          <span v-if="row.traceId" class="diag-runtime-line__trace" :title="row.traceId">
            {{ row.traceId }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { RefreshCw, Trash2, Radio, Search, AlertCircle, Terminal } from '@lucide/vue'
import { useRuntimeLogs } from './useRuntimeLogs'
import { useDiagnosticsSection } from './useDiagnosticsSection'

const props = defineProps({
  active: { type: Boolean, default: true },
})

const { registerSectionRefresh } = useDiagnosticsSection(['registerSectionRefresh'])

const {
  items,
  loading,
  loadError,
  live,
  liveMode,
  levelFilter,
  query,
  capacity,
  buffered,
  dropped,
  levelOptions,
  refresh,
  clearLogs,
} = useRuntimeLogs(() => props.active)

const scrollerEl = ref(null)
const stickToBottom = ref(true)

function formatTs(ts) {
  try {
    const d = new Date(ts)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    const ms = String(d.getMilliseconds()).padStart(3, '0')
    return `${hh}:${mm}:${ss}.${ms}`
  } catch {
    return ts
  }
}

function onScroll() {
  const el = scrollerEl.value
  if (!el) return
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom.value = gap < 48
}

watch(
  () => props.active,
  (isActive) => {
    if (isActive) registerSectionRefresh(refresh)
    else registerSectionRefresh(null)
  },
  { immediate: true },
)

onUnmounted(() => {
  registerSectionRefresh(null)
})

watch(
  () => items.value.length,
  async () => {
    if (!stickToBottom.value) return
    await nextTick()
    const el = scrollerEl.value
    if (el) el.scrollTop = el.scrollHeight
  },
)
</script>

<style scoped src="./styles/diagnostics-theme.css"></style>
