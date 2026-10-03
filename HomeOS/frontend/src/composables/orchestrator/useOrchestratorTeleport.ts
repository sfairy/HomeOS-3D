/**
 * 联动器模态 Teleport 挂载点 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 为联动器弹层（如下拉、模态）计算 Teleport 挂载目标，跟随 ScaledViewport 等比缩放
 *  - 壳挂载点未就绪时禁用 Teleport，避免 Invalid Teleport target
 *  - 在 keep-alive 失活场景下禁用 teleport，避免失活组件残留 DOM
 */
import { computed } from 'vue'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

/**
 * 获取联动器模态 Teleport 挂载点（随 ScaledViewport 等比缩放；未就绪 / keep-alive 失活时禁用）
 * @returns teleportTarget - 挂载目标；teleportDisabled - 是否禁用 teleport
 */
export function useOrchestratorTeleport() {
  const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
  const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
  const teleportDisabled = computed(
    () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
  )
  return { teleportTarget, teleportDisabled }
}
