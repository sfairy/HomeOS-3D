export function createEditorAssetMatcher({
  getImageSource: getImageSource,
  getImageFolder: getImageFolder,
  getIbeSource: getIbeSource,
  getIbeFolder: getIbeFolder,
  getUserAssets: getUserAssets,
  getBuiltinAssets: getBuiltinAssets,
}) {
  return function (kind, query = "") {
    const isImageKind = kind === "image",
      source = isImageKind ? getImageSource() : getIbeSource(),
      folder = isImageKind ? getImageFolder() : getIbeFolder(),
      assets = source === "user" ? getUserAssets() : getBuiltinAssets(),
      normalizedQuery = String(query || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
    return assets.filter(
      (asset) =>
        (!normalizedQuery ||
          `${asset.name} ${asset.relativePath}`
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery)) &&
        (!!normalizedQuery || asset.folder === folder),
    );
  };
}
