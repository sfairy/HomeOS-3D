/**
 * 发往宿主的控制请求挂起表：requestId → { resolve, reject, timeout, ...附加字段 }。
 * 由宿主回传的 `control-result` 或本地超时回调结算，二者先到者生效。
 */

type ControlRequestEntry = {
  resolve(value?: unknown): void
  reject(error: Error): void
  [extra: string]: unknown
}

export type PendingControlRequest = ControlRequestEntry & { timeout: ReturnType<typeof setTimeout> }

export function trackControlRequest(
  requests: Map<string, PendingControlRequest>,
  requestId: string,
  entry: ControlRequestEntry,
  timeoutMs: number,
  onTimeout: () => void,
): void {
  requests.set(requestId, { ...entry, timeout: setTimeout(onTimeout, timeoutMs) })
}

export function settleControlRequest(
  requests: Map<string, PendingControlRequest>,
  requestId: string,
  errorMessage: string | null | undefined,
): void {
  const entry = requests.get(requestId)
  if (!entry) return
  clearTimeout(entry.timeout)
  requests.delete(requestId)
  if (errorMessage) entry.reject(new Error(errorMessage))
  else entry.resolve()
}
