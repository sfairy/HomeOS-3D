/**
 * @file home-mode-panel-context.internals.ts
 * @module frontend/src/features/home-mode/composables
 */
import { fetchHomeModeContext, fetchHomeModeExecutionHistory, fetchHomeModePresets, fetchHomeModeTemplates, installHomeModePreset } from '@/services/api/home-modes'
import { collectHaSceneScriptRecords } from '@/shared/utils/ha/scene-script.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { fetchPresenceHome } from '@/services/api/security'
import { downloadBlob } from '@/shared/utils/core/misc.util'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import { formatPresenceBadgeSummary } from '@/shared/presence/utils/display.util'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import type { ActionTemplate } from './draft.internals'
import type { useHomeModes } from './useHomeModes'
import type { useChromeStore } from '@/stores/chrome.store'

type HomeModesApi = Pick<ReturnType<typeof useHomeModes>, 'modes' | 'fetchModes' | 'createMode'>

export function useHomeModePanelContext(options: {
  modes: HomeModesApi['modes']
  fetchModes: HomeModesApi['fetchModes']
  createMode: HomeModesApi['createMode']
  activeTab: Ref<string>
  chrome: ReturnType<typeof useChromeStore>
  touchOrchCounts: () => void
}) {
  const { modes, fetchModes, createMode, activeTab, chrome, touchOrchCounts } = options

  const entitiesStore = useEntitiesStore()

  const modeContext = ref<Record<string, unknown>>({
    calendarAway: false,
    triggerBindingsCount: 0,
    triggerLogs: [],
  })
  const presenceLabel = ref('--')
  const actionTemplates = ref<ActionTemplate[]>([])
  const modePresets = ref<Record<string, unknown>[]>([])
  const presetInstalling = ref<string | null>(null)
  const savedScenes = ref<Record<string, unknown>[]>([])
  const savedScripts = ref<Record<string, unknown>[]>([])
  const execHistory = ref<Record<string, unknown>[]>([])
  const contextLoadWarnings = ref<string[]>([])
  const triggerLogs = computed(() => {
    const logs = modeContext.value.triggerLogs
    return Array.isArray(logs) ? logs : []
  })
  const showPresetSidebar = computed(() => modePresets.value.length > 0)

  let contextLoaded = false

  async function fetchContextBatch(
    keys: Array<
      'context' | 'presence' | 'history' | 'templates' | 'presets' | 'scenes' | 'scripts'
    >,
    resetWarnings: boolean,
  ) {
    if (resetWarnings) contextLoadWarnings.value = []
    const warnings: string[] = resetWarnings ? [] : [...contextLoadWarnings.value]
    const labels: Record<string, string> = {
      context: '运行上下文',
      presence: '人员状态',
      history: '执行历史',
      templates: '动作模板',
      presets: '预设包',
      scenes: '场景列表',
      scripts: '脚本列表',
    }
    const endpoints: Record<string, () => Promise<{ data: unknown }>> = {
      context: () => fetchHomeModeContext(),
      presence: () => fetchPresenceHome(),
      history: () => fetchHomeModeExecutionHistory(),
      templates: () => fetchHomeModeTemplates(),
      presets: () => fetchHomeModePresets(),
      scenes: () =>
        Promise.resolve({ data: collectHaSceneScriptRecords(entitiesStore.entities, 'scene') }),
      scripts: () =>
        Promise.resolve({
          data: collectHaSceneScriptRecords(entitiesStore.entities, 'script'),
        }),
    }
    const results = await Promise.all(
      keys.map(async (key) => {
        try {
          return { key, data: (await endpoints[key]()).data }
        } catch {
          if (!warnings.includes(labels[key] || key)) warnings.push(labels[key] || key)
          return { key, data: null }
        }
      }),
    )
    const byKey = Object.fromEntries(results.map((r) => [r.key, r.data]))
    if ('context' in byKey) modeContext.value = (byKey.context as Record<string, unknown>) || {}
    if ('history' in byKey) {
      const hist = byKey.history
      const fallback = modeContext.value.recentExecutions
      execHistory.value = (Array.isArray(hist)
        ? hist
        : Array.isArray(fallback)
          ? fallback
          : []) as Record<string, unknown>[]
    }
    if ('templates' in byKey)
      actionTemplates.value = (Array.isArray(byKey.templates) ? byKey.templates : []) as ActionTemplate[]
    if ('presets' in byKey)
      modePresets.value = (Array.isArray(byKey.presets) ? byKey.presets : []) as Record<
        string,
        unknown
      >[]
    if ('scenes' in byKey)
      savedScenes.value = (Array.isArray(byKey.scenes) ? byKey.scenes : []) as Record<
        string,
        unknown
      >[]
    if ('scripts' in byKey)
      savedScripts.value = (Array.isArray(byKey.scripts) ? byKey.scripts : []) as Record<
        string,
        unknown
      >[]
    if ('presence' in byKey) {
      presenceLabel.value =
        formatPresenceBadgeSummary(
          byKey.presence as { members?: unknown[] } | null | undefined,
        ) || '--'
    }
    contextLoadWarnings.value = warnings
  }

  async function loadContext(options: { scope?: 'full' | 'runtime' } = {}) {
    const scope = options.scope ?? (contextLoaded ? 'runtime' : 'full')
    try {
      if (scope === 'runtime') {
        await fetchContextBatch(['context', 'presence', 'history'], false)
      } else {
        await fetchContextBatch(
          ['context', 'presence', 'history', 'templates', 'presets', 'scenes', 'scripts'],
          true,
        )
        contextLoaded = true
      }
    } catch (e) {
      logger.debug('加载家庭模式上下文失败', e)
      if (scope === 'full') contextLoadWarnings.value = ['运行上下文']
    }
  }

  async function installPreset({
    presetId,
    entityOverrides,
    merge,
  }: {
    presetId: string
    entityOverrides?: Record<string, string>
    merge?: boolean
  }) {
    presetInstalling.value = presetId
    try {
      const { data } = await installHomeModePreset(presetId, {
        entityOverrides: entityOverrides || {},
        merge: merge ?? false,
      })
      await fetchModes({ silent: true })
      await loadContext({ scope: 'full' })
      touchOrchCounts()
      if (data?.id) activeTab.value = data.id
      const unresolved = data?.unresolvedActions?.length || 0
      const mergeHint = merge ? '（已覆盖更新）' : ''
      if (unresolved > 0) {
        chrome.notify(
          `预设已安装${mergeHint}，仍有 ${unresolved} 个实体未解析：${(data.unresolvedActions || []).join('、')}`,
          'warning',
        )
      } else {
        chrome.notify(`已安装预设「${data?.name || presetId}」${mergeHint}`, 'success')
      }
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '安装预设失败'), 'error')
    } finally {
      presetInstalling.value = null
    }
  }

  function exportModesJson() {
    const payload = modes.value.map((m) => ({
      name: m.name,
      icon: m.icon,
      config: m.config,
      triggers: m.triggers,
      sortOrder: m.sortOrder,
      exclusiveGroup: m.exclusiveGroup,
      priority: m.priority,
    }))
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `home-modes-${new Date().toISOString().slice(0, 10)}.json`)
  }

  async function onImportFile(ev: Event) {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const list = JSON.parse(text)
      if (!Array.isArray(list)) throw new Error('格式错误')
      let success = 0
      let failed = 0
      let skipped = 0
      const failReasons: string[] = []
      const existingNames = new Set(modes.value.map((m) => m.name?.trim()).filter(Boolean))
      for (const item of list) {
        const name = (item.name || '导入模式').trim()
        if (existingNames.has(name)) {
          skipped++
          continue
        }
        try {
          await createMode({
            name,
            icon: item.icon || '🏠',
            config:
              typeof item.config === 'string'
                ? JSON.parse(item.config)
                : Array.isArray(item.config)
                  ? item.config
                  : [],
            triggers:
              typeof item.triggers === 'string'
                ? JSON.parse(item.triggers)
                : Array.isArray(item.triggers)
                  ? item.triggers
                  : undefined,
            sortOrder: item.sortOrder ?? 0,
            exclusiveGroup: item.exclusiveGroup || 'default',
            priority: item.priority ?? 50,
          })
          existingNames.add(name)
          success++
        } catch (err) {
          failed++
          if (failReasons.length < 3) {
            failReasons.push(`${name}: ${getApiErrorMessage(err, '未知错误')}`)
          }
        }
      }
      await fetchModes({ silent: true })
      await loadContext({ scope: 'full' })
      touchOrchCounts()
      const parts: string[] = []
      if (success > 0) parts.push(`成功 ${success} 个`)
      if (skipped > 0) parts.push(`跳过重名 ${skipped} 个`)
      if (failed > 0) parts.push(`失败 ${failed} 个`)
      let message = parts.length ? `导入完成：${parts.join('，')}` : '没有可导入的模式'
      if (failReasons.length) {
        message += `（${failReasons.join('；')}）`
      }
      chrome.notify(message, failed > 0 ? 'warning' : 'success')
    } catch (e) {
      chrome.notify((e as { message?: string })?.message || '导入失败', 'error')
    }
  }

  return {
    modeContext,
    presenceLabel,
    actionTemplates,
    modePresets,
    presetInstalling,
    savedScenes,
    savedScripts,
    execHistory,
    contextLoadWarnings,
    triggerLogs,
    showPresetSidebar,
    loadContext,
    installPreset,
    exportModesJson,
    onImportFile,
  }
}

// ── useHomeModePanel ──
