/**
 * @file 主布局壳层 Composable
 * @module composables/ui/useMainLayoutChrome
 *
 * 职责：
 *  - 聚合主布局壳层所需的全部状态与操作：导航菜单、HA 连接状态、儿童模式、门铃、天气导航。
 *  - 提供全屋关闭、HA 重连、设置锁、升级备份提醒等功能。
 *  - 暴露 lucide 图标组件供模板使用。
 *
 * 依赖：
 *  - vue 的 computed / ref / watch。
 *  - vue-router 的 useRouter / useRoute。
 *  - @lucide/vue 的图标组件。
 *  - auth.store / entities.store / layout.store + chrome.store。
 *  - home-batch-actions 的 turnOffWholeHome。
 *  - whole-home-off 常量与配置。
 *  - useSystemDiagnostics 的 useSystemDiagnostics。
 *  - useHaDegrade 的 HA 重连封装。
 *  - core/logger 的 logger。
 *  - settings-route.util 的 SETTINGS_ROUTES。
 *  - nav-tabs.util 的 DEFAULT_BRAND_LOGO_URL。
 *  - main-layout-nav.util 的 mainLayoutIconMap。
 *  - useMainLayoutNavMenu / useMainLayoutChildMode / useMainLayoutDoorbell / useMainLayoutWeatherNav。
 */
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'

import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Loader2, Maximize2, PowerOff, Settings } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { turnOffWholeHome } from '@/utils/home/batch-actions'
import {
  canUseWholeHomeOff,
  buildWholeHomeOffConfirmText,
  getWholeHomeOffConfig,
} from '@/constants/whole-home-off'
import { useSystemDiagnostics } from '@/composables/settings/useSystemDiagnostics'
import { useHaDegrade } from '@/composables/ui/useHaDegrade'
import { logger } from '@/utils/core/logger'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { DEFAULT_BRAND_LOGO_URL } from '@/utils/layout/nav-tabs.util'
import { mainLayoutIconMap } from '@/utils/ui/main-layout-nav.util'
import { useMainLayoutNavMenu } from '@/composables/ui/useMainLayoutNavMenu'
import { useMainLayoutChildMode } from '@/composables/ui/useMainLayoutChildMode'
import { useMainLayoutDoorbell } from '@/composables/ui/useMainLayoutDoorbell'
import { useMainLayoutWeatherNav } from '@/composables/ui/useMainLayoutWeatherNav'
import { hapticAlert } from '@/utils/ui/haptics.util'

