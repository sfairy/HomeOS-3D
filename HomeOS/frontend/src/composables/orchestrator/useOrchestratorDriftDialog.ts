/**
 * @file useOrchestratorDriftDialog.ts
 * @module composables/orchestrator
 * @description 联动器漂移 diff 弹窗 composable（单例）。
 *
 * 职责：以 Promise 形式打开漂移 diff 弹窗，等待用户确认或取消；
 *      各 Builder 共用同一单例，避免多个弹窗并存。
 *
 * 依赖：
 * - vue（reactive）
 */
import { reactive } from 'vue'

/** 漂移弹窗载荷：项目名 / 方向 / 本地与 HA YAML / diff 预览 / diff 统计 */
interface DriftDialogPayload {
  itemName: string
  direction: 'push' | 'pull'
  localYaml: string
  haYaml: string
  diffPreview: string[]
  diffStats: { added: number; removed: number; changed: number }
}

// 单例状态：open / payload / Promise resolve 回调
const state = reactive({
  open: false,
  payload: null as DriftDialogPayload | null,
  resolve: null as ((ok: boolean) => void) | null,
})

/**
 * 漂移 diff 弹窗单例工厂。
 *
 * @returns driftDialogState 单例响应式状态；openDriftDialog 打开并返回 Promise；
 *          confirmDriftDialog 确认（resolve true）；cancelDriftDialog 取消（resolve false）
 */
function useOrchestratorDriftDialog() {
  /**
   * 打开漂移弹窗并返回 Promise；用户确认/取消后 Promise 才 resolve。
   * @param payload 弹窗载荷
   * @returns 用户是否确认
   */
  function openDriftDialog(payload: DriftDialogPayload): Promise<boolean> {
    state.payload = payload
    state.open = true
    return new Promise((resolve) => {
      state.resolve = resolve
    })
  }

  /** 用户确认：关闭弹窗并 resolve(true)。 */
  function confirmDriftDialog() {
    state.open = false
    state.resolve?.(true)
    state.resolve = null
  }

  /** 用户取消：关闭弹窗并 resolve(false)。 */
  function cancelDriftDialog() {
    state.open = false
    state.resolve?.(false)
    state.resolve = null
  }

  return {
    driftDialogState: state,
    openDriftDialog,
    confirmDriftDialog,
    cancelDriftDialog,
  }
}

/** 联动器漂移 diff 弹窗单例（各 Builder 共用） */
export const orchestratorDriftDialog = useOrchestratorDriftDialog()
