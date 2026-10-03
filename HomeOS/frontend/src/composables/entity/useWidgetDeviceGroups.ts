/**
 * @file useWidgetDeviceGroups.ts
 * @module frontend/src/composables
 */
import { computed } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  domainIndexToArray,
  getEntityDisplayName,
} from '@/utils/entity/derived.util'

function listDomainEntityIds(
  es: ReturnType<typeof useEntitiesStore>,
  domain: string,
  domainPrefix: string,
): string[] {
  void es.getDomainEpoch(domain)
  void es.derivedEpoch

  const indexed = domainIndexToArray(es.domainEntityIndex.get(domain))
  if (indexed.length) return indexed

  // 索引未就绪或该域缺失时，回退前缀扫描（不要求整个 index 为空）
  return Object.keys(es.entities).filter((id) => id.startsWith(domainPrefix))
}

/** 按房间关键词对实体做启发式分组（开关/窗帘 Widget 等） */
export function useWidgetDeviceGroups(
  domainPrefix: string,
  inferRoom: (entityId: string, name: string) => string,
) {
  const es = useEntitiesStore()
  const domain = domainPrefix.endsWith('.') ? domainPrefix.slice(0, -1) : domainPrefix

  const groups = computed(() => {
    const ids = listDomainEntityIds(es, domain, domainPrefix)
    const heuristicMap: Record<
      string,
      { key: string; label: string; configured: false; entityIds: string[] }
    > = {}

    for (const entityId of ids) {
      const entity = es.entities[entityId]
      if (!entity || entity.state === 'unavailable') continue
      if (!entityId.startsWith(domainPrefix)) continue
      const name = getEntityDisplayName(entityId, entity)
      const room = inferRoom(entityId, name)
      if (!heuristicMap[room]) {
        heuristicMap[room] = { key: room, label: room, configured: false, entityIds: [] }
      }
      heuristicMap[room].entityIds.push(entityId)
    }

    return Object.values(heuristicMap).filter((g) => g.entityIds.length > 0)
  })

  return { groups }
}
