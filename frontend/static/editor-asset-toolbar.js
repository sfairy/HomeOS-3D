/**
 * 编辑器素材选择器的文件夹工具栏。
 *
 * 位置：图片 / IBE 分页选择器弹层顶部，由 picker 控制器在渲染时调用。
 * 职责：构造「文件夹下拉 + 删除 + 上传」一行控件，并把刷新的回调挂到
 *   pickerController.syncAssetToolbar 上，供控制器主动同步。
 * 约定：文件夹名为 "." 时显示为「根目录」；删除按钮只对用户素材文件夹
 *   （canDeleteFolder("user", …)）可用；所有 DOM 构造通过注入的 documentObject，
 *   便于在非浏览器环境测试。
 */

/**
 * 从素材列表里收集去重后的文件夹名，并按中文排序。
 *
 * @param {Array<object>} assetList 素材列表。
 * @returns {Array<string>} 排序后的文件夹名数组。
 */
export function editorAssetFolders(assetList) {
  return [...new Set((assetList || []).map(assetEntry => assetEntry.folder).filter(Boolean))].sort(
    (rightFolderName, leftFolderName) => rightFolderName.localeCompare(leftFolderName, "zh-CN")
  );
}

/**
 * 在当前文件夹已被删除时回退到第一个可用文件夹。
 *
 * @param {string} currentFolder 当前选中的文件夹名。
 * @param {Array<string>} folderList 可用文件夹列表。
 * @returns {string} 仍然有效的文件夹名；列表为空时返回空串。
 */
export function editorAssetSelectedFolder(currentFolder, folderList) {
  return folderList.includes(currentFolder) ? currentFolder : folderList[0] || "";
}

/**
 * 创建素材工具栏渲染函数。
 *
 * @param {object} handlers 依赖注入。
 * @param {Document} handlers.documentObject 用于创建节点的 document。
 * @param {function(object): string} handlers.getFolder 读取指定 picker 的当前文件夹。
 * @param {function(object, string): void} handlers.setFolder 写入当前文件夹。
 * @param {function(): Array<object>} handlers.getAssets 读取素材列表。
 * @param {function(object): HTMLInputElement} handlers.getUploadInput 取上传文件输入框。
 * @param {function(string, string): boolean} [handlers.canDeleteFolder] 判断能否删除该文件夹。
 * @param {function(object, string): void} [handlers.onDeleteFolder] 删除文件夹回调。
 * @returns {function(object, object): void} 渲染函数，入参为 pickerState 与
 *   { toolbar, controller }。
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
      folderSelectElement.setAttribute("aria-label", "\u9009\u62E9\u56FE\u7247\u6587\u4EF6\u5939"),
      folderSelectElement.addEventListener("change", () => {
        // 切文件夹属于换数据集，必须重置分页，否则会停在不存在的页码上。
        (setFolder(pickerState, folderSelectElement.value),
          pickerController.syncAssetToolbar?.(),
          pickerController.refresh({ resetPage: !0 }));
      }));
    const deleteFolderButtonElement = documentObject.createElement("button");
    ((deleteFolderButtonElement.type = "button"),
      (deleteFolderButtonElement.className = "asset-folder-delete"),
      (deleteFolderButtonElement.textContent = "\u5220\u9664"),
      deleteFolderButtonElement.setAttribute(
        "aria-label",
        "\u5220\u9664\u5F53\u524D\u81EA\u52A8\u5BFC\u56FE\u6587\u4EF6\u5939"
      ),
      (deleteFolderButtonElement.title =
        "\u5220\u9664\u5F53\u524D\u81EA\u52A8\u5BFC\u56FE\u6587\u4EF6\u5939"),
      deleteFolderButtonElement.addEventListener("click", () =>
        onDeleteFolder?.(pickerState, folderSelectElement.value)
      ));
    const folderRowElement = documentObject.createElement("div");
    ((folderRowElement.className = "editor-paged-picker-folder-row"),
      folderRowElement.append(folderSelectElement, deleteFolderButtonElement));
    const uploadButtonElement = documentObject.createElement("button");
    ((uploadButtonElement.type = "button"),
      (uploadButtonElement.className = "asset-upload-button"),
      (uploadButtonElement.textContent = "\u4E0A\u4F20"),
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
              new Option(optionName === "." ? "\u6839\u76EE\u5F55" : optionName, optionName)
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
