/**
 * 统一的配置选择器（0.8.1）：
 * 「添加交互对象」「选择设备类别」「关联模型 / 灯组」原来是三套弹窗，口径各异。
 * 0.8.1 把它们收敛成一个可按分组渲染的选择器，选项可以带
 *   - 当前标记（`is-selected`）
 *   - 配置进度（`configurationSummary`）
 *   - 明细行（已配置 / 缺失 / 未配置）
 * 选择动作异步执行，执行期间禁掉所有选项，失败把错误写回弹窗。
 */

import type { ConfigurationProgress } from './configuration-progress'

import { domElement } from '@app/shared/util/dom-factory'
export interface ConfigurationSummaryOptions {
  document: Document
  /** 「模型 / 灯组 / 按钮」，只影响提示文案。 */
  unit?: string
}

const MDI_ICON_PATTERN = /^mdi:[a-z0-9-]+$/
const MDI_SVG_ROOT = '/static/vendor/mdi/7.4.47/svg/'

export interface ConfigurationChoice {
  id: string
  label: string
  icon?: string
  disabled?: boolean
  wrapLabel?: boolean
  detail?: string
  state?: 'configured' | 'missing' | 'remaining'
  progress?: ConfigurationProgress
  /** 禁用时的补充指引（上游类别弹窗的 `hint`）。 */
  hint?: string
  unit?: string
}

export interface ConfigurationPickerSection {
  label?: string
  options: readonly ConfigurationChoice[]
}

export interface ConfigurationPickerOptions {
  document: Document
  title: string
  kicker?: string
  description?: string
  sections: readonly ConfigurationPickerSection[]
  summary?: ConfigurationProgress
  unit?: string
  selectedId?: string
  /** 关闭按钮的 `aria-label`；缺省是「关闭」+ 标题。 */
  closeLabel?: string
  controls?: Node
  emptyMessage?: string
  /**
   * 二次确认（0.9.0 的「确定添加」）：给出后，点选只做**选中**，不立即提交；
   * 提交后弹窗保持打开，并把 `hint` 留在选项下方 —— 用户要连着加几个模型时
   * 不用每次重新打开、重新等楼层与进度。
   */
  confirmSelection?: { label: string; hint: string }
  /** 二次确认模式下，每次提交后重建选项（新增的模型要从列表里消失）。 */
  refreshSections?: () => readonly ConfigurationPickerSection[]
  onSelect: (choiceId: string) => Promise<unknown> | unknown
  onClose?: () => void
}

export interface ConfigurationPickerHandle {
  close(): void
}

export function configurationSummary(
  progress: ConfigurationProgress,
  { document: ownerDocument, unit = '模型' }: ConfigurationSummaryOptions,
): HTMLElement {
  const summaryElement = domElement(ownerDocument, 'span', 'i3d-configuration-counts')
  if (!progress.ready) {
    summaryElement.textContent = '加载中…'
    return summaryElement
  }
  const entries: Array<[string, number | undefined, string]> = progress.requiresModel
    ? [
        [unit, progress.total, 'total'],
        ['已配置', progress.configured, 'configured'],
        ['未配置', progress.remaining, 'remaining'],
      ]
    : [['已配置', progress.configured, 'configured']]
  if (progress.missing) entries.push([unit === '灯组' ? '灯组缺失' : '模型缺失', progress.missing, 'missing'])
  entries.forEach(([labelText, countValue, stateName], entryIndex) => {
    if (entryIndex) summaryElement.append(domElement(ownerDocument, 'span', 'i3d-configuration-separator', ' · '))
    const labelElement = domElement(ownerDocument, 'span', 'i3d-configuration-count', labelText + ' ')
    const countElement = ownerDocument.createElement('b')
    const resolvedCount = countValue ?? 0
    countElement.className = 'i3d-configuration-number is-' + (resolvedCount === 0 ? 'zero' : stateName)
    countElement.textContent = String(resolvedCount)
    labelElement.append(countElement)
    summaryElement.append(labelElement)
  })
  return summaryElement
}

