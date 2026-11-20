import { editNumberText, numberEditValue, rememberNumberValue, steppedNumber } from '../studio-edit-metrics'

import { domElement } from '@app/shared/util/dom-factory'
/** 浮动菜单与视口边缘 / 触发器之间留的间距。 */
const FLOATING_MENU_EDGE = 8
const FLOATING_MENU_GAP = 4
/** 菜单不比触发器窄太多（选项文案普遍比触发器长），但也不要退化成一条细缝。 */
const FLOATING_MENU_MIN_WIDTH = 124
const FLOATING_MENU_MIN_HEIGHT = 80

/**
 * 浮动菜单定位（0.8.7 `data-floating-menu` 的语义）。
 *
 * 为什么需要：预览标题行里那个风格选择器所在容器是 `overflow: hidden` 的 132px 高网格，
 * 菜单留在容器内会被裁掉；挂到 `document.body` 再按触发器位置绝对定位才完整可见。
 *
 * 三个边界都要处理：宽度夹在「触发器宽 / 最小宽 / 视口宽」之间、右侧不越界、
 * 下方放不下就上翻且 `max-height` 同步收到那一侧的剩余空间。
 *
 * 量宽之前先把 `width` 还原成 `auto` 并钉住 `left`：菜单是 `position: fixed` 且
 * `left/right: auto`，这样量到的是**内容自然宽**（选项是 `nowrap`），而不是上一次开合留下的宽度。
 */
function layoutFloatingMenu(trigger: HTMLElement, menu: HTMLElement): void {
  const triggerRect = trigger.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  menu.style.width = 'auto'
  menu.style.right = 'auto'
  menu.style.left = '0px'
  const contentWidth = menu.offsetWidth
  const maxWidth = Math.max(FLOATING_MENU_MIN_WIDTH, viewportWidth - FLOATING_MENU_EDGE * 2)
  const width = Math.round(Math.min(Math.max(triggerRect.width, FLOATING_MENU_MIN_WIDTH, contentWidth), maxWidth))
  menu.style.width = width + 'px'
  menu.style.left =
    Math.round(
      Math.min(
        Math.max(FLOATING_MENU_EDGE, triggerRect.left),
        Math.max(FLOATING_MENU_EDGE, viewportWidth - width - FLOATING_MENU_EDGE),
      ),
    ) + 'px'

  const spaceBelow = viewportHeight - triggerRect.bottom - FLOATING_MENU_GAP - FLOATING_MENU_EDGE
  const spaceAbove = triggerRect.top - FLOATING_MENU_GAP - FLOATING_MENU_EDGE
  // 内容装得下就按内容高度，装不下才比上下两侧哪边更宽裕。
  const contentHeight = menu.scrollHeight
  const openUp = spaceBelow < contentHeight && spaceAbove > spaceBelow && spaceAbove > FLOATING_MENU_MIN_HEIGHT
  const available = Math.max(FLOATING_MENU_MIN_HEIGHT, openUp ? spaceAbove : spaceBelow)
  menu.style.maxHeight = Math.round(Math.min(available, viewportHeight - FLOATING_MENU_EDGE * 2)) + 'px'
  const menuHeight = Math.min(menu.scrollHeight, available)
  const top = openUp ? triggerRect.top - FLOATING_MENU_GAP - menuHeight : triggerRect.bottom + FLOATING_MENU_GAP
  menu.style.top =
    Math.round(
      Math.min(
        Math.max(FLOATING_MENU_EDGE, top),
        Math.max(FLOATING_MENU_EDGE, viewportHeight - menuHeight - FLOATING_MENU_EDGE),
      ),
    ) + 'px'
}

