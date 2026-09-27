/**
 * 内置资源的三个索引与 URL 解析：版本戳（`?v=`）、显式 URL、特效裁剪变体。
 */
// 状态条目归一统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry } from "../../../utils/state-entry.js?v=2609271508";

// 内置资源的三个索引：版本戳、显式 URL、特效裁剪变体。
const assetVersionByAssetId = new Map();

const assetUrlByAssetId = new Map();

export const effectVariantByAssetId = new Map();

/**
 * 用后端下发的资源清单刷新内置资源的版本与 URL 索引。
 */
export function setBuiltinAssetVersions(assetEntries = []) {
  const nextVersionByAssetId = new Map();
  const nextUrlByAssetId = new Map();
  const nextEffectVariantByAssetId = new Map();
  for (const assetEntry of assetEntries || []) {
    const primaryAssetId = String(assetEntry?.assetId || "");
    if (!primaryAssetId) {
      continue;
    }
    const assetVersion = String(assetEntry.version || "");
    const legacyAssetIds = Array.isArray(assetEntry.legacyAssetIds)
      ? assetEntry.legacyAssetIds
      : [];
    for (const assetIdCandidate of [primaryAssetId, ...legacyAssetIds]) {
      nextVersionByAssetId.set(String(assetIdCandidate), assetVersion);
      if (assetEntry.url) {
        nextUrlByAssetId.set(String(assetIdCandidate), String(assetEntry.url));
      }
      const effectVariant = assetEntry.effectVariant || {};
      const variantOriginalWidth = Number(effectVariant.originalWidth || 0);
      const variantOriginalHeight = Number(effectVariant.originalHeight || 0);
      const variantCropX = Number(effectVariant.cropX);
      const variantCropY = Number(effectVariant.cropY);
      const variantCropWidth = Number(effectVariant.width || 0);
      const variantCropHeight = Number(effectVariant.height || 0);
      if (
        String(effectVariant.url || "").startsWith("/api/v1/assets/effect-variant?") &&
        variantOriginalWidth > 0 &&
        variantOriginalHeight > 0 &&
        Number.isFinite(variantCropX) &&
        Number.isFinite(variantCropY) &&
        variantCropX >= 0 &&
        variantCropY >= 0 &&
        variantCropWidth > 0 &&
        variantCropHeight > 0 &&
        variantCropX + variantCropWidth <= variantOriginalWidth &&
        variantCropY + variantCropHeight <= variantOriginalHeight
      ) {
        // 特效变体只接受服务端 /api/v1/assets/effect-variant 且裁剪矩形完全落在原图内的记录，
        nextEffectVariantByAssetId.set(String(assetIdCandidate), {
          url: String(effectVariant.url),
          originalWidth: variantOriginalWidth,
          originalHeight: variantOriginalHeight,
          cropX: variantCropX,
          cropY: variantCropY,
          width: variantCropWidth,
          height: variantCropHeight
        });
      }
    }
  }
  if (
    nextVersionByAssetId.size === assetVersionByAssetId.size &&
    ![...nextVersionByAssetId].some(
      ([mappedAssetId, mappedVersion]) => assetVersionByAssetId.get(mappedAssetId) !== mappedVersion
    ) &&
    nextUrlByAssetId.size === assetUrlByAssetId.size &&
    ![...nextUrlByAssetId].some(
      ([mappedUrlAssetId, mappedUrl]) => assetUrlByAssetId.get(mappedUrlAssetId) !== mappedUrl
    ) &&
    nextEffectVariantByAssetId.size === effectVariantByAssetId.size &&
    ![...nextEffectVariantByAssetId].some(
      ([mappedVariantAssetId, mappedEffectVariant]) =>
        JSON.stringify(effectVariantByAssetId.get(mappedVariantAssetId)) !==
        JSON.stringify(mappedEffectVariant)
    )
  ) {
    return false;
  }
    // 走到这里说明内容确实变了，整体替换而不是逐条 diff：清单规模小，重建更省心。
  assetVersionByAssetId.clear();
  for (const [detectedVersionAssetId, detectedVersion] of nextVersionByAssetId) {
    assetVersionByAssetId.set(detectedVersionAssetId, detectedVersion);
  }
  assetUrlByAssetId.clear();
  for (const [detectedUrlAssetId, detectedUrl] of nextUrlByAssetId) {
    assetUrlByAssetId.set(detectedUrlAssetId, detectedUrl);
  }
  effectVariantByAssetId.clear();
  for (const [detectedVariantAssetId, detectedVariant] of nextEffectVariantByAssetId) {
    effectVariantByAssetId.set(detectedVariantAssetId, detectedVariant);
  }
  return true;
}