/** 选项的明细行（「模型缺失 · 可重新关联」这类灰字）。 */
function createConfigurationDetail(ownerDocument: Document, text: string, state?: string): HTMLElement {
  const detailElement = domElement(ownerDocument, 'span', 'i3d-configuration-detail' + (state ? ' is-' + state : ''))
  detailElement.textContent = text
  return detailElement
}

/** 选项的进度 / 禁用提示 / 明细行：类别弹窗与模型弹窗共用同一套渲染顺序。 */
function appendChoiceMeta(optionButton: HTMLElement, choice: ConfigurationChoice, ownerDocument: Document): void {
  choice.progress &&
    optionButton.append(configurationSummary(choice.progress, { document: ownerDocument, unit: choice.unit }))
  choice.hint && optionButton.append(createConfigurationDetail(ownerDocument, choice.hint))
  choice.detail && optionButton.append(createConfigurationDetail(ownerDocument, choice.detail, choice.state))
}

export interface ConfigurationSegmentedControlOptions {
  document: Document
  /** 控件上方的小标题（为空则不渲染）。 */
  label?: string
  /** [值, 文案] 列表，顺序即按钮顺序。 */
  options: ReadonlyArray<readonly [string, string]>
  value: string
  onChange: (nextValue: string) => void
}

/**
 * 分段选择（0.8.1 弹窗顶部的「设备类型」）：与 `app.css` 的
 * `.navigation-segmented-options` 同一套视觉，但自带字段标题，且不依赖原生 `<select>`
 * 的下拉层。弹窗挂在 `document.body` 上，`.i3d-editor` 作用域规则够不到，
 * 所以样式落在 `runtime.css` 的 `.i3d-picker-*` 上。
 */
export function configurationSegmentedControl({
  document: ownerDocument,
  label,
  options,
  value,
  onChange,
}: ConfigurationSegmentedControlOptions): HTMLElement {
  const fieldElement = domElement(ownerDocument, 'div', 'i3d-picker-field')
  label && fieldElement.append(domElement(ownerDocument, 'span', 'i3d-picker-field-label', label))
  const groupElement = domElement(ownerDocument, 'div', 'i3d-picker-segmented')
  groupElement.setAttribute('role', 'group')
  label && groupElement.setAttribute('aria-label', label)
  let currentValue = value
  const optionButtons: HTMLButtonElement[] = []
  const syncPressedState = () => {
    optionButtons.forEach((optionButton) => {
      const isActive = optionButton.dataset.pickerValue === currentValue
      optionButton.classList.toggle('is-active', isActive)
      optionButton.setAttribute('aria-pressed', String(isActive))
    })
  }
  options.forEach(([optionValue, optionLabel]) => {
    const optionButton = domElement(ownerDocument, 'button', '', optionLabel) as HTMLButtonElement
    ;(optionButton.type = 'button'), (optionButton.dataset.pickerValue = optionValue)
    optionButton.addEventListener('click', () => {
      if (currentValue === optionValue) return
      currentValue = optionValue
      syncPressedState()
      onChange(currentValue)
    })
    optionButtons.push(optionButton), groupElement.append(optionButton)
  })
  syncPressedState()
  fieldElement.append(groupElement)
  return fieldElement
}

