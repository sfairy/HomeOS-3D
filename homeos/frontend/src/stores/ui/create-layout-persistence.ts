/**
 * @file 布局配置加载/保存
 * @module stores/ui/create-layout-persistence
 * @description
 *  布局配置的加载、合并默认值、保存全流程（关键路径）。
 *  核心流程：
 *  - loadConfig: 200ms 防抖 + 请求去重 + requestId 竞态保护，
 *    从服务端拉取方案布局 -> mergeLayoutWithDefaults 合并默认值 ->
 *    写入 layoutConfig -> 同步激活方案 -> 触发 onAfterLoad
 *  - saveConfig: HA URL 校验 -> cloneLayoutForApi 清理运行时字段 ->
 *    prepareLayoutHotspotAnchorsForSave 规范化锚点 -> saveProject 写入
 *  - sanitize/normalize：statsSensors / haConfig / favoriteEntities / panel / floating widgets 等
 *  依赖 config API、auth store、defaults、tablet 性能模式、HA URL 校验等。
 */
import { nextTick, type Ref } from 'vue'
import { fetchProject, saveProject, setActiveProject } from '@/services/api/config'
import { useAuthStore } from '@/stores/auth.store'
import { getDefaultLayout } from '@/stores/defaults'
import {
  NAV_TAB_ORDER_DEFAULT,
  normalizeEmbedNavTabLayoutFields,
} from '@/utils/layout/nav-tabs.util'
import { normalizeDashboardFooter } from '@/constants/dashboard-footer'
import { normalizeSecurityEmergency } from '@/constants/security-emergency'
import { normalizeWholeHomeOff } from '@/constants/whole-home-off'
import { logger } from '@/utils/core/logger'
import {
  getApiErrorMessage,
  isLicenseInactiveError,
  isUnauthorizedError,
} from '@/utils/core/error-message'
import { applyTabletDefaultPerformanceMode } from '@/utils/perf/tablet-default-perf.util'
import type { NotifyType } from '@/types/notify'
import { KNOWN_PANEL_WIDGET_TYPES } from './create-layout-state'
import { WIDGET_REGISTRY_META, FLOATING_HUB_TYPE_SET } from '@/utils/registry/widget-registry-meta'
import { ensureDoorbellList } from '@/utils/layout/doorbell.util'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { pushServerAccessConfig } from '@/utils/bridge/native-bridge'
import { fetchSystemNetworkInfo } from '@/services/api/system'
import type { HaConfig, PanelWidget, FloatingWidget } from '@/types/layout'

/**
 * 把服务端访问配置推送给原生端（fire-and-forget）。
 *
 * 关键：`internalUrl` 与两个端口必须以后端 `/system/network-info` 的结果为准，
 * 不能用 `window.location` 猜：
 *  - 页面可能正是通过**外网地址**打开的，此时 location 是外网地址而非内网地址；
 *  - 默认端口下 `location.port` 是空串，`Number('') || 0` 会变成 **0**；
 *  - 前后端分离部署时 location 端口是前端端口，当成 backendPort 传出去是错的。
 * 本函数在每次保存后都会执行，用猜出来的值推送会静默覆盖掉设置面板刚推过去的正确值。
 *
 * 该接口是 admin-only：普通终端的会话会拿到 403，此时静默跳过——
 * 宁可不推送，也不要用错误的端口覆盖原生端已有的正确入口。
 * 仅在有远程访问地址时推送：没有 externalUrl 说明用户尚未配置外网入口。
 * @param externalUrl 布局中已保存的远程访问地址
 */
async function syncServerAccessToNative(externalUrl: string): Promise<void> {
  try {
    const target = String(externalUrl ?? '').trim()
    if (!target) return
    const { data } = await fetchSystemNetworkInfo()
    if (!data?.internalUrl) return
    pushServerAccessConfig({
      internalUrl: data.internalUrl,
      externalUrl: target,
      frontendPort: data.frontendPort ?? 0,
      backendPort: data.backendPort ?? 0,
    })
  } catch (err) {
    logger.debug(`推送服务端访问配置到原生端失败: ${String(err)}`)
  }
}

/** 规范化危险实体 id 数组（只认复数键） */
function normalizeHazardEntityIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => String(item ?? '').trim()).filter(Boolean)
}

