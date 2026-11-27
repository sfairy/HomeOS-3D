import { readLocalStorage, writeLocalStorage, logger } from '@/kernel/utils/core'
import { computed, ref, watch, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRouter, useRoute, type RouteLocationNormalizedLoaded } from 'vue-router'
import { Loader2, Maximize2, PowerOff, Settings } from '@lucide/vue'
import { useAuthStore } from '@/domain/auth/auth.store'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useHaConnectionStore } from '@/domain/ha/ha-connection.store'
import { useLayoutStore } from '@/domain/layout/store'
import { turnOffWholeHome } from '@/domain/status/composables'
import { canUseWholeHomeOff, buildWholeHomeOffConfirmText, getWholeHomeOffConfig } from '@/kernel/constants'
import { useSystemDiagnostics } from '@/domain/status/index'
import { useHaDegrade } from '@/domain/entity/composables/ha'
import { SETTINGS_ROUTES } from '@/kernel/utils/registry/settings-route.util'
import { DEFAULT_BRAND_LOGO_URL, resolveDoorbellRoutes, isNavTabRouteActive, resolveMoviePilotUrl } from '@/kernel/utils/layout'
import { mainLayoutIconMap, buildMainLayoutNavMenu, capBarItemsForViewport } from '@/kernel/utils/ui/main-layout-nav.util'
import { hapticAlert } from '@/kernel/utils/ui/haptics.util'
import { getEntityDomain } from '@homeos/shared'
import { useLicenseFeatureAccess } from '@/domain/license'
import { useExclusiveDropdown } from '@/kernel/ui/popup/use-exclusive-dropdown'
import { useCanvasMetrics } from '@/kernel/ui/hooks/use-canvas-metrics'
import { weatherVisualKey } from '@/features/weather/model/constants/weather-labels'
import { domainIndexToArray } from '@/domain/entity/model/utils/derived.util'

/** - 聚合主布局壳层所需的全部状态与操作：导航菜单、HA 连接状态、门铃、天气导航。 */


