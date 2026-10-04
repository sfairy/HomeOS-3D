/**
 * 职责：
 *  - WS 延迟消息队列（未就绪缓存+恢复 flush）；
 * 关键依赖：
 *  - ha-ws-reconnect.helper；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * HA WS 入站延迟队列：
 * - priority：大体量 result（不可丢弃）
 * - normal：state_changed 等 event（过载可丢最旧）
 * 空闲时优先 nextTick 排水，降低单条 dwell。
 */

type HaWsDeferredMessageHandler<T> = (msg: T) => void;

/**
 * HaWsDeferredEventQueue：类声明。
 * - 所属文件：backend/src/modules/ha-connector/ha-ws-message-queue.util.ts；
 * - 主要用途：封装域内职责的可复用类结构；
 * - 构造参数见 constructor 依赖注入列表；
 */
export class HaWsDeferredEventQueue<T> {
  private readonly priority: T[] = [];
  private readonly queue: T[] = [];
  private draining = false;
  private readonly maxQueue: number;

  constructor(
    private readonly onMessage: HaWsDeferredMessageHandler<T>,
    private readonly onDrop: (dropped: number) => void,
    maxQueue = 4_000,
  ) {
    this.maxQueue = maxQueue;
  }

  enqueue(msg: T, opts?: { priority?: boolean }): void {
    if (opts?.priority) {
      this.priority.push(msg);
    } else {
      if (this.queue.length >= this.maxQueue) {
        const drop = Math.floor(this.maxQueue / 2);
        this.queue.splice(0, drop);
        this.onDrop(drop);
      }
      this.queue.push(msg);
    }
    this.scheduleDrain();
  }

  clear(): void {
    this.priority.length = 0;
    this.queue.length = 0;
    this.draining = false;
  }

  private scheduleDrain(): void {
    if (this.draining) return;
    this.draining = true;
    const pending = this.priority.length + this.queue.length;
    // 短队列用 nextTick，降低 ha_deferred_dwell；积压时用 setImmediate 让出 IO
    if (pending <= 8) {
      process.nextTick(() => this.drain());
    } else {
      setImmediate(() => this.drain());
    }
  }

  private drain(): void {
    const pending = this.priority.length + this.queue.length;
    const budget = pending > 800 ? 96 : pending > 200 ? 128 : 256;
    let n = 0;
    while (n < budget && (this.priority.length || this.queue.length)) {
      const msg = this.priority.length ? this.priority.shift() : this.queue.shift();
      if (msg !== undefined) {
        try {
          this.onMessage(msg);
        } catch {
          /* 单条失败不阻断后续 */
        }
      }
      n++;
    }
    if (this.priority.length || this.queue.length) {
      setImmediate(() => this.drain());
      return;
    }
    this.draining = false;
  }
}
