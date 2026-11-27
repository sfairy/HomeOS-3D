/**
 * 仪表盘编辑器壳层状态（不镜像整份 document JSON）。
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  dispatchEditorCommand,
  getEditorFacadeBus,
  getEditorFacadeState,
  type EditorCommand,
  type EditorFacadeState,
} from '@/studio/index'

/**
 * 0.9.0 对齐：默认三栏宽度与上游一致（250 | 1fr | 250）。
 *
 * 键名带 `v2`：0.9.0 之前写入的 260/280 会一直盖住对齐后的默认值，
 * 让「像素对齐」在已用过的浏览器里永远量不准。升版后旧偏好丢弃一次，
 * 用户再拖动侧栏仍会照常持久化（侧栏可拖动是本项目增强，保留）。
 */
const PANEL_STORAGE_KEY = 'homeos.studio-editor.panels.v2'

const DEFAULT_PANEL_PREFS = Object.freeze({
  leftCollapsed: false,
  rightCollapsed: false,
  leftWidth: 250,
  rightWidth: 250,
})

function readPanelPrefs(): { leftCollapsed: boolean; rightCollapsed: boolean; leftWidth: number; rightWidth: number } {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PANEL_PREFS }
    return { ...DEFAULT_PANEL_PREFS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_PANEL_PREFS }
  }
}

export const useStudioEditorStore = defineStore('studioEditor', () => {
  const prefs = readPanelPrefs()
  const facade = shallowRef<EditorFacadeState>({ ...getEditorFacadeState() })
  const leftCollapsed = ref(prefs.leftCollapsed)
  const rightCollapsed = ref(prefs.rightCollapsed)
  const leftWidth = ref(prefs.leftWidth)
  const rightWidth = ref(prefs.rightWidth)
  const showShortcuts = ref(false)
  const canvasZoom = ref(1)
  let unsub: (() => void) | null = null

  const dirty = computed(() => facade.value.dirty)
  const saveState = computed(() => facade.value.saveState)
  const projectName = computed(() => facade.value.projectName || '仪表盘编辑器')
  const canUndo = computed(() => facade.value.history.canUndo)
  const canRedo = computed(() => facade.value.history.canRedo)

  function persistPanels() {
    try {
      localStorage.setItem(
        PANEL_STORAGE_KEY,
        JSON.stringify({
          leftCollapsed: leftCollapsed.value,
          rightCollapsed: rightCollapsed.value,
          leftWidth: leftWidth.value,
          rightWidth: rightWidth.value,
        }),
      )
    } catch {
      /* ignore quota */
    }
  }

  function bindFacade() {
    unsub?.()
    const bus = getEditorFacadeBus()
    unsub = bus.on<EditorFacadeState>('state', (next) => {
      facade.value = { ...next }
      canvasZoom.value = next.canvasZoom
    })
    facade.value = { ...getEditorFacadeState() }
  }

  function unbindFacade() {
    unsub?.()
    unsub = null
  }

  function command(cmd: EditorCommand) {
    dispatchEditorCommand(cmd)
  }

  function toggleLeft() {
    leftCollapsed.value = !leftCollapsed.value
    persistPanels()
    command({ type: 'setLeftCollapsed', collapsed: leftCollapsed.value })
  }

  function toggleRight() {
    rightCollapsed.value = !rightCollapsed.value
    persistPanels()
    command({ type: 'setRightCollapsed', collapsed: rightCollapsed.value })
  }

  function setLeftWidth(width: number) {
    leftWidth.value = Math.min(420, Math.max(180, width))
    persistPanels()
  }

  function setRightWidth(width: number) {
    rightWidth.value = Math.min(480, Math.max(200, width))
    persistPanels()
  }

  function setZoom(zoom: number) {
    const next = Math.min(3, Math.max(0.25, zoom))
    canvasZoom.value = next
    command({ type: 'setZoom', zoom: next })
  }

  return {
    facade,
    leftCollapsed,
    rightCollapsed,
    leftWidth,
    rightWidth,
    showShortcuts,
    canvasZoom,
    dirty,
    saveState,
    projectName,
    canUndo,
    canRedo,
    bindFacade,
    unbindFacade,
    command,
    toggleLeft,
    toggleRight,
    setLeftWidth,
    setRightWidth,
    setZoom,
  }
})
