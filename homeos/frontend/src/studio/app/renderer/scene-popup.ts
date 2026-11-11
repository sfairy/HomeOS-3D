/**
 * 情景弹窗（0.8.4）：一个 `scene-mode` 控件可以携带一组「情景条目」，
 * 点击后弹出 6 条/页的网格。每条复用 `bindSceneMode`，因此指令、去重与状态文案
 * 与页面上的情景控件完全一致。
 */
import { bindSceneMode, createSceneActionRequests } from './scene-mode'
import { SCENE_POPUP_LAYOUT, scenePopupActionKey, scenePopupPage, scenePopupTitle } from './scene-popup-model'
import { clampNumber as clampNumberCore, finiteNumberOrCoerced } from '../shared/util/number'

const clampNumber = (value: any, fallback: number, min: number, max: number) =>
    clampNumberCore(finiteNumberOrCoerced(value, fallback), min, max),
  normalizeColor = (value: any, fallback: string) =>
    /^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(String(value || '')) ? value : fallback

export function createScenePopupView({
  component: sceneComponent,
  context: popupContext = {},
  sceneStyle = 'default',
  editable = false,
  selectedId = '',
  page: initialPage = 0,
  onSelect = null,
  onPageChange = () => {},
  onClose = null,
  document: popupDocument = document,
}: any) {
  const createPopupElement = (tagName: string, className = '', textContent = '') => {
      const element = popupDocument.createElement(tagName)
      return ((element.className = className), (element.textContent = textContent), element)
    },
    createPopupButton = (className: string, ariaLabel: string) => {
      const button = createPopupElement('button', className)
      return ((button.type = 'button'), button.setAttribute('aria-label', ariaLabel), button)
    },
    popupCard = createPopupElement('section', 'hb-scene-popup-card')
  ;(popupCard.dataset.sceneTheme = sceneStyle),
    popupCard.setAttribute('aria-label', '情景模式弹窗'),
    (popupCard.style.width = SCENE_POPUP_LAYOUT.width + 'px'),
    (popupCard.style.height = SCENE_POPUP_LAYOUT.height + 'px')
  const popupHeading = createPopupElement('header', 'hb-scene-popup-heading'),
    popupHeadingBox = createPopupElement('div')
  if (
    (popupHeadingBox.append(
      createPopupElement('h2', '', scenePopupTitle(sceneComponent)),
      createPopupElement('p', '', scenePopupPage(sceneComponent).all.length + ' 个情景'),
    ),
    popupHeading.append(popupHeadingBox),
    onClose)
  ) {
    const closeButton = createPopupButton('hb-scene-popup-close', '关闭情景弹窗')
    ;(closeButton.textContent = '×'), closeButton.addEventListener('click', onClose), popupHeading.append(closeButton)
  }
  const popupGrid = createPopupElement('div', 'hb-scene-popup-grid'),
    popupFooter = createPopupElement('footer', 'hb-scene-popup-footer'),
    previousButton = createPopupButton('hb-scene-popup-previous', '上一页情景'),
    nextButton = createPopupButton('hb-scene-popup-next', '下一页情景')
  previousButton.append(createPopupElement('span', 'hb-scene-popup-chevron previous')),
    nextButton.append(createPopupElement('span', 'hb-scene-popup-chevron next'))
  const popupPageLabel = createPopupElement('span', 'hb-scene-popup-page')
  popupPageLabel.setAttribute('aria-live', 'polite'),
    popupFooter.append(previousButton, popupPageLabel, nextButton),
    popupCard.append(popupHeading, popupGrid, popupFooter)
  let currentPage = initialPage,
    isDisposed = false
  const sceneActionRequests = popupContext.sceneActionRequests || createSceneActionRequests(),
    controllersByEntityId = new Map<string, any[]>(),
    cleanupCallbacks: Array<() => void> = [],
    disposeTiles = () => {
      for (const cleanupCallback of cleanupCallbacks.splice(0)) cleanupCallback()
      controllersByEntityId.clear()
    }
  function renderPopupPage() {
    if (isDisposed) return
    disposeTiles(), popupGrid.replaceChildren()
    const pageData = scenePopupPage(sceneComponent, currentPage)
    ;(currentPage = pageData.page),
      (previousButton.disabled = currentPage === 0),
      (nextButton.disabled = currentPage === pageData.pages - 1),
      (popupPageLabel.textContent = currentPage + 1 + ' / ' + pageData.pages),
      pageData.all.length || popupGrid.append(createPopupElement('p', 'hb-scene-popup-empty', '尚未添加情景'))
    for (const popupItem of pageData.items) {
      const popupProperties = popupItem.properties,
        tileElement = createPopupButton('hb-scene-popup-tile', popupProperties.mainText || '情景')
      ;(tileElement.dataset.sceneItemId = popupItem.id),
        tileElement.classList.toggle('is-selected', editable && selectedId === popupItem.id),
        tileElement.style.setProperty('--scene-main-size', clampNumber(popupProperties.mainSize, 17, 1, 500) + 'px'),
        tileElement.style.setProperty(
          '--scene-secondary-size',
          clampNumber(popupProperties.secondarySize, 12, 1, 500) + 'px',
        ),
        tileElement.style.setProperty('--scene-icon-size', clampNumber(popupProperties.iconSize, 28, 1, 500) + 'px'),
        tileElement.style.setProperty(
          '--scene-main-spacing',
          clampNumber(popupProperties.mainSpacing, 0, -20, 100) + 'px',
        ),
        tileElement.style.setProperty(
          '--scene-secondary-spacing',
          clampNumber(popupProperties.secondarySpacing, 0, -20, 100) + 'px',
        )
      for (const [colorKey, colorVariable] of [
        ['mainColor', '--scene-main-color'],
        ['secondaryColor', '--scene-secondary-color'],
        ['iconColor', '--scene-icon-color'],
      ]) {
        const colorValue = normalizeColor((popupProperties as any)[colorKey], '')
        colorValue && tileElement.style.setProperty(colorVariable, colorValue)
      }
      if (popupProperties.icon) {
        const iconSlug = String(popupProperties.icon).replace(/^mdi:/, '')
        if (/^[a-z0-9-]+$/.test(iconSlug)) {
          const iconBox = createPopupElement('span', 'hb-scene-popup-icon'),
            iconGlyph = createPopupElement('i', 'hb-scene-popup-glyph')
          iconGlyph.setAttribute('aria-hidden', 'true')
          const maskUrl = 'url("/bridge-static/vendor/mdi/7.4.47/svg/' + iconSlug + '.svg")'
          ;(iconGlyph.style.maskImage = maskUrl),
            ((iconGlyph.style as any).webkitMaskImage = maskUrl),
            iconBox.append(iconGlyph),
            tileElement.append(iconBox)
        }
      }
      const statusElement = createPopupElement('span', 'hb-scene-popup-status')
      statusElement.setAttribute('aria-live', 'polite')
      tileElement.append(statusElement)
      const copyElement = createPopupElement('span', 'hb-scene-popup-copy'),
        mainTextElement = createPopupElement('strong', '', popupProperties.mainText || '未命名情景'),
        secondaryTextElement = createPopupElement('small', '', popupProperties.secondaryText || '')
      ;(mainTextElement.style.webkitTextStroke = clampNumber(popupProperties.mainWeight, 0, 0, 3) + 'px currentColor'),
        (secondaryTextElement.style.webkitTextStroke =
          clampNumber(popupProperties.secondaryWeight, 0, 0, 3) + 'px currentColor'),
        copyElement.append(mainTextElement, secondaryTextElement),
        tileElement.append(copyElement),
        popupGrid.append(tileElement)
      const popupEntityId = popupItem.bindings?.entity?.entityId || '',
        sceneModeController = bindSceneMode(tileElement, tileElement, popupItem, {
          ...popupContext,
          editable,
          previewState: 'auto',
          cleanup: (cleanupCallback: () => void) => cleanupCallbacks.push(cleanupCallback),
          sceneActionRequests,
          sceneActionKey: scenePopupActionKey(sceneComponent, popupItem, popupContext.sceneActionScope),
          onSceneStateChange({
            state: tileState,
            pending: isPending,
            flash: isFlashing,
            errorMessage: tileErrorMessage,
          }: any) {
            editable && onSelect && (tileElement.setAttribute('aria-disabled', 'false'), (tileElement.tabIndex = 0)),
              tileElement.classList.toggle('is-flashing', isFlashing),
              tileElement.classList.toggle('is-pending', isPending),
              statusElement.classList.toggle('is-switch', !tileState.momentary),
              (statusElement.textContent = tileErrorMessage
                ? '执行失败'
                : isPending
                  ? '执行中'
                  : tileState.momentary
                    ? isFlashing
                      ? '✓ 已执行'
                      : ''
                    : tileState.available
                      ? tileState.active
                        ? '已开启'
                        : '已关闭'
                      : '不可用'),
              tileElement.setAttribute(
                'aria-label',
                '' +
                  (popupProperties.mainText || '未命名情景') +
                  (statusElement.textContent ? '，' + statusElement.textContent : ''),
              )
          },
        })
      controllersByEntityId.has(popupEntityId) || controllersByEntityId.set(popupEntityId, []),
        controllersByEntityId.get(popupEntityId)!.push(sceneModeController),
        editable && onSelect && tileElement.addEventListener('click', () => onSelect(popupItem.id))
    }
  }
  const changePage = (pageDelta: number) => {
    currentPage += pageDelta
    renderPopupPage()
    onPageChange(currentPage, scenePopupPage(sceneComponent, currentPage).items[0]?.id)
  }
  return (
    previousButton.addEventListener('click', () => changePage(-1)),
    nextButton.addEventListener('click', () => changePage(1)),
    popupCard.addEventListener('click', (clickEvent: any) => clickEvent.stopPropagation()),
    renderPopupPage(),
    {
      card: popupCard,
      get page() {
        return currentPage
      },
      syncState(entityId: string, nextState: any) {
        for (const sceneModeController of controllersByEntityId.get(entityId) || [])
          sceneModeController.update(nextState)
      },
      dispose() {
        isDisposed ||
          ((isDisposed = true),
          disposeTiles(),
          popupContext.sceneActionRequests || sceneActionRequests.dispose(),
          popupCard.remove())
      },
    }
  )
}
