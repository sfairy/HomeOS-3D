<!--
组件：MobileHomeView.vue
所属模块：frontend / src / views
职责：移动端「中控首页」——时钟/天气/模式/安防/用电状态条 + 房间入口 +
      快捷状态 + 碟机/温控/热水器三个 HomeKit 风格控件。
数据来源：
  - 房间摘要来自 fetchDbAreas（取前 8 个）；
  - 中控信息（时钟/模式/安防/用电/天气）来自多个 composable；
  - 媒体/热水器实体来自 layout 配置 + 实体域索引兜底。
关键交互：
  - 模式 chip：单模式直接二次确认激活/退出；多模式弹底部 sheet 选择；
  - 房间 chip 跳转到 /m/rooms（带 areaId 时定位详情）；
  - 快捷状态、碟机、温控、热水器均以控件形式嵌入；
  - 天气实体经 domainEntityIndex 取首个 weather 域实体，避免全表扫描。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/MobileHomeView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 移动端 Home：Rooms + QuickActions + Disc/Thermostat/Heater 三控件。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import QuickActionsCard from '@/components/widgets/QuickActionsCard.vue'
import DiscPlayerWidget from '@/views/mobile/components/DiscPlayerWidget.vue'
import AdaptiveThermostatWidget from '@/views/mobile/components/AdaptiveThermostatWidget.vue'
import WaterHeaterGaugeWidget from '@/views/mobile/components/WaterHeaterGaugeWidget.vue'
import SceneManagerDrawer from '@/views/mobile/components/SceneManagerDrawer.vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { getEntityDomain } from '@homeos/shared'
import { fetchDbAreas } from '@/services/api/areas'
import { notifyError } from '@/services/notify'
import { useApiQuery } from '@/composables/api/useApiQuery'
import { usePerfClock } from '@/composables/ui/usePerfClock'
import { formatLocaleDate, formatLocaleTime } from '@/utils/format/locale-format.util'
import { resolveSecurityModeLabel } from '@/utils/security/security-mode-label.util'
import { useHomeModes } from '@/composables/home/useHomeModes'
import { useSecurityPanelStatus } from '@/composables/security/useSecurityPanelStatus'
import { usePowerMeter } from '@/composables/energy/usePowerMeter'
import { weatherStateLabel } from '@/constants/weather-labels'
import { countAliveEntities } from '@/utils/entity/entity-alive.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { activateSceneById, canActivateSceneId } from '@/utils/orchestrator/activate-scene.util'
import { resolveFavoriteSceneIds } from '@/utils/orchestrator/scene-favorites.util'
import { agentPing, type AgentPingResult } from '@/services/api/agent'
import { ChevronRight, Play, ShieldCheck, Sparkles, Zap } from '@lucide/vue'

/** 房间摘要：列表展示所需的最小字段集（id/名/图标/背景/实体引用）。 */
interface AreaSummary {
  id: string
  name: string
  icon: string
  backgroundUrl?: string | null
  entities?: { entityId: string }[]
}

const router = useRouter()
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()
const authStore = useAuthStore()

// —— 场景滑轨与场景管理抽屉 ——
const sceneManagerOpen = ref(false)
const activatingScene = ref('')
const favoriteSceneIds = ref(resolveFavoriteSceneIds(layoutStore.layoutConfig.favoriteSceneIds))

/** 首页滑轨展示的收藏场景：id + 展示名，随 scene 域版本自动刷新 */
const favoriteScenes = computed(() => {
  void entitiesStore.derivedEpoch
  void entitiesStore.getDomainEpoch('scene')
  return favoriteSceneIds.value.map((id) => {
    const entity = entitiesStore.entities[id]
    return { id, name: entity ? getEntityDisplayName(id, entity) : id }
  })
})

/** 收藏清单可能被其他入口（桌面侧栏 / 场景管理抽屉）改动，需同步刷新 */
function refreshFavoriteScenes() {
  favoriteSceneIds.value = resolveFavoriteSceneIds(layoutStore.layoutConfig.favoriteSceneIds)
}

