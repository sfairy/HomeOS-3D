/**
 * 响应联动中心「配置漂移」点击：父级递增 token，子 Builder 打开列表/滚动到同步告警。
 */
import { inject, watch, type Ref } from 'vue'
import { ORCHESTRATOR_FOCUS_DRIFT_KEY } from '@/composables/orchestrator/orchestrator-inject-keys'

/** useOrchestratorDriftFocus：函数，按签名入参返回处理结果。 */
export function useOrchestratorDriftFocus(onFocus: () => void) {
  const token = inject<Ref<number> | null>(ORCHESTRATOR_FOCUS_DRIFT_KEY, null)
  if (!token) return
  watch(token, (n, prev) => {
    if (!n || n === prev) return
    onFocus()
  })
}
