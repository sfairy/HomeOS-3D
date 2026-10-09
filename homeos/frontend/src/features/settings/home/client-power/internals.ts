/**
 * @file client-power.internals.ts
 * @module frontend/src/features/settings/home/client-power
 * 职责：客户端智能充放电面板的内部 composables。聚合系统配置读写、待保存快照、状态轮询、
 *       待配对终端发现/清除、电池与设备信息派生逻辑，供 SettingsClientPowerPanel 与子 Section 复用。
 * 关键依赖：
 *   - useSettingsHubPending / useRegisterSettingsTabPending：待保存快照与 Tab 级离开拦截
 *   - useSystemConfig / patchSystemConfig：系统配置读写
 *   - fetchClientPowerStatus / dismissClientPowerPending / dismissClientPowerOffline：客户端电源 API
 *   - schedulePoll：统一轮询调度（页面隐藏时自动暂停）
 *   - settings-client-power-display.util：展示派生工具函数
 */
/** composables：合并自客户端电源配置 / 面板 / 展示 */
import { useRegisterSettingsTabPending, useSettingsHubPending } from '@/features/settings/composables/pending.internals'
import { handleSystemConfigPatchError, patchSystemConfig, useSystemConfig } from '@/composables/config/system-config-core.internals'
import { dismissClientPowerOffline, dismissClientPowerPending, fetchClientPowerStatus } from '@/services/api/system'
import { useChromeStore } from '@/stores/chrome.store'
import type { ClientPowerClient, ClientPowerPendingClient, ClientPowerSettings, ClientPowerStatusSnapshot } from '@/types/client-power'
import type { SystemConfig } from '@/types/system-config'
import { normalizeBatteryPercent } from '@/utils/client/power-battery-display.util'
import { getClientBatteryState, getClientDeviceKind, getClientSuggestedLabel, getClientSystemSpecChips, getLocalBatteryUnsupportedHint, getSystemInfoFromClientRow } from '@/utils/client/system-display.util'
import { getClientDeviceId } from '@/utils/client/system.util'
import { reloadFrontendConfig } from '@/utils/config/frontend-config'
import { copyTextWithNotify } from '@/services/notify'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { buildClientCardTitle, buildClientStatusMap, buildPendingCardTitle, clientNeedsChargerSwitch, clientSelfChargeThresholdInvalid, resolveClientLiveRow } from '@/features/settings/home/settings-client-power-display.util'
import {
  buildClientPowerWakePublic,
  DEFAULT_CLIENT_POWER_SELF_CHARGE,
  DEFAULT_CLIENT_POWER_SETTINGS,
  resolveChargerSwitchWakeForDevice,
} from '@homeos/shared'
import type { Ref } from 'vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { schedulePoll } from '@/utils/core/poll-scheduler'

// ── useClientPowerConfig ──
// 滞回充电默认阈值（20% 开充电 / 80% 关充电，关闭峰谷错峰，应急阈值 15%）来自共享契约
function defaultSelfCharge() {
  return { ...DEFAULT_CLIENT_POWER_SELF_CHARGE }
}

// 创建空白终端配置（仅含默认开关与滞回阈值）
function createEmptyClientConfig(id = ''): ClientPowerClient {
  return {
    id,
    label: '',
    chargerSwitchEntityId: '',
    presenceWakeEnabled: true,
    enabled: true,
    selfCharge: defaultSelfCharge(),
  }
}

// 展开被截断的终端标签（「前缀…· 后缀」+ id → 「前缀 · id」）
function expandTruncatedClientLabel(client: ClientPowerClient): ClientPowerClient {
  const label = String(client.label || '').trim()
  const id = String(client.id || '').trim()
  if (!label.includes('…') || !label.includes('·') || !id) return client
  return { ...client, label: `${label.split('·')[0].trim()} · ${id}` }
}

