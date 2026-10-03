/**
 * @file useEngineCapabilities.ts
 * @module composables/orchestrator
 * @description 自动化本地引擎能力（engine capabilities）查询 composable。
 *
 * 职责：拉取后端自动化引擎能力对照（支持哪些域/服务/条件），供 Builder 选项渲染。
 *
 * 依赖：
 * - vue（ref）
 * - @/services/api/system（fetchEngineCapabilities）
 */
import { ref } from 'vue'
import { fetchEngineCapabilities } from '@/services/api/system'

/**
 * 拉取自动化本地引擎能力对照。
 *
 * @returns engineCaps 引擎能力对象 ref（失败时为 null）；loadEngineCaps 主动加载方法（默认拉取 /automation/engine/capabilities）
 */
export function useEngineCapabilities() {
  const engineCaps = ref<Record<string, unknown> | null>(null)

  /**
   * 主动加载引擎能力；失败时静默置空，避免阻塞 UI。
   * @param endpoint 后端能力查询端点（默认 /automation/engine/capabilities）
   */
  async function loadEngineCaps(endpoint = '/automation/engine/capabilities') {
    try {
      const { data } = await fetchEngineCapabilities(endpoint)
      engineCaps.value = (data as Record<string, unknown>) || null
    } catch {
      engineCaps.value = null
    }
  }

  return { engineCaps, loadEngineCaps }
}