/** 激活场景：沿用桌面收藏行的权限判定与调用链，保证两端行为一致 */
async function onActivateScene(scene: { id: string; name: string }) {
  if (activatingScene.value) return
  const hasHaEntity = !!entitiesStore.entities[scene.id]
  const allowed = authStore.allowedSceneIds || []
  if (
    !canActivateSceneId({
      id: scene.id,
      hasHaEntity,
      canControl: authStore.canControl(scene.id),
      isGuest: authStore.isGuest(),
      allowedSceneIds: allowed,
    })
  ) {
    chrome.notify('当前账号无权限执行场景', 'warning')
    return
  }
  activatingScene.value = scene.id
  try {
    await activateSceneById({
      id: scene.id,
      hasHaEntity,
      canControl: authStore.canControl(scene.id),
      isGuest: authStore.isGuest(),
      allowedSceneIds: allowed,
      callHaScene: (eid) => entitiesStore.callService('scene', 'turn_on', eid, null, false),
    })
    chrome.notify(`已激活场景 ${scene.name}`, 'success')
  } catch (e) {
    notifyError(e, '场景激活失败')
  } finally {
    activatingScene.value = ''
  }
}

// —— AI 管家卡片 ——
// 可见性与 MobileLayout 的悬浮入口保持一致：已认证、非访客、非儿童角色
const canUseAgent = computed(
  () => authStore.isAuthenticated && !authStore.isGuest() && authStore.role !== 'child',
)
const agentPingResult = ref<AgentPingResult | null>(null)
const agentPinging = ref(false)

/**
 * 管家动态状态：检测中 / 未配置 / 在线就绪。
 * 与 AgentChatPalette、设置页「检测状态」同源（provider + ready），三处口径一致。
 */
const agentStatusText = computed(() => {
  if (agentPinging.value && !agentPingResult.value) return '检测中'
  if (!agentPingResult.value) return '状态未知'
  const provider = String(agentPingResult.value.provider || '').toLowerCase()
  const notReady =
    provider === 'mock' || provider === 'unavailable' || agentPingResult.value.ready === false
  return notReady ? '未配置' : '在线就绪'
})
const agentReady = computed(() => agentStatusText.value === '在线就绪')

/** 拉取管家状态：失败按未就绪处理，避免首页卡片卡在「检测中」 */
async function refreshAgentPing() {
  if (!canUseAgent.value) return
  agentPinging.value = true
  try {
    agentPingResult.value = await agentPing()
  } catch {
    agentPingResult.value = { ok: false, provider: 'unknown', ready: false }
  } finally {
    agentPinging.value = false
  }
}

/** 卡片点击：走 chrome store 的共享开关，与悬浮按钮唤起同一对话弹层 */
function openAgentChat() {
  chrome.openAgentChat()
  void refreshAgentPing()
}

onMounted(() => {
  refreshFavoriteScenes()
  window.addEventListener('storage', refreshFavoriteScenes)
  window.addEventListener('homeos-scene-favs-changed', refreshFavoriteScenes)
  void refreshAgentPing()
})
onUnmounted(() => {
  window.removeEventListener('storage', refreshFavoriteScenes)
  window.removeEventListener('homeos-scene-favs-changed', refreshFavoriteScenes)
})

// 房间摘要：一次性加载前 8 个（loading/错误态由 useApiQuery 统一管理）
const areasQuery = useApiQuery(async () => {
  const { data } = await fetchDbAreas<AreaSummary[]>()
  return { data: Array.isArray(data) ? data.slice(0, 8) : [] }
})
const areas = computed(() => areasQuery.data.value ?? [])
const areasLoading = computed(() => areasQuery.loading.value)
const areasError = computed(() => areasQuery.error.value != null)

// —— 中控信息 ——
const { now } = usePerfClock()
const { modes, activeMode, acting, activate, deactivate } = useHomeModes()
const { currentMode: securityMode, ready: securityReady } = useSecurityPanelStatus()
const { hasPowerData, elecStats } = usePowerMeter()

