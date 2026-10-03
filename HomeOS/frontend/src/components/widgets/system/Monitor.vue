<!--
  SystemMonitor.vue / components/widgets/system
  系统状态监控面板：展示 HomeOS 后端版本、运行时长、CPU/内存/磁盘使用率，
  集成 useSystemDiagnostics 健康检查（HA/MQTT/Redis/Zigbee 在线诊断）与一键复制诊断信息。
  Props: embedded 嵌入态隐藏头部 / dense 紧凑开关 / config 布局配置
  依赖：services/api/system fetchSystemInfo 接口；
        composables: useWidgetApiQuery 查询包装
                      + useSystemDiagnostics 健康 + 诊断数据；
        Pinia: useAuthStore isAdmin 判断是否显示复制诊断按钮；
        子组件：VProgressBar 进度条 + ApiQueryState 状态容器；
        notify copyTextWithNotify 复制并 toast。
  注意：CPU/内存/磁盘数据来自后端聚合，缺失字段显示占位符。
-->
<template>
  <div class="sys-card widget-glass-card">
    <div v-if="!embedded" class="sys-header">
      <Server class="w-3.5 h-3.5 sys-icon" />
      <span class="sys-title">{{ '系统状态' }}</span>
    </div>
    <div class="sys-body">
      <ApiQueryState
        :loading="loading && !hasData && !loadError"
        :error="loadError || ''"
        :degraded="degraded"
        degraded-message="部分指标可能不完整（HA 或 Redis 未就绪）"
        tone="emerald"
        @retry="retry()"
      >
        <div class="sys-row">
          <span class="sys-label">CPU</span>
          <div class="sys-bar">
            <VProgressBar
              :value="stats.cpu"
              variant="resource"
              :color-value="stats.cpu"
              size="xs"
              auto-glow
            />
          </div>
          <span class="sys-val">{{ stats.cpu }}%</span>
        </div>
        <div class="sys-row">
          <span class="sys-label">{{ '内存' }}</span>
          <div class="sys-bar">
            <VProgressBar
              :value="stats.memory"
              variant="resource"
              :color-value="stats.memory"
              size="xs"
              auto-glow
            />
          </div>
          <span class="sys-val" :title="stats.memoryDetail">{{ stats.memory }}%</span>
        </div>
        <div class="sys-row">
          <span class="sys-label">{{ '数据库' }}</span>
          <span class="sys-val sys-val--sm">{{ stats.dbSize }}</span>
        </div>
        <div class="sys-row">
          <span class="sys-label">{{ '运行' }}</span>
          <span class="sys-val sys-val--sm">{{ stats.uptime }}</span>
        </div>
        <div class="sys-row">
          <span class="sys-label">{{ '版本' }}</span>
          <span class="sys-val sys-val--sm text-white/30">{{ stats.version }}</span>
        </div>
        <div v-if="diag" class="sys-chips">
          <span :class="['sys-chip', diag.ha?.connected ? 'sys-chip--ok' : 'sys-chip--bad']"
            >HA {{ diag.ha?.connected ? '在线' : '离线' }}</span
          >
          <span class="sys-chip sys-chip--ok">{{
            `实体 ${diag.entities?.count ?? '—'}`
          }}</span>
          <span
            v-if="diag.redis?.configured"
            :class="['sys-chip', diag.redis?.ok ? 'sys-chip--ok' : 'sys-chip--bad']"
          >
            Redis {{ diag.redis?.ok ? '在线' : '离线' }}
          </span>
          <span class="sys-chip sys-chip--ok">WS {{ diag.websocket?.clients ?? 0 }}</span>
        </div>
      </ApiQueryState>
    </div>
    <button v-if="diag?.copyText" class="sys-copy" :title="'复制诊断'" @click="copyDiag">
      {{ '复制' }}
    </button>
    <button
      type="button"
      class="sys-refresh"
      :aria-label="loading ? '刷新中' : '刷新系统状态'"
      @click="retry()"
    >
      <RefreshCw :class="['w-3 h-3', loading ? 'animate-spin' : '']" />
    </button>
  </div>
</template>

<script setup>
/**
 * @file Monitor.vue
 * @module widgets/system
 * @description 系统监控部件：展示系统信息（版本/运行时间/CPU/内存/磁盘）、
 *              诊断状态与系统健康指标，支持复制系统信息。
 * @dependencies
 *  - vue: watch/computed 响应式与监听
 *  - @lucide/vue: Server / RefreshCw 图标
 *  - @/services/api/system: 系统信息接口
 *  - @/services/notify: 复制通知
 *  - @/components/common/base/VProgressBar.vue: 进度条组件
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/stores/auth.store: 鉴权状态
 *  - @/composables/api/useWidgetApiQuery: Widget 数据查询 composable
 *  - @/composables/settings/useSystemDiagnostics: 系统诊断 composable
 */
import { watch, computed } from 'vue'
import { Server, RefreshCw } from '@lucide/vue'
import { fetchSystemInfo } from '@/services/api/system'
import { copyTextWithNotify } from '@/services/notify'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import { useSystemDiagnostics } from '@/composables/settings/useSystemDiagnostics'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

const authStore = useAuthStore()
const { loadHealth, loadDiagnostics } = useSystemDiagnostics()

const query = useWidgetApiQuery(
  'systemMonitor',
  async () => {
    if (!authStore.isAuthenticated) {
      return { data: null, meta: { reason: 'unauthenticated' } }
    }
    const [health, diagnostics, info] = await Promise.all([
      loadHealth({ force: true }),
      loadDiagnostics({ force: true }),
      fetchSystemInfo().catch(() => null),
    ])
    return {
      data: {
        stats: {
          cpu: health?.cpu || 0,
          memory: health?.memory || 0,
          memoryDetail:
            health?.memoryMb != null && health?.memoryLimitMb != null
              ? `${health.memoryMb} / ${health.memoryLimitMb} MB (RSS ${health.rssMb ?? '—'} MB)`
              : '',
          dbSize: health?.dbSize || '--',
          uptime: health?.uptime || '--',
          version: info?.data?.version || health?.version || '--',
        },
        diag: diagnostics || null,
      },
      meta: {
        degraded: diagnostics?.ha?.connected === false,
        redisReady: diagnostics?.redis?.ok === true,
      },
    }
  },
  30_000,
  {
    panelVisible: () => props.panelVisible,
  },
)

const { loading, error: loadError, degraded, data, retry, execute } = query
const hasData = computed(() => data.value != null)
const stats = computed(
  () =>
    data.value?.stats || {
      cpu: 0,
      memory: 0,
      memoryDetail: '',
      dbSize: '--',
      uptime: '--',
      version: '--',
    },
)
const diag = computed(() => data.value?.diag || null)

async function copyDiag() {
  if (!diag.value?.copyText) return
  await copyTextWithNotify(diag.value.copyText, {
    successMessage: '诊断信息已复制',
    errorMessage: '复制失败',
  })
}

watch(
  () => props.panelVisible,
  (visible) => {
    if (visible) void execute()
  },
  { immediate: true },
)
</script>

<style scoped src="./styles/Monitor.css"></style>
