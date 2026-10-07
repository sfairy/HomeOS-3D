/**
 * @file connection.internals.ts
 * @module frontend/src/views
 */
/** composables：合并自连接面板 / 凭证 / 展示 / 实体逻辑 */
import { useSystemDiagnostics } from '@/composables/settings/useSystemDiagnostics'
import { testHaConnection } from '@/services/api/ha'
import { useEntitiesStore } from '@/stores/entities.store'
import { useHaConnectionStore } from '@/stores/ha-connection.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { formatShortDateTime } from '@/utils/format/locale-format.util'
import { validateHaUrlForDeploy } from '@/utils/ha/url'
import { copyTextWithNotify } from '@/services/notify'
import { buildEntitySyncRecommendations } from '@/utils/recommend/entity-sync-recommend.util'
import { redisHealthViewFromStatus, redisStatusToLabel } from '@/utils/telemetry/redis-status'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
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
    haStore,
    draft,
    draftVerifyTls,
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
    // 连接记录是权威源：先拉一次再建「未保存」基线，否则草稿会比对的空快照。
    await haStore.load()
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
    haStore,
    draft,
    draftVerifyTls,
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
/**
 * HA 连接凭证面板：草稿表单 ↔ `ha_connections` 记录。
 *
 * 单源约定（阶段 3.3）：地址与令牌**只**经 `PUT /ha/connection` 落库，不再写进项目
 * layout。因此这里的「未保存更改」对比的是本地草稿与服务端快照，而不是 layout JSON。
 */
