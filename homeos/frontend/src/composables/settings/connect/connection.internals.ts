/**
 * @file connection.internals.ts
 * @module frontend/src/views
 */
/** composables：合并自连接面板 / 凭证 / 展示 / 实体逻辑 */
import { useSystemDiagnostics } from '@/composables/settings/useSystemDiagnostics'
import { testHaConnection } from '@/services/api/ha'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { formatShortDateTime } from '@/utils/format/locale-format.util'
import { validateHaUrlForDeploy } from '@/utils/ha/url'
import { copyTextWithNotify } from '@/services/notify'
import { buildEntitySyncRecommendations } from '@/utils/recommend/entity-sync-recommend.util'
import { redisHealthViewFromStatus, redisStatusToLabel } from '@/utils/telemetry/redis-status'
import { afterLayoutCancelSync, syncGlobalLayoutPendingSnapshot, useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import { useSettingsHubPending } from '@/composables/settings/pending.internals'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import { useSettingsSave } from '@/composables/settings/hub-ui.internals'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { handleSystemConfigPatchError, patchSystemConfig, useSystemConfig } from '@/composables/config/system-config-core.internals'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// ── useConnectionPanel ──
/** HA/Redis 连接 Tab：聚合 display / credentials / entities 状态，供 Panel 页头保存与 Section 展示共用 */
export function useConnectionPanel(activeTab: () => string) {
  const connTab = ref('credentials')

  const display = useConnectionDisplay()
  const {
    entitiesStore,
    connTabs,
    redisHealth,
    redisLabel,
    redisRefreshError,
    backendReachable,
    haWsModeLabel,
    haWsModeBadgeMod,
    haWsModeDesc,
    connectionStatCells,
    loadHaWsMode,
  } = display

  const credentials = useConnectionCredentials(loadHaWsMode)
  const {
    showTokenInput,
    testing,
    testResult,
    saving,
    saveFeedback,
    pendingChanges,
    pendingLabel,
    snapshotHaConfigFromStore,
    copyHaUrl,
    copyHaFallbackUrl,
    saveAndReconnect,
    testConnection,
    cancelChanges,
  } = credentials

  const entities = useConnectionEntities(loadHaWsMode)
  const {
    syncOnlyEnabledEntities,
    syncFilterSaving,
    syncFilterFeedback,
    refreshingEntities,
    refreshFeedback,
    loadSyncFilterSetting,
    toggleSyncFilter,
    formatCacheTime,
    refreshEntities,
    entitySyncInsight,
    handleEntitySyncBanner,
  } = entities

  useRegisterSettingsTabPending('connection', () => pendingChanges.value > 0)

  const connSections = computed(() => connTabs.value)

  useSettingsHubRouteSection(connTab, connSections, {
    tabId: 'connection',
    activeTab,
  })

  useSettingsSidebarReentryReset(activeTab, 'connection', () => {
    connTab.value = 'credentials'
  })

  onMounted(async () => {
    await loadSyncFilterSetting()
    snapshotHaConfigFromStore()
  })

  return {
    connTab,
    entitiesStore,
    connTabs,
    redisHealth,
    redisLabel,
    redisRefreshError,
    backendReachable,
    haWsModeLabel,
    haWsModeBadgeMod,
    haWsModeDesc,
    connectionStatCells,
    showTokenInput,
    testing,
    testResult,
    saving,
    saveFeedback,
    pendingChanges,
    pendingLabel,
    copyHaUrl,
    copyHaFallbackUrl,
    saveAndReconnect,
    testConnection,
    syncOnlyEnabledEntities,
    syncFilterSaving,
    syncFilterFeedback,
    refreshingEntities,
    refreshFeedback,
    toggleSyncFilter,
    formatCacheTime,
    refreshEntities,
    entitySyncInsight,
    handleEntitySyncBanner,
    cancelChanges,
  }
}

// ── useConnectionCredentials ──
function useConnectionCredentials(onReconnectSuccess?: () => void | Promise<void>) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()
  const showTokenInput = ref(false)
  const testing = ref(false)
  const testResult = ref<{ ok: boolean; message: string; ha_version?: string } | null>(null)
  const { saving, runSave } = useSettingsSave()
  const saveFeedback = ref<{ ok?: boolean; message: string } | null>(null)
  const initialHaConfig = ref<{ url: string; fallbackUrl: string; token: string } | null>(null)

  let reconnectPollTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectStopped = false
  let reconnectResolve: (() => void) | null = null

  const {
    pendingCount: pendingChanges,
    pendingLabel,
    takeSnapshot: snapshotHaConfig,
    confirmAndRevert,
  } = useSettingsHubPending({
    snapshot: initialHaConfig,
    current: () => ({
      url: layoutStore.layoutConfig.haConfig.url,
      fallbackUrl: layoutStore.layoutConfig.haConfig.fallbackUrl || '',
      token: layoutStore.layoutConfig.haConfig.token,
    }),
    fieldKeys: ['url', 'fallbackUrl', 'token'],
    ready: () => layoutStore.isConfigLoaded,
  })

  function snapshotHaConfigFromStore() {
    snapshotHaConfig({
      url: layoutStore.layoutConfig.haConfig.url,
      fallbackUrl: layoutStore.layoutConfig.haConfig.fallbackUrl || '',
      token: layoutStore.layoutConfig.haConfig.token,
    })
  }

  async function copyHaUrl() {
    await copyTextWithNotify(layoutStore.layoutConfig.haConfig.url, {
      successMessage: 'HA 局域网地址已复制',
      emptyMessage: '暂无 HA 局域网地址可复制',
    })
  }

  async function copyHaFallbackUrl() {
    await copyTextWithNotify(layoutStore.layoutConfig.haConfig.fallbackUrl || '', {
      successMessage: 'HA 外网地址已复制',
      emptyMessage: '暂无 HA 外网地址可复制',
    })
  }

  async function saveAndReconnect() {
    const url = layoutStore.layoutConfig.haConfig.url?.trim()
    const fallbackUrl = layoutStore.layoutConfig.haConfig.fallbackUrl?.trim() || ''
    const token = layoutStore.layoutConfig.haConfig.token?.trim()
    if (!url || !token) {
      saveFeedback.value = { ok: false, message: '请先填写局域网 HA 地址与令牌' }
      return
    }
    const urlErr = validateHaUrlForDeploy(url)
    if (urlErr) {
      saveFeedback.value = { ok: false, message: urlErr }
      return
    }
    if (fallbackUrl) {
      const fallbackErr = validateHaUrlForDeploy(fallbackUrl)
      if (fallbackErr) {
        saveFeedback.value = { ok: false, message: `外网地址：${fallbackErr}` }
        return
      }
    }
    saveFeedback.value = { message: '配置已保存，正在重连…' }
    await runSave(
      async () => {
        layoutStore.layoutConfig.haConfig.fallbackUrl = fallbackUrl
        const ok = await layoutStore.saveConfig(false)
        if (!ok) {
          saveFeedback.value = { ok: false, message: '保存失败，请重试' }
          return
        }
        snapshotHaConfigFromStore()
        syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
        showTokenInput.value = false
        reconnectStopped = false
        for (let i = 0; i < 15; i++) {
          await new Promise<void>((r) => {
            reconnectResolve = r
            reconnectPollTimer = setTimeout(() => {
              reconnectResolve = null
              r()
            }, 1000)
          })
          if (reconnectStopped) return
          if (entitiesStore.connected) {
            saveFeedback.value = {
              ok: true,
              message: `HA 已重新连接（${entitiesStore.totalCount} 个实体）`,
            }
            await onReconnectSuccess?.()
            return
          }
        }
        if (reconnectStopped) return
        saveFeedback.value = {
          ok: false,
          message: '保存成功，但 15 秒内未检测到 HA 连接，请检查地址与令牌',
        }
      },
      {
        onError: (e: unknown) => {
          saveFeedback.value = { ok: false, message: getApiErrorMessage(e, '保存失败') }
        },
      },
    )
  }

  async function testConnection() {
    const url = layoutStore.layoutConfig.haConfig.url?.trim()
    const fallbackUrl = layoutStore.layoutConfig.haConfig.fallbackUrl?.trim() || ''
    const token = layoutStore.layoutConfig.haConfig.token?.trim()
    if (!url) {
      testResult.value = { ok: false, message: '请填写局域网 HA 服务地址' }
      return
    }
    if (!token) {
      testResult.value = { ok: false, message: '请先填写或保留已保存的访问令牌' }
      if (!showTokenInput.value) showTokenInput.value = true
      return
    }
    const urlErr = validateHaUrlForDeploy(url)
    if (urlErr) {
      testResult.value = { ok: false, message: urlErr }
      return
    }
    if (fallbackUrl) {
      const fallbackErr = validateHaUrlForDeploy(fallbackUrl)
      if (fallbackErr) {
        testResult.value = { ok: false, message: `外网地址：${fallbackErr}` }
        return
      }
    }
    testing.value = true
    testResult.value = null
    try {
      // 探测由 HomeOS 后端发起（Docker/容器内视角），不是浏览器本机可达性
      const primary = await testHaConnection({ url, token })
      if (primary.data?.ok) {
        testResult.value = {
          ...primary.data,
          message: primary.data.message
            ? `局域网可达：${primary.data.message}`
            : '局域网地址连接成功',
        }
        return
      }
      const lanFail = primary.data?.message || '失败'
      if (fallbackUrl) {
        const fallback = await testHaConnection({ url: fallbackUrl, token })
        if (fallback.data?.ok) {
          testResult.value = {
            ...fallback.data,
            message: fallback.data.message
              ? `后端无法访问局域网（${lanFail}），外网可达：${fallback.data.message}`
              : `后端无法访问局域网（${lanFail}），外网地址连接成功`,
          }
          return
        }
        testResult.value = {
          ok: false,
          message: `局域网与外网均不可达。局域网：${lanFail}；外网：${fallback.data?.message || '失败'}`,
        }
        return
      }
      testResult.value = primary.data || { ok: false, message: '局域网地址连接失败' }
    } catch (e) {
      testResult.value = {
        ok: false,
        message: getApiErrorMessage(e, '探测失败'),
      }
    } finally {
      testing.value = false
    }
  }

  async function cancelChanges() {
    await confirmAndRevert(
      chrome,
      (baseline) => {
        const b = baseline as { url: string; fallbackUrl?: string; token: string }
        layoutStore.layoutConfig.haConfig.url = b.url
        layoutStore.layoutConfig.haConfig.fallbackUrl = b.fallbackUrl || ''
        layoutStore.layoutConfig.haConfig.token = b.token
        showTokenInput.value = false
        testResult.value = null
        saveFeedback.value = null
        snapshotHaConfigFromStore()
      },
      { onReverted: () => afterLayoutCancelSync(layoutStore.layoutConfig) },
    )
  }

  onBeforeUnmount(() => {
    reconnectStopped = true
    if (reconnectPollTimer) clearTimeout(reconnectPollTimer)
    if (reconnectResolve) reconnectResolve()
  })

  return {
    layoutStore,
    showTokenInput,
    testing,
    testResult,
    saving,
    saveFeedback,
    pendingChanges,
    pendingLabel,
    snapshotHaConfigFromStore,
    copyHaUrl,
    copyHaFallbackUrl,
    saveAndReconnect,
    testConnection,
    cancelChanges,
  }
}