const timeText = computed(() => formatLocaleTime(now.value, { hour: '2-digit', minute: '2-digit' }))
const dateText = computed(() => formatLocaleDate(now.value))

const activeModeName = computed(() => activeMode.value?.name || '')

const securityModeLabel = computed(() =>
  resolveSecurityModeLabel(
    securityMode.value,
    (layoutStore.layoutConfig?.securityModes || []) as Array<{ key: string; name?: string }>,
  ),
)

// 用 store 的域索引 + 域版本号替代 Object.keys(entities) 全表扫描：
// getDomainEpoch 建立「仅该域变更时重算」的响应式依赖，domainEntityIndex 免 O(n) 遍历
const weatherEntity = computed(() => {
  entitiesStore.getDomainEpoch('weather')
  const ids = entitiesStore.domainEntityIndex?.get('weather')
  if (ids?.size) {
    for (const eid of ids) {
      const ent = entitiesStore.entities[eid]
      if (ent) return ent as
        | { state?: string; attributes?: Record<string, unknown> }
        | undefined
    }
  }
  return null
})
const weatherText = computed(() => {
  const state = String(weatherEntity.value?.state ?? '')
  return weatherStateLabel(state)
})
const weatherTemp = computed(() => {
  const attrs = weatherEntity.value?.attributes as Record<string, unknown> | undefined
  const t = Number(attrs?.temperature ?? NaN)
  return Number.isFinite(t) ? `${Math.round(t)}°` : ''
})

const modeSheetOpen = ref(false)
/**
 * 模式 chip 点击：已激活则二次确认退出；单模式直接确认激活；
 * 多模式弹底部 sheet 供用户选择。
 */
async function onModeChipClick() {
  if (acting.value) return
  if (activeMode.value) {
    const name = activeModeName.value || '当前模式'
    const ok = await chrome.confirm(`确定退出「${name}」模式？`, '退出家庭模式', {
      type: 'danger',
      confirmText: '退出模式',
    })
    if (!ok) return
    await deactivate()
    return
  }
  if (modes.value.length === 1) {
    const m = modes.value[0]
    const ok = await chrome.confirm(
      `确定激活「${m.name || m.id}」？将按该模式动作联动设备，并保留激活前快照以便退出时还原。`,
      '激活家庭模式',
      { type: 'danger', confirmText: '确认激活' },
    )
    if (!ok) return
    await activate(m.id)
  } else if (modes.value.length > 1) {
    modeSheetOpen.value = true
  }
}
/** 从底部 sheet 选择模式：二次确认后激活并关闭 sheet。 */
async function pickMode(id: string | number) {
  const m = modes.value.find((x) => x.id === id)
  const label = m?.name || String(id)
  const ok = await chrome.confirm(
    `确定激活「${label}」？将按该模式动作联动设备，并保留激活前快照以便退出时还原。`,
    '激活家庭模式',
    { type: 'danger', confirmText: '确认激活' },
  )
  if (!ok) return
  modeSheetOpen.value = false
  await activate(id)
}
/** 跳转到移动端安防页。 */
function goSecurity() {
  void router.push('/m/security')
}

const floors = computed(() => layoutStore.layoutConfig?.floors || [])

/**
 * 手机端快捷状态读取「设置 → 面板部件」中 quickActions 部件的用户配置，
 * 未配置时由 QuickActionsCard 内部回退到默认四按钮，避免两端配置不一致。
 */
const quickActionsConfig = computed(() => {
  const widgets = layoutStore.layoutConfig?.rightPanelWidgets || []
  const qa = widgets.find((w) => w.type === 'quickActions') as
    | { config?: { quickButtons?: string[] } }
    | undefined
  const quickButtons = qa?.config?.quickButtons
  return {
    quickButtons:
      Array.isArray(quickButtons) && quickButtons.length ? [...quickButtons] : undefined,
  }
})

/**
 * 当前楼层绑定的媒体/热水器实体：先从 floor.widgets 找绑定，
 * 未绑定时回退到对应域的首个实体（domainEntityIndex 兜底）。
 */
