/**
 * @file useGeekAutomationShell.ts
 * @module composables/orchestrator
 * @description 自动化 builder 壳：复用 classic base / HA sync / 导入 / 校验 / 脏状态 / 引擎能力，
 * 为自动化编辑提供完整上下文（保存 / 触发 / 切换 / 蓝图 / 模板 / 简单向导）。
 *
 * 职责：
 * - 复用 createGeekShellCore 提供的 list / discover / templates / 导入 / 占位向导能力；
 * - 监听 haExecutionNeeds 自动开启 runOnHa；
 * - 复用 bindGeekShellDirtyPreview 维护脏状态与 YAML 预览；
 * - 反编译 / 编译 GeekGraph ↔ YAML，并合并还原提示文案；
 * - 提供蓝图（fetchAutomationBlueprints）加载与安装；
 * - 提供简单向导开关（showSimpleWizard）与 onSimpleWizardApplied 草案回填；
 * - 提供启用切换（toggleItem / toggleCurrent）与触发（triggerItem）。
 *
 * 依赖：
 * - vue（computed、watch、onMounted、ref、Ref）
 * - @/composables/orchestrator（useGeekShellCore、useEngineCapabilities、useGeekShellDirtyPreview、useBuilderDeleteMessages、useBuilderUtils）
 * - @/services/api/orchestrator（fetchAutomationBlueprints、fetchAutomationBlueprintDraft、createOrchestratorItem、toggleAutomation、triggerOrchestratorItem）
 * - @/utils/geek-automation（decompileToGeekGraph、compileGeekGraphToYaml、layoutCanvasFromGraph、graph-types）
 * - @/utils/orchestrator/automation-* util（yaml-import / trigger-yaml / crud）
 * - @homeos/shared（fingerprintAutomationYaml、findReplaceableEntityIdsInYaml）
 */
