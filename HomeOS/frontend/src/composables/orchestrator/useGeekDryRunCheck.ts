/**
 * 试运行评估与规则查重组合式函数。
 *
 * 两者都基于「当前画布 YAML（含未保存修改）」调用后端；
 * 空白草稿回退已保存规则 id。状态（抽屉开关 / 加载态 / 结果 / 错误）集中管理。
 */
import { ref } from 'vue'
import {
  checkAutomationDuplicate,
  dryRunAutomation as dryRunAutomationApi,
} from '@/services/api/orchestrator'
import { isGeekGraphNonEmpty, type GeekGraph } from '@/utils/geek-automation'

/** useGeekDryRunCheck：函数，按签名入参返回处理结果。 */
export function useGeekDryRunCheck(opts: {
  /** 当前编辑的 geekGraph（reactive） */
  graph: GeekGraph
  /** 画布组件 ref：评估前先 commit 落盘当前画布 */
  canvasRef: { value: { commit?: () => void } | null }
  /** 当前编辑规则 id（null 表示新建草稿） */
  editingId: { value: string | null }
  /** 实时编译的 YAML 预览文本 */
  yamlPreview: { value: string }
  /** 试运行抽屉开关（由外部抽屉壳状态提供，与 closeAllDrawers 等共享同一 ref） */
  showDryRun: { value: boolean }
  /** 查重抽屉开关（本地状态） */
  showDuplicate: { value: boolean }
  /** 结果反馈（ok / msg） */
  notify: (ok: boolean, msg: string) => void
}) {
  /** 试运行评估：加载态 / 错误 */
  const dryRunBusy = ref(false)
  const dryRunError = ref('')
  const dryRunResult = ref(null)

  /** 规则查重：加载态 / 命中列表 / 错误 */
  const duplicateBusy = ref(false)
  const duplicateResult = ref(null)
  const duplicateError = ref('')

  /** 试运行：画布有内容时优先编译当前画布 YAML 评估（含未保存修改）；空白草稿回退已保存规则 id */
  async function runDryRun() {
    if (dryRunBusy.value) return
    opts.canvasRef.value?.commit?.()
    const hasDraft = isGeekGraphNonEmpty(opts.graph)
    if (!opts.editingId.value && !hasDraft) {
      opts.notify(false, '请先添加触发与动作，再试运行')
      return
    }
    dryRunBusy.value = true
    dryRunError.value = ''
    dryRunResult.value = null
    opts.showDryRun.value = true
    try {
      const draftYaml = hasDraft ? String(opts.yamlPreview.value || '').trim() : ''
      const res = await dryRunAutomationApi(
        draftYaml ? { yaml: draftYaml } : { id: opts.editingId.value || undefined },
      )
      dryRunResult.value = res?.data ?? null
      if (!dryRunResult.value) {
        dryRunError.value = '服务未返回评估结果'
      }
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      dryRunError.value = String(err.response?.data?.message || err.message || '评估失败')
    } finally {
      dryRunBusy.value = false
    }
  }

  function closeDryRun() {
    if (dryRunBusy.value) return
    opts.showDryRun.value = false
  }

  /** 规则查重：编译当前画布 YAML（含未保存修改）按签名检测重复；返回命中列表 */
  async function runDuplicateCheck() {
    if (duplicateBusy.value) return
    opts.canvasRef.value?.commit?.()
    const hasDraft = isGeekGraphNonEmpty(opts.graph)
    if (!opts.editingId.value && !hasDraft) {
      opts.notify(false, '请先添加触发与动作，再查重')
      return null
    }
    duplicateBusy.value = true
    duplicateResult.value = null
    duplicateError.value = ''
    opts.showDuplicate.value = true
    try {
      const draftYaml = hasDraft ? String(opts.yamlPreview.value || '').trim() : ''
      const res = await checkAutomationDuplicate(
        draftYaml
          ? { yaml: draftYaml, excludeId: opts.editingId.value || undefined }
          : { yaml: undefined, excludeId: opts.editingId.value || undefined },
      )
      const hits = Array.isArray(res?.data?.duplicates) ? res.data.duplicates : []
      duplicateResult.value = hits
      if (!hits.length) {
        opts.notify(true, '未发现语义重复的自动化')
      } else {
        opts.notify(false, `发现 ${hits.length} 条语义重复的自动化`)
      }
      return hits
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      duplicateError.value = String(err.response?.data?.message || err.message || '查重失败')
      opts.notify(false, duplicateError.value)
      return null
    } finally {
      duplicateBusy.value = false
    }
  }

  function closeDuplicate() {
    if (duplicateBusy.value) return
    opts.showDuplicate.value = false
  }

  return {
    dryRunBusy,
    dryRunError,
    dryRunResult,
    duplicateBusy,
    duplicateResult,
    duplicateError,
    runDryRun,
    closeDryRun,
    runDuplicateCheck,
    closeDuplicate,
  }
}
