/**
 * 3D 户型绘制壳层状态。
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  dispatchStudioCommand,
  getStudioFacadeBus,
  getStudioFacadeState,
  type StudioFacadeState,
} from '@/studio/engine'
import type { StudioCommand } from '@/studio/engine/types'

const PANEL_STORAGE_KEY = 'homeos.studio-floorplan.panels'

function readPrefs(): { libraryCollapsed: boolean; planFocus: boolean } {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY)
    if (!raw) return { libraryCollapsed: false, planFocus: false }
    return { libraryCollapsed: false, planFocus: false, ...JSON.parse(raw) }
  } catch {
    return { libraryCollapsed: false, planFocus: false }
  }
}

export const useStudioFloorplanStore = defineStore('studioFloorplan', () => {
  const prefs = readPrefs()
  const facade = shallowRef<StudioFacadeState>({ ...getStudioFacadeState() })
  const libraryCollapsed = ref(prefs.libraryCollapsed)
  const planFocus = ref(prefs.planFocus)
  const showShortcuts = ref(false)
  let unsub: (() => void) | null = null

  const dirty = computed(() => facade.value.dirty)
  const saveState = computed(() => facade.value.saveState)
  const canUndo = computed(() => facade.value.history.canUndo)
  const canRedo = computed(() => facade.value.history.canRedo)
  const activeTool = computed(() => facade.value.activeTool)
  const workflowStep = computed(() => facade.value.workflowStep)

  function persist() {
    try {
      localStorage.setItem(
        PANEL_STORAGE_KEY,
        JSON.stringify({
          libraryCollapsed: libraryCollapsed.value,
          planFocus: planFocus.value,
        }),
      )
    } catch {
      /* ignore */
    }
  }

  function bindFacade() {
    unsub?.()
    const bus = getStudioFacadeBus()
    unsub = bus.on<StudioFacadeState>('state', (next) => {
      facade.value = { ...next }
    })
    facade.value = { ...getStudioFacadeState() }
  }

  function unbindFacade() {
    unsub?.()
    unsub = null
  }

  function command(cmd: StudioCommand) {
    dispatchStudioCommand(cmd)
  }

  function toggleLibrary() {
    libraryCollapsed.value = !libraryCollapsed.value
    persist()
    command({ type: 'setLibraryCollapsed', collapsed: libraryCollapsed.value })
  }

  function togglePlanFocus() {
    planFocus.value = !planFocus.value
    persist()
    command({ type: 'setPlanFocus', focus: planFocus.value })
  }

  return {
    facade,
    libraryCollapsed,
    planFocus,
    showShortcuts,
    dirty,
    saveState,
    canUndo,
    canRedo,
    activeTool,
    workflowStep,
    bindFacade,
    unbindFacade,
    command,
    toggleLibrary,
    togglePlanFocus,
  }
})
