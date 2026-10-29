/**
 * 用户图片上传（0.8.1 新增 `user-image-upload`）。
 *
 * 上传在 0.8.0 里散落在三处（资产工具条、电视海报、弹窗模块图标），每处自己写
 * MIME 白名单、错误文案和「传完刷新目录」，于是同一批文件在三个入口给出三种结果：
 * 有的漏了 SVG、有的传完不刷新、有的失败后按钮永久 disabled。
 *
 * 这里把三件事收敛成一份：
 *
 * 1. **口径**（`USER_IMAGE_ACCEPT` / `USER_IMAGE_UPLOAD_LIMITS` / 提示语）：与后端
 *    `assets.py` 的 `MAX_UPLOAD_BYTES`、`MAX_UPLOAD_DIMENSION`、`MAX_UPLOAD_PIXELS` 对齐；
 * 2. **批量状态机**：一次 `upload(files)` 顺序传完，逐个记错误，成功后刷新目录；
 * 3. **刷新可重试**：目录刷新失败不该让已经传上去的图片「看起来没上传」，
 *    保留 `retryRefresh()` 让调用方给一个重试按钮。
 *
 * ## 客户端到底拦什么（0.8.1 口径）
 *
 * 位图**不限文件大小**：20MB 是服务端的保护阈值，客户端提前拦会让「一张 4K 截图」
 * 在本地就失败，而用户其实只想让服务端自己决定。真正在本地拦的只有两件：
 * 解码出来必然超限的（总像素 / 单边，服务端也会 400，但本地拦能立刻给文案）、
 * 以及 SVG（矢量化数据没有像素，只能按体积设 5MB 上限）。
 * 空文件也在这里拦：0 字节一定会被服务端拒，早点说清楚。
 */

/** 与后端一致的客户端预检上限（服务端仍会再校验一次，这里只是提前给文案）。 */
export const USER_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const USER_IMAGE_MAX_DIMENSION = 8192;
export const USER_IMAGE_MAX_PIXELS = 10_000_000;
/** SVG 没有像素，只能按体积设上限（0.8.1 口径：5 MB）。 */
export const USER_IMAGE_MAX_SVG_BYTES = 5_000_000;
/** 单张上传的等待上限：大图解码 + 写盘，超过就按超时处理（服务端可能已经收下）。 */
export const USER_IMAGE_UPLOAD_TIMEOUT_MS = 120_000;

/** 用户能看懂的上限说明（提示语与错误文案共用一段，避免两处写岔）。 */
export const USER_IMAGE_UPLOAD_LIMITS =
  "总像素不超过 1000 万，单边不超过 8192 像素；SVG 最大 5 MB。";

/** `accept` 属性：与 `USER_IMAGE_EXTENSIONS` 保持一致，避免「选择器能选、后端拒收」。 */
export const USER_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/bmp,image/tiff,image/avif,image/heic,image/heif,image/x-icon,.png,.jpg,.jpeg,.webp,.svg,.gif,.bmp,.tif,.tiff,.ico,.avif,.heic,.heif";

/** 工具条 / 海报区的统一提示语。 */
export const USER_IMAGE_HINT =
  "支持 PNG、JPG/JPEG、WebP、SVG，可多选。" +
  USER_IMAGE_UPLOAD_LIMITS +
  "位图不限文件大小，建议先缩小大图，以免影响加载速度。";

const USER_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|svg|gif|bmp|tiff?|ico|avif|heic|heif)$/i;
const SVG_EXTENSION = /\.svg$/i;

export type UserImageRequest = (
  path: string,
  options: RequestInit & { timeoutMs?: number },
) => Promise<unknown>;

export interface UserImageUploadState {
  /** 是否正在上传 / 刷新目录（调用方据此禁用按钮）。 */
  busy: boolean;
  /** 进度或结果摘要（「正在上传 2/5：a.png。关闭窗口后会继续上传。」）。 */
  message: string;
  /** 上传失败的逐条文案（已带文件名）；没有错误时为空串。 */
  error: string;
  /** 图片已经传上去但目录刷新失败：此时应显示 `retryRefresh` 而不是「上传失败」。 */
  refreshFailed: boolean;
}

export interface UserImageUploadResult {
  uploadedAssetIds: string[];
  errors: string[];
}

