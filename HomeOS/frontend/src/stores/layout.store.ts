/**
 * @file layout.store.ts
 * @module frontend/src/stores
 * @brief 布局域 Store：layoutConfig、脏标记、部件 CRUD、方案/持久化/草稿、编辑态。
 *
 * 职责：
 * - 持有 UILayoutConfig 主状态（楼层/部件/收藏/事件日志/HA 配置/统计传感器/安防/地震/AI 等）
 * - 维护布局脏标记（layoutDirty）：深 watch layoutConfig，配置未加载完成或被抑制时跳过
 * - 楼层部件 CRUD：热点部件（FloorWidget）与浮动部件（FloatingWidget）的增删改
 * - 编辑模式生命周期：进入/退出、放置实体指针、退出确认、撤销/重做（按楼层分栈）
 * - 布局方案管理：方案列表拉取/创建/删除/切换、家庭模式自动激活、本机终端绑定
 * - 持久化：loadConfig（200ms 防抖 + 请求去重 + requestId 竞态保护）、saveConfig（HA URL 校验 + 并发 coalesce）
 * - 未保存草稿：localStorage 抢救式持久化（beforeunload 钩子）
 * - 全量备份：方案数组导入/导出（不含自动化/系统参数/用户）
 * - 设置锁：PIN 校验解锁（与 chrome.isSettingsUnlocked 共享）
 *
 * 关键依赖：
 * - @/stores/chrome.store：UI chrome 状态切片（编辑模式 / 选中部件 / 弹窗 / 通知），经 useChromeStore() 组合
 * - @/stores/ui/create-layout-core-state：核心响应式状态 + dirty 跟踪
 * - @/stores/ui/create-edit-history-state：编辑历史（撤销/重做）
 * - @/stores/ui/create-floor-widget-actions：楼层部件 CRUD
 * - @/stores/ui/create-layout-persistence：加载/保存
 * - @/stores/ui/create-layout-profile-actions：方案 CRUD 与切换
 * - @/stores/ui/create-layout-backup-actions：全量备份导入/导出
 * - @/stores/ui/create-layout-draft-state：未保存草稿持久化
 * - @/stores/ui/create-edit-mode-actions：编辑模式行为
 * - @/utils/config/resolve-active-profile.util：解析激活方案 ID
 * - @/utils/perf/tablet-default-perf.util：平板默认性能模式
 * - @/utils/core/clone-plain.util：深拷贝工具
 *
 * 实现说明：
 * - 新代码直接 useLayoutStore()。Pinia store 已是单例；chrome 经 useChromeStore() 组合
 * - 各功能切片均拆分至 ui/ 子目录的工厂函数，本文件仅作 Pinia setup 容器与组合入口
 */
import { defineStore, storeToRefs } from 'pinia'
import { computed, nextTick } from 'vue'
import type { ComputedRef } from 'vue'
import type { FloorConfig, FloorWidget } from '@/types/layout'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useChromeStore } from '@/stores/chrome.store'
import {
  createLayoutCoreState,
} from '@/stores/ui/create-layout-core-state'
import { resolveActiveProfileId } from '@/utils/config/resolve-active-profile.util'
import { createEditHistoryState } from '@/stores/ui/create-edit-history-state'
import { createFloorWidgetActions } from '@/stores/ui/create-floor-widget-actions'
import { createLayoutPersistence } from '@/stores/ui/create-layout-persistence'
import { createLayoutProfileActions } from '@/stores/ui/create-layout-profile-actions'
import { createLayoutBackupActions } from '@/stores/ui/create-layout-backup-actions'
import { createLayoutDraftState } from '@/stores/ui/create-layout-draft-state'
import { createEditModeActions } from '@/stores/ui/create-edit-mode-actions'
import { applyTabletDefaultPerformanceMode } from '@/utils/perf/tablet-default-perf.util'
import { clonePlain } from '@/utils/core/clone-plain.util'