const floorEntities = computed(() => {
  const floorId = layoutStore.layoutConfig?.activeFloorId
  const floor = floors.value.find((f) => f.id === floorId) || floors.value[0]
  const widgets = floor?.widgets || []
  let media = ''
  let waterHeater = ''
  for (const w of widgets) {
    const id = String((w as { entityId?: string }).entityId || '')
    if (!id) continue
    const domain = getEntityDomain(id)
    if (!media && domain === 'media_player') media = id
    if (!waterHeater && domain === 'water_heater') waterHeater = id
  }
  if (!media) {
    entitiesStore.getDomainEpoch('media_player')
    const mediaIds = entitiesStore.domainEntityIndex?.get('media_player')
    const firstMedia = mediaIds?.size ? mediaIds.values().next().value : ''
    media = firstMedia || ''
  }
  if (!waterHeater) {
    entitiesStore.getDomainEpoch('water_heater')
    const whIds = entitiesStore.domainEntityIndex?.get('water_heater')
    const firstWh = whIds?.size ? whIds.values().next().value : ''
    waterHeater = firstWh || ''
  }
  return { media, waterHeater }
})

const mediaConfig = computed(() => ({
  playerEntities: floorEntities.value.media || '',
}))

const waterEntity = computed(() => {
  const id = floorEntities.value.waterHeater
  return id ? entitiesStore.entities[id] : null
})

// 热水器水位：从属性 max/min/current 计算百分比，缺省回退 30/65
const waterLevel = computed(() => {
  const attrs = (waterEntity.value?.attributes || {}) as Record<string, unknown>
  const current = Number(attrs.current_temperature ?? attrs.temperature ?? 0)
  const max = Number(attrs.max_temp ?? 65) || 65
  const min = Number(attrs.min_temp ?? 30) || 30
  const pct = Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100))
  return { current, pct: Number.isFinite(pct) ? pct : 0 }
})

/** 快捷状态分组点击：打开分组弹层（由 chrome 统一调度）。 */
function onOpenGroup(domain: string, sensors: unknown) {
  chrome.openGroupModal(domain, sensors)
}

/** 打开实体控制弹层。 */
function openEntity(id: string) {
  if (!id) return
  chrome.openEntityControl(id)
}

/** 跳转到房间页：带 areaId 时定位该房间详情。 */
function goRooms(areaId?: string) {
  if (areaId) {
    void router.push({ path: '/m/rooms', query: { areaId } })
    return
  }
  void router.push('/m/rooms')
}
</script>