// ── useConnectionDisplay ──
function useConnectionDisplay() {
  const entitiesStore = useEntitiesStore()
  const { loadDiagnostics } = useSystemDiagnostics()
  const redisRefreshError = ref('')
  const backendReachable = ref<boolean | null>(null)
  const haWsMode = ref('standalone')

  async function checkBackendReachable() {
    try {
      const res = await fetch('/health', { method: 'GET', cache: 'no-store' })
      backendReachable.value = res.ok
    } catch {
      backendReachable.value = false
    }
  }

  async function loadHaWsMode() {
    try {
      const data = (await loadDiagnostics()) as { ha?: { wsMode?: string } } | null
      haWsMode.value = data?.ha?.wsMode || 'standalone'
    } catch (e) {
      logger.debug('加载 HA WS 角色失败', (e as { message?: string })?.message || e)
      haWsMode.value = 'standalone'
    }
  }

  async function refreshRedisStatus() {
    if (entitiesStore.redisStatus !== 'unknown') return
    try {
      await entitiesStore.refreshRedisFromHealth()
      redisRefreshError.value = ''
    } catch (e) {
      redisRefreshError.value = getApiErrorMessage(e, 'Redis 状态获取失败')
    }
  }

  onMounted(async () => {
    void checkBackendReachable()
    await refreshRedisStatus()
    await loadHaWsMode()
  })

  const connTabs = computed(() => [
    { id: 'credentials', label: '连接凭证', emoji: '🔑', accent: 'var(--module-accent-connection)' },
    {
      id: 'entities',
      label: '实体同步',
      emoji: '🔄',
      accent: 'var(--module-accent-connection-sub)',
      count: entitiesStore.totalCount || undefined,
    },
    { id: 'redis', label: 'Redis', emoji: '🗄️', accent: 'var(--module-accent-template)' },
    { id: 'advanced', label: '高级', emoji: '⚙️', accent: 'var(--module-accent-automation)' },
  ])

  const redisHealth = computed(() => redisHealthViewFromStatus(entitiesStore.redisStatus))
  const redisLabel = computed(() => redisStatusToLabel(redisHealth.value))

  const haWsModeLabel = computed(() => {
    if (haWsMode.value === 'leader') return 'Leader'
    if (haWsMode.value === 'follower') return 'Follower'
    return 'Standalone'
  })

  const haWsModeBadgeMod = computed(() => {
    if (haWsMode.value === 'leader') return 'leader'
    if (haWsMode.value === 'follower') return 'follower'
    return 'standalone'
  })

  const haWsModeDesc = computed(() => {
    if (haWsMode.value === 'leader') {
      return '本实例维持与 Home Assistant 的 WebSocket 长连接，并向其他实例分发实体状态。'
    }
    if (haWsMode.value === 'follower') {
      return '通过 Leader 获取 HA 状态，本实例不直接连接 HA WebSocket。'
    }
    return '单实例部署，本进程直接连接 HA WebSocket。'
  })

  function formatCacheTime(ts: number | null | undefined) {
    if (!ts) return '—'
    return formatShortDateTime(ts) || '—'
  }

  const connectionStatCells = computed(() => {
    const haTone = entitiesStore.connected ? 'emerald' : 'rose'
    const wsTone =
      haWsMode.value === 'leader' ? 'emerald' : haWsMode.value === 'follower' ? 'amber' : 'slate'
    const redisTone =
      redisRefreshError.value || redisHealth.value.loading
        ? 'slate'
        : !redisHealth.value.configured
          ? 'slate'
          : redisHealth.value.ok
            ? 'indigo'
            : 'amber'

    const cells = [
      {
        key: 'ha',
        label: 'HA 连接状态',
        value: entitiesStore.connected ? '已连接' : '已断开',
        tone: haTone,
      },
      {
        key: 'entities',
        label: '已加载实体数',
        value: '{n} 个'.replace('{n}', String(entitiesStore.totalCount)),
        tone: 'violet',
        mono: true,
      },
      {
        key: 'ws',
        label: 'HA WS 角色',
        value: haWsModeLabel.value,
        tone: wsTone,
      },
      {
        key: 'redis',
        label: 'Redis',
        value: redisRefreshError.value ? '未知' : redisLabel.value,
        title: redisRefreshError.value || undefined,
        tone: redisTone,
      },
    ]
    if (entitiesStore.entitiesCacheHydrated || entitiesStore.entitiesCacheSavedAt) {
      cells.push({
        key: 'cache',
        label: '本地实体缓存',
        value: entitiesStore.entitiesCacheHydrated
          ? 'IndexedDB'
          : formatCacheTime(entitiesStore.entitiesCacheSavedAt),
        tone: 'amber',
      })
    }
    return cells
  })

  return {
    entitiesStore,
    connTabs,
    redisHealth,
    redisLabel,
    redisRefreshError,
    backendReachable,
    haWsModeLabel,
    haWsModeBadgeMod,
    haWsModeDesc,
    connectionStatCells,
    loadHaWsMode,
    refreshRedisStatus,
  }
}

