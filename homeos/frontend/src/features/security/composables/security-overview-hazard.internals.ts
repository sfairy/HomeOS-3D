/**
 * @file security-overview-hazard.internals.ts
 * @module frontend/src/features/security/composables
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { callService } from '@/services/api/entities'
import { sceneEntityIdFromRecord } from '@/shared/utils/ha/scene-script.util'
import { runHazardDrill as runHazardDrillApi } from '@/services/api/security'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { hasAnyHazardSensorBinding, formatHazardBindingSummaryText } from '@homeos/shared'
import type { useLayoutStore } from '@/stores/layout.store'
import type { useChromeStore } from '@/stores/chrome.store'

type LayoutStore = ReturnType<typeof useLayoutStore>
type ChromeStore = ReturnType<typeof useChromeStore>

/** 危险传感器 / 紧急场景配置与测试 */
export function createSecurityOverviewHazard(opts: {
  layoutStore: LayoutStore
  chrome: ChromeStore
}) {
  const { layoutStore, chrome } = opts
  const router = useRouter()
  const hazardTesting = ref(false)
  const hazardDrillBusy = ref(false)

  const hazardConfigured = computed(() => {
    const hc = layoutStore.layoutConfig.haConfig || {}
    return Boolean(hc.hazardEmergencySceneId?.trim() || hasAnyHazardSensorBinding(hc))
  })

  const hazardSummary = computed(() => {
    const hc = layoutStore.layoutConfig.haConfig || {}
    const bindingText = formatHazardBindingSummaryText(hc)
    const parts: string[] = []
    if (bindingText) parts.push(`已绑定 ${bindingText}`)
    if (hc.hazardEmergencySceneId?.trim()) parts.push('紧急场景')
    if (hc.hazardDrillMode) parts.push('演习模式')
    return parts.length ? parts.join(' · ') : '可在集成绑定中配置烟/燃气/水浸传感器与紧急场景'
  })

  const hazardBarTitle = computed(() => {
    const hc = layoutStore.layoutConfig.haConfig || {}
    const hasScene = Boolean(hc.hazardEmergencySceneId?.trim())
    const hasBinding = hasAnyHazardSensorBinding(hc)
    if (hasScene && hasBinding) return '安全传感器联动已配置'
    if (hasBinding) return '危险传感器已绑定'
    if (hasScene) return '紧急场景已配置'
    return '安全传感器'
  })

  const hazardSceneConfigured = computed(() =>
    Boolean(layoutStore.layoutConfig.haConfig?.hazardEmergencySceneId?.trim()),
  )

  function goHazardBindings() {
    router.push({ path: '/settings', query: { tab: 'bindings', section: 'security' } })
  }

  async function testHazardLinkage() {
    const raw = layoutStore.layoutConfig.haConfig?.hazardEmergencySceneId?.trim()
    const sceneIds = raw
      ? raw
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    if (!sceneIds.length) {
      chrome.notify('请先在集成绑定中配置紧急场景 ID', 'warning')
      goHazardBindings()
      return
    }
    hazardTesting.value = true
    try {
      for (const sceneId of sceneIds) {
        const entityId = sceneEntityIdFromRecord({ haConfigId: sceneId }) || sceneId
        await callService({ domain: 'scene', service: 'turn_on', entity_id: entityId })
      }
      chrome.notify(
        sceneIds.length > 1
          ? `已触发 ${sceneIds.length} 个紧急场景（测试）`
          : '已触发紧急场景（测试）',
        'success',
      )
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '场景执行失败'), 'error')
    } finally {
      hazardTesting.value = false
    }
  }

  async function runHazardDrill(kind = 'smoke') {
    hazardDrillBusy.value = true
    try {
      const { data } = await runHazardDrillApi(kind)
      chrome.notify(data?.message || '演习已触发', data?.success !== false ? 'success' : 'warning')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '演习失败'), 'error')
    } finally {
      hazardDrillBusy.value = false
    }
  }

  return {
    hazardTesting,
    hazardDrillBusy,
    hazardConfigured,
    hazardSummary,
    hazardBarTitle,
    hazardSceneConfigured,
    goHazardBindings,
    testHazardLinkage,
    runHazardDrill,
  }
}
