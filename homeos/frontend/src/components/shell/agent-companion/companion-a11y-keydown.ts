/**
 * 悬浮伴侣键盘菜单的按键处理（从 useCompanionA11yMenu 拆出，压长度棘轮）。
 */
import { nextTick } from 'vue'
import { COMPANION_A11Y_MENU_ITEMS, type CompanionA11yAction } from './companion-a11y-shared'

export interface CompanionA11yKeyDeps {
  menuOpen: { value: boolean }
  menuIndex: { value: number }
  getTrigger: () => HTMLElement | null | undefined
  openA11yMenu: () => void | Promise<void>
  closeA11yMenu: () => void
  runMenuAction: (action: CompanionA11yAction) => void
  focusMenuIndex: (index: number) => void
}

function handleTriggerArrow(event: KeyboardEvent, deps: CompanionA11yKeyDeps): boolean {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false
  event.preventDefault()
  if (!deps.menuOpen.value) void deps.openA11yMenu()
  return true
}

function handleTriggerConfirm(event: KeyboardEvent, deps: CompanionA11yKeyDeps): boolean {
  if (event.key !== 'Enter' && event.key !== ' ') return false
  event.preventDefault()
  if (deps.menuOpen.value) {
    deps.runMenuAction(COMPANION_A11Y_MENU_ITEMS[deps.menuIndex.value]?.id ?? 'chat')
    return true
  }
  void deps.openA11yMenu()
  return true
}

/** 触发器上的 Enter / Space / 方向键 / Esc */
export function onCompanionTriggerKeydown(event: KeyboardEvent, deps: CompanionA11yKeyDeps): void {
  if (event.key === 'Escape') {
    if (deps.menuOpen.value) {
      event.preventDefault()
      deps.closeA11yMenu()
    }
    return
  }
  if (handleTriggerArrow(event, deps)) return
  handleTriggerConfirm(event, deps)
}

function moveMenuIndex(delta: number, deps: CompanionA11yKeyDeps): void {
  const len = COMPANION_A11Y_MENU_ITEMS.length
  deps.menuIndex.value = (deps.menuIndex.value + delta + len) % len
  void nextTick(() => deps.focusMenuIndex(deps.menuIndex.value))
}

function jumpMenuIndex(index: number, deps: CompanionA11yKeyDeps): void {
  deps.menuIndex.value = index
  void nextTick(() => deps.focusMenuIndex(index))
}

/** 打开后的 menuitem 方向键 / Home / End / Enter / Esc */
export function onCompanionMenuKeydown(event: KeyboardEvent, deps: CompanionA11yKeyDeps): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    deps.closeA11yMenu()
    deps.getTrigger()?.focus()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveMenuIndex(event.key === 'ArrowDown' ? 1 : -1, deps)
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    jumpMenuIndex(0, deps)
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    jumpMenuIndex(COMPANION_A11Y_MENU_ITEMS.length - 1, deps)
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    deps.runMenuAction(COMPANION_A11Y_MENU_ITEMS[deps.menuIndex.value]?.id ?? 'chat')
  }
}