<template>
  <div class="m-page">
    <header class="m-page__header">
      <div class="m-home-head">
        <div class="m-home-head__clock">
          <p class="m-page__eyebrow">中控</p>
          <h1 class="m-home-head__time">{{ timeText }}</h1>
          <p class="m-home-head__date">{{ dateText }}</p>
        </div>
        <div v-if="weatherEntity" class="m-home-head__weather">
          <p class="m-page__card-label">天气</p>
          <p class="m-home-head__weather-main">{{ weatherText }}</p>
          <p v-if="weatherTemp" class="m-home-head__weather-temp">{{ weatherTemp }}</p>
        </div>
      </div>

      <div v-if="activeModeName || securityReady || hasPowerData" class="m-home-status">
        <button
          v-if="activeModeName || modes.length"
          type="button"
          class="m-home-status__chip"
          :class="{ 'm-home-status__chip--mode': true }"
          @click="onModeChipClick"
        >
          <span class="m-home-status__label">模式</span>
          <span class="m-home-status__value">{{ activeModeName || '未启用' }}{{ acting ? '…' : '' }}</span>
        </button>
        <button
          v-if="securityReady"
          type="button"
          class="m-home-status__chip m-home-status__chip--security"
          @click="goSecurity"
        >
          <ShieldCheck class="m-home-status__icon" />
          <span class="m-home-status__label">安防</span>
          <span class="m-home-status__value">{{ securityModeLabel }}</span>
        </button>
        <div v-if="hasPowerData" class="m-home-status__chip">
          <Zap class="m-home-status__icon" />
          <span class="m-home-status__label">今日用电</span>
          <span class="m-home-status__value">{{ elecStats.dailyNum }} kWh</span>
        </div>
      </div>

      <div v-if="modeSheetOpen" class="m-page__sheet" @click.self="modeSheetOpen = false">
        <div class="m-page__sheet-panel">
          <h2>选择家庭模式</h2>
          <div class="m-home-modes">
            <button
              v-for="m in modes"
              :key="String(m.id)"
              type="button"
              class="m-home-modes__item"
              :class="{ 'm-home-modes__item--on': activeMode?.id === m.id }"
              @click="pickMode(m.id)"
            >
              <span>{{ m.icon || '🏠' }}</span>
              <span>{{ m.name }}</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <section class="m-page__embed">
      <div class="m-home-rooms__title-row">
        <p class="m-page__card-label">房间</p>
        <button type="button" class="m-page__action" @click="goRooms()">全部</button>
      </div>
      <p v-if="areasLoading && !areas.length" class="m-page__hint">加载中…</p>
      <p v-else-if="areasError && !areas.length" class="m-page__hint">
        房间加载失败，点击「全部」重试
      </p>
      <div v-else class="m-home-rooms">
        <button
          v-for="area in areas"
          :key="area.id"
          type="button"
          class="m-home-rooms__chip"
          @click="goRooms(area.id)"
        >
          <span
            v-if="area.backgroundUrl"
            class="m-home-rooms__thumb"
            :style="{ backgroundImage: `url(${area.backgroundUrl})` }"
            aria-hidden="true"
          />
          <span v-else class="m-home-rooms__icon">{{ area.icon || '🏠' }}</span>
          <span class="m-home-rooms__name">{{ area.name }}</span>
          <span class="m-home-rooms__count">{{
            countAliveEntities(area.entities, entitiesStore.entities)
          }}</span>
        </button>
      </div>
    </section>

    <section class="m-page__embed">
      <div class="m-home-rooms__title-row">
        <p class="m-page__card-label">场景</p>
        <button type="button" class="m-page__action" @click="sceneManagerOpen = true">
          场景管理
        </button>
      </div>
      <p v-if="!favoriteScenes.length" class="m-page__hint">
        暂无显示的场景，点「场景管理」选择
      </p>
      <div v-else class="m-scene-rail">
        <button
          v-for="scene in favoriteScenes"
          :key="scene.id"
          type="button"
          class="m-scene-rail__chip"
          :disabled="Boolean(activatingScene)"
          @click="onActivateScene(scene)"
        >
          <Play class="m-scene-rail__icon" aria-hidden="true" />
          <span class="m-scene-rail__name">{{ scene.name }}</span>
        </button>
      </div>
    </section>

    <section v-if="canUseAgent" class="m-page__embed">
      <button type="button" class="m-agent-card" @click="openAgentChat">
        <span class="m-agent-card__icon" aria-hidden="true">
          <Sparkles class="m-agent-card__spark" />
        </span>
        <span class="m-agent-card__text">
          <span class="m-agent-card__title-row">
            <span class="m-agent-card__title">AI 管家</span>
            <span
              class="m-agent-card__status"
              :class="agentReady ? 'm-agent-card__status--ready' : 'm-agent-card__status--off'"
            >
              {{ agentStatusText }}
            </span>
          </span>
          <span class="m-agent-card__desc">
            用一句话控制设备、场景与模式，也可以查询全屋能耗
          </span>
        </span>
        <ChevronRight class="m-agent-card__chevron" aria-hidden="true" />
      </button>
    </section>

    <section class="m-page__embed">
      <p class="m-page__card-label">快捷状态</p>
      <QuickActionsCard :config="quickActionsConfig" @open-group="onOpenGroup" />
    </section>

    <section class="m-page__stack">
      <DiscPlayerWidget :config="mediaConfig" />
      <AdaptiveThermostatWidget />
      <WaterHeaterGaugeWidget
        :entity-id="floorEntities.waterHeater"
        :current="waterLevel.current"
        :pct="waterLevel.pct"
        :bound="Boolean(floorEntities.waterHeater)"
        @open="openEntity(floorEntities.waterHeater)"
      />
    </section>

    <SceneManagerDrawer :open="sceneManagerOpen" @close="sceneManagerOpen = false" />
  </div>
