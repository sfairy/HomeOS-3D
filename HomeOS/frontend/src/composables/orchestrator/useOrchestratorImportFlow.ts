/**
 * @file useOrchestratorImportFlow.ts
 * @module composables/orchestrator
 * @description 联动器 builder 共用的 HA 导入 / 粘贴 YAML 流程 composable。
 *
 * 职责：
 * - 维护粘贴 YAML 弹窗开关、文本内容、导入中标志；
 * - submitPasteYaml：校验 YAML → 调用 createFn 创建 → 通知 + 回调；
 * - doImport：调用 fetchFn 批量拉取待导入项 → mapRow 映射 → onEach 逐项处理 → 通知。
 *
 * 依赖：
 * - vue（ref）
 * - @/utils/core/error-message（getApiErrorMessage）
 * - @/types/orchestrator-builder（DoImportOptions / OrchestratorImportFlowOptions / SubmitPasteYamlOptions）
 */
import { ref } from 'vue'
import { getApiErrorMessage } from '@/utils/core/error-message'
import type {
  DoImportOptions,
  OrchestratorImportFlowOptions,
  SubmitPasteYamlOptions,
} from '@/types/orchestrator-builder'

/**
 * 联动器 builder 共用的 HA 导入 / 粘贴 YAML 流程。
 *
 * @param chrome chrome store（提供 notify）
 * @param validateYaml YAML 校验函数（可选）
 * @param onImported 导入成功后的回调
 * @param entityLabel 实体中文标签（默认"条目"），用于通知文案
 * @returns pasteYamlOpen 粘贴弹窗开关；pasteYamlText 粘贴文本；importing 导入中标志；submitPasteYaml 提交粘贴；doImport 批量导入
 */
export function useOrchestratorImportFlow({
  chrome,
  validateYaml,
  onImported,
  entityLabel = '条目',
}: OrchestratorImportFlowOptions) {
  const pasteYamlOpen = ref(false)
  const pasteYamlText = ref<string>('')
  const importing = ref(false)
  // 通知包装：兼容 chrome store 缺失 notify 方法的情况
  const notify = (msg: string, type?: string) => {
    const store = chrome as { notify?: (m: string, t?: string) => void } | null | undefined
    store?.notify?.(msg, type)
  }

  /**
   * 提交粘贴的 YAML 文本：校验通过后调用 createFn 创建实体，
   * 成功后关闭弹窗、清空文本、回调 onImported、通知。
   *
   * @param createFn 创建函数（接收 YAML 文本，返回创建结果）
   * @param yaml 可选 YAML 文本（默认用 pasteYamlText）
   * @param successHint 成功提示文案生成函数（可选）
   * @returns 创建结果（失败返回 null）
   */
  async function submitPasteYaml({ createFn, yaml, successHint }: SubmitPasteYamlOptions) {
    const text = String(yaml ?? pasteYamlText.value ?? '').trim()
    if (!text) {
      notify('请粘贴 YAML 内容', 'warning')
      return null
    }
    // 可选 YAML 校验：未通过则提示并退出
    if (validateYaml) {
      const v = await validateYaml(text)
      if (!v?.valid) {
        notify(v?.message || 'YAML 校验未通过', 'error')
        return null
      }
    }
    importing.value = true
    try {
      const created = await createFn(text)
      // 成功：关闭弹窗、清空文本、回调
      pasteYamlOpen.value = false
      pasteYamlText.value = ''
      onImported?.(created)
      // 优先使用调用方提供的 successHint 文案，否则用默认"已导入"
      const hint = successHint?.(text)?.trim() || ''
      if (hint) {
        notify(`${entityLabel}已导入：${hint}`, 'warning')
      } else {
        notify(`${entityLabel}已导入`, 'success')
      }
      return created
    } catch (err) {
      notify(getApiErrorMessage(err) || '导入失败', 'error')
      return null
    } finally {
      importing.value = false
    }
  }

  /**
   * 批量导入：fetchFn 拉取待导入项，mapRow 映射后逐项 onEach 处理；
   * 支持调用方自定义汇总通知。
   *
   * @param fetchFn 拉取待导入行的函数
   * @param mapRow 行映射函数（可选）
   * @param onEach 每行处理回调（可选）
   * @param successNotify 自定义成功通知（返回 null 表示自行汇总，返回对象则按对象通知）
   * @returns 导入结果数组（失败返回空数组）
   */
  async function doImport({ fetchFn, mapRow, onEach, successNotify }: DoImportOptions) {
    importing.value = true
    try {
      const rows = await fetchFn()
      if (!rows?.length) {
        notify('未发现可导入项', 'info')
        return []
      }
      const out: unknown[] = []
      for (const row of rows) {
        const mapped = mapRow ? mapRow(row) : row
        if (mapped) {
          out.push(mapped)
          await onEach?.(mapped, row)
        }
      }
      // 自定义通知优先级：null=调用方自行汇总；对象=按对象通知；undefined=默认汇总
      const custom = successNotify?.({ count: out.length, items: out })
      if (custom === null) {
        /* 调用方自行汇总通知 */
      } else if (custom) {
        notify(custom.message, custom.type || 'success')
      } else {
        notify(`已导入 ${out.length} 个${entityLabel}`, 'success')
      }
      return out
    } catch (err) {
      notify(getApiErrorMessage(err) || '导入失败', 'error')
      return []
    } finally {
      importing.value = false
    }
  }

  return {
    pasteYamlOpen,
    pasteYamlText,
    importing,
    submitPasteYaml,
    doImport,
  }
}
