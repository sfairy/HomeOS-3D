/**
 * 场景壳：星形画布 + 实体保存/HA 导入。
 */
import { computed, watch, ref, type Ref } from 'vue'
import { createGeekShellCore } from '@/composables/orchestrator/useGeekShellCore'
import {
  bindGeekShellDirtyPreview,
  resolveGeekSaveYaml,
} from '@/composables/orchestrator/useGeekShellDirtyPreview'
import {
  createOrchestratorItem,
  executeScene as executeSceneApi,
  cancelScene as cancelSceneApi,
} from '@/services/api/orchestrator'
import { parseSceneYamlIntoForm } from '@/utils/orchestrator/scene-yaml-form.util'
import { copyBuilderYaml, flashBuilderResult } from '@/composables/orchestrator/useBuilderUtils'
import {
  buildOrchestratorSavePayload,
  saveOrchestratorBuilderItem,
  serializeSceneEntitiesForSave,
  validateOrchestratorForSave,
  mapOrchestratorExecutionHistory,
  orchestratorResultMessage,
} from '@/utils/orchestrator/crud.util'
import { compileSceneGeekGraphToYaml } from '@/utils/geek-scene/compile'
import { decompileToSceneGeekGraph } from '@/utils/geek-scene/decompile'
import { reconcileSceneGraphLayout } from '@/utils/geek-scene/layout'
import { fingerprintSceneYaml } from '@homeos/shared'
import {
  analyzeSceneYamlImport,
  formatSceneImportHint,
  formatSceneRowImportHint,
  summarizeSceneBulkImport,
} from '@/utils/orchestrator/scene-yaml-import.util'
import { mergeGeekRestoreHint } from '@/utils/orchestrator/geek-restore-hint.util'
import {
  createEmptySceneGeekGraph,
  type SceneGeekGraph,
} from '@/utils/geek-scene/graph-types'
import { useBuilderDeleteMessages } from '@/composables/orchestrator/useBuilderDeleteMessages'
import { useEntitiesStore } from '@/stores/entities.store'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { collectIndexedEntityIds, getEntityDisplayName } from '@/utils/entity/derived.util'
import { findReplaceableEntityIdsInYaml } from '@homeos/shared'
import { getApiErrorMessage } from '@/utils/core/error-message'
import type { OrchestratorSavedItem } from '@/types/orchestrator-builder'

type GeekSceneApplyResult = {
  graph: SceneGeekGraph
  approximateHint: string
}

