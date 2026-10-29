/**
 * 摄像头 MJPEG 帧流（上游 0.8.1 `camera-mjpeg.js`）。
 *
 * 为什么不用 `<img src="/api/camera_proxy_stream/...">` 直接吃 multipart：
 * 浏览器对 multipart `<img>` 的支持并不可靠（Safari 有时只渲染第一帧、
 * 断流后不会重新建立连接），而且拿不到「这一帧到底有没有到」。
 * 这里改成 `fetch` + 手工拆 multipart，把每一帧换成 objectURL 交给 `<img>`，
 * 既能确认帧到达，也能在失败时给出具体原因。
 *
 * 守卫（与后端 `x-hb-camera-stream: frames` 协议配套）：
 * - 单帧头 8 KiB、单帧 8 MiB 上限，超限立刻停流，避免恶意/异常服务打爆内存；
 * - 帧必须以 JPEG SOI（FF D8）开头，防止把错误页当图片。
 */
const FRAME_HEADER_LIMIT_BYTES = 8192;
const FRAME_BYTES_LIMIT = 8 * 1024 * 1024;
const CRLF = new Uint8Array([13, 10]);
const HEADER_TERMINATOR = new Uint8Array([13, 10, 13, 10]);

export const CAMERA_MJPEG_ERRORS = {
  network: "摄像头视频流连接失败，请稍后重试。",
  format: "摄像头视频流格式不正确。",
  frameTooLarge: "摄像头视频帧过大，已停止播放。",
  interrupted: "摄像头视频流已中断，请重新连接。",
} as const;

export type CameraMjpegErrorCode = keyof typeof CAMERA_MJPEG_ERRORS;

export class CameraMjpegError extends Error {
  code: CameraMjpegErrorCode;

  constructor(code: CameraMjpegErrorCode) {
    super(CAMERA_MJPEG_ERRORS[code]);
    this.name = "CameraMjpegError";
    this.code = code;
  }
}

/** 从 `multipart/x-mixed-replace; boundary=...` 里取 boundary（带引号也接受）。 */
export function parseMultipartBoundary(contentType: unknown) {
  if (typeof contentType !== "string" || !/multipart\/x-mixed-replace/i.test(contentType))
    return "";
  const boundaryMatch = /boundary\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return (boundaryMatch?.[1] || boundaryMatch?.[2] || "").trim();
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, fromIndex = 0) {
  const lastStart = haystack.length - needle.length;
  outer: for (let startIndex = Math.max(0, fromIndex); startIndex <= lastStart; startIndex += 1) {
    for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1)
      if (haystack[startIndex + needleIndex] !== needle[needleIndex]) continue outer;
    return startIndex;
  }
  return -1;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!left.length) return right as Uint8Array<ArrayBuffer>;
  const combined = new Uint8Array(left.length + right.length);
  (combined.set(left), combined.set(right, left.length));
  return combined;
}

function decodeHeader(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes);
}

/**
 * 逐帧读取 multipart 响应体。
 *
 * 返回的是帧字节（不含 part 头与 boundary），调用方决定怎么展示。
 * 流自然结束视为「中断」：MJPEG 是长连接，正常只会在页面关闭/abort 时结束。
 */
