/**
 * @file bindings-ha.internals.ts
 * @module frontend/src/features/settings/composables/connect
 */
/** HA 绑定：摄像头 / 门铃 */

import { computed, type Ref } from 'vue'
import type { UILayoutConfig, SecurityCameraBinding } from '@/shared/types/layout'
import { clearDoorbellCamera, toggleDoorbellCamera } from '@/shared/utils/layout/doorbell.util'
import { normalizeSecurityCameras } from '@/shared/utils/layout/security-cameras.util'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'

// ── useHaBindings ──
export function useHaBindings(layoutConfig: Ref<UILayoutConfig>) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const securityCameras = computed<SecurityCameraBinding[]>({
    get: () => normalizeSecurityCameras(layoutConfig.value.haConfig.securityCameras),
    set: (v) => {
      layoutConfig.value.haConfig.securityCameras = normalizeSecurityCameras(v)
    },
  })

  function addCamera() {
    securityCameras.value = [...securityCameras.value, { entityId: '', go2rtcUrl: '' }]
  }

  /** 改写第 idx 路监控的实体 ID（空串表示整路只走 go2rtc 局域网地址）。 */
  function setCameraEntity(idx: number, entityId: string) {
    const list = securityCameras.value.map((binding, i) =>
      i === idx ? { ...binding, entityId: String(entityId || '').trim() } : binding,
    )
    securityCameras.value = list
  }

  /** 改写第 idx 路监控的 go2rtc 局域网地址（同源 MSE 中继，留空则回落 HA 实体）。 */
  function setCameraGo2rtcUrl(idx: number, go2rtcUrl: string) {
    const list = securityCameras.value.map((binding, i) =>
      i === idx ? { ...binding, go2rtcUrl: String(go2rtcUrl || '').trim() } : binding,
    )
    securityCameras.value = list
  }

  function removeCamera(idx: number) {
    const list = [...securityCameras.value]
    const removed = list[idx]
    if (removed == null) return
    list.splice(idx, 1)
    securityCameras.value = list
    const removedEntityId = String(removed.entityId || '').trim()
    if (!removedEntityId) return
    const hc = layoutStore.layoutConfig.haConfig
    clearDoorbellCamera(hc, removedEntityId)
    if (hc.securityCamera === removedEntityId) {
      hc.securityCamera = String(list[0]?.entityId || '')
    }
  }

  function toggleDoorbellCam(cam: string) {
    const ok = toggleDoorbellCamera(layoutStore.layoutConfig.haConfig, cam)
    if (!ok) {
      chrome.notify('请先在「安防传感器与门铃」中添加门铃路由，再指定门铃画面', 'warning')
    }
  }

  function setDefaultCamera(cam: string) {
    layoutStore.layoutConfig.haConfig.securityCamera = cam
  }

  return {
    securityCameras,
    addCamera,
    setCameraEntity,
    setCameraGo2rtcUrl,
    removeCamera,
    toggleDoorbellCam,
    setDefaultCamera,
  }
}
