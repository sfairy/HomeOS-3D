/** 设备弹窗栈约定： */
import type { Component } from 'vue'
import { lazyComponent } from '@/shared/utils/core/lazy-component'
import {
  resolveEntityPopupKind,
  type EntityPopupKind,
} from '@/shared/entity/utils/popup-registry.util'

const LightControlPopup = lazyComponent(
  () => import('@/components/entities/popups/LightControlPopup.vue'),
)
const ClimateControlPopup = lazyComponent(
  () => import('@/components/entities/popups/ClimateControlPopup.vue'),
)
const CoverControlPopup = lazyComponent(
  () => import('@/components/entities/popups/CoverControlPopup.vue'),
)
const AsyncMediaPlayerPopup = lazyComponent(
  () => import('@/components/entities/popups/MediaPlayerPopup.vue'),
)
const AsyncUtilityMeterInfoPopup = lazyComponent(
  () => import('@/components/entities/popups/UtilityMeterInfoPopup.vue'),
)
const AsyncCommInfoPopup = lazyComponent(
  () => import('@/components/entities/popups/CommInfoPopup.vue'),
)

const popupComponentMap: Record<EntityPopupKind, Component> = {
  climate: ClimateControlPopup,
  light: LightControlPopup,
  cover: CoverControlPopup,
  media_player: AsyncMediaPlayerPopup,
  'utility-meter': AsyncUtilityMeterInfoPopup,
  comm: AsyncCommInfoPopup,
}

/**
 * 根据 entity_id 解析控制弹窗组件（与部件点击行为一致）。
 *
 * 种类判定见 `@/shared/entity/utils/popup-registry.util`；本函数只负责种类 → 组件。
 *
 * @param entityId 实体 ID。
 * @returns 弹窗组件；无匹配时返回 null。
 */
export function resolveEntityPopupComponent(entityId: string): Component | null {
  const kind = resolveEntityPopupKind(entityId)
  return kind ? popupComponentMap[kind] : null
}