function parsePercent(val: unknown, fallback: number): number {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

// 归一化单个终端配置：缺失字段回退默认，非法数值兜底
function normalizeClient(item: unknown): ClientPowerClient {
  if (!item || typeof item !== 'object') return createEmptyClientConfig()
  const row = item as Record<string, unknown>
  const selfCharge =
    row.selfCharge && typeof row.selfCharge === 'object'
      ? (row.selfCharge as Record<string, unknown>)
      : {}
  return expandTruncatedClientLabel({
    id: String(row.id || '').trim(),
    label: String(row.label || '').trim(),
    chargerSwitchEntityId: String(row.chargerSwitchEntityId || '').trim(),
    presenceWakeEnabled: row.presenceWakeEnabled !== false,
    enabled: row.enabled !== false,
    selfCharge: {
      enabled: selfCharge.enabled !== false,
      lowPercent: parsePercent(selfCharge.lowPercent, DEFAULT_CLIENT_POWER_SELF_CHARGE.lowPercent),
      highPercent: parsePercent(selfCharge.highPercent, DEFAULT_CLIENT_POWER_SELF_CHARGE.highPercent),
      touEnabled: selfCharge.touEnabled === true,
      criticalPercent: parsePercent(
        selfCharge.criticalPercent,
        DEFAULT_CLIENT_POWER_SELF_CHARGE.criticalPercent ?? 0,
      ),
    },
  })
}

// 归一化整组配置：从 SystemConfig.clientPower 提取并补齐缺失参数
function normalizeConfig(
  raw: SystemConfig | Record<string, unknown> | null | undefined,
): ClientPowerSettings {
  const cp = (
    raw && typeof raw === 'object' && raw.clientPower && typeof raw.clientPower === 'object'
      ? raw.clientPower
      : {}
  ) as Record<string, unknown>
  return {
    enabled: cp.enabled === true,
    reportIntervalSec:
      Number(cp.reportIntervalSec) || DEFAULT_CLIENT_POWER_SETTINGS.reportIntervalSec,
    staleTimeoutSec: Number(cp.staleTimeoutSec) || DEFAULT_CLIENT_POWER_SETTINGS.staleTimeoutSec,
    cooldownMin: Number(cp.cooldownMin) || DEFAULT_CLIENT_POWER_SETTINGS.cooldownMin,
    linkageRetryCount:
      Number(cp.linkageRetryCount) || DEFAULT_CLIENT_POWER_SETTINGS.linkageRetryCount,
    linkageRetryDelayMs:
      Number(cp.linkageRetryDelayMs) || DEFAULT_CLIENT_POWER_SETTINGS.linkageRetryDelayMs,
    clients: Array.isArray(cp.clients) ? cp.clients.map(normalizeClient).filter((c) => c.id) : [],
  }
}

// 客户端电源配置 composable：负责配置加载、保存、快照与待配对终端管理
function useClientPowerConfig() {
  const chrome = useChromeStore()
  const { load: loadSystemConfig } = useSystemConfig()
  const loading = ref(false)
  const saving = ref(false)
  const statusLoading = ref(false)
  const config = ref<ClientPowerSettings>(normalizeConfig(null))
  const status = ref<ClientPowerStatusSnapshot | null>(null)
  const pending = ref<ClientPowerPendingClient[]>([])
  const initialClientPowerSnapshot = ref<string | null>(null)

  const {
    pendingCount: clientPowerPendingCount,
    takeSnapshot: snapshotClientPower,
    confirmAndRevert,
  } = useSettingsHubPending({
    snapshot: initialClientPowerSnapshot,
    current: () => config.value,
  })

  // 对当前配置生成快照（用于待保存计数与回退基线）
  function snapshotClientPowerConfig() {
    snapshotClientPower(config.value)
  }

  // 刷新客户端实时状态：在线情况、待配对终端等（silent=true 时不弹错误）
  async function refreshStatus(options: { silent?: boolean } = {}) {
    statusLoading.value = true
    try {
      const { data } = await fetchClientPowerStatus<ClientPowerStatusSnapshot>()
      status.value = data
      pending.value = data?.pending || []
    } catch (e) {
      logger.warn('刷新客户端电源状态失败', e)
      if (!options.silent) {
        chrome.notify(getApiErrorMessage(e, '刷新客户端电源状态失败'), 'error')
      }
    } finally {
      statusLoading.value = false
    }
  }

  let clientPowerLoaded = false

  // 刷新整组配置：首次加载显示 loading，后续静默刷新；加载完成后更新快照与状态
  async function refresh(options: { silent?: boolean } = {}) {
    const showLoading = !options.silent && !clientPowerLoaded
    if (showLoading) loading.value = true
    try {
      const cfg = await loadSystemConfig({ force: true })
      config.value = normalizeConfig(cfg as SystemConfig | null)
      snapshotClientPowerConfig()
      await refreshStatus()
      clientPowerLoaded = true
    } catch (e) {
      logger.warn('刷新客户端电源配置失败', e)
      if (showLoading || !clientPowerLoaded) {
        chrome.notify(getApiErrorMessage(e, '加载失败'), 'error')
      }
    } finally {
      if (showLoading) loading.value = false
    }
  }

  // 取消未保存改动：确认后用基线快照回退配置
  async function cancelChanges() {
    await confirmAndRevert(chrome, (baseline) => {
      config.value = normalizeConfig({ clientPower: baseline })
    })
  }

  // 保存配置：先校验名称完整、滞回阈值合法，再 patchSystemConfig；成功后刷新前端配置与状态
  async function save() {
    saving.value = true
    try {
      const allClients = config.value.clients.map(normalizeClient).filter((c) => c.id)
      const unlabeled = allClients.filter((c) => !c.label)
      if (unlabeled.length) {
        chrome.notify(`有 ${unlabeled.length} 个终端未填写名称，请补全后再保存`, 'warning')
        return false
      }
      const clients = allClients.filter((c) => c.id && c.label)
      const badThreshold = clients.find(
        (c) => (c.selfCharge?.lowPercent ?? 20) >= (c.selfCharge?.highPercent ?? 80),
      )
      if (badThreshold) {
        chrome.notify(`「${badThreshold.label}」的低电量阈值须小于高电量阈值`, 'error')
        return false
      }
      const badCritical = clients.find(
        (c) =>
          c.selfCharge?.touEnabled &&
          (c.selfCharge?.criticalPercent ?? 15) >= (c.selfCharge?.lowPercent ?? 20),
      )
      if (badCritical) {
        chrome.notify(`「${badCritical.label}」的应急充电阈值须小于低电量阈值`, 'error')
        return false
      }
      const payload: Record<string, unknown> = {
        clientPower: {
          enabled: config.value.enabled,
          reportIntervalSec: config.value.reportIntervalSec,
          staleTimeoutSec: config.value.staleTimeoutSec,
          cooldownMin: config.value.cooldownMin,
          linkageRetryCount: config.value.linkageRetryCount,
          linkageRetryDelayMs: config.value.linkageRetryDelayMs,
          clients,
        },
      }
      await patchSystemConfig(payload)
      chrome.notify('智能充放电配置已保存', 'success')
      snapshotClientPowerConfig()
      await refreshStatus()
      void reloadFrontendConfig().catch((err) => logger.debug('充放电配置保存后刷新配置失败', err))
      return true
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) return false
      logger.warn('保存客户端电源配置失败', e)
      chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
      return false
    } finally {
      saving.value = false
    }
  }

  // 从待配对列表添加终端到策略列表：去重，并基于系统信息生成建议名称
  function addClientFromPending(p: ClientPowerPendingClient) {
    if (!p?.clientId) return
    const exists = config.value.clients.some((c) => c.id === p.clientId)
    if (exists) {
      chrome.notify('该终端已在策略列表中', 'info')
      return
    }
    const sysInfo = getSystemInfoFromClientRow(p)
    const label = getClientSuggestedLabel(sysInfo, p.clientId)
    config.value.clients.push({
      ...createEmptyClientConfig(p.clientId),
      label,
    })
    chrome.notify('已添加至策略列表，保存配置后生效', 'success')
  }

  // 移除已配置终端策略：二次确认后从列表删除（保存后才会写回后端）
  async function removeClient(idx: number) {
    const client = config.value.clients[idx]
    if (!client) return
    const name = client.label || client.id || '该终端'
    const ok = await chrome.confirm(
      `确定移除「${name}」的充放电策略？保存后终端将回到待配对列表。`,
      '移除策略',
      { confirmText: '移除', type: 'danger' },
    )
    if (!ok) return
    config.value.clients.splice(idx, 1)
  }

  // 添加一台空白终端策略（待用户手动填写 id 与字段）
  function addEmptyClient() {
    config.value.clients.push(createEmptyClientConfig())
  }

  /** 清除离线待配对终端的发现记录（仅离线终端可清除，在线会在下次心跳重现） */
  async function dismissPendingRecord(
    clientId: string,
  ): Promise<{ dismissed: boolean; reason?: string }> {
    const id = String(clientId || '').trim()
    if (!id) return { dismissed: false, reason: 'invalid' }
    const { data } = await dismissClientPowerPending({ clientId: id })
    return data ?? { dismissed: false }
  }

  async function dismissPending(p: ClientPowerPendingClient, displayName?: string) {
    if (!p?.clientId) return
    const name = displayName || p.clientId
    const ok = await chrome.confirm(
      `确定清除离线终端「${name}」的发现记录？该终端再次上报时会重新出现。`,
      '清除待配对',
      { confirmText: '清除', type: 'danger' },
    )
    if (!ok) return
    try {
      const data = await dismissPendingRecord(p.clientId)
      if (data.dismissed === false) {
        const reasonMap = {
          online: '终端仍在线，无法清除',
          configured: '终端已配对，请先移除其策略',
          not_found: '未找到该待配对记录',
          invalid: '终端 ID 无效',
        }
        chrome.notify(
          (reasonMap as Record<string, string>)[data.reason ?? ''] || '清除失败',
          'info',
        )
        await refreshStatus()
        return
      }
      pending.value = pending.value.filter((x) => x.clientId !== p.clientId)
      chrome.notify('已清除该终端的发现记录', 'success')
      await refreshStatus()
    } catch (e) {
      logger.warn('忽略待处理客户端失败', e)
      chrome.notify(getApiErrorMessage(e, '清除失败'), 'error')
    }
  }

  /** 批量清除所有离线待配对终端的发现记录 */
  async function dismissAllOfflinePending(offlineClients: ClientPowerPendingClient[]) {
    if (!offlineClients.length) return
    const ok = await chrome.confirm(
      `确定清除 ${offlineClients.length} 台离线待配对终端的发现记录？这些终端再次上报时会重新出现。`,
      '清除全部离线',
      { confirmText: '全部清除', type: 'danger' },
    )
    if (!ok) return
    try {
      let dismissedIds: string[] = []
      try {
        const { data } = await dismissClientPowerOffline({})
        dismissedIds = data?.clientIds || []
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status
        if (status !== 404) throw e
        for (const p of offlineClients) {
          const result = await dismissPendingRecord(p.clientId)
          if (result.dismissed) dismissedIds.push(p.clientId)
        }
      }
      const dismissedSet = new Set(dismissedIds)
      const n = dismissedSet.size
      if (n > 0) {
        pending.value = pending.value.filter((p) => !dismissedSet.has(p.clientId))
        chrome.notify(`已清除 ${n} 台离线终端的发现记录`, 'success')
      } else {
        chrome.notify('没有可清除的离线终端', 'info')
      }
      await refreshStatus()
    } catch (e) {
      logger.warn('批量清除离线待配对终端失败', e)
      chrome.notify(getApiErrorMessage(e, '清除失败'), 'error')
    }
  }

  return {
    loading,
    saving,
    statusLoading,
    config,
    status,
    pending,
    clientPowerPendingCount,
    refresh,
    refreshStatus,
    save,
    cancelChanges,
    addClientFromPending,
    removeClient,
    addEmptyClient,
    dismissPending,
    dismissAllOfflinePending,
  }
}

