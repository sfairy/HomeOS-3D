export const BACKGROUND_MAX_PIXELS = 10000000,
  BACKGROUND_MAX_DIMENSION = 8192;
function l(arg1, arg2) {
  return Object.assign(new Error(arg1), {
    code: arg2,
  });
}
export function backgroundTargetSize(arg3, arg4) {
  if (!Number.isFinite(arg3) || !Number.isFinite(arg4) || arg3 <= 0 || arg4 <= 0)
    throw l("无法读取图片尺寸，请另存为 PNG/JPG 后重试。", "IMAGE_DIMENSIONS");
  const value1 = Math.min(1, 8192 / arg3, 8192 / arg4, Math.sqrt(10000000 / (arg3 * arg4)));
  return {
    width: Math.max(1, Math.floor(arg3 * value1)),
    height: Math.max(1, Math.floor(arg4 * value1)),
  };
}
export function detectBackgroundFormat(arg5) {
  const fn1 = (...arg6) => arg6.every((arg7, arg8) => arg5[arg8] === arg7),
    fn2 = (arg9, arg10) => String.fromCharCode(...arg5.slice(arg9, arg10));
  if (fn1(137, 80, 78, 71, 13, 10, 26, 10)) return "png";
  if (fn1(255, 216, 255)) return "jpeg";
  if (fn2(0, 4) === "RIFF" && fn2(8, 12) === "WEBP") return "webp";
  if (["GIF87a", "GIF89a"].includes(fn2(0, 6))) return "gif";
  if (fn1(66, 77)) return "bmp";
  const value2 = new TextDecoder().decode(arg5).replace(/^\uFEFF/, "");
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[\s\S]*?>\s*)*<svg[\s>]/i.test(
    value2,
  )
    ? "svg"
    : null;
}
export function loadImportedImage(arg11, { timeoutMs: arg12 = 30000 } = {}) {
  return new Promise((arg13, arg14) => {
    const image1 = new Image(),
      fn3 = (arg15) => {
        (clearTimeout(value3),
          (image1.onload = null),
          (image1.onerror = null),
          arg15 ? ((image1.src = ""), arg14(arg15)) : arg13(image1));
      },
      value3 = setTimeout(
        () => fn3(l("图片读取超时，请稍后重试或另存为 PNG/JPG。", "IMAGE_TIMEOUT")),
        arg12,
      );
    ((image1.onload = () => fn3(null)),
      (image1.onerror = () => fn3(l("图片无法解码，请另存为 PNG/JPG 后重试。", "IMAGE_DECODE"))),
      (image1.src = arg11));
  });
}
export async function prepareBackground(arg16, arg17 = {}) {
  if (
    ((arg17.stage = "读取文件"),
    (arg17.extension = arg16.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "无"),
    (arg17.bytes = arg16.size),
    (arg17.mime = arg16.type || "未知"),
    !arg16.size)
  )
    throw l("文件为空，请重新选择图片。", "EMPTY_FILE");
  const value4 =
    detectBackgroundFormat(new Uint8Array(await arg16.slice(0, 65536).arrayBuffer())) ||
    (arg17.extension === "svg" ? "svg" : null);
  if (((arg17.format = value4 || "无法识别"), !value4))
    throw l(
      "无法识别此图片格式，请另存为 PNG/JPG 后重试。PDF、CAD 和 HEIC 暂不支持直接导入。",
      "IMAGE_FORMAT",
    );
  const value5 = value4 === "svg" ? "image/svg+xml" : "image/" + value4,
    value6 =
      arg16.name
        .replace(/\.[^.]+$/, "")
        .replace(/[\x00-\x1f\x7f/\\]/g, "_")
        .replace(/^\.+/, "")
        .slice(0, 60) || "户型底图",
    value7 = value4 === "jpeg" ? (arg17.extension === "jpeg" ? "jpeg" : "jpg") : value4,
    value8 =
      value4 === "jpeg" ? !["jpg", "jpeg"].includes(arg17.extension) : arg17.extension !== value7;
  let file1 = new File([arg16], value6 + "." + value7, {
    type: value5,
  });
  const value9 = value8 ? ["已识别并修正图片格式"] : [];
  if (value4 === "svg")
    return (
      (arg17.uploadBytes = file1.size),
      {
        file: file1,
        adjustments: value9,
      }
    );
  arg17.stage = "解码图片";
  const value10 = URL.createObjectURL(file1);
  let value11;
  try {
    value11 = await loadImportedImage(value10);
  } finally {
    URL.revokeObjectURL(value10);
  }
  const object1 = {
    width: value11.naturalWidth,
    height: value11.naturalHeight,
  };
  arg17.originalSize = object1.width + " × " + object1.height;
  const value12 = backgroundTargetSize(object1.width, object1.height),
    value13 = value12.width !== object1.width || value12.height !== object1.height;
  if (value13 || value4 === "bmp" || value4 === "gif") {
    arg17.stage = "调整图片";
    const value14 = document.createElement("canvas");
    try {
      ((value14.width = value12.width), (value14.height = value12.height));
      const value15 = value14.getContext("2d");
      if (!value15)
        throw l("浏览器无法处理这张图片，请缩小尺寸或另存为 PNG/JPG 后重试。", "IMAGE_CANVAS");
      value15.drawImage(value11, 0, 0, value12.width, value12.height);
      const value16 = value4 === "jpeg" ? "image/jpeg" : "image/png",
        value17 = await new Promise((arg18) => value14.toBlob(arg18, value16, 0.95));
      if (!value17) throw l("图片转换失败，请另存为 PNG/JPG 后重试。", "IMAGE_CONVERT");
      file1 = new File([value17], value6 + "." + (value17.type === "image/jpeg" ? "jpg" : "png"), {
        type: value17.type,
      });
    } finally {
      ((value14.width = 0), (value14.height = 0));
    }
    (value13 && value9.push("已自动调整为 " + value12.width + " × " + value12.height),
      (value4 === "bmp" || value4 === "gif") && value9.push("已转换为静态 PNG"));
  }
  return (
    (arg17.uploadSize = value12.width + " × " + value12.height),
    (arg17.uploadBytes = file1.size),
    {
      file: file1,
      adjustments: value9,
    }
  );
}
export function backgroundFailure(arg19, arg20) {
  const value18 = arg19?.status;
  let value19 = arg19?.message || "底图导入失败，请重试。";
  arg20.stage === "上传图片"
    ? value18 === 413
      ? (value19 = "上传被服务器拒绝：文件过大，请缩小图片后重试。")
      : value18 >= 500
        ? (value19 = "服务器暂时无法接收图片，请稍后重试。")
        : value18 || (value19 = "图片上传中断或超时，请检查网络后重试。")
    : arg20.stage === "加载底图" &&
      (value19 = "图片已上传，但底图加载失败，当前底图已保留。请检查网络后重试。");
  const value20 = [
    "户型底图导入诊断",
    "失败阶段：" + (arg20.stage || "未知"),
    "文件后缀：" + (arg20.extension || "未知"),
    "文件大小：" + (arg20.bytes ?? "未知") + " 字节",
    "声明类型：" + (arg20.mime || "未知"),
    "识别格式：" + (arg20.format || "未知"),
    "原始尺寸：" + (arg20.originalSize || "未读取"),
    "上传尺寸：" + (arg20.uploadSize || "未读取"),
    "上传大小：" + (arg20.uploadBytes ?? "未知") + " 字节",
    "错误码：" + (arg19?.code || arg19?.name || "UNKNOWN"),
    "HTTP 状态：" + (value18 || "无"),
    "说明：" + value19,
  ].join("\n");
  return {
    message: value19,
    details: value20,
  };
}
