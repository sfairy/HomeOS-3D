function createCodedError(errorMessage: any, errorCode: any) {
  return Object.assign(new Error(errorMessage), {
    code: errorCode,
  });
}
function backgroundTargetSize(sourceWidth: any, sourceHeight: any) {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  )
    throw createCodedError("无法读取图片尺寸，请另存为 PNG/JPG 后重试。", "IMAGE_DIMENSIONS");
  const scaleFactor = Math.min(
    1,
    8192 / sourceWidth,
    8192 / sourceHeight,
    Math.sqrt(10000000 / (sourceWidth * sourceHeight)),
  );
  return {
    width: Math.max(1, Math.floor(sourceWidth * scaleFactor)),
    height: Math.max(1, Math.floor(sourceHeight * scaleFactor)),
  };
}
function detectBackgroundFormat(imageBytes: any) {
  const matchesSignatureBytes = (...signatureBytes: any[]) =>
      signatureBytes.every((expectedByte, byteIndex) => imageBytes[byteIndex] === expectedByte),
    decodeAsciiRange = (startIndex: any, endIndex: any) =>
      String.fromCharCode(...imageBytes.slice(startIndex, endIndex));
  if (matchesSignatureBytes(137, 80, 78, 71, 13, 10, 26, 10)) return "png";
  if (matchesSignatureBytes(255, 216, 255)) return "jpeg";
  if (decodeAsciiRange(0, 4) === "RIFF" && decodeAsciiRange(8, 12) === "WEBP") return "webp";
  if (["GIF87a", "GIF89a"].includes(decodeAsciiRange(0, 6))) return "gif";
  if (matchesSignatureBytes(66, 77)) return "bmp";
  const decodedText = new TextDecoder().decode(imageBytes).replace(/^\uFEFF/, "");
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[\s\S]*?>\s*)*<svg[\s>]/i.test(
    decodedText,
  )
    ? "svg"
    : null;
}
export function loadImportedImage(imageUrl: any, { timeoutMs: imageTimeoutMs = 30000 } = {}) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const importedImage = new Image(),
      handleImageSettled = (loadError: any) => {
        (clearTimeout(timeoutId),
          (importedImage.onload = null),
          (importedImage.onerror = null),
          loadError ? ((importedImage.src = ""), reject(loadError)) : resolve(importedImage));
      },
      timeoutId = setTimeout(
        () =>
          handleImageSettled(
            createCodedError("图片读取超时，请稍后重试或另存为 PNG/JPG。", "IMAGE_TIMEOUT"),
          ),
        imageTimeoutMs,
      );
    ((importedImage.onload = () => handleImageSettled(null)),
      (importedImage.onerror = () =>
        handleImageSettled(
          createCodedError("图片无法解码，请另存为 PNG/JPG 后重试。", "IMAGE_DECODE"),
        )),
      (importedImage.src = imageUrl));
  });
}
/** 底图导入过程中逐阶段回填的诊断信息，最终会拼进失败详情里给用户看。 */
export type BackgroundImportDiagnostics = {
  /** 当前阶段，如「读取文件」「解码图片」「调整图片」。 */
  stage?: string;
  /** 文件名后缀（小写），识别不出时是「无」。 */
  extension?: string;
  /** 原始文件字节数。 */
  bytes?: number;
  /** 文件声明的 MIME，缺失时是「未知」。 */
  mime?: string;
  /** 按文件头识别出的真实格式，识别失败时是「无法识别」。 */
  format?: string;
  /** 原始像素尺寸，形如「1920 × 1080」。 */
  originalSize?: string;
  /** 实际提交上传的像素尺寸。 */
  uploadSize?: string;
  /** 实际提交上传的字节数。 */
  uploadBytes?: number;
};

