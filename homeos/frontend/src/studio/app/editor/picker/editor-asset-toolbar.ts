import { USER_IMAGE_HINT } from "../../shared/user-image-upload";

/** 工具条只关心这三个字段；`user-image-upload` 的完整状态由上传模块持有。 */
interface AssetUploaderState {
  busy?: boolean;
  error?: string;
  refreshFailed?: boolean;
}

function editorAssetFolders(assets: { folder?: string }[] = []) {
  return [...new Set((assets || []).map((asset) => asset.folder).filter(Boolean))].sort(
    (folderName, otherFolderName) => folderName!.localeCompare(otherFolderName!, "zh-CN"),
  );
}
function editorAssetSelectedFolder(selectedFolderName: any, folders: any) {
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
  getUploaderState: getUploaderState,
  subscribeUploader: subscribeUploader,
  retryUploadRefresh: retryUploadRefresh,
}: any) {
  return function (state: any, { toolbar: toolbarElement, controller: controller }: any) {
    const sourceTabsElement = ownerDocument.createElement("div");
    ((sourceTabsElement.className = "asset-source-tabs"),
      sourceTabsElement.setAttribute("role", "tablist"),
      sourceTabsElement.setAttribute("aria-label", "图片来源"));
    for (const [sourceId, sourceLabel] of [
      ["user", "我的图片"],
      ["builtin", "HomeOS素材"],
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
      uploadButton.setAttribute("title", USER_IMAGE_HINT),
      uploadButton.addEventListener("click", () => getUploadInput(state).click()));
    // 上传口径与失败反馈统一来自 `user-image-upload`：提示语、busy 禁用、
    // 「图已传上去但目录没刷新」时的重试入口都在这里呈现。
    const uploadHintElement = ownerDocument.createElement("p");
    ((uploadHintElement.className = "asset-upload-hint"),
      (uploadHintElement.textContent = USER_IMAGE_HINT));
    const uploadStatusElement = ownerDocument.createElement("p");
    ((uploadStatusElement.className = "asset-upload-status"),
      uploadStatusElement.setAttribute("role", "status"),
      (uploadStatusElement.hidden = true));
    const retryUploadButton = ownerDocument.createElement("button");
    ((retryUploadButton.type = "button"),
      (retryUploadButton.className = "asset-upload-retry"),
      (retryUploadButton.textContent = "重试刷新"),
      retryUploadButton.addEventListener("click", () => {
        void retryUploadRefresh?.();
      }),
      (retryUploadButton.hidden = true));
    const syncUploaderState = (uploaderState: AssetUploaderState | null = getUploaderState?.()) => {
      (uploadButton.disabled = Boolean(uploaderState?.busy)),
        (uploadStatusElement.hidden = !uploaderState?.error),
        (uploadStatusElement.textContent = uploaderState?.error || ""),
        (retryUploadButton.hidden = !uploaderState?.refreshFailed);
    };
    toolbarElement.append(
      sourceTabsElement,
      folderRowElement,
      uploadButton,
      uploadHintElement,
      uploadStatusElement,
      retryUploadButton,
    );
    controller.syncAssetToolbar = () => {
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
        (uploadButton.hidden = activeSourceId !== "user"),
        (uploadHintElement.hidden = activeSourceId !== "user"),
        (uploadStatusElement.hidden = activeSourceId !== "user" || !getUploaderState?.()?.error),
        (retryUploadButton.hidden =
          activeSourceId !== "user" || !getUploaderState?.()?.refreshFailed));
    };
    // 每次重建工具条都换新 DOM：旧的订阅必须先退掉，否则会一直往已摘除的节点写状态。
    controller.uploadUnsubscribe?.();
    controller.uploadUnsubscribe = subscribeUploader?.(syncUploaderState);
    (controller.syncAssetToolbar(), syncUploaderState());
  };
}
