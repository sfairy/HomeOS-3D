/**
 * 实体展示 Epoch 依赖注入工具
 *
 * 所属模块：composables/entity
 * 职责：在 computed 或渲染函数中建立实体 store 的响应式依赖锚点，
 *      使模板内非响应式的 getEntity / 全表扫描能随 WebSocket 更新正确触发重绘；
 *      优先按 domain 维度的 epoch 收窄依赖，未指定域时依赖全局 derivedEpoch。
 * 导出：
 *   - touchEntityStoreDisplayDeps(store, domains?)：手动触达 epoch 建立依赖（直接调用）
 *   - useEntityDisplayEpoch(domains?)：返回 computed<epoch>，组件中读取 .value 即可建立依赖
 */
import { computed } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
/**
 * 在 computed / 渲染函数中建立实体展示所需的 store 依赖。
 * 优先按 domainEpoch 收窄；无域时仅依赖 derivedEpoch（域 epoch 已对全量变更递增）。
 * @param {import('@/stores/entities.store').ReturnType<typeof useEntitiesStore>} entitiesStore
 * @param {string | string[] | undefined} [domains]
 */
export function touchEntityStoreDisplayDeps(
  entitiesStore: {
    getDomainEpoch?: (domain: string) => unknown
    derivedEpoch?: unknown
  },
  domains?: string | string[],
) {
  if (domains?.length) {
    const list = Array.isArray(domains) ? domains : [domains]
    for (const d of list) void entitiesStore.getDomainEpoch?.(d)
    return
  }
  void entitiesStore.derivedEpoch
}
/**
 * 订阅实体 store 变更 epoch，供模板内函数或非 computed 上下文触发重绘。
 * 在 render 中读取 .value 后，同帧内 getEntity / 全表扫描会随 WS 更新。
 * @param {string | string[] | undefined} [domains] - 可选 domain，用 getDomainEpoch 收窄依赖
 */
export function useEntityDisplayEpoch(domains?: string | string[]) {
  const entitiesStore = useEntitiesStore()
  return computed(() => {
    touchEntityStoreDisplayDeps(entitiesStore, domains)
    return entitiesStore.derivedEpoch
  })
}
