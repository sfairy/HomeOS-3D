/**
 * @file useHomeModeSwitcher.ts
 * @module frontend/src/composables
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Home } from '@lucide/vue'
import { useHomeModes } from '@/features/home-mode/composables/use-home-modes'
import { useAuthStore } from '@/domain/auth/auth.store'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useClickOutside } from '@/kernel/ui/hooks/use-click-outside'
import { useDropdownPosition } from '@/kernel/ui/popup/use-dropdown-position'
import { useExclusiveDropdown } from '@/kernel/ui/popup/use-exclusive-dropdown'
import { resolveHomeModeIcon } from '@/features/home-mode/model/index'
import { fetchHomeModeActivationPreview, fetchHomeModeContext } from '@/domain/api/home-modes'
import { loadPresenceHome as fetchPresenceHomeData } from '@/features/presence/model/composables/load-presence-home'
import { formatPresenceBadgeSummary, isPresenceConfigured } from '@/features/presence/model/utils/display.util'
import { systemConfigRef } from '@/domain/layout/composables/system-config-core.internals'
import { hapticAlert } from '@/kernel/utils/ui/haptics.util'
import { schedulePoll } from '@/kernel/utils/core/poll-scheduler'
import { logger } from '@/kernel/utils/core/logger'

const MEMBER_TONES = ['cyan', 'violet', 'emerald', 'amber', 'rose'] as const

export function memberInitial(name: string | null | undefined) {
  const s = String(name || '').trim()
  return s ? s.charAt(0).toUpperCase() : '?'
}

export function memberTone(idx: number) {
  return MEMBER_TONES[idx % MEMBER_TONES.length]
}

/** 停用态但还留着设备快照的模式（顶替 / 强制退出后恢复未完成），可直接重试回放。 */
export interface PendingRestoreMode {
  id: string
  name?: string
  entities?: number
}

interface HomeModeContext {
  calendarAway: boolean
  triggerLogs: unknown[]
  pendingRestore: PendingRestoreMode[]
}

