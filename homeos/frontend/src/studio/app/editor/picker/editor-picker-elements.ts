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
    const clearOptionElement = document.createElement("button");
    return (
      (clearOptionElement.type = "button"),
      (clearOptionElement.className = `navigation-icon-option navigation-icon-clear${isClearSelected ? "" : " selected"}`),
      (clearOptionElement.dataset[clearDatasetKey] = ""),
      (clearOptionElement.textContent = clearOptionLabel),
      clearOptionElement
    );
  }
  function createIconPickerOption(icon: any, selectedIconName: any, iconDatasetKey: any) {
    const iconOptionElement = document.createElement("button");
    ((iconOptionElement.type = "button"),
      (iconOptionElement.className = `navigation-icon-option${icon.name === selectedIconName ? " selected" : ""}`),
      (iconOptionElement.dataset[iconDatasetKey] = icon.name),
      iconOptionElement.setAttribute("aria-label", icon.name),
      (iconOptionElement.dataset.iconName = icon.name));
    const iconMaskElement = document.createElement("i");
    return (
      iconMaskElement.setAttribute("aria-hidden", "true"),
      (iconMaskElement.style.maskImage = `url("${icon.previewUrl}")`),
      (iconMaskElement.style.webkitMaskImage = `url("${icon.previewUrl}")`),
      iconOptionElement.append(iconMaskElement),
      bindEditorIconNameTooltip(iconOptionElement, icon.name),
      iconOptionElement
    );
  }
  function createEditorPickerCurrentIcon(iconName: any, emptyIconLabel = "未使用图标") {
    const trimmedIconName = String(iconName || "").trim(),
      currentIconElement = document.createElement("span");
    ((currentIconElement.className = "editor-paged-picker-current-icon"),
      (currentIconElement.title = trimmedIconName || emptyIconLabel));
    const iconGlyphElement = document.createElement("i");
    iconGlyphElement.setAttribute("aria-hidden", "true");
    const maskImageUrl = mdiIconUrl(trimmedIconName);
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
  function createEditorEntityPickerOption(entity: any, selectedEntityId: any) {
    const entityOptionElement = document.createElement("button");
    ((entityOptionElement.type = "button"),
      (entityOptionElement.className = `inspector-entity-option${entity.entityId === selectedEntityId ? " selected" : ""}`),
      (entityOptionElement.dataset.editorPickerValue = entity.entityId),
      entityOptionElement.setAttribute("role", "option"),
      entityOptionElement.setAttribute(
        "aria-selected",
        String(entity.entityId === selectedEntityId),
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
  function editorPickerClearOption(clearLabel: any, isClearOptionSelected = false) {
    const clearButtonElement = document.createElement("button");
    return (
      (clearButtonElement.type = "button"),
      (clearButtonElement.className = `editor-paged-picker-clear${isClearOptionSelected ? " selected" : ""}`),
      (clearButtonElement.dataset.editorPickerValue = ""),
      (clearButtonElement.textContent = clearLabel),
      clearButtonElement
    );
  }
  function editorPickerClearAction(clearActionLabel = "不使用实体", isClearActionSelected = false) {
    const clearActionElement = editorPickerClearOption(clearActionLabel, isClearActionSelected);
    return (
      (clearActionElement.className = "editor-paged-picker-selected-action"),
      clearActionElement
    );
  }
  function editorPickerEntityAction(actionEntity: any, isEntityActionSelected = false) {
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
  function createEditorPickerCurrentEntity(selectedEntity: any, emptyEntityLabel = "未选择实体") {
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
      currentEntityIdElement.textContent && currentEntityElement.append(currentEntityIdElement),
      currentEntityElement
    );
  }
  function createEditorPickerCurrentAsset(asset: any, emptyAssetLabel = "未使用图片") {
    const currentAssetElement = document.createElement("span");
    currentAssetElement.className = "editor-paged-picker-current-asset";
    const assetImageElement = document.createElement("img");
    assetImageElement.alt = "";
    const assetNameElement = document.createElement("span");
    return (
      (assetNameElement.className = "editor-paged-picker-current-asset-name"),
      asset
        ? ((assetImageElement.src = assetPreviewUrl(asset)),
          (assetNameElement.textContent = assetDisplayName(asset) || emptyAssetLabel),
          (currentAssetElement.title =
            asset.name || asset.relativePath || asset.assetId || emptyAssetLabel))
        : ((assetImageElement.hidden = true), (assetNameElement.textContent = emptyAssetLabel)),
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
    createEditorPickerCurrentAsset: createEditorPickerCurrentAsset,
  });
}