/**
 * 侧栏允许的微件类型集合（与 registry meta surfaces 同步）。
 * 从 WIDGET_REGISTRY_META 中筛选 surfaces 包含 'sidebar' 的类型。
 */
const SIDEBAR_WIDGET_TYPES = new Set(
  Object.entries(WIDGET_REGISTRY_META)
    .filter(([, def]) => def.surfaces.includes('sidebar'))
    .map(([type]) => type),
)

/**
 * 判断给定类型是否属于侧栏微件。
 * @param type 微件类型字符串
 * @returns 是否为侧栏微件
 */
function isSidebarWidgetType(type: string): boolean {
  return SIDEBAR_WIDGET_TYPES.has(type)
}

/**
 * 克隆布局并清理运行时字段以适配 API 写入格式。
 * - 删除 energyFooter（已废弃）
 * - 通过 sanitizeStatsSensors 规范化统计传感器字段
 * @param layout 原始布局对象
 * @returns 清理后的布局副本
 */
function cloneLayoutForApi(layout: Record<string, unknown>) {
  const copy = clonePlain(layout) as Record<string, unknown>
  delete copy.energyFooter
  copy.statsSensors = sanitizeStatsSensors(copy.statsSensors as Record<string, unknown>)
  return copy
}

/** createLayoutPersistence 的依赖注入参数 */
interface LayoutPersistenceDeps {
  /** 布局配置对象 */
  layoutConfig: Record<string, unknown>
  /** 脏标志 ref */
  layoutDirty: Ref<boolean>
  /** 当前激活方案 ID ref */
  activeProfileId: Ref<string>
  /** 配置是否已加载 ref */
  isConfigLoaded: Ref<boolean>
  /** 配置加载中 ref */
  isConfigLoading: Ref<boolean>
  /** Toast 通知回调 */
  notify: (message: string, type?: NotifyType, duration?: number) => void
  /** 临时抑制 dirty 跟踪的回调 */
  setSuppressDirtyTracking: (v: boolean) => void
  /** 加载完成后的可选回调 */
  onAfterLoad?: () => void | Promise<void>
}

/**
 * 规范化统计传感器配置，确保所有字段存在且有默认值回退。
 * @param raw 原始 statsSensors 对象
 * @returns 规范化后的配置
 */
function sanitizeStatsSensors(raw: Record<string, unknown> | null | undefined) {
  const defaults = getDefaultLayout().statsSensors
  const src = raw || {}
  return {
    lights: String(src.lights ?? defaults.lights ?? ''),
    climates: String(src.climates ?? defaults.climates ?? ''),
    battery: String(src.battery ?? defaults.battery ?? ''),
    offline: String(src.offline ?? defaults.offline ?? ''),
    energySources: {
      ...defaults.energySources,
      ...((src.energySources as object) || {}),
    },
  }
}
/**
 * 规范化 HA 配置，合并默认值。
 * - 合并默认 haConfig
 * - ensureDoorbellList 补齐门铃
 * - 规范化 hazard*EntityIds 数组
 * - 校正门铃摄像头引用（不在 securityCameras 列表中则清空）
 * @param raw 原始 haConfig 对象
 * @returns 规范化后的配置
 */
function sanitizeHaConfig(raw: Record<string, unknown> | null | undefined) {
  const merged: Record<string, unknown> = { ...getDefaultLayout().haConfig, ...(raw || {}) }
  merged.fallbackUrl = String(merged.fallbackUrl || '').trim()
  ensureDoorbellList(merged as unknown as HaConfig)
  merged.hazardSmokeEntityIds = normalizeHazardEntityIds(merged.hazardSmokeEntityIds)
  merged.hazardGasEntityIds = normalizeHazardEntityIds(merged.hazardGasEntityIds)
  merged.hazardLeakEntityIds = normalizeHazardEntityIds(merged.hazardLeakEntityIds)
  // 校正门铃摄像头引用：若不在 securityCameras 列表中则清空，避免失效引用
  const cameras = (merged.securityCameras as string[]) || []
  if (Array.isArray(merged.doorbells)) {
    for (const d of merged.doorbells as Array<{ cameraEntityId?: string }>) {
      if (d?.cameraEntityId && cameras.length && !cameras.includes(String(d.cameraEntityId))) {
        d.cameraEntityId = ''
      }
    }
  }
  return merged
}