export function resolveAssetUrl(assetReference) {
  const assetReferenceText = String(assetReference || "");
  if (assetUrlByAssetId.has(assetReferenceText)) {
    return assetUrlByAssetId.get(assetReferenceText);
  }
  if (assetReferenceText.startsWith("studio3d:")) {
    // 前缀 "studio3d:" 共 9 个字符，切片后必须是恰好两段，且两段都非空——
    const studioExportSegments = assetReferenceText.slice(9).split("/");
    if (studioExportSegments.length !== 2 || !studioExportSegments[0] || !studioExportSegments[1]) {
      return "";
    } else {
      return (
        "/api/v1/assets/studio3d-export/" +
        encodeURIComponent(studioExportSegments[0]) +
        "/" +
        encodeURIComponent(studioExportSegments[1])
      );
    }
  }
  if (assetReferenceText.startsWith("user:")) {
    const userAssetId = assetReferenceText.slice(5);
    // 用户资源 ID 固定为 32 位小写十六进制，顺便当作路径校验，防止拼出跨目录的 URL。
    if (/^[0-9a-f]{32}$/.test(userAssetId)) {
      return "/api/v1/assets/user/" + userAssetId;
    } else {
      return "";
    }
  }
  if (!assetReferenceText.startsWith("builtin:")) {
    return "";
  }
    // 前缀 "builtin:" 共 8 个字符。
  const builtinAssetPath = assetReferenceText.slice(8);
  const encodedBuiltinAssetPath = (
    builtinAssetPath.startsWith("v1/2D/") || builtinAssetPath.startsWith("v1/3D/")
      ? builtinAssetPath.replace(/^v1\//, "v1/户型图示例/")
      : builtinAssetPath
  )
    .split("/")
    .filter(Boolean)
    .map(pathSegment => encodeURIComponent(pathSegment))
    .join("/");
  if (!encodedBuiltinAssetPath) {
    return "";
  }
  const builtinAssetVersion = assetVersionByAssetId.get(assetReferenceText) || "";
  return (
    "/assets/builtin/" +
    encodedBuiltinAssetPath +
    (builtinAssetVersion ? "?v=" + encodeURIComponent(builtinAssetVersion) : "")
  );
}

/**
 * 静态图片资源的对外入口（等价于 resolveAssetUrl）。
 */
export function staticAssetImageSource(imageAssetId) {
  return resolveAssetUrl(imageAssetId);
}

/**
 * 生成扫地机实时地图图片地址：走 HA 的 image_proxy。
 */
export function vacuumMapImageSource(vacuumImageEntityId, vacuumImageState = null) {
  const vacuumImageResolvedState = resolveStateEntry(vacuumImageState) || {};
  const vacuumImageCacheKey = String(
    vacuumImageResolvedState.updatedAt ||
      vacuumImageResolvedState.lastChanged ||
      vacuumImageResolvedState.state ||
      "initial"
  );
  return (
    "/api/image_proxy/" +
    encodeURIComponent(String(vacuumImageEntityId || "")) +
    "?hb=" +
    encodeURIComponent(vacuumImageCacheKey)
  );
}
