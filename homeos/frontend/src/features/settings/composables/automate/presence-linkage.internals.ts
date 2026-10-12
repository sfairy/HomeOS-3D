/**
 * @file presence-linkage.internals.ts
 * @module frontend/src/features/settings/composables/automate
 */
/**
 * 安防「全屋联动 · 人员在线判定」数据层。
 *
 * 职责：
 * - usePresenceEntitiesDisplay：由在场状态派生人员汇总文案、在家计数与状态映射；
 * - usePresenceEntityConfig：读写 security.presencePersons 自定义人员配置。
 *
 * 依赖（新架构）：
 * - @/shared/presence/composables/load-presence-home：在场状态读取（只读轮询层）
 * - @/shared/presence/utils/person.util：人员归一化与保存前清洗
 * - @/shared/presence/utils/entity-filter.util：判定实体 ID 缓存失效
 * - @/composables/config/system-config-core.internals：系统配置读写
 */
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import {
  handleSystemConfigPatchError,
  patchSystemConfig,
  useSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { loadPresenceHome } from '@/shared/presence/composables/load-presence-home'
import { invalidateAndReloadPresenceEntityIds } from '@/shared/presence/utils/entity-filter.util'
import { formatPresenceDetailSummary } from '@/shared/presence/utils/display.util'
import {
  computePersonAtHome,
  createEmptyPresencePerson,
  getPresencePersonsFromSecurity,
  sanitizePresencePersonsForSave,
} from '@/shared/presence/utils/person.util'
import { withBackendBootRetry } from '@/shared/utils/core/api-boot-retry.util'
import { getApiErrorMessage, isBackendUnreachableError } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'

// ── usePresenceEntitiesDisplay ──
/** usePresenceEntitiesDisplay：函数，按签名入参返回处理结果。 */
export function usePresenceEntitiesDisplay(options: {
  presencePersons: MaybeRefOrGetter<unknown[]>
  autoMode: MaybeRefOrGetter<boolean>
  presencePreview: MaybeRefOrGetter<object | null | undefined>
  loading: MaybeRefOrGetter<boolean>
}) {
  const entitiesStore = useEntitiesStore()

  const configuredPersons = computed(() =>
    sanitizePresencePersonsForSave(toValue(options.presencePersons)),
  )

  const previewMembers = computed(() => {
    const autoMode = toValue(options.autoMode)
    const presencePreview = toValue(options.presencePreview) as { members?: unknown[] } | null
    const apiMembers = presencePreview?.members
    if (!autoMode && Array.isArray(apiMembers) && apiMembers.length > 0) {
      return apiMembers
    }
    if (autoMode) {
      return apiMembers ?? []
    }
    return configuredPersons.value.map((person) => ({
      id: `person:${person.id}`,
      name: person.name,
      atHome: computePersonAtHome(person, (entityId) => {
        const entity = entitiesStore.getEntity(entityId)
        return entity?.state === 'home'
      }),
    }))
  })

  const personStatusMap = computed(() => {
    const map: Record<string, boolean> = {}
    if (toValue(options.autoMode)) return map
    for (const person of configuredPersons.value) {
      const member = previewMembers.value.find(
        (m) => (m as { id?: string }).id === `person:${person.id}`,
      ) as { atHome?: boolean } | undefined
      if (member) map[person.id] = !!member.atHome
    }
    return map
  })

  const atHomeCount = computed(
    () => previewMembers.value.filter((m) => (m as { atHome?: boolean }).atHome).length,
  )

  const showHomeSummaryStyle = computed(
    () => !toValue(options.loading) && atHomeCount.value > 0,
  )

  const personRowCount = computed(() => {
    const arr = Array.isArray(toValue(options.presencePersons))
      ? (toValue(options.presencePersons) as unknown[])
      : []
    return arr.length || 1
  })

  const summaryText = computed(() =>
    formatPresenceDetailSummary(previewMembers.value, {
      loading: toValue(options.loading),
      autoMode: toValue(options.autoMode),
      personCount: configuredPersons.value.length,
    }),
  )

  const modeHint = computed(() =>
    toValue(options.autoMode)
      ? '自动跟踪 · 添加并保存后切换为自定义'
      : `自定义 · ${configuredPersons.value.length || personRowCount.value} 位人员`,
  )

  return {
    configuredPersons,
    previewMembers,
    personStatusMap,
    atHomeCount,
    showHomeSummaryStyle,
    summaryText,
    modeHint,
  }
}

// ── usePresenceEntityConfig ──
/** 人员在线判定配置（security.presencePersons） */
export function usePresenceEntityConfig() {
  const chrome = useChromeStore()
  const { load: loadSystemConfig } = useSystemConfig()
  const loading = ref(false)
  const saving = ref(false)
  const presencePersons = ref([createEmptyPresencePerson()])
  const presencePreview = ref<Record<string, unknown> | null>(null)

  const autoMode = computed(() => {
    const cleaned = sanitizePresencePersonsForSave(presencePersons.value)
    return cleaned.length === 0
  })

  let presenceLoaded = false

  async function refresh({
    bootRetry = false,
    silent = false,
  }: { bootRetry?: boolean; silent?: boolean } = {}) {
    const showLoading = !silent && !presenceLoaded
    if (showLoading) loading.value = true
    try {
      const fetchConfig = () => loadSystemConfig({ force: true })
      const configPromise = bootRetry ? withBackendBootRetry(fetchConfig) : fetchConfig()
      const [cfg, presence] = await Promise.all([
        configPromise,
        loadPresenceHome().then((data) => {
          if (!data) logger.warn('拉取人存在预览失败')
          return data
        }),
      ])
      const persons = getPresencePersonsFromSecurity(cfg?.security)
      presencePersons.value = persons.length ? persons : [createEmptyPresencePerson()]
      presencePreview.value = presence
      await invalidateAndReloadPresenceEntityIds()
      presenceLoaded = true
    } catch (e) {
      if (isBackendUnreachableError(e)) {
        logger.warn('刷新人存在人员配置失败(后端不可用)', e)
      } else {
        logger.warn('刷新人存在人员配置失败', e)
      }
      if (!silent && (showLoading || !presenceLoaded)) {
        chrome.notify(getApiErrorMessage(e, '加载人存在配置失败'), 'error')
      }
    } finally {
      if (showLoading) loading.value = false
    }
  }

  async function save() {
    saving.value = true
    try {
      const cleaned = sanitizePresencePersonsForSave(presencePersons.value)
      await patchSystemConfig({
        security: {
          presencePersons: cleaned,
        },
      })
      presencePersons.value = cleaned.length ? cleaned : [createEmptyPresencePerson()]
      await invalidateAndReloadPresenceEntityIds()
      const presence = await loadPresenceHome()
      if (!presence) logger.warn('保存后人存在预览拉取失败')
      presencePreview.value = presence
      chrome.notify('人员在线判定已保存', 'success')
      return true
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) return false
      logger.warn('保存人存在人员配置失败', e)
      chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    loading,
    saving,
    presencePersons,
    autoMode,
    presencePreview,
    refresh,
    save,
  }
}
