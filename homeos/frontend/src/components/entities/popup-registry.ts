/**
 * @module entity-popup-registry
 * @description 实体控制弹窗**组件映射层**（设备弹窗栈 A）。
 *
 * 设备弹窗栈约定：
 * - 栈 A（本注册表 + EntityControlHost）：设备列表 / 详情「控制」/ Hub 水电通讯
 * - 栈 B：门铃、设备组、媒体全屏 MediaPlayerModal
 * - 栈 C：画布 PanelRenderer more-info / 组合弹窗
 * - 栈 D：3D i3d-*-panel
 *
 * 保留范围（其余域不再弹窗）：
 * - 灯光 `light`
 * - 空调 / 温控 `climate`
 * - 窗帘 `cover`
 * - 多媒体 `media_player`（紧凑锚定；全屏走栈 B）
 * - 生活账户（水 / 电 / 气 / 通讯）
 *
 * 分层：本文件只做「弹窗种类 → 懒加载组件」映射（需要 `components/`）。
 *      「entity_id → 弹窗种类」的**纯判定**在 `@/shared/entity/utils/popup-registry.util`，
 *      下层（utils/composables/stores）请直接引用那一份，不要为本文件的组件映射买单。
 *
 * 依赖：`@/shared/entity/utils/popup-registry.util`（种类判定）、
 *      `@/shared/utils/core/lazy-component`（懒加载）。
 */
import type { Component } from 'vue'
import { lazyComponent } from '@/shared/utils/core/lazy-component'
import type { EntitiesMap } from '@/shared/types/entity-store'
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
 * @param entities 实体映射表（当前未使用，保留以兼容旧调用）。
 * @returns 弹窗组件；无匹配时返回 null。
 */
export function resolveEntityPopupComponent(
  entityId: string,
  entities: EntitiesMap = {},
): Component | null {
  void entities
  const kind = resolveEntityPopupKind(entityId)
  return kind ? popupComponentMap[kind] : null
}
