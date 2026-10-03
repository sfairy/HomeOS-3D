/**
 * @file useHomeModeSwitcher.ts
 * @module frontend/src/composables
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Home } from '@lucide/vue'
import { useHomeModes } from '@/composables/home/useHomeModes'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'
import { useExclusiveDropdown } from '@/composables/ui/useExclusiveDropdown'
import { resolveHomeModeIcon } from '@/utils/home/mode-icon.util'
import { fetchHomeModeContext } from '@/services/api/home-modes'
import { loadPresenceHome as fetchPresenceHomeData } from '@/composables/presence/load-presence-home'
import {
  formatPresenceBadgeSummary,
  isPresenceConfigured,
} from '@/utils/presence/display.util'
import { systemConfigRef } from '@/composables/config/system-config-core.internals'
import { hapticAlert } from '@/utils/ui/haptics.util'
import { schedulePoll } from '@/utils/core/poll-scheduler'

const MEMBER_TONES = ['cyan', 'violet', 'emerald', 'amber', 'rose'] as const

/** memberInitial：函数，按签名入参返回处理结果。 */
export function memberInitial(name: string | null | undefined) {
  const s = String(name || '').trim()
  return s ? s.charAt(0).toUpperCase() : '?'
}

/** memberTone：函数，按签名入参返回处理结果。 */
export function memberTone(idx: number) {
  return MEMBER_TONES[idx % MEMBER_TONES.length]
}

/** useHomeModeSwitcher：函数，按签名入参返回处理结果。 */
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

  const {
    modes,
    activeMode,
    loading,
    acting,
    canControl,
    activate,
    deactivate,
    fetchModes,
    fetchActive,
  } = useHomeModes()

  const label = computed(() => activeMode.value?.name || '日常')
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

  const showPresenceBadge = computed(
    () => presenceLoaded.value && isPresenceConfigured(presenceHome.value),
  )
  const showPresenceEmpty = computed(
    () => presenceLoaded.value && !isPresenceConfigured(presenceHome.value),
  )
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

  async function selectMode(mode: { id: string | number; name?: string }) {
    open.value = false
    if (!canControl()) return
    if (activeMode.value?.id === mode.id) {
      useChromeStore().notify('已是当前模式', 'info')
      return
    }
    const label = mode.name || String(mode.id)
    const ok = await useChromeStore().confirm(
      `确定激活「${label}」？将按该模式动作联动设备，并保留激活前快照以便退出时还原。`,
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
    if (!canControl() || !activeMode.value) return
    const name = activeMode.value.name || '当前模式'
    const ok = await useChromeStore().confirm(
      `确定退出「${name}」？将尝试按激活前快照还原设备状态。`,
      '退出家庭模式',
      { type: 'danger', confirmText: '确认退出' },
    )
    if (!ok) return
    const result = await deactivate()
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

  useClickOutside(
    () => [rootRef.value, menuRef.value].filter((el): el is HTMLElement => !!el),
    onDocClick,
  )

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
    loading,
    acting,
    canControl,
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
