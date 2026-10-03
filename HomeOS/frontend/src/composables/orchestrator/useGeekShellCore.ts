/**
 * geek 三域 shell（automation/scene/script）公共内核：
 * shell 构建 + 解构、pasteYamlName、loadItem/editItem、onImported、
 * 粘贴导入三件套、installTemplate、startNew 骨架、executeDelete 工厂与 base 展开。
 * 域差异（decompile/apply/save 等）以回调注入，调用方对外 API 保持不变。
 */
import { ref, type Ref } from 'vue'
import { useOrchestratorBuilderShell } from '@/composables/orchestrator/useOrchestratorBuilderShell'
import { fetchOrchestratorItem } from '@/services/api/orchestrator'
import { flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import type { OrchestratorSavedItem, SubmitPasteYamlOptions } from '@/types/orchestrator-builder'

/** createGeekShellCore：函数，按签名入参返回处理结果。 */
export function createGeekShellCore(opts: {
  kind: 'automation' | 'scene' | 'script'
  props: {
    embedded?: boolean
    initialEditId?: string | null
    openPlaceholderWizard?: boolean
  }
  editingId: Ref<string | null>
  runOnHa: Ref<boolean>
  formSignature: () => string
  resetGraph: () => void
  /** loadItem 拉到行后交由域处理（decompile + applyGraph） */
  applyFetchedRow: (row: Record<string, unknown>) => void
  /** 打开粘贴导入时预填名称（通常为 graph.name） */
  graphName: () => string
  /** 加载失败日志前缀（如 '场景' → '场景加载失败'） */
  loadFailLabel: string
  loadHomeModes?: boolean
  onMountedExtra?: () => void
}) {
  const pasteYamlName = ref('')

  const shell = useOrchestratorBuilderShell({
    kind: opts.kind,
    props: {
      embedded: opts.props.embedded,
      initialEditId: opts.props.initialEditId || '',
      openPlaceholderWizard: opts.props.openPlaceholderWizard,
    },
    loadHomeModes: opts.loadHomeModes,
    validateImportYaml: true,
    onImported: async (created) => {
      await shell.base.loadList()
      const row = created as { id?: string } | null
      if (row?.id) await loadItem(String(row.id))
    },
    onMountedExtra: opts.onMountedExtra,
  })

  const {
    isAdmin,
    base,
    yamlValidation,
    importFlow,
    builtinTemplates,
    installingTpl,
    installTemplate: shellInstallTemplate,
    phWizardBindings,
    importFlowBindings,
    phWizardName,
    openPlaceholderWizard,
  } = shell

  shell.mountShell()

  async function loadItem(id: string) {
    opts.resetGraph()
    opts.editingId.value = id
    base.editingId.value = id
    try {
      const resp = await fetchOrchestratorItem(opts.kind, String(id))
      opts.applyFetchedRow((resp.data || {}) as Record<string, unknown>)
      flashBuilderResult(base.resultMsg, base.resultOk, '已加载', true, base.dismissAfter, 2000)
    } catch (e) {
      logger.warn(`${opts.loadFailLabel}加载失败`, e)
      base.resultMsg.value = getApiErrorMessage(e, '加载失败')
      base.resultOk.value = false
    }
  }

  async function editItem(item: OrchestratorSavedItem | Record<string, unknown>) {
    if (!item?.id) return
    await loadItem(String(item.id))
  }

  shell.setupInitialEdit((item) => editItem(item as OrchestratorSavedItem))
  shell.setupPlaceholderWizardWatch()

  function openPasteYaml() {
    pasteYamlName.value = opts.graphName() || ''
    importFlow.pasteYamlText.value = ''
    importFlow.pasteYamlOpen.value = true
  }

  function closePasteYaml() {
    importFlow.pasteYamlOpen.value = false
  }

  /** 名称校验 + 委托 importFlow.submitPasteYaml（createFn/successHint 域注入） */
  async function submitPasteYaml(cfg: Pick<SubmitPasteYamlOptions, 'createFn' | 'successHint'>) {
    if (!pasteYamlName.value?.trim()) {
      shell.chrome.notify('请输入名称', 'warning')
      return
    }
    await importFlow.submitPasteYaml(cfg)
  }

  async function installTemplate(tpl: { id?: string; name?: string }) {
    await shellInstallTemplate(
      { id: String(tpl.id || ''), name: String(tpl.name || '') },
      (row) => editItem(row as OrchestratorSavedItem),
    )
  }

  /** 新建骨架：清编辑态/脏状态 + 域额外重置 + 提示文案 */
  function startNew(cfg: { label: string; resetExtra?: () => void }) {
    opts.resetGraph()
    base.editingId.value = null
    opts.editingId.value = null
    base.storedYaml.value = ''
    base.formSnapshot.value = opts.formSignature()
    base.runOnHa.value = false
    opts.runOnHa.value = false
    cfg.resetExtra?.()
    flashBuilderResult(base.resultMsg, base.resultOk, cfg.label, true, base.dismissAfter, 2000)
  }

  function createExecuteDelete(resetExtra?: () => void) {
    return shell.createExecuteDelete(() => {
      opts.resetGraph()
      opts.editingId.value = null
      resetExtra?.()
    })
  }

  /** 三域 shell return 中共同的 base 展开项 */
  function baseExpose() {
    return {
      saving: base.saving,
      runOnHa: base.runOnHa,
      editingId: base.editingId,
      storedYaml: base.storedYaml,
      savedList: base.savedList,
      haImportList: base.haImportList,
      showSidebar: base.showSidebar,
      showDeleteConfirm: base.showDeleteConfirm,
      deleteTarget: base.deleteTarget,
      deleteMode: base.deleteMode,
      deletingLocal: base.deletingLocal,
      deletingHaId: base.deletingHaId,
      resultMsg: base.resultMsg,
      resultOk: base.resultOk,
      driftCount: base.driftCount,
      loadList: base.loadList,
      discoverHA: base.discoverHA,
      doSync: base.doSync,
      doRepair: base.doRepair,
      doSyncAll: base.doSyncAll,
      doRepairAll: base.doRepairAll,
      doPullAll: base.doPullAll,
      confirmHaDelete: base.confirmHaDelete,
      confirmDelete: base.confirmDelete,
      closeDeleteConfirm: base.closeDeleteConfirm,
      syncing: base.syncing,
      syncStatusMap: base.syncStatusMap,
      repairProgress: base.repairProgress,
    }
  }

  return {
    shell,
    isAdmin,
    base,
    yamlValidation,
    importFlow,
    builtinTemplates,
    installingTpl,
    shellInstallTemplate,
    phWizardBindings,
    importFlowBindings,
    phWizardName,
    openPlaceholderWizard,
    pasteYamlName,
    loadItem,
    editItem,
    openPasteYaml,
    closePasteYaml,
    submitPasteYaml,
    installTemplate,
    startNew,
    createExecuteDelete,
    baseExpose,
  }
}
