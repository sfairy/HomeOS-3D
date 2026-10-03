/**
 * 联动器批量管理 / 导入导出组合式函数。
 *
 * 能力：
 * - batchToggleAll：批量启用/停用全部自动化（仅 automation 支持）
 * - exportJson / exportYaml：导出全部条目
 * - pickImportFile / importText：导入 JSON / YAML 文件并逐条创建
 */
import { ref } from 'vue'
import { batchToggleAutomations, createOrchestratorItem } from '@/services/api/orchestrator'
import {
  downloadOrchestratorJson,
  downloadOrchestratorYaml,
  parseOrchestratorImportText,
  type OrchestratorBatchImportItem,
  type OrchestratorBatchKind,
} from '@/utils/orchestrator/batch-io.util'

interface UseOrchestratorBatchIoOptions {
  kind: OrchestratorBatchKind
  entityLabel: string
  /** 当前列表条目（已保存行） */
  getItems: () => Array<Record<string, unknown>>
  /** 导入 / 批量操作后刷新列表 */
  refresh: () => Promise<void> | void
  /** 提示（ok=成功） */
  notify: (ok: boolean, msg: string) => void
}

/** useOrchestratorBatchIo：函数，按签名入参返回处理结果。 */
export function useOrchestratorBatchIo(opts: UseOrchestratorBatchIoOptions) {
  const batchBusy = ref(false)
  const exporting = ref(false)
  const importing = ref(false)
  const importFileInput = ref<HTMLInputElement | null>(null)

  const { kind, entityLabel } = opts

  /** 批量启用/停用全部（仅 automation 支持） */
  async function batchToggleAll(enabled: boolean) {
    const ids = opts
      .getItems()
      .map((i) => String(i.id || ''))
      .filter(Boolean)
    if (!ids.length) {
      opts.notify(false, `没有可操作的${entityLabel}`)
      return
    }
    batchBusy.value = true
    try {
      const res = await batchToggleAutomations(ids, enabled)
      const data = res?.data || {}
      const succeeded = Array.isArray(data.succeeded) ? data.succeeded.length : ids.length
      const failed = Array.isArray(data.failed) ? data.failed.length : 0
      const msg = `已${enabled ? '启用' : '停用'} ${succeeded} 条${failed ? `，失败 ${failed} 条` : ''}`
      opts.notify(failed === 0, msg)
      await opts.refresh()
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      opts.notify(false, String(err?.response?.data?.message || err?.message || `${entityLabel}批量启停失败`))
    } finally {
      batchBusy.value = false
    }
  }

  /** 导出 JSON */
  async function exportJson() {
    const items = opts.getItems()
    if (!items.length) {
      opts.notify(false, `没有可导出的${entityLabel}`)
      return
    }
    exporting.value = true
    try {
      downloadOrchestratorJson(kind, items)
      opts.notify(true, `已导出 ${items.length} 条${entityLabel} JSON`)
    } finally {
      exporting.value = false
    }
  }

  /** 导出 YAML（多文档） */
  async function exportYaml() {
    const items = opts.getItems()
    if (!items.length) {
      opts.notify(false, `没有可导出的${entityLabel}`)
      return
    }
    exporting.value = true
    try {
      downloadOrchestratorYaml(kind, items)
      opts.notify(true, `已导出 ${items.length} 条${entityLabel} YAML`)
    } finally {
      exporting.value = false
    }
  }

  /** 弹出文件选择框导入 */
  function pickImportFile() {
    if (importing.value) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.yaml,.yml,application/json,text/yaml'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void importFile(file)
    }
    input.click()
  }

  /** 读取并导入文件 */
  async function importFile(file: File) {
    const text = await file.text()
    await importText(text, file.name)
  }

  /** 解析并逐条创建导入条目 */
  async function importText(text: string, sourceName = '文件') {
    if (importing.value) return
    const { items, errors } = parseOrchestratorImportText(text, kind)
    if (!items.length) {
      opts.notify(false, errors.length ? errors[0] : '未解析到可导入条目')
      return
    }
    importing.value = true
    let created = 0
    let failed = 0
    try {
      for (const item of items) {
        try {
          await createOrchestratorItem(kind, buildCreatePayload(kind, item))
          created += 1
        } catch {
          failed += 1
        }
      }
      await opts.refresh()
      const extra =
        errors.length || failed ? `；${failed + errors.length} 条跳过` : ''
      opts.notify(failed === 0 && errors.length === 0, `从「${sourceName}」导入 ${created} 条${extra}`)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      opts.notify(false, String(err?.response?.data?.message || err?.message || '导入失败'))
    } finally {
      importing.value = false
    }
  }

  return {
    batchBusy,
    exporting,
    importing,
    importFileInput,
    batchToggleAll,
    exportJson,
    exportYaml,
    pickImportFile,
    importFile,
    importText,
  }
}

/** 将导入条目映射为创建载荷 */
function buildCreatePayload(
  kind: OrchestratorBatchKind,
  item: OrchestratorBatchImportItem,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: item.name }
  if (kind === 'scene') {
    payload.entities = item.entities ?? item.yaml ?? ''
    payload.runOnHa = item.runOnHa ?? false
    if (item.geekSceneGraph) payload.geekSceneGraph = item.geekSceneGraph
    return payload
  }
  payload.yaml = item.yaml ?? ''
  payload.runOnHa = item.runOnHa ?? false
  if (kind === 'automation' && typeof item.enabled === 'boolean') payload.enabled = item.enabled
  if (item.geekGraph) payload.geekGraph = item.geekGraph
  return payload
}