</template>

<style scoped>
.m-home-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.m-home-head__time {
  margin: 0;
  font-size: 40px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: var(--set-text-heading, rgba(243, 244, 246, 0.95));
  font-variant-numeric: tabular-nums;
}

.m-home-head__date {
  margin: 6px 0 0;
  font-size: var(--premium-fs-body-sm);
  font-weight: 600;
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
}

.m-home-head__weather {
  flex-shrink: 1;
  text-align: right;
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  background: rgba(255, 255, 255, 0.05);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.1);
}

.m-home-head__weather-main {
  margin: 4px 0 0;
  font-size: var(--premium-fs-body);
  font-weight: 700;
}

.m-home-head__weather-temp {
  margin: 2px 0 0;
  font-size: var(--premium-fs-micro);
  color: var(--set-text-tertiary);
}

.m-home-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.m-home-status__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font-family: inherit;
  cursor: pointer;
}

.m-home-status__chip--mode {
  border-color: rgba(var(--m-accent-rgb), 0.35);
}

.m-home-status__chip--security {
  border-color: rgba(251, 113, 133, 0.35);
}

.m-home-status__icon {
  width: 16px;
  height: 16px;
  color: rgba(var(--m-accent-rgb), 0.9);
}

.m-home-status__label {
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--set-text-tertiary);
}

.m-home-status__value {
  font-size: var(--premium-fs-body-sm);
  font-weight: 700;
}

.m-home-modes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.m-home-modes__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 10px 14px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font-size: var(--premium-fs-body);
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.m-home-modes__item--on {
  border-color: rgba(var(--m-accent-rgb), 0.55);
  background: rgba(var(--m-accent-rgb), 0.14);
}

/* AI 管家卡片：整卡可点，状态胶囊随 agentPing 结果切换色调 */
.m-agent-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 12px 14px;
  border-radius: var(--hos-radius-panel);
  border: var(--hos-hairline, 1px) solid rgba(var(--m-accent-rgb), 0.32);
  background: linear-gradient(
    135deg,
    rgba(var(--m-accent-rgb), 0.16),
    rgba(var(--m-accent-rgb), 0.05)
  );
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.m-agent-card__icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--hos-radius-card);
  background: rgba(var(--m-accent-rgb), 0.2);
}

.m-agent-card__spark {
  width: 18px;
  height: 18px;
  color: rgba(var(--m-accent-rgb), 0.95);
}

.m-agent-card__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.m-agent-card__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.m-agent-card__title {
  font-size: var(--premium-fs-body);
  font-weight: 800;
}

.m-agent-card__status {
  padding: 1px 8px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid currentColor;
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  line-height: 16px;
}

.m-agent-card__status--ready {
  color: #34d399;
}

.m-agent-card__status--off {
  color: #fbbf24;
}

.m-agent-card__desc {
  font-size: var(--premium-fs-body-sm);
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
  line-height: 1.45;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.m-agent-card__chevron {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: var(--set-text-tertiary);
}

/* 场景滑轨：横向滚动 chip，空态时整段收拢（由 v-if 控制） */
.m-scene-rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.m-scene-rail::-webkit-scrollbar {
  display: none;
}

.m-scene-rail__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-height: 40px;
  max-width: 46vw;
  padding: 8px 14px;
  border-radius: var(--hos-radius-pill);
  border: var(--hos-hairline, 1px) solid rgba(var(--m-accent-rgb), 0.35);
  background: rgba(var(--m-accent-rgb), 0.12);
  color: inherit;
  font-family: inherit;
  font-size: var(--premium-fs-body-sm);
  font-weight: 700;
  cursor: pointer;
}

.m-scene-rail__chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.m-scene-rail__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: rgba(var(--m-accent-rgb), 0.95);
}

.m-scene-rail__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 360px) {
  .m-home-head__time {
    font-size: 32px;
  }
}
</style>
