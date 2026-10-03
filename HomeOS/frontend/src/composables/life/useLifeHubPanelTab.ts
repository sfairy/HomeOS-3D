/**
 * 生活中心各 Tab 驱动内嵌 Hub 子页：支持重复点击同一入口仍强制切换。
 */
import { ref } from 'vue'

/** useLifeHubPanelTab：函数，按签名入参返回处理结果。 */
export function useLifeHubPanelTab(initial = 'overview') {
  const panelTab = ref(String(initial || 'overview'))
  const tabSelectToken = ref(0)

  function selectPanelTab(tab: string) {
    const next = String(tab || '').trim()
    if (!next) return
    panelTab.value = next
    tabSelectToken.value += 1
  }

  return { panelTab, tabSelectToken, selectPanelTab }
}
