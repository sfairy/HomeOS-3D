/**
 * 情景弹窗编辑器（0.8.4 `scene-popup-editor`）。
 *
 * 一个 `scene-mode` 控件开启「弹窗模式」后，用它编辑 `properties.popupItems`：
 * 左侧情景列表（增删、上下移动）、中间实时预览、右侧属性面板。
 *
 * 与上游一致，本模块只负责 DOM 与交互，所有写操作都通过宿主 `change()` 回到文档，
 * 因此撤销/重做与保存沿用编辑器既有的历史栈（不另建一份状态）。
 */
import { createScenePopupView } from '../renderer/scene-popup'
import {
  SCENE_POPUP_LAYOUT,
  createScenePopupItem,
  scenePopupEnabled,
  scenePopupItems,
  scenePopupTitle,
} from '../renderer/scene-popup-model'
import { resolveSceneControlMode } from '../renderer/scene-mode'
import { randomUuid } from '../shared/util/random-id'

/** 可编辑属性：`[键, 标签, 控件类型, min?, max?, step?]`。 */
const SCENE_PROPERTY_FIELDS: ReadonlyArray<readonly [string, string, string, number?, number?, number?]> = [
  ['mainText', '主文字', 'text'],
  ['mainColor', '颜色', 'color'],
  ['mainSize', '大小', 'number', 1, 500],
  ['mainWeight', '笔画粗细', 'number', 0, 3, 0.1],
  ['mainSpacing', '字间距', 'number', -20, 100, 0.1],
  ['secondaryText', '副文字', 'text'],
  ['secondaryColor', '颜色', 'color'],
  ['secondarySize', '大小', 'number', 1, 500],
  ['secondaryWeight', '笔画粗细', 'number', 0, 3, 0.1],
  ['secondarySpacing', '字间距', 'number', -20, 100, 0.1],
]

const SCENE_POPUP_FORM_DEFAULTS = createScenePopupItem('form-defaults').properties as any

const escapeHtml = (value: any) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      (
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }) as Record<string, string>
      )[character],
  )

interface ScenePopupEditorStatus {
  dirty: boolean
  canSave: boolean
  canUndo: boolean
  canRedo: boolean
}

interface ScenePopupEditorHost {
  /** 编辑器根容器（通常是 `<main>`）。挂载时会被加上 `hb-scene-popup-editor-host`。 */
  host: HTMLElement
  /** 当前正在编辑的控件；关闭或切换控件后返回 `null`，编辑器会自动停写。 */
  getOwner(): any
  /** 运行期实体状态表，用于预览里的开关/可用状态。 */
  states(): Map<string, any>
  /** 页面主题（`default` / `warm-wood`），决定属性默认色。 */
  sceneStyle(): string
  entityName(entityId?: string): string
  enhance?(container: HTMLElement): void
  syncControls?(container: HTMLElement): void
  status(): ScenePopupEditorStatus
  change(mutator: (owner: any) => void): Promise<any>
  undo(): Promise<any>
  redo(): Promise<any>
  save(): Promise<any>
  preview(): void
  pickEntity(triggerButton: HTMLElement, popupItem: any, onPick: (entityId: string) => void): void
  pickIcon(triggerButton: HTMLElement, popupItem: any, onPick: (icon: string) => void): void
  onError?(error: any): void
  onClose?(): void
  document?: Document
}

