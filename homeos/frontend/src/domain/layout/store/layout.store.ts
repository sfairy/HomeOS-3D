/** - 持有 UILayoutConfig 主状态（楼层/部件/收藏/事件日志/HA 配置/统计传感器/安防/地震/AI 等） */
import { defineStore, storeToRefs } from 'pinia'
import { nextTick } from 'vue'
import { logger } from '@/kernel/core/logger'
import { getApiErrorMessage } from '@/kernel/core/error-message'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { createLayoutCoreState } from '@/domain/layout/store/create-layout-core-state'
import { resolveActiveProfileId } from './resolve-active-profile'
import { createEditHistoryState } from '@/domain/layout/store/create-edit-history-state'
import { createFloorWidgetActions } from '@/domain/layout/store/create-floor-widget-actions'
import { createLayoutPersistence } from '@/domain/layout/store/create-layout-persistence'
import { createLayoutProfileActions } from '@/domain/layout/store/create-layout-profile-actions'
import { createLayoutDraftState } from '@/domain/layout/store/create-layout-draft-state'
import { createEditModeActions } from '@/domain/layout/store/create-edit-mode-actions'
import { applyTabletDefaultPerformanceMode } from '@/kernel/perf/tablet-default-perf'
import { clonePlain } from '@/kernel/core/clone-plain'

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

  const { isEditMode, selectedWidgetId, placementEntity, showExitEditConfirm, isSettingsUnlocked } = storeToRefs(chrome)
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
      // 换方案会整份重拉布局：先把未保存改动写成**旧方案的**草稿，
      // 否则这次跳转会把用户刚改的布局静默丢掉（旧实现只有设置页那条路径会提醒）。
      await saveDraft()
      activeProfileId.value = profileId
      isConfigLoaded.value = false
    }
  }

  // 编辑历史切片：单栈撤销/重做（past/future 双栈，300ms 防抖）
  const { pushEditHistory, undoEdit, redoEdit, canUndoEdit, canRedoEdit, clearEditHistory } = createEditHistoryState({
    layoutConfig,
    layoutDirty,
    clonePlain,
  })

  // 浮动部件 CRUD 切片：顶层 floatingWidgets 的增删改，所有写操作均标记 dirty
  const { addFloatingWidget, updateFloatingWidget, removeFloatingWidget } = createFloorWidgetActions({
    layoutConfig,
    layoutDirty,
    pushEditHistory,
  })

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

  // 未保存草稿切片：localStorage 抢救式持久化（beforeunload 钩子 + 载入后询问恢复），
  // 按用户 + 方案隔离，保存成功后清除。必须在 persistence 之前创建：
  // `onAfterLoad` 需要用它询问「是否恢复上次未保存的修改」。
  const { saveDraft, maybeRestoreDraft, clearDraft, clearDraftFor, clearAllDrafts } = createLayoutDraftState({
    layoutConfig,
    layoutDirty,
    activeProfileId,
    setSuppressDirtyTracking,
  })

  // 布局加载/保存切片：loadConfig（防抖 + 竞态保护 + 默认值合并）、saveConfig（HA URL 校验 + 并发 coalesce）
  const { loadConfig, saveConfig } = createLayoutPersistence({
    layoutConfig,
    layoutDirty,
    activeProfileId,
    isConfigLoaded,
    isConfigLoading,
    notify,
    setSuppressDirtyTracking,
    preserveUnsavedDraft: saveDraft,
    onAfterLoad: () => {
      maybeActivateProfileHomeMode()
      // 草稿询问放在载入完成之后：此时 layoutConfig 已是服务端最新值，
      // 「草稿是否与服务端一致」才有意义（一致就直接丢弃，不打扰用户）。
      void maybeRestoreDraft().catch((err: unknown) => {
        logger.warn(`恢复布局草稿失败: ${err instanceof Error ? err.message : String(err)}`)
      })
    },
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

  // 未保存草稿切片在上面创建（onAfterLoad 需要它），这里不再重复创建。

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
  function deleteKeysMissingFrom(target: Record<string, unknown>, baseline: Record<string, unknown>): void {
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
      // 基线换了（导入备份 / 回到历史快照），旧草稿已不代表「未保存的改动」：
      // 留着它会让下次载入把导入前的旧布局当成「可恢复的未保存修改」提出来。
      clearDraft()
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
   * 保存布局，并在成功后清掉本地方案草稿。
   *
   * 草稿是「异常退出」的兜底；保存成功却不清草稿，下一次进入会拿一份旧内容
   * 询问「是否恢复未保存修改」，用户点恢复就等于把刚存的新内容覆盖回旧的。
   * 保存期间又发生编辑时 `layoutDirty` 仍为 true（见 save-store 的同名场景），
   * 这时必须**保留**草稿，不能清。
   *
   * @param silent 是否静默成功（不弹成功 Toast）
   * @returns 是否保存成功
   */
  async function saveConfigAndClearDraft(silent = false): Promise<boolean> {
    const ok = await saveConfig(silent)
    if (ok && !layoutDirty.value) clearDraft()
    return ok
  }

  /**
   * 切换显示方案：先把当前未保存的改动写成草稿，再加载目标方案。
   *
   * `switchProfile` 会整份重拉布局，未保存改动本来会**静默丢失**（设置页的确认框
   * 只是告知，不会保存）。写成草稿后，用户切回该方案时会被询问是否恢复，
   * 这条路径与「意外关闭页面」共用同一份兜底。
   */
  async function switchProfileWithDraft(id: string): Promise<void> {
    await saveDraft()
    await switchProfile(id)
  }

  /** 删除方案：连同该方案的本地草稿一起清掉（否则 localStorage 里会留下读不到的整份布局）。 */
  async function deleteProfileAndDraft(id: string): Promise<boolean> {
    const deleted = await deleteProfile(id)
    if (deleted) clearDraftFor(id)
    return deleted
  }

  /**
   * 认证变更（登出 / 401）时重置布局域状态：
   * 清空方案列表与编辑历史、核心状态回默认，避免下一个会话读取到上一个用户的布局与方案。
   * 草稿也要清：按用户隔离的 key 虽然不会串号，但上一账号的整份布局没有理由留在本机。
   */
  function resetForAuthChange(): void {
    clearAllDrafts()
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
    saveConfig: saveConfigAndClearDraft,
    saveLayout: saveConfigAndClearDraft,
    revertLayoutConfig,
    fetchProfiles,
    createProfile,
    deleteProfile: deleteProfileAndDraft,
    switchProfile: switchProfileWithDraft,
    availableProfiles,
    saveDraft,
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
