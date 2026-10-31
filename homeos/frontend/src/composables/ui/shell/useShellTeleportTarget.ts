/**
 * @file useShellTeleportTarget.ts
 * @module composables/ui
 * @description 缩放壳 #teleport-target 就绪后再启用 Teleport，避免父组件早于 ScaledViewport 挂载时报
 *   “Invalid Teleport target on mount: null”，并避免回退 body 导致画布坐标错位。
 */
import { computed, nextTick, onActivated, onMounted, ref } from 'vue'

function probeShellTeleport() {
  return typeof document !== 'undefined' && !!document.getElementById('teleport-target')
}

/**
 * @returns teleportTarget - 就绪为 `#teleport-target`，否则暂用 `body`
 * @returns shellTeleportPending - 壳挂载点尚未出现
 * @returns refreshShellTeleport - 手动再探测（打开下拉前可调用）
 */
export function useShellTeleportTarget() {
  const ready = ref(probeShellTeleport())

  function refreshShellTeleport() {
    ready.value = probeShellTeleport()
  }

  onMounted(() => {
    refreshShellTeleport()
    nextTick(refreshShellTeleport)
  })

  onActivated(() => {
    refreshShellTeleport()
    nextTick(refreshShellTeleport)
  })

  const teleportTarget = computed(() => (ready.value ? '#teleport-target' : 'body'))
  const shellTeleportPending = computed(() => !ready.value)

  return { teleportTarget, shellTeleportPending, refreshShellTeleport }
}
