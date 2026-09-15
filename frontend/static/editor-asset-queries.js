export function createEditorAssetMatcher({
  getImageFolder: getImageFolder,
  getIbeFolder: getIbeFolder,
  getUserAssets: getUserAssets
}) {
  return function (assetKind, searchText = "") {
    const isImageKind = assetKind === "image",
      activeFolder = isImageKind ? getImageFolder() : getIbeFolder(),
      sourceAssets = getUserAssets(),
      normalizedQuery = String(searchText || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
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
