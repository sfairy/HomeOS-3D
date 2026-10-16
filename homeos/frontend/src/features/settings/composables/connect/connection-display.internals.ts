/**
 * @file connection-display.internals.ts
 * @module frontend/src/features/settings/composables/connect
 */
import { useSystemDiagnostics } from '@/shared/status'
import { useEntitiesStore } from '@/stores/entities.store'
import { logger } from '@/shared/utils/core/logger'
import { formatShortDateTime } from '@/shared/utils/format/locale-format.util'
import { computed, onMounted, ref } from 'vue'

export function useConnectionDisplay() {
  const entitiesStore = useEntitiesStore()
  const { loadDiagnostics } = useSystemDiagnostics()
  const backendReachable = ref<boolean | null>(null)
  const haWsMode = ref('standalone')

  async function checkBackendReachable() {
    try {
      const res = await fetch('/health', { method: 'GET', cache: 'no-store' })
      backendReachable.value = res.ok
    } catch {
      backendReachable.value = false
    }
  }

  async function loadHaWsMode() {
    try {
      const data = (await loadDiagnostics()) as { ha?: { wsMode?: string } } | null
      haWsMode.value = data?.ha?.wsMode || 'standalone'
    } catch (e) {
      logger.debug('加载 HA WS 角色失败', (e as { message?: string })?.message || e)
      haWsMode.value = 'standalone'
    }
  }

  onMounted(async () => {
    void checkBackendReachable()
    await loadHaWsMode()
  })

  const connTabs = computed(() => [
    { id: 'credentials', label: '连接凭证', emoji: '🔑', accent: 'var(--module-accent-connection)' },
    {
      id: 'entities',
      label: '实体同步',
      emoji: '🔄',
      accent: 'var(--module-accent-connection-sub)',
      count: entitiesStore.totalCount || undefined,
    },
    { id: 'advanced', label: '高级', emoji: '⚙️', accent: 'var(--module-accent-automation)' },
  ])

  const haWsModeLabel = computed(() => {
    if (haWsMode.value === 'leader') return 'Leader'
    if (haWsMode.value === 'follower') return 'Follower'
    return 'Standalone'
  })

  const haWsModeBadgeMod = computed(() => {
    if (haWsMode.value === 'leader') return 'leader'
    if (haWsMode.value === 'follower') return 'follower'
    return 'standalone'
  })

  const haWsModeDesc = computed(() => {
    if (haWsMode.value === 'leader') {
      return '本实例维持与 Home Assistant 的 WebSocket 长连接，并向其他实例分发实体状态。'
    }
    if (haWsMode.value === 'follower') {
      return '通过 Leader 获取 HA 状态，本实例不直接连接 HA WebSocket。'
    }
    return '单实例部署，本进程直接连接 HA WebSocket。'
  })

  function formatCacheTime(ts: number | null | undefined) {
    if (!ts) return '—'
    return formatShortDateTime(ts) || '—'
  }

  const connectionStatCells = computed(() => {
    const haTone = entitiesStore.connected ? 'emerald' : 'rose'
    const wsTone =
      haWsMode.value === 'leader' ? 'emerald' : haWsMode.value === 'follower' ? 'amber' : 'slate'

    const cells = [
      {
        key: 'ha',
        label: 'HA 连接状态',
        value: entitiesStore.connected ? '已连接' : '已断开',
        tone: haTone,
      },
      {
        key: 'entities',
        label: '已加载实体数',
        value: '{n} 个'.replace('{n}', String(entitiesStore.totalCount)),
        tone: 'violet',
        mono: true,
      },
      {
        key: 'ws',
        label: 'HA WS 角色',
        value: haWsModeLabel.value,
        tone: wsTone,
      },
    ]
    if (entitiesStore.entitiesCacheHydrated || entitiesStore.entitiesCacheSavedAt) {
      cells.push({
        key: 'cache',
        label: '本地实体缓存',
        value: entitiesStore.entitiesCacheHydrated
          ? 'IndexedDB'
          : formatCacheTime(entitiesStore.entitiesCacheSavedAt),
        tone: 'amber',
      })
    }
    return cells
  })

  return {
    entitiesStore,
    connTabs,
    backendReachable,
    haWsModeLabel,
    haWsModeBadgeMod,
    haWsModeDesc,
    connectionStatCells,
    loadHaWsMode,
  }
}