import { computed, watch, onMounted, ref, type Ref } from 'vue'
import { createGeekShellCore } from '@/composables/orchestrator/useGeekShellCore'
import { useEngineCapabilities } from '@/composables/orchestrator/useEngineCapabilities'
import {
  bindGeekShellDirtyPreview,
  resolveGeekSaveYaml,
} from '@/composables/orchestrator/useGeekShellDirtyPreview'
import { consumeAutomationDraftYaml } from '@/utils/orchestrator/room-automation-draft.util'
import {
  fetchAutomationBlueprints,
  fetchAutomationBlueprintDraft,
  createOrchestratorItem,
  toggleAutomation,
  triggerOrchestratorItem,
} from '@/services/api/orchestrator'
import {
  getHaExecutionMismatchReasons,
  yamlNeedsHaExecution,
  formatHaExecutionMismatchMessage,
  type EngineCapabilitiesHint,
} from '@/utils/orchestrator/automation-local-engine.util'
import { copyBuilderYaml, flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import { saveOrchestratorBuilderItem } from '@/utils/orchestrator/crud.util'
import {
  automationTriggerResultMessage,
  mapAutomationExecutionHistory,
} from '@/utils/orchestrator/automation-crud.util'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { decompileToGeekGraph } from '@/utils/geek-automation/decompile'
import { compileGeekGraphToYaml } from '@/utils/geek-automation/compile'
import type { GeekGraph } from '@/utils/geek-automation/graph-types'
import { createEmptyGeekGraph } from '@/utils/geek-automation/graph-types'
import { layoutCanvasFromGraph } from '@/utils/geek-automation/canvas.util'
import { fingerprintAutomationYaml } from '@homeos/shared'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { validateTriggerGroupsForCompile } from '@/utils/orchestrator/automation-trigger-yaml.util'
import { formatAutomationImportHint, analyzeAutomationYamlImport, summarizeAutomationBulkImport } from '@/utils/orchestrator/automation-yaml-import.util'
import { findReplaceableEntityIdsInYaml } from '@homeos/shared'
import { mergeGeekRestoreHint } from '@/utils/orchestrator/geek-restore-hint.util'
import { useBuilderDeleteMessages } from '@/composables/orchestrator/useBuilderDeleteMessages'
import type { OrchestratorSavedItem } from '@/types/orchestrator-builder'

/** 自动化反编译 / 加载结果：图、还原提示、启用状态 */
type GeekShellApplyResult = {
  graph: GeekGraph
  approximateHint: string
  enabled: boolean
}

/**
 * 自动化 builder 壳 composable。
 *
 * @param opts.props 宿主组件 props（嵌入模式 / 初始编辑 ID / 占位向导开关）
 * @param opts.graph 当前 GeekGraph 实例（双向修改）
 * @param opts.editingId 当前编辑 ID ref
 * @param opts.enabled 启用状态 ref（双向同步）
 * @param opts.runOnHa 是否走 HA 执行 ref（双向同步）
 * @param opts.formSignature 表单签名函数（脏状态比对）
 * @param opts.applyGraph 加载完成回调（把图 / 提示 / 启用回写宿主）
 * @param opts.resetGraph 重置画布回调
 * @param opts.getCanvasError 画布错误检查（可选）
 * @param opts.commitCanvas 提交画布改动到 graph（可选，保存前调用）
 * @param opts.onSaved 保存成功回调
 * @param opts.openPlaceholderWizard 占位向导打开函数（可选）
 * @returns 自动化壳对外暴露的状态与方法（详见末尾 return 块）
 */
export function useGeekAutomationShell(opts: {
  props: {
    embedded?: boolean
    initialEditId?: string | null
    openPlaceholderWizard?: boolean
  }
  graph: GeekGraph
  editingId: Ref<string | null>
  enabled: Ref<boolean>
  runOnHa: Ref<boolean>
  formSignature: () => string
  applyGraph: (result: GeekShellApplyResult) => void
  resetGraph: () => void
  getCanvasError?: () => string | null
  commitCanvas?: () => void
  onSaved?: () => void
  openPlaceholderWizard?: (id: string, name: string) => void | Promise<void>
}) {
  const { engineCaps, loadEngineCaps } = useEngineCapabilities()

  const core = createGeekShellCore({
    kind: 'automation',
    props: opts.props,
    editingId: opts.editingId,
    runOnHa: opts.runOnHa,
    formSignature: opts.formSignature,
    resetGraph: opts.resetGraph,
    applyFetchedRow,
    graphName: () => opts.graph.name,
    loadFailLabel: '自动化',
    loadHomeModes: true,
    onMountedExtra: () => {
      void loadEngineCaps()
      void loadBlueprints()
      const draft = consumeAutomationDraftYaml()
      if (draft) {
        loadDraftYaml(draft)
        flashBuilderResult(
          core.shell.base.resultMsg,
          core.shell.base.resultOk,
          '已载入房间快捷规则草案',
          true,
          core.shell.base.dismissAfter,
          3000,
        )
      }
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

  const { homeModes } = core.shell

  // 简单向导开关、HA 蓝图列表、安装中蓝图文件名、还原提示文案
  const showSimpleWizard = ref(false)
  const blueprints = ref<{ filename: string; name?: string; _groupId?: string }[]>([])
  const installingBp = ref('')
  const approximateHint = ref('')

  // 自动化还原提示文案常量：陈旧 / 近似（含损失提示）/ 近似（朴素）
  const AUTOMATION_RESTORE_HINT_TEXTS = {
    stale: 'YAML 已变更，已忽略陈旧图并从 YAML 还原；保存后将更新指纹。',
    approxWithHints: '由 YAML 还原，部分语义可能不完整；未改画布时保存将保留原始 YAML',
    approxPlain: '由 YAML 粗还原，复杂模板可能不完整；未改画布时保存将保留原始 YAML',
    hintsRequireRebuilt: true,
  }

  /** 合并 YAML 还原基础文案与细粒度损失提示 */
  function mergeRestoreHint(opts: {
    staleGraph?: boolean
    fromStoredGraph: boolean
    approximate: boolean
    importHints?: string[]
  }): string {
    return mergeGeekRestoreHint(opts, AUTOMATION_RESTORE_HINT_TEXTS)
  }

  // 脏状态与 YAML 预览：表单签名比对 + 当前图编译生成
  const { formTouched, yamlPreview } = bindGeekShellDirtyPreview({
    kind: 'automation',
    base,
    formSignature: opts.formSignature,
    editingId: opts.editingId,
    runOnHa: opts.runOnHa,
    buildGeneratedYaml: () => compileGeekGraphToYaml(opts.graph, opts.editingId.value),
  })

  // HA 执行能力差异：基于当前 YAML 与本地引擎能力，列出需要走 HA 才能执行的原因
  const haExecutionReasons = computed(() =>
    getHaExecutionMismatchReasons(
      yamlPreview.value,
      engineCaps.value as EngineCapabilitiesHint | null,
    ),
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

  // 引擎能力分段：触发 / 条件 / 动作，过滤空段
  const automationEngineSections = computed(() => {
    const caps = engineCaps.value as EngineCapabilitiesHint | null
    if (!caps) return []
    return [
      { label: '触发', items: caps.triggers ?? [], variant: 'trigger' },
      { label: '条件', items: caps.conditions ?? [], variant: 'condition' },
      { label: '动作', items: caps.actions ?? [], variant: 'action' },
    ].filter((s) => s.items.length > 0)
  })

  // 简单向导权限：仅 admin / adult 角色可用
  const canUseSimpleWizard = computed(() =>
    ['admin', 'adult'].includes(String(core.shell.authStore.role || '')),
  )

  const { deleteLocalMessage, deleteHaMessage } = useBuilderDeleteMessages(
    base.deleteTarget as Ref<OrchestratorSavedItem | null>,
    '自动化',
  )

  /**
   * 加载已保存行：分析 YAML 是否需要 HA 执行，反编译 GeekGraph → 补齐画布布局 →
   * 合并还原提示 → 回写宿主 + 写入 storedYaml / formSnapshot。
   *
   * @param row 已保存自动化行
   */
  function applyFetchedRow(row: Record<string, unknown>) {
    const caps = engineCaps.value as EngineCapabilitiesHint | null
    const yaml = String(row.yaml || '')
    const analysis = yaml ? analyzeAutomationYamlImport(yaml, caps) : null
    if (analysis?.needsHaExecution || (yaml && yamlNeedsHaExecution(yaml, caps))) {
      base.runOnHa.value = true
      opts.runOnHa.value = true
    } else {
      opts.runOnHa.value = !!row.runOnHa
      base.runOnHa.value = !!row.runOnHa
    }
    const { graph: g, approximate, fromStoredGraph, staleGraph, importHints } = decompileToGeekGraph({
      geekGraph: row.geekGraph,
      yaml: row.yaml as string | undefined,
      name: row.name as string | undefined,
      engineCaps: caps,
    })
    let next = createEmptyGeekGraph(g)
    if (!next.flowNodes?.length) {
      const laid = layoutCanvasFromGraph(next)
      next = {
        ...next,
        flowNodes: laid.nodes as GeekGraph['flowNodes'],
        flowEdges: laid.edges as GeekGraph['flowEdges'],
      }
    }
    const hint = mergeRestoreHint({
      staleGraph,
      fromStoredGraph,
      approximate,
      importHints: analysis?.hints?.length ? analysis.hints : importHints,
    })
    approximateHint.value = hint
    opts.enabled.value = row.enabled !== false
    opts.applyGraph({
      graph: next,
      approximateHint: hint,
      enabled: row.enabled !== false,
    })
    base.storedYaml.value = String(row.yaml || compileGeekGraphToYaml(next, opts.editingId.value))
    base.formSnapshot.value = opts.formSignature()
  }

  /**
   * 载入草案 YAML（房间快捷规则 / 蓝图 / 复制粘贴）：反编译 + 补齐布局 + 还原提示
   * + 闪烁提示。需要 HA 执行时同步开启 runOnHa。
   *
   * @param yaml 草案 YAML 文本
   * @param name 可选名称
   */
  function loadDraftYaml(yaml: string, name?: string) {
    if (!yaml?.trim()) return
    const caps = engineCaps.value as EngineCapabilitiesHint | null
    const analysis = analyzeAutomationYamlImport(yaml, caps)
    if (analysis.needsHaExecution || yamlNeedsHaExecution(yaml, caps)) {
      base.runOnHa.value = true
      opts.runOnHa.value = true
    }
    const { graph: g, approximate, fromStoredGraph, staleGraph, importHints } = decompileToGeekGraph({
      yaml,
      name,
      engineCaps: caps,
    })
    let next = createEmptyGeekGraph(g)
    if (!next.flowNodes?.length) {
      const laid = layoutCanvasFromGraph(next)
      next = {
        ...next,
        flowNodes: laid.nodes as GeekGraph['flowNodes'],
        flowEdges: laid.edges as GeekGraph['flowEdges'],
      }
    }
    const hint = mergeRestoreHint({
      staleGraph,
      fromStoredGraph,
      approximate,
      importHints: analysis.hints.length ? analysis.hints : importHints,
    })
    approximateHint.value = hint
    opts.applyGraph({ graph: next, approximateHint: hint, enabled: opts.enabled.value })
    base.storedYaml.value = yaml
    base.formSnapshot.value = opts.formSignature()
    flashBuilderResult(
      base.resultMsg,
      base.resultOk,
      '已载入自动化草案',
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

  /** 新建自动化：重置画布、恢复启用、清空还原提示。 */
  function startNew() {
    startNewCore({
      label: '新建自动化',
      resetExtra: () => {
        opts.enabled.value = true
        approximateHint.value = ''
      },
    })
  }

  /**
   * 统计触发器数量：优先 triggerGroups 内 triggers 之和，无分组时回退到顶层 triggers 长度。
   *
   * @returns 当前图中所有触发器总数
   */
  function flatTriggerCount() {
    const g = opts.graph as GeekGraph & {
      triggerGroups?: Array<{ triggers?: unknown[] }>
    }
    if (Array.isArray(g.triggerGroups) && g.triggerGroups.length) {
      return g.triggerGroups.reduce((s, grp) => s + (grp.triggers?.length || 0), 0)
    }
    return g.triggers?.length || 0
  }

  /**
   * 保存自动化：校验画布错误 → 编译 YAML → 按 formTouched/approximate 决定保留原始或新编译 →
   * 校验表单（至少一个触发与一个非 note 动作，并连线）→ 检查 HA 执行差异 → 调用保存工具
   * → 成功后回写 editingId / 清提示 / 触发占位向导。
   *
   * 副作用：调用 base.saving/resultMsg/resultOk/storedYaml/formSnapshot/loadList。
   */
  async function saveAutomation() {
    opts.commitCanvas?.()
    const canvasErr = opts.getCanvasError?.()
    if (canvasErr) {
      base.resultMsg.value = canvasErr
      base.resultOk.value = false
      return
    }
    const generated = compileGeekGraphToYaml(opts.graph, opts.editingId.value)
    const { yamlText, preservedStored } = resolveGeekSaveYaml({
      storedYaml: base.storedYaml.value,
      formTouched: formTouched.value,
      generated,
      approximate: approximateHint.value,
      fingerprint: fingerprintAutomationYaml,
      graph: opts.graph,
    })
    const payloadGraph = clonePlain(opts.graph) as unknown as Record<string, unknown>
    delete payloadGraph._canvasLocal
    const name = opts.graph.name || '自动化'
    await saveOrchestratorBuilderItem({
      kind: 'automation',
      editingId: base.editingId,
      saving: base.saving,
      resultMsg: base.resultMsg,
      resultOk: base.resultOk,
      storedYaml: base.storedYaml,
      formSnapshot: base.formSnapshot,
      isAdmin: isAdmin.value,
      yamlText,
      payload: {
        name,
        yaml: yamlText,
        runOnHa: base.runOnHa.value,
        enabled: !!opts.enabled.value,
        geekGraph: payloadGraph,
      } as unknown as Record<string, string | boolean>,
      validateForm: () => {
        const tc = flatTriggerCount()
        const ac = (opts.graph.actions || []).filter(
          (a) => a && String(a.type || '') !== 'note',
        ).length
        if (tc === 0 || ac === 0) return '请至少添加一个触发与一个动作，并连线'
        return validateTriggerGroupsForCompile(
          String(opts.graph.triggerLogic || 'or'),
          opts.graph.triggerGroups || [],
        )
      },
      checkHaExecution: () =>
        yamlNeedsHaExecution(yamlText, engineCaps.value as EngineCapabilitiesHint | null) &&
        !base.runOnHa.value
          ? formatHaExecutionMismatchMessage(haExecutionReasons.value, { kind: 'automation' })
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
          void (opts.openPlaceholderWizard || openPlaceholderWizard)(
            String(base.editingId.value),
            name,
          )
        }
      },
    })
  }

  /**
   * 切换指定项的启用状态：调用 toggleAutomation 后重载列表，若是当前编辑项则同步 opts.enabled。
   *
   * @param item 待切换的已保存项
   */
  async function toggleItem(item: OrchestratorSavedItem | Record<string, unknown>) {
    try {
      await toggleAutomation(String(item.id))
      await base.loadList()
      // 当前编辑项同步启用状态
      if (String(opts.editingId.value) === String(item.id)) {
        const row = base.savedList.value.find((i) => String(i.id) === String(item.id))
        if (row) opts.enabled.value = row.enabled !== false
        else opts.enabled.value = !opts.enabled.value
      }
    } catch (e) {
      logger.warn('自动化切换失败', e)
      base.resultMsg.value = getApiErrorMessage(e, '切换失败')
      base.resultOk.value = false
    }
  }

  /**
   * 切换当前编辑项：未编辑则只翻转 opts.enabled；否则按列表项调用 toggleItem。
   */
  async function toggleCurrent() {
    if (!opts.editingId.value) {
      opts.enabled.value = !opts.enabled.value
      return
    }
    const row = base.savedList.value.find((i) => String(i.id) === String(opts.editingId.value))
    await toggleItem((row || { id: opts.editingId.value }) as OrchestratorSavedItem)
  }

  /**
   * 手动触发自动化：调用 triggerOrchestratorItem，显示触发结果消息。
   *
   * @param item 待触发的已保存项
   */
  async function triggerItem(item: OrchestratorSavedItem | Record<string, unknown>) {
    try {
      const res = await triggerOrchestratorItem('automation', String(item.id))
      const result = automationTriggerResultMessage(res.data)
      base.resultMsg.value = result.message
      base.resultOk.value = result.ok
      base.dismissAfter(2000)
    } catch (e) {
      logger.warn('自动化触发失败', e)
      base.resultMsg.value = getApiErrorMessage(e, '触发失败')
      base.resultOk.value = false
    }
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
        const analysis = analyzeAutomationYamlImport(yaml, caps)
        const needsHa =
          analysis.needsHaExecution || yamlNeedsHaExecution(yaml, caps)
        if (needsHa) {
          base.runOnHa.value = true
          opts.runOnHa.value = true
        }
        const { data } = await createOrchestratorItem('automation', {
          name: pasteYamlName.value.trim(),
          yaml,
          geekGraph: (() => {
            const { graph } = decompileToGeekGraph({ yaml, name: pasteYamlName.value.trim() })
            return { ...graph, yamlDigest: fingerprintAutomationYaml(yaml) }
          })(),
          ...(needsHa ? { runOnHa: true } : {}),
        })
        return data
      },
      successHint: (yaml) =>
        formatAutomationImportHint(yaml, engineCaps.value as EngineCapabilitiesHint | null),
    })
  }

  /**
   * 批量导入发现的 HA 自动化：过滤 ha_config_id 行 → 逐项 importFromHa → 重载列表 + 发现
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
    const caps = engineCaps.value as EngineCapabilitiesHint | null
    // 汇总导入项的提示（如需要 HA 执行 / 占位补全等）
    const importedItems = base.savedList.value.filter((item) => {
      const hid = String(item.haConfigId || item.ha_config_id || '')
      return hid && importedHaIds.includes(hid)
    })
    const summary = summarizeAutomationBulkImport(importedItems, caps, '自动化')
    if (!importedHaIds.length) {
      core.shell.chrome.notify('未成功导入任何自动化', 'warning')
      return
    }
    core.shell.chrome.notify(summary.message, summary.notifyType)
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
        const hint = formatAutomationImportHint(
          String(row?.yaml || ''),
          engineCaps.value as EngineCapabilitiesHint | null,
        )
        if (hint) core.shell.chrome.notify(`已导入：${hint}`, 'warning')
      },
    })
  }

  /**
   * 拉取 HA 蓝图列表：仅 admin 可用，失败时降级为空数组。
   */
  async function loadBlueprints() {
    if (!isAdmin.value) return
    try {
      const { data } = await fetchAutomationBlueprints()
      blueprints.value = Array.isArray(data) ? data : []
    } catch {
      blueprints.value = []
    }
  }

  /**
   * 安装 HA 蓝图：拉取蓝图草稿 YAML → loadDraftYaml 载入画布 → 回写 graph.name。
   * 失败时显示错误提示。
   *
   * @param bp 蓝图对象（filename 必填）
   */
  async function installBlueprint(bp: { filename: string; name?: string }) {
    const filename = String(bp?.filename || '').trim()
    if (!filename) {
      flashBuilderResult(base.resultMsg, base.resultOk, '蓝图无效：缺少文件名', false, base.dismissAfter, 2500)
      return
    }
    installingBp.value = filename
    try {
      const { data } = await fetchAutomationBlueprintDraft(filename)
      if (!data?.yaml) {
        flashBuilderResult(base.resultMsg, base.resultOk, '蓝图草稿为空', false, base.dismissAfter, 2500)
        return
      }
      loadDraftYaml(data.yaml, data?.name)
      if (data?.name) opts.graph.name = data.name
    } catch (e) {
      flashBuilderResult(
        base.resultMsg,
        base.resultOk,
        getApiErrorMessage(e, '导入 HA 蓝图失败'),
        false,
        base.dismissAfter,
        2500,
      )
    } finally {
      installingBp.value = ''
    }
  }

  /** 简单向导应用后：消费草案 YAML 并加载到画布。 */
  function onSimpleWizardApplied() {
    const draft = consumeAutomationDraftYaml()
    if (draft) loadDraftYaml(draft)
  }

  /** 打开简单向导弹窗。 */
  function openSimpleWizard() {
    showSimpleWizard.value = true
  }

  /** 关闭简单向导弹窗。 */
  function closeSimpleWizard() {
    showSimpleWizard.value = false
  }

  // 模板分组：HA 蓝图（仅 admin 且有数据时）+ 全屋模板
  const automationTemplateGroups = computed(() => {
    const groups: Array<{
      id: string
      label: string
      templates: unknown[]
      actionLabel: string
    }> = []
    if (isAdmin.value && blueprints.value.length) {
      groups.push({
        id: 'blueprint',
        label: 'HA 蓝图',
        templates: blueprints.value,
        actionLabel: '导入',
      })
    }
    if (builtinTemplates.value?.length) {
      groups.push({
        id: 'builtin',
        label: '全屋模板',
        templates: builtinTemplates.value as unknown[],
        actionLabel: '安装',
      })
    }
    return groups
  })

  /**
   * 模板安装分发：blueprint 分组 → installBlueprint；其它 → installTemplate。
   *
   * @param tpl 模板项（带 _groupId 标识分组）
   */
  function onAutomationTemplateInstall(tpl: {
    _groupId?: string
    _raw?: { filename?: string; id?: string; name?: string }
    filename?: string
    id?: string
    name?: string
  }) {
    if (tpl._groupId === 'blueprint') {
      void installBlueprint((tpl._raw || tpl) as { filename: string; name?: string })
    } else {
      void installTemplate((tpl._raw || tpl) as { id?: string; name?: string })
    }
  }

  // onMounted 占位：list/discover/templates 已由 mountShell 注册
  onMounted(() => {
    /* mountShell 已为 list/discover/templates 注册 onMounted */
  })

  return {
    isAdmin,
    base,
    yamlValidation,
    importFlow,
    engineCaps,
    builtinTemplates,
    installingTpl,
    homeModes,
    blueprints,
    installingBp,
    pasteYamlName,
    showSimpleWizard,
    canUseSimpleWizard,
    openSimpleWizard,
    closeSimpleWizard,
    approximateHint,
    yamlPreview,
    formTouched,
    haExecutionReasons,
    haExecutionNeeds,
    enableHaExecution,
    automationEngineSections,
    automationTemplateGroups,
    deleteLocalMessage,
    deleteHaMessage,
    mapAutoHistory: mapAutomationExecutionHistory,
    loadDraftYaml,
    copyYaml,
    startNew,
    loadItem,
    editItem,
    saveAutomation,
    toggleItem,
    toggleCurrent,
    triggerItem,
    executeDelete,
    openPasteYaml,
    closePasteYaml,
    submitPasteYaml,
    bulkImportDiscovered,
    installTemplate,
    installBlueprint,
    onAutomationTemplateInstall,
    onSimpleWizardApplied,
    openPlaceholderWizard,
    ...importFlowBindings,
    ...phWizardBindings,
    phWizardName,
    doImport,
    ...baseExpose(),
  }
}
