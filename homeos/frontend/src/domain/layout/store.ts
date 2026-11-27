import { ref, computed, type Ref, reactive, watch, nextTick } from 'vue'
import { type FloatingWidget, type UILayoutConfig, type HaConfig, type PanelWidget } from '@/kernel/types/layout'
import { applyTabletDefaultPerformanceMode } from '@/kernel/utils/perf'
import { clonePlain, readLocalStorage, removeLocalStorage, writeLocalStorage, logger, getApiErrorMessage, isConflictError, isLicenseInactiveError, isUnauthorizedError } from '@/kernel/utils/core'
import { fetchProject, saveProject, setActiveProject, fetchConfigProfiles, deleteProject, resolveTerminalProfile, updateSelfTerminalBinding } from '@/domain/api/config'
import { useAuthStore } from '@/domain/auth/auth.store'
import { normalizePageBackground } from '@/kernel/utils/widget/page-background.util'
import { NAV_TAB_ORDER_DEFAULT, normalizeEmbedNavTabLayoutFields, ensureDoorbellList, normalizeSecurityCameras } from '@/kernel/utils/layout'
import { normalizeDashboardFooter, createDefaultDashboardFooter } from '@/domain/energy/constants/dashboard-footer'
import { normalizeSecurityEmergency } from '@/domain/layout/constants/security-emergency'
import { normalizeWholeHomeOff, createDefaultWholeHomeOff } from '@/kernel/constants'
import { type NotifyType } from '@/kernel/types/notify'
import { WIDGET_REGISTRY_META, FLOATING_HUB_TYPE_SET } from '@/kernel/utils/registry/widget-registry-meta'
import { pushServerAccessConfig } from '@/kernel/utils/bridge/native-bridge'
import { fetchSystemNetworkInfo } from '@/kernel/http/index'
import { activateHomeMode } from '@/domain/api/home-modes'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { inferTerminalLabel, getClientDeviceId } from '@/domain/client/utils'
import { createDefaultEnergySources } from '@/domain/energy/model/constants/energy-fields'
import { createDefaultEarthquakeConfig } from '@/kernel/types/earthquake'
import { defineStore, storeToRefs } from 'pinia'

/**
 * @file 布局编辑历史（撤销 / 重做）
 * @module stores/ui/create-edit-history-state
 * @description
 *  单栈编辑历史。
 *  关键路径说明：
 *  - 每个快照记录顶层 floatingWidgets（深拷贝）
 *  - pushEditHistory 默认 300ms 防抖，避免拖拽等连续操作产生过多快照；
 *    immediate=true 时跳过防抖立即推送；force=true 时跳过相同快照去重
 *  - undo/redo 通过 past/future 双栈实现：undo 弹出 past 顶部压入 future，
 *    redo 反之；栈顶始终代表"当前状态"，因此 canUndo 要求 past.length > 1
 *  - 历史栈上限 MAX_EDIT_HISTORY=40，超出时丢弃最旧快照
 *  依赖 Vue ref/computed、布局配置类型与 clonePlain 工具。
 */

/** 单步快照：顶层浮动组件。 */
interface EditSnapshot {
  /** 浮动部件列表（深拷贝） */
  floatingWidgets: FloatingWidget[]
}

/** createEditHistoryState 的依赖注入参数 */
interface EditHistoryDeps {
  /** 布局配置 */
  layoutConfig: UILayoutConfig
  /** 脏标志 ref */
  layoutDirty: Ref<boolean>
  /** 深拷贝工具函数 */
  clonePlain: <T>(value: T) => T
}

/** 编辑历史最大快照数，超出时丢弃最旧快照 */
const MAX_EDIT_HISTORY = 40

/**
 * 编辑模式 undo/redo（单栈）。
 *
 * @param deps 依赖注入参数
 * @returns pushEditHistory / undoEdit / redoEdit / canUndoEdit / canRedoEdit / clearEditHistory
 */
export function createEditHistoryState(deps: EditHistoryDeps) {
  const { layoutConfig, layoutDirty, clonePlain } = deps

  // past 栈（已应用的历史快照，栈顶为当前状态）
  const editHistoryPast = ref<EditSnapshot[]>([])
  // future 栈（撤销后可重做的快照）
  const editHistoryFuture = ref<EditSnapshot[]>([])
  // 防抖定时器句柄，用于合并连续编辑操作
  let editHistoryDebounce: ReturnType<typeof setTimeout> | null = null

  /** 对当前顶层浮动组件做深拷贝快照。 */
  function snapshot(): EditSnapshot {
    return {
      floatingWidgets: clonePlain(layoutConfig.floatingWidgets || []),
    }
  }

  /** 将快照恢复到顶层（深拷贝写入，断开引用）。 */
  function restore(snap: EditSnapshot | undefined) {
    layoutConfig.floatingWidgets = clonePlain(snap?.floatingWidgets || [])
  }

  /**
   * 推送当前快照到 past 栈。
   * @param immediate 是否跳过防抖立即推送
   * @param force 是否跳过相同快照去重
   */
  function pushEditHistory(immediate = false, force = false) {
    const snap = JSON.stringify(snapshot())
    const push = () => {
      const past = editHistoryPast.value
      const last = past[past.length - 1]
      // 去重：与栈顶完全相同则不重复入栈
      if (!force && last && JSON.stringify(last) === snap) return
      past.push(JSON.parse(snap))
      // 超出上限丢弃最旧快照
      if (past.length > MAX_EDIT_HISTORY) past.shift()
      // 新操作清空 future，使既有 redo 链失效
      editHistoryFuture.value = []
    }
    if (immediate) {
      if (editHistoryDebounce) {
        clearTimeout(editHistoryDebounce)
        editHistoryDebounce = null
      }
      push()
      return
    }
    if (editHistoryDebounce) clearTimeout(editHistoryDebounce)
    editHistoryDebounce = setTimeout(() => {
      editHistoryDebounce = null
      push()
    }, 300)
  }

  /** 清空 past/future 栈并取消待执行的防抖定时器 */
  function clearEditHistory() {
    editHistoryPast.value = []
    editHistoryFuture.value = []
    if (editHistoryDebounce) {
      clearTimeout(editHistoryDebounce)
      editHistoryDebounce = null
    }
  }

  /** 是否可撤销：past 栈至少需要 2 个快照（栈顶为当前态，撤销回到前一个） */
  const canUndoEdit = computed(() => editHistoryPast.value.length > 1)
  /** 是否可重做：future 栈非空即可 */
  const canRedoEdit = computed(() => editHistoryFuture.value.length > 0)

  /**
   * 撤销：将当前状态压入 future，弹出 past 栈顶并恢复前一个快照。
   * past.length <= 1 时无可撤销历史，直接返回。
   */
  function undoEdit() {
    const past = editHistoryPast.value
    if (past.length <= 1) return
    // 当前状态入 future 栈供后续 redo
    editHistoryFuture.value.push(snapshot())
    // 弹出当前态，恢复到 past 新栈顶
    past.pop()
    restore(past[past.length - 1])
    layoutDirty.value = true
  }

  /**
   * 重做：从 future 弹出顶部快照，将当前状态压入 past，再恢复该快照。
   * future 为空时无可重做历史，直接返回。
   */
  function redoEdit() {
    const future = editHistoryFuture.value
    if (future.length === 0) return
    const next = future.pop()!
    // 当前状态入 past 栈
    editHistoryPast.value.push(snapshot())
    // 恢复 future 顶部快照
    restore(next)
    layoutDirty.value = true
  }

  return {
    pushEditHistory,
    undoEdit,
    redoEdit,
    canUndoEdit,
    canRedoEdit,
    clearEditHistory,
  }
}