// ── useConnectionEntities ──
function useConnectionEntities(onRefreshSuccess?: () => void | Promise<void>) {
  const entitiesStore = useEntitiesStore()
  const chrome = useChromeStore()
  const { load: loadSystemConfig, getCached } = useSystemConfig()
  const syncOnlyEnabledEntities = ref(true)
  const syncFilterSaving = ref(false)
  const syncFilterFeedback = ref<{ ok?: boolean; message: string } | null>(null)
  const refreshingEntities = ref(false)
  const refreshFeedback = ref<{ ok?: boolean; message: string } | null>(null)

  async function loadSyncFilterSetting() {
    try {
      const cfg = await loadSystemConfig({ force: !getCached() })
      syncOnlyEnabledEntities.value = cfg?.haConnector?.syncOnlyEnabledEntities !== false
    } catch (e) {
      logger.warn('加载实体同步过滤配置失败', e)
      syncFilterFeedback.value = {
        ok: false,
        message: getApiErrorMessage(e, '加载实体同步过滤配置失败'),
      }
    }
  }

  function toggleSyncFilter() {
    if (syncFilterSaving.value) return
    syncOnlyEnabledEntities.value = !syncOnlyEnabledEntities.value
    onSyncFilterToggle()
  }

  async function onSyncFilterToggle() {
    syncFilterSaving.value = true
    syncFilterFeedback.value = { message: '正在保存…' }
    try {
      await patchSystemConfig({
        haConnector: { syncOnlyEnabledEntities: syncOnlyEnabledEntities.value },
      })
      syncFilterFeedback.value = {
        ok: true,
        message: syncOnlyEnabledEntities.value
          ? '已保存；已启用过滤，建议点击「刷新实体」与 HA 对齐'
          : '已保存；关闭过滤后请点击「刷新实体」以拉取全部实体',
      }
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) {
        await loadSyncFilterSetting()
        syncFilterFeedback.value = {
          ok: false,
          message: '配置已被其他终端修改，已重新加载',
        }
        return
      }
      syncFilterFeedback.value = {
        ok: false,
        message: getApiErrorMessage(e, '保存失败'),
      }
      syncOnlyEnabledEntities.value = !syncOnlyEnabledEntities.value
    } finally {
      syncFilterSaving.value = false
    }
  }

  async function refreshEntities() {
    refreshingEntities.value = true
    refreshFeedback.value = { message: '正在从 HA 重新同步实体…' }
    try {
      const result = await entitiesStore.refreshEntitiesFromServer()
      if (result.ok) {
        refreshFeedback.value = {
          ok: true,
          message: result.count > 0 ? `已加载 ${result.count} 个实体` : '已同步，当前 0 个实体',
        }
        await onRefreshSuccess?.()
      } else {
        refreshFeedback.value = { ok: false, message: '刷新失败，请检查 HA 连接或稍后重试' }
      }
    } catch (e) {
      refreshFeedback.value = {
        ok: false,
        message: (e as { message?: string })?.message || '刷新失败',
      }
    } finally {
      refreshingEntities.value = false
    }
  }

  function formatCacheTime(ts: number | null | undefined) {
    if (!ts) return '—'
    return formatShortDateTime(ts) || '—'
  }

  const entitySyncInsight = computed(() =>
    buildEntitySyncRecommendations({
      totalCount: entitiesStore.totalCount,
      syncOnlyEnabledEntities: syncOnlyEnabledEntities.value,
      cacheHydrated: entitiesStore.entitiesCacheHydrated,
    }),
  )

  async function handleEntitySyncBanner(banner: { id: string }) {
    if (banner.id === 'enable-sync-filter' && !syncOnlyEnabledEntities.value) {
      syncOnlyEnabledEntities.value = true
      await onSyncFilterToggle()
    } else if (banner.id === 'refresh-entities') {
      await refreshEntities()
    }
  }

  return {
    entitiesStore,
    syncOnlyEnabledEntities,
    syncFilterSaving,
    syncFilterFeedback,
    refreshingEntities,
    refreshFeedback,
    loadSyncFilterSetting,
    toggleSyncFilter,
    formatCacheTime,
    refreshEntities,
    entitySyncInsight,
    handleEntitySyncBanner,
  }
}

