/** - 持有 UILayoutConfig 主状态（楼层/部件/收藏/事件日志/HA 配置/统计传感器/安防/地震/AI 等） */
import { defineStore, storeToRefs } from 'pinia'
import { nextTick } from 'vue'
import { logger } from '@/shared/utils/core/logger'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { useChromeStore } from '@/stores/chrome.store'
import {
  createLayoutCoreState,
} from '@/stores/ui/create-layout-core-state'
import { resolveActiveProfileId } from '@/composables/config/resolve-active-profile.util'
import { createEditHistoryState } from '@/stores/ui/create-edit-history-state'
import { createFloorWidgetActions } from '@/stores/ui/create-floor-widget-actions'
import { createLayoutPersistence } from '@/stores/ui/create-layout-persistence'
import { createLayoutProfileActions } from '@/stores/ui/create-layout-profile-actions'
import { createLayoutDraftState } from '@/stores/ui/create-layout-draft-state'
import { createEditModeActions } from '@/stores/ui/create-edit-mode-actions'
import { applyTabletDefaultPerformanceMode } from '@/shared/utils/perf/tablet-default-perf.util'
import { clonePlain } from '@/shared/utils/core/clone-plain.util'

/** useLayoutStore：Pinia store 工厂，状态与动作见定义。 */
export const useLayoutStore = defineStore('layout', () => {
  // 核心布局状态切片：layoutConfig / layoutDirty / profile 加载旗标
  const core = createLayoutCoreState()
  // chrome 状态切片：编辑模式 / 选中部件 / 放置实体 / 弹窗 / 通知
  const chrome = useChromeStore()
  const {
    layoutConfig,
    layoutDirty,
    activeProfileId,
    isProfilesLoading,
    profilesLoadError,
    isConfigLoaded,
    isConfigLoading,
    setSuppressDirtyTracking,
    resetCoreState,
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

  // 编辑历史切片：单栈撤销/重做（past/future 双栈，300ms 防抖）
  const { pushEditHistory, undoEdit, redoEdit, canUndoEdit, canRedoEdit, clearEditHistory } =
    createEditHistoryState({ layoutConfig, layoutDirty, clonePlain })

  // 浮动部件 CRUD 切片：顶层 floatingWidgets 的增删改，所有写操作均标记 dirty
  const { addFloatingWidget, updateFloatingWidget, removeFloatingWidget } =
    createFloorWidgetActions({ layoutConfig, layoutDirty, pushEditHistory })

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

  // 未保存草稿切片：localStorage 抢救式持久化（beforeunload 钩子），刷新/崩溃后可恢复
  const { saveDraft, loadDraft, clearDraft } = createLayoutDraftState({
    layoutConfig,
    layoutDirty,
  })

  // 编辑模式行为切片：进入/退出、放置实体控制、退出确认（脏数据时拦截）
  const {
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
   * 删掉基线里不存在的顶层键（``Object.assign`` 只覆盖不删除）。
   * 不做这一步的话，本次新增的字段（新嵌入页、新安防模式…）会残留，
   * 快照已经回滚而内容没有，pending 计数永远归不了零。
   */
  function deleteKeysMissingFrom(
    target: Record<string, unknown>,
    baseline: Record<string, unknown>,
  ): void {
    for (const key of Object.keys(target)) {
      if (!(key in baseline)) delete target[key]
    }
  }

  /**
   * 用 source 覆盖 layoutConfig（导入备份 / 撤销到历史快照场景）。
   * 临时抑制 dirty 跟踪，避免覆盖过程被误标脏；applyTabletDefaultPerformanceMode 修正平板性能模式。
   * @param source 布局对象或 JSON 字符串
   */
  function revertLayoutConfig(source: Record<string, unknown> | string) {
    setSuppressDirtyTracking(true)
    try {
      const baseline = typeof source === 'string' ? JSON.parse(source) : clonePlain(source)
      deleteKeysMissingFrom(layoutConfig as unknown as Record<string, unknown>, baseline)
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

  /**
   * 认证变更（登出 / 401）时重置布局域状态：
   * 清空方案列表与编辑历史、核心状态回默认，避免下一个会话读取到上一个用户的布局与方案。
   */
  function resetForAuthChange(): void {
    resetCoreState()
    availableProfiles.value = []
    clearEditHistory()
  }

  return {
    layoutConfig,
    layoutDirty,
    activeProfileId,
    isProfilesLoading,
    profilesLoadError,
    isConfigLoaded,
    isConfigLoading,
    isEditMode,
    selectedWidgetId,
    placementEntity,
    showExitEditConfirm,
    isSettingsUnlocked,
    unlockSettings,
    lockSettings,
    ensureActiveProfileResolved,
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
    saveDraft,
    loadDraft,
    clearDraft,
    pushEditHistory,
    undoEdit,
    redoEdit,
    canUndoEdit,
    canRedoEdit,
    clearEditHistory,
    toggleEditMode,
    confirmExitEditMode,
    setPlacementEntity,
    clearPlacementEntity,
    togglePlacementEntity,
    cancelExitEditMode,
    setSuppressDirtyTracking,
    resetForAuthChange,
  }
})