export interface UserImageUploaderOptions {
  request: UserImageRequest;
  /** 上传成功后刷新资产目录（可失败，失败时保留 `retryRefresh()`）。 */
  onCatalogUpdated?: () => Promise<unknown> | unknown;
}

export interface UserImageUploader {
  readonly state: UserImageUploadState;
  readonly hint: string;
  subscribe(listener: (state: UserImageUploadState) => void): () => void;
  upload(files: FileList | File[] | null | undefined, kind?: string): Promise<UserImageUploadResult>;
  retryRefresh(): Promise<boolean>;
  dispose(): void;
}

export function isUserImageFile(file: { name?: string; type?: string } | null | undefined) {
  if (!file) return false;
  return USER_IMAGE_EXTENSIONS.test(file.name || "") || String(file.type || "").startsWith("image/");
}

/**
 * 选择阶段的本地预检：返回错误文案，`null` 表示可以上传。
 *
 * 只拦「一定会被服务端拒」的情况，并给出可执行的下一步（转换格式 / 精简 / 重选），
 * 而不是笼统的「文件有问题」。
 */
export function userImageFileProblem(file: { name?: string; size?: number }): string | null {
  if (!isUserImageFile(file)) return "仅支持 PNG、JPG/JPEG、WebP 和 SVG，请转换格式后重试。";
  const size = Number(file.size ?? 0);
  if (size <= 0) return "文件为空，请重新选择图片。";
  if (SVG_EXTENSION.test(file.name || "") && size > USER_IMAGE_MAX_SVG_BYTES)
    return "SVG 文件超过 5 MB，请精简后重试。";
  return null;
}

/**
 * 统一错误文案：先按**错误类别**给出可执行提示，再回落到服务端 `detail / message`。
 *
 * 这三类错误各有各的下一步：超时不能直接重试（可能已经传上去了），413 只能压缩，
 * 5xx 是服务端问题。混成一句「上传失败」会让用户重复上传同一张图。
 */
export function imageUploadError(error: unknown, fallback = "图片上传失败，请重试。"): string {
  if (error && typeof error === "object") {
    const record = error as {
      name?: unknown;
      status?: unknown;
      message?: unknown;
      detail?: unknown;
      error?: unknown;
    };
    if (record.name === "TimeoutError")
      return "上传超时，请检查网络；可先在“我的图片”中确认是否已经上传。";
    if (record.status === 413) return "文件过大，上传被服务器拒绝，请压缩文件后重试。";
    if (typeof record.status === "number" && record.status >= 500)
      return "服务器暂时无法接收图片，请稍后重试。";
    if (record.name === "TypeError" || error instanceof TypeError)
      return "网络连接中断，请检查网络后重试。";
    const detail = record.detail ?? record.message ?? record.error;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error === "timeout" ? "上传超时，请检查网络；可先在“我的图片”中确认是否已经上传。" : error.trim();
  }
  return fallback;
}

/** 造一个 `TimeoutError`：调用方只需按 `name` 判定，不用区分 AbortError 的来源。 */
export function userImageTimeoutError(): Error {
  const timeoutError = new Error("上传超时");
  timeoutError.name = "TimeoutError";
  return timeoutError;
}

/**
 * 默认请求实现：`fetch` + `credentials: same-origin`，非 2xx 时抛出服务端 `detail`。
 *
 * 单独导出给「只有 `fetch`、没有编辑器 `requestJson`」的调用方（例如配置页海报上传）
 * 用，避免每处再抄一遍错误解析。
 */
