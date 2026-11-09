/**
 * 悬浮伴侣的键盘可达菜单（U04）。
 *
 * 指针手势仍走原路径；键盘用 Enter/Space/方向键打开 Tips / Voice / Chat。
 * 抽成 composable：`AgentCompanion.vue` 卡在文件规模棘轮上。
 */
import { computed, nextTick, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { onCompanionMenuKeydown, onCompanionTriggerKeydown, type CompanionA11yKeyDeps } from './companion-a11y-keydown'
import { COMPANION_A11Y_MENU_ITEMS, type CompanionA11yAction } from './companion-a11y-shared'

export type { CompanionA11yAction } from './companion-a11y-shared'
export { COMPANION_A11Y_MENU_ITEMS } from './companion-a11y-shared'

interface CompanionA11yMenuOptions {
  /** 触发器：Esc 关闭菜单后回焦 */
  getTrigger: () => HTMLElement | null | undefined
  /** listening / thinking 时不打开菜单 */
  canOpen: MaybeRefOrGetter<boolean>
  /** 对话面板是否已打开（打开时关掉键盘菜单） */
  chatOpen: MaybeRefOrGetter<boolean>
  /** 当前是否在聆听（影响 aria） */
  isListening: MaybeRefOrGetter<boolean>
  onTips: () => void
  onVoice: () => void
  onChat: () => void
}

function focusMenuIndex(index: number) {
  const root = document.getElementById('companion-a11y-menu')
  root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[index]?.focus()
}

export function useCompanionA11yMenu(options: CompanionA11yMenuOptions) {
  const menuOpen = ref(false)
  const menuIndex = ref(0)
  const menuItems = COMPANION_A11Y_MENU_ITEMS

  function closeA11yMenu() {
    menuOpen.value = false
    menuIndex.value = 0
  }

  async function openA11yMenu() {
    if (!toValue(options.canOpen)) return
    menuOpen.value = true
    menuIndex.value = 0
    await nextTick()
    focusMenuIndex(0)
  }

  function runMenuAction(action: CompanionA11yAction) {
    closeA11yMenu()
    if (action === 'tips') {
      options.onTips()
      return
    }
    if (action === 'voice') {
      options.onVoice()
      return
    }
    options.onChat()
  }

  const keyDeps: CompanionA11yKeyDeps = {
    menuOpen,
    menuIndex,
    getTrigger: options.getTrigger,
    openA11yMenu,
    closeA11yMenu,
    runMenuAction,
    focusMenuIndex,
  }

  function onTriggerKeydown(event: KeyboardEvent) {
    onCompanionTriggerKeydown(event, keyDeps)
  }

  function onMenuKeydown(event: KeyboardEvent) {
    onCompanionMenuKeydown(event, keyDeps)
  }

  const menuAriaLabel = computed(() => {
    if (toValue(options.isListening)) return '正在聆听，松开发送'
    if (menuOpen.value) return '智能管家菜单已打开，方向键选择，回车确认'
    return 'HomeOS 智能管家（回车打开菜单 · 长按语音 · 单击灵感 · 双击展开）'
  })

  const menuHint = computed(() => 'HomeOS 智能管家 (回车菜单 · 长按语音 · 单击灵感 · 双击展开)')

  watch(
    () => toValue(options.chatOpen),
    (open) => {
      if (open) closeA11yMenu()
    },
  )

  return {
    menuOpen,
    menuIndex,
    menuItems,
    menuAriaLabel,
    menuHint,
    closeA11yMenu,
    openA11yMenu,
    runMenuAction,
    onTriggerKeydown,
    onMenuKeydown,
  }
}
