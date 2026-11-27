/** 设备弹窗栈约定： */
import type { Component } from 'vue'
import { lazyComponent } from '@/kernel/core/index'
import { resolveEntityPopupKind, type EntityPopupKind } from '@/domain/entity/popup-registry'

const LightControlPopup = lazyComponent(() => import('@/features/entity/popups/LightControlPopup.vue'))
const ClimateControlPopup = lazyComponent(() => import('@/features/entity/popups/ClimateControlPopup.vue'))
const CoverControlPopup = lazyComponent(() => import('@/features/entity/popups/CoverControlPopup.vue'))
const AsyncMediaPlayerPopup = lazyComponent(() => import('@/features/entity/popups/MediaPlayerPopup.vue'))
const AsyncUtilityMeterInfoPopup = lazyComponent(() => import('@/features/entity/popups/UtilityMeterInfoPopup.vue'))
const AsyncCommInfoPopup = lazyComponent(() => import('@/features/entity/popups/CommInfoPopup.vue'))

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