/**
 * @file 编辑模式行为
 * @module stores/ui/create-edit-mode-actions
 * @description
 *  布局编辑模式的顶层行为集合：进入/退出编辑模式、
 *  实体放置（placementEntity）的设置/清除/切换、退出确认流程。
 *  关键路径：
 *  - 进入编辑模式时清空并初始化编辑历史栈
 *  - 退出时若有未保存修改需弹确认框，确认后 reload 配置丢弃修改
 *  依赖多个外部注入的 ref / 方法。
 */

/** 放置实体载荷：id 为 entity_id，type 为可选 widget 类型提示 */
interface PlacementEntityPayload {
  id: string
  type?: string
}

/** createEditModeActions 的依赖注入参数 */
interface EditModeActionsDeps {
  /** 布局配置（调用方仍传入以保持签名一致；当前实现只读 ref 与回调） */
  layoutConfig: UILayoutConfig
  /** 脏标志 ref */
  layoutDirty: Ref<boolean>
  /** 编辑模式开关 ref */
  isEditMode: Ref<boolean>
  /** 当前选中部件 ID ref */
  selectedWidgetId: Ref<string | null>
  /** 当前放置实体 ref */
  placementEntity: Ref<PlacementEntityPayload | null>
  /** 退出编辑确认弹窗开关 ref */
  showExitEditConfirm: Ref<boolean>
  /** 临时抑制 dirty 跟踪的回调（批量操作时使用；调用方仍传入，当前实现未读取） */
  setSuppressDirtyTracking: (v: boolean) => void
  /** 推送编辑历史的回调 */
  pushEditHistory: (immediate?: boolean, force?: boolean) => void
  /** 清空编辑历史的回调 */
  clearEditHistory: () => void
  /** 重新加载配置的回调（丢弃本地修改） */
  loadConfig: () => Promise<void>
}

/**
 * 编辑模式：进入/退出、放置实体（layout 拆分模块）。
 *
 * 集中管理编辑模式的生命周期与放置实体状态，
 * 确保编辑历史的初始化与清理时机正确。
 *
 * @param deps 依赖注入参数
 * @returns 编辑模式开关、放置实体控制等行为函数
 */
export function createEditModeActions(deps: EditModeActionsDeps) {
  const {
    layoutDirty,
    isEditMode,
    selectedWidgetId,
    placementEntity,
    showExitEditConfirm,
    pushEditHistory,
    clearEditHistory,
    loadConfig,
  } = deps

  /**
   * 切换编辑模式开关。
   * 退出时若有未保存修改，弹出退出确认框而不直接退出；
   * 进入时清空历史并推送初始快照；正常退出时重置选中/放置/脏标志。
   */
  function toggleEditMode() {
    if (isEditMode.value && layoutDirty.value) {
      showExitEditConfirm.value = true
      return
    }
    const entering = !isEditMode.value
    isEditMode.value = entering
    if (entering) {
      clearEditHistory()
      pushEditHistory(true)
    } else {
      selectedWidgetId.value = null
      placementEntity.value = null
      layoutDirty.value = false
      clearEditHistory()
    }
  }

  /**
   * 确认退出编辑模式：丢弃本地修改并重新加载远端配置。
   * 清空所有编辑态（选中/放置/历史/脏标志）后 await loadConfig 恢复。
   */
  async function confirmExitEditMode() {
    showExitEditConfirm.value = false
    isEditMode.value = false
    selectedWidgetId.value = null
    placementEntity.value = null
    layoutDirty.value = false
    clearEditHistory()
    await loadConfig()
  }

  /**
   * 设置当前放置实体。仅在编辑模式下生效。
   * @param payload 实体载荷，id 为必填
   */
  function setPlacementEntity(payload: PlacementEntityPayload): void {
    if (!isEditMode.value || !payload?.id) return
    placementEntity.value = { id: payload.id, type: payload.type }
  }

  /** 清除当前放置实体 */
  function clearPlacementEntity() {
    placementEntity.value = null
  }

  /**
   * 切换放置实体：若已选中同一实体则取消，否则设置为该实体。
   * 仅在编辑模式下生效。
   * @param payload 实体载荷
   */
  function togglePlacementEntity(payload: PlacementEntityPayload): void {
    if (!isEditMode.value || !payload?.id) return
    if (placementEntity.value?.id === payload.id) {
      placementEntity.value = null
    } else {
      placementEntity.value = { id: payload.id, type: payload.type }
    }
  }

  /** 取消退出编辑模式（用户在确认框点击"取消"） */
  function cancelExitEditMode() {
    showExitEditConfirm.value = false
  }

  return {
    toggleEditMode,
    confirmExitEditMode,
    setPlacementEntity,
    clearPlacementEntity,
    togglePlacementEntity,
    cancelExitEditMode,
  }
}

/**
 * @file 悬浮组件增删改行为
 * @module stores/ui/create-floor-widget-actions
 * @description
 *  顶层浮动部件（FloatingWidget）的增删改操作（原 2D 楼层热点 CRUD 已随楼层模型移除）。
 *  - addFloatingWidget / updateFloatingWidget / removeFloatingWidget
 *  所有修改操作均标记 layoutDirty；调用方按需推送编辑历史。
 *  依赖 Vue ref 与布局配置类型。
 */

/** createFloorWidgetActions 的依赖注入参数 */
interface FloorWidgetActionsDeps {
  /** 布局配置 */
  layoutConfig: UILayoutConfig
  /** 脏标志 ref */
  layoutDirty: Ref<boolean>
  /** 推送编辑历史的回调 */
  pushEditHistory: (immediate?: boolean, force?: boolean) => void
}

/**
 * 顶层浮动部件增删改（layout 拆分模块）。
 *
 * @param deps 依赖注入参数
 * @returns 浮动部件的增删改函数集合
 */
export function createFloorWidgetActions(deps: FloorWidgetActionsDeps) {
  const { layoutConfig, layoutDirty } = deps

  /** 确保顶层浮动部件数组存在 */
  function ensureFloatingWidgets(): FloatingWidget[] {
    if (!Array.isArray(layoutConfig.floatingWidgets)) {
      layoutConfig.floatingWidgets = []
    }
    return layoutConfig.floatingWidgets
  }

  /**
   * 新增浮动部件。
   * @param widget 浮动部件对象
   */
  function addFloatingWidget(widget: FloatingWidget): void {
    ensureFloatingWidgets().push(widget)
    layoutDirty.value = true
  }

  /**
   * 合并更新指定浮动部件。
   * @param id 部件 ID
   * @param updates 部分字段更新
   */
  function updateFloatingWidget(id: string, updates: Partial<FloatingWidget>): void {
    const widgets = ensureFloatingWidgets()
    const idx = widgets.findIndex((w) => w.id === id)
    if (idx === -1) return
    widgets[idx] = { ...widgets[idx], ...updates }
    layoutDirty.value = true
  }

  /**
   * 按 ID 删除浮动部件。
   * @param id 部件 ID
   */
  function removeFloatingWidget(id: string): void {
    layoutConfig.floatingWidgets = ensureFloatingWidgets().filter((w) => w.id !== id)
    layoutDirty.value = true
  }

  return {
    addFloatingWidget,
    updateFloatingWidget,
    removeFloatingWidget,
  }
}

/** - 持有 layoutConfig 主状态（reactive，深 watch 触发 dirty） */

