import { USER_IMAGE_HINT } from '../shared/user-image-upload'
import { domElement } from '@app/shared/util/dom-factory'

export function createEditorAssetMatcher({
  getImageSource: getImageSource,
  getImageFolder: getImageFolder,
  getIbeSource: getIbeSource,
  getIbeFolder: getIbeFolder,
  getUserAssets: getUserAssets,
  getBuiltinAssets: getBuiltinAssets,
}: any) {
  return function (kind: any, query = '') {
    const isImageKind = kind === 'image',
      source = isImageKind ? getImageSource() : getIbeSource(),
      folder = isImageKind ? getImageFolder() : getIbeFolder(),
      assets = source === 'user' ? getUserAssets() : getBuiltinAssets(),
      normalizedQuery = String(query || '')
        .trim()
        .toLocaleLowerCase('zh-CN')
    return assets.filter(
      (asset: any) =>
        (!normalizedQuery ||
          `${asset.name} ${asset.relativePath}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)) &&
        (!!normalizedQuery || asset.folder === folder),
    )
  }
}

/** 工具条只关心这几个字段；`user-image-upload` 的完整状态由上传模块持有。 */
interface AssetUploaderState {
  busy?: boolean
  /** 进度 / 结果摘要：「正在上传 2/5：a.png。关闭窗口后会继续上传。」 */
  message?: string
  error?: string
  refreshFailed?: boolean
}

function editorAssetFolders(assets: { folder?: string }[] = []) {
  return [...new Set((assets || []).map((asset) => asset.folder).filter(Boolean))].sort((folderName, otherFolderName) =>
    folderName!.localeCompare(otherFolderName!, 'zh-CN'),
  )
}
function editorAssetSelectedFolder(selectedFolderName: any, folders: any) {
  return folders.includes(selectedFolderName) ? selectedFolderName : folders[0] || ''
}
export function createEditorAssetToolbar({
  documentObject: ownerDocument,
  getSource: getSource,
  setSource: setSource,
  getFolder: getFolder,
  setFolder: setFolder,
  getAssets: getAssets,
  getUploadInput: getUploadInput,
  canDeleteFolder: canDeleteFolder,
  onDeleteFolder: onDeleteFolder,
  getUploaderState: getUploaderState,
  subscribeUploader: subscribeUploader,
  retryUploadRefresh: retryUploadRefresh,
}: any) {
  return function (state: any, { toolbar: toolbarElement, controller: controller }: any) {
    const sourceTabsElement = ownerDocument.createElement('div')
    ;(sourceTabsElement.className = 'asset-source-tabs'),
      sourceTabsElement.setAttribute('role', 'tablist'),
      sourceTabsElement.setAttribute('aria-label', '图片来源')
    for (const [sourceId, sourceLabel] of [
      ['user', '我的图片'],
      ['builtin', 'HomeOS素材'],
    ]) {
      const sourceTabButton = ownerDocument.createElement('button')
      ;(sourceTabButton.type = 'button'),
        (sourceTabButton.textContent = sourceLabel),
        (sourceTabButton.dataset.editorAssetSource = sourceId),
        sourceTabButton.addEventListener('click', () => {
          setSource(state, sourceId)
          const sourceFolders = editorAssetFolders(getAssets(sourceId))
          setFolder(state, editorAssetSelectedFolder(getFolder(state), sourceFolders)),
            controller.syncAssetToolbar?.(),
            controller.refresh({
              resetPage: true,
            })
        }),
        sourceTabsElement.append(sourceTabButton)
    }
    const folderSelectElement = ownerDocument.createElement('select')
    ;(folderSelectElement.className = 'editor-paged-picker-folder'),
      folderSelectElement.setAttribute('aria-label', '选择图片文件夹'),
      folderSelectElement.addEventListener('change', () => {
        setFolder(state, folderSelectElement.value),
          controller.syncAssetToolbar?.(),
          controller.refresh({
            resetPage: true,
          })
      })
    const deleteFolderButton = ownerDocument.createElement('button')
    ;(deleteFolderButton.type = 'button'),
      (deleteFolderButton.className = 'asset-folder-delete'),
      (deleteFolderButton.textContent = '删除'),
      deleteFolderButton.setAttribute('aria-label', '删除当前自动导图文件夹'),
      (deleteFolderButton.title = '删除当前自动导图文件夹'),
      deleteFolderButton.addEventListener('click', () => onDeleteFolder?.(state, folderSelectElement.value))
    const folderRowElement = ownerDocument.createElement('div')
    ;(folderRowElement.className = 'editor-paged-picker-folder-row'),
      folderRowElement.append(folderSelectElement, deleteFolderButton)
    const uploadButton = ownerDocument.createElement('button')
    ;(uploadButton.type = 'button'),
      (uploadButton.className = 'asset-upload-button'),
      (uploadButton.textContent = '上传'),
      uploadButton.setAttribute('title', USER_IMAGE_HINT),
      uploadButton.addEventListener('click', () => getUploadInput(state).click())
    // 上传口径与失败反馈统一来自 `user-image-upload`：提示语、busy 禁用、
    // 「图已传上去但目录没刷新」时的重试入口都在这里呈现。
    const uploadHintElement = ownerDocument.createElement('p')
    ;(uploadHintElement.className = 'asset-upload-hint'), (uploadHintElement.textContent = USER_IMAGE_HINT)
    const uploadStatusElement = ownerDocument.createElement('p')
    ;(uploadStatusElement.className = 'asset-upload-status'),
      uploadStatusElement.setAttribute('role', 'status'),
      (uploadStatusElement.hidden = true)
    const retryUploadButton = ownerDocument.createElement('button')
    ;(retryUploadButton.type = 'button'),
      (retryUploadButton.className = 'asset-upload-retry'),
      (retryUploadButton.textContent = '重试刷新'),
      retryUploadButton.addEventListener('click', () => {
        void retryUploadRefresh?.()
      }),
      (retryUploadButton.hidden = true)
    const syncUploaderState = (uploaderState: AssetUploaderState | null = getUploaderState?.()) => {
      // 进度与失败共用一行状态位：有错误时错误优先（用户此刻只需要知道为什么没传上），
      // 否则显示「正在上传 x/n…关闭窗口后会继续上传」这类过程信息。
      const uploaderStatusText = uploaderState?.error || uploaderState?.message || ''
      ;(uploadButton.disabled = Boolean(uploaderState?.busy)),
        (uploadStatusElement.hidden = !uploaderStatusText),
        (uploadStatusElement.textContent = uploaderStatusText),
        uploadStatusElement.classList.toggle('is-error', Boolean(uploaderState?.error)),
        (retryUploadButton.hidden = !uploaderState?.refreshFailed)
    }
    toolbarElement.append(
      sourceTabsElement,
      folderRowElement,
      uploadButton,
      uploadHintElement,
      uploadStatusElement,
      retryUploadButton,
    )
    controller.syncAssetToolbar = () => {
      const activeSourceId = getSource(state)
      for (const tabButton of sourceTabsElement.querySelectorAll('[data-editor-asset-source]'))
        tabButton.classList.toggle('active', tabButton.dataset.editorAssetSource === activeSourceId)
      const currentFolders = editorAssetFolders(getAssets(activeSourceId)),
        currentFolderName = getFolder(state)
      folderSelectElement.replaceChildren(
        ...currentFolders.map(
          (mappedFolderName) => new Option(mappedFolderName === '.' ? '根目录' : mappedFolderName, mappedFolderName),
        ),
      ),
        (folderSelectElement.value = currentFolderName),
        (folderRowElement.hidden = !currentFolders.length),
        (deleteFolderButton.hidden = !canDeleteFolder?.(activeSourceId, currentFolderName)),
        (uploadButton.hidden = activeSourceId !== 'user'),
        (uploadHintElement.hidden = activeSourceId !== 'user'),
        (uploadStatusElement.hidden = activeSourceId !== 'user' || !getUploaderState?.()?.error),
        (retryUploadButton.hidden = activeSourceId !== 'user' || !getUploaderState?.()?.refreshFailed)
    }
    // 每次重建工具条都换新 DOM：旧的订阅必须先退掉，否则会一直往已摘除的节点写状态。
    controller.uploadUnsubscribe?.()
    controller.uploadUnsubscribe = subscribeUploader?.(syncUploaderState)
    controller.syncAssetToolbar(), syncUploaderState()
  }
}

export function createEditorPickerElements({
  entityKindLabel: entityKindLabel,
  entityPickerPrimaryName: entityPickerPrimaryName,
  entityPickerText: entityPickerText,
  enableEntityTextHoverScroll: enableEntityTextHoverScroll,
  assetDisplayName: assetDisplayName,
  assetPreviewUrl: assetPreviewUrl,
  bindEditorIconNameTooltip: bindEditorIconNameTooltip,
  mdiIconUrl: mdiIconUrl,
}: any) {
  function createIconPickerClearOption(isClearSelected: any, clearOptionLabel: any, clearDatasetKey: any) {
    const clearOptionElement = document.createElement('button')
    return (
      (clearOptionElement.type = 'button'),
      (clearOptionElement.className = `navigation-icon-option navigation-icon-clear${isClearSelected ? '' : ' selected'}`),
      (clearOptionElement.dataset[clearDatasetKey] = ''),
      (clearOptionElement.textContent = clearOptionLabel),
      clearOptionElement
    )
  }
  function createIconPickerOption(icon: any, selectedIconName: any, iconDatasetKey: any) {
    const iconOptionElement = document.createElement('button')
    ;(iconOptionElement.type = 'button'),
      (iconOptionElement.className = `navigation-icon-option${icon.name === selectedIconName ? ' selected' : ''}`),
      (iconOptionElement.dataset[iconDatasetKey] = icon.name),
      iconOptionElement.setAttribute('aria-label', icon.name),
      (iconOptionElement.dataset.iconName = icon.name)
    const iconMaskElement = document.createElement('i')
    return (
      iconMaskElement.setAttribute('aria-hidden', 'true'),
      (iconMaskElement.style.maskImage = `url("${icon.previewUrl}")`),
      (iconMaskElement.style.webkitMaskImage = `url("${icon.previewUrl}")`),
      iconOptionElement.append(iconMaskElement),
      bindEditorIconNameTooltip(iconOptionElement, icon.name),
      iconOptionElement
    )
  }
  function createEditorPickerCurrentIcon(iconName: any, emptyIconLabel = '未使用图标') {
    const trimmedIconName = String(iconName || '').trim(),
      currentIconElement = document.createElement('span')
    ;(currentIconElement.className = 'editor-paged-picker-current-icon'),
      (currentIconElement.title = trimmedIconName || emptyIconLabel)
    const iconGlyphElement = document.createElement('i')
    iconGlyphElement.setAttribute('aria-hidden', 'true')
    const maskImageUrl = mdiIconUrl(trimmedIconName)
    maskImageUrl &&
      (iconGlyphElement.style.setProperty('mask-image', `url("${maskImageUrl}")`),
      iconGlyphElement.style.setProperty('-webkit-mask-image', `url("${maskImageUrl}")`)),
      currentIconElement.append(iconGlyphElement)
    const iconNameLabelElement = document.createElement('strong')
    return (
      (iconNameLabelElement.className = 'editor-paged-picker-current-icon-name'),
      (iconNameLabelElement.textContent = trimmedIconName || emptyIconLabel),
      currentIconElement.append(iconNameLabelElement),
      currentIconElement
    )
  }
  function createEditorEntityPickerOption(entity: any, selectedEntityId: any) {
    const entityOptionElement = document.createElement('button')
    ;(entityOptionElement.type = 'button'),
      (entityOptionElement.className = `inspector-entity-option${entity.entityId === selectedEntityId ? ' selected' : ''}`),
      (entityOptionElement.dataset.editorPickerValue = entity.entityId),
      entityOptionElement.setAttribute('role', 'option'),
      entityOptionElement.setAttribute('aria-selected', String(entity.entityId === selectedEntityId))
    const entityContentElement = document.createElement('span')
    ;(entityContentElement.className = 'inspector-entity-option-content'),
      (entityContentElement.title = entityPickerText(entity))
    const entityNameLineElement = document.createElement('span')
    entityNameLineElement.className = 'inspector-entity-option-line inspector-entity-name-line'
    const entityKindElement = document.createElement('span')
    ;(entityKindElement.className = 'inspector-entity-kind'),
      (entityKindElement.textContent = `[${entityKindLabel(entity)}] `)
    const entityNameElement = document.createElement('span')
    ;(entityNameElement.className = 'inspector-entity-name'),
      (entityNameElement.textContent = entityPickerPrimaryName(entity)),
      entityNameLineElement.append(entityKindElement, entityNameElement)
    const entityIdElement = document.createElement('span')
    return (
      (entityIdElement.className = 'inspector-entity-option-line inspector-entity-id'),
      (entityIdElement.textContent = entity.entityId),
      entityContentElement.append(entityNameLineElement, entityIdElement),
      enableEntityTextHoverScroll(entityOptionElement, entityNameLineElement),
      entityOptionElement.append(entityContentElement),
      entityOptionElement
    )
  }
  function editorPickerClearOption(clearLabel: any, isClearOptionSelected = false) {
    const clearButtonElement = document.createElement('button')
    return (
      (clearButtonElement.type = 'button'),
      (clearButtonElement.className = `editor-paged-picker-clear${isClearOptionSelected ? ' selected' : ''}`),
      (clearButtonElement.dataset.editorPickerValue = ''),
      (clearButtonElement.textContent = clearLabel),
      clearButtonElement
    )
  }
  function editorPickerClearAction(clearActionLabel = '不使用实体', isClearActionSelected = false) {
    const clearActionElement = editorPickerClearOption(clearActionLabel, isClearActionSelected)
    return ((clearActionElement.className = 'editor-paged-picker-selected-action'), clearActionElement)
  }
  function editorPickerEntityAction(actionEntity: any, isEntityActionSelected = false) {
    const entityActionElement = document.createElement('button')
    return (
      (entityActionElement.type = 'button'),
      (entityActionElement.className = `editor-paged-picker-selected-action${isEntityActionSelected ? ' selected' : ''}`),
      (entityActionElement.dataset.editorPickerValue = actionEntity.entityId),
      (entityActionElement.title = entityPickerText(actionEntity)),
      (entityActionElement.textContent = entityPickerText(actionEntity)),
      entityActionElement
    )
  }
  function createEditorPickerCurrentEntity(selectedEntity: any, emptyEntityLabel = '未选择实体') {
    const currentEntityElement = domElement(document, 'span', 'editor-paged-picker-current-entity')
    const currentEntityNameElement = domElement(document, 'span', 'editor-paged-picker-current-entity-name')
    const currentEntityIdElement = document.createElement('span')
    return (
      (currentEntityIdElement.className = 'editor-paged-picker-current-entity-id'),
      selectedEntity
        ? ((currentEntityNameElement.textContent = entityPickerPrimaryName(selectedEntity)),
          (currentEntityIdElement.textContent = selectedEntity.entityId || ''),
          (currentEntityElement.title = entityPickerText(selectedEntity)))
        : ((currentEntityNameElement.textContent = emptyEntityLabel), (currentEntityIdElement.textContent = '')),
      currentEntityElement.append(currentEntityNameElement),
      currentEntityIdElement.textContent && currentEntityElement.append(currentEntityIdElement),
      currentEntityElement
    )
  }
  function createEditorPickerCurrentAsset(asset: any, emptyAssetLabel = '未使用图片') {
    const currentAssetElement = domElement(document, 'span', 'editor-paged-picker-current-asset')
    const assetImageElement = document.createElement('img')
    assetImageElement.alt = ''
    const assetNameElement = document.createElement('span')
    return (
      (assetNameElement.className = 'editor-paged-picker-current-asset-name'),
      asset
        ? ((assetImageElement.src = assetPreviewUrl(asset)),
          (assetNameElement.textContent = assetDisplayName(asset) || emptyAssetLabel),
          (currentAssetElement.title = asset.name || asset.relativePath || asset.assetId || emptyAssetLabel))
        : ((assetImageElement.hidden = true), (assetNameElement.textContent = emptyAssetLabel)),
      currentAssetElement.append(assetImageElement, assetNameElement),
      currentAssetElement
    )
  }
  return Object.freeze({
    createIconPickerClearOption: createIconPickerClearOption,
    createIconPickerOption: createIconPickerOption,
    createEditorPickerCurrentIcon: createEditorPickerCurrentIcon,
    createEditorEntityPickerOption: createEditorEntityPickerOption,
    editorPickerClearOption: editorPickerClearOption,
    editorPickerClearAction: editorPickerClearAction,
    editorPickerEntityAction: editorPickerEntityAction,
    createEditorPickerCurrentEntity: createEditorPickerCurrentEntity,
    createEditorPickerCurrentAsset: createEditorPickerCurrentAsset,
  })
}

export function createEditorPickerLifecycle({
  getEntitiesLoaded: getEntitiesLoaded,
  getEntityLoadPromise: getEntityLoadPromise,
  loadEntities: loadEntities,
  reportError: reportError,
}: any) {
  const deferredHostSet = new WeakSet()
  function deferUntilEntitiesLoaded(hostElement: any, onReady: any, canProceed = () => true) {
    if (getEntitiesLoaded()) return false
    if (deferredHostSet.has(hostElement)) return true
    const existingPromise = getEntityLoadPromise(),
      hasExistingPromise = !!existingPromise,
      loadPromise = existingPromise || loadEntities()
    return (
      deferredHostSet.add(hostElement),
      hostElement?.setAttribute('aria-busy', 'true'),
      Promise.resolve(loadPromise)
        .then(() => {
          !getEntitiesLoaded() || !hostElement?.isConnected || !canProceed() || onReady()
        })
        .catch((loadError) => {
          hasExistingPromise || reportError(loadError)
        })
        .finally(() => {
          deferredHostSet.delete(hostElement), hostElement?.removeAttribute('aria-busy')
        }),
      true
    )
  }
  return {
    deferUntilEntitiesLoaded: deferUntilEntitiesLoaded,
  }
}