export async function fetchUserImageJson(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const { timeoutMs, ...requestOptions } = options,
    requestAbortController = new AbortController(),
    timeoutId = timeoutMs
      ? setTimeout(() => requestAbortController.abort("timeout"), timeoutMs)
      : null;
  try {
    const response = await fetch(`/api/v1${path}`, {
      ...requestOptions,
      credentials: "same-origin",
      signal: requestAbortController.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: unknown;
      message?: unknown;
      error?: unknown;
    };
    if (!response.ok) {
      const httpError = new Error(imageUploadError(payload, "图片上传失败，请重试。")) as Error & {
        status?: number;
      };
      httpError.status = response.status;
      throw httpError;
    }
    return payload;
  } catch (requestError: unknown) {
    if (requestAbortController.signal.aborted && requestAbortController.signal.reason === "timeout")
      throw userImageTimeoutError();
    throw requestError;
  } finally {
    timeoutId !== null && clearTimeout(timeoutId);
  }
}

function uploadedAssetIdOf(payload: unknown): string {
  const record = (payload ?? {}) as {
    assetId?: unknown;
    data?: { assetId?: unknown };
  };
  return String(record.assetId ?? record.data?.assetId ?? "")
    .trim()
    .toLowerCase();
}

/** 单张上传：返回规范化后的 `user:<32hex>`；结果不合法直接抛错（与海报上传同一口径）。 */
export async function uploadUserImage(
  file: File,
  { request, kind }: { request: UserImageRequest; kind?: string },
): Promise<string> {
  const payload = await request("/assets/user" + (kind ? `?kind=${encodeURIComponent(kind)}` : ""), {
    method: "POST",
    timeoutMs: USER_IMAGE_UPLOAD_TIMEOUT_MS,
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
  });
  const assetId = uploadedAssetIdOf(payload);
  if (!/^user:[0-9a-f]{32}$/.test(assetId))
    throw new Error("上传结果无效，请刷新图片列表确认后再重试。");
  return assetId;
}

/**
 * 批量上传状态机。
 *
 * 顺序执行（不并发）：后端写盘 + 图像解码，并发只会把「哪张失败」的反馈搅乱；
 * 单张失败不中断整批，最后按「文件名：原因」聚合，和 0.8.0 的批量上传文案一致。
 */
export function createUserImageUploader({
  request,
  onCatalogUpdated,
}: UserImageUploaderOptions): UserImageUploader {
  let state: UserImageUploadState = { busy: false, message: "", error: "", refreshFailed: false },
    isDisposed = false;

  const listeners = new Set<(state: UserImageUploadState) => void>();
  const emit = (patch: Partial<UserImageUploadState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };
  const refreshCatalog = async () => {
    if (!onCatalogUpdated) return true;
    try {
      await onCatalogUpdated();
      state.refreshFailed && emit({ refreshFailed: false });
      return true;
    } catch (refreshError) {
      emit({ refreshFailed: true, error: imageUploadError(refreshError, "图片已上传，但目录刷新失败，请重试。") });
      return false;
    }
  };

  return {
    get state() {
      return state;
    },
    hint: USER_IMAGE_HINT,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async upload(files, kind) {
      const selectedFiles = Array.from(files ?? []);
      const result: UserImageUploadResult = { uploadedAssetIds: [], errors: [] };
      if (isDisposed || state.busy || !selectedFiles.length) return result;
      emit({ busy: true, error: "", message: "", refreshFailed: false });
      try {
        for (const [fileIndex, file] of selectedFiles.entries()) {
          // 进度文案带上「关闭窗口后会继续上传」：上传不随弹窗销毁而中断，
          // 用户看不到进度时最容易重复点击，进而传上去两份。
          emit({
            message: `正在上传 ${fileIndex + 1}/${selectedFiles.length}：${file.name}。关闭窗口后会继续上传。`,
          });
          const fileProblem = userImageFileProblem(file);
          if (fileProblem) {
            result.errors.push(`${file.name}：${fileProblem}`);
            continue;
          }
          try {
            result.uploadedAssetIds.push(await uploadUserImage(file, { request, kind }));
          } catch (uploadError) {
            result.errors.push(`${file.name}：${imageUploadError(uploadError)}`);
          }
        }
        const uploadedCount = result.uploadedAssetIds.length;
        if (uploadedCount) {
          emit({ message: "正在刷新图片列表…" });
          await refreshCatalog();
        }
        emit({
          message: uploadedCount
            ? `已上传 ${uploadedCount} 张图片${result.errors.length ? `，${result.errors.length} 张未上传` : ""}。`
            : `${result.errors.length} 张图片未上传。`,
        });
      } finally {
        // 刷新失败的文案由 `refreshCatalog()` 写进 `state.error`；不要用（可能为空的）
        // 上传错误覆盖它，否则「图片已上传但目录没刷新」会被显示成成功。
        emit({ busy: false, error: result.errors.join("\n") || state.error });
      }
      return result;
    },
    async retryRefresh() {
      if (isDisposed || !state.refreshFailed) return false;
      emit({ busy: true, message: "正在刷新图片列表…" });
      try {
        const refreshed = await refreshCatalog();
        refreshed && emit({ error: "" });
        return refreshed;
      } finally {
        emit({ busy: false });
      }
    },
    dispose() {
      (listeners.clear(), (isDisposed = true));
    },
  };
}
