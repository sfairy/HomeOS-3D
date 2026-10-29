/**
 * 用户图片上传（0.8.1 新增 `user-image-upload`）。
 *
 * 上传在 0.8.0 里散落在三处（资产工具条、电视海报、弹窗模块图标），每处自己写
 * MIME 白名单、错误文案和「传完刷新目录」，于是同一批文件在三个入口给出三种结果：
 * 有的漏了 SVG、有的传完不刷新、有的失败后按钮永久 disabled。
 *
 * 这里把三件事收敛成一份：
 *
 * 1. **口径**（`USER_IMAGE_ACCEPT` / 提示语 / 上限）：与后端 `assets.py` 的
 *    `MAX_UPLOAD_BYTES`、`MAX_UPLOAD_DIMENSION`、`MAX_UPLOAD_PIXELS` 对齐；
 * 2. **批量状态机**：一次 `upload(files)` 顺序传完，逐个记错误，成功后刷新目录；
 * 3. **刷新可重试**：目录刷新失败不该让已经传上去的图片「看起来没上传」，
 *    保留 `retryRefresh()` 让调用方给一个重试按钮。
 */

/** 与后端一致的客户端预检上限（服务端仍会再校验一次，这里只是提前给文案）。 */
export const USER_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const USER_IMAGE_MAX_DIMENSION = 8192;
export const USER_IMAGE_MAX_PIXELS = 10_000_000;

/** `accept` 属性：与 `USER_IMAGE_EXTENSIONS` 保持一致，避免「选择器能选、后端拒收」。 */
export const USER_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/bmp,image/tiff,image/avif,image/heic,image/heif,image/x-icon,.png,.jpg,.jpeg,.webp,.svg,.gif,.bmp,.tif,.tiff,.ico,.avif,.heic,.heif";

/** 工具条 / 海报区的统一提示语。 */
export const USER_IMAGE_HINT = "支持 PNG、JPG、WebP、SVG，单张不超过 20MB、8192px。";

const USER_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|svg|gif|bmp|tiff?|ico|avif|heic|heif)$/i;

export type UserImageRequest = (
  path: string,
  options: RequestInit & { timeoutMs?: number },
) => Promise<unknown>;

export interface UserImageUploadState {
  /** 是否正在上传 / 刷新目录（调用方据此禁用按钮）。 */
  busy: boolean;
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

/** 统一错误文案：优先服务端 `detail / message / error`，其次 `Error.message`。 */
export function imageUploadError(error: unknown, fallback = "图片上传失败，请重试。"): string {
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; detail?: unknown; error?: unknown };
    const detail = record.detail ?? record.message ?? record.error;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
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
    if (!response.ok)
      throw new Error(imageUploadError(payload, "图片上传失败，请重试。"));
    return payload;
  } finally {
    timeoutId !== null && clearTimeout(timeoutId);
  }
}

function uploadedAssetIdOf(payload: unknown): string {  const record = (payload ?? {}) as {
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
    timeoutMs: 120_000,
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
  });
  const assetId = uploadedAssetIdOf(payload);
  if (!/^user:[0-9a-f]{32}$/.test(assetId)) throw new Error("图片上传结果无效，请重试。");
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
  let state: UserImageUploadState = { busy: false, error: "", refreshFailed: false },
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
      if (isDisposed || !selectedFiles.length) return result;
      emit({ busy: true, error: "", refreshFailed: false });
      try {
        for (const file of selectedFiles) {
          if (!isUserImageFile(file)) {
            result.errors.push(`${file.name}：仅支持 PNG、JPG、WebP、SVG 等图片格式`);
            continue;
          }
          if (file.size > USER_IMAGE_MAX_BYTES) {
            result.errors.push(`${file.name}：图片超过 20MB，请压缩后再上传`);
            continue;
          }
          try {
            result.uploadedAssetIds.push(await uploadUserImage(file, { request, kind }));
          } catch (uploadError) {
            result.errors.push(`${file.name}：${imageUploadError(uploadError)}`);
          }
        }
        if (result.uploadedAssetIds.length) await refreshCatalog();
      } finally {
        // 刷新失败的文案由 `refreshCatalog()` 写进 `state.error`；不要用（可能为空的）
        // 上传错误覆盖它，否则「图片已上传但目录没刷新」会被显示成成功。
        emit({ busy: false, error: result.errors.join("\n") || state.error });
      }
      return result;
    },
    async retryRefresh() {
      if (isDisposed || !state.refreshFailed) return false;
      emit({ busy: true });
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
