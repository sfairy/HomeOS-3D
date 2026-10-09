/**
 * @module entity-popup-registry
 * @description 实体控制弹窗组件注册表（设备弹窗栈 A）。
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
 * 依赖：
 * - `@homeos/shared`：getEntityDomain。
 * - `lazy-component`：弹窗组件懒加载。
 * - `useEntityType`：生活账户（水电气通讯）实体类型判定。
 */
import type { Component } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { lazyComponent } from '@/utils/core/lazy-component'
import type { HaEntityState, EntitiesMap } from '@/types/entity-store'
import {
  isElectricityEntity,
  isGasEntity,
  isWaterEntity,
  isCommEntity,
} from '@/composables/entity/useEntityType'

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

const popupComponentMap: Record<string, Component> = {
  climate: ClimateControlPopup,
  light: LightControlPopup,
  cover: CoverControlPopup,
  media_player: AsyncMediaPlayerPopup,
}

/**
 * 根据 entity_id 解析控制弹窗组件（与部件点击行为一致）。
 *
 * 解析顺序：
 * 1. 域映射表（light / climate / cover / media_player）。
 * 2. 生活账户信息弹窗（水 / 电 / 气）。
 * 3. 通讯信息弹窗。
 * 4. 其余实体不提供弹窗，返回 null。
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
  if (!entityId) return null
  const domain = getEntityDomain(entityId)
  const mapped = popupComponentMap[domain]
  if (mapped) return mapped
  if (isElectricityEntity(entityId) || isGasEntity(entityId) || isWaterEntity(entityId)) {
    return AsyncUtilityMeterInfoPopup
  }
  if (isCommEntity(entityId)) return AsyncCommInfoPopup
  return null
}

/**
 * 生成弹窗 props（entity 对象或 entityId）。
 *
 * 生活账户类实体仅传 entityId（弹窗内部自行拉取）；
 * 其他实体通过 getEntity 取实体对象后传入。
 *
 * @param entityId 实体 ID。
 * @param getEntity 可选的实体获取函数。
 * @returns 弹窗 props 对象。
 */
export function getEntityPopupProps(
  entityId: string,
  getEntity?: (id: string) => HaEntityState | null | undefined,
): { entityId?: string; entity?: HaEntityState } {
  if (!entityId) return {}
  if (
    isElectricityEntity(entityId) ||
    isGasEntity(entityId) ||
    isWaterEntity(entityId) ||
    isCommEntity(entityId)
  ) {
    return { entityId }
  }
  const entity = typeof getEntity === 'function' ? getEntity(entityId) : null
  // 始终带上 entityId；store 未 hydrate 时给最小 stub，避免弹窗 v-if="liveEntity" 空白。
  if (entity) return { entityId, entity }
  return {
    entityId,
    entity: {
      entity_id: entityId,
      state: 'unknown',
      attributes: {},
    } as HaEntityState,
  }
}

/**
 * 判断实体是否可打开控制/信息弹窗。
 */
export function hasEntityControlPopup(entityId: string, entities: EntitiesMap = {}): boolean {
  return !!resolveEntityPopupComponent(entityId, entities)
}

/**
 * 判断实体弹窗是否支持点击打开。
 *
 * 凡注册表有控制弹窗的域（含灯光）均支持单击打开；
 * 灯光短按开关改由行内「切换」按钮承担，避免「点不开弹窗」的发现成本。
 *
 * @param entityId 实体 ID。
 * @returns 有控制弹窗则 true。
 */
export function entityPopupOpensOnClick(entityId: string): boolean {
  return hasEntityControlPopup(entityId)
}
