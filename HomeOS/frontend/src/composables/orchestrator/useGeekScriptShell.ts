/**
 * @file useGeekScriptShell.ts
 * @module composables/orchestrator
 * @description 脚本 builder 壳：把画布动作序列 + 输入变量 + YAML 保存/导入等能力组合为对外可用的脚本编辑上下文。
 *
 * 职责：
 * - 复用 createGeekShellCore 提供的 list/discover/templates/导入/占位向导等基础能力；
 * - 维护脚本执行弹窗状态（showExecModal/execTarget/execFields/execVars/execRunning）；
 * - 编译/反编译 GeekGraph ↔ YAML（compileGeekScriptGraphToYaml / decompileScriptToGeekGraph）；
 * - 保存脚本时按 formTouched/approximate 决定保留原始 YAML 或使用新编译结果；
 * - 监听 haExecutionNeeds，需要 HA 执行时自动打开 runOnHa；
 * - 暴露 sbData（service data builder 面板）用于动作参数编辑。
 *
 * 依赖：
 * - vue（computed、watch、ref、Ref）
 * - @/composables/orchestrator（useGeekShellCore、useEngineCapabilities、useServiceDataPanel、useGeekShellDirtyPreview、useBuilderDeleteMessages、useBuilderUtils）
 * - @/services/api/orchestrator（createOrchestratorItem、executeScript、fetchOrchestratorItem）
 * - @/utils/geek-script（compileGeekScriptGraphToYaml、decompileScriptToGeekGraph）
 * - @/utils/orchestrator/script-crud.util、script-yaml-parser.util、script-yaml-import.util
 * - @homeos/shared（fingerprintScriptYaml、findReplaceableEntityIdsInYaml）
 */