/**
 * 创建布局核心响应式状态切片
 * @returns layoutConfig / layoutDirty / activeProfileId / 各种加载旗标 / setSuppressDirtyTracking
 */
export function createLayoutCoreState() {
  // 脏标志：任何对 layoutConfig 的修改都会触发 dirty watch 标记 true
  const layoutDirty = ref(false)
  // 布局配置主状态（reactive 深响应，由 dirty watch 跟踪）
  const layoutConfig = reactive<UILayoutConfig>(clonePlain(getDefaultLayout()))
  // 应用平板默认性能模式（如调低渲染模式、关闭玻璃效果等）
  applyTabletDefaultPerformanceMode(layoutConfig)

  // 当前激活方案 ID（从 localStorage 读取，默认 'default'）
  const activeProfileId = ref(readStoredProfileId())
  // 方案列表加载中标志
  const isProfilesLoading = ref(false)
  // 方案列表加载失败文案
  const profilesLoadError = ref('')
  // 当前方案配置是否已加载完成（dirty watch 需等加载完成后才生效）
  const isConfigLoaded = ref(false)
  // 当前方案配置是否正在加载
  const isConfigLoading = ref(false)

  // dirty 跟踪抑制标志（楼层切换 / 批量覆盖等场景临时关闭，避免误标脏）
  let suppressDirtyTracking = false
  /** 设置 dirty 跟踪抑制开关；批量操作期间调用 true，结束后 nextTick 内调用 false */
  function setSuppressDirtyTracking(v: boolean) {
    suppressDirtyTracking = v
  }

  // 注册 dirty 跟踪 watch：深 watch layoutConfig，未抑制且配置已加载时标记 dirty
  createLayoutDirtyTracking({
    layoutConfig,
    layoutDirty,
    isConfigLoaded,
    isSuppressing: () => suppressDirtyTracking,
  })

  /**
   * 认证变更（登出 / 401）时重置核心布局状态：
   * 配置回默认布局、清除加载/脏标志与激活方案，避免沿用上一个用户的方案与编辑态。
   */
  function resetCoreState(): void {
    isConfigLoading.value = false
    isConfigLoaded.value = false
    layoutDirty.value = false
    isProfilesLoading.value = false
    profilesLoadError.value = ''
    activeProfileId.value = 'default'
    Object.assign(layoutConfig, clonePlain(getDefaultLayout()))
    applyTabletDefaultPerformanceMode(layoutConfig)
  }

  return {
    layoutConfig,
    layoutDirty,
    activeProfileId,
    isProfilesLoading,
    profilesLoadError,
    isConfigLoaded,
    isConfigLoading,
    setSuppressDirtyTracking,
    resetCoreState,
  }
}

/** - 只在「干净」时挂深 watch：脏了之后继续整树遍历纯属浪费 */

/**
 * 全局脏标记追踪：任何对 layoutConfig 的修改（含设置页 v-model）都会标记 layoutDirty。
 * 拖拽热点应写浅层 preview，松手再提交，避免本 watch 每帧扇出。
 *
 * 为什么不是「浅层 watch + 显式 markDirty」：layoutConfig 是深 reactive（设置页的 v-model
 * 直接改嵌套字段），浅层 watch 看不到这些改动，会静默丢掉用户的修改——比多几次遍历危险得多。
 * 实际开销来自「每次变更都重走一遍整棵布局树收集依赖」：所以这里只在脏标志还是 false 的
 * 时候才挂深 watch，第一次变更把它置 true 后立刻卸掉，保存 / 加载把标志复位时再挂回来。
 *
 * @param opts.layoutConfig 布局配置对象（深 watch 目标）
 * @param opts.layoutDirty 脏标志 ref
 * @param opts.isConfigLoaded 配置是否已加载 ref（未加载完成时不标记脏）
 * @param opts.isSuppressing 是否抑制 dirty 跟踪的回调（楼层切换 / 批量覆盖时返回 true）
 * @returns stopLayoutDirtyWatch：停止 watch 的函数
 */
export function createLayoutDirtyTracking(opts: {
  layoutConfig: UILayoutConfig
  layoutDirty: Ref<boolean>
  isConfigLoaded: Ref<boolean>
  isSuppressing: () => boolean
}) {
  const { layoutConfig, layoutDirty, isConfigLoaded, isSuppressing } = opts
  let stopDeep: (() => void) | null = null

  /** 卸掉深 watch（已脏 / 已停用时） */
  function disarm(): void {
    if (stopDeep === null) return
    stopDeep()
    stopDeep = null
  }

  /** 挂上深 watch（仅在干净状态下挂，保证「第一次变更」一定能被看到） */
  function arm(): void {
    if (stopDeep !== null) return
    stopDeep = watch(
      layoutConfig,
      () => {
        // 批量操作抑制期间跳过，避免误标脏
        if (isSuppressing()) return
        // 配置未加载完成跳过，避免初始默认值 / 服务端覆盖被误标脏
        if (!isConfigLoaded.value) return
        layoutDirty.value = true
        // 已经脏了，「下一次变更」不再需要整树遍历（设置页每敲一个字都走一遍太贵）
        disarm()
      },
      { deep: true },
    )
  }

  // dirty 复位（保存完成 / 加载完成 / 重置）后重新挂上。
  // 用 sync：复位与重挂之间若隔着一次 flush，同一 tick 内的后续改动会被漏掉。
  const stopReset = watch(
    layoutDirty,
    (dirty) => {
      if (dirty) disarm()
      else arm()
    },
    { flush: 'sync' },
  )

  arm()

  return {
    stopLayoutDirtyWatch: () => {
      disarm()
      stopReset()
    },
  }
}

/**
 * @file 布局未保存草稿持久化
 * @module stores/ui/create-layout-draft-state
 * @description
 *  将未保存的布局编辑以草稿形式持久化到 localStorage，
 *  防止用户刷新/关闭页面时丢失编辑中的布局。
 *  - saveDraft: 仅在 layoutDirty 时写入，含时间戳
 *  - loadDraft: 启动时尝试恢复，成功后清除草稿并标记 dirty
 *  - clearDraft: 主动清除草稿（保存成功或放弃编辑后调用）
 *  还注册了 beforeunload 钩子，在页面卸载前自动保存草稿。
 *  依赖 Vue ref、logger 与 clonePlain 工具。
 */


/** localStorage 中草稿的存储 key */
const DRAFT_KEY = 'homeos_layout_draft'

/** createLayoutDraftState 的依赖注入参数 */
interface LayoutDraftStateDeps {
  /** 布局配置对象（响应式） */
  layoutConfig: UILayoutConfig
  /** 脏标志（true 表示有未保存修改） */
  layoutDirty: Ref<boolean>
}

/**
 * 布局未保存草稿 localStorage 持久化（layout 拆分模块）。
 *
 * 提供草稿的保存、加载、清除三个操作，并自动监听 beforeunload 事件
 * 在页面关闭前抢救未保存的编辑。草稿仅作为崩溃/刷新兜底，
 * 不替代正式保存流程。
 *
 * @param deps 包含 layoutConfig 与 layoutDirty 的依赖
 * @returns saveDraft / loadDraft / clearDraft 三个方法
 */