/** useGeekSceneShell：函数，按签名入参返回处理结果。 */
export function useGeekSceneShell(opts: {
  props: {
    embedded?: boolean
    initialEditId?: string | null
    openPlaceholderWizard?: boolean
  }
  graph: SceneGeekGraph
  editingId: Ref<string | null>
  runOnHa: Ref<boolean>
  /** 叠加执行开关：仅改变声明实体，执行前采集快照（可取消恢复） */
  overlay: Ref<boolean>
  formSignature: () => string
  applyGraph: (result: GeekSceneApplyResult) => void
  resetGraph: () => void
  onSaved?: () => void
}) {
  const entitiesStore = useEntitiesStore()

  const core = createGeekShellCore({
    kind: 'scene',
    props: opts.props,
    editingId: opts.editingId,
    runOnHa: opts.runOnHa,
    formSignature: opts.formSignature,
    resetGraph: opts.resetGraph,
    applyFetchedRow,
    graphName: () => opts.graph.name,
    loadFailLabel: '场景',
    onMountedExtra: () => {
      loadBatchEntities()
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

  /** 最近一次叠加执行的场景 ID（有可取消快照时非空，用于展示「取消执行」按钮） */
  const cancelableSceneId = ref<string | null>(null)

  const approximateHint = ref('')
  const batchEntities = ref<Array<{ entity_id: string; name: string }>>([])

  const engineCaps = computed(() => ({
    limitations: [
      '勾选「由 HA 执行」需已同步到 HA，否则执行将失败',
      '实体 ID 不可含 _placeholder 占位符',
      'HA 离线时本地执行同样不可用',
    ],
  }))

  const sceneEngineSections = computed(() => [
    {
      label: '执行方式',
      items: [
        '本地：按实体调用 HA 服务（climate/cover 会拆成多步）',
        'HA：勾选后通过 scene.turn_on 执行完整快照（导入有损属性时推荐）',
      ],
      variant: 'action',
    },
  ])

  const SCENE_RESTORE_HINT_TEXTS = {
    stale: '实体列表已变更，已忽略陈旧图并重新布局',
    approxWithHints: '由实体列表还原，部分属性可能不完整',
    approxPlain: '由实体列表还原，部分属性可能不完整',
    plainRestore: '由 YAML 还原为星形场景图',
    plainRestoreOnlyWithHints: true,
  }

  function mergeRestoreHint(result: ReturnType<typeof decompileToSceneGeekGraph>): string {
    return mergeGeekRestoreHint(result, SCENE_RESTORE_HINT_TEXTS)
  }

  function buildGeneratedYaml() {
    return compileSceneGeekGraphToYaml(opts.graph)
  }

  const { formTouched, yamlPreview } = bindGeekShellDirtyPreview({
    kind: 'scene',
    base,
    formSignature: opts.formSignature,
    editingId: opts.editingId,
    runOnHa: opts.runOnHa,
    buildGeneratedYaml,
  })

  /**
   * 场景本地可按实体 call_service；仅当 YAML 有损（需完整 HA 快照）时提示需 HA。
   * 不再「有实体即强制 runOnHa」。
   */
  const haExecutionReasons = computed(() => {
    if (opts.runOnHa.value) return []
    const yaml = String(base.storedYaml.value || '').trim()
    if (!yaml) return []
    const analysis = analyzeSceneYamlImport(yaml)
    if (!analysis.fromHaImportSuggestRunOnHa) return []
    return analysis.hints.map((label, i) => ({
      id: `scene_lossy_${i}`,
      label,
    }))
  })
  const haExecutionNeeds = computed(() => haExecutionReasons.value.length > 0)

  // 与脚本对齐：有损 YAML 时自动勾选「由 HA 执行」
  watch(haExecutionNeeds, (needs) => {
    if (needs) {
      base.runOnHa.value = true
      opts.runOnHa.value = true
    }
  })

  function enableHaExecution() {
    base.runOnHa.value = true
    opts.runOnHa.value = true
  }

  const { deleteLocalMessage, deleteHaMessage } = useBuilderDeleteMessages(
    base.deleteTarget as Ref<OrchestratorSavedItem | null>,
    '场景',
  )

  function applyDecompiled(
    result: ReturnType<typeof decompileToSceneGeekGraph>,
    yaml?: string,
    optsRunOnHa?: { preferSuggest?: boolean },
  ) {
    let next = createEmptySceneGeekGraph(result.graph)
    next = reconcileSceneGraphLayout(next)
    const hint = mergeRestoreHint(result)
    approximateHint.value = hint
    if (optsRunOnHa?.preferSuggest && result.suggestRunOnHa) {
      base.runOnHa.value = true
      opts.runOnHa.value = true
    }
    opts.applyGraph({ graph: next, approximateHint: hint })
    // applyGraph 之后再生成 YAML，避免沿用上一轮画布快照
    if (yaml != null && yaml.trim()) base.storedYaml.value = yaml
    else base.storedYaml.value = buildGeneratedYaml()
    base.formSnapshot.value = opts.formSignature()
  }

  function applyFetchedRow(row: Record<string, unknown>) {
    const yaml = String(row.yaml || '')
    const result = decompileToSceneGeekGraph({
      geekGraph: row.geekSceneGraph,
      yaml: yaml || undefined,
      entities: row.entities,
      name: row.name as string | undefined,
    })
    // 尊重 DB 标记；仅当 YAML 有损分析建议时升级为 HA
    let runOnHa = !!row.runOnHa
    if (result.suggestRunOnHa) runOnHa = true
    opts.runOnHa.value = runOnHa
    base.runOnHa.value = runOnHa
    // 叠加执行标记随场景记录加载
    opts.overlay.value = !!row.overlay
    applyDecompiled(result, yaml || undefined)
  }

  function loadDraftYaml(yaml: string) {
    if (!yaml?.trim()) return
    applyDecompiled(decompileToSceneGeekGraph({ yaml }), yaml, { preferSuggest: true })
    flashBuilderResult(
      base.resultMsg,
      base.resultOk,
      '已载入场景 YAML',
      true,
      base.dismissAfter,
      2500,
    )
  }

  function copyYaml() {
    copyBuilderYaml(yamlPreview.value, base.resultMsg, base.resultOk, {
      dismissAfter: base.dismissAfter,
    })
  }

  function startNew() {
    startNewCore({
      label: '新建场景',
      resetExtra: () => {
        opts.overlay.value = false
        cancelableSceneId.value = null
        approximateHint.value = ''
      },
    })
  }

  async function saveScene() {
    const generated = buildGeneratedYaml()
    const { yamlText, preservedStored } = resolveGeekSaveYaml({
      storedYaml: base.storedYaml.value,
      formTouched: formTouched.value,
      generated,
      approximate: approximateHint.value,
      fingerprint: fingerprintSceneYaml,
      graph: opts.graph,
    })
    const payloadGraph = clonePlain(opts.graph) as unknown as Record<string, unknown>
    delete payloadGraph._canvasLocal
    delete payloadGraph.lossyEntityIds
    const name = opts.graph.name || '场景'
    await saveOrchestratorBuilderItem({
      kind: 'scene',
      editingId: base.editingId,
      saving: base.saving,
      resultMsg: base.resultMsg,
      resultOk: base.resultOk,
      storedYaml: base.storedYaml,
      formSnapshot: base.formSnapshot,
      isAdmin: isAdmin.value,
      yamlText,
      payload: buildOrchestratorSavePayload({
        kind: 'scene',
        name,
        entities: opts.graph.entities,
        runOnHa: base.runOnHa.value,
        overlay: opts.overlay.value,
        yaml: yamlText,
        geekSceneGraph: payloadGraph,
      }),
      validateForm: () =>
        validateOrchestratorForSave({
          kind: 'scene',
          input: { entities: opts.graph.entities },
        }),
      checkHaExecution: () =>
        haExecutionNeeds.value && !base.runOnHa.value
          ? '当前场景 YAML 含未能完整还原的属性；请勾选「由 HA 执行」后再保存，或核对实体参数。'
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

  const executeDelete = createExecuteDelete(() => {
    approximateHint.value = ''
  })

  async function submitPasteYaml() {
    await core.submitPasteYaml({
      createFn: async (yaml: string) => {
        const parsed = parseSceneYamlIntoForm(yaml)
        const entities = serializeSceneEntitiesForSave(parsed.entities || [])
        if (!entities.length) {
          throw new Error('场景 YAML 中未解析到实体')
        }
        const analysis = analyzeSceneYamlImport(yaml)
        const needsHa = analysis.fromHaImportSuggestRunOnHa
        if (needsHa) {
          base.runOnHa.value = true
          opts.runOnHa.value = true
        }
        const name = pasteYamlName.value.trim() || parsed.sceneName || '导入场景'
        const decompiled = decompileToSceneGeekGraph({ yaml, name })
        const geekSceneGraph = {
          ...decompiled.graph,
          yamlDigest: fingerprintSceneYaml(yaml),
        }
        const { data } = await createOrchestratorItem('scene', {
          name,
          entities: JSON.stringify(entities),
          yaml,
          geekSceneGraph,
          ...(needsHa ? { runOnHa: true } : {}),
        })
        return data
      },
      successHint: (yaml) => formatSceneImportHint(yaml),
    })
  }

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
      core.shell.chrome.notify('未成功导入任何场景', 'warning')
      return
    }
    const importedItems = base.savedList.value.filter((item) => {
      const hid = String(item.haConfigId || item.ha_config_id || '')
      return hid && importedHaIds.includes(hid)
    })
    const summary = summarizeSceneBulkImport(importedItems, '场景')
    core.shell.chrome.notify(summary.message, summary.notifyType)
  }

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
        const hint = formatSceneRowImportHint(row)
        if (hint) core.shell.chrome.notify(`已导入：${hint}`, 'warning')
      },
    })
  }

  async function doPullAllHa() {
    const ok = await core.shell.chrome.confirm(
      '将导入 Home Assistant 中全部 scene 实体（不仅限于 homeos_ 前缀）。数量较多时可能耗时较长，是否继续？',
      '导入全部 HA 场景',
    )
    if (!ok) return
    await base.withSyncFeedback(() => base.pullAllFromHa({ allHaScenes: true }), {
      reload: base.loadList,
      ttlMs: 3000,
      after: () => base.discoverHA(),
    })
  }

  function loadBatchEntities() {
    const ids =
      collectIndexedEntityIds(entitiesStore.domainEntityIndex, { domain: 'all' }) ||
      Object.keys(entitiesStore.entities)
    const list = ids.map((key) => {
      const e = entitiesStore.entities[key]
      return { entity_id: key, name: getEntityDisplayName(key, e) }
    })
    list.sort((a, b) => a.name.localeCompare(b.name))
    batchEntities.value = list
  }

  async function executeScene(item: OrchestratorSavedItem | Record<string, unknown>) {
    if (!item?.id) return
    try {
      const res = await executeSceneApi(String(item.id))
      const result = orchestratorResultMessage({
        kind: 'scene',
        sceneName: String(item.name || ''),
        success: res.data?.success !== false,
      })
      base.resultMsg.value = result.message
      base.resultOk.value = result.ok
      // 叠加执行：后端返回 cancelable 时记录可取消场景（显示「取消执行」按钮）
      if (res.data?.cancelable) {
        cancelableSceneId.value = String(item.id)
      } else {
        cancelableSceneId.value = null
      }
    } catch (e) {
      base.resultMsg.value = getApiErrorMessage(e, '执行失败')
      base.resultOk.value = false
      cancelableSceneId.value = null
    }
    base.dismissAfter(2500)
  }

  /**
   * 取消场景执行：调用取消接口恢复到该场景叠加执行前的快照。
   * 仅当 executeScene 返回可取消（叠加场景）时可用。
   */
  async function cancelScene() {
    const id = cancelableSceneId.value
    if (!id) return
    try {
      const res = await cancelSceneApi(id)
      const restored = Number(res.data?.restored ?? 0)
      base.resultMsg.value = restored > 0 ? `已取消执行，恢复 ${restored} 个实体` : '已取消执行（无可恢复实体）'
      base.resultOk.value = true
      cancelableSceneId.value = null
    } catch (e) {
      base.resultMsg.value = getApiErrorMessage(e, '取消执行失败')
      base.resultOk.value = false
      cancelableSceneId.value = null
    }
    base.dismissAfter(2500)
  }

  const mapSceneHistory = (row: Record<string, unknown>) =>
    mapOrchestratorExecutionHistory('scene', row as never)

  return {
    isAdmin,
    base,
    yamlValidation,
    importFlow,
    engineCaps,
    sceneEngineSections,
    builtinTemplates,
    installingTpl,
    approximateHint,
    yamlPreview,
    formTouched,
    haExecutionReasons,
    haExecutionNeeds,
    enableHaExecution,
    deleteLocalMessage,
    deleteHaMessage,
    mapSceneHistory,
    batchEntities,
    loadBatchEntities,
    loadDraftYaml,
    copyYaml,
    startNew,
    loadItem,
    editItem,
    saveScene,
    executeScene,
    cancelScene,
    cancelableSceneId,
    executeDelete,
    pasteYamlName,
    openPasteYaml,
    closePasteYaml,
    submitPasteYaml,
    bulkImportDiscovered,
    installTemplate,
    doImport,
    ...importFlowBindings,
    ...phWizardBindings,
    phWizardName,
    dismissAfter: base.dismissAfter,
    doPullAllHa,
    ...baseExpose(),
  }
}
