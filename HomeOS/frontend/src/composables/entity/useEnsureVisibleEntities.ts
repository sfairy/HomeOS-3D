/**
 * 冷实体模式：对可见 ID 走 ensureEntities（POST /entities/batch/get）
 */
import { watch, type MaybeRefOrGetter } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { getWsPushPublicConfig } from '@/utils/config/frontend-config'
import { isColdFetchMissing } from '@/utils/entity/cold-fetch.util'
const BATCH = 80

/**
 * @param {import('vue').MaybeRefOrGetter<string[]>} idsRef
 * @param {{ immediate?: boolean }} [opts]
 */
export function useEnsureVisibleEntities(
  idsRef: MaybeRefOrGetter<string[]>,
  opts: { immediate?: boolean } = {},
) {
  const entitiesStore = useEntitiesStore()
  const { immediate = true } = opts
  async function ensureBatch(ids: string[] | null | undefined) {
    const wsPush = getWsPushPublicConfig()
    if (!wsPush?.coldEntityOnDemand) return
    const list = [...new Set((ids || []).filter(Boolean).map(String))]
      .filter((id) => !entitiesStore.getEntity(id) && !isColdFetchMissing(id))
      .slice(0, BATCH)
    if (!list.length) return
    await entitiesStore.ensureEntities(list).catch(() => null)
  }
  watch(
    idsRef,
    (ids) => {
      const list = typeof idsRef === 'function' ? idsRef() : Array.isArray(ids) ? ids : []
      void ensureBatch(list)
    },
    { immediate, deep: true },
  )
  return { ensureBatch }
}
