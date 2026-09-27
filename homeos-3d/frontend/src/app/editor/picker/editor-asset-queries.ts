/**
 * 编辑器素材查询器：按素材分类与关键字过滤用户素材库。
 */

type AnyObj = Record<string, any>;

/**
 * 创建素材匹配函数。
 */
export function createEditorAssetMatcher({
  getImageFolder: getImageFolder,
  getIbeFolder: getIbeFolder,
  getUserAssets: getUserAssets
}: AnyObj) {
  return function (assetKind: any, searchText: any = "") {
    // normalizedQuery 用 zh-CN 做小写折叠，保证中文素材名的搜索行为符合界面语言。
    const isImageKind = assetKind === "image",
      activeFolder = isImageKind ? getImageFolder() : getIbeFolder(),
      sourceAssets = getUserAssets(),
      normalizedQuery = String(searchText || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
    // 匹配规则有两条：名称与相对路径都参与关键字匹配；无关键字时只显示当前文件夹。
    return sourceAssets.filter(
      (asset: any) =>
        (!normalizedQuery ||
          `${asset.name} ${asset.relativePath}`
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery)) &&
        (!!normalizedQuery || asset.folder === activeFolder)
    );
  };
}