export async function prepareBackground(
  sourceFile: any,
  importDiagnostics: BackgroundImportDiagnostics = {},
) {
  if (
    ((importDiagnostics.stage = "读取文件"),
    (importDiagnostics.extension = sourceFile.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "无"),
    (importDiagnostics.bytes = sourceFile.size),
    (importDiagnostics.mime = sourceFile.type || "未知"),
    !sourceFile.size)
  )
    throw createCodedError("文件为空，请重新选择图片。", "EMPTY_FILE");
  const detectedFormat =
    detectBackgroundFormat(new Uint8Array(await sourceFile.slice(0, 65536).arrayBuffer())) ||
    (importDiagnostics.extension === "svg" ? "svg" : null);
  if (((importDiagnostics.format = detectedFormat || "无法识别"), !detectedFormat))
    throw createCodedError(
      "无法识别此图片格式，请另存为 PNG/JPG 后重试。PDF、CAD 和 HEIC 暂不支持直接导入。",
      "IMAGE_FORMAT",
    );
  const mimeType = detectedFormat === "svg" ? "image/svg+xml" : "image/" + detectedFormat,
    baseFileName =
      sourceFile.name
        .replace(/\.[^.]+$/, "")
        .replace(/[\x00-\x1f\x7f/\\]/g, "_")
        .replace(/^\.+/, "")
        .slice(0, 60) || "户型底图",
    targetExtension =
      detectedFormat === "jpeg"
        ? importDiagnostics.extension === "jpeg"
          ? "jpeg"
          : "jpg"
        : detectedFormat,
    isFormatCorrected =
      detectedFormat === "jpeg"
        ? !["jpg", "jpeg"].includes(importDiagnostics.extension!)
        : importDiagnostics.extension !== targetExtension;
  let file1 = new File([sourceFile], baseFileName + "." + targetExtension, {
    type: mimeType,
  });
  const adjustments = isFormatCorrected ? ["已识别并修正图片格式"] : [];
  if (detectedFormat === "svg")
    return (
      (importDiagnostics.uploadBytes = file1.size),
      {
        file: file1,
        adjustments: adjustments,
      }
    );
  importDiagnostics.stage = "解码图片";
  const fileObjectUrl = URL.createObjectURL(file1);
  let loadedImage;
  try {
    loadedImage = await loadImportedImage(fileObjectUrl);
  } finally {
    URL.revokeObjectURL(fileObjectUrl);
  }
  const originalDimensions = {
    width: loadedImage.naturalWidth,
    height: loadedImage.naturalHeight,
  };
  importDiagnostics.originalSize = originalDimensions.width + " × " + originalDimensions.height;
  const targetDimensions = backgroundTargetSize(
      originalDimensions.width,
      originalDimensions.height,
    ),
    isResizeNeeded =
      targetDimensions.width !== originalDimensions.width ||
      targetDimensions.height !== originalDimensions.height;
  if (isResizeNeeded || detectedFormat === "bmp" || detectedFormat === "gif") {
    importDiagnostics.stage = "调整图片";
    const canvasElement = document.createElement("canvas");
    try {
      ((canvasElement.width = targetDimensions.width),
        (canvasElement.height = targetDimensions.height));
      const canvasPainter = canvasElement.getContext("2d");
      if (!canvasPainter)
        throw createCodedError(
          "浏览器无法处理这张图片，请缩小尺寸或另存为 PNG/JPG 后重试。",
          "IMAGE_CANVAS",
        );
      canvasPainter.drawImage(loadedImage, 0, 0, targetDimensions.width, targetDimensions.height);
      const exportMimeType = detectedFormat === "jpeg" ? "image/jpeg" : "image/png",
        convertedBlob = await new Promise<Blob | null>((outputBlob) =>
          canvasElement.toBlob(outputBlob, exportMimeType, 0.95),
        );
      if (!convertedBlob)
        throw createCodedError("图片转换失败，请另存为 PNG/JPG 后重试。", "IMAGE_CONVERT");
      file1 = new File(
        [convertedBlob],
        baseFileName + "." + (convertedBlob.type === "image/jpeg" ? "jpg" : "png"),
        {
          type: convertedBlob.type,
        },
      );
    } finally {
      ((canvasElement.width = 0), (canvasElement.height = 0));
    }
    (isResizeNeeded &&
      adjustments.push("已自动调整为 " + targetDimensions.width + " × " + targetDimensions.height),
      (detectedFormat === "bmp" || detectedFormat === "gif") &&
        adjustments.push("已转换为静态 PNG"));
  }
  return (
    (importDiagnostics.uploadSize = targetDimensions.width + " × " + targetDimensions.height),
    (importDiagnostics.uploadBytes = file1.size),
    {
      file: file1,
      adjustments: adjustments,
    }
  );
}
export function backgroundFailure(failureError: any, failureDiagnostics: any) {
  const httpStatus = failureError?.status;
  let failureMessage = failureError?.message || "底图导入失败，请重试。";
  failureDiagnostics.stage === "上传图片"
    ? httpStatus === 413
      ? (failureMessage = "上传被服务器拒绝：文件过大，请缩小图片后重试。")
      : httpStatus >= 500
        ? (failureMessage = "服务器暂时无法接收图片，请稍后重试。")
        : httpStatus || (failureMessage = "图片上传中断或超时，请检查网络后重试。")
    : failureDiagnostics.stage === "加载底图" &&
      (failureMessage = "图片已上传，但底图加载失败，当前底图已保留。请检查网络后重试。");
  const diagnosticDetails = [
    "户型底图导入诊断",
    "失败阶段：" + (failureDiagnostics.stage || "未知"),
    "文件后缀：" + (failureDiagnostics.extension || "未知"),
    "文件大小：" + (failureDiagnostics.bytes ?? "未知") + " 字节",
    "声明类型：" + (failureDiagnostics.mime || "未知"),
    "识别格式：" + (failureDiagnostics.format || "未知"),
    "原始尺寸：" + (failureDiagnostics.originalSize || "未读取"),
    "上传尺寸：" + (failureDiagnostics.uploadSize || "未读取"),
    "上传大小：" + (failureDiagnostics.uploadBytes ?? "未知") + " 字节",
    "错误码：" + (failureError?.code || failureError?.name || "UNKNOWN"),
    "HTTP 状态：" + (httpStatus || "无"),
    "说明：" + failureMessage,
  ].join("\n");
  return {
    message: failureMessage,
    details: diagnosticDetails,
  };
}