/** useLayoutStore：Pinia store 工厂，状态与动作见定义。 */
export const useLayoutStore = defineStore('layout', () => {
  // 核心布局状态切片：layoutConfig / layoutDirty / activeFloorplanPopupId / profile 加载旗标
  const core = createLayoutCoreState()
  // chrome 状态切片：编辑模式 / 选中部件 / 放置实体 / 弹窗 / 通知
  const chrome = useChromeStore()
  const {
    layoutConfig,
    layoutDirty,
    activeFloorplanPopupId,
    activeProfileId,
    isProfilesLoading,
    profilesLoadError,
    isConfigLoaded,
    isConfigLoading,
    setSuppressDirtyTracking,
  } = core

  const {
    isEditMode,
    selectedWidgetId,
    placementEntity,
    showExitEditConfirm,
    isSettingsUnlocked,
  } = storeToRefs(chrome)
  const { notify } = chrome

  // 方案解析并发保护 token：自增用于丢弃过期请求的响应（路由切换竞态）
  let activeProfileResolveToken = 0

  /**
   * 解析当前激活的方案 ID（路由 query 优先，回退本地存储 / 终端推断）。
   * 通过 token 丢弃过期响应，避免路由快速切换时旧请求覆盖新值。
   * @param routeQueryProfile 路由 query 中的 profile ID（可选）
   */
  async function ensureActiveProfileResolved(routeQueryProfile?: string): Promise<void> {
    const token = ++activeProfileResolveToken
    const { profileId } = await resolveActiveProfileId(routeQueryProfile)
    if (token !== activeProfileResolveToken) return
    if (activeProfileId.value !== profileId) {
      activeProfileId.value = profileId
      isConfigLoaded.value = false
    }
  }

  // 当前选中的楼层部件（编辑模式高亮使用，基于 activeFloorId 与 selectedWidgetId 派生）
  const selectedWidget: ComputedRef<FloorWidget | null> = computed(() => {
    const floor = layoutConfig.floors.find((f: FloorConfig) => f.id === layoutConfig.activeFloorId)
    return floor?.widgets.find((w: FloorWidget) => w.id === selectedWidgetId.value) || null
  })

  // 编辑历史切片：按楼层分栈的撤销/重做（past/future 双栈，300ms 防抖）
  const { pushEditHistory, undoEdit, redoEdit, canUndoEdit, canRedoEdit, clearEditHistory } =
    createEditHistoryState({ layoutConfig, layoutDirty, clonePlain })

  // 楼层部件 CRUD 切片：热点部件与浮动部件的增删改，所有写操作均推送历史并标记 dirty
  const {
    addWidget,
    updateWidget,
    removeWidget,
    replaceWidgetId,
    addFloatingWidget,
    updateFloatingWidget,
    removeFloatingWidget,
  } = createFloorWidgetActions({ layoutConfig, layoutDirty, pushEditHistory })

  /**
   * 统一 API 错误处理：记录日志 + 区分 403（仅管理员可修改）与其他错误提示
   * @param err 异常对象
   * @param fallbackMsg 默认提示文案
   */
  function handleApiError(err: unknown, fallbackMsg: string): void {
    const message = getApiErrorMessage(err, fallbackMsg)
    logger.error(message)
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 403) {
      notify('仅管理员可修改布局与 UI 配置', 'warning')
      return
    }
    notify(`${fallbackMsg}: ${message}`, 'error')
  }

  // 布局加载/保存切片：loadConfig（防抖 + 竞态保护 + 默认值合并）、saveConfig（HA URL 校验 + 并发 coalesce）
  const { loadConfig, saveConfig, saveLayout } = createLayoutPersistence({
    layoutConfig,
    layoutDirty,
    activeProfileId,
    isConfigLoaded,
    isConfigLoading,
    notify,
    setSuppressDirtyTracking,
    onAfterLoad: () => maybeActivateProfileHomeMode(),
  })

  // 布局方案 CRUD 与切换切片：拉取列表 / 创建 / 删除 / 切换，切换后按绑定激活家庭模式
  const {
    availableProfiles,
    fetchProfiles,
    createProfile,
    deleteProfile,
    switchProfile,
    maybeActivateProfileHomeMode,
  } = createLayoutProfileActions({
    layoutConfig,
    activeProfileId,
    isProfilesLoading,
    profilesLoadError,
    isConfigLoaded,
    handleApiError,
    loadConfig,
  })

  // 全量备份导入/导出切片：方案数组 JSON 文件下载与还原（不含自动化/系统参数/用户）
  const { exportFullBackup, importFullBackup } = createLayoutBackupActions({
    notify,
    handleApiError,
    fetchProfiles,
    loadConfig,
  })

  // 未保存草稿切片：localStorage 抢救式持久化（beforeunload 钩子），刷新/崩溃后可恢复
  const { saveDraft, loadDraft, clearDraft } = createLayoutDraftState({
    layoutConfig,
    layoutDirty,
  })

  // 编辑模式行为切片：楼层切换、进入/退出、放置实体控制、退出确认（脏数据时拦截）
  const {
    setActiveFloor,
    toggleEditMode,
    confirmExitEditMode,
    setPlacementEntity,
    clearPlacementEntity,
    togglePlacementEntity,
    cancelExitEditMode,
  } = createEditModeActions({
    layoutConfig,
    layoutDirty,
    isEditMode,
    selectedWidgetId,
    placementEntity,
    showExitEditConfirm,
    setSuppressDirtyTracking,
    pushEditHistory,
    clearEditHistory,
    loadConfig,
  })

  /**
   * 用 source 覆盖 layoutConfig（导入备份 / 撤销到历史快照场景）。
   * 临时抑制 dirty 跟踪，避免覆盖过程被误标脏；applyTabletDefaultPerformanceMode 修正平板性能模式。
   * @param source 布局对象或 JSON 字符串
   */
  function revertLayoutConfig(source: Record<string, unknown> | string) {
    setSuppressDirtyTracking(true)
    try {
      const baseline = typeof source === 'string' ? JSON.parse(source) : clonePlain(source)
      Object.assign(layoutConfig, baseline)
      applyTabletDefaultPerformanceMode(layoutConfig)
      layoutDirty.value = false
    } finally {
      nextTick(() => {
        setSuppressDirtyTracking(false)
      })
    }
  }

  /** PIN 校验后解锁设置（与 chrome.isSettingsUnlocked 共享）；未启用锁时直接通过 */
  function unlockSettings(pin: string): boolean {
    if (!layoutConfig.settingsLock?.enabled || pin === layoutConfig.settingsLock.pin) {
      isSettingsUnlocked.value = true
      return true
    }
    return false
  }

  /** 重新锁定设置页 */
  function lockSettings() {
    isSettingsUnlocked.value = false
  }

  return {
    layoutConfig,
    layoutDirty,
    activeFloorplanPopupId,
    activeProfileId,
    isProfilesLoading,
    profilesLoadError,
    isConfigLoaded,
    isConfigLoading,
    isEditMode,
    selectedWidgetId,
    placementEntity,
    showExitEditConfirm,
    selectedWidget,
    isSettingsUnlocked,
    unlockSettings,
    lockSettings,
    ensureActiveProfileResolved,
    addWidget,
    updateWidget,
    removeWidget,
    replaceWidgetId,
    addFloatingWidget,
    updateFloatingWidget,
    removeFloatingWidget,
    loadConfig,
    saveConfig,
    saveLayout,
    revertLayoutConfig,
    fetchProfiles,
    createProfile,
    deleteProfile,
    switchProfile,
    availableProfiles,
    exportFullBackup,
    importFullBackup,
    saveDraft,
    loadDraft,
    clearDraft,
    pushEditHistory,
    undoEdit,
    redoEdit,
    canUndoEdit,
    canRedoEdit,
    clearEditHistory,
    setActiveFloor,
    toggleEditMode,
    confirmExitEditMode,
    setPlacementEntity,
    clearPlacementEntity,
    togglePlacementEntity,
    cancelExitEditMode,
    setSuppressDirtyTracking,
  }
})
