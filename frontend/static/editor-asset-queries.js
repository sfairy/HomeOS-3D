/**
 * 编辑器素材查询器：按素材分类与关键字过滤用户素材库。
 *
 * 位置：编辑器「图片 / IBE」选择器打开时构造一次，之后每次搜索复用。
 * 职责：把当前文件夹、素材列表、搜索词的读取方式以回调注入，产出一个
 *   纯函数 matcher，便于测试与复用。
 * 约定：图片与 IBE 各自维护一个「当前文件夹」；一旦输入了搜索词就跨文件夹
 *   全局搜索，此时忽略文件夹过滤。
 */

/**
 * 创建素材匹配函数。
 *
 * @param {object} handlers 读取素材状态的三个回调。
 * @param {function(): string} handlers.getImageFolder 读取当前图片文件夹。
 * @param {function(): string} handlers.getIbeFolder 读取当前 IBE 文件夹。
 * @param {function(): Array<object>} handlers.getUserAssets 读取用户素材列表。
 * @returns {function(string, string=): Array<object>} 匹配函数，
 *   入参为素材分类（"image" / "ibe"）与搜索文本。
 */
export function createEditorAssetMatcher({
  getImageFolder: getImageFolder,
  getIbeFolder: getIbeFolder,
  getUserAssets: getUserAssets
}) {
  return function (assetKind, searchText = "") {
    // normalizedQuery 用 zh-CN 做小写折叠，保证中文素材名的搜索行为符合界面语言。
    const isImageKind = assetKind === "image",
      activeFolder = isImageKind ? getImageFolder() : getIbeFolder(),
      sourceAssets = getUserAssets(),
      normalizedQuery = String(searchText || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
    // 匹配规则有两条：名称与相对路径都参与关键字匹配；无关键字时只显示当前文件夹。
    return sourceAssets.filter(
      asset =>
        (!normalizedQuery ||
          `${asset.name} ${asset.relativePath}`
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery)) &&
        (!!normalizedQuery || asset.folder === activeFolder)
    );
  };
}
