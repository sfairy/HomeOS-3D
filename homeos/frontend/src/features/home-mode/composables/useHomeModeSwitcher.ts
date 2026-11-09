/**
 * @file useHomeModeSwitcher.ts
 * @module frontend/src/composables
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Home } from '@lucide/vue'
import { useHomeModes } from '@/features/home-mode/composables/useHomeModes'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useDropdownPosition } from '@/composables/ui/popup/useDropdownPosition'
import { useExclusiveDropdown } from '@/composables/ui/popup/useExclusiveDropdown'
import { resolveHomeModeIcon } from '@/shared/home-mode'
import { fetchHomeModeContext } from '@/services/api/home-modes'
import { loadPresenceHome as fetchPresenceHomeData } from '@/shared/presence/composables/load-presence-home'
import { formatPresenceBadgeSummary, isPresenceConfigured } from '@/shared/presence/utils/display.util'
import { systemConfigRef } from '@/composables/config/system-config-core.internals'
import { hapticAlert } from '@/shared/utils/ui/haptics.util'
import { schedulePoll } from '@/shared/utils/core/poll-scheduler'

const MEMBER_TONES = ['cyan', 'violet', 'emerald', 'amber', 'rose'] as const

export function memberInitial(name: string | null | undefined) {
  const s = String(name || '').trim()
  return s ? s.charAt(0).toUpperCase() : '?'
}

export function memberTone(idx: number) {
  return MEMBER_TONES[idx % MEMBER_TONES.length]
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

  const { modes, activeMode, activeModes, loading, acting, activate, deactivate, fetchModes, fetchActive } =
    useHomeModes()

  // 多个互斥组可以同时激活：header 只显示「主模式 +N」而不是把名字拼到被截断，
  // 完整列表放进 title（拼成「睡眠模式 · 回家模式」后按钮会被截断成「睡眠模式·…」，
  // 看起来像只有一个模式在生效）。
  const activeLabels = computed(() => activeModes.value.map((m) => m.name).filter((name): name is string => !!name))
  const activeModeIds = computed(() => activeModes.value.map((m) => String(m.id)))
  const label = computed(() => {
    const names = activeLabels.value
    if (names.length === 0) return '日常'
    if (names.length === 1) return names[0]
    return `${names[0]} +${names.length - 1}`
  })
  const activeLabelTitle = computed(() => {
    const names = activeLabels.value
    return names.length > 1 ? names.join(' · ') : ''
  })
  const modeIcon = computed(() => resolveHomeModeIcon(activeMode.value?.icon, Home))
  const presenceHome = ref<Record<string, unknown> | null>(null)
  const modeContext = ref<{ calendarAway: boolean; triggerLogs: unknown[] }>({
    calendarAway: false,
    triggerLogs: [],
  })

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

  const presenceTipOpen = ref(false)
  useExclusiveDropdown(presenceTipOpen)

  async function loadModeContext() {
    if (!auth.isAuthenticated) return
    try {
      const { data } = await fetchHomeModeContext()
      modeContext.value = data || { calendarAway: false, triggerLogs: [] }
    } catch {
      modeContext.value = { calendarAway: false, triggerLogs: [] }
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

  /** 其它互斥组的模式名（拼进「只保留它」的确认文案）。 */
  function coexistNames(others: Array<{ name?: string }>): string {
    const names = others.map((m) => m.name).filter((name): name is string => !!name)
    return names.length ? names.join('、') : `${others.length} 个模式`
  }

  /** 依次退出其它模式；任一失败即停（半恢复状态会叠加，后端已保留该模式的快照可重试）。 */
  async function exitOthers(others: Array<{ id: string | number }>): Promise<boolean> {
    for (const other of others) {
      const result = await deactivate(other.id)
      if (!result || (result as { success?: boolean }).success === false) return false
    }
    return true
  }

  /** 退出单个模式（确认 → deactivate → 触感反馈 → 刷新上下文）。 */
  async function exitSingleMode(targetId: string, modeName: string): Promise<void> {
    const ok = await useChromeStore().confirm(
      `「${modeName}」正在生效中。要退出这个模式并按激活前快照还原设备吗？`,
      '模式已激活',
      { type: 'danger', confirmText: '退出模式' },
    )
    if (!ok) return
    const result = await deactivate(targetId)
    if (result) hapticAlert()
    loadModeContext()
  }

  /**
   * 点已激活项：让它成为唯一生效模式（多互斥组并存时的单选化）；
   * 只有它自己生效时等价于退出（切换开关语义）。
   */
  async function makeExclusive(targetId: string, modeName: string): Promise<void> {
    const others = activeModes.value.filter((m) => String(m.id) !== targetId)
    if (others.length === 0) {
      await exitSingleMode(targetId, modeName)
      return
    }
    const ok = await useChromeStore().confirm(
      `「${modeName}」正在生效中，同时还激活着：${coexistNames(others)}。` +
        `要让「${modeName}」成为唯一生效的模式吗？将退出其它模式并按激活前快照还原设备。`,
      '模式已激活',
      { type: 'danger', confirmText: '只保留它', cancelText: '取消' },
    )
    if (!ok) return
    if (await exitOthers(others)) {
      hapticAlert()
    } else {
      useChromeStore().notify('未能退出其它模式，「只保留它」未完成', 'error')
    }
    loadModeContext()
  }

  async function selectMode(mode: { id: string | number; name?: string }) {
    open.value = false
    const targetId = String(mode.id)
    const modeName = mode.name || targetId
    // 多个互斥组可以同时激活：菜单口头是「切换模式」，语义仍是单选 ——
    // 之前这里直接提示「已是当前模式」并 return，用户看着只高亮了睡眠模式，
    // 点回家模式既没有反应也没有解释（回家模式其实靠另一个互斥组一直生效）。
    // 现在：点已激活项 = 让它成为唯一生效模式；只有它自己生效时 = 退出它（切换开关语义）。
    if (activeModeIds.value.includes(targetId)) {
      await makeExclusive(targetId, modeName)
      return
    }
    const ok = await useChromeStore().confirm(
      `确定激活「${modeName}」？将按该模式动作联动设备，并保留激活前快照以便退出时还原。`,
      '激活家庭模式',
      { type: 'danger', confirmText: '确认激活' },
    )
    if (!ok) return
    const result = await activate(mode.id)
    // 高危操作触感反馈：模式切换已在服务端生效（失败返回 null）
    if (result) hapticAlert()
    loadModeContext()
  }

  async function toggleOff() {
    open.value = false
    if (!activeMode.value) return
    const name = activeMode.value.name || '当前模式'
    const ok = await useChromeStore().confirm(`确定退出「${name}」？将尝试按激活前快照还原设备状态。`, '退出家庭模式', {
      type: 'danger',
      confirmText: '确认退出',
    })
    if (!ok) return
    // 只退出当前主模式（多互斥组时其余组继续保持激活）
    const result = await deactivate(activeMode.value.id)
    // 高危操作触感反馈：退出模式成功时触发
    if (result) hapticAlert()
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
    fetchModes()
    fetchActive()
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
    activeMode,
    activeModes,
    activeModeIds,
    activeLabels,
    activeLabelTitle,
    loading,
    acting,
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
    selectMode,
    toggleOff,
    togglePresenceTip,
    toggleMenuOpen,
  }
}
