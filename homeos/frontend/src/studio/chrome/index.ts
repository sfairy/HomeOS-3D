export { default as StudioTopBar } from './StudioTopBar.vue'
export { default as StudioShortcutsOverlay } from './StudioShortcutsOverlay.vue'
export { default as StudioZoomBar } from './StudioZoomBar.vue'

export const EDITOR_SHORTCUT_ROWS = [
  { action: '撤销 / 重做', keys: '⌘Z / ⇧⌘Z' },
  { action: '复制 / 粘贴', keys: '⌘C / ⌘V' },
  { action: '全选', keys: '⌘A' },
  { action: '保存', keys: '⌘S' },
  { action: '删除', keys: 'Delete' },
  { action: '复制一份', keys: '⌘D' },
  { action: '微调位置', keys: '方向键（⇧×10）' },
  { action: '临时平移', keys: 'Space' },
]

export const STUDIO_SHORTCUT_ROWS = [
  { action: '撤销 / 重做', keys: '⌘Z / ⇧⌘Z' },
  { action: '复制 / 粘贴', keys: '⌘C / ⌘V' },
  { action: '删除选中', keys: 'Delete' },
  { action: '原地再复制一份', keys: '⌘D' },
  { action: '临时平移', keys: 'Space' },
  { action: '临时关吸附', keys: 'S / Shift' },
]