export async function* readMjpegFrames(
  body: ReadableStream<Uint8Array>,
  boundary: string,
  {
    maxHeaderBytes = FRAME_HEADER_LIMIT_BYTES,
    maxFrameBytes = FRAME_BYTES_LIMIT,
  }: { maxHeaderBytes?: number; maxFrameBytes?: number } = {},
): AsyncGenerator<Uint8Array> {
  if (!boundary) throw new CameraMjpegError("format");
  const reader = body.getReader(),
    boundaryBytes = new TextEncoder().encode("--" + boundary),
    frameBoundaryBytes = concatBytes(CRLF, boundaryBytes);
  let buffer = new Uint8Array(0),
    isClosed = false;
  const readMore = async () => {
    const chunk = await reader.read();
    if (chunk.done) return false;
    buffer = concatBytes(buffer, chunk.value);
    return true;
  };
  try {
    while (!isClosed) {
      // 1) 找到 part 头结束（空行）。首个 boundary 也在这段里。
      let headerEnd = indexOfBytes(buffer, HEADER_TERMINATOR);
      while (headerEnd < 0) {
        if (buffer.length > maxHeaderBytes) throw new CameraMjpegError("format");
        if (!(await readMore())) return;
        headerEnd = indexOfBytes(buffer, HEADER_TERMINATOR);
      }
      if (headerEnd > maxHeaderBytes) throw new CameraMjpegError("format");
      const headerText = decodeHeader(buffer.slice(0, headerEnd)),
        contentLengthMatch = /content-length\s*:\s*(\d+)/i.exec(headerText);
      if (!/content-type\s*:\s*image\/jpe?g/i.test(headerText))
        throw new CameraMjpegError("format");
      if (contentLengthMatch && Number(contentLengthMatch[1]) > maxFrameBytes)
        throw new CameraMjpegError("frameTooLarge");
      buffer = buffer.slice(headerEnd + HEADER_TERMINATOR.length);

      // 2) 找到下一段 boundary（前面带 CRLF）。
      let frameEnd = indexOfBytes(buffer, frameBoundaryBytes);
      while (frameEnd < 0) {
        if (buffer.length > maxFrameBytes + frameBoundaryBytes.length + 2)
          throw new CameraMjpegError("frameTooLarge");
        if (!(await readMore())) {
          isClosed = true;
          break;
        }
        frameEnd = indexOfBytes(buffer, frameBoundaryBytes);
      }
      if (frameEnd < 0) break;
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + frameBoundaryBytes.length);
      if (frame.length > maxFrameBytes) throw new CameraMjpegError("frameTooLarge");
      // 空 part（有些服务在换行处多发一个 boundary）直接跳过。
      if (!frame.length) continue;
      if (frame[0] !== 0xff || frame[1] !== 0xd8) throw new CameraMjpegError("format");
      yield frame;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // 已经 abort / 释放：无需再取消。
    }
  }
}

type CameraMjpegOptions = {
  url: string;
  onFrame: (objectUrl: string) => void;
  onError?: (message: string, code: CameraMjpegErrorCode) => void;
  /** 服务端不是 `frames` 协议时：调用方回退到原生 `<img src=url>`。 */
  onFallback?: () => void;
  fetchImpl?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (objectUrl: string) => void;
  signal?: AbortSignal;
};

/**
 * 建立并驱动一路 MJPEG。返回句柄只在调用 `dispose()` 后释放。
 * 当前帧的 objectURL 由本模块负责 revoke；`onFrame` 只读不要再持有。
 */
export function createCameraMjpegStream({
  url,
  onFrame,
  onError,
  onFallback,
  fetchImpl = (input, init) => fetch(input, init),
  createObjectUrl = (blob) => URL.createObjectURL(blob),
  revokeObjectUrl = (objectUrl) => URL.revokeObjectURL(objectUrl),
  signal,
}: CameraMjpegOptions) {
  let controller: AbortController | null = null,
    currentObjectUrl = "",
    isDisposed = false,
    isRunning = false;
  const abortFromOutside = () => controller?.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromOutside, { once: true });

  const reportError = (code: CameraMjpegErrorCode) => {
    if (!isDisposed) onError?.(CAMERA_MJPEG_ERRORS[code], code);
  };

  const start = async () => {
    if (isRunning || isDisposed) return;
    isRunning = true;
    controller = new AbortController();
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "multipart/x-mixed-replace, image/jpeg" },
      });
      if (!response.ok) throw new CameraMjpegError("network");
      const boundary = parseMultipartBoundary(response.headers.get("content-type"));
      if (!boundary || !response.body) {
        // 服务端没有开帧协议：立刻释放这路请求，交给原生图片流。
        controller.abort();
        !isDisposed && onFallback?.();
        return;
      }
      for await (const frame of readMjpegFrames(response.body, boundary)) {
        if (isDisposed) return;
        const nextObjectUrl = createObjectUrl(
            new Blob([frame as unknown as BlobPart], { type: "image/jpeg" }),
          ),
          previousObjectUrl = currentObjectUrl;
        currentObjectUrl = nextObjectUrl;
        onFrame(nextObjectUrl);
        if (previousObjectUrl) revokeObjectUrl(previousObjectUrl);
      }
      reportError("interrupted");
    } catch (streamError: unknown) {
      if (
        isDisposed ||
        (streamError instanceof Error && streamError.name === "AbortError") ||
        (typeof streamError === "object" &&
          streamError !== null &&
          (streamError as { code?: unknown }).code === "ABORT_ERR")
      )
        return;
      reportError(streamError instanceof CameraMjpegError ? streamError.code : "network");
    } finally {
      isRunning = false;
    }
  };

  return {
    start,
    dispose() {
      (isDisposed = true),
        signal?.removeEventListener("abort", abortFromOutside),
        controller?.abort();
      const lastObjectUrl = currentObjectUrl;
      currentObjectUrl = "";
      lastObjectUrl && revokeObjectUrl(lastObjectUrl);
    },
    get active() {
      return isRunning && !isDisposed;
    },
  };
}
