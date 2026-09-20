/**
 * 编辑器选择器的 DOM 元素工厂。
 *
 * 位置：图标 / 实体 / 素材三类分页选择器弹层，负责生成列表项与「当前选中值」
 *   展示块。
 * 约定：所有节点通过全局 document 创建；展示文案由注入的回调（entityPickerText、
 *   assetDisplayName 等）决定，本模块只管结构与类名，保证选择器样式统一。
 * 约定：列表项统一用 dataset.editorPickerValue 携带取值，选择器靠它读取点击结果。
 */

/**
 * 创建选择器元素工厂。
 */
export function createEditorPickerElements({
  entityKindLabel: entityKindLabel,
  entityPickerPrimaryName: entityPickerPrimaryName,
  entityPickerText: entityPickerText,
  enableEntityTextHoverScroll: enableEntityTextHoverScroll,
  assetDisplayName: assetDisplayName,
  assetPreviewUrl: assetPreviewUrl,
  bindEditorIconNameTooltip: bindEditorIconNameTooltip,
  mdiIconUrl: mdiIconUrl
}) {
  /**
   * 创建图标选择器的「清除」选项。
   */
  function createIconPickerClearOption(isClearSelected, clearOptionLabel, clearDatasetKey) {
    const clearOptionElement = document.createElement("button");
    return (
      (clearOptionElement.type = "button"),
      (clearOptionElement.className = `navigation-icon-option navigation-icon-clear${isClearSelected ? "" : " selected"}`),
      (clearOptionElement.dataset[clearDatasetKey] = ""),
      (clearOptionElement.textContent = clearOptionLabel),
      clearOptionElement
    );
  }

  /**
   * 创建一个图标选项（用 mask-image 渲染 MDI 图标）。
   */
  function createIconPickerOption(icon, selectedIconName, iconDatasetKey) {
    const iconOptionElement = document.createElement("button");
    ((iconOptionElement.type = "button"),
      (iconOptionElement.className = `navigation-icon-option${icon.name === selectedIconName ? " selected" : ""}`),
      (iconOptionElement.dataset[iconDatasetKey] = icon.name),
      iconOptionElement.setAttribute("aria-label", icon.name),
      (iconOptionElement.dataset.iconName = icon.name));
    const iconMaskElement = document.createElement("i");
    // 同时设置标准与 webkit 前缀属性，兼容 Safari。
    return (
      iconMaskElement.setAttribute("aria-hidden", "true"),
      (iconMaskElement.style.maskImage = `url("${icon.previewUrl}")`),
      (iconMaskElement.style.webkitMaskImage = `url("${icon.previewUrl}")`),
      iconOptionElement.append(iconMaskElement),
      bindEditorIconNameTooltip(iconOptionElement, icon.name),
      iconOptionElement
    );
  }

  /**
   * 创建「当前图标」展示块。
   */
  function createEditorPickerCurrentIcon(
    iconName,
    emptyIconLabel = "未使用图标"
  ) {
    const trimmedIconName = String(iconName || "").trim(),
      currentIconElement = document.createElement("span");
    ((currentIconElement.className = "editor-paged-picker-current-icon"),
      (currentIconElement.title = trimmedIconName || emptyIconLabel));
    const iconGlyphElement = document.createElement("i");
    iconGlyphElement.setAttribute("aria-hidden", "true");
    const maskImageUrl = mdiIconUrl(trimmedIconName);
    // 没有图标名时不生成 mask 地址，避免出现无效的 url("")。
    (maskImageUrl &&
      (iconGlyphElement.style.setProperty("mask-image", `url("${maskImageUrl}")`),
      iconGlyphElement.style.setProperty("-webkit-mask-image", `url("${maskImageUrl}")`)),
      currentIconElement.append(iconGlyphElement));
    const iconNameLabelElement = document.createElement("strong");
    return (
      (iconNameLabelElement.className = "editor-paged-picker-current-icon-name"),
      (iconNameLabelElement.textContent = trimmedIconName || emptyIconLabel),
      currentIconElement.append(iconNameLabelElement),
      currentIconElement
    );
  }

  /**
   * 创建一个实体选项行（域标签 + 名称 + 实体 ID）。
   */
  function createEditorEntityPickerOption(entity, selectedEntityId) {
    const entityOptionElement = document.createElement("button");
    ((entityOptionElement.type = "button"),
      (entityOptionElement.className = `inspector-entity-option${entity.entityId === selectedEntityId ? " selected" : ""}`),
      (entityOptionElement.dataset.editorPickerValue = entity.entityId),
      entityOptionElement.setAttribute("role", "option"),
      entityOptionElement.setAttribute(
        "aria-selected",
        String(entity.entityId === selectedEntityId)
      ));
    const entityContentElement = document.createElement("span");
    ((entityContentElement.className = "inspector-entity-option-content"),
      (entityContentElement.title = entityPickerText(entity)));
    const entityNameLineElement = document.createElement("span");
    entityNameLineElement.className = "inspector-entity-option-line inspector-entity-name-line";
    const entityKindElement = document.createElement("span");
    ((entityKindElement.className = "inspector-entity-kind"),
      (entityKindElement.textContent = `[${entityKindLabel(entity)}] `));
    const entityNameElement = document.createElement("span");
    ((entityNameElement.className = "inspector-entity-name"),
      (entityNameElement.textContent = entityPickerPrimaryName(entity)),
      entityNameLineElement.append(entityKindElement, entityNameElement));
    const entityIdElement = document.createElement("span");
    return (
      (entityIdElement.className = "inspector-entity-option-line inspector-entity-id"),
      (entityIdElement.textContent = entity.entityId),
      entityContentElement.append(entityNameLineElement, entityIdElement),
      enableEntityTextHoverScroll(entityOptionElement, entityNameLineElement),
      entityOptionElement.append(entityContentElement),
      entityOptionElement
    );
  }

  /**
   * 创建「清除选择」按钮。
   */
  function editorPickerClearOption(clearLabel, isClearOptionSelected = !1) {
    const clearButtonElement = document.createElement("button");
    return (
      (clearButtonElement.type = "button"),
      (clearButtonElement.className = `editor-paged-picker-clear${isClearOptionSelected ? " selected" : ""}`),
      (clearButtonElement.dataset.editorPickerValue = ""),
      (clearButtonElement.textContent = clearLabel),
      clearButtonElement
    );
  }

  /**
   * 创建动作选择器里的「不使用实体」按钮。
   */
  function editorPickerClearAction(
    clearActionLabel = "不使用实体",
    isClearActionSelected = !1
  ) {
    const clearActionElement = editorPickerClearOption(clearActionLabel, isClearActionSelected);
    // 复用清除按钮的类名与 dataset，只换外层样式类以适配动作选择器。
    return (
      (clearActionElement.className = "editor-paged-picker-selected-action"),
      clearActionElement
    );
  }

  /**
   * 创建动作选择器里的实体按钮。
   */
  function editorPickerEntityAction(actionEntity, isEntityActionSelected = !1) {
    const entityActionElement = document.createElement("button");
    return (
      (entityActionElement.type = "button"),
      (entityActionElement.className = `editor-paged-picker-selected-action${isEntityActionSelected ? " selected" : ""}`),
      (entityActionElement.dataset.editorPickerValue = actionEntity.entityId),
      (entityActionElement.title = entityPickerText(actionEntity)),
      (entityActionElement.textContent = entityPickerText(actionEntity)),
      entityActionElement
    );
  }

  /**
   * 创建「当前实体」展示块。
   */
  function createEditorPickerCurrentEntity(
    selectedEntity,
    emptyEntityLabel = "未选择实体"
  ) {
    const currentEntityElement = document.createElement("span");
    currentEntityElement.className = "editor-paged-picker-current-entity";
    const currentEntityNameElement = document.createElement("span");
    currentEntityNameElement.className = "editor-paged-picker-current-entity-name";
    const currentEntityIdElement = document.createElement("span");
    return (
      (currentEntityIdElement.className = "editor-paged-picker-current-entity-id"),
      selectedEntity
        ? ((currentEntityNameElement.textContent = entityPickerPrimaryName(selectedEntity)),
          (currentEntityIdElement.textContent = selectedEntity.entityId || ""),
          (currentEntityElement.title = entityPickerText(selectedEntity)))
        : ((currentEntityNameElement.textContent = emptyEntityLabel),
          (currentEntityIdElement.textContent = "")),
      currentEntityElement.append(currentEntityNameElement),
      // 没有实体 ID 时连 ID 行一起隐藏，保持展示块紧凑。
      currentEntityIdElement.textContent && currentEntityElement.append(currentEntityIdElement),
      currentEntityElement
    );
  }

  /**
   * 创建「当前素材」展示块（缩略图 + 名称）。
   */
  function createEditorPickerCurrentAsset(
    asset,
    emptyAssetLabel = "未使用图片"
  ) {
    const currentAssetElement = document.createElement("span");
    currentAssetElement.className = "editor-paged-picker-current-asset";
    const assetImageElement = document.createElement("img");
    // 纯装饰图，alt 留空让读屏跳过。
    assetImageElement.alt = "";
    const assetNameElement = document.createElement("span");
    return (
      (assetNameElement.className = "editor-paged-picker-current-asset-name"),
      asset
        ? ((assetImageElement.src = assetPreviewUrl(asset)),
          (assetNameElement.textContent = assetDisplayName(asset) || emptyAssetLabel),
          // 名称可能重复，title 里补上文件名 / 相对路径以便区分。
          (currentAssetElement.title =
            asset.name || asset.relativePath || asset.assetId || emptyAssetLabel))
        : ((assetImageElement.hidden = !0), (assetNameElement.textContent = emptyAssetLabel)),
      currentAssetElement.append(assetImageElement, assetNameElement),
      currentAssetElement
    );
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
    createEditorPickerCurrentAsset: createEditorPickerCurrentAsset
  });
}