export function createLayoutDraftState(deps: LayoutDraftStateDeps) {
  const { layoutConfig, layoutDirty } = deps

  /**
   * 保存当前布局为草稿到 localStorage。
   * 仅在脏标志为 true 时执行；失败时仅记录调试日志，不抛出异常，
   * 避免阻塞正常流程（草稿只是兜底，失败可接受）。
   */
  async function saveDraft() {
    try {
      if (!layoutDirty.value) return
      const draft = JSON.stringify({
        layoutConfig: clonePlain(layoutConfig),
        timestamp: Date.now(),
      })
      writeLocalStorage(DRAFT_KEY, draft)
    } catch (e: unknown) {
      logger.debug('布局草稿保存失败', e instanceof Error ? e.message : e)
    }
  }

  /**
   * 从 localStorage 读取并恢复草稿。
   * 成功恢复后立即清除草稿（避免重复恢复）并标记 dirty 触发保存提示。
   * @returns 是否成功恢复了草稿
   */
  function loadDraft() {
    try {
      const raw = readLocalStorage(DRAFT_KEY)
      if (!raw) return false
      const draft = JSON.parse(raw)
      if (!draft.layoutConfig) return false
      Object.assign(layoutConfig, draft.layoutConfig)
      removeLocalStorage(DRAFT_KEY)
      layoutDirty.value = true
      return true
    } catch (e: unknown) {
      logger.debug('布局草稿读取失败', e instanceof Error ? e.message : e)
      return false
    }
  }

  /**
   * 清除草稿并重置脏标志。
   * 通常在正式保存成功或用户放弃编辑后调用。
   */
  function clearDraft() {
    removeLocalStorage(DRAFT_KEY)
    layoutDirty.value = false
  }

  // 注册 beforeunload 钩子：页面卸载前若有未保存修改则抢救性保存草稿
  // 应用级单例监听（页面生命周期即其生命周期），触发点之后进程就结束了，不配对移除。
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (layoutDirty.value) {
        void saveDraft()
      }
    })
  }

  return {
    saveDraft,
    loadDraft,
    clearDraft,
  }
}

/**
 * @file 布局配置加载/保存
 * @module stores/ui/create-layout-persistence
 * @description
 *  布局配置的加载、合并默认值、保存全流程（关键路径）。
 *  核心流程：
 *  - loadConfig: 200ms 防抖 + 请求去重 + requestId 竞态保护，
 *    从服务端拉取方案布局 -> mergeLayoutWithDefaults 合并默认值 ->
 *    写入 layoutConfig -> 同步激活方案 -> 触发 onAfterLoad
 *  - saveConfig: HA URL 校验 -> cloneLayoutForApi 清理运行时字段 -> saveProject 写入
 *  - sanitize/normalize：statsSensors / haConfig / favoriteEntities / panel / floating widgets 等
 *  依赖 config API、auth store、defaults、tablet 性能模式、HA URL 校验等。
 */

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
 * @param layout 原始布局对象
 * @returns 清理后的布局副本
 */
