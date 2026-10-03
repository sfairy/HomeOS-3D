/**
 * HA WS 断连期间 call_service 缓冲队列（HaConnectorCommandQueue）
 *
 * 所属模块：ha-connector
 * 职责：
 *  - HA WebSocket 断连期间缓存 call_service 命令，重连后按顺序 flush 到 Leader。
 *  - 单条命令 TTL + 队列容量上限：超 TTL 或队列满时丢弃并记录快照（droppedRecent），
 *    供上层查询与重试（droppedRecent 最多保留 MAX_DROPPED=20 条）。
 *  - 幂等键去重：同 requestId 命令在断连窗口内只入队一次，flush 时 Leader 端再去重。
 *  - restart 原因（进程重启）的丢弃命令也纳入快照，便于启动后通知用户补发。
 * 关键依赖：BusinessException、API_ERROR、HaConnectorCommandQueueCallbacks（由 HaConnectorService 注入）。
 */
import { BusinessException, ErrorCode } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';

/** 队列条目：携带服务调用参数、入队时间、单条 TTL、幂等键与 Promise resolve/reject */
type HaCommandQueueEntry = {
  domain: string;
  service: string;
  entityId: string;
  serviceData?: Record<string, unknown>;
  returnResponse?: boolean;
  enqueuedAt: number;
  /** 单条覆盖 TTL（毫秒）；未设置时取 callbacks.getTtlMs() 全局值 */
  ttlMs?: number;
  /** 幂等键：同键命令在断连窗口内只入队一次，flush 时 Leader 端去重 */
  requestId?: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

/** 命令丢弃原因：ttl（超时）/ full（队列满）/ restart（进程重启） */
type HaDroppedCommandReason = 'ttl' | 'full' | 'restart';

/** 已丢弃命令快照：供上层查询与重试（不携带 resolve/reject，仅记录参数与原因） */
type HaDroppedCommandSnapshot = {
  domain: string;
  service: string;
  entityId: string;
  serviceData?: Record<string, unknown>;
  reason: HaDroppedCommandReason;
  at: number;
};

/** 队列依赖回调集合（由 HaConnectorService 组装并注入） */
type HaConnectorCommandQueueCallbacks = {
  send: (
    domain: string,
    service: string,
    entityId: string,
    serviceData?: Record<string, unknown>,
    returnResponse?: boolean,
  ) => Promise<unknown>;
  emitDropped: (
    reason: HaDroppedCommandReason,
    count?: number,
    command?: Omit<HaDroppedCommandSnapshot, 'reason' | 'at'>,
  ) => void;
  getMax: () => number;
  getTtlMs: () => number;
  isConnected: () => boolean;
  persistDropped?: (items: HaDroppedCommandSnapshot[]) => void;
};

/**
 * HA WS 断连期间的 call_service 缓冲队列（TTL + 容量上限，重连后 flush）。
 * 命令入队后等待 WS 重连 flush；超过 TTL 或容量上限的命令会被丢弃并通知上层。
 */
export class HaConnectorCommandQueue {
  private readonly queue: HaCommandQueueEntry[] = [];
  private readonly droppedRecent: HaDroppedCommandSnapshot[] = [];
  private static readonly MAX_DROPPED = 20;

  constructor(private readonly callbacks: HaConnectorCommandQueueCallbacks) {}

  /** @returns 当前队列长度。 */
  get length(): number {
    return this.queue.length;
  }

  enqueue(
    domain: string,
    service: string,
    entityId: string,
    serviceData?: Record<string, unknown>,
    returnResponse?: boolean,
    opts?: { ttlMs?: number; requestId?: string },
  ): Promise<unknown> {
    this.dropExpired();
    // 同幂等键命令已在队列中等待 flush：挂接到其结算结果，避免断连窗口内重复入队
    if (opts?.requestId) {
      const existing = this.queue.find((item) => item.requestId === opts.requestId);
      if (existing) {
        return new Promise((resolve, reject) => {
          const origResolve = existing.resolve;
          const origReject = existing.reject;
          existing.resolve = (value: unknown) => {
            origResolve(value);
            resolve(value);
          };
          existing.reject = (reason: unknown) => {
            origReject(reason);
            reject(reason);
          };
        });
      }
    }
    if (this.queue.length >= this.callbacks.getMax()) {
      this.recordDropped('full', { domain, service, entityId, serviceData });
      return Promise.reject(
        new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, API_ERROR.HA_COMMAND_QUEUE_FULL),
      );
    }
    return new Promise((resolve, reject) => {
      this.queue.push({
        domain,
        service,
        entityId,
        serviceData,
        returnResponse,
        enqueuedAt: Date.now(),
        ttlMs: opts?.ttlMs,
        requestId: opts?.requestId,
        resolve,
        reject,
      });
    });
  }

  /** 单条是否已过期：优先使用条目自身的 ttlMs，否则回退全局配置 */
  private isExpired(item: HaCommandQueueEntry, now: number): boolean {
    return now - item.enqueuedAt > (item.ttlMs ?? this.callbacks.getTtlMs());
  }

  flush(): void {
    while (this.queue.length > 0) {
      const item = this.queue[0];
      if (this.isExpired(item, Date.now())) {
        this.queue.shift();
        this.recordDropped('ttl', item);
        item.reject(
          new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, API_ERROR.HA_COMMAND_QUEUE_TTL_EXPIRED),
        );
        continue;
      }
      if (!this.callbacks.isConnected()) break;
      this.queue.shift();
      this.callbacks
        .send(item.domain, item.service, item.entityId, item.serviceData, item.returnResponse)
        .then(item.resolve)
        .catch(item.reject);
    }
  }

  dropExpired(): void {
    const now = Date.now();
    while (this.queue.length > 0) {
      const item = this.queue[0];
      if (!this.isExpired(item, now)) break;
      this.queue.shift();
      this.recordDropped('ttl', item);
      item.reject(
        new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, API_ERROR.HA_COMMAND_QUEUE_TTL_EXPIRED),
      );
    }
  }

  rejectAll(message: string): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) item.reject(new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, message));
    }
  }

  getDroppedRecent(): HaDroppedCommandSnapshot[] {
    return this.droppedRecent.slice();
  }

  async retryDropped(): Promise<{ retried: number; queued: number; failed: number }> {
    const items = this.droppedRecent.splice(0);
    let retried = 0;
    let queued = 0;
    let failed = 0;
    const connected = this.callbacks.isConnected();
    for (const item of items) {
      try {
        if (connected) {
          await this.callbacks.send(item.domain, item.service, item.entityId, item.serviceData);
          retried += 1;
        } else {
          void this.enqueue(item.domain, item.service, item.entityId, item.serviceData);
          queued += 1;
        }
      } catch {
        failed += 1;
        this.recordDropped(item.reason, item, false);
      }
    }
    this.callbacks.persistDropped?.(this.droppedRecent.slice());
    return { retried, queued, failed };
  }

  private recordDropped(
    reason: HaDroppedCommandReason,
    command: {
      domain: string;
      service: string;
      entityId: string;
      serviceData?: Record<string, unknown>;
    },
    emit = true,
  ): void {
    const snap: HaDroppedCommandSnapshot = {
      domain: command.domain,
      service: command.service,
      entityId: command.entityId,
      serviceData: command.serviceData,
      reason,
      at: Date.now(),
    };
    this.droppedRecent.push(snap);
    while (this.droppedRecent.length > HaConnectorCommandQueue.MAX_DROPPED) {
      this.droppedRecent.shift();
    }
    if (emit) this.callbacks.emitDropped(reason, 1, snap);
    this.callbacks.persistDropped?.(this.droppedRecent.slice());
  }

  hydrateDropped(items: HaDroppedCommandSnapshot[]): void {
    this.droppedRecent.length = 0;
    for (const item of items) {
      if (!item?.entityId || !item.domain || !item.service) continue;
      const reason: HaDroppedCommandReason =
        item.reason === 'full' || item.reason === 'restart' ? item.reason : 'ttl';
      this.droppedRecent.push({
        domain: String(item.domain),
        service: String(item.service),
        entityId: String(item.entityId),
        serviceData: item.serviceData,
        reason,
        at: Number(item.at) || Date.now(),
      });
    }
    while (this.droppedRecent.length > HaConnectorCommandQueue.MAX_DROPPED) {
      this.droppedRecent.shift();
    }
  }

  /** 进程退出时把未 flush 的排队指令转入可重试列表（原 HTTP 等待已无法兑现） */
  parkPendingAsDropped(): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) continue;
      this.recordDropped('restart', item, false);
      item.reject(
        new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          API_ERROR.HA_COMMAND_QUEUE_INSTANCE_STOPPING,
        ),
      );
    }
    this.callbacks.persistDropped?.(this.droppedRecent.slice());
  }
}
