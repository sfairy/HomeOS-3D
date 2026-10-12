const versionByAssetId = new Map<string, string>(),
  urlByAssetId = new Map<string, string>();
export const effectVariantByAssetId = new Map<string, any>();

export function setBuiltinAssetVersions(assetVersionEntries: any[] = []) {
  const stagedVersionByAssetId = new Map(),
    stagedUrlByAssetId = new Map(),
    stagedVariantByAssetId = new Map();
  for (const assetVersionEntry of assetVersionEntries || []) {
    const assetId = String(assetVersionEntry?.assetId || "");
    if (!assetId) continue;
    const assetVersion = String(assetVersionEntry.version || "");


    (stagedVersionByAssetId.set(assetId, assetVersion),
      assetVersionEntry.url && stagedUrlByAssetId.set(assetId, String(assetVersionEntry.url)));
    const effectVariant = assetVersionEntry.effectVariant || {},
      originalWidth = Number(effectVariant.originalWidth || 0),
      originalHeight = Number(effectVariant.originalHeight || 0),
      cropX = Number(effectVariant.cropX),
      cropY = Number(effectVariant.cropY),
      cropWidth = Number(effectVariant.width || 0),
      cropHeight = Number(effectVariant.height || 0);
    String(effectVariant.url || "").startsWith("/api/v1/assets/effect-variant?") &&
      originalWidth > 0 &&
      originalHeight > 0 &&
      Number.isFinite(cropX) &&
      Number.isFinite(cropY) &&
      cropX >= 0 &&
      cropY >= 0 &&
      cropWidth > 0 &&
      cropHeight > 0 &&
      cropX + cropWidth <= originalWidth &&
      cropY + cropHeight <= originalHeight &&
      stagedVariantByAssetId.set(assetId, {
        url: String(effectVariant.url),
        originalWidth: originalWidth,
        originalHeight: originalHeight,
        cropX: cropX,
        cropY: cropY,
        width: cropWidth,
        height: cropHeight,
      });
  }
  if (!(
    stagedVersionByAssetId.size !== versionByAssetId.size ||
    [...stagedVersionByAssetId].some(
      ([versionCheckAssetId, committedVersion]) =>
        versionByAssetId.get(versionCheckAssetId) !== committedVersion,
    ) ||
    stagedUrlByAssetId.size !== urlByAssetId.size ||
    [...stagedUrlByAssetId].some(
      ([urlCheckAssetId, committedUrl]) => urlByAssetId.get(urlCheckAssetId) !== committedUrl,
    ) ||
    stagedVariantByAssetId.size !== effectVariantByAssetId.size ||
    [...stagedVariantByAssetId].some(
      ([variantCheckAssetId, committedVariant]) =>
        JSON.stringify(effectVariantByAssetId.get(variantCheckAssetId)) !==
        JSON.stringify(committedVariant),
    )
  ))
    return false;
  versionByAssetId.clear();
  for (const [versionAssignmentKey, versionAssignmentValue] of stagedVersionByAssetId)
    versionByAssetId.set(versionAssignmentKey, versionAssignmentValue);
  urlByAssetId.clear();
  for (const [urlAssignmentKey, urlAssignmentValue] of stagedUrlByAssetId)
    urlByAssetId.set(urlAssignmentKey, urlAssignmentValue);
  effectVariantByAssetId.clear();
  for (const [variantAssignmentKey, variantAssignmentValue] of stagedVariantByAssetId)
    effectVariantByAssetId.set(variantAssignmentKey, variantAssignmentValue);
  return true;
}

export function resolveAssetSource(assetKey: any) {
  const normalizedAssetKey = String(assetKey || "");
  if (urlByAssetId.has(normalizedAssetKey)) return urlByAssetId.get(normalizedAssetKey);
  if (normalizedAssetKey.startsWith("studio3d:")) {
    const studio3dPartSegments = normalizedAssetKey.slice(9).split("/");
    return studio3dPartSegments.length !== 2 || !studio3dPartSegments[0] || !studio3dPartSegments[1]
      ? ""
      : "/api/v1/assets/studio3d-export/" +
          encodeURIComponent(studio3dPartSegments[0]) +
          "/" +
          encodeURIComponent(studio3dPartSegments[1]);
  }
  if (normalizedAssetKey.startsWith("user:")) {
    const userAssetId = normalizedAssetKey.slice(5);
    return /^[0-9a-f]{32}$/.test(userAssetId) ? "/api/v1/assets/user/" + userAssetId : "";
  }
  if (!normalizedAssetKey.startsWith("builtin:")) return "";


  const normalizedBuiltinPath = normalizedAssetKey
    .slice(8)
    .split("/")
    .filter(Boolean)
    .map((pathSegment) => encodeURIComponent(pathSegment))
    .join("/");
  if (!normalizedBuiltinPath) return "";
  return "/assets/builtin/" + normalizedBuiltinPath;
}

export function staticAssetImageSource(assetSourceRef: any) {
  return resolveAssetSource(assetSourceRef);
}