function useConnectionCredentials(onReconnectSuccess?: () => void | Promise<void>) {
  const haStore = useHaConnectionStore()
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()
  const showTokenInput = ref(false)
  const testing = ref(false)
  const testResult = ref<{ ok: boolean; message: string; ha_version?: string } | null>(null)
  const { saving, runSave } = useSettingsSave()
  const saveFeedback = ref<{ ok?: boolean; message: string } | null>(null)

  /** 表单草稿：令牌输入框留空表示「沿用服务端已保存的令牌」。 */
  const draft = ref({ url: '', fallbackUrl: '', token: '' })
  const draftVerifyTls = ref(true)
  const initialHaConfig = ref<unknown>(null)

  let reconnectPollTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectStopped = false
  let reconnectResolve: (() => void) | null = null

  const {
    pendingCount: pendingChanges,
    pendingLabel,
    takeSnapshot: snapshotHaConfig,
    confirmAndRevert,
  } = useSettingsHubPending<unknown>({
    snapshot: initialHaConfig,
    current: () => ({
      url: draft.value.url.trim(),
      fallbackUrl: draft.value.fallbackUrl.trim(),
      token: draft.value.token.trim(),
    }),
    fieldKeys: ['url', 'fallbackUrl', 'token'],
    ready: () => haStore.loaded,
  })

  /** 用服务端快照重置草稿与「未保存」基线。 */
  function snapshotHaConfigFromStore() {
    const status = haStore.status
    draft.value = {
      url: status?.baseUrl || '',
      fallbackUrl: status?.externalBaseUrl || '',
      token: '',
    }
    draftVerifyTls.value = status?.verifyTls !== false
    showTokenInput.value = !status?.hasToken
    snapshotHaConfig({
      url: draft.value.url.trim(),
      fallbackUrl: draft.value.fallbackUrl.trim(),
      token: '',
    })
  }

  async function copyHaUrl() {
    await copyTextWithNotify(draft.value.url, {
      successMessage: 'HA 局域网地址已复制',
      emptyMessage: '暂无 HA 局域网地址可复制',
    })
  }

  async function copyHaFallbackUrl() {
    await copyTextWithNotify(draft.value.fallbackUrl, {
      successMessage: 'HA 外网地址已复制',
      emptyMessage: '暂无 HA 外网地址可复制',
    })
  }

  /** 校验表单地址；返回错误文案，通过则返回 null。 */
  function validateDraft(): string | null {
    if (!draft.value.url.trim()) return '请先填写局域网 HA 地址'
    const urlErr = validateHaUrlForDeploy(draft.value.url.trim())
    if (urlErr) return urlErr
    if (draft.value.fallbackUrl.trim()) {
      const fallbackErr = validateHaUrlForDeploy(draft.value.fallbackUrl.trim())
      if (fallbackErr) return `外网地址：${fallbackErr}`
    }
    if (!haStore.hasToken && !draft.value.token.trim()) return '请先填写 HA 访问令牌'
    return null
  }

  /** 收窄后的保存载荷：令牌留空表示沿用服务端已保存的令牌。 */
  function buildPayload(reuseToken = false) {
    return {
      baseUrl: draft.value.url.trim(),
      externalBaseUrl: draft.value.fallbackUrl.trim() || null,
      accessToken: draft.value.token.trim() || null,
      verifyTls: draftVerifyTls.value,
      reuseTokenForNewUrl: reuseToken,
    }
  }

  /** 后端要求显式确认「地址变了仍复用旧令牌」时，弹确认后重发。 */
  function isTokenReuseConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
    return Boolean(
      detail &&
        typeof detail === 'object' &&
        (detail as { code?: string }).code === 'HA_URL_CHANGED_TOKEN_REUSE',
    )
  }

  async function saveAndReconnect() {
    const invalid = validateDraft()
    if (invalid) {
      saveFeedback.value = { ok: false, message: invalid }
      return
    }
    saveFeedback.value = { message: '配置已保存，正在重连…' }
    await runSave(
      async () => {
        let saved
        try {
          saved = await haStore.save(buildPayload())
        } catch (error) {
          if (!isTokenReuseConflict(error)) throw error
          const reuse = await chrome.confirm(
            'HA 地址已变更：确认继续沿用已保存的访问令牌？仅在新地址可信时这么做。',
            '地址已变更',
            { type: 'danger', confirmText: '沿用令牌', cancelText: '取消' },
          )
          if (!reuse) {
            saveFeedback.value = { ok: false, message: '已取消保存：请重新输入新地址对应的令牌' }
            return
          }
          saved = await haStore.save(buildPayload(true))
        }
        // 令牌已交给服务端，草稿里不再保留明文。
        draft.value.token = ''
        snapshotHaConfigFromStore()
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
          message: `保存成功，但 15 秒内未检测到 HA 连接，请检查地址与令牌${
            saved?.lastError ? `（${saved.lastError}）` : ''
          }`,
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
    const invalid = validateDraft()
    if (invalid) {
      testResult.value = { ok: false, message: invalid }
      if (!haStore.hasToken) showTokenInput.value = true
      return
    }
    testing.value = true
    testResult.value = null
    try {
      // 探测由 HomeOS 后端发起（Docker/容器内视角），不是浏览器本机可达性。
      // 后端会自行对局域网/外网两路各测一次，并把需要换地址续试的提示写进 lastError。
      const { data } = await testHaConnection(buildPayload())
      const failed = (data.endpoints || []).filter((item) => !item.ok)
      testResult.value = {
        ok: Boolean(data.ok),
        message: data.ok
          ? data.version
            ? `连接成功：HA ${data.version}`
            : '连接成功'
          : `地址不可达：${failed.map((item) => `${item.label}（${item.baseUrl}）`).join('；') || '请检查地址与网络'}`,
        ha_version: data.version || undefined,
      }
    } catch (e) {
      testResult.value = { ok: false, message: getApiErrorMessage(e, '探测失败') }
    } finally {
      testing.value = false
    }
  }

  async function cancelChanges() {
    await confirmAndRevert(
      chrome,
      () => {
        snapshotHaConfigFromStore()
        testResult.value = null
        saveFeedback.value = null
      },
      { title: '放弃更改' },
    )
  }

  onBeforeUnmount(() => {
    reconnectStopped = true
    if (reconnectPollTimer) clearTimeout(reconnectPollTimer)
    if (reconnectResolve) reconnectResolve()
  })

  return {
    haStore,
    draft,
    draftVerifyTls,
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