/** 主布局壳层：导航、HA 状态、儿童模式、门铃。聚合各子 composable 的状态与操作。 */
export function useMainLayoutChrome() {
  const router = useRouter()
  const route = useRoute()
  const authStore = useAuthStore()
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const haConnectionStore = useHaConnectionStore()
  const chrome = useChromeStore()

  // 导航菜单子 composable
  const { menuItems, dropdownMenuItems, navMoreOpen, navMoreActive } = useMainLayoutNavMenu({
    layoutStore,
    route,
  })

  // 门铃子 composable
  const { doorbellCameraId, doorbellTriggerEntityId, doorbellLockEntityId, doorbellLabel } = useMainLayoutDoorbell({
    layoutStore,
    chrome,
    entitiesStore,
  })

  // 天气导航子 composable
  const { toggleFullscreen, navColors, navFrameStyle } = useMainLayoutWeatherNav({
    layoutStore,
    entitiesStore,
  })

  /** 站点标题（取自布局配置，兜底 'HomeOS'） */
  const siteTitle = computed(() => layoutStore.layoutConfig.siteTitle || 'HomeOS')
  /** 品牌Logo URL（默认值） */
  const brandLogoUrl = DEFAULT_BRAND_LOGO_URL
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
  /** 是否已配置 HA（连接记录存在且保存过令牌） */
  const hasHAConfigured = computed(() => haConnectionStore.configured && haConnectionStore.hasToken)
  /** HA 断线 / 陈旧 / 重连中：禁止危险批量控制与模式切换入口 */
  const haControlBlocked = computed(
    () => hasHAConfigured.value && (!isConnected.value || isEntitiesStale.value || isReconnecting.value),
  )
  /** 是否展示全屋关闭按钮（已登录且功能启用；禁用态由 haControlBlocked 控制） */
  const showWholeHomeOff = computed(() => authStore.isAuthenticated && canUseWholeHomeOff(layoutStore.layoutConfig))
  /** 是否可执行全屋关闭（功能启用且 HA 就绪） */
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
        chrome.notify('部分设备关闭失败（{failed}）'.replace('{failed}', String(failed)), 'warning')
      } else {
        chrome.notify(
          '全屋关闭完成（{ok}/{total}）'.replace('{ok}', String(okCount)).replace('{total}', String(total)),
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
  /**
   * HA 实时状态积压提示文案（有丢弃时显示）。
   *
   * 注意语义：这条计数来自 ``ha_queue_dropped``，它说的是「**状态推送**积压丢弃」，
   * 不是「控制指令下发失败」。写成「控制指令未能下发」会让用户在设备其实已经
   * 执行成功时重复点击，而真正需要做的是等待状态重新对齐。
   */
  const haQueueDropHint = computed(() => {
    const total = entitiesStore.haQueueDroppedTotal
    if (!total || total <= 0) return ''
    return `实时状态积压，已丢弃 ${String(total)} 条更新（正在重新对齐）`
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
  /** 是否显示 HA 告警横幅 */
  const showHaBanner = computed(() => showHaDataWarning.value || !!haQueueDropHint.value)
  /** 是否显示实体加载进度（entityLoadPhase 未就绪时） */
  const showEntityLoadProgress = computed(() => entitiesStore.entityLoadPhase !== 'ready')

  /**
   * 智能管家面板是否「贴栏停靠」：仪表盘（信息栏在场）时停靠。
   *
   * 曾经的例外是「整页缩放触底」—— 那时画布比视口宽、信息栏在可视区之外，停靠会导致
   * 面板要横向滚动才可见，所以退化回整屏浮层。现在缩放策略是「始终完整显示」
   * （画布恒在视口内，见 useScaling 的 computeViewportLayout），信息栏永远可见，
   * 这个例外不再需要。
   */
  const agentDocked = computed(() => route.name === 'dashboard')

  /** localStorage 中记录上次见过的应用版本的 key */
  const LAST_SEEN_VERSION_KEY = 'homeos_last_seen_app_version'
  const { loadHealth } = useSystemDiagnostics()

  /**
   * 升级备份提醒：应用版本变化时提示导出备份。
   * 首次记录版本，后续版本变化时弹出确认框引导前往备份页面。
   */
  async function checkUpgradeBackupReminder() {
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
        `检测到 HomeOS 已升级至 ${v}（上次 ${last}）。建议在继续操作前到「设置 → 方案与备份 → 备份」生成全量备份（含数据库）。`,
        '升级后请先备份',
        { confirmText: '前往备份', cancelText: '稍后', type: 'warn' },
      )
      writeLocalStorage(LAST_SEEN_VERSION_KEY, v)
      if (go) router.push(SETTINGS_ROUTES.profiles('backup'))
    } catch (e) {
      logger.debug('升级备份提醒已跳过', e)
    }
  }

  // 用户就绪后检查升级备份提醒
  watch(
    () => authStore.isAuthenticated,
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
  const isSettingsLocked = computed(() => layoutStore.layoutConfig.settingsLock?.enabled && !chrome.isSettingsUnlocked)
  /** 是否显示设置 Tab（导航菜单中无 settings 项时） */
  const showSettingsTab = computed(() => !menuItems.value.some((i) => i.id === 'settings'))

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
    router,
    route,
    authStore,
    entitiesStore,
    layoutStore,
    chrome,
    canWholeHomeOff,
    showWholeHomeOff,
    haControlBlocked,
    onWholeHomeOff,
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
    agentDocked,
    retryHaConnection,
    doorbellCameraId,
    doorbellTriggerEntityId,
    doorbellLockEntityId,
    doorbellLabel,
    isSettingsLocked,
    showSettingsTab,
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

/** - 解析当前布局配置中的门铃路由（摄像头/触发器/锁实体）； */

/**
 * 判断实体是否为“瞬时触发器”。
 * button / input_button 的状态为上次按下时间戳，没有 on/off 状态，
 * 因此通过对比前后状态值的变化来判定是否被按下。
 *
 * @param entityId 实体 ID（如 button.front_door）
 * @returns 是否为瞬时触发器
 */
function isMomentaryTrigger(entityId: string) {
  const domain = getEntityDomain(entityId)
  return domain === 'button' || domain === 'input_button'
}

/**
 * 判断瞬时触发器的状态值是否可用（非 unknown/unavailable/null）。
 * 只有可用状态才有意义参与“前后变化”比对。
 *
 * @param state 实体当前 state
 * @returns 状态值是否可参与比对
 */
function isUsableMomentaryState(state: string | null | undefined) {
  return state != null && state !== 'unknown' && state !== 'unavailable'
}

/**
 * 门铃布局 composable：聚合当前活跃门铃的摄像头/触发器/锁实体 ID 与显示标签。
 *
 * 调用场景：主布局组件在初始化时调用，监听门铃触发并联动 UI 模态框。
 *
 * @param options.layoutStore 布局 store（仅 layoutConfig）
 * @param options.chrome chrome store（门铃模态开关）
 * @param options.entitiesStore 实体 store（读取门铃触发实体状态）
 * @returns 门铃相关计算属性：摄像头/触发器/锁 ID 与标签
 */
export function useMainLayoutDoorbell(options: {
  layoutStore: Pick<ReturnType<typeof useLayoutStore>, 'layoutConfig'>
  chrome: Pick<ReturnType<typeof useChromeStore>, 'isDoorbellModalOpen' | 'openDoorbellModal' | 'closeDoorbellModal'>
  entitiesStore: ReturnType<typeof useEntitiesStore>
}) {
  const { layoutStore, chrome, entitiesStore } = options
  // 当前布局配置解析出的所有门铃路由（按配置顺序）
  const doorbellRoutes = computed(() => resolveDoorbellRoutes(layoutStore.layoutConfig.haConfig))
  // 当前活跃的门铃路由（被触发的那一个），未触发时为 null
  const activeDoorbell = ref<ReturnType<typeof resolveDoorbellRoutes>[number] | null>(null)
  // 通知点击指定的摄像头覆盖（优先于门铃路由）；空串表示无覆盖
  const overrideCameraId = ref<string>('')
  // 门铃摄像头实体 ID：优先取通知覆盖，其次活跃门铃，最后回退到第一个路由
  const doorbellCameraId = computed(
    () =>
      overrideCameraId.value || activeDoorbell.value?.cameraEntityId || doorbellRoutes.value[0]?.cameraEntityId || null,
  )
  // 门铃触发器实体 ID：通知覆盖场景无触发器（关闭弹窗时无需复位实体）
  const doorbellTriggerEntityId = computed(() =>
    overrideCameraId.value
      ? null
      : activeDoorbell.value?.triggerEntityId || doorbellRoutes.value[0]?.triggerEntityId || null,
  )
  // 门铃锁实体 ID：优先取活跃门铃，否则回退到第一个路由（可能为空字符串）
  const doorbellLockEntityId = computed(
    () => activeDoorbell.value?.lockEntityId || doorbellRoutes.value[0]?.lockEntityId || '',
  )
  // 当前活跃门铃的显示标签；通知覆盖场景不传 label，交由弹窗按实体名展示
  const doorbellLabel = computed(() => (overrideCameraId.value ? '' : activeDoorbell.value?.label || ''))
  // 已经“稳定”过的触发器 ID 集合：状态从 on 回到 off 后才认为稳定，避免初始化时即 on 的误报
  const seenSettledIds = new Set<string>()
  // 当前处于 on 状态的门铃触发器集合
  const ringingDoorbellIds = new Set<string>()
  /** 用户手动关闭后忽略，直到触发器重新空闲/再次按下 */
  const dismissedIds = new Set<string>()
  // 瞬时触发器上一帧状态值，用于检测按下事件（状态变化即视为按下）
  const prevMomentaryStates = new Map<string, string | undefined>()
  // 上一帧模态框是否打开，用于检测“由开到关”的边沿
  const wasModalOpen = ref(false)

  // 监听模态框关闭事件：用户主动关闭后，将该门铃加入 dismissedIds，避免持续 on 状态反复弹窗
  watch(
    () => chrome.isDoorbellModalOpen,
    (open) => {
      if (wasModalOpen.value && !open) {
        const id = activeDoorbell.value?.triggerEntityId
        if (id) dismissedIds.add(id)
      }
      wasModalOpen.value = open
      // 弹窗关闭后清空通知覆盖，恢复门铃路由驱动的摄像头
      if (!open) overrideCameraId.value = ''
    },
  )

  // 监听所有门铃触发器状态拼接串的变化（任一状态变化都会触发）
  watch(
    () =>
      doorbellRoutes.value
        .map((d) => `${d.triggerEntityId}:${entitiesStore.entities[d.triggerEntityId]?.state}`)
        .join('|'),
    () => {
      const onIds = new Set<string>()
      let momentaryHit: (typeof doorbellRoutes.value)[number] | null = null

      for (const d of doorbellRoutes.value) {
        const id = d.triggerEntityId
        const state = entitiesStore.entities[id]?.state

        if (isMomentaryTrigger(id)) {
          // 瞬时触发器：状态值变化即视为按下事件
          const prev = prevMomentaryStates.get(id)
          if (isUsableMomentaryState(state) && prev !== undefined && prev !== state) {
            // 新按下：清除 dismissed，使该门铃可以再次弹窗
            dismissedIds.delete(id)
            if (!momentaryHit) momentaryHit = d
          }
          prevMomentaryStates.set(id, state)
          continue
        }

        // 普通触发器：on 表示门铃被按下，off/其他表示空闲
        if (state === 'on') {
          onIds.add(id)
        } else if (state != null) {
          // 状态回到非 on：清除 dismissed 并标记为已稳定
          dismissedIds.delete(id)
          seenSettledIds.add(id)
        }
      }

      // 清理已不在配置中的瞬时触发器历史状态，避免内存泄漏
      for (const id of [...prevMomentaryStates.keys()]) {
        if (!doorbellRoutes.value.some((d) => d.triggerEntityId === id)) {
          prevMomentaryStates.delete(id)
        }
      }

      // 查找新触发的普通门铃：on 且曾经稳定过，且未在响铃中，且未被忽略
      const newlyOn = doorbellRoutes.value.find(
        (d) =>
          onIds.has(d.triggerEntityId) &&
          seenSettledIds.has(d.triggerEntityId) &&
          !ringingDoorbellIds.has(d.triggerEntityId) &&
          !dismissedIds.has(d.triggerEntityId),
      )
      // 优先使用瞬时触发命中，否则使用普通 on 命中
      const newlyFiring =
        (momentaryHit && !dismissedIds.has(momentaryHit.triggerEntityId) ? momentaryHit : null) || newlyOn

      if (newlyFiring) {
        activeDoorbell.value = newlyFiring
        if (!chrome.isDoorbellModalOpen) {
          // 触觉反馈 + 打开门铃模态框
          hapticAlert()
          chrome.openDoorbellModal()
        }
      } else if (chrome.isDoorbellModalOpen && onIds.size === 0) {
        // 所有门铃已恢复空闲：关闭模态框（但瞬时触发器保持打开由 dismiss 控制）
        const activeId = activeDoorbell.value?.triggerEntityId
        if (!activeId || !isMomentaryTrigger(activeId)) {
          chrome.closeDoorbellModal()
          activeDoorbell.value = null
        }
      }

      // 更新当前响铃集合为本帧的所有 on 状态门铃
      ringingDoorbellIds.clear()
      onIds.forEach((id) => ringingDoorbellIds.add(id))
    },
    { immediate: true },
  )

  // 监听原生（iOS/Android 伴侣端）派发的打开摄像头事件，弹出实时画面
  function onOpenCamera(e: Event) {
    const detail = (e as CustomEvent)?.detail
    const cameraId = String(detail?.cameraEntityId || '').trim()
    if (!cameraId) return
    overrideCameraId.value = cameraId
    if (!chrome.isDoorbellModalOpen) chrome.openDoorbellModal()
  }

  onMounted(() => window.addEventListener('homeos:open-camera', onOpenCamera))
  onUnmounted(() => window.removeEventListener('homeos:open-camera', onOpenCamera))

  return {
    doorbellCameraId,
    doorbellTriggerEntityId,
    doorbellLockEntityId,
    doorbellLabel,
  }
}

/** - 根据布局配置构建导航菜单项； */

/**
 * 主布局导航菜单 composable。
 *
 * 调用场景：主布局组件初始化时调用，返回菜单项与下拉展开状态。
 *
 * @param options.layoutStore UI 状态 store（读取布局配置）
 * @param options.route 当前路由对象（用于高亮判断与切换收起）
 * @returns 菜单项列表与展开/高亮状态
 */
export function useMainLayoutNavMenu(options: {
  layoutStore: ReturnType<typeof useLayoutStore>
  route: RouteLocationNormalizedLoaded
}) {
  const { layoutStore, route } = options

  // 功能码门禁明细（响应式 ref）：导航项按它显隐，拿到新授权后自动重建菜单
  const licenseFeatureAccess = useLicenseFeatureAccess()

  // 顶栏 Tab 的收纳宽度基准 = 画布宽度（不是窗口宽度）：缩放开启后画布可能远宽于窗口，
  // 用 window.innerWidth 会把本该平铺的 Tab 错收进「更多」。
  const { canvasWidth: viewportWidth } = useCanvasMetrics()

  // 导航构建选项：功能码门禁只影响界面显隐（后端仍是权威执行点）。
  const navOptions = computed(() => ({
    featureAccess: licenseFeatureAccess.value,
  }))
  // 导航菜单整体（shallowRef：整体替换而非深层响应，避免高频 diff）
  const navMenu = shallowRef(
    capBarItemsForViewport(buildMainLayoutNavMenu(layoutStore.layoutConfig, navOptions.value), viewportWidth.value),
  )
  // 顶栏直接显示的菜单项
  const menuItems = computed(() => navMenu.value.barItems)
  // 顶栏“更多”下拉中的菜单项
  const dropdownMenuItems = computed(() => navMenu.value.dropdownItems)
  // 桌面端“更多”下拉是否展开
  const navMoreOpen = ref(false)
  useExclusiveDropdown(navMoreOpen)
  // “更多”下拉中是否有当前路由对应的活跃项（用于高亮“更多”按钮）
  const navMoreActive = computed(() =>
    dropdownMenuItems.value.some((item) => isNavTabRouteActive(item.path, route.path)),
  )

  function rebuildNavMenu() {
    navMenu.value = capBarItemsForViewport(
      buildMainLayoutNavMenu(layoutStore.layoutConfig, navOptions.value),
      viewportWidth.value,
    )
  }

  // 监听布局配置中影响菜单的字段变化：任一变化即整体重建菜单（deep 监听数组/对象）
  watch(
    () => ({
      order: layoutStore.layoutConfig.navTabOrder,
      visibility: layoutStore.layoutConfig.navTabVisibility,
      placement: layoutStore.layoutConfig.navTabPlacement,
      embeds: layoutStore.layoutConfig.customEmbeds,
      moviePilot: resolveMoviePilotUrl(layoutStore.layoutConfig),
      featureAccess: navOptions.value.featureAccess,
      width: viewportWidth.value,
    }),
    () => {
      rebuildNavMenu()
    },
    { deep: true },
  )
  // 路由切换时收起“更多”下拉，避免离开当前页后下拉残留
  watch(
    () => route.path,
    () => {
      navMoreOpen.value = false
    },
  )

  return {
    menuItems,
    dropdownMenuItems,
    navMoreOpen,
    navMoreActive,
  }
}

/** - 读取 HA 天气实体状态，映射为天气主题； */

/**
 * 主布局天气导航 composable。
 *
 * 调用场景：主布局组件初始化时调用，用于驱动导航栏天气配色。
 *
 * @param options.layoutStore UI 状态 store（天气配置）
 * @param options.entitiesStore 实体 store（读取天气实体状态）
 * @returns 全屏切换、导航配色与样式
 */
export function useMainLayoutWeatherNav(options: {
  layoutStore: ReturnType<typeof useLayoutStore>
  entitiesStore: ReturnType<typeof useEntitiesStore>
}) {
  const { layoutStore, entitiesStore } = options

  /**
   * 切换浏览器全屏模式。
   * 已全屏则退出，未全屏则请求进入；requestFullscreen 失败时静默忽略。
   */
  function toggleFullscreen() {
    const el = document.documentElement
    if (document.fullscreenElement) document.exitFullscreen?.()
    else el.requestFullscreen?.().catch((err) => logger.debug('进入全屏失败', err))
  }

  // 当前天气主题：从天气实体状态映射
  const weatherTheme = computed(() => {
    void entitiesStore.getDomainEpoch('weather')
    const weatherEid = layoutStore.layoutConfig.haConfig?.weatherEntityId
    let state = ''
    if (weatherEid) state = entitiesStore.getEntity(weatherEid)?.state || ''
    if (!state || state === 'unavailable' || state === 'unknown') {
      const weatherIds = domainIndexToArray(entitiesStore.domainEntityIndex.get('weather'))
      if (weatherIds.length) state = entitiesStore.getEntity(weatherIds[0])?.state || ''
    }
    const visual = weatherVisualKey(state || 'sunny')
    if (visual === 'clear-night') return 'night'
    return visual
  })

  // 各天气主题对应的导航配色（brand 主色 / glow 辉光 / tint 底色）
  const navColors = computed(() => {
    const map: Record<string, { brand: string; glow: string; tint: string }> = {
      sunny: {
        brand: 'rgba(255,191,36,0.18)',
        glow: 'rgba(255,191,36,0.12)',
        tint: 'rgba(251,191,36,0.06)',
      },
      cloudy: {
        brand: 'rgba(148,163,184,0.20)',
        glow: 'rgba(148,163,184,0.14)',
        tint: 'rgba(148,163,184,0.07)',
      },
      rainy: {
        brand: 'rgba(56,189,248,0.20)',
        glow: 'rgba(56,189,248,0.14)',
        tint: 'rgba(56,189,248,0.07)',
      },
      snowy: {
        brand: 'rgba(255,255,255,0.22)',
        glow: 'rgba(255,255,255,0.15)',
        tint: 'var(--hos-line-3)',
      },
      lightning: {
        brand: 'rgba(168,85,247,0.24)',
        glow: 'rgba(168,85,247,0.18)',
        tint: 'rgba(168,85,247,0.09)',
      },
      fog: {
        brand: 'rgba(156,163,175,0.20)',
        glow: 'rgba(156,163,175,0.14)',
        tint: 'rgba(156,163,175,0.07)',
      },
      windy: {
        brand: 'rgba(34,211,238,0.18)',
        glow: 'rgba(34,211,238,0.12)',
        tint: 'rgba(34,211,238,0.06)',
      },
      night: {
        brand: 'rgba(129,140,248,0.22)',
        glow: 'rgba(129,140,248,0.15)',
        tint: 'rgba(129,140,248,0.08)',
      },
      drizzle: {
        brand: 'rgba(125,211,252,0.18)',
        glow: 'rgba(125,211,252,0.12)',
        tint: 'rgba(125,211,252,0.06)',
      },
      pouring: {
        brand: 'rgba(37,99,235,0.22)',
        glow: 'rgba(37,99,235,0.16)',
        tint: 'rgba(37,99,235,0.08)',
      },
      hail: {
        brand: 'rgba(186,230,253,0.22)',
        glow: 'rgba(186,230,253,0.15)',
        tint: 'rgba(186,230,253,0.07)',
      },
      sleet: {
        brand: 'rgba(165,180,210,0.22)',
        glow: 'rgba(165,180,210,0.14)',
        tint: 'rgba(165,180,210,0.07)',
      },
      haze: {
        brand: 'rgba(180,160,130,0.20)',
        glow: 'rgba(180,160,130,0.14)',
        tint: 'rgba(180,160,130,0.07)',
      },
      sandstorm: {
        brand: 'rgba(214,163,84,0.22)',
        glow: 'rgba(214,163,84,0.16)',
        tint: 'rgba(214,163,84,0.08)',
      },
      partlycloudy: {
        brand: 'rgba(148,163,184,0.18)',
        glow: 'rgba(148,163,184,0.12)',
        tint: 'rgba(148,163,184,0.06)',
      },
    }
    return map[weatherTheme.value] || map.sunny
  })
  // 导航栏内联样式（CSS 变量）：仅在实际变化时更新，避免无谓重渲染
  const navFrameStyle = ref<Record<string, string>>({})
  watch(
    navColors,
    (colors) => {
      const next = {
        '--nav-brand': colors.brand,
        '--nav-glow': colors.glow,
        '--nav-tint': colors.tint,
      }
      const cur = navFrameStyle.value
      // 三个变量都未变则跳过赋值，减少样式抖动
      if (
        cur['--nav-brand'] === next['--nav-brand'] &&
        cur['--nav-glow'] === next['--nav-glow'] &&
        cur['--nav-tint'] === next['--nav-tint']
      ) {
        return
      }
      navFrameStyle.value = next
    },
    { immediate: true },
  )

  return {
    toggleFullscreen,
    navColors,
    navFrameStyle,
  }
}
