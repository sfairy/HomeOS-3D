/**
 * 自定义 HTML 微件代码编辑器组合式函数。
 *
 * 所属模块：widget/composables
 * 职责：为自定义 HTML 微件（Custom HTML Widget）的代码编辑区域提供统一的状态与方法，
 *      负责文本域引用绑定、代码片段插入、实体选择器开关与实体 ID 插入等交互逻辑。
 * 依赖：
 *   - vue（ref 响应式原语）
 *   - @/utils/widget/custom-html-widget.util（代码片段定义与文本插入工具）
 */
import { ref } from 'vue'
import {
  CUSTOM_HTML_WIDGET_SNIPPETS,
  applyCustomHtmlSnippet,
  insertTextAtSelection,
} from '@/utils/widget/custom-html-widget.util'

/**
 * 自定义 HTML 微件代码编辑器组合式函数。
 *
 * @param {() => string} getValue  获取当前完整 HTML 文本的函数（通常绑定到上游 ref 的 getter）
 * @param {(v: string) => void} setValue  设置当前完整 HTML 文本的函数（通常绑定到上游 ref 的 setter）
 * @returns 编辑器对外暴露的响应式状态与方法集合
 */
export function useCustomHtmlEditor(getValue: () => string, setValue: (v: string) => void) {
  /** 当前绑定的 textarea DOM 引用，用于在光标位置插入文本 */
  const textareaRef = ref<HTMLTextAreaElement | null>(null)
  /** 实体选择器（EntityPicker）弹层是否可见 */
  const showEntityPicker = ref(false)
  /** 实体选择器初始选中的实体 ID 列表（用作 seed） */
  const entityPickerSeed = ref<string[]>([])

  /**
   * 绑定 textarea 元素引用，供模板通过 ref 回调使用。
   * @param {HTMLTextAreaElement | null} el  textarea 元素或 null（卸载时）
   */
  function bindTextarea(el: HTMLTextAreaElement | null) {
    textareaRef.value = el
  }

  /**
   * 插入预设的代码片段。
   * @param {string} snippetId  片段 ID，对应 CUSTOM_HTML_WIDGET_SNIPPETS 中的某一项
   * @param {'insert' | 'replace'} mode  insert=合并插入；replace=直接整体替换
   */
  function insertSnippet(snippetId: string, mode: 'insert' | 'replace' = 'insert') {
    const snippet = CUSTOM_HTML_WIDGET_SNIPPETS.find((s) => s.id === snippetId)
    if (!snippet) return

    const current = getValue()
    if (mode === 'replace') {
      setValue(snippet.code)
      return
    }

    setValue(applyCustomHtmlSnippet(current, snippet.code))
  }

  /**
   * 将一组实体 ID 以字符串字面量或数组字面量形式插入到当前光标位置。
   * 单个实体：'entity_id'；多个实体：['id1', 'id2']。
   * @param {string[]} ids  待插入的实体 ID 列表
   */
  function insertEntityIds(ids: string[]) {
    if (!ids.length) return
    const token = ids.length === 1 ? `'${ids[0]}'` : `[${ids.map((id) => `'${id}'`).join(', ')}]`
    setValue(insertTextAtSelection(textareaRef.value, token, getValue()))
  }

  /** 打开实体选择器弹层（清空 seed） */
  function openEntityPicker() {
    entityPickerSeed.value = []
    showEntityPicker.value = true
  }

  /**
   * 实体选择器保存回调：关闭弹层并将所选实体 ID 插入到代码中。
   * @param {string[]} ids  用户在弹层中确认选中的实体 ID 列表
   */
  function onEntityPickerSave(ids: string[]) {
    showEntityPicker.value = false
    insertEntityIds(ids)
  }

  return {
    textareaRef,
    bindTextarea,
    snippets: CUSTOM_HTML_WIDGET_SNIPPETS,
    showEntityPicker,
    entityPickerSeed,
    insertSnippet,
    insertEntityIds,
    openEntityPicker,
    onEntityPickerSave,
  }
}