// ── useClientPowerPanel ──
/** 智能充电 Tab 入口 composable：聚合配置与展示状态，供 Panel 页头保存与 Section 共用。
 *  内部注册 Tab 级离开拦截，并自动启动 20s 状态轮询。 */
export function useClientPowerPanel() {
  const chrome = useChromeStore()

  const configState = useClientPowerConfig()
  const {
    loading,
    saving,
    statusLoading,
    config,
    status,
    pending,
    refresh,
    refreshStatus,
    save,
    addClientFromPending,
    removeClient,
    addEmptyClient,
    dismissPending,
    dismissAllOfflinePending,
    clientPowerPendingCount,
    cancelChanges,
  } = configState

  useRegisterSettingsTabPending('smart-charge', () => clientPowerPendingCount.value > 0)

  const displayDeps = {
    config,
    status,
    pending,
    refreshStatus,
  } as ClientPowerDisplayDeps

  const displayState = useClientPowerDisplay(displayDeps)

  refresh()

  return {
    chrome,
    loading,
    saving,
    statusLoading,
    config,
    status,
    pending,
    refresh,
    refreshStatus,
    save,
    addClientFromPending,
    removeClient,
    addEmptyClient,
    dismissPending,
    dismissAllOfflinePending,
    clientPowerPendingCount,
    cancelChanges,
    ...displayState,
  }
}