export function createScenePopupEditor(scenePopupEditorHost: ScenePopupEditorHost) {
  const editorDocument = scenePopupEditorHost.document || document
  const editorRoot = editorDocument.createElement('section')
  editorRoot.className = 'hb-scene-popup-editor'
  editorRoot.setAttribute('aria-label', '情景弹窗设置')
  editorRoot.innerHTML =
    '<header class="hb-scene-popup-editor-header"><button type="button" data-scene-edit-action="back">← 返回控件属性</button><h2>情景弹窗设置</h2><span data-scene-editor-status></span><button type="button" data-scene-edit-action="undo" aria-label="撤销">撤销</button><button type="button" data-scene-edit-action="redo" aria-label="重做">重做</button><button type="button" data-scene-edit-action="preview">预览弹窗</button><button type="button" class="primary" data-scene-edit-action="save">保存</button></header>' +
    '<div class="hb-scene-popup-editor-layout"><aside class="hb-scene-popup-editor-list"><div class="hb-scene-popup-list-heading"><h3>情景列表</h3><span data-scene-count></span></div><div data-scene-items></div><button type="button" data-scene-edit-action="add">＋ 添加情景</button><div class="hb-scene-popup-list-actions"><button type="button" data-scene-edit-action="up" aria-label="上移情景">↑</button><button type="button" data-scene-edit-action="down" aria-label="下移情景">↓</button><button type="button" data-scene-edit-action="remove">删除</button></div></aside><main class="hb-scene-popup-editor-preview"><span>弹窗预览</span><div class="hb-scene-popup-editor-stage"></div></main><aside class="hb-scene-popup-editor-properties" aria-label="情景项属性"></aside></div>'

  const sceneItemListElement = editorRoot.querySelector<HTMLElement>('[data-scene-items]')!
  const scenePropertiesElement = editorRoot.querySelector<HTMLElement>('.hb-scene-popup-editor-properties')!
  scenePropertiesElement.classList.add('inspector-form')
  const sceneStageElement = editorRoot.querySelector<HTMLElement>('.hb-scene-popup-editor-stage')!

  let selectedItemId = scenePopupItems(scenePopupEditorHost.getOwner())[0]?.id || ''
  let currentPage = 0
  let popupPreviewView: any = null
  let isClosed = false
  let draftOwner: any = null
  const lastWrittenValues: Record<string, string> = {}
  let lastPopupTitle = ''

  const getOwner = () => scenePopupEditorHost.getOwner()
  const findSelectedItem = () => scenePopupItems(getOwner()).find((popupItem: any) => popupItem.id === selectedItemId)
  const findActionButton = (action: string) =>
    editorRoot.querySelector<HTMLButtonElement>('[data-scene-edit-action="' + action + '"]')!
  const reportError = (error: any) => scenePopupEditorHost.onError?.(error)
  const commitChange = (mutator: (owner: any) => void): Promise<any> =>
    Promise.resolve(scenePopupEditorHost.change(mutator))
      .then(() => {
        draftOwner = null
        isClosed || refreshEditor()
      })
      .catch(reportError)

  /** 预览卡片按容器尺寸等比缩放，避免 420×442 的固定版式溢出错位。 */
  function fitPopupPreviewScale() {
    if (!popupPreviewView || !sceneStageElement.clientWidth || !sceneStageElement.clientHeight) return
    const popupScale = Math.min(
      1.6,
      Math.max(
        0.08,
        (sceneStageElement.clientWidth - 32) / SCENE_POPUP_LAYOUT.width,
        (sceneStageElement.clientHeight - 32) / SCENE_POPUP_LAYOUT.height,
      ),
    )
    popupPreviewView.card.style.transform = 'translate(-50%,-50%) scale(' + popupScale + ')'
    popupPreviewView.card.style.setProperty('--hb-scene-popup-scale', String(popupScale))
  }

  /** 重建中间预览（选中项与页码变化时调用）。 */
  function renderPopupPreview(owner = getOwner()) {
    popupPreviewView?.dispose()
    popupPreviewView = createScenePopupView({
      component: owner,
      editable: true,
      selectedId: selectedItemId,
      page: currentPage,
      context: { states: scenePopupEditorHost.states() },
      sceneStyle: scenePopupEditorHost.sceneStyle(),
      onSelect: (pickedItemId: string) => {
        selectedItemId = pickedItemId
        draftOwner = null
        refreshEditor()
      },
      onPageChange: (pickedPage: number, firstItemId: string) => {
        currentPage = pickedPage
        firstItemId && (selectedItemId = firstItemId)
        draftOwner = null
        refreshEditor()
      },
    })
    sceneStageElement.append(popupPreviewView.card)
    fitPopupPreviewScale()
  }

  /** 属性默认值随主题走：暗色主题给浅色描边，暖木主题给深色描边。 */
  function defaultColorFor(propertyKey: string, _controlType: string, warmWood: boolean) {
    if (propertyKey === 'secondaryColor') return warmWood ? '#777a70' : '#85929b'
    if (propertyKey === 'iconColor') return warmWood ? '#74796b' : '#c5cfd6'
    return warmWood ? '#3d3b35' : '#f4f5f6'
  }

  function propertyValue(popupItem: any, propertyKey: string, controlType: string) {
    const warmWood = scenePopupEditorHost.sceneStyle() === 'warm-wood'
    const fallback = defaultColorFor(propertyKey, controlType, warmWood)
    const rawValue = popupItem.properties[propertyKey] ?? (SCENE_POPUP_FORM_DEFAULTS as any)[propertyKey]
    return String(controlType === 'color' ? rawValue || fallback : String(rawValue ?? ''))
  }

  const propertyFieldHtml = (
    popupItem: any,
    [propertyKey, propertyLabel, controlType, minimum, maximum, step]: readonly [
      string,
      string,
      string,
      number?,
      number?,
      number?,
    ],
  ) =>
    '<label class="' +
    (controlType === 'text' ? 'wide' : '') +
    '">' +
    propertyLabel +
    '<input type="' +
    controlType +
    '" data-scene-property="' +
    propertyKey +
    '" value="' +
    escapeHtml(propertyValue(popupItem, propertyKey, controlType)) +
    '" ' +
    (controlType === 'number'
      ? 'min="' + minimum + '" max="' + maximum + '" step="' + (step || 1) + '"'
      : controlType === 'text'
        ? 'maxlength="128"'
        : '') +
    '></label>'

  /** 只刷新值、不重建 DOM，避免编辑时输入框失焦。 */
  function syncPropertyValues(owner: any, popupItem: any) {
    const nextTitle = owner.properties.popupTitle ?? scenePopupTitle(owner)
    if (nextTitle !== lastPopupTitle) {
      const titleInput = scenePropertiesElement.querySelector<HTMLInputElement>('[data-scene-popup-title]')
      titleInput && (titleInput.value = nextTitle)
    }
    lastPopupTitle = nextTitle
    for (const fieldElement of scenePropertiesElement.querySelectorAll<HTMLInputElement>('[data-scene-property]')) {
      const propertyKey = fieldElement.dataset.sceneProperty!
      const nextValue = propertyValue(popupItem, propertyKey, fieldElement.type)
      lastWrittenValues[propertyKey] !== nextValue && (fieldElement.value = nextValue)
      lastWrittenValues[propertyKey] = nextValue
    }
    ;(scenePropertiesElement.querySelector('h2')! as HTMLElement).textContent =
      popupItem.properties.mainText || '未命名情景'
    ;(scenePropertiesElement.querySelector('[data-scene-edit-action="entity"]')! as HTMLElement).textContent =
      scenePopupEditorHost.entityName(popupItem.bindings?.entity?.entityId) || '不使用实体'
    ;(scenePropertiesElement.querySelector('[data-scene-edit-action="icon"]')! as HTMLElement).textContent =
      popupItem.properties.icon || '不使用图标'
    const resolvedMode = resolveSceneControlMode(
      popupItem.properties.controlMode,
      popupItem.bindings?.entity?.entityId || '',
    )
    for (const modeButton of scenePropertiesElement.querySelectorAll<HTMLElement>('[data-scene-mode]')) {
      const isActive = modeButton.dataset.sceneMode === resolvedMode
      modeButton.classList.toggle('active', isActive), modeButton.setAttribute('aria-pressed', String(isActive))
    }
    ;(scenePropertiesElement.querySelector('.scene-mode-hint')! as HTMLElement).textContent =
      resolvedMode === 'switch' ? '点击切换，状态跟随设备。' : '点击执行，短暂反馈后恢复。'
    scenePopupEditorHost.syncControls?.(scenePropertiesElement)
  }

  /** 渲染右侧属性面板；同一项的重复调用只同步值。 */
  function renderProperties(owner: any, popupItem: any) {
    if (popupItem && scenePropertiesElement.dataset.scenePropertyItem === popupItem.id) {
      syncPropertyValues(owner, popupItem)
      return
    }
    const focusedElement = scenePropertiesElement.querySelector(':focus') as HTMLInputElement | null
    const focusedProperty = focusedElement?.dataset?.sceneProperty
    const savedSelection =
      focusedElement?.type === 'text' ? [focusedElement.selectionStart, focusedElement.selectionEnd] : null
    scenePropertiesElement.innerHTML =
      '<label class="hb-scene-popup-title-field">弹窗标题<input data-scene-popup-title maxlength="128" value="' +
      escapeHtml(owner.properties.popupTitle ?? scenePopupTitle(owner)) +
      '"></label>'
    scenePropertiesElement.dataset.scenePropertyItem = popupItem?.id || ''
    for (const key of Object.keys(lastWrittenValues)) delete lastWrittenValues[key]
    lastPopupTitle = owner.properties.popupTitle ?? scenePopupTitle(owner)
    if (!popupItem) {
      scenePropertiesElement.insertAdjacentHTML(
        'beforeend',
        '<p class="hb-scene-popup-editor-empty">添加情景后，在这里设置其属性。</p>',
      )
      return
    }
    const resolvedMode = resolveSceneControlMode(
      popupItem.properties.controlMode,
      popupItem.bindings?.entity?.entityId || '',
    )
    scenePropertiesElement.insertAdjacentHTML(
      'beforeend',
      '<h2>' +
        escapeHtml(popupItem.properties.mainText || '未命名情景') +
        '</h2><section class="inspector-section"><h3>基础</h3><label>备注<input data-scene-property="label" value="' +
        escapeHtml(popupItem.properties.label) +
        '" maxlength="128"></label><label>绑定实体<button type="button" class="inspector-picker-button" data-scene-edit-action="entity">' +
        escapeHtml(scenePopupEditorHost.entityName(popupItem.bindings?.entity?.entityId) || '不使用实体') +
        '</button></label></section>' +
        '<section class="inspector-section"><h3>控制模式</h3><div class="navigation-segmented-options" role="group" aria-label="控制模式">' +
        '<button type="button" data-scene-mode="switch" aria-pressed="' +
        String(resolvedMode === 'switch') +
        '" class="' +
        (resolvedMode === 'switch' ? 'active' : '') +
        '">开关模式</button>' +
        '<button type="button" data-scene-mode="scene" aria-pressed="' +
        String(resolvedMode !== 'switch') +
        '" class="' +
        (resolvedMode !== 'switch' ? 'active' : '') +
        '">情景模式</button></div>' +
        '<p class="scene-mode-hint">' +
        (resolvedMode === 'switch' ? '点击切换，状态跟随设备。' : '点击执行，短暂反馈后恢复。') +
        '</p><label>触发动画<select data-scene-property="activationAnimation"><option value="spring" ' +
        (popupItem.properties.activationAnimation !== 'none' ? 'selected' : '') +
        '>轻弹</option><option value="none" ' +
        (popupItem.properties.activationAnimation === 'none' ? 'selected' : '') +
        '>无</option></select></label></section>' +
        '<section class="inspector-section"><h3>文字</h3><div class="inspector-grid two-columns">' +
        SCENE_PROPERTY_FIELDS.map((fieldDefinition) => propertyFieldHtml(popupItem, fieldDefinition)).join('') +
        '</div></section><section class="inspector-section"><h3>图标</h3><label>选择 MDI 图标<button type="button" class="inspector-picker-button" data-scene-edit-action="icon">' +
        escapeHtml(popupItem.properties.icon || '不使用图标') +
        '</button></label><div class="inspector-grid two-columns">' +
        propertyFieldHtml(popupItem, ['iconColor', '颜色', 'color']) +
        propertyFieldHtml(popupItem, ['iconSize', '大小', 'number', 1, 500]) +
        '</div></section>',
    )
    scenePopupEditorHost.enhance?.(scenePropertiesElement)
    syncPropertyValues(owner, popupItem)
    if (focusedProperty) {
      const nextFocusElement = scenePropertiesElement.querySelector<HTMLInputElement>(
        '[data-scene-property="' + focusedProperty + '"]',
      )
      nextFocusElement?.focus({ preventScroll: true })
      nextFocusElement?.type === 'text' &&
        savedSelection &&
        nextFocusElement.setSelectionRange(savedSelection[0] ?? 0, savedSelection[1] ?? 0)
    }
  }

  function refreshToolbar() {
    if (isClosed) return
    const toolbarStatus = scenePopupEditorHost.status()
    editorRoot.querySelector<HTMLElement>('[data-scene-editor-status]')!.textContent = toolbarStatus.dirty
      ? '未保存'
      : '已保存'
    ;(findActionButton('undo').disabled = !toolbarStatus.canUndo),
      (findActionButton('redo').disabled = !toolbarStatus.canRedo),
      (findActionButton('save').disabled = !toolbarStatus.canSave)
  }

  /** 全量刷新：校验归属、修正选中项、重排列表、重画预览与属性面板。 */
  function refreshEditor() {
    if (isClosed) return
    const owner = getOwner()
    if (!owner || !scenePopupEnabled(owner)) {
      closeEditor()
      return
    }
    const popupItems = scenePopupItems(owner)
    popupItems.some((popupItem: any) => popupItem.id === selectedItemId) || (selectedItemId = popupItems[0]?.id || '')
    const selectedIndex = popupItems.findIndex((popupItem: any) => popupItem.id === selectedItemId)
    currentPage = Math.max(0, Math.floor(selectedIndex / SCENE_POPUP_LAYOUT.pageSize))
    editorRoot.querySelector<HTMLElement>('[data-scene-count]')!.textContent = popupItems.length + ' 项'
    sceneItemListElement.replaceChildren()
    for (const popupItem of popupItems) {
      const listItemElement = editorDocument.createElement('button')
      ;(listItemElement.type = 'button'),
        (listItemElement.dataset.sceneSelect = popupItem.id),
        (listItemElement.className = 'hb-scene-popup-list-item'),
        listItemElement.setAttribute('aria-pressed', String(popupItem.id === selectedItemId)),
        (listItemElement.textContent = popupItem.properties.mainText || '未命名情景')
      sceneItemListElement.append(listItemElement)
    }
    ;(findActionButton('add').disabled = popupItems.length >= SCENE_POPUP_LAYOUT.maxItems),
      (findActionButton('up').disabled = selectedIndex <= 0),
      (findActionButton('down').disabled = selectedIndex < 0 || selectedIndex === popupItems.length - 1),
      (findActionButton('remove').disabled = selectedIndex < 0)
    renderProperties(owner, popupItems[selectedIndex])
    renderPopupPreview(draftOwner || owner)
    refreshToolbar()
  }

  function closeEditor() {
    if (isClosed) return
    isClosed = true
    resizeObserver.disconnect()
    popupPreviewView?.dispose()
    editorRoot.remove()
    scenePopupEditorHost.host.classList.remove('hb-scene-popup-editor-host')
    scenePopupEditorHost.onClose?.()
  }

  editorRoot.addEventListener('click', (clickEvent: any) => {
    clickEvent.stopPropagation()
    const clickedItem = clickEvent.target.closest('[data-scene-select]')
    if (clickedItem) {
      selectedItemId = clickedItem.dataset.sceneSelect
      draftOwner = null
      refreshEditor()
      return
    }
    const clickedMode = clickEvent.target.closest('[data-scene-mode]')
    const clickedAction = clickEvent.target.closest('[data-scene-edit-action]')?.dataset.sceneEditAction
    const ownerIdAtClick = selectedItemId
    if (clickedMode) {
      commitChange((owner: any) => {
        const targetItem = scenePopupItems(owner).find((popupItem: any) => popupItem.id === ownerIdAtClick)
        targetItem && (targetItem.properties.controlMode = clickedMode.dataset.sceneMode)
      })
      return
    }
    if (!clickedAction) return
    if (clickedAction === 'back') {
      closeEditor()
      return
    }
    if (['undo', 'redo', 'save'].includes(clickedAction)) {
      Promise.resolve((scenePopupEditorHost as any)[clickedAction]())
        .then(() => refreshToolbar())
        .catch(reportError)
      return
    }
    if (clickedAction === 'preview') {
      scenePopupEditorHost.preview()
      return
    }
    if (clickedAction === 'entity' || clickedAction === 'icon') {
      const targetItem = findSelectedItem()
      if (!targetItem) return
      const triggerButton = clickEvent.target.closest('button')
      const pickHandler = (pickedValue: string) => {
        if (isClosed || selectedItemId !== ownerIdAtClick || !getOwner()) return
        commitChange((owner: any) => {
          const nextItem = scenePopupItems(owner).find((popupItem: any) => popupItem.id === ownerIdAtClick)
          if (!nextItem) return
          if (clickedAction === 'icon') nextItem.properties.icon = pickedValue
          else {
            ;(nextItem.bindings = { ...(nextItem.bindings || {}) }),
              pickedValue ? (nextItem.bindings.entity = { entityId: pickedValue }) : delete nextItem.bindings.entity
          }
        })
      }
      clickedAction === 'entity'
        ? scenePopupEditorHost.pickEntity(triggerButton, targetItem, pickHandler)
        : scenePopupEditorHost.pickIcon(triggerButton, targetItem, pickHandler)
      return
    }
    const newItem = clickedAction === 'add' ? createScenePopupItem('scene-' + randomUuid()) : null
    newItem && (selectedItemId = newItem.id)
    commitChange((owner: any) => {
      const popupItems = scenePopupItems(owner)
      const ownerIndex = popupItems.findIndex((popupItem: any) => popupItem.id === ownerIdAtClick)
      if (newItem && popupItems.length < SCENE_POPUP_LAYOUT.maxItems) popupItems.push(newItem)
      else if (clickedAction === 'remove' && ownerIndex >= 0) popupItems.splice(ownerIndex, 1)
      else if (['up', 'down'].includes(clickedAction)) {
        const targetIndex = ownerIndex + (clickedAction === 'up' ? -1 : 1)
        ownerIndex >= 0 &&
          targetIndex >= 0 &&
          targetIndex < popupItems.length &&
          ([popupItems[ownerIndex], popupItems[targetIndex]] = [popupItems[targetIndex], popupItems[ownerIndex]])
      }
      owner.properties.popupItems = popupItems
    })
  })

  /** number 输入按 min/max 夹取；其余原样返回。 */
  const coercedInputValue = (inputElement: any) =>
    inputElement.type === 'number'
      ? Math.max(Number(inputElement.min), Math.min(Number(inputElement.max), Number(inputElement.value) || 0))
      : inputElement.value

  editorRoot.addEventListener('input', (inputEvent: any) => {
    const inputElement = inputEvent.target
    const propertyKey = inputElement.dataset.sceneProperty
    if (!propertyKey || !getOwner()) return
    draftOwner = structuredClone(getOwner())
    const draftItem = scenePopupItems(draftOwner).find((popupItem: any) => popupItem.id === selectedItemId)
    draftItem && (draftItem.properties[propertyKey] = coercedInputValue(inputElement)), renderPopupPreview(draftOwner)
  })

  editorRoot.addEventListener('change', (changeEvent: any) => {
    const changeTarget = changeEvent.target
    const propertyKey = changeTarget.dataset.sceneProperty
    const ownerIdAtChange = selectedItemId
    if (changeTarget.hasAttribute('data-scene-popup-title')) {
      commitChange((owner: any) => {
        owner.properties.popupTitle = changeTarget.value
      })
      return
    }
    if (!propertyKey) return
    const nextValue = coercedInputValue(changeTarget)
    commitChange((owner: any) => {
      const targetItem = scenePopupItems(owner).find((popupItem: any) => popupItem.id === ownerIdAtChange)
      targetItem && (targetItem.properties[propertyKey] = nextValue)
    })
  })

  editorRoot.addEventListener('keydown', (keyboardEvent: any) => {
    keyboardEvent.stopPropagation(),
      keyboardEvent.key === 'Escape' &&
        (keyboardEvent.preventDefault(), (document.activeElement as any)?.blur?.(), closeEditor()),
      (keyboardEvent.metaKey || keyboardEvent.ctrlKey) &&
        keyboardEvent.key.toLowerCase() === 's' &&
        (keyboardEvent.preventDefault(),
        (document.activeElement as any)?.blur?.(),
        Promise.resolve(scenePopupEditorHost.save()).catch(reportError)),
      (keyboardEvent.metaKey || keyboardEvent.ctrlKey) &&
        keyboardEvent.key.toLowerCase() === 'z' &&
        !keyboardEvent.target.closest('input,textarea') &&
        (keyboardEvent.preventDefault(),
        Promise.resolve((scenePopupEditorHost as any)[keyboardEvent.shiftKey ? 'redo' : 'undo']()).catch(reportError))
  })

  const resizeObserver = new ResizeObserver(fitPopupPreviewScale)
  resizeObserver.observe(sceneStageElement)

  scenePopupEditorHost.host.classList.add('hb-scene-popup-editor-host')
  scenePopupEditorHost.host.append(editorRoot)
  refreshEditor()
  findActionButton('back').focus({ preventScroll: true })

  return {
    root: editorRoot,
    refresh: refreshEditor,
    refreshStatus: refreshToolbar,
    close: closeEditor,
    syncStates() {
      for (const sceneEntityId of new Set(
        scenePopupItems(getOwner())
          .map((popupItem: any) => popupItem.bindings?.entity?.entityId)
          .filter(Boolean),
      ))
        popupPreviewView?.syncState(
          sceneEntityId,
          scenePopupEditorHost.states().get(sceneEntityId) || { state: 'unavailable' },
        )
    },
    setPreviewing(isPreviewing: boolean) {
      // 只隐藏编辑器本体。宿主是 `<main class="editor-shell">`，预览弹窗挂在它的子节点
      // （`#editor-canvas` 的 dialog layer）里，跟着一起 `hidden` 会把弹窗本身也藏掉——
      // 0.8.4 的 `setPreviewing` 同样只切编辑器根节点。
      isClosed ||
        ((editorRoot.hidden = isPreviewing), isPreviewing || findActionButton('preview').focus({ preventScroll: true }))
    },
  }
}