const selectRecordsBySelect = new Map()
let openSelectRecord: any = null
function closeStudioSelect(recordToClose = openSelectRecord) {
  recordToClose &&
    (recordToClose.wrapper.classList.remove('open'),
    recordToClose.trigger.setAttribute('aria-expanded', 'false'),
    (recordToClose.menu.hidden = true),
    openSelectRecord === recordToClose && (openSelectRecord = null))
}
export function syncStudioSelect(selectElement: any) {
  const selectRecord = selectRecordsBySelect.get(selectElement)
  if (!selectRecord) return
  const selectedOptionElement =
    selectElement.selectedOptions?.[0] || selectElement.options[selectElement.selectedIndex] || selectElement.options[0]
  ;(selectRecord.trigger.textContent = selectedOptionElement?.textContent || '请选择'),
    (selectRecord.trigger.disabled = selectElement.disabled),
    selectRecord.trigger.setAttribute('aria-disabled', String(selectElement.disabled)),
    selectRecord.menu.replaceChildren(
      ...[...selectElement.options].map((optionElement) => {
        const optionButton = document.createElement('button')
        return (
          (optionButton.type = 'button'),
          (optionButton.className = 'studio-select-option'),
          (optionButton.textContent = optionElement.textContent),
          (optionButton.dataset.value = optionElement.value),
          (optionButton.disabled = optionElement.disabled),
          optionButton.setAttribute('role', 'option'),
          optionButton.setAttribute('aria-selected', String(optionElement.value === selectElement.value)),
          optionButton.classList.toggle('selected', optionElement.value === selectElement.value),
          optionButton.addEventListener('click', (optionClickEvent) => {
            optionClickEvent.preventDefault(),
              optionClickEvent.stopPropagation(),
              !optionElement.disabled &&
                ((selectElement.value = optionElement.value),
                syncStudioSelect(selectElement),
                closeStudioSelect(selectRecord),
                selectElement.dispatchEvent(
                  new Event('change', {
                    bubbles: true,
                  }),
                ),
                selectRecord.trigger.focus())
          }),
          optionButton
        )
      }),
    ),
    selectElement.disabled && closeStudioSelect(selectRecord)
}
export function enhanceStudioSelect(nativeSelectElement: any) {
  if (!nativeSelectElement || selectRecordsBySelect.has(nativeSelectElement)) return
  const wrapperElement = document.createElement('div')
  ;(wrapperElement.className = 'studio-select'),
    nativeSelectElement.before(wrapperElement),
    wrapperElement.append(nativeSelectElement),
    nativeSelectElement.classList.add('studio-native-select'),
    (nativeSelectElement.tabIndex = -1),
    nativeSelectElement.setAttribute('aria-hidden', 'true')
  const triggerButton = document.createElement('button')
  ;(triggerButton.type = 'button'),
    (triggerButton.className = 'studio-select-trigger'),
    triggerButton.setAttribute('aria-haspopup', 'listbox'),
    triggerButton.setAttribute('aria-expanded', 'false')
  const menuElement = document.createElement('div')
  ;(menuElement.className = 'studio-select-menu'),
    (menuElement.id = (nativeSelectElement.id || 'studio-select-' + (selectRecordsBySelect.size + 1)) + '-menu'),
    menuElement.setAttribute('role', 'listbox'),
    (menuElement.hidden = true),
    triggerButton.setAttribute('aria-controls', menuElement.id),
    wrapperElement.append(triggerButton),
    // `data-floating-menu` 的元素（预览标题行的风格选择器）菜单挂到 body：
    // 它所在容器是 overflow:hidden 的，菜单留在里面会被裁掉。
    nativeSelectElement.hasAttribute('data-floating-menu')
      ? (menuElement.classList.add('studio-select-floating-menu'), document.body.append(menuElement))
      : wrapperElement.append(menuElement)
  const selectComponent: {
    select: any
    wrapper: HTMLElement
    trigger: HTMLElement
    menu: HTMLElement
    [key: string]: any
  } = {
    select: nativeSelectElement,
    wrapper: wrapperElement,
    trigger: triggerButton,
    menu: menuElement,
  }
  selectRecordsBySelect.set(nativeSelectElement, selectComponent),
    triggerButton.addEventListener('click', (triggerClickEvent) => {
      if ((triggerClickEvent.preventDefault(), triggerClickEvent.stopPropagation(), !nativeSelectElement.disabled)) {
        if (openSelectRecord === selectComponent) {
          closeStudioSelect(selectComponent)
          return
        }
        closeStudioSelect(),
          syncStudioSelect(nativeSelectElement),
          wrapperElement.classList.add('open'),
          triggerButton.setAttribute('aria-expanded', 'true'),
          (menuElement.hidden = false),
          (openSelectRecord = selectComponent),
          // 浮动菜单要等 hidden=false 之后才有尺寸，定位必须放在这之后。
          menuElement.classList.contains('studio-select-floating-menu') &&
            layoutFloatingMenu(triggerButton, menuElement)
      }
    }),
    nativeSelectElement.addEventListener('change', () => syncStudioSelect(nativeSelectElement)),
    (selectComponent.observer = new MutationObserver(() => syncStudioSelect(nativeSelectElement))),
    selectComponent.observer.observe(nativeSelectElement, {
      childList: true,
      subtree: true,
      attributes: true,
    }),
    syncStudioSelect(nativeSelectElement)
}
function disposeStudioSelect(enhancedSelect: Element) {
  const boundSelectRecord = selectRecordsBySelect.get(enhancedSelect)
  if (!boundSelectRecord) return
  openSelectRecord === boundSelectRecord && closeStudioSelect(boundSelectRecord),
    boundSelectRecord.observer.disconnect(),
    // 浮动菜单挂在 body 上，不随 wrapper / 面板一起消失：不显式移除就会每次 boot 漏一个。
    boundSelectRecord.menu.parentElement === document.body && boundSelectRecord.menu.remove(),
    selectRecordsBySelect.delete(enhancedSelect)
}
export function disposeStudioSelects(rootElement: any) {
  for (const enhancedSelect of rootElement.querySelectorAll('select')) disposeStudioSelect(enhancedSelect)
}
/** 增强容器内的下拉框；返回的回收函数在容器已脱离文档后仍能释放登记表里的这批下拉框。 */
export function initializeStudioSelects(containerElement: any = document): () => void {
  const enhancedSelects: Element[] = [...containerElement.querySelectorAll('select')]
  for (const targetSelect of enhancedSelects) enhanceStudioSelect(targetSelect)
  const closeOnOutsidePointer = (pointerDownEvent: PointerEvent) => {
    const visibleSelectRecord = openSelectRecord
    if (!visibleSelectRecord) return
    const pointerTarget = pointerDownEvent.target
    /**
     * 浮动菜单被挂到 `document.body`，**不在 wrapper 里**：只判断 wrapper 会把「点菜单项」
     * 当成外部点击 —— 菜单在 pointerdown 阶段就被 `hidden`，随后的 pointerup / click 落到
     * body 上，选项的 click 处理器永远不执行，表现是「下拉能展开，点哪一项都没反应」。
     */
    if (!(pointerTarget instanceof Node)) return
    if (visibleSelectRecord.wrapper.contains(pointerTarget) || visibleSelectRecord.menu.contains(pointerTarget)) return
    closeStudioSelect()
  }
  const closeOnEscape = (keyDownEvent: KeyboardEvent) => {
    if (keyDownEvent.key !== 'Escape' || !openSelectRecord) return
    keyDownEvent.preventDefault(), keyDownEvent.stopPropagation()
    const openTriggerButton = openSelectRecord.trigger
    closeStudioSelect(), openTriggerButton.focus()
  }
  /** 视口变了就按新触发器位置重排浮动菜单（菜单在 body 上，不会跟着布局自己动）。 */
  const relayoutFloatingMenu = () => {
    const visibleSelectRecord = openSelectRecord
    visibleSelectRecord?.menu.classList.contains('studio-select-floating-menu') &&
      layoutFloatingMenu(visibleSelectRecord.trigger, visibleSelectRecord.menu)
  }
  const ownerWindow = (containerElement as Document).defaultView ?? window
  containerElement.addEventListener('pointerdown', closeOnOutsidePointer)
  containerElement.addEventListener('keydown', closeOnEscape)
  ownerWindow.addEventListener('resize', relayoutFloatingMenu)
  return () => {
    containerElement.removeEventListener('pointerdown', closeOnOutsidePointer)
    containerElement.removeEventListener('keydown', closeOnEscape)
    ownerWindow.removeEventListener('resize', relayoutFloatingMenu)
    for (const enhancedSelect of enhancedSelects) disposeStudioSelect(enhancedSelect)
  }
}
function syncStepperButtons(numberInputElement: any, stepperButtons: any) {
  const isInputDisabled = numberInputElement.disabled || numberInputElement.readOnly
  for (const stepperButton of stepperButtons) stepperButton.disabled = isInputDisabled
  numberInputElement.closest('.number-stepper')?.classList.toggle('is-disabled', isInputDisabled)
}
function enhanceNumberInput(numberInput: any) {
  if (!numberInput || numberInput.closest('.number-stepper')) return
  const stepperElement = document.createElement('span')
  ;(stepperElement.className = 'number-stepper'), numberInput.before(stepperElement), stepperElement.append(numberInput)
  const buttonGroupElement = domElement(document, 'span', 'number-stepper-buttons')
  const stepperButtonConfigs = [
    {
      direction: 'up',
      label: '增加数值',
    },
    {
      direction: 'down',
      label: '减小数值',
    },
  ].map(({ direction: stepDirection, label: stepLabel }) => {
    const stepButton = document.createElement('button')
    ;(stepButton.type = 'button'),
      (stepButton.className = 'number-stepper-button number-stepper-' + stepDirection),
      stepButton.setAttribute('aria-label', stepLabel),
      (stepButton.title = stepLabel)
    // 自己做算术而不是 stepUp()/stepDown()：原生实现在「输入框被清空」「值越界」
    // 「step 非法」时会抛异常，之前直接 return false，用户点 ± 完全没反应。
    // 空值以 min（无 min 时 0）起算，结果夹在 [min, max] 内再格式化回输入框。
    const performStep = () => {
      if (numberInput.disabled || numberInput.readOnly) return false
      const previousInputValue = numberInput.value
      try {
        const minimumValue = numberInput.min === '' ? -Infinity : Number(numberInput.min),
          maximumValue = numberInput.max === '' ? Infinity : Number(numberInput.max),
          currentValue =
            numberInput.value === ''
              ? Number.isFinite(minimumValue)
                ? minimumValue
                : 0
              : numberEditValue(numberInput),
          nextValue = steppedNumber(
            currentValue,
            Number(numberInput.step) || 1,
            stepDirection === 'up' ? 1 : -1,
            minimumValue,
            maximumValue,
          )
        if (nextValue === null) return false
        ;(numberInput.value = editNumberText(nextValue)), rememberNumberValue(numberInput, nextValue)
      } catch {
        return false
      }
      return numberInput.value === previousInputValue
        ? false
        : (numberInput.dispatchEvent(
            new Event('input', {
              bubbles: true,
            }),
          ),
          true)
    }
    return (
      stepButton.addEventListener('click', (buttonClickEvent) => {
        buttonClickEvent.preventDefault(), buttonClickEvent.stopPropagation()
      }),
      stepButton.addEventListener('pointerdown', (buttonPointerDownEvent) => {
        if (buttonPointerDownEvent.button !== 0 || numberInput.disabled || numberInput.readOnly) return
        buttonPointerDownEvent.preventDefault(),
          buttonPointerDownEvent.stopPropagation(),
          numberInput.focus({
            preventScroll: true,
          })
        let hasValueChanged = performStep(),
          isReleaseHandled = false,
          repeatTimerId = window.setTimeout(() => {
            repeatTimerId = window.setInterval(() => {
              hasValueChanged = performStep() || hasValueChanged
            }, 55)
          }, 320)
        const handlePointerRelease = () => {
          isReleaseHandled ||
            ((isReleaseHandled = true),
            window.clearTimeout(repeatTimerId),
            window.clearInterval(repeatTimerId),
            stepButton.removeEventListener('pointerup', handlePointerRelease),
            stepButton.removeEventListener('pointercancel', handlePointerRelease),
            stepButton.removeEventListener('lostpointercapture', handlePointerRelease),
            hasValueChanged &&
              numberInput.dispatchEvent(
                new Event('change', {
                  bubbles: true,
                }),
              ))
        }
        stepButton.addEventListener('pointerup', handlePointerRelease),
          stepButton.addEventListener('pointercancel', handlePointerRelease),
          stepButton.addEventListener('lostpointercapture', handlePointerRelease)
        try {
          stepButton.setPointerCapture(buttonPointerDownEvent.pointerId)
        } catch {
          /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */
        }
      }),
      buttonGroupElement.append(stepButton),
      stepButton
    )
  })
  stepperElement.append(buttonGroupElement),
    new MutationObserver(() => syncStepperButtons(numberInput, stepperButtonConfigs)).observe(numberInput, {
      attributes: true,
      attributeFilter: ['disabled', 'readonly'],
    }),
    syncStepperButtons(numberInput, stepperButtonConfigs)
}
/** 扫描并增强容器内的数字输入框； */
export function initializeNumberInputs(searchRootElement: ParentNode = document) {
  for (const targetNumberInput of searchRootElement.querySelectorAll('input[type="number"]'))
    enhanceNumberInput(targetNumberInput)
}
