/**
 * 摄像头 HTTP 请求预算（上游 0.8.1 `camera-connection-budget.js` 的请求侧）。
 *
 * 为什么需要：一个楼层放 6 个以上摄像头时，快照轮询 + HLS 换票会在同一时刻发出十几条
 * 同源请求，浏览器对单一 host 的连接池只有 6 条 —— 排在后面的请求全部卡在 pending，
 * 前端看到的是「摄像头一直转圈、切层回来也不恢复」。上游的做法不是调小刷新频率，
 * 而是给所有摄像头 HTTP 请求排一个全局 2 路并发预算：卡住的那一路会尽快结束，
 * 队列里的其他摄像头每 2 路推进一次，失败的那一路也能按 `EntityRequestPolicy` 退避。
 *
 * 预算挂在 `window` 的 `Symbol.for` 上：舞台是 iframe，可视页面里同时还有编辑器/仪表盘
 * 在拉快照，两边必须共用同一个池子，否则预算等于没做。
 */

const REQUEST_BUDGET_SYMBOL = Symbol.for("ha-bridge.camera-http-request-budget");

/** 并发上限：2 路足够跑满单个摄像头的吞吐，又给其他摄像头留出连接位。 */
const DEFAULT_REQUEST_SLOTS = 2;

interface QueuedRequest {
  resolve: () => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  started: boolean;
  cancel?: () => void;
}

export type CameraRequestBudget = <Result>(
  run: () => Promise<Result>,
  signal?: AbortSignal,
) => Promise<Result>;

/** 同源顶层窗口；跨域 iframe 退回自身，拿不到 `top` 也不抛。 */
function sharedBudgetHost(): typeof globalThis & { [key: symbol]: unknown } {
  let budgetHost: typeof globalThis & { [key: symbol]: unknown } =
    (globalThis.window as typeof globalThis) || globalThis;
  try {
    const topWindow = budgetHost.top as typeof globalThis | null;
    topWindow?.location &&
      budgetHost.location &&
      topWindow.location.origin === budgetHost.location.origin &&
      (budgetHost = topWindow as typeof globalThis & { [key: symbol]: unknown });
  } catch {
    // 跨域：保持自身，预算退化为「每个页面一套」，不影响正确性。
  }
  return budgetHost;
}

export function createCameraRequestBudget(maxConcurrent = DEFAULT_REQUEST_SLOTS): CameraRequestBudget {
  let activeCount = 0;
  const pendingQueue: QueuedRequest[] = [];
  const pump = () => {
    while (activeCount < maxConcurrent && pendingQueue.length) {
      const nextRequest = pendingQueue.shift()!;
      (nextRequest.started = true),
        activeCount++,
        nextRequest.cancel && nextRequest.signal?.removeEventListener("abort", nextRequest.cancel),
        nextRequest.resolve();
    }
  };
  return async (run, signal) => {
    if (signal?.aborted) throw signal.reason;
    await new Promise<void>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        resolve,
        reject,
        signal,
        started: false,
      };
      // 排队期间被 abort：必须从队列里摘掉，否则预算会被一个已经取消的请求占住。
      ((queuedRequest.cancel = () => {
        if (queuedRequest.started) return;
        const queuedIndex = pendingQueue.indexOf(queuedRequest);
        queuedIndex >= 0 && pendingQueue.splice(queuedIndex, 1), reject(signal?.reason);
      }),
        signal?.addEventListener("abort", queuedRequest.cancel, { once: true }),
        pendingQueue.push(queuedRequest),
        pump());
    });
    try {
      if (signal?.aborted) throw signal.reason;
      return await run();
    } finally {
      (activeCount--, pump());
    }
  };
}

/** 取（或建）同源共享的摄像头请求预算。 */
export function cameraRequestBudget(): CameraRequestBudget {
  const budgetHost = sharedBudgetHost();
  return ((budgetHost[REQUEST_BUDGET_SYMBOL] as CameraRequestBudget | undefined) ||=
    createCameraRequestBudget(DEFAULT_REQUEST_SLOTS));
}

const STREAM_BUDGET_SYMBOL = Symbol.for("ha-bridge.camera-stream-budget");

export type CameraStreamLease = { release: () => void };

interface QueuedStream {
  priority: number;
  sequence: number;
  resolve: (lease: CameraStreamLease) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  started: boolean;
  cancel?: () => void;
}

/**
 * 摄像头**长连接**预算：MJPEG 与 HLS 这类一直占着连接的路数，最多同时 2 路。
 *
 * 和请求预算分开的原因：请求是「拿到就还」，流是「看完才还」。如果共用，
 * 两路 MJPEG 就会永久占满池子，所有快照轮询都饿死。
 * 优先级高的（当前可见摄像头）先拿 slot；被拒绝的流留在队列里，等前面释放后重排。
 */
export function createCameraStreamBudget(maxConcurrent = DEFAULT_REQUEST_SLOTS) {
  let activeCount = 0,
    sequence = 0;
  const pendingQueue: QueuedStream[] = [];
  const pump = () => {
    pendingQueue.sort(
      (leftStream, rightStream) =>
        rightStream.priority - leftStream.priority || leftStream.sequence - rightStream.sequence,
    );
    while (activeCount < maxConcurrent && pendingQueue.length) {
      const nextStream = pendingQueue.shift()!;
      (nextStream.started = true),
        activeCount++,
        nextStream.cancel && nextStream.signal?.removeEventListener("abort", nextStream.cancel);
      let isReleased = false;
      nextStream.resolve({
        release() {
          if (isReleased) return;
          ((isReleased = true), activeCount--, pump());
        },
      });
    }
  };
  return (priority = 0, signal?: AbortSignal): Promise<CameraStreamLease> => {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<CameraStreamLease>((resolve, reject) => {
      const queuedStream: QueuedStream = {
        priority: Number.isFinite(priority) ? priority : 0,
        sequence: sequence++,
        resolve,
        reject,
        signal,
        started: false,
      };
      ((queuedStream.cancel = () => {
        if (queuedStream.started) return;
        const queuedIndex = pendingQueue.indexOf(queuedStream);
        queuedIndex >= 0 && pendingQueue.splice(queuedIndex, 1), reject(signal?.reason);
      }),
        signal?.addEventListener("abort", queuedStream.cancel, { once: true }),
        pendingQueue.push(queuedStream),
        pump());
    });
  };
}

/** 取（或建）同源共享的摄像头流预算。 */
export function cameraStreamBudget() {
  const budgetHost = sharedBudgetHost();
  return ((budgetHost[STREAM_BUDGET_SYMBOL] as
    | ReturnType<typeof createCameraStreamBudget>
    | undefined) ||= createCameraStreamBudget(DEFAULT_REQUEST_SLOTS));
}

/** 用预算包住一次摄像头 HTTP 请求。 */
export function withCameraHttpSlot<Result>(
  run: () => Promise<Result>,
  signal?: AbortSignal,
): Promise<Result> {
  return cameraRequestBudget()(run, signal);
}
