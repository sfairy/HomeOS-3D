/**
 * 实体弹窗解析（纯元数据层）——「entity_id → 弹窗种类」的判定与 props 构造。
 *
 * ## 分层：为什么和组件映射分开
 *
 * 本模块**不含任何 Vue 组件**，因此可以被 `utils/`、`composables/`、`stores/` 等下层安全引用。
 * 与之配套的「种类 → 懒加载组件」映射在 `@/components/entities/popup-registry.ts`（需要
 * `components/`，只能被上层引用）。
 *
 * 拆两层的原因：原先两者合在一个文件里，导致 `utils/entity/popup-registry.ts` 这个
 * deprecated re-export 桩被迫向上引用 `components/`（分层倒置），只能挂在
 * `check-frontend-deps.mjs` 的 `LAYER_WHITELIST` 上。拆开后纯判定函数可以真正下沉，
 * `hasEntityControlPopup` 也不再「从组件映射派生」。
 *
 * 设备弹窗栈约定见 `@/components/entities/popup-registry.ts`。
 *
 * 依赖：`@homeos/shared`（getEntityDomain）、`./entity-type.util`（生活账户判定）、
 *      `@/shared/types/entity-store`（类型）。
 */
import { getEntityDomain } from '@homeos/shared'
import type { HaEntityState, EntitiesMap } from '@/shared/types/entity-store'
import {
  isCommEntity,
  isElectricityEntity,
  isGasEntity,
  isWaterEntity,
} from './entity-type.util'

/**
 * 弹窗种类。与组件映射一一对应，但与组件解耦（本模块不认识任何 .vue）。
 */
export type EntityPopupKind =
  /** 空调 / 温控 */
  | 'climate'
  /** 灯光 */
  | 'light'
  /** 窗帘 */
  | 'cover'
  /** 多媒体（紧凑锚定；全屏走栈 B） */
  | 'media_player'
  /** 生活账户（水 / 电 / 气）信息弹窗 */
  | 'utility-meter'
  /** 通讯信息弹窗 */
  | 'comm'

/** 域直达的弹窗种类（其余经实体类型判定）。 */
const DOMAIN_POPUP_KIND: Record<string, EntityPopupKind> = {
  climate: 'climate',
  light: 'light',
  cover: 'cover',
  media_player: 'media_player',
}

/**
 * 根据 entity_id 解析弹窗种类（与部件点击行为一致）。
 *
 * 解析顺序：
 * 1. 域映射表（light / climate / cover / media_player）。
 * 2. 生活账户（水 / 电 / 气）。
 * 3. 通讯。
 * 4. 其余实体不提供弹窗，返回 null。
 *
 * @param entityId 实体 ID。
 * @returns 弹窗种类；无匹配时返回 null。
 */
export function resolveEntityPopupKind(entityId: string): EntityPopupKind | null {
  if (!entityId) return null
  const mapped = DOMAIN_POPUP_KIND[getEntityDomain(entityId)]
  if (mapped) return mapped
  if (isElectricityEntity(entityId) || isGasEntity(entityId) || isWaterEntity(entityId)) {
    return 'utility-meter'
  }
  if (isCommEntity(entityId)) return 'comm'
  return null
}

/**
 * 判断实体是否可打开控制/信息弹窗。
 *
 * @param entityId 实体 ID。
 * @param entities 实体映射表（当前未使用，保留以兼容旧调用）。
 */
export function hasEntityControlPopup(entityId: string, entities: EntitiesMap = {}): boolean {
  void entities
  return resolveEntityPopupKind(entityId) != null
}

/**
 * 判断实体弹窗是否支持点击打开。
 *
 * 凡有控制弹窗的域（含灯光）均支持单击打开；
 * 灯光短按开关改由行内「切换」按钮承担，避免「点不开弹窗」的发现成本。
 */
export function entityPopupOpensOnClick(entityId: string): boolean {
  return hasEntityControlPopup(entityId)
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
  const kind = resolveEntityPopupKind(entityId)
  if (kind === 'utility-meter' || kind === 'comm') {
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