export function openConfigurationPicker({
  document: ownerDocument,
  title,
  kicker = 'CONFIGURATION',
  description,
  sections,
  summary,
  unit,
  closeLabel,
  selectedId,
  controls,
  emptyMessage = '当前楼层没有可选对象。',
  confirmSelection,
  refreshSections,
  onSelect,
  onClose,
}: ConfigurationPickerOptions): ConfigurationPickerHandle {
  const previouslyFocusedElement = ownerDocument.activeElement,
    create = (tagName: string, className = '', textContent = ''): HTMLElement => {
      const node = ownerDocument.createElement(tagName)
      node.className = className
      node.textContent = textContent
      return node
    },
    dialogElement = create('dialog', 'settings-dialog i3d-device-category-dialog') as HTMLDialogElement
  dialogElement.setAttribute('aria-label', title)
  let isClosed = false,
    isSelecting = false
  const close = () => {
    if (isClosed) return
    ;(isClosed = true),
      dialogElement.close(),
      dialogElement.remove(),
      onClose?.(),
      previouslyFocusedElement instanceof HTMLElement && previouslyFocusedElement.focus?.()
  }
  const headingElement = create('div', 'dialog-heading'),
    headingTextElement = create('div')
  headingTextElement.append(create('span', 'i3d-picker-kicker', kicker), create('h2', '', title))
  description && headingTextElement.append(create('p', 'i3d-note', description))
  summary && headingTextElement.append(configurationSummary(summary, { document: ownerDocument, unit }))
  const closeButtonElement = create('button', 'icon-button', '×') as HTMLButtonElement
  ;(closeButtonElement.type = 'button'), closeButtonElement.setAttribute('aria-label', closeLabel || '关闭' + title)
  closeButtonElement.addEventListener('click', close)
  headingElement.append(headingTextElement, closeButtonElement)
  const bodyElement = create('div', 'i3d-device-category-dialog-body')
  if (controls) {
    const controlsElement = create('div', 'i3d-configuration-controls')
    controlsElement.append(controls), bodyElement.append(controlsElement)
  }
  const errorElement = create('p', 'i3d-error')
  errorElement.setAttribute('role', 'status')
  /**
   * 列表锚点：选项区在**重建时**要落回「错误行之前、控件区之后」。
   *
   * 不能直接 `insertBefore(section, errorElement)` —— 首次渲染时 `errorElement` 还没挂进
   * body，`insertBefore` 会抛 `NotFoundError`（整个选择器打不开）。这里先挂一个空锚点，
   * 之后所有重建都插在锚点前面，位置稳定且与插入顺序无关。
   */
  const listAnchorElement = create('div', 'i3d-picker-list-anchor')
  bodyElement.append(listAnchorElement, errorElement)
  /** 二次确认模式下当前选中的选项（未给 `confirmSelection` 时恒为空）。 */
  let pendingChoiceId = ''
  const optionRecords: Array<{ optionButton: HTMLButtonElement; disabled: boolean }> = []
  const confirmButtonElement = confirmSelection
    ? (create('button', 'primary-action', confirmSelection.label) as HTMLButtonElement)
    : null
  const confirmHintElement = confirmSelection ? create('p', 'i3d-note', confirmSelection.hint) : null
  const sectionElements: HTMLElement[] = []
  /** 空态文案节点（懒创建；重建时按最新条数显示或移除）。 */
  let emptyMessageElement: HTMLElement | null = null

  const syncConfirmState = () => {
    if (!confirmButtonElement) return
    confirmButtonElement.disabled = isSelecting || !pendingChoiceId
    optionRecords.forEach((record) => {
      record.optionButton.setAttribute(
        'aria-pressed',
        String(record.optionButton.dataset.configurationChoice === pendingChoiceId),
      )
      record.optionButton.classList.toggle(
        'is-selected',
        record.optionButton.dataset.configurationChoice === pendingChoiceId,
      )
    })
  }

  /** 渲染（或重建）选项区：二次确认模式提交后要重跑一次，让新增的模型从列表消失。 */
  const renderSections = (nextSections: readonly ConfigurationPickerSection[]) => {
    for (const sectionElement of sectionElements) sectionElement.remove()
    sectionElements.length = 0
    optionRecords.length = 0
    for (const section of nextSections) {
      const sectionElement = create('section', 'i3d-device-category-group')
      section.label && sectionElement.append(create('h3', '', section.label))
      const optionsElement = create('div', 'i3d-device-category-options')
      for (const choice of section.options) {
        const optionButton = create(
          'button',
          'i3d-device-category-option' + (choice.id === selectedId ? ' is-selected' : ''),
        ) as HTMLButtonElement
        optionButton.type = 'button'
        optionButton.disabled = Boolean(choice.disabled)
        optionButton.title = choice.label
        optionButton.setAttribute('data-configuration-choice', choice.id)
        optionButton.setAttribute('aria-pressed', String(choice.id === selectedId))
        const topElement = create('span', 'i3d-device-category-option-top')
        if (MDI_ICON_PATTERN.test(choice.icon ?? '')) {
          const iconElement = create('i', 'i3d-device-category-icon')
          iconElement.setAttribute('aria-hidden', 'true')
          const maskUrl = "url('" + MDI_SVG_ROOT + (choice.icon ?? '').slice(4) + ".svg')"
          ;(iconElement.style.maskImage = maskUrl), (iconElement.style.webkitMaskImage = maskUrl)
          topElement.append(iconElement)
        }
        topElement.append(
          create('span', 'i3d-device-category-option-label' + (choice.wrapLabel ? ' is-wrapped' : ''), choice.label),
        )
        choice.id === selectedId && topElement.append(create('span', 'i3d-device-category-option-current', '当前'))
        optionButton.append(topElement)
        appendChoiceMeta(optionButton, choice, ownerDocument)
        optionButton.addEventListener('click', async () => {
          if (isClosed || isSelecting || choice.disabled) return
          // 二次确认模式：点选只做「选中」，等用户按「确定添加」。
          if (confirmSelection) {
            pendingChoiceId = pendingChoiceId === choice.id ? '' : choice.id
            errorElement.textContent = ''
            syncConfirmState()
            return
          }
          await commitSelection(choice.id)
        })
        optionRecords.push({ optionButton, disabled: optionButton.disabled })
        optionsElement.append(optionButton)
      }
      sectionElement.append(optionsElement)
      bodyElement.insertBefore(sectionElement, listAnchorElement)
      sectionElements.push(sectionElement)
    }
    // 空态文案也归这里管：重建后可能从「有模型」变成「全加完了」。
    optionRecords.length
      ? emptyMessageElement?.remove()
      : ((emptyMessageElement ||= create('p', 'i3d-note', emptyMessage)),
        bodyElement.insertBefore(emptyMessageElement, listAnchorElement))
    syncConfirmState()
  }

  /** 真正提交一次选择；二次确认模式下成功后**不关窗**，只清空选中并重建列表。 */
  const commitSelection = async (choiceId: string) => {
    if (isClosed || isSelecting) return
    ;(isSelecting = true),
      optionRecords.forEach((record) => {
        record.optionButton.disabled = true
      }),
      (errorElement.textContent = '')
    try {
      await onSelect(choiceId)
      if (isClosed) return
      if (confirmSelection) {
        pendingChoiceId = ''
        renderSections(refreshSections ? refreshSections() : sections)
      } else close()
    } catch (selectError: unknown) {
      isClosed ||
        (errorElement.textContent = (selectError as { message?: string } | undefined)?.message || '选择失败，请重试。')
    } finally {
      ;(isSelecting = false),
        isClosed ||
          optionRecords.forEach((record) => {
            record.optionButton.disabled = record.disabled
          }),
        isClosed || syncConfirmState()
    }
  }

  renderSections(sections)
  if (confirmButtonElement && confirmHintElement) {
    const confirmRowElement = create('div', 'i3d-picker-confirm-row')
    confirmButtonElement.type = 'button'
    confirmButtonElement.addEventListener('click', () => void commitSelection(pendingChoiceId))
    confirmRowElement.append(confirmHintElement, confirmButtonElement)
    bodyElement.append(confirmRowElement)
  }
  syncConfirmState()
  dialogElement.append(headingElement, bodyElement),
    ownerDocument.body.append(dialogElement),
    dialogElement.addEventListener('cancel', (cancelEvent: Event) => {
      cancelEvent.preventDefault(), cancelEvent.stopPropagation(), close()
    }),
    dialogElement.showModal()
  return { close }
}
