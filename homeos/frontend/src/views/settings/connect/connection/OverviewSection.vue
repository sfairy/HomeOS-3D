<!--
  ConnectionOverview区域组件
  所属模块：设置 - 连接
  职责：HA 连接总览、流程带与部署提示
-->
<template>
  <SettingsCardIntro
    :icon="PlugZap"
    icon-class="conn-overview-intro__icon"
    orb-class="conn-overview-intro__orb"
    :description="'修改配置将写入数据库并驱动后端 WebSocket 即时重连。请填写本机可访问的 HA 地址（勿用 localhost）。'"
  />

  <SettingsFlowBand
    :steps="connectionFlowSteps"
    class="conn-overview-flow mt-4"
    band-class="conn-flow-band"
    collapsible
    default-collapsed
    toggle-label="流程概览"
    :collapsed-summary="connectionFlowSummary"
  >
    <template #stats>
      <SettingsFlowStat
        v-for="cell in overviewCells"
        :key="cell.key"
        :label="cell.label"
        :value="cell.value"
        :tone="mapStatTone(cell.tone)"
        :val-tone="mapStatTone(cell.tone)"
      />
    </template>
  </SettingsFlowBand>

  <div class="settings-deploy-notes settings-deploy-notes--full mt-2.5">
    <div class="settings-deploy-note settings-deploy-note--emerald">
      <div class="settings-deploy-note__icon">
        <PlugZap class="w-4 h-4" />
      </div>
      <div class="settings-deploy-note__body">
        <p class="settings-deploy-note__title">{{ '局域网 · 单 HA' }}</p>
        <p class="settings-deploy-note__text">
          {{ '仅连接一套 Home Assistant，请填同网段地址（如' }}
          <code>http://192.168.x.x:8123</code
          >{{ '）。可选同机 Redis 以启用能源趋势与缓存；状态见' }}
          <RouterLink :to="SETTINGS_ROUTES.diagnostics()" class="settings-deploy-note__link">
            {{ '运维诊断' }}
          </RouterLink>
          {{ '。' }}
        </p>
      </div>
    </div>
  </div>

  <div v-if="backendReachable === false" class="settings-inline-hints mt-4">
    <div class="settings-inline-hint settings-inline-hint--rose">
      <AlertCircle class="settings-inline-hint__icon" />
      <span>
        {{ 'HomeOS 后端未响应（' }}
        <code class="conn-overview-code">/health</code>
        {{ '）。开发环境请同时运行' }}
        <code class="conn-overview-code">bun run dev:backend</code>
        {{ '（8501）与' }}
        <code class="conn-overview-code">bun run dev:frontend</code>
        {{ '。' }}
      </span>
    </div>
  </div>

  <div
    v-if="
      entitiesStore.entitiesStale ||
      entitiesStore.totalCount > 2000 ||
      (entitiesStore.totalCount > 0 && entitiesStore.totalCount < 100)
    "
    class="settings-inline-hints mt-4"
  >
    <div
      v-if="entitiesStore.entitiesStale"
      class="settings-inline-hint settings-inline-hint--amber"
    >
      <AlertCircle class="settings-inline-hint__icon" />
      <span>{{ '实体数据可能已过期，请确认连接后刷新' }}</span>
    </div>
    <div
      v-if="entitiesStore.totalCount > 2000 && entitiesStore.entityLoadPhase !== 'ready'"
      class="settings-inline-hint settings-inline-hint--indigo"
    >
      <Loader2 class="settings-inline-hint__icon animate-spin" />
      <span>{{
        '大户型实体加载中 {n}%（顶栏进度条）…'.replace(
          '{n}',
          String(entitiesStore.entityLoadProgress),
        )
      }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  PlugZap,
  Database,
  AlertCircle,
  Loader2,
  KeyRound,
  Radio,
  RefreshCw,
  CheckCircle,
} from '@lucide/vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const props = defineProps({
  connectionStatCells: { type: Array, required: true },
  backendReachable: { type: [Boolean, null], default: null },
  entitiesStore: { type: Object, required: true },
})

/** 折叠态旁白：连接状态 + 实体数 */
const connectionFlowSummary = computed(() => {
  const connected = props.entitiesStore.connected
  const n = props.entitiesStore.totalCount || 0
  return `${connected ? '已连接' : '未连接'} · ${n} 实体`
})

/** 概览只展示 HA / 实体两项，避免流程带统计区过挤 */
const overviewCells = computed(() =>
  (props.connectionStatCells || [])
    .filter((c) => c.key === 'ha' || c.key === 'entities')
    .slice(0, 2),
)

const connectionFlowSteps = computed(() => {
  const connected = props.entitiesStore.connected
  return [
    { label: 'HA 地址/令牌', meta: '长效访问令牌', icon: KeyRound, tone: 'in' },
    { label: 'WebSocket', meta: connected ? '已连接' : '待连接', icon: Radio, tone: 'sky' },
    { label: '实体同步', meta: `${props.entitiesStore.totalCount || 0} 个`, icon: RefreshCw, tone: 'mid' },
    { label: 'Redis 缓存', meta: '能源·Pub/Sub', icon: Database, tone: 'exec' },
    { label: '全屋就绪', meta: connected ? '服务运行中' : '等待连接', icon: CheckCircle, tone: 'out' },
  ]
})

function mapStatTone(tone) {
  if (tone === 'emerald' || tone === 'indigo') return 'emerald'
  if (tone === 'amber') return 'amber'
  if (tone === 'rose') return 'rose'
  if (tone === 'violet') return 'accent'
  return 'sky'
}
</script>

<style scoped src="./styles/connection.css"></style>