/** 主布局壳层：导航、HA 状态、儿童模式、门铃。聚合各子 composable 的状态与操作。 */
export function useMainLayoutChrome() {
  const router = useRouter()
  const route = useRoute()
  const authStore = useAuthStore()
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  // 导航菜单子 composable
  const { menuItems, dropdownMenuItems, navMoreOpen, navMoreActive } = useMainLayoutNavMenu({
    layoutStore,
    authStore,
    route,
  })

  // 儿童模式子 composable
  const {
    childModeStatus,
    showChildModeBar,
    childModeBarText,
    canChildOverride,
    childModeOverride,
  } = useMainLayoutChildMode({ authStore, entitiesStore, chrome })

  // 门铃子 composable
  const { doorbellCameraId, doorbellTriggerEntityId, doorbellLockEntityId, doorbellLabel } =
    useMainLayoutDoorbell({ layoutStore, chrome, entitiesStore })

  // 天气导航子 composable
  const { toggleFullscreen, navColors, navFrameStyle } = useMainLayoutWeatherNav({
    layoutStore,
    entitiesStore,
  })

  /** 站点标题（取自布局配置，兜底 'HomeOS'） */
  const siteTitle = computed(() => layoutStore.layoutConfig.siteTitle || 'HomeOS')
  /** 品牌Logo URL（默认值） */
  const brandLogoUrl = DEFAULT_BRAND_LOGO_URL
  // 同步站点标题到 document.title
  watch(
    siteTitle,
    (title) => {
      document.title = `${title}-HomeOS智能家居控制系统`
    },
    { immediate: true },
  )

  /** 设置锁弹窗是否打开 */
  const isSettingsLockOpen = ref(false)
  /** 待跳转路径（设置锁验证通过后跳转） */
  const pendingRedirectPath = ref<string | null>(null)
  let clickCount = 0
  let clickTimer: ReturnType<typeof setTimeout> | null = null

  /** 三击 logo 触发页面刷新（隐藏的调试入口） */
  function handleTripleClick() {
    clickCount++
    if (clickCount >= 3) window.location.reload()
    if (clickTimer) clearTimeout(clickTimer)
    clickTimer = setTimeout(() => {
      clickCount = 0
    }, 600)
  }

  /** HA WebSocket 是否已连接 */
  const isConnected = computed(() => entitiesStore.connected)
  /** HA 是否正在重连 */
  const isReconnecting = computed(() => entitiesStore.reconnecting)
  /** 实体数据是否已过期 */
  const isEntitiesStale = computed(() => entitiesStore.entitiesStale)
  /** 是否已配置 HA（url + token） */
  const hasHAConfigured = computed(
    () => !!(layoutStore.layoutConfig.haConfig?.url && layoutStore.layoutConfig.haConfig?.token),
  )
  /** HA 断线 / 陈旧 / 重连中：禁止危险批量控制与模式切换入口 */
  const haControlBlocked = computed(
    () =>
      hasHAConfigured.value &&
      (!isConnected.value || isEntitiesStale.value || isReconnecting.value),
  )
  /** 是否展示全屋关闭按钮（角色允许；禁用态由 haControlBlocked 控制） */
  const showWholeHomeOff = computed(() => {
    if (!authStore.isAuthenticated) return false
    return canUseWholeHomeOff(authStore.role, layoutStore.layoutConfig)
  })
  /** 是否可执行全屋关闭（角色允许且 HA 就绪） */
  const canWholeHomeOff = computed(() => showWholeHomeOff.value && !haControlBlocked.value)

  /** 全屋关闭：确认后批量关闭全部设备，并通知成功/部分失败/失败 */
  async function onWholeHomeOff() {
    if (haControlBlocked.value) {
      chrome.notify('Home Assistant 未就绪，暂不可全屋关闭', 'warning')
      return
    }
    const cfg = getWholeHomeOffConfig(layoutStore.layoutConfig)
    const confirmMsg = buildWholeHomeOffConfirmText(cfg)
    const ok = await chrome.confirm(confirmMsg, '全屋关闭', {
      type: 'danger',
      confirmText: '全屋关闭',
    })
    if (!ok) return
    try {
      const { total, ok: okCount, failed } = await turnOffWholeHome()
      // 高危操作触感反馈：确认后已实际下发批量关闭
      hapticAlert()
      if (failed) {
        chrome.notify(
          '部分设备关闭失败（{failed}）'.replace('{failed}', String(failed)),
          'warning',
        )
      } else {
        chrome.notify(
          '全屋关闭完成（{ok}/{total}）'
            .replace('{ok}', String(okCount))
            .replace('{total}', String(total)),
          'success',
        )
      }
    } catch (e) {
      chrome.notify((e as { message?: string })?.message || '失败', 'error')
    }
  }

  /** 是否显示 HA 数据告警：未配置 HA 时不显示；已配置时连接断开/数据过期/重连中显示 */
  const showHaDataWarning = computed(() => {
    if (!hasHAConfigured.value && !isEntitiesStale.value && !isReconnecting.value) return false
    return !isConnected.value || isEntitiesStale.value || isReconnecting.value
  })
  /** HA 指令队列丢弃提示文案（有丢弃时显示） */
  const haQueueDropHint = computed(() => {
    const total = entitiesStore.haQueueDroppedTotal
    if (!total || total <= 0) return ''
    return `有 ${String(total)} 条控制指令未能下发`
  })
  /** HA 数据告警基础文案（按重连/断连/过期状态选择） */
  const haDataWarningTextBase = computed(() => {
    if (isReconnecting.value) return '正在重新连接实时通道…'
    if (!isConnected.value) return 'HA 连接已中断（常见于 HA 重启），设备控制可能失败'
    if (isEntitiesStale.value) return '实体数据可能已过期，请等待同步或点击重试'
    return ''
  })
  /** HA 数据告警最终文案：基础文案 + 丢弃提示（以 · 分隔） */
  const haDataWarningText = computed(() => {
    const base = haDataWarningTextBase.value
    const drop = haQueueDropHint.value
    if (base && drop) return `${base} · ${drop}`
    return base || drop
  })
  /** 是否为访客模式 */
  const isGuestMode = computed(() => authStore.isGuest())
  /** 是否显示 HA 告警横幅（访客墙屏同样需要看到连接状态） */
  const showHaBanner = computed(
    () => showHaDataWarning.value || !!haQueueDropHint.value,
  )
  /** 是否显示实体加载进度（entityLoadPhase 未就绪时） */
  const showEntityLoadProgress = computed(() => entitiesStore.entityLoadPhase !== 'ready')

  /** localStorage 中记录上次见过的应用版本的 key */
  const LAST_SEEN_VERSION_KEY = 'homeos_last_seen_app_version'
  const { loadHealth } = useSystemDiagnostics()

  /**
   * 升级备份提醒：admin 用户在应用版本变化时提示导出备份。
   * 首次记录版本，后续版本变化时弹出确认框引导前往备份页面。
   */
  async function checkUpgradeBackupReminder() {
    if (authStore.role !== 'admin') return
    try {
      const data = (await loadHealth()) as { version?: string } | null
      const v = data?.version
      if (!v || v === 'unknown') return
      const last = readLocalStorage(LAST_SEEN_VERSION_KEY)
      if (!last) {
        // 首次记录版本，不弹提醒
        writeLocalStorage(LAST_SEEN_VERSION_KEY, v)
        return
      }
      if (last === v) return
      // 版本变化：提示备份
      const go = await chrome.confirm(
        `检测到 HomeOS 已升级至 ${v}（上次 ${last}）。建议在继续操作前导出完整备份包与 UI 布局 JSON 备份。`,
        '升级后请先备份',
        { confirmText: '前往备份', cancelText: '稍后', type: 'warn' },
      )
      writeLocalStorage(LAST_SEEN_VERSION_KEY, v)
      if (go) router.push(SETTINGS_ROUTES.profiles('backup'))
    } catch (e) {
      logger.debug('升级备份提醒已跳过', e)
    }
  }

  // admin 用户就绪后检查升级备份提醒
  watch(
    () => authStore.isAuthenticated && authStore.role === 'admin',
    (ready) => {
      if (ready) void checkUpgradeBackupReminder()
    },
    { immediate: true },
  )

  /** 重试 HA 连接：复用 useHaDegrade，失败时记录警告日志 */
  const { retryHaConnection } = useHaDegrade({
    onRetryFail: (e) => logger.warn('HA 重连失败', e),
  })

  /** 设置是否锁定（配置启用锁且未解锁时为 true） */
  const isSettingsLocked = computed(
    () => layoutStore.layoutConfig.settingsLock?.enabled && !chrome.isSettingsUnlocked,
  )
  /** 是否显示设置 Tab（非访客且导航菜单中无 settings 项时） */
  const showSettingsTab = computed(
    () => !authStore.isGuest() && !menuItems.value.some((i) => i.id === 'settings'),
  )

  /** 设置点击：锁定时阻止跳转并打开设置锁弹窗 */
  function onSettingsClick(e: Event) {
    if (isSettingsLocked.value) {
      e.preventDefault()
      pendingRedirectPath.value = '/settings'
      isSettingsLockOpen.value = true
    }
  }

  /** 设置锁解锁成功：跳转到待跳转路径 */
  function onUnlockSuccess() {
    if (pendingRedirectPath.value) {
      const path = pendingRedirectPath.value
      pendingRedirectPath.value = null
      router.push(path)
    }
  }

  /** 配置解锁处理：当前在 /settings 且仍锁定时跳回首页 */
  function handleConfigUnlock() {
    if (route.path === '/settings' && isSettingsLocked.value) router.push('/')
  }

  // 路由变化时检查是否需要跳回首页（设置锁定状态）
  watch(
    () => route.path,
    () => {
      handleConfigUnlock()
    },
  )
  /** 主壳状态轨：仅实体加载进度（HA 降级态改由 HaStatusDegradeBanner 承载，避免双横幅） */
  const statusRail = computed(() => {
    if (showEntityLoadProgress.value) {
      return {
        kind: 'load' as const,
        text:
          entitiesStore.entityLoadPhase === 'hydrating'
            ? `正在加载实体 ${entitiesStore.entityLoadProgress}%`
            : `正在构建索引 ${entitiesStore.entityLoadProgress}%`,
        severity: 'info' as const,
        showRetry: false,
      }
    }
    return null
  })

  return {
    iconMap: mainLayoutIconMap,
    childModeStatus,
    showChildModeBar,
    childModeBarText,
    router,
    route,
    authStore,
    entitiesStore,
    layoutStore,
    chrome,
    canChildOverride,
    canWholeHomeOff,
    showWholeHomeOff,
    haControlBlocked,
    onWholeHomeOff,
    childModeOverride,
    siteTitle,
    brandLogoUrl,
    isSettingsLockOpen,
    handleTripleClick,
    menuItems,
    dropdownMenuItems,
    navMoreOpen,
    navMoreActive,
    isConnected,
    isReconnecting,
    haDataWarningText,
    showHaBanner,
    showEntityLoadProgress,
    statusRail,
    retryHaConnection,
    doorbellCameraId,
    doorbellTriggerEntityId,
    doorbellLockEntityId,
    doorbellLabel,
    isSettingsLocked,
    showSettingsTab,
    isGuestMode,
    toggleFullscreen,
    navColors,
    navFrameStyle,
    onSettingsClick,
    onUnlockSuccess,
    // 暴露 lucide 图标组件供模板使用
    Settings,
    Maximize2,
    Loader2,
    PowerOff,
  }
}