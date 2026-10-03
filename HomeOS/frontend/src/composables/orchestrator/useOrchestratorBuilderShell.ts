/**
 * @file useOrchestratorBuilderShell.ts
 * @module frontend/src/composables
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useOrchestratorBuilderBase } from '@/composables/orchestrator/useOrchestratorBuilderBase'
import { useOrchestratorImportFlow } from '@/composables/orchestrator/useOrchestratorImportFlow'
import { useYamlValidation } from '@/composables/orchestrator/useYamlValidation'
import { useOrchestratorPlaceholderWizard } from '@/composables/orchestrator/useOrchestratorPlaceholderWizard'
import { useInitialOrchestratorEdit } from '@/composables/orchestrator/useInitialOrchestratorEdit'
import {
  fetchOrchestratorBuiltinTemplates,
  installOrchestratorBuiltinTemplate,
  validateOrchestratorYaml,
} from '@/services/api/orchestrator'
import { fetchHomeModes } from '@/services/api/home-modes'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'

type OrchestratorBuilderKind = 'automation' | 'scene' | 'script'

const HA_IMPORT_PATHS: Record<OrchestratorBuilderKind, string> = {
  automation: '/ha-sync/automations/import',
  scene: '/ha-sync/scenes/import',
  script: '/ha-sync/scripts/import',
}

const ENTITY_LABELS: Record<OrchestratorBuilderKind, string> = {
  automation: '自动化',
  scene: '场景',
  script: '脚本',
}

const INSTALL_SUCCESS_MESSAGES: Record<OrchestratorBuilderKind, (name: string) => string> = {
  automation: (name) => `已安装「${name}」，请替换 YAML 中的 _placeholder 实体`,
  scene: (name) => `已安装「${name}」，请在编辑器中替换占位实体`,
  script: (name) => `已安装「${name}」`,
}

interface OrchestratorBuilderShellProps {
  embedded?: boolean
  initialEditId?: string
  openPlaceholderWizard?: boolean
}

interface OrchestratorBuilderShellOptions {
  kind: OrchestratorBuilderKind
  props: OrchestratorBuilderShellProps
  /** 是否在 onMounted 时加载 home modes（仅 automation 需要） */
  loadHomeModes?: boolean
  /** 导入流程：粘贴 YAML 校验通过后回调 */
  onImported?: (created: unknown) => Promise<void>
  /** 是否在导入流程中启用 YAML 校验（automation 为 true） */
  validateImportYaml?: boolean
  /** onMounted 额外初始化 */
  onMountedExtra?: () => void
}