/**
 * 规范化收藏实体配置。
 * @param raw 原始 favoriteEntities 对象
 * @returns 规范化后的配置
 */
function normalizeFavoriteEntities(raw: Record<string, unknown> | null | undefined) {
  return { ...getDefaultLayout().favoriteEntities, ...(raw || {}) }
}

/**
 * 规范化侧栏面板部件列表。
 * 缺省（非数组）时回退默认；显式 [] 表示用户清空，保留空列表。
 * 仅保留已注册且属于 KNOWN_PANEL_WIDGET_TYPES 的类型。
 * @param list 原始部件列表
 * @returns 规范化后的部件数组
 */
function sanitizePanelWidgets(list: unknown) {
  if (!Array.isArray(list)) return getDefaultLayout().rightPanelWidgets
  const out: PanelWidget[] = []
  for (const raw of list) {
    const w = raw as Record<string, unknown>
    const type = w.type as string
    if (!type || !isSidebarWidgetType(type) || !KNOWN_PANEL_WIDGET_TYPES.has(type)) continue
    out.push(w as unknown as PanelWidget)
  }
  return out
}

/**
 * 规范化浮动部件列表：过滤未知类型，仅保留 FLOATING_HUB_TYPE_SET。
 * @param list 原始部件列表
 * @returns 规范化后的部件数组
 */
function sanitizeFloatingWidgets(list: unknown) {
  if (!Array.isArray(list)) return []
  const out: FloatingWidget[] = []
  for (const raw of list) {
    const w = raw as Record<string, unknown>
    if (!w?.type || !FLOATING_HUB_TYPE_SET.has(w.type as string)) continue
    out.push(w as unknown as FloatingWidget)
  }
  return out
}
/**
 * 布局配置加载/保存（从 layout 拆分）。
 *
 * 集中管理布局的读取、合并默认值与持久化全流程。
 * 内部维护防抖定时器、在途请求与 requestId 竞态保护，
 * 确保快速切换方案时不会产生脏数据写入。
 *
 * @param deps 依赖注入参数
 * @returns mergeLayoutWithDefaults / applyLayoutFromRaw / loadConfig / saveConfig / saveLayout
 */
