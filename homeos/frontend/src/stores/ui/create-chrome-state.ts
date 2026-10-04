/**
 * @file UI Chrome 状态工厂
 * @module stores/ui/create-chrome-state
 * @description
 *  UI chrome 层状态切片：负责一切"非业务数据"的 UI 表层状态，包括
 *  - Toast 通知队列（notifications / notify / removeNotification）
 *  - 确认对话框（confirm / resolveConfirm）与输入对话框（prompt / resolvePrompt）
 *  - 各类全局弹窗开关（媒体播放器、实体控制、分组、门铃、升级等）
 *  - 编辑模式顶层开关与放置实体指针
 *  该工厂由 chrome.store 持有；layout.store 经 useChromeStore() 读取同一套状态。
 */
import { ref } from 'vue'
import type { NotifyType } from '@/types/notify'

/** 单条 Toast 通知的数据结构 */
interface UiNotification {
  /** 通知唯一 ID，用于后续移除 */
  id: string
  /** 通知正文 */
  message: string
  /** 通知类型（info / success / warning / error） */
  type: NotifyType
  /** 自动关闭时长（毫秒），<=0 表示不自动关闭 */
  duration: number
}

/** 确认对话框状态；resolve 由调用方 await 持有，关闭时回填布尔结果 */
interface ConfirmState {
  /** 标题 */
  title: string
  /** 正文 */
  message: string
  /** 确认按钮文案 */
  confirmText: string
  /** 取消按钮文案 */
  cancelText: string
  /** 视觉类型（primary / danger 等），用于按钮样式 */
  type: string
  /** Promise 的 resolve 回调，传入用户是否确认 */
  resolve: (value: boolean) => void
}

/** 输入对话框状态；resolve 在关闭时回填用户输入或 null（取消） */
interface PromptState {
  /** 标题 */
  title: string
  /** 正文 */
  message: string
  /** 输入框标签 */
  label: string
  /** 输入框 placeholder */
  placeholder: string
  /** 默认值 */
  defaultValue: string
  /** 确认按钮文案 */
  confirmText: string
  /** 取消按钮文案 */
  cancelText: string
  /** 是否必填 */
  required: boolean
  /** 必填校验失败时的提示文案 */
  requiredMessage: string
  /** Promise 的 resolve 回调，传入用户输入字符串或 null（取消） */
  resolve: (value: string | null) => void
}

/**
 * UI chrome 层：Toast、确认框、弹窗开关（layout/chrome 拆分模块）。
 *
 * 创建并返回一组响应式状态与开关函数，供 chrome.store / layout.store 共享。
 * 工厂本身无副作用、无外部依赖初始化，仅依赖 Vue ref。
 *
 * @returns 包含编辑模式标志、选中部件 ID、各类弹窗开关、通知与确认/输入框控制函数的状态切片
 */
