/** 悬浮伴侣键盘菜单的共享类型与条目（避免 keydown / composable 循环引用）。 */

export type CompanionA11yAction = 'tips' | 'voice' | 'chat'

export const COMPANION_A11Y_MENU_ITEMS: ReadonlyArray<{
  id: CompanionA11yAction
  label: string
}> = [
  { id: 'tips', label: '灵感指令' },
  { id: 'voice', label: '语音输入' },
  { id: 'chat', label: '打开对话' },
]
