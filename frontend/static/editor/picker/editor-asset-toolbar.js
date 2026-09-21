/**
 * 编辑器素材选择器的文件夹工具栏。
 *
 * 图片 / IBE 分页选择器弹层顶部，由 picker 控制器渲染时调用：构造「文件夹下拉 + 删除 + 上传」
 * 一行控件，并把刷新回调挂到 pickerController.syncAssetToolbar。文件夹名为 "." 时显示为
 * 「根目录」；删除按钮只对用户素材文件夹可用；DOM 通过注入的 documentObject 构造，便于测试。
 */

/**
 * 从素材列表里收集去重后的文件夹名，并按中文排序。
 */
function editorAssetFolders(assetList) {
  return [...new Set((assetList || []).map(assetEntry => assetEntry.folder).filter(Boolean))].sort(
    (rightFolderName, leftFolderName) => rightFolderName.localeCompare(leftFolderName, "zh-CN")
  );
}

/**
 * 创建素材工具栏渲染函数。
 */
export function createEditorAssetToolbar({
  documentObject: documentObject,
  getFolder: getFolder,
  setFolder: setFolder,
  getAssets: getAssets,
  getUploadInput: getUploadInput,
  canDeleteFolder: canDeleteFolder,
  onDeleteFolder: onDeleteFolder
}) {
  return function (pickerState, { toolbar: toolbarElement, controller: pickerController }) {
    const folderSelectElement = documentObject.createElement("select");
    ((folderSelectElement.className = "editor-paged-picker-folder"),
      folderSelectElement.setAttribute("aria-label", "选择图片文件夹"),
      folderSelectElement.addEventListener("change", () => {
        // 切文件夹属于换数据集，必须重置分页，否则会停在不存在的页码上。
        (setFolder(pickerState, folderSelectElement.value),
          pickerController.syncAssetToolbar?.(),
          pickerController.refresh({ resetPage: !0 }));
      }));
    const deleteFolderButtonElement = documentObject.createElement("button");
    ((deleteFolderButtonElement.type = "button"),
      (deleteFolderButtonElement.className = "asset-folder-delete"),
      (deleteFolderButtonElement.textContent = "删除"),
      deleteFolderButtonElement.setAttribute(
        "aria-label",
        "删除当前自动导图文件夹"
      ),
      (deleteFolderButtonElement.title =
        "删除当前自动导图文件夹"),
      deleteFolderButtonElement.addEventListener("click", () =>
        onDeleteFolder?.(pickerState, folderSelectElement.value)
      ));
    const folderRowElement = documentObject.createElement("div");
    ((folderRowElement.className = "editor-paged-picker-folder-row"),
      folderRowElement.append(folderSelectElement, deleteFolderButtonElement));
    const uploadButtonElement = documentObject.createElement("button");
    ((uploadButtonElement.type = "button"),
      (uploadButtonElement.className = "asset-upload-button"),
      (uploadButtonElement.textContent = "上传"),
      // 上传入口复用选择器自带的上传输入框，避免页面上出现多个 file input。
      uploadButtonElement.addEventListener("click", () => getUploadInput(pickerState).click()),
      toolbarElement.append(folderRowElement, uploadButtonElement),
      (pickerController.syncAssetToolbar = () => {
        const availableFolders = editorAssetFolders(getAssets()),
          selectedFolder = getFolder(pickerState);
        // "." 是后端表达的根目录，界面上要显示成「根目录」。
        (folderSelectElement.replaceChildren(
          ...availableFolders.map(
            optionName =>
              new Option(optionName === "." ? "根目录" : optionName, optionName)
          )
        ),
          (folderSelectElement.value = selectedFolder),
          // 没有任何文件夹时整行隐藏，只剩上传按钮。
          (folderRowElement.hidden = !availableFolders.length),
          // 系统内置文件夹（如自动导图目录）不可删除。
          (deleteFolderButtonElement.hidden = !canDeleteFolder?.("user", selectedFolder)));
      }),
      pickerController.syncAssetToolbar());
  };
}