/** automation / scene / script builder 共用 shell：base、导入、校验、模板、占位向导 */
export function useOrchestratorBuilderShell(opts: OrchestratorBuilderShellOptions) {
  const authStore = useAuthStore()
  const chrome = useChromeStore()
  const isAdmin = computed(() => authStore.role === 'admin')

  const base = useOrchestratorBuilderBase({
    kind: opts.kind,
    apiPath: `/${opts.kind === 'automation' ? 'automation' : opts.kind}`,
    haImportPath: HA_IMPORT_PATHS[opts.kind],
    defaultShowSidebar: !opts.props.embedded,
  })

  const yamlValidation = useYamlValidation({
    endpoint: '/ha-sync/validate-yaml',
    buildBody: (yaml: string) => ({ yaml, type: opts.kind }),
    // 优先走封装 API，保持单一路径
    request: async (yaml: string) => {
      const { data } = await validateOrchestratorYaml({ yaml, type: opts.kind })
      return data as Record<string, unknown>
    },
  })

  const importFlow = useOrchestratorImportFlow({
    chrome,
    validateYaml: opts.validateImportYaml
      ? (yaml: string) => yamlValidation.validate(yaml)
      : undefined,
    entityLabel: ENTITY_LABELS[opts.kind],
    onImported: opts.onImported,
  })

  const placeholderWizard = useOrchestratorPlaceholderWizard()
  const builtinTemplates = ref<unknown[]>([])
  const installingTpl = ref('')
  const homeModes = ref<unknown[]>([])

  async function loadBuiltinTemplates() {
    try {
      const { data } = await fetchOrchestratorBuiltinTemplates(opts.kind)
      builtinTemplates.value = data || []
    } catch (e) {
      logger.debug(`加载内置模板失败(${opts.kind})`, e)
      builtinTemplates.value = []
    }
  }

  async function loadHomeModes() {
    try {
      const { data } = await fetchHomeModes()
      homeModes.value = data || []
    } catch (e) {
      logger.debug('加载家庭模式失败', e)
      homeModes.value = []
    }
  }

  async function installTemplate(
    tpl: { id: string; name: string },
    editItem: (row: unknown) => Promise<void>,
  ) {
    const templateId = String(tpl?.id || '').trim()
    if (!templateId) {
      base.resultMsg.value = '模板无效：缺少 id'
      base.resultOk.value = false
      base.dismissAfter(2500)
      return
    }
    installingTpl.value = templateId
    try {
      const { data } = await installOrchestratorBuiltinTemplate(opts.kind, templateId)
      base.resultMsg.value = INSTALL_SUCCESS_MESSAGES[opts.kind](tpl.name)
      base.resultOk.value = true
      await base.loadList()
      const row = base.savedList.value.find((i) => i.id === data?.id) as
        Record<string, unknown> | undefined
      const placeholders = Array.isArray((data as { placeholders?: unknown[] })?.placeholders)
        ? (data as { placeholders: unknown[] }).placeholders
        : []
      if (row && placeholders.length) {
        await editItem(row)
        await placeholderWizard.openFor(
          String(row.id),
          String(row.name || tpl.name),
          opts.kind,
        )
      } else if (row) {
        await editItem(row)
      }
    } catch (e) {
      base.resultMsg.value = getApiErrorMessage(e, '模板安装失败')
      base.resultOk.value = false
    } finally {
      installingTpl.value = ''
      base.dismissAfter(2500)
    }
  }

  function setupInitialEdit(editItem: (item: unknown) => Promise<void>) {
    useInitialOrchestratorEdit(
      () => opts.props.initialEditId,
      base.savedList,
      base.editingId,
      editItem,
    )
  }

  function setupPlaceholderWizardWatch() {
    watch(
      [() => opts.props.openPlaceholderWizard, () => base.editingId.value],
      ([open, id]) => {
        if (!open || !id) return
        const row = base.savedList.value.find((i) => String(i.id) === String(id))
        void placeholderWizard.openFor(String(id), String(row?.name || ''), opts.kind)
      },
      { immediate: true },
    )
  }

  function createExecuteDelete(resetForm: () => void) {
    return async () => {
      await base.executeDelete({
        deleted: (name: string) => `已删除「${name}」`,
        deleteFailed: '删除失败',
        onDeletedCurrent: resetForm,
      })
    }
  }

  function mountShell() {
    onMounted(() => {
      base.loadList()
      base.discoverHA()
      void loadBuiltinTemplates()
      if (opts.loadHomeModes) void loadHomeModes()
      opts.onMountedExtra?.()
    })
  }

  const phWizardBindings = {
    phWizardOpen: placeholderWizard.open,
    phWizardLoading: placeholderWizard.loading,
    phWizardSaving: placeholderWizard.saving,
    phWizardRows: placeholderWizard.rows,
    phWizardReplacements: placeholderWizard.replacements,
    closePlaceholderWizard: placeholderWizard.close,
    applyPlaceholderReplacements: placeholderWizard.applyReplacements,
  }

  const importFlowBindings = {
    pasteYamlOpen: importFlow.pasteYamlOpen,
    pasteYamlText: importFlow.pasteYamlText,
    importFlowImporting: importFlow.importing,
  }

  return {
    authStore,
    chrome,
    isAdmin,
    base,
    yamlValidation,
    importFlow,
    placeholderWizard,
    builtinTemplates,
    installingTpl,
    homeModes,
    loadBuiltinTemplates,
    loadHomeModes,
    installTemplate,
    setupInitialEdit,
    setupPlaceholderWizardWatch,
    createExecuteDelete,
    mountShell,
    phWizardBindings,
    importFlowBindings,
    phWizardName: computed(() => placeholderWizard.entityName),
    openPlaceholderWizard: (id: string, name = '') =>
      placeholderWizard.openFor(id, name, opts.kind),
  }
}
