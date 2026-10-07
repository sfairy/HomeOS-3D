/**
 * 仪表盘编辑器壳层状态（不镜像整份 document JSON）。
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  dispatchEditorCommand,
  getEditorFacadeBus,
  getEditorFacadeState,
  type EditorFacadeState,
} from '@/studio/engine'
import type { EditorCommand } from '@/studio/engine/types'

const PANEL_STORAGE_KEY = 'homeos.studio-editor.panels'

function readPanelPrefs(): { leftCollapsed: boolean; rightCollapsed: boolean; leftWidth: number; rightWidth: number } {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY)
    if (!raw) return { leftCollapsed: false, rightCollapsed: false, leftWidth: 260, rightWidth: 280 }
    return { leftCollapsed: false, rightCollapsed: false, leftWidth: 260, rightWidth: 280, ...JSON.parse(raw) }
  } catch {
    return { leftCollapsed: false, rightCollapsed: false, leftWidth: 260, rightWidth: 280 }
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