export function createLayoutPersistence({
  layoutConfig,
  layoutDirty,
  activeProfileId,
  isConfigLoaded,
  isConfigLoading,
  notify,
  setSuppressDirtyTracking,
  onAfterLoad,
}: LayoutPersistenceDeps) {
  // loadConfig 的防抖定时器（200ms）
  let loadConfigDebounceTimer: ReturnType<typeof setTimeout> | null = null
  // 当前在途的 loadConfig Promise（用于去重并发请求）
  let loadConfigInFlight: Promise<void> | null = null
  // 在途请求对应的方案 ID：仅当目标方案一致时才复用在途请求，避免方案快速切换时复用旧方案响应导致配置不更新
  let loadConfigInFlightProfile: string | null = null
  // 自增请求 ID，用于丢弃过期请求的响应（方案切换竞态保护）
  let loadConfigRequestId = 0
  // 当前在途的 saveConfig Promise（用于 coalesce 并发保存）
  let saveConfigInFlight: Promise<boolean> | null = null
  /** 在途期间再次调用时合并：结束后用最新 layoutConfig 再存一次 */
  let saveConfigNeedsResave = false
  let saveConfigQueuedSilent = true

  /**
   * 将远端布局与默认值深度合并，确保所有字段存在且结构合法。
   * 处理 floors / haConfig / statsSensors / dashboardFooter / 各类安全配置、
   * 导航 tab、地震、agent、频道、房间统计等字段的合并与规范化。
   * @param layout 远端原始布局
   * @returns 合并默认值后的布局对象
   */
  /**
   * 把旧 2D 楼层模型迁移到顶层浮动组件。
   *
   * - 顶层 `floatingWidgets` 非空视为已迁移，直接采用；
   * - 否则拍平各楼层的 `floatingWidgets`（安防面板 zones 就存在其中的 config.zones，随组件一起上提）；
   * - 同 id 去重，先出现者胜。
   */
  function migrateLayoutFloors(layout: Record<string, unknown>): FloatingWidget[] {
    const topLevel = sanitizeFloatingWidgets(layout.floatingWidgets)
    if (topLevel.length > 0) return topLevel
    const floors = Array.isArray(layout.floors) ? (layout.floors as Record<string, unknown>[]) : []
    const merged: FloatingWidget[] = []
    const seen = new Set<string>()
    for (const floor of floors) {
      for (const widget of sanitizeFloatingWidgets(floor?.floatingWidgets)) {
        if (seen.has(widget.id)) continue
        seen.add(widget.id)
        merged.push(widget)
      }
    }
    return merged
  }

  function mergeLayoutWithDefaults(layout: Record<string, unknown>) {
    const securityEmergency = layout.securityEmergency as Record<string, unknown> | undefined
    const haConfig = layout.haConfig as Record<string, unknown> | undefined

    const merged: Record<string, unknown> = {
      ...getDefaultLayout(),
      ...layout,
      floatingWidgets: migrateLayoutFloors(layout),
      rightPanelWidgets: sanitizePanelWidgets(layout.rightPanelWidgets),
      securityEmergency: normalizeSecurityEmergency({
        ...getDefaultLayout().securityEmergency,
        ...(securityEmergency || {}),
        actions: Array.isArray(securityEmergency?.actions)
          ? securityEmergency.actions
          : getDefaultLayout().securityEmergency.actions,
        lightPool: Array.isArray(securityEmergency?.lightPool)
          ? securityEmergency.lightPool
          : getDefaultLayout().securityEmergency.lightPool,
      }),
      securityModes: Array.isArray(layout.securityModes)
        ? layout.securityModes
        : getDefaultLayout().securityModes,
      securityModeLinks: {
        ...getDefaultLayout().securityModeLinks,
        ...((layout.securityModeLinks as object) || {}),
      },
      profileHomeMode: {
        ...getDefaultLayout().profileHomeMode,
        ...((layout.profileHomeMode as object) || {}),
      },
      haConfig: sanitizeHaConfig(haConfig),
      statsSensors: sanitizeStatsSensors(layout.statsSensors as Record<string, unknown> | undefined),
      dashboardFooter: normalizeDashboardFooter(
        (layout.dashboardFooter as Parameters<typeof normalizeDashboardFooter>[0]) ??
          getDefaultLayout().dashboardFooter,
      ),
      settingsLock: layout.settingsLock
        ? {
            ...(layout.settingsLock as object),
            enabled: (layout.settingsLock as { enabled?: boolean }).enabled ?? false,
            pin: (layout.settingsLock as { pin?: string }).pin ?? '',
          }
        : { ...getDefaultLayout().settingsLock },
      wholeHomeOff: normalizeWholeHomeOff({
        ...getDefaultLayout().wholeHomeOff,
        ...((layout.wholeHomeOff as object) || {}),
      }),
      favoriteEntities: normalizeFavoriteEntities(layout.favoriteEntities as Record<string, unknown>),
      navTabOrder:
        Array.isArray(layout.navTabOrder) && layout.navTabOrder.length
          ? [...layout.navTabOrder]
          : [...NAV_TAB_ORDER_DEFAULT],
      navTabVisibility: {
        ...getDefaultLayout().navTabVisibility,
        ...((layout.navTabVisibility as object) || {}),
      },
      navTabPlacement: {
        ...getDefaultLayout().navTabPlacement,
        ...((layout.navTabPlacement as object) || {}),
      },
      earthquakeConfig: {
        ...getDefaultLayout().earthquakeConfig,
        ...((layout.earthquakeConfig as object) || {}),
      },
      agentConfig: {
        ...getDefaultLayout().agentConfig,
        ...((layout.agentConfig as object) || {}),
      },
      channelConfig: {
        email: {
          ...getDefaultLayout().channelConfig!.email,
          ...(((layout.channelConfig as { email?: object } | undefined)?.email as object) || {}),
        },
        webpush: {
          ...getDefaultLayout().channelConfig!.webpush,
          ...(((layout.channelConfig as { webpush?: object } | undefined)?.webpush as object) || {}),
        },
        wecom: {
          ...getDefaultLayout().channelConfig!.wecom,
          ...(((layout.channelConfig as { wecom?: object } | undefined)?.wecom as object) || {}),
        },
      },
      mobileRoomStats: {
        ...getDefaultLayout().mobileRoomStats,
        ...((layout.mobileRoomStats as object) || {}),
      },
    }
    // 清理已废弃字段
    delete merged.energyFooter
    delete merged.widgets
    delete merged.rightPanelCards
    // 退役 2D 楼层字段（数据已在 migrateLayoutFloors 提升到顶层 floatingWidgets）
    delete merged.floors
    delete merged.activeFloorId
    delete merged.floorSwitcherConfig
    delete merged.floorplanAspectRatio
    delete merged.floorplanRenderer
    delete merged.hotspotAnchorConvention
    ensureDoorbellList(merged.haConfig as HaConfig)
    // 修复内嵌页与导航标签历史双前缀 / 删除残留的孤儿引用
    normalizeEmbedNavTabLayoutFields(merged)
    return merged
  }

  /**
   * 从 API 原始 layout 合并默认值。
   * @param raw API 返回的原始 layout 对象
   * @returns 合并后的 layout
   */
  function applyLayoutFromRaw(raw: Record<string, unknown>) {
    return {
      layout: mergeLayoutWithDefaults(raw),
    }
  }
  /**
   * 加载当前方案的布局配置。
   * 关键路径，包含多重保护：
   * - 200ms 防抖：合并快速连续调用
   * - 在途请求去重：并发调用复用同一 Promise
   * - requestId 竞态保护：方案切换后丢弃过期响应
   * - layoutParseError 容错：JSON 损坏时提示并回退空布局
   * @returns 加载完成的 Promise
   */
  function loadConfig(): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) return Promise.resolve()

    return new Promise((resolve, reject) => {
      if (loadConfigDebounceTimer) {
        clearTimeout(loadConfigDebounceTimer)
      }

      loadConfigDebounceTimer = setTimeout(async () => {
        loadConfigDebounceTimer = null

        // 复用在途请求，避免重复拉取；仅当目标方案一致时才复用，
        // 否则方案切换后会复用旧方案的在途请求，导致新方案配置永不加载。
        if (loadConfigInFlight && loadConfigInFlightProfile === activeProfileId.value) {
          try {
            await loadConfigInFlight
            resolve()
          } catch (err) {
            reject(err)
          }
          return
        }

        const requestId = ++loadConfigRequestId
        const profileAtStart = activeProfileId.value
        loadConfigInFlightProfile = profileAtStart

        const inFlight = (async () => {
          isConfigLoading.value = true
          setSuppressDirtyTracking(true)

          try {
            const res = await fetchProject(profileAtStart)

            // 竞态保护：若期间方案已切换则丢弃本次响应
            if (requestId !== loadConfigRequestId || activeProfileId.value !== profileAtStart) {
              return
            }

            // JSON 损坏容错：提示用户并回退空布局
            if (res.data?.data?.layoutParseError) {
              notify('布局配置 JSON 已损坏，已回退为空布局。请重新配置。', 'error', 8000)
            }

            const layout = res.data?.data?.layout
            if (layout) {
              const { layout: merged } = applyLayoutFromRaw(layout as Record<string, unknown>)
              Object.assign(layoutConfig, merged)
            }

            isConfigLoaded.value = true
            applyTabletDefaultPerformanceMode(layoutConfig)
            void setActiveProject(profileAtStart).catch((e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e)
              logger.warn(`同步激活方案失败: ${msg}`)
            })
            if (onAfterLoad) void onAfterLoad()
            // 布局加载完成后同步一次远程访问地址给原生端（外网漫游取回入口）
            void syncServerAccessToNative(String(layoutConfig.externalUrl ?? ''))
          } catch (err) {
            // 竞态保护：过期请求的错误不抛出
            if (requestId !== loadConfigRequestId) return
            if (isLicenseInactiveError(err)) {
              logger.debug('商业授权未激活,跳过 UI 配置加载')
              isConfigLoaded.value = false
              return
            }
            if (isUnauthorizedError(err)) {
              // 401 已由 api-client 统一处理（清登录态 + 跳登录页）：
              // 这里不再弹「加载配置失败」，也不把 Promise 抛给调用方——
              // App.vue 的 watch 是 fire-and-forget，抛出会变成 unhandledrejection，
              // 被 client-log 当成前端异常上报（用户看到的就是一条红色的
              // 「加载UI配置失败 / Uncaught (in promise) AxiosError」）。
              logger.debug('登录状态已失效，跳过 UI 配置加载（已交由认证流程处理）')
              isConfigLoaded.value = false
              applyTabletDefaultPerformanceMode(layoutConfig)
              return
            }
            logger.error('加载UI配置失败', err)
            notify(
              `加载配置失败: ${getApiErrorMessage(err, err instanceof Error ? err.message : undefined)}`,
              'error',
            )
            // 加载失败时不标记已加载：避免 dirty watch 生效后用户基于空配置编辑并保存覆盖服务端真实配置。
            // 仅应用默认性能模式以保证 UI 可用，但 isConfigLoaded 保持 false 阻止自动保存。
            isConfigLoaded.value = false
            applyTabletDefaultPerformanceMode(layoutConfig)
            throw err
          } finally {
            // 仅当当前请求仍为最新时才重置加载状态
            if (requestId === loadConfigRequestId) {
              isConfigLoading.value = false
              layoutDirty.value = false
              nextTick(() => {
                setSuppressDirtyTracking(false)
              })
            }
          }
        })()
        loadConfigInFlight = inFlight

        try {
          await inFlight
          resolve()
        } catch (err) {
          reject(err)
        } finally {
          // 仅当未被更新的在途请求替换时才清理，避免误清新请求的去重状态
          if (loadConfigInFlight === inFlight) {
            loadConfigInFlight = null
            loadConfigInFlightProfile = null
          }
        }
      }, 200)
    })
  }

  /**
   * 保存当前布局到服务端。
   * 流程：HA URL 校验 -> 克隆清理 -> 锚点规范化 -> saveProject 写入。
   * silent=true 时不弹「成功」Toast；校验/API 失败仍会 toast，并返回 false（不抛异常）。
   * 调用方必须检查返回值，勿把 false 当成成功。
   * 并发 coalesce：在途期间再次调用标记 needsResave；循环用最新 layoutConfig 再存，
   * 结束后若仍有排队（竞态）则递归再存一次。
   * @param silent 是否静默成功（不弹成功 Toast）
   * @returns 是否保存成功（最终一次写入的结果）
   */
  async function saveConfig(silent = false): Promise<boolean> {
    // 在途：合并排队，结束后若仍需再存则递归（避免复用旧快照丢更新）
    if (saveConfigInFlight) {
      saveConfigNeedsResave = true
      if (!silent) saveConfigQueuedSilent = false
      const ok = await saveConfigInFlight
      if (saveConfigNeedsResave) {
        return saveConfig(silent)
      }
      return ok
    }

    // HA 连接地址/令牌由 PUT /ha/connection 在服务端校验并落库，
    // 项目 layout 只保存实体绑定，因此这里不再做部署地址校验。
    saveConfigQueuedSilent = silent
    saveConfigNeedsResave = false

    saveConfigInFlight = (async () => {
      let lastOk = false
      try {
        do {
          const runSilent = saveConfigQueuedSilent
          saveConfigNeedsResave = false
          try {
            const layout = cloneLayoutForApi(layoutConfig)
            await saveProject(activeProfileId.value, { layout })
            if (!runSilent) notify('布局配置已保存', 'success')
            // 保存成功后推送远程访问地址，原生端无需重启即可拿到新入口
            void syncServerAccessToNative(String(layoutConfig.externalUrl ?? ''))
            layoutDirty.value = false
            lastOk = true
          } catch (err) {
            logger.error('保存UI配置失败', err)
            notify(
              `保存布局失败: ${getApiErrorMessage(err, err instanceof Error ? err.message : undefined)}`,
              'error',
            )
            lastOk = false
            // 失败后仍消费排队标记，避免错误状态下死循环；调用方需再次主动保存
            saveConfigNeedsResave = false
            break
          }
        } while (saveConfigNeedsResave)
        return lastOk
      } finally {
        saveConfigInFlight = null
      }
    })()

    return saveConfigInFlight
  }

  /**
   * saveConfig 的别名，默认 silent=true（不弹成功 Toast）。
   * 失败仍会 toast 并返回 false；调用方必须检查返回值。
   * @param silent 是否静默成功，默认 true
   * @returns 是否保存成功
   */
  function saveLayout(silent = true): Promise<boolean> {
    return saveConfig(silent)
  }

  return {
    mergeLayoutWithDefaults,
    applyLayoutFromRaw,
    loadConfig,
    saveConfig,
    saveLayout,
  }
}