import { computed, watch, ref, type Ref } from 'vue'
import { createGeekShellCore } from '@/composables/orchestrator/useGeekShellCore'
import { useEngineCapabilities } from '@/composables/orchestrator/useEngineCapabilities'
import { useServiceDataPanel } from '@/composables/orchestrator/useServiceDataPanel'
import {
  bindGeekShellDirtyPreview,
  resolveGeekSaveYaml,
} from '@/composables/orchestrator/useGeekShellDirtyPreview'
import {
  createOrchestratorItem,
  executeScript,
  fetchOrchestratorItem,
} from '@/services/api/orchestrator'
import { parseScriptYamlToForm } from '@/utils/orchestrator/script-yaml-parser.util'
import {
  formatHaExecutionMismatchMessage,
  getScriptHaExecutionMismatchReasons,
  scriptNeedsHaExecution,
  type EngineCapabilitiesHint,
} from '@/utils/orchestrator/automation-local-engine.util'
import { copyBuilderYaml, flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import { saveOrchestratorBuilderItem } from '@/utils/orchestrator/crud.util'
import {
  validateScriptForSave,
  buildScriptSavePayload,
  mapScriptExecutionHistory,
  scriptExecuteResultMessage,
  buildScriptExecVariables,
  initScriptExecVars,
} from '@/utils/orchestrator/script-crud.util'
import { compileGeekScriptGraphToYaml } from '@/utils/geek-script/compile'
import { decompileScriptToGeekGraph } from '@/utils/geek-script/decompile'
import { fingerprintScriptYaml } from '@homeos/shared'
import {
  analyzeScriptYamlImport,
  formatScriptImportHint,
  summarizeScriptBulkImport,
} from '@/utils/orchestrator/script-yaml-import.util'
import { createEmptyGeekGraph, type GeekGraph } from '@/utils/geek-automation/graph-types'
import { layoutCanvasFromGraph } from '@/utils/geek-automation/canvas.util'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { logger } from '@/utils/core/logger'
import { useBuilderDeleteMessages } from '@/composables/orchestrator/useBuilderDeleteMessages'
import { findReplaceableEntityIdsInYaml } from '@homeos/shared'
import { mergeGeekRestoreHint } from '@/utils/orchestrator/geek-restore-hint.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import type { OrchestratorSavedItem, ScriptFieldForm } from '@/types/orchestrator-builder'

/** 脚本反编译 / 加载结果：图、描述、字段表单、还原提示文案 */
type GeekScriptApplyResult = {
  graph: GeekGraph
  scriptDesc: string
  fields: ScriptFieldForm[]
  approximateHint: string
}

/**
 * 脚本 builder 壳 composable。
 *
 * @param opts.props 宿主组件 props（嵌入模式 / 初始编辑 ID / 占位向导开关）
 * @param opts.graph 当前 GeekGraph 实例（双向修改）
 * @param opts.scriptDesc 脚本描述 ref
 * @param opts.fields 脚本输入字段表单 ref
 * @param opts.editingId 当前编辑 ID ref
 * @param opts.runOnHa 是否走 HA 执行 ref（双向同步）
 * @param opts.formSignature 表单签名函数（脏状态比对）
 * @param opts.applyLoaded 加载完成回调（把图/描述/字段/提示回写到宿主）
 * @param opts.resetGraph 重置画布回调
 * @param opts.getCanvasError 画布错误检查（可选）
 * @param opts.commitCanvas 提交画布改动到 graph（可选，保存前调用）
 * @param opts.onSaved 保存成功回调
 * @returns 脚本壳对外暴露的状态与方法（详见末尾 return 块）
 */
export function useGeekScriptShell(opts: {
  props: {
    embedded?: boolean
    initialEditId?: string | null
    openPlaceholderWizard?: boolean
  }
  graph: GeekGraph
  scriptDesc: Ref<string>
  fields: Ref<ScriptFieldForm[]>
  editingId: Ref<string | null>
  runOnHa: Ref<boolean>
  formSignature: () => string
  applyLoaded: (result: GeekScriptApplyResult) => void
  resetGraph: () => void
  getCanvasError?: () => string | null
  commitCanvas?: () => void
  onSaved?: () => void
}) {
  const { engineCaps, loadEngineCaps } = useEngineCapabilities()
  const { panel: sbData, applyDataBuilder: applySbDataBuilder, syncFromData: syncSbFromData, resetPanel: resetSbData } =
    useServiceDataPanel('_showSbParams')

  const core = createGeekShellCore({
    kind: 'script',
    props: opts.props,
    editingId: opts.editingId,
    runOnHa: opts.runOnHa,
    formSignature: opts.formSignature,
    resetGraph: opts.resetGraph,
    applyFetchedRow,
    graphName: () => opts.graph.name,
    loadFailLabel: '脚本',
    onMountedExtra: () => {
      void loadEngineCaps()
    },
  })

  const {
    isAdmin,
    base,
    yamlValidation,
    importFlow,
    builtinTemplates,
    installingTpl,
    phWizardBindings,
    importFlowBindings,
    phWizardName,
    openPlaceholderWizard,
    pasteYamlName,
    loadItem,
    editItem,
    openPasteYaml,
    closePasteYaml,
    installTemplate,
    startNew: startNewCore,
    createExecuteDelete,
    baseExpose,
  } = core

  // 脚本执行弹窗状态：开关、目标项、字段表单、变量、运行中标志
  const showExecModal = ref(false)
  const execTarget = ref<OrchestratorSavedItem | null>(null)
  const execFields = ref<ScriptFieldForm[]>([])
  const execVars = ref<Record<string, unknown>>({})
  const execRunning = ref(false)

  // 还原提示文案（YAML 还原图时的损失提示）
  const approximateHint = ref('')

  // 脚本还原提示文案常量：陈旧 / 近似（含损失提示）/ 近似（朴素）
  const SCRIPT_RESTORE_HINT_TEXTS = {
    stale: 'YAML 已变更，已忽略陈旧图并从 YAML 还原；保存后将更新指纹。',
    approxWithHints: '由 YAML 还原为脚本图；部分语义可能不完整。未改画布时保存将保留原始 YAML',
    approxPlain: '由 YAML 粗还原为脚本图；复杂结构可能不完整。未改画布时保存将保留原始 YAML',
    hintsRequireRebuilt: true,
  }

  /** 合并 YAML 还原基础文案与细粒度损失提示 */
  function mergeRestoreHint(opts: {
    staleGraph?: boolean
    fromStoredGraph?: boolean
    approximate?: boolean
    importHints?: string[]
  }): string {
    return mergeGeekRestoreHint(opts, SCRIPT_RESTORE_HINT_TEXTS)
  }

  /** 编译当前画布 + 字段 + 描述 + sbData 为 YAML（保存与预览共用） */
  function buildGeneratedYaml() {
    return compileGeekScriptGraphToYaml(
      opts.graph,
      opts.fields.value,
      opts.scriptDesc.value,
      sbData,
    )
  }

  const { formTouched, yamlPreview } = bindGeekShellDirtyPreview({
    kind: 'script',
    base,
    formSignature: opts.formSignature,
    editingId: opts.editingId,
    runOnHa: opts.runOnHa,
    buildGeneratedYaml,
  })

  // HA 执行能力差异：基于当前 YAML 与本地引擎能力，列出需要走 HA 才能执行的原因
  const haExecutionReasons = computed(() =>
    getScriptHaExecutionMismatchReasons(yamlPreview.value, engineCaps.value),
  )
  const haExecutionNeeds = computed(() => haExecutionReasons.value.length > 0)
  // 监听差异：一旦需要 HA 执行，自动开启 runOnHa（base 与 opts 双向同步）
  watch(haExecutionNeeds, (needs) => {
    if (needs) {
      base.runOnHa.value = true
      opts.runOnHa.value = true
    }
  })

  /** 手动开启 HA 执行（base + opts 双向同步） */
  function enableHaExecution() {
    base.runOnHa.value = true
    opts.runOnHa.value = true
  }

  // 引擎能力分段：脚本只有「动作」分段，过滤空段
  const scriptEngineSections = computed(() => {
    const items = Array.isArray(engineCaps.value?.actions)
      ? (engineCaps.value!.actions as unknown[])
      : []
    return [{ label: '动作', items, variant: 'action' }].filter((s) => s.items.length > 0)
  })

  const { deleteLocalMessage, deleteHaMessage } = useBuilderDeleteMessages(
    base.deleteTarget as Ref<OrchestratorSavedItem | null>,
    '脚本',
  )

  /**
   * 应用反编译结果到画布：补齐空画布布局，合并还原提示，回写宿主，并把 YAML 与表单快照写入 base。
   *
   * @param result decompileScriptToGeekGraph 返回值
   * @param yaml 可选 YAML 文本（非空时写入 base.storedYaml）
   */
  function applyDecompiled(
    result: ReturnType<typeof decompileScriptToGeekGraph>,
    yaml?: string,
  ) {
    let next = createEmptyGeekGraph(result.graph)
    // 反编译后若画布无节点，自动布局补齐 flowNodes/flowEdges
    if (!next.flowNodes?.length) {
      const laid = layoutCanvasFromGraph(next)
      next = {
        ...next,
        flowNodes: laid.nodes as GeekGraph['flowNodes'],
        flowEdges: laid.edges as GeekGraph['flowEdges'],
      }
    }
    const hint = mergeRestoreHint({
      staleGraph: result.staleGraph,
      fromStoredGraph: result.fromStoredGraph,
      approximate: result.approximate,
      importHints: result.importHints,
    })
    approximateHint.value = hint
    opts.applyLoaded({
      graph: next,
      scriptDesc: result.scriptDesc,
      fields: result.fields,
      approximateHint: hint,
    })
    if (yaml != null) base.storedYaml.value = yaml
    base.formSnapshot.value = opts.formSignature()
  }

  /**
   * 加载已保存行：按 geekGraph + yaml + 引擎能力反编译，决定 runOnHa 后调用 applyDecompiled。
   * 由 createGeekShellCore 在编辑 / 列表加载时调用。
   *
   * @param row 已保存脚本行
   */
  function applyFetchedRow(row: Record<string, unknown>) {
    const caps = engineCaps.value as EngineCapabilitiesHint | null
    const result = decompileScriptToGeekGraph({
      geekGraph: row.geekGraph,
      yaml: row.yaml as string | undefined,
      name: row.name as string | undefined,
      engineCaps: caps,
    })
    // 分析 YAML 是否需要 HA 执行：是则强制 runOnHa，否则按行原值
    if (analyzeScriptYamlImport(String(row.yaml || ''), caps).needsHaExecution) {
      base.runOnHa.value = true
      opts.runOnHa.value = true
    } else {
      opts.runOnHa.value = !!row.runOnHa
      base.runOnHa.value = !!row.runOnHa
    }
    applyDecompiled(result, String(row.yaml || buildGeneratedYaml()))
  }

  /**
   * 载入草案 YAML（房间快捷规则草案 / 蓝图 / 复制粘贴）：反编译 + 还原提示 + 闪烁提示。
   *
   * @param yaml 草案 YAML 文本
   */
  function loadDraftYaml(yaml: string) {
    if (!yaml?.trim()) return
    const caps = engineCaps.value as EngineCapabilitiesHint | null
    const analysis = analyzeScriptYamlImport(yaml, caps)
    if (analysis.needsHaExecution || scriptNeedsHaExecution(yaml, caps)) {
      base.runOnHa.value = true
      opts.runOnHa.value = true
    }
    applyDecompiled(decompileScriptToGeekGraph({ yaml, engineCaps: caps }), yaml)
    flashBuilderResult(
      base.resultMsg,
      base.resultOk,
      '已载入脚本 YAML',
      true,
      base.dismissAfter,
      2500,
    )
  }

  /** 复制 YAML 到剪贴板，并显示成功 / 失败提示。 */
  function copyYaml() {
    copyBuilderYaml(yamlPreview.value, base.resultMsg, base.resultOk, {
      dismissAfter: base.dismissAfter,
    })
  }

  /** 新建脚本：重置画布、清空还原提示。 */
  function startNew() {
    startNewCore({
      label: '新建脚本',
      resetExtra: () => {
        approximateHint.value = ''
      },
    })
  }

  /**
   * 保存脚本：校验画布错误 → 编译 YAML → 按 formTouched/approximate 决定保留原始或新编译 →
   * 校验表单（至少一个非 note 动作）→ 检查 HA 执行差异 → 调用保存工具 → 成功后回写
   * editingId / 清提示 / 触发占位向导。
   *
   * 副作用：调用 base.saving/resultMsg/resultOk/storedYaml/formSnapshot/loadList。
   */
  async function saveScript() {
    opts.commitCanvas?.()
    const canvasErr = opts.getCanvasError?.()
    if (canvasErr) {
      base.resultMsg.value = canvasErr
      base.resultOk.value = false
      return
    }
    const generated = buildGeneratedYaml()
    const { yamlText, preservedStored } = resolveGeekSaveYaml({
      storedYaml: base.storedYaml.value,
      formTouched: formTouched.value,
      generated,
      approximate: approximateHint.value,
      fingerprint: fingerprintScriptYaml,
      graph: opts.graph,
    })
    const payloadGraph = clonePlain(opts.graph) as unknown as Record<string, unknown>
    delete payloadGraph._canvasLocal
    const name = opts.graph.name || '脚本'
    await saveOrchestratorBuilderItem({
      kind: 'script',
      editingId: base.editingId,
      saving: base.saving,
      resultMsg: base.resultMsg,
      resultOk: base.resultOk,
      storedYaml: base.storedYaml,
      formSnapshot: base.formSnapshot,
      isAdmin: isAdmin.value,
      yamlText,
      payload: buildScriptSavePayload(name, yamlText, base.runOnHa.value, payloadGraph),
      validateForm: () => {
        const executable = (opts.graph.actions || []).filter(
          (a) => a && String(a.type || '') !== 'note',
        ).length
        return validateScriptForSave(executable, yamlText)
      },
      checkHaExecution: () =>
        scriptNeedsHaExecution(yamlText, engineCaps.value) && !base.runOnHa.value
          ? formatHaExecutionMismatchMessage(haExecutionReasons.value, { kind: 'script' })
          : null,
      validateYaml: (yaml) => yamlValidation.validate(yaml),
      formSignature: opts.formSignature,
      loadList: base.loadList,
      dismissAfter: base.dismissAfter,
      onSaved: () => {
        opts.editingId.value = base.editingId.value
        opts.onSaved?.()
        approximateHint.value = ''
        if (preservedStored) {
          base.resultMsg.value = '已保存图并保留原始 YAML（未改画布）'
          base.resultOk.value = true
        }
        const placeholders = findReplaceableEntityIdsInYaml(yamlText)
        if (placeholders.length && base.editingId.value) {
          void openPlaceholderWizard(String(base.editingId.value), name)
        }
      },
    })
  }

  /** 删除当前项包装：清空还原提示后委托 createExecuteDelete。 */
  const executeDelete = createExecuteDelete(() => {
    approximateHint.value = ''
  })

  /**
   * 提交粘贴 YAML：反编译为 GeekGraph → 计算 yamlDigest → 调用 createOrchestratorItem
   * 创建实体。需要 HA 执行时同步设置 runOnHa。
   *
   * 副作用：通过 core.submitPasteYaml 走 importFlow（弹窗开关 / 通知 / onImported）。
   */
  async function submitPasteYaml() {
    await core.submitPasteYaml({
      createFn: async (yaml: string) => {
        const caps = engineCaps.value as EngineCapabilitiesHint | null
        const analysis = analyzeScriptYamlImport(yaml, caps)
        const needsHa = analysis.needsHaExecution || scriptNeedsHaExecution(yaml, caps)
        if (needsHa) {
          base.runOnHa.value = true
          opts.runOnHa.value = true
        }
        const name = pasteYamlName.value.trim()
        const { graph } = decompileScriptToGeekGraph({ yaml, name })
        const geekGraph = {
          ...graph,
          yamlDigest: fingerprintScriptYaml(yaml),
        }
        const { data } = await createOrchestratorItem('script', {
          name,
          yaml,
          geekGraph,
          ...(needsHa ? { runOnHa: true } : {}),
        })
        return data
      },
      successHint: (yaml) =>
        formatScriptImportHint(yaml, engineCaps.value as EngineCapabilitiesHint | null),
    })
  }

  /**
   * 批量导入发现的 HA 脚本：过滤 ha_config_id 行 → 逐项 importFromHa → 重载列表 + 发现
   * → 按已导入项汇总通知（汇总为空则提示未成功导入）。
   */
  async function bulkImportDiscovered() {
    const rows = base.haImportList.value.filter((i) => i.ha_config_id)
    const importedHaIds: string[] = []
    await importFlow.doImport({
      fetchFn: async () => rows,
      onEach: async (item) => {
        const row = item as Record<string, unknown>
        const haConfigId = row.ha_config_id || row.entity_id
        if (!haConfigId) return
        const r = await base.importFromHa(String(haConfigId))
        if (r.ok) importedHaIds.push(String(haConfigId))
      },
      successNotify: () => null,
    })
    await base.loadList()
    await base.discoverHA(true)
    if (!importedHaIds.length) {
      core.shell.chrome.notify('未成功导入任何脚本', 'warning')
      return
    }
    // 汇总导入项的提示（如需要 HA 执行 / 占位补全等）
    const importedItems = base.savedList.value.filter((item) => {
      const hid = String(item.haConfigId || item.ha_config_id || '')
      return hid && importedHaIds.includes(hid)
    })
    if (importedItems.length) {
      const summary = summarizeScriptBulkImport(importedItems, engineCaps.value, '脚本')
      core.shell.chrome.notify(summary.message, summary.notifyType)
    }
  }

  /**
   * 导入单个 HA 项：withSyncFeedback 包裹 importFromHa，重载列表 + 重新发现，
   * 然后按 YAML 损失提示发出已导入通知。
   *
   * @param item 待导入的 HA 行（ha_config_id / entity_id）
   */
  async function doImport(item: Record<string, unknown>) {
    const haConfigId = item.ha_config_id || item.entity_id
    if (!haConfigId) return
    const hid = String(haConfigId)
    await base.withSyncFeedback(() => base.importFromHa(hid), {
      reload: base.loadList,
      after: async () => {
        await base.discoverHA(true)
        const row = base.savedList.value.find(
          (i) => String(i.haConfigId || i.ha_config_id || '') === hid,
        )
        const hint = formatScriptImportHint(String(row?.yaml || ''), engineCaps.value)
        if (hint) core.shell.chrome.notify(`已导入：${hint}`, 'warning')
      },
    })
  }

  /**
   * 打开执行弹窗：拉取脚本详情 → 解析 YAML 取字段表单 → 初始化执行变量 → 显示弹窗。
   * 拉取 / 解析失败时静默降级（无字段）。
   *
   * @param item 待执行的已保存项
   */
  async function promptExecute(item: OrchestratorSavedItem | Record<string, unknown>) {
    if (!item?.id) return
    execTarget.value = item as OrchestratorSavedItem
    execFields.value = []
    execVars.value = {}
    try {
      const { data } = await fetchOrchestratorItem('script', String(item.id))
      const form = parseScriptYamlToForm(data.yaml || '')
      execFields.value = (form.fields || []).filter((f) => f.name)
      execVars.value = initScriptExecVars(execFields.value)
    } catch (e) {
      logger.debug('脚本执行字段加载已跳过', e)
    }
    showExecModal.value = true
  }

  /**
   * 确认执行脚本：组装变量 → executeScript → 显示执行结果消息（成功 / 部分成功 / 失败）→ 关弹窗。
   *
   * @throws 异常被捕获并写入 resultMsg / resultOk=false。
   */
  async function confirmExecute() {
    if (!execTarget.value?.id) return
    execRunning.value = true
    const vars = buildScriptExecVariables(execFields.value, execVars.value)
    try {
      const res = await executeScript(String(execTarget.value.id), {
        variables: Object.keys(vars).length ? vars : undefined,
      })
      const result = scriptExecuteResultMessage(
        res.data?.success !== false,
        res.data?.executed,
        res.data?.total,
      )
      base.resultMsg.value = result.message
      base.resultOk.value = result.ok
      showExecModal.value = false
    } catch (e) {
      base.resultMsg.value = getApiErrorMessage(e, '执行失败')
      base.resultOk.value = false
    } finally {
      execRunning.value = false
      base.dismissAfter(2500)
    }
  }

  return {
    isAdmin,
    base,
    yamlValidation,
    importFlow,
    engineCaps,
    builtinTemplates,
    installingTpl,
    approximateHint,
    yamlPreview,
    formTouched,
    haExecutionReasons,
    haExecutionNeeds,
    enableHaExecution,
    scriptEngineSections,
    deleteLocalMessage,
    deleteHaMessage,
    mapScriptHistory: mapScriptExecutionHistory,
    sbData,
    applySbDataBuilder,
    syncSbFromData,
    resetSbData,
    loadDraftYaml,
    copyYaml,
    startNew,
    loadItem,
    editItem,
    saveScript,
    executeDelete,
    pasteYamlName,
    openPasteYaml,
    closePasteYaml,
    submitPasteYaml,
    bulkImportDiscovered,
    installTemplate,
    doImport,
    promptExecute,
    confirmExecute,
    showExecModal,
    execTarget,
    execFields,
    execVars,
    execRunning,
    ...importFlowBindings,
    ...phWizardBindings,
    phWizardName,
    ...baseExpose(),
  }
}
