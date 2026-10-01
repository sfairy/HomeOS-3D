export function editorAssetFolders(assets) {
  return [...new Set((assets || []).map((asset) => asset.folder).filter(Boolean))].sort(
    (folderName, otherFolderName) => folderName.localeCompare(otherFolderName, "zh-CN"),
  );
}
export function editorAssetSelectedFolder(selectedFolderName, folders) {
  return folders.includes(selectedFolderName) ? selectedFolderName : folders[0] || "";
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
}) {
  return function (state, { toolbar: toolbarElement, controller: controller }) {
    const sourceTabsElement = ownerDocument.createElement("div");
    ((sourceTabsElement.className = "asset-source-tabs"),
      sourceTabsElement.setAttribute("role", "tablist"),
      sourceTabsElement.setAttribute("aria-label", "图片来源"));
    for (const [sourceId, sourceLabel] of [
      ["user", "我的图片"],
      ["builtin", "栖光素材"],
    ]) {
      const sourceTabButton = ownerDocument.createElement("button");
      ((sourceTabButton.type = "button"),
        (sourceTabButton.textContent = sourceLabel),
        (sourceTabButton.dataset.editorAssetSource = sourceId),
        sourceTabButton.addEventListener("click", () => {
          setSource(state, sourceId);
          const sourceFolders = editorAssetFolders(getAssets(sourceId));
          (setFolder(state, editorAssetSelectedFolder(getFolder(state), sourceFolders)),
            controller.syncAssetToolbar?.(),
            controller.refresh({
              resetPage: true,
            }));
        }),
        sourceTabsElement.append(sourceTabButton));
    }
    const folderSelectElement = ownerDocument.createElement("select");
    ((folderSelectElement.className = "editor-paged-picker-folder"),
      folderSelectElement.setAttribute("aria-label", "选择图片文件夹"),
      folderSelectElement.addEventListener("change", () => {
        (setFolder(state, folderSelectElement.value),
          controller.syncAssetToolbar?.(),
          controller.refresh({
            resetPage: true,
          }));
      }));
    const deleteFolderButton = ownerDocument.createElement("button");
    ((deleteFolderButton.type = "button"),
      (deleteFolderButton.className = "asset-folder-delete"),
      (deleteFolderButton.textContent = "删除"),
      deleteFolderButton.setAttribute("aria-label", "删除当前自动导图文件夹"),
      (deleteFolderButton.title = "删除当前自动导图文件夹"),
      deleteFolderButton.addEventListener("click", () =>
        onDeleteFolder?.(state, folderSelectElement.value),
      ));
    const folderRowElement = ownerDocument.createElement("div");
    ((folderRowElement.className = "editor-paged-picker-folder-row"),
      folderRowElement.append(folderSelectElement, deleteFolderButton));
    const uploadButton = ownerDocument.createElement("button");
    ((uploadButton.type = "button"),
      (uploadButton.className = "asset-upload-button"),
      (uploadButton.textContent = "上传"),
      uploadButton.addEventListener("click", () => getUploadInput(state).click()),
      toolbarElement.append(sourceTabsElement, folderRowElement, uploadButton),
      (controller.syncAssetToolbar = () => {
        const activeSourceId = getSource(state);
        for (const tabButton of sourceTabsElement.querySelectorAll("[data-editor-asset-source]"))
          tabButton.classList.toggle(
            "active",
            tabButton.dataset.editorAssetSource === activeSourceId,
          );
        const currentFolders = editorAssetFolders(getAssets(activeSourceId)),
          currentFolderName = getFolder(state);
        (folderSelectElement.replaceChildren(
          ...currentFolders.map(
            (mappedFolderName) =>
              new Option(mappedFolderName === "." ? "根目录" : mappedFolderName, mappedFolderName),
          ),
        ),
          (folderSelectElement.value = currentFolderName),
          (folderRowElement.hidden = !currentFolders.length),
          (deleteFolderButton.hidden = !canDeleteFolder?.(activeSourceId, currentFolderName)),
          (uploadButton.hidden = activeSourceId !== "user"));
      }),
      controller.syncAssetToolbar());
  };
}