// ── useClientPowerDisplay ──
// 展示依赖：注入 config/status/pending/refreshStatus，便于解耦测试
interface ClientPowerDisplayDeps {
  config: Ref<{
    enabled: boolean
    clients: Array<{
      id: string
      enabled?: boolean
      label?: string
      chargerSwitchEntityId?: string
      presenceWakeEnabled?: boolean
      selfCharge?: { enabled?: boolean }
    }>
  }>
  status: Ref<{
    clients?: Array<{ clientId: string; online?: boolean; pending?: boolean }>
  } | null>
  pending: Ref<Array<{ clientId: string; online?: boolean }>>
  refreshStatus: (options?: { silent?: boolean }) => void | Promise<void>
}

// 客户端电源展示 composable：派生本地与全局的统计/标题/电量/规格等信息
function useClientPowerDisplay(deps: ClientPowerDisplayDeps) {
  const { config, status, pending, refreshStatus } = deps

  // 本机设备 ID 与电量读取不支持提示（非 HTTPS / 非安全上下文）
  const localClientId = getClientDeviceId()
  const localBatteryHint = computed(() => getLocalBatteryUnsupportedHint())
  const localNeedsHttpsForBattery = computed(() => {
    if (typeof window === 'undefined') return false
    return !window.isSecureContext
  })

  // 本机 ID 与已配置人来亮屏终端不一致时的提示（单机可回退；多机需从待配对添加）
  const presenceWakeLocalHint = computed(() => {
    const wake = buildClientPowerWakePublic(config.value)
    const { kind } = resolveChargerSwitchWakeForDevice(wake, localClientId)
    if (kind === 'single_client_fallback') return '本机未匹配，已回退到唯一终端'
    if (kind === 'unmatched' && wake.clients.length > 0) return '请从待配对添加本机'
    return ''
  })

  // 实时在线客户端列表与 clientId → 行数据索引
  const liveClients = computed(() => status.value?.clients || [])
  const clientStatusMap = computed(() => buildClientStatusMap(liveClients.value))

  // 统计指标：已注册 / 已启用 / 在线 / 待配对数量
  const registeredCount = computed(() => config.value.clients.length)
  const enabledCount = computed(
    () => config.value.clients.filter((c) => c.enabled && c.selfCharge?.enabled !== false).length,
  )
  const onlineCount = computed(() => liveClients.value.filter((c) => c.online && !c.pending).length)
  const pendingCount = computed(() => pending.value.length)
  const policyCount = computed(() => config.value.clients.length)

  // 取已配置终端的实时行（按 client.id 查 Map）
  function clientLiveRow(client: { id: string }) {
    return resolveClientLiveRow(client, clientStatusMap.value)
  }

  // 取待配对终端的实时行（按 clientId 查 Map）
  function pendingLiveRow(p: { clientId: string }) {
    return clientStatusMap.value[p.clientId] || null
  }

  // 待配对终端电量读取行：优先实时行，否则回退原始待配对对象
  function pendingBatteryRow(p: { clientId: string }) {
    return pendingLiveRow(p) || p
  }

  // 生成待配对终端卡片标题
  function pendingCardTitle(p: { clientId?: string; systemInfo?: unknown }) {
    return buildPendingCardTitle(p)
  }

  /** 待配对终端当前是否离线（无实时行或行标记离线）——离线才允许清除发现记录 */
  function pendingOffline(p: { clientId: string }) {
    const row = pendingLiveRow(p) as { online?: boolean } | null
    return !row || !row.online
  }

  // 离线待配对终端总数（仅离线可清除）
  const pendingOfflineCount = computed(() => pending.value.filter((p) => pendingOffline(p)).length)

  // 已启用但未绑定充电器 Switch 实体
  function clientNeedsSwitch(client: { enabled?: boolean; chargerSwitchEntityId?: string }) {
    return clientNeedsChargerSwitch(client)
  }

  // 滞回阈值是否无效（低 >= 高）
  function clientThresholdInvalid(client: {
    selfCharge?: { lowPercent?: number; highPercent?: number }
  }) {
    return clientSelfChargeThresholdInvalid(client)
  }

  // 从行数据读取系统信息
  function systemInfoOf(row: unknown) {
    return getSystemInfoFromClientRow(row)
  }

  // 从行数据读取设备类型（desktop/tablet/phone）
  function deviceKind(row: unknown) {
    return getClientDeviceKind(systemInfoOf(row))
  }

  // 已配置终端的设备类型（无实时行回退 desktop）
  function deviceKindForClient(client: { id: string }) {
    const row = clientLiveRow(client)
    return row ? deviceKind(row) : 'desktop'
  }

  // 已配置终端的卡片标题
  function clientCardTitle(client: { id?: string; label?: string }) {
    return buildClientCardTitle(client, clientLiveRow(client as { id: string }))
  }

  // 行数据的系统规格 chip 列表（CPU/内存等）
  function specChips(row: unknown) {
    return getClientSystemSpecChips(systemInfoOf(row))
  }

  // 行数据的电池状态：是否支持、百分比、是否充电中
  function batteryState(row: unknown) {
    if (!row) return { supported: false, percent: null, charging: null }
    return getClientBatteryState(systemInfoOf(row))
  }

  // 复制终端 ID 到剪贴板并提示
  async function copyClientId(clientId: string) {
    if (!clientId) return
    await copyTextWithNotify(clientId, {
      successMessage: '终端 ID 已复制',
      errorMessage: '复制失败，请手动选择复制',
    })
  }

  // 归一化行数据的电量百分比
  function batteryPercent(row: unknown) {
    return normalizeBatteryPercent(row as Parameters<typeof normalizeBatteryPercent>[0])
  }

  let statusPollCancel: (() => void) | null = null

  // 启动状态轮询：20s 一次静默刷新
  function startStatusPoll() {
    stopStatusPoll()
    // 经全局调度器轮询：页面隐藏时由调度器统一暂停，恢复可见时立即刷新
    statusPollCancel = schedulePoll(
      'client-power:status-poll',
      () => {
        void refreshStatus({ silent: true })
      },
      20_000,
    )
  }

  // 停止状态轮询
  function stopStatusPoll() {
    if (statusPollCancel) {
      statusPollCancel()
      statusPollCancel = null
    }
  }

  onMounted(startStatusPoll)
  onUnmounted(stopStatusPoll)

  return {
    localClientId,
    localBatteryHint,
    localNeedsHttpsForBattery,
    presenceWakeLocalHint,
    registeredCount,
    enabledCount,
    onlineCount,
    pendingCount,
    policyCount,
    clientLiveRow,
    pendingLiveRow,
    pendingBatteryRow,
    pendingCardTitle,
    pendingOffline,
    pendingOfflineCount,
    clientNeedsSwitch,
    clientThresholdInvalid,
    deviceKind,
    deviceKindForClient,
    clientCardTitle,
    specChips,
    batteryState,
    batteryPercent,
    copyClientId,
  }
}