export function createUIChromeState() {
  // 编辑模式总开关：true 表示当前处于布局编辑态
  const isEditMode = ref(false)
  // 当前选中的部件 ID（编辑模式高亮使用）
  const selectedWidgetId = ref<string | null>(null)
  // 当前待"放置"的实体指针（点击地图/楼层后落到该实体），id 为 entity_id
  const placementEntity = ref<{ id: string; type?: string } | null>(null)
  // 退出编辑模式确认弹窗开关（脏数据时拦截直接退出）
  const showExitEditConfirm = ref(false)

  // 媒体播放器弹窗状态
  const isMediaPlayerOpen = ref(false)
  // 当前媒体播放器绑定的 entity_id
  const activeMediaEntityId = ref<string>('')
  // 实体控制弹窗（灯光/窗帘等详细控制面板）
  const isEntityControlOpen = ref(false)
  // 当前实体控制弹窗绑定的 entity_id
  const entityControlEntityId = ref<string>('')
  // 同域分组弹窗（如所有灯光/所有传感器聚合）
  const isGroupModalOpen = ref(false)
  // 当前分组弹窗的 domain（light / sensor 等）
  const groupModalDomain = ref<string>('')
  // 当前分组弹窗的传感器列表（可选透传数据）
  const groupModalSensors = ref<unknown>(null)
  // 门铃弹窗（接收到门铃事件时弹出实时画面）
  const isDoorbellModalOpen = ref(false)
  // 智能管家对话弹层（首页卡片 / 悬浮按钮均可唤起）
  const isAgentChatOpen = ref(false)
  // 设置页解锁标志（需通过 PIN 或手势解锁后才能进入设置）
  const isSettingsUnlocked = ref(false)
  // 升级提示弹窗开关
  const isUpgradeModalOpen = ref(false)
  // 缺失脚本提示弹窗开关
  const isScriptMissing = ref(false)

  // Toast 通知队列
  const notifications = ref<UiNotification[]>([])
  // 当前激活的确认对话框状态（同时仅允许一个）
  const activeConfirm = ref<ConfirmState | null>(null)
  // 当前激活的输入对话框状态（同时仅允许一个）
  const activePrompt = ref<PromptState | null>(null)

  /**
   * 打开媒体播放器弹窗。
   * @param entityId 媒体播放器 entity_id
   */
  function openMediaPlayer(entityId: string): void {
    activeMediaEntityId.value = entityId
    isMediaPlayerOpen.value = true
  }
  /** 关闭媒体播放器弹窗（保留 entity_id 以便后续重开） */
  function closeMediaPlayer(): void {
    isMediaPlayerOpen.value = false
  }

  /**
   * 打开实体控制弹窗。
   * @param entityId 实体 entity_id；为空则忽略（避免误开空弹窗）
   */
  function openEntityControl(entityId: string): void {
    if (!entityId) return
    entityControlEntityId.value = entityId
    isEntityControlOpen.value = true
  }
  /** 关闭实体控制弹窗并清空绑定实体 */
  function closeEntityControl(): void {
    isEntityControlOpen.value = false
    entityControlEntityId.value = ''
  }

  /**
   * 打开同域分组弹窗。
   * @param domain HA domain（如 light / sensor）
   * @param sensors 透传的传感器数据，默认 null
   */
  function openGroupModal(domain: string, sensors: unknown = null): void {
    groupModalDomain.value = domain
    groupModalSensors.value = sensors
    isGroupModalOpen.value = true
  }
  /** 关闭分组弹窗（保留 domain/sensors 以便快速重开） */
  function closeGroupModal(): void {
    isGroupModalOpen.value = false
  }

  /** 打开门铃弹窗 */
  function openDoorbellModal(): void {
    isDoorbellModalOpen.value = true
  }
  /** 关闭门铃弹窗 */
  function closeDoorbellModal(): void {
    isDoorbellModalOpen.value = false
  }

  /** 打开智能管家对话弹层（首页卡片与悬浮按钮共用同一状态） */
  function openAgentChat(): void {
    isAgentChatOpen.value = true
  }
  /** 关闭智能管家对话弹层 */
  function closeAgentChat(): void {
    isAgentChatOpen.value = false
  }

  /** 解锁设置页（允许进入设置） */
  function unlockSettings(): void {
    isSettingsUnlocked.value = true
  }
  /** 重新锁定设置页 */
  function lockSettings(): void {
    isSettingsUnlocked.value = false
  }

  /**
   * 控制"缺失脚本"提示弹窗的显隐。
   * @param val 是否显示，默认 true
   */
  function showScriptMissingModal(val = true): void {
    isScriptMissing.value = val
  }
  /** 触发升级提示弹窗 */
  function triggerUpgrade(): void {
    isUpgradeModalOpen.value = true
  }
  /**
   * 推送一条 Toast 通知。
   * @param message 通知正文
   * @param type 通知类型，默认 'info'
   * @param duration 自动关闭时长（毫秒），默认 3000；<=0 则常驻直至手动移除
   */
  function notify(message: string, type: NotifyType = 'info', duration = 3000): void {
    const id = Math.random().toString(36).substring(2, 11)
    notifications.value.push({ id, message, type, duration })
    if (duration > 0) setTimeout(() => removeNotification(id), duration)
  }
  /**
   * 按 ID 移除一条通知。
   * @param id 通知 ID
   */
  function removeNotification(id: string): void {
    notifications.value = notifications.value.filter((n) => n.id !== id)
  }

  /**
   * 弹出确认对话框，返回 Promise 等待用户选择。
   * @param message 正文
   * @param title 标题，默认空
   * @param opts 额外选项（confirmText / cancelText / type），均为可选
   * @returns 用户是否点击确认
   */
  function confirm(
    message: string,
    title = '',
    opts: Record<string, string> = {},
  ): Promise<boolean> {
    // 新确认弹窗弹出前，先把未关闭的旧弹窗按"取消" resolve，避免旧 Promise 永久悬挂
    if (activeConfirm.value) {
      activeConfirm.value.resolve(false)
      activeConfirm.value = null
    }
    return new Promise((resolve) => {
      activeConfirm.value = {
        title: title || '确认操作',
        message,
        confirmText: opts.confirmText || '确定',
        cancelText: opts.cancelText || '取消',
        type: opts.type || 'primary',
        resolve,
      }
    })
  }
  /**
   * 关闭确认对话框并以给定结果 resolve 调用方 Promise。
   * @param result 用户是否确认
   */
  function resolveConfirm(result: boolean): void {
    if (activeConfirm.value) {
      activeConfirm.value.resolve(result)
      activeConfirm.value = null
    }
  }

  /**
   * 弹出输入对话框，返回 Promise 等待用户输入。
   * @param message 正文，默认空
   * @param opts 输入框配置（标题/标签/默认值/必填等）
   * @returns 用户输入字符串；取消则返回 null
   */
  function prompt(
    message = '',
    opts: {
      title?: string
      label?: string
      placeholder?: string
      defaultValue?: string
      confirmText?: string
      cancelText?: string
      required?: boolean
      requiredMessage?: string
    } = {},
  ): Promise<string | null> {
    // 新输入弹窗弹出前，先把未关闭的旧弹窗按"取消" resolve，避免旧 Promise 永久悬挂
    if (activePrompt.value) {
      activePrompt.value.resolve(null)
      activePrompt.value = null
    }
    return new Promise((resolve) => {
      activePrompt.value = {
        title: String(opts.title || '输入'),
        message,
        label: String(opts.label || ''),
        placeholder: String(opts.placeholder || ''),
        defaultValue: String(opts.defaultValue ?? ''),
        confirmText: String(opts.confirmText || '确定'),
        cancelText: String(opts.cancelText || '取消'),
        required: opts.required !== false,
        requiredMessage: String(opts.requiredMessage || '请输入内容'),
        resolve,
      }
    })
  }
  /**
   * 关闭输入对话框并以给定结果 resolve 调用方 Promise。
   * @param result 用户输入字符串，或 null 表示取消
   */
  function resolvePrompt(result: string | null): void {
    if (activePrompt.value) {
      activePrompt.value.resolve(result)
      activePrompt.value = null
    }
  }

  return {
    isEditMode,
    selectedWidgetId,
    placementEntity,
    showExitEditConfirm,
    isMediaPlayerOpen,
    activeMediaEntityId,
    openMediaPlayer,
    closeMediaPlayer,
    isEntityControlOpen,
    entityControlEntityId,
    openEntityControl,
    closeEntityControl,
    isGroupModalOpen,
    groupModalDomain,
    groupModalSensors,
    openGroupModal,
    closeGroupModal,
    isDoorbellModalOpen,
    openDoorbellModal,
    closeDoorbellModal,
    isAgentChatOpen,
    openAgentChat,
    closeAgentChat,
    isSettingsUnlocked,
    unlockSettings,
    lockSettings,
    isUpgradeModalOpen,
    isScriptMissing,
    showScriptMissingModal,
    triggerUpgrade,
    notifications,
    notify,
    removeNotification,
    activeConfirm,
    confirm,
    resolveConfirm,
    activePrompt,
    prompt,
    resolvePrompt,
  }
}