/** 家庭状态段：0 个空串、1 个原名、多个用「主 +N」。 */
function baseLabel(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

/** header 文案：家庭状态 + 叠加活动；读不到激活态时不能谎报「日常」。 */
function formatActiveLabel(baseNames: string[], overlayNames: string[], stateUnknown: boolean): string {
  const parts = [baseLabel(baseNames), ...overlayNames].filter(Boolean)
  if (parts.length > 0) return parts.join(' · ')
  return stateUnknown ? '状态未知' : '日常'
}

/** 后端 `/modes/context` → 本地结构：缺字段给安全兜底，避免模板里到处 `?.`。 */
function normalizeModeContext(data: unknown): HomeModeContext {
  const context = (data || {}) as Partial<HomeModeContext>
  return {
    calendarAway: Boolean(context.calendarAway),
    triggerLogs: Array.isArray(context.triggerLogs) ? context.triggerLogs : [],
    pendingRestore: Array.isArray(context.pendingRestore) ? context.pendingRestore : [],
  }
}

interface ActivationConflictPreview {
  modeName?: string
  entities?: string[]
}

interface ActivationPreview {
  conflicts?: ActivationConflictPreview[]
  securityTarget?: string | null
}

/** 预览文案：点名「会覆盖哪些仍生效模式控制的设备」（无冲突返回空串）。 */
function describeActivationConflicts(preview: ActivationPreview | null): string {
  const conflicts = preview?.conflicts || []
  if (!conflicts.length) return ''
  const parts = conflicts.map((item) => `${item.modeName || '其它模式'}（${(item.entities || []).length} 台）`)
  return `\n\n会覆盖仍在生效的 ${parts.join('、')} 控制的设备。`
}

/** 拉取激活预览；失败不阻断激活（少一条提示好过点不动），但留日志。 */
async function loadActivationPreview(modeId: string | number): Promise<ActivationPreview | null> {
  try {
    const { data } = await fetchHomeModeActivationPreview(String(modeId))
    return (data ?? null) as ActivationPreview | null
  } catch {
    logger.warn('家庭模式激活预览读取失败，按无冲突继续')
    return null
  }
}

export function useHomeModeSwitcher() {
  const open = ref(false)
  const rootRef = ref<HTMLElement | null>(null)
  const menuRef = ref<HTMLElement | null>(null)
  const auth = useAuthStore()

  const showAwayButton = computed(() => systemConfigRef.value?.homeMode?.showAwayButton ?? true)
  const showHomeMode = computed(() => systemConfigRef.value?.homeMode?.showHomeMode ?? true)

  const {
    dropdownStyle: menuStyle,
    teleportTarget: menuTeleportTarget,
    teleportDisabled: menuTeleportDisabled,
    placement: menuPlacement,
  } = useDropdownPosition(rootRef, open, {
    minWidth: 140,
    maxHeight: 280,
    chromeHeight: 0,
    minListHeight: 96,
    minRowHeight: 40,
    dropdownRef: menuRef,
    fitContent: true,
  })
  const presenceLoaded = ref(false)
  // 在场状态轮询任务取消函数（注册到全局调度器）
  let presencePollCancel: (() => void) | null = null

  const { modes, activeMode, activeModes, loading, acting, activeLoadError, activate, deactivate, restorePending } =
    useHomeModes()

  // 现实模型：家只有一个「状态」（回家 / 离家 / 睡眠），活动（用餐 / 影音）叠加其上。
  // overlay 组不计入「状态」，header 用「状态 · 活动」表达，而不是「主模式 +N」。
  const OVERLAY_GROUP = 'overlay'
  const isOverlayMode = (mode: { exclusiveGroup?: unknown } | null | undefined): boolean =>
    String(mode?.exclusiveGroup ?? '')
      .trim()
      .toLowerCase() === OVERLAY_GROUP
  const activeBaseModes = computed(() => activeModes.value.filter((m) => !isOverlayMode(m)))
  const activeOverlayModes = computed(() => activeModes.value.filter((m) => isOverlayMode(m)))
  /** 「退出」按钮的目标：优先家庭状态，只有一个叠加活动时才退它。 */
  const primaryActiveMode = computed(() => activeBaseModes.value[0] ?? activeModes.value[0] ?? null)
  const baseModes = computed(() => modes.value.filter((m) => !isOverlayMode(m)))
  const overlayModes = computed(() => modes.value.filter((m) => isOverlayMode(m)))

  const activeLabels = computed(() => activeModes.value.map((m) => m.name).filter((name): name is string => !!name))
  const activeModeIds = computed(() => activeModes.value.map((m) => String(m.id)))
  const label = computed(() => {
    const namesOf = (list: { name?: string }[]) => list.map((m) => m.name).filter((name): name is string => !!name)
    return formatActiveLabel(
      namesOf(activeBaseModes.value),
      namesOf(activeOverlayModes.value),
      Boolean(activeLoadError.value),
    )
  })
  const activeLabelTitle = computed(() => {
    const names = activeLabels.value
    return names.length > 1 ? names.join(' · ') : ''
  })
  const modeIcon = computed(() => resolveHomeModeIcon(activeMode.value?.icon, Home))
  const presenceHome = ref<Record<string, unknown> | null>(null)
  const modeContext = ref<HomeModeContext>(normalizeModeContext(null))

  const presenceMembers = computed(() => {
    const list = (presenceHome.value as { members?: unknown[] } | null)?.members
    return Array.isArray(list) ? list : []
  })

  const showPresenceBadge = computed(() => presenceLoaded.value && isPresenceConfigured(presenceHome.value))
  const showPresenceEmpty = computed(() => presenceLoaded.value && !isPresenceConfigured(presenceHome.value))
  const presenceSummary = computed(() => formatPresenceBadgeSummary(presenceHome.value))
  const presenceAtHomeCount = computed(
    () => presenceMembers.value.filter((m) => Boolean((m as { atHome?: boolean }).atHome)).length,
  )
  const pendingRestoreModes = computed(() => modeContext.value.pendingRestore || [])

  const presenceTipOpen = ref(false)
  useExclusiveDropdown(presenceTipOpen)

  async function loadModeContext() {
    if (!auth.isAuthenticated) return
    try {
      const { data } = await fetchHomeModeContext()
      modeContext.value = normalizeModeContext(data)
    } catch {
      modeContext.value = normalizeModeContext(null)
    }
  }

  async function loadPresenceHome() {
    if (!auth.isAuthenticated) return
    presenceHome.value = await fetchPresenceHomeData()
    presenceLoaded.value = true
  }

  function startPresencePoll() {
    stopPresencePoll()
    // 经全局调度器轮询：页面隐藏时自动暂停，恢复可见时立即刷新
    presencePollCancel = schedulePoll(
      'home-mode:presence',
      () => {
        void loadPresenceHome()
      },
      30_000,
    )
  }

  function stopPresencePoll() {
    if (presencePollCancel) {
      presencePollCancel()
      presencePollCancel = null
    }
  }

  /** 其它仍激活的模式名（面板说清楚「退出的是哪一个、还有谁在生效」）。
   *
   *  以前的语义是「点已勾选项 → 只保留它」，会顺带退掉别的互斥组；勾选项看起来像
   *  单选，点了却是破坏性操作，而且从「回家 + 睡眠」退到「只剩睡眠」没有入口
   *  （点睡眠会触发「只保留睡眠」，点退出按钮却只退主模式）。现在勾选项就是开关：
   *  再点一次 = 退出它自己，其余模式不受影响。
   */
  function remainingNames(others: Array<{ name?: string }>): string {
    const names = others.map((m) => m.name).filter((name): name is string => !!name)
    return names.length ? names.join('、') : `${others.length} 个模式`
  }

  /** 成功才给触感反馈：恢复不完整时 deactivate 会带回 data（success=false），别假装成功。 */
  function isSuccess(result: unknown): boolean {
    return Boolean(result) && (result as { success?: boolean }).success !== false
  }

  /** 退出单个模式（确认 → deactivate → 触感反馈 → 刷新上下文）。 */
  async function exitSingleMode(targetId: string, modeName: string): Promise<void> {
    open.value = false
    const others = activeModes.value.filter((m) => String(m.id) !== targetId)
    const coexist = others.length ? `（${remainingNames(others)} 仍保持生效）` : ''
    const ok = await useChromeStore().confirm(
      `要退出「${modeName}」${coexist}并按激活前快照还原它改过的设备吗？`,
      '模式已激活',
      { type: 'danger', confirmText: '退出模式' },
    )
    if (!ok) return
    const result = await deactivateWithForcePrompt(targetId, modeName)
    if (isSuccess(result)) hapticAlert()
    loadModeContext()
  }

  /** 回放「停用态 + 残留快照」：顶替 / 强制退出时恢复没做完，这是唯一的可重试入口。 */
  async function restorePendingMode(mode: PendingRestoreMode): Promise<void> {
    open.value = false
    const modeName = mode.name || mode.id
    const ok = await useChromeStore().confirm(
      `「${modeName}」有 ${mode.entities ?? 0} 个设备还停在旧状态（上次退出时没恢复完）。现在按快照恢复吗？`,
      '待恢复设备',
    )
    if (!ok) return
    const result = await restorePending(mode.id)
    if (isSuccess(result)) hapticAlert()
    loadModeContext()
  }

  /**
   * 停用失败（HA 离线 / 设备恢复失败）时给一次「强制退出」的机会。
   *
   * 没有这个入口，HA 断连期间模式会永久卡在激活态：设备恢复不了、组标记清不掉、
   * 连模式本身都删不掉。强制退出保留快照，用户可以在 HA 恢复后手动还原。
   */
  async function deactivateWithForcePrompt(targetId: string, modeName: string) {
    const result = (await deactivate(targetId)) as {
      success?: boolean
      restoreIncomplete?: boolean
      haOffline?: boolean
    } | null
    if (!result) return null
    const incomplete = result.restoreIncomplete || result.success === false
    if (!incomplete) return result
    const ok = await useChromeStore().confirm(
      forceExitPromptText(Boolean(result.haOffline), modeName),
      '强制退出模式',
      { type: 'danger', confirmText: '强制退出', cancelText: '先不退出' },
    )
    if (!ok) return null
    return await deactivate(targetId, { force: true })
  }

  /** 强制退出确认文案：HA 离线与「部分设备恢复失败」是两回事，不能共用一句话。 */
  function forceExitPromptText(haOffline: boolean, modeName: string): string {
    if (haOffline) {
      return `HA 当前未连接，无法还原设备状态。仍要退出「${modeName}」吗？快照会保留，可稍后手动恢复。`
    }
    return `「${modeName}」仍有设备未恢复。仍要强制退出吗？快照会保留，可稍后手动恢复。`
  }

  /** 「激活」确认文案：说清已在生效的模式与设备冲突的裁决口径。 */
  function buildActivationConfirmText(modeName: string, others: Array<{ name?: string }>): string {
    const coexist = others.length
      ? `\n\n当前还生效：${remainingNames(others)}。两个模式改到同一台设备时，以后激活的为准。`
      : ''
    return `确定激活「${modeName}」？将按该模式动作联动设备，并保留激活前快照以便退出时还原。${coexist}`
  }

  /** 条件不满足是**正常的跳过**（后端 success=true），但必须告诉用户为什么没执行。 */
  function notifySkippedActivation(result: { unmetConditions?: number[]; message?: string }, modeName: string): void {
    // 后端给了具体原因（例如「离家模式生效，家里没人」）就直接用它，
    // 比统一说「条件不满足」更能解释用户看到的现象。
    if (result.message) {
      useChromeStore().notify(result.message, 'warning')
      return
    }
    const count = result.unmetConditions?.length ?? 0
    useChromeStore().notify(
      count ? `「${modeName}」的 ${count} 项启用条件当前不满足，本次未执行` : `「${modeName}」本次条件不满足，未执行`,
      'warning',
    )
  }

  async function activateAndReport(mode: { id: string | number }, modeName: string): Promise<void> {
    const result = (await activate(mode.id)) as {
      skipped?: boolean
      unmetConditions?: number[]
      message?: string
    } | null
    if (!result) return
    if (result.skipped) {
      notifySkippedActivation(result, modeName)
      return
    }
    hapticAlert()
    loadModeContext()
  }

  /**
   * 选择模式：未激活 → 激活；已激活 → 退出它（勾选 = 开关，不动其它互斥组）。
   */
  async function selectMode(mode: { id: string | number; name?: string }) {
    const targetId = String(mode.id)
    const modeName = mode.name || targetId
    if (activeModeIds.value.includes(targetId)) {
      await exitSingleMode(targetId, modeName)
      return
    }
    const preview = activeModes.value.length ? await loadActivationPreview(targetId) : null
    const text = buildActivationConfirmText(modeName, activeModes.value) + describeActivationConflicts(preview)
    const ok = await useChromeStore().confirm(text, '激活家庭模式', { type: 'danger', confirmText: '确认激活' })
    if (!ok) return
    // 确认通过后才收起菜单：取消时菜单还在，用户不用重新点开。
    open.value = false
    await activateAndReport(mode, modeName)
  }

  async function toggleOff() {
    const target = primaryActiveMode.value
    if (!target) return
    const name = target.name || '当前模式'
    const ok = await useChromeStore().confirm(`确定退出「${name}」？将尝试按激活前快照还原设备状态。`, '退出家庭模式', {
      type: 'danger',
      confirmText: '确认退出',
    })
    if (!ok) return
    open.value = false
    // 只退出这一个：叠加活动由点击它自己退出，这里保护的是「家庭状态」。
    const result = await deactivateWithForcePrompt(String(target.id), name)
    if (isSuccess(result)) hapticAlert()
    loadModeContext()
  }

  function togglePresenceTip() {
    presenceTipOpen.value = !presenceTipOpen.value
    if (presenceTipOpen.value) open.value = false
  }

  function toggleMenuOpen() {
    open.value = !open.value
    if (open.value) presenceTipOpen.value = false
  }

  function onDocClick() {
    open.value = false
    presenceTipOpen.value = false
  }

  useClickOutside(() => [rootRef.value, menuRef.value].filter((el): el is HTMLElement => !!el), onDocClick)

  onMounted(() => {
    // 模式列表与激活态由 useHomeModes() 的 onMounted 拉取（首个订阅者负责）。
    // 这里再拉一遍等于每次挂载双倍请求，且两个响应乱序时旧响应会覆盖新状态。
    loadPresenceHome()
    loadModeContext()
    startPresencePoll()
  })

  watch(
    () => auth.isAuthenticated,
    (authed) => {
      if (authed) {
        loadPresenceHome()
        loadModeContext()
      }
    },
  )

  onUnmounted(stopPresencePoll)

  return {
    rootRef,
    menuRef,
    open,
    showAwayButton,
    showHomeMode,
    menuPlacement,
    menuStyle,
    menuTeleportTarget,
    menuTeleportDisabled,
    modes,
    baseModes,
    overlayModes,
    activeBaseModes,
    activeOverlayModes,
    activeMode,
    primaryActiveMode,
    activeModes,
    activeModeIds,
    activeLabels,
    activeLabelTitle,
    loading,
    acting,
    activeLoadError,
    label,
    modeIcon,
    presenceHome,
    modeContext,
    presenceMembers,
    showPresenceBadge,
    showPresenceEmpty,
    presenceSummary,
    presenceAtHomeCount,
    presenceTipOpen,
    presenceLoaded,
    pendingRestoreModes,
    selectMode,
    toggleOff,
    restorePendingMode,
    togglePresenceTip,
    toggleMenuOpen,
  }
}