function cloneLayoutForApi(layout: Record<string, unknown>) {
  const copy = clonePlain(layout) as Record<string, unknown>
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
/** 归一化背景图 URL：空值返回 `undefined`（由调用方回落到默认值）。 */
function normalizeDisplayBackdropUrl(raw: unknown): string | undefined {
  return String(raw ?? '').trim() || undefined
}

/**
 * 归一化侧边栏页面背景（0.8.9）。
 *
 * 与主页面共用同一份模型（`shared/utils/widget/page-background.util`），这里直接转调，
 * 避免「布局配置一套区间、文档组件另一套区间」导致同一份背景在两侧显示不同。
 *
 * 返回可展开的片段：缺失时不产生键（旧观感），给了才归一化 ——
 * 这样 `mergeLayoutWithDefaults` 里不必再写一个三元。
 */
function sidebarBackgroundField(raw: unknown): { sidebarBackground?: ReturnType<typeof normalizePageBackground> } {
  return raw ? { sidebarBackground: normalizePageBackground(raw) } : {}
}

/** 取字符串字段：优先传给服务端的值，其次默认值，都没有时给空串。 */
function pickSensorText(src: Record<string, unknown>, defaults: Record<string, unknown>, key: string): string {
  return String(src[key] ?? defaults[key] ?? '')
}

function sanitizeStatsSensors(raw: Record<string, unknown> | null | undefined) {
  const defaults = getDefaultLayout().statsSensors
  const defaultMap = defaults as unknown as Record<string, unknown>
  const src = raw || {}
  return {
    lights: pickSensorText(src, defaultMap, 'lights'),
    climates: pickSensorText(src, defaultMap, 'climates'),
    battery: pickSensorText(src, defaultMap, 'battery'),
    offline: pickSensorText(src, defaultMap, 'offline'),
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
 * - securityCameras 归一成 `[{entityId, go2rtcUrl?}]`
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
  const securityCameras = normalizeSecurityCameras(merged.securityCameras)
  merged.securityCameras = securityCameras
  // 校正门铃摄像头引用：若不在 securityCameras 列表中则清空，避免失效引用
  const cameras = securityCameras.map((binding) => binding.entityId).filter(Boolean)
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
  // 防抖窗口内的等待者：定时器重排时要一起带走，否则前一个调用者的 Promise 永远不 settle
  let loadConfigWaiters: Array<{ resolve: () => void; reject: (reason?: unknown) => void }> = []
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
   * 当前方案的布局版本（服务端 `updatedAt`）。
   * 保存时作为 `expectedUpdatedAt` 回传做乐观锁：两个终端同时改布局时，
   * 后写的一方会被 409 拒绝，而不是静默把先写方的整份快照覆盖掉。
   */
  let loadedUpdatedAt: string | null = null

  /**
   * 将远端布局与默认值深度合并，确保所有字段存在且结构合法。
   * 处理 floors / haConfig / statsSensors / dashboardFooter / 各类安全配置、
   * 导航 tab、地震、agent、频道、房间统计等字段的合并与规范化。
   * @param layout 远端原始布局
   * @returns 合并默认值后的布局对象
   */
  function mergeLayoutWithDefaults(layout: Record<string, unknown>) {
    const securityEmergency = layout.securityEmergency as Record<string, unknown> | undefined
    const haConfig = layout.haConfig as Record<string, unknown> | undefined

    const merged: Record<string, unknown> = {
      ...getDefaultLayout(),
      ...layout,
      floatingWidgets: sanitizeFloatingWidgets(layout.floatingWidgets),
      lightOnBackgroundUrl:
        normalizeDisplayBackdropUrl(layout.lightOnBackgroundUrl) ?? getDefaultLayout().lightOnBackgroundUrl,
      lightOffBackgroundUrl:
        normalizeDisplayBackdropUrl(layout.lightOffBackgroundUrl) ?? getDefaultLayout().lightOffBackgroundUrl,
      rightPanelWidgets: sanitizePanelWidgets(layout.rightPanelWidgets),
      // 0.8.9 侧边栏页面背景：缺失保持 undefined（旧观感），给了才归一化。
      // `cloneLayoutForApi` 会深拷整个 config，归一化后的对象原样上行；旧后端宽表不丢键。
      ...sidebarBackgroundField(layout.sidebarBackground),
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
      securityModes: Array.isArray(layout.securityModes) ? layout.securityModes : getDefaultLayout().securityModes,
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
      mediaConfig: {
        ...getDefaultLayout().mediaConfig,
        ...((layout.mediaConfig as object) || {}),
      },
      mobileRoomStats: {
        ...getDefaultLayout().mobileRoomStats,
        ...((layout.mobileRoomStats as object) || {}),
      },
    }
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
   * 把一次成功的加载结果应用到本地状态。
   *
   * 独立成函数是为了让在途请求的 IIFE 只剩「取数 + 错误分级」，避免一个几百行的匿名
   * 箭头函数把成功路径埋在中间。
   * 竞态保护留在调用点：requestId 与方案都未变化才算有效响应。
   * @param payload 接口返回的 data.data
   * @param profile 发起请求时的方案 ID
   */
  function applyLoadedProjectPayload(
    payload: { layout?: unknown; layoutParseError?: boolean; updatedAt?: string } | undefined,
    profile: string,
  ): void {
    // JSON 损坏容错：提示用户并回退空布局
    if (payload?.layoutParseError) {
      notify('布局配置 JSON 已损坏，已回退为空布局。请重新配置。', 'error', 8000)
    }
    if (payload?.layout) {
      const { layout: merged } = applyLayoutFromRaw(payload.layout as Record<string, unknown>)
      Object.assign(layoutConfig, merged)
    }
    // 记录本次读取的版本：保存时回传，用于检测期间是否有别的终端写过
    loadedUpdatedAt = String(payload?.updatedAt ?? '').trim() || null

    isConfigLoaded.value = true
    applyTabletDefaultPerformanceMode(layoutConfig)
    void setActiveProject(profile).catch((e: unknown) => {
      const caughtMessage = e instanceof Error ? e.message : String(e)
      logger.warn(`同步激活方案失败: ${caughtMessage}`)
    })
    if (onAfterLoad) void onAfterLoad()
    // 布局加载完成后同步一次远程访问地址给原生端（外网漫游取回入口）
    void syncServerAccessToNative(String(layoutConfig.externalUrl ?? ''))
  }

  /**
   * 加载失败的错误分级（401 / 未激活 / 其他）。
   *
   * 只有「其他」才把异常继续向上抛：App.vue 的 watch 是 fire-and-forget，抛出会变成
   * unhandledrejection 被 client-log 当成前端异常上报；401 已由 api-client 统一处理
   * （清登录态 + 跳登录页），这里只安静降级。
   * @param err 捕获到的异常
   * @param requestId 本次请求的序号（过期请求的错误直接丢弃）
   */
  function handleLoadConfigError(err: unknown, requestId: number): void {
    if (requestId !== loadConfigRequestId) return
    if (isLicenseInactiveError(err)) {
      logger.debug('商业授权未激活,跳过 UI 配置加载')
      isConfigLoaded.value = false
      return
    }
    if (isUnauthorizedError(err)) {
      logger.debug('登录状态已失效，跳过 UI 配置加载（已交由认证流程处理）')
      isConfigLoaded.value = false
      applyTabletDefaultPerformanceMode(layoutConfig)
      return
    }
    logger.error('加载UI配置失败', err)
    notify(`加载配置失败: ${getApiErrorMessage(err, err instanceof Error ? err.message : undefined)}`, 'error')
    // 加载失败时不标记已加载：避免 dirty watch 生效后用户基于空配置编辑并保存覆盖服务端真实配置。
    // 仅应用默认性能模式以保证 UI 可用，但 isConfigLoaded 保持 false 阻止自动保存。
    isConfigLoaded.value = false
    applyTabletDefaultPerformanceMode(layoutConfig)
    throw err
  }

  /**
   * 加载当前方案的布局配置。
   * 关键路径，包含多重保护：
   * - 200ms 防抖：合并快速连续调用（**所有等待者**共享同一次结果）
   * - 在途请求去重：并发调用复用同一 Promise
   * - requestId 竞态保护：方案切换后丢弃过期响应
   * - layoutParseError 容错：JSON 损坏时提示并回退空布局
   * @returns 加载完成的 Promise
   */
  function loadConfig(): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) return Promise.resolve()

    const promise = new Promise<void>((resolve, reject) => {
      loadConfigWaiters.push({ resolve, reject })
    })
    // 重排定时器时必须保留已排队的等待者：旧实现只 clearTimeout，前一个调用的
    // resolve/reject 随被清掉的回调一起消失，await loadConfig() 永远不 settle
    // （切换方案后 200ms 内退出编辑模式 → 转圈不消失）。
    if (loadConfigDebounceTimer) clearTimeout(loadConfigDebounceTimer)
    loadConfigDebounceTimer = setTimeout(() => {
      loadConfigDebounceTimer = null
      const waiters = loadConfigWaiters
      loadConfigWaiters = []
      void settleLoadConfig(waiters)
    }, 200)
    return promise
  }

  async function settleLoadConfig(
    waiters: Array<{ resolve: () => void; reject: (reason?: unknown) => void }>,
  ): Promise<void> {
    const resolveAll = () => {
      for (const waiter of waiters) waiter.resolve()
    }
    const rejectAll = (err: unknown) => {
      for (const waiter of waiters) waiter.reject(err)
    }
    // 复用在途请求，避免重复拉取；仅当目标方案一致时才复用，
    // 否则方案切换后会复用旧方案的在途请求，导致新方案配置永不加载。
    if (loadConfigInFlight && loadConfigInFlightProfile === activeProfileId.value) {
      try {
        await loadConfigInFlight
        resolveAll()
      } catch (err) {
        rejectAll(err)
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
        applyLoadedProjectPayload(res.data?.data, profileAtStart)
      } catch (err) {
        handleLoadConfigError(err, requestId)
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
      resolveAll()
    } catch (err) {
      rejectAll(err)
    } finally {
      // 仅当未被更新的在途请求替换时才清理，避免误清新请求的去重状态
      if (loadConfigInFlight === inFlight) {
        loadConfigInFlight = null
        loadConfigInFlightProfile = null
      }
    }
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
    // 配置尚未加载完成（首屏 / 切换方案 / 上次加载失败）：layoutConfig 还是默认值或旧方案，
    // 此时写库会用这份「假数据」整份覆盖服务端布局。统一在入口拦下，
    // 避免每个调用点各写一遍 isConfigLoaded 判断（漏一个就等于给了破窗）。
    if (!isConfigLoaded.value) {
      if (!isConfigLoading.value) void loadConfig()
      if (!silent) {
        notify(
          isConfigLoading.value ? '布局仍在加载中，请稍后再保存' : '布局尚未加载完成，已重新拉取配置，请稍后再保存',
          'warning',
        )
      }
      return false
    }
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
      /** 本轮是否撞上 409：结束后要重新拉取最新布局，避免拿着过期版本反复失败 */
      let conflictDetected = false
      try {
        do {
          const runSilent = saveConfigQueuedSilent
          saveConfigNeedsResave = false
          try {
            // 目标方案在这一刻锚定：clone 与 saveProject 之间没有 await，写入内容与目标
            // 方案必然配对；但 await 期间用户可能切走方案，所以保存后的副作用必须再核对。
            const targetProfileId = activeProfileId.value
            const layout = cloneLayoutForApi(layoutConfig)
            // 乐观锁：带上读取时的版本；服务端发现已被别人改过会返回 409
            const expectedUpdatedAt = loadedUpdatedAt
            const response = await saveProject(targetProfileId, {
              layout,
              ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
            })
            // 服务端返回新版本号，后续保存以此为基线
            loadedUpdatedAt = String(response?.data?.data?.updatedAt ?? '').trim() || loadedUpdatedAt
            if (activeProfileId.value !== targetProfileId) {
              // 保存期间切换了方案：这次写入落在旧方案上，已不属于「当前」状态。
              // 若继续执行下面的副作用，会把新方案刚载入的干净状态标成已保存
              // （layoutDirty=false）、并把新方案的 externalUrl 推给原生端。
              logger.warn(
                `保存期间切换了方案（${targetProfileId} -> ${activeProfileId.value}），` +
                  '本次写入已落库，但不再更新当前方案的脏标记与原生端入口',
              )
              lastOk = true
              break
            }
            if (!runSilent) notify('布局配置已保存', 'success')
            // 保存成功后推送远程访问地址，原生端无需重启即可拿到新入口
            void syncServerAccessToNative(String(layout.externalUrl ?? ''))
            layoutDirty.value = false
            lastOk = true
          } catch (err) {
            if (isConflictError(err)) {
              // 乐观锁拒绝：别的终端已经写过这份方案。整份快照无法合并，
              // 继续说「保存成功」或强行覆盖都会抹掉对方的改动 —— 报错并重新拉取。
              logger.warn('布局保存版本冲突（其他终端已修改）')
              notify('该方案已在其他终端被修改，本次修改未保存；已重新加载最新布局，请确认后重试', 'error', 9000)
              lastOk = false
              saveConfigNeedsResave = false
              conflictDetected = true
              break
            }
            logger.error('保存UI配置失败', err)
            notify(`保存布局失败: ${getApiErrorMessage(err, err instanceof Error ? err.message : undefined)}`, 'error')
            lastOk = false
            // 失败后仍消费排队标记，避免错误状态下死循环；调用方需再次主动保存
            saveConfigNeedsResave = false
            break
          }
        } while (saveConfigNeedsResave)
        if (conflictDetected) {
          // 冲突后把版本号 / 布局拉回服务端最新，用户刷新视角后可重新编辑再保存
          void Promise.resolve(loadConfig()).catch(() => {
            /* 重新加载失败会由 loadConfig 自己提示 */
          })
        }
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

/**
 * @file 布局方案 CRUD 与切换
 * @module stores/ui/create-layout-profile-actions
 * @description
 *  布局显示方案（profile）的增删改查与切换：
 *  - fetchProfiles: 拉取服务端方案列表
 *  - createProfile: 以当前布局另存为新方案
 *  - deleteProfile: 删除指定方案（default 不可删）；删除当前方案时自动切回 default
 *  - switchProfile: 切换方案，写入本地存储、同步服务端激活态、重载配置，
 *    并按 profileHomeMode 绑定自动激活对应家庭模式
 *  - maybeActivateProfileHomeMode: 方案切换后按绑定自动激活家庭模式
 *  依赖 config / home-modes API、logger、终端标签推断与本地存储工具。
 */

/** 方案摘要信息 */
interface LayoutProfileSummary {
  /** 方案 ID */
  projectId: string
  /** 最后更新时间（可选） */
  updatedAt?: string
}

/** createLayoutProfileActions 的依赖注入参数 */
interface LayoutProfileActionsDeps {
  /** 布局配置 */
  layoutConfig: UILayoutConfig
  /** 当前激活方案 ID ref */
  activeProfileId: Ref<string>
  /** 方案列表加载中标志 ref */
  isProfilesLoading: Ref<boolean>
  /** 方案列表加载失败文案 */
  profilesLoadError: Ref<string>
  /** 配置是否已加载标志 ref */
  isConfigLoaded: Ref<boolean>
  /** 统一 API 错误处理回调 */
  handleApiError: (err: unknown, fallbackMsg: string) => void
  /** 重新加载配置的回调 */
  loadConfig: () => Promise<void>
}

/**
 * 布局方案 CRUD 与切换（layout 拆分模块）。
 *
 * @param deps 依赖注入参数
 * @returns availableProfiles / fetchProfiles / createProfile / deleteProfile / switchProfile / maybeActivateProfileHomeMode
 */
export function createLayoutProfileActions(deps: LayoutProfileActionsDeps) {
  const {
    layoutConfig,
    activeProfileId,
    isProfilesLoading,
    profilesLoadError,
    isConfigLoaded,
    handleApiError,
    loadConfig,
  } = deps

  /** 可用方案列表 */
  const availableProfiles = ref<LayoutProfileSummary[]>([])

  /** success:false 时按 active/failedCount 选 toast 文案。 */
  function homeModeActivateFailureMessage(data: { error?: string; active?: boolean; failedCount?: number }): string {
    if (data?.error) return data.error
    if (data?.active !== true) return '方案已切换，但绑定的家庭模式激活失败'
    const failed = Number(data?.failedCount ?? 0)
    if (failed > 0) return `方案已切换，模式已激活但 ${failed} 个设备执行失败`
    return '方案已切换，模式已激活但部分设备执行失败'
  }

  function notifyHomeModeActivateFailure(data: { error?: string; active?: boolean; failedCount?: number }): void {
    useChromeStore().notify(homeModeActivateFailureMessage(data), data?.active === true ? 'warning' : 'error')
    logger.warn('方案切换后家庭模式激活未成功', data)
  }

  function profileHomeModeToActivate(): string | null {
    const binding = layoutConfig.profileHomeMode
    if (!binding?.autoActivate) return null
    const mode = String(binding.onSwitch || '').trim()
    return mode || null
  }

  /**
   * 若当前方案绑定了自动激活家庭模式，则触发激活。
   * 仅在 autoActivate=true 且 onSwitch 非空时执行；失败仅警告不阻断流程。
   */
  async function maybeActivateProfileHomeMode() {
    const modeId = profileHomeModeToActivate()
    if (!modeId) return
    try {
      const { data } = await activateHomeMode(modeId)
      if (data?.success === false) notifyHomeModeActivateFailure(data)
    } catch (err) {
      useChromeStore().notify('方案已切换，但绑定的家庭模式激活失败', 'error')
      logger.warn('方案切换后家庭模式激活失败', err)
    }
  }

  /**
   * 拉取服务端方案列表并更新 availableProfiles。
   * 失败时通过 handleApiError 统一处理。
   */
  async function fetchProfiles() {
    isProfilesLoading.value = true
    profilesLoadError.value = ''
    try {
      const res = await fetchConfigProfiles()
      availableProfiles.value = res.data?.data || []
    } catch (err) {
      profilesLoadError.value = '获取显示方案列表失败'
      handleApiError(err, '获取显示方案列表失败')
    } finally {
      isProfilesLoading.value = false
    }
  }

  /**
   * 以当前布局创建新方案。
   * @param name 新方案名称
   * @returns 是否创建成功
   */
  async function createProfile(name: string): Promise<boolean> {
    try {
      await saveProject(name, { layout: { ...layoutConfig } })
      await fetchProfiles()
      return true
    } catch (err) {
      handleApiError(err, '创建方案失败')
      return false
    }
  }

  /**
   * 删除指定方案。default 方案不可删除。
   * 删除当前激活方案时自动切换回 default。
   * @param id 方案 ID
   * @returns 是否删除成功
   */
  async function deleteProfile(id: string): Promise<boolean> {
    if (id === 'default') return false
    try {
      await deleteProject(id)
      await fetchProfiles()
      if (activeProfileId.value === id) {
        await switchProfile('default')
      }
      return true
    } catch (err) {
      handleApiError(err, '删除方案失败')
      return false
    }
  }

  /**
   * 切换到指定方案。
   * 依次：更新本地 ID -> 写入存储 -> 标记配置未加载 -> 同步服务端激活态 ->
   * 重载配置 -> 按绑定激活家庭模式 -> 绑定当前终端到该方案。
   * @param id 目标方案 ID
   */
  async function switchProfile(id: string): Promise<void> {
    activeProfileId.value = id
    writeStoredProfileId(id)
    isConfigLoaded.value = false
    try {
      await setActiveProject(id)
    } catch (err) {
      logger.warn('同步激活配置方案到服务端失败', err)
    }
    await loadConfig()
    await maybeActivateProfileHomeMode()
    void bindSelfTerminalProfile(id, inferTerminalLabel())
  }

  return {
    availableProfiles,
    fetchProfiles,
    createProfile,
    deleteProfile,
    switchProfile,
    maybeActivateProfileHomeMode,
  }
}

/**
 * @file 布局层基础状态与持久化 key
 * @module stores/ui/create-layout-state
 * @description
 *  布局配置切片的基础常量与 localStorage profile 持久化工具。
 *  导出侧栏部件的已知类型集合（KNOWN_PANEL_WIDGET_TYPES），用于配置加载时的白名单过滤。
 *  profile ID 持久化区分"从未设置"与"主动选择 default"两种状态。
 *  依赖 widget-registry-meta 中的注册表元数据。
 */


/**
 * 已知的侧栏/仪表盘部件类型集合。
 * 从 WIDGET_REGISTRY_META 中筛选 surfaces 包含 'sidebar' 或 'dashboard' 的类型。
 * 用于配置加载时过滤未知部件类型，防止渲染异常。
 */
export const KNOWN_PANEL_WIDGET_TYPES = new Set<string>([
  ...Object.entries(WIDGET_REGISTRY_META)
    .filter(([, def]) => def.surfaces.some((s: string) => s === 'sidebar' || s === 'dashboard'))
    .map(([type]) => type),
])

/** localStorage 中存储当前 profile ID 的 key */
const PROFILE_STORAGE_KEY = 'homeos_profile_id'

/**
 * 读取本地存储的 profile ID。
 * 在非浏览器环境（如 SSR）或未设置时返回 'default'。
 * @returns 当前激活的 profile ID
 */
export function readStoredProfileId(): string {
  if (typeof localStorage === 'undefined') return 'default'
  return readLocalStorage(PROFILE_STORAGE_KEY) || 'default'
}

/**
 * 是否曾显式写入过 profile（区分"从未设置"与"主动选择 default"）。
 * @returns 是否存在已存储的 profile ID
 */
export function hasStoredProfileId(): boolean {
  if (typeof localStorage === 'undefined') return false
  return readLocalStorage(PROFILE_STORAGE_KEY) != null
}

/**
 * 将 profile ID 写入 localStorage 持久化。
 * 非浏览器环境直接返回。
 * @param id 要持久化的 profile ID
 */
export function writeStoredProfileId(id: string): void {
  if (typeof localStorage === 'undefined') return
  writeLocalStorage(PROFILE_STORAGE_KEY, id)
}

/** UI 布局默认配置数据模块 */

/**
 * 构建默认布局
 *
 * 返回一份完整的 UILayoutConfig 默认对象，包含：
 * - 部件（floatingWidgets / rightPanelWidgets）
 * - 收藏实体分类（favoriteEntities）
 * - 事件日志与页脚配置（eventLogConfig / dashboardFooter）
 * - 导航标签可见性（navTabVisibility）
 * - HA 实体绑定配置（haConfig；连接地址/令牌单源在 stores/ha-connection.store.ts）
 * - 统计传感器映射（statsSensors）
 * - 性能与渲染模式（performanceMode / glassEffect）
 * - 安防模式定义与联动（securityModes / securityModeLinks / securityEmergency）
 * - 地震预警配置（earthquakeConfig）
 * - AI 助手与通知渠道配置（agentConfig / channelConfig）
 *
 * @returns 全新的 UILayoutConfig 默认对象（每次调用返回新实例）
 */
function createDefaultLayout(): UILayoutConfig {
  return {
    lightOnBackgroundUrl: '/backgrounds/light_on.webp',
    lightOffBackgroundUrl: '/backgrounds/light_off.webp',
    /**
     * 0.8.9 侧边栏页面背景：**默认关闭**（`undefined` = 不铺背景，保持旧观感）。
     * 用户在外观设置里选了背景才写入；与主页面的页面背景共用同一份模型
     * （`shared/utils/widget/page-background.util`）。
     */
    sidebarBackground: undefined,
    // 悬浮组件（顶层）
    floatingWidgets: [],
    pageMaxWidth: 1366,
    siteTitle: 'HomeOS',
    rightPanelWidth: 300,
    rightPanelWidgets: [],
    // 收藏实体按 domain 分类，初始均为空数组
    favoriteEntities: {
      light: [],
      climate: [],
      sensor: [],
      switch: [],
      offline: [],
      battery: [],
      media_player: [],
      cover: [],
      fan: [],
      lock: [],
    },
    // 事件日志浮层：默认开启，自定义位置
    eventLogConfig: {
      enabled: true,
      position: 'custom',
      xPct: 70,
      yPct: 78,
      width: 360,
      maxHeight: 200,
      displayDuration: 4,
    },
    dashboardFooter: createDefaultDashboardFooter(),
    panelPosition: 'right',
    navTabOrder: [],
    // 导航标签默认可见性：设备/安防默认显示
    navTabVisibility: {
      devices: true,
      rooms: false,
      security: true,
      events: false,
      notifications: false,
      'earthquake-history': false,
      'template-entities': false,
      reports: false,
    },
    navTabPlacement: {},
    wholeHomeOff: createDefaultWholeHomeOff(),
    // HA 实体绑定：门铃、安防摄像头、天气、扫地机、隐患传感器等
    // 连接地址/令牌不在这里 —— 见 stores/ha-connection.store.ts（单源 ha_connections 表）
    haConfig: {
      eventsPath: '',
      securityCamera: '',
      securityCameras: [],
      weatherEntityId: '',
      doorbells: [],
      motionSensorEntityId: '',
      hazardSmokeEntityIds: [],
      hazardGasEntityIds: [],
      hazardLeakEntityIds: [],
      hazardEmergencySceneId: '',
      hazardGasValveEntityId: '',
      hazardWaterValveEntityId: '',
      hazardExhaustFanEntityIds: '',
    },
    // 统计传感器：灯/空调/电量/离线计数实体 ID
    statsSensors: {
      lights: '',
      climates: '',
      battery: '',
      offline: '',
      energySources: createDefaultEnergySources(),
    },
    performanceMode: 'high',
    smartPerformanceMode: true,
    glassEffect: 'auto',
    // 媒体库连接：默认未配置，地址与令牌在「媒体与入库」设置页填写
    mediaConfig: { maUrl: '', maToken: '', mpUrl: '', mpToken: '', arrivalIntervalSeconds: 90 },
    awaySimulationLightPool: [],
    customEmbeds: [],
    embeddedPages: [],
    // 设置锁：默认关闭，PIN 为空
    settingsLock: { enabled: false, pin: '' },
    isAfhLocked: true,
    // 安防模式：离家 / 居家 / 夜间 / 撤防，对应 HA alarm_control_panel 的四种状态
    securityModes: [
      { key: 'armed_away', name: '离家', icon: 'Shield', actions: [] },
      { key: 'armed_home', name: '居家', icon: 'Home', actions: [] },
      { key: 'armed_night', name: '夜间', icon: 'Moon', actions: [] },
      { key: 'disarmed', name: '撤防', icon: 'ShieldOff', actions: [] },
    ],
    securityModeLinks: {
      armed_away: '',
      armed_home: '',
      armed_night: '',
      disarmed: '',
    },
    profileHomeMode: {
      autoActivate: false,
      onSwitch: '',
    },
    // 安防紧急模式：全屋联动，灯光全亮，可选自动离家布防
    securityEmergency: {
      mode: 'full_home',
      appendBuiltin: false,
      appendMode: 'full_home',
      lightBrightnessPct: 100,
      lightPool: [],
      autoArmAway: false,
      actions: [],
      useBuiltinFallback: true,
    },
    earthquakeConfig: createDefaultEarthquakeConfig(),
    // AI 助手配置：默认使用 DeepSeek
    agentConfig: {
      provider: 'deepseek',
      apiKey: '',
      apiBase: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      language: 'zh',
      systemPrompt: '',
      mcpGatewaySecret: '',
      mcpActorUserId: '',
      // 场景语音控制默认全禁（fail-closed）：需在设置中显式启用并勾选场景
      sceneVoiceControl: { enabled: false, allow: [] },
      // 联网搜索默认开启：后两级搜索源无需密钥，关闭后工具直接返回未启用
      webSearchEnabled: true,
      // AI 悬浮伴侣：默认贴左边停靠，点开对话、长按说话
      companion: { enabled: true, xPercent: 3, yPercent: 60 },
      // 主动管家默认关闭：避免升级后突然开始推送；开关与频控在设置页配置
      proactive: {
        enabled: false,
        intervalSeconds: 900,
        cooldownSeconds: 1800,
        quietStart: 23,
        quietStartMinute: 30,
        quietEnd: 7,
        quietEndMinute: 0,
        energyMultiplier: 1.5,
        minEnergyKwh: 1,
        forecastSlots: 4,
        forecastPopThreshold: 0.6,
        // 看门狗与自动关停默认关闭：只提醒，不动设备
        watchdogEnabled: false,
        motionIdleMinutes: 20,
        idleDeviceMinutes: 60,
        idleSwitchMinutes: 120,
        autoCloseEnabled: false,
        maxAutoCloseDevices: 3,
      },
      // Agent 专属设备白名单：空 = 不额外限制（仍受用户 ACL 约束）
      deviceAllowlist: [],
    },
    // 消息通道：Email / WebPush 默认关闭
    channelConfig: {
      email: {
        enabled: false,
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPassword: '',
        fromAddress: '',
        toAddresses: '',
        tlsEnabled: true,
      },
      webpush: {
        enabled: false,
        vapidPublicKey: '',
        vapidPrivateKey: '',
        subject: '',
      },
      wecom: {
        enabled: false,
        corpId: '',
        corpSecret: '',
        agentId: '',
        callbackToken: '',
        callbackAesKey: '',
        apiProxy: '',
        allowedUsers: '',
        boundHomeOsUserId: '',
      },
    },
    mobileRoomStats: {},
    // 远程访问地址：默认空，保存布局时下发给原生端，并随登录响应分发给已配对终端
    externalUrl: '',
  }
}

// 默认布局缓存：首次调用 getDefaultLayout 时求值并缓存，避免重复构建
let defaultLayoutCache: UILayoutConfig | null = null

/**
 * 获取惰性缓存的默认布局
 *
 * 首次访问时调用 createDefaultLayout() 求值并缓存，后续直接返回缓存对象。
 * 适用于只读场景；如需修改请自行深拷贝后再编辑。
 *
 * @returns 缓存的 UILayoutConfig 实例（同一引用）
 */
export function getDefaultLayout(): UILayoutConfig {
  if (!defaultLayoutCache) {
    defaultLayoutCache = createDefaultLayout()
  }
  return defaultLayoutCache
}

/** - 持有 UILayoutConfig 主状态（楼层/部件/收藏/事件日志/HA 配置/统计传感器/安防/地震/AI 等） */

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

/** 解析优先级：URL ?profile= > localStorage > 服务端终端绑定 > 新终端默认策略 > default。 */

/** profile 解析来源标签，用于调试与埋点 */
type ProfileResolveSource = 'url' | 'local' | 'binding' | 'activeProfile' | 'default'

/**
 * 按优先级解析当前终端应使用的 display profile：
 * URL ?profile= > localStorage > 服务端终端绑定 > 新终端默认策略 > default
 *
 * @param routeQueryProfile 来自路由 query 的 profile 候选值
 * @returns 解析结果：profileId + 来源标签
 * @sideeffect URL/local 命中时会写入 localStorage；服务端绑定命中时也会写入
 */
export async function resolveActiveProfileId(routeQueryProfile?: string): Promise<{
  profileId: string
  source: ProfileResolveSource
}> {
  const urlProfile = String(routeQueryProfile || '').trim()
  if (urlProfile) {
    const valid = await validateProfileExists(urlProfile)
    if (valid) {
      writeStoredProfileId(urlProfile)
      return { profileId: urlProfile, source: 'url' }
    }
    logger.warn(`URL 指定的方案 "${urlProfile}" 不存在,继续按其他来源解析`)
  }

  const local = readStoredProfileId()
  if (local !== 'default' || hasStoredProfileId()) {
    return { profileId: local, source: 'local' }
  }

  // 无本地记录：查询服务端终端绑定（新终端首次进入会走这里）
  try {
    const clientId = getClientDeviceId()
    const { data } = await resolveTerminalProfile(clientId)
    const payload = data?.data ?? data
    const profileId = String(payload?.profileId || 'default').trim() || 'default'
    const source = (payload?.source as ProfileResolveSource) || 'default'
    writeStoredProfileId(profileId)
    return { profileId, source }
  } catch (err) {
    logger.warn('服务端终端方案解析失败,回退 default', err)
    return { profileId: 'default', source: 'default' }
  }
}

/**
 * 校验指定 profileId 是否存在（通过 fetchProject 探测）。
 * @param profileId 待校验方案 id
 * @returns 是否存在
 */
async function validateProfileExists(profileId: string): Promise<boolean> {
  try {
    await fetchProject(profileId)
    return true
  } catch {
    return false
  }
}

/**
 * 本机绑定当前方案到服务端（切换方案时调用）。
 * @param profileId 目标方案 id
 * @param label 可选方案标签
 * @sideeffect 失败仅 warn，不抛出（绑定失败不影响本地使用）
 */
export async function bindSelfTerminalProfile(profileId: string, label?: string): Promise<void> {
  try {
    await updateSelfTerminalBinding({
      clientId: getClientDeviceId(),
      profileId,
      label: label || undefined,
    })
  } catch (err) {
    logger.warn('同步终端方案绑定到服务端失败', err)
  }
}

/**
 * 统一天气实体 ID：layout 优先，其次 circadian。
 * @param layoutId layout 配置中的天气实体 ID
 * @param circadianId 昼夜节律模块提供的天气实体 ID
 * @returns 优先取 layoutId，为空则取 circadianId
 */
export function resolveWeatherEntityId(layoutId?: string | null, circadianId?: string | null): string {
  return String(layoutId || '').trim() || String(circadianId || '').trim()
}

/**
 * 将解析出的天气实体 ID 写回 layout 配置的 haConfig.weatherEntityId。
 * @param layoutConfig 布局配置对象（会就地修改）
 * @param entityId 天气实体 ID
 * @sideeffect 就地修改 layoutConfig.haConfig.weatherEntityId
 */
export function applyWeatherEntityIdToLayout(layoutConfig: UILayoutConfig, entityId: string): void {
  if (!layoutConfig.haConfig) layoutConfig.haConfig = {} as UILayoutConfig['haConfig']
  layoutConfig.haConfig.weatherEntityId = entityId
}
