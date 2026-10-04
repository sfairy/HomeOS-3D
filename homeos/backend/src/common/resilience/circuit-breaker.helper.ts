/**
 * 断路器与后台任务调度工具
 *
 * 职责：
 *   - scheduleBackgroundTask：异步后台任务隔离执行，吞掉异常仅记录警告，
 *     防止后台任务异常打断主流程；
 *   - CircuitBreaker：经典三态（closed / open / half_open）断路器，对不稳定下游
 *     （如 HA、第三方集成）做快速失败保护，半开期单探测限制避免雪崩；
 *   - CircuitOpenError：断路器打开时抛出的可重试错误，携带 retryAfterSeconds 提示。
 * 关键依赖：
 *   - @nestjs/common#Logger：状态切换与失败日志输出
 */
import { getErrorMessage } from '../utils';
import { Logger } from '@nestjs/common';

/**
 * 异步后台任务隔离执行器：用 setImmediate 将任务移出当前调用栈，
 * 失败仅 logger.warn 不抛错，避免后台任务异常打断主流程。
 *
 * @param logger 调用方 Logger 实例
 * @param label  任务标识，用于失败日志定位
 * @param task   要执行异步任务
 */
export function scheduleBackgroundTask(
  logger: Logger,
  label: string,
  task: () => Promise<unknown>,
) {
  setImmediate(() => {
    // then() 才能接住 task() 里的同步抛错（如 prisma.runtimeKv 未生成）
    Promise.resolve()
      .then(task)
      .catch((err) => {
        logger.warn(`${label} 失败: ${getErrorMessage(err)}`);
      });
  });
}

/**
 * 三态断路器（closed → open → half_open → closed）。
 *
 * 适用于保护不稳定的下游调用（Home Assistant、第三方集成等）：
 *   - closed：正常放行，连续失败到 failureThreshold 时切换为 open；
 *   - open：快速失败，直接抛 CircuitOpenError；经过 recoveryTimeout 后进入 half_open；
 *   - half_open：仅放行单个探测请求，连续成功 halfOpenMaxAttempts 次后回到 closed，
 *     任意失败立即重回 open。
 * 半开期 halfOpenInProgress 锁保证同一时刻仅一个探测在途，避免并发请求一拥而上击穿下游。
 */
export class CircuitBreaker {
  private readonly logger: Logger;
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  // 半开期只允许单个探测请求通过，其余快速失败
  private halfOpenInProgress = false;

  // 运行指标
  private metrics = {
    totalCalls: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    rejectedWhileOpen: 0,
    openedCount: 0,
    lastOpenedAt: 0,
    lastError: '' as string,
  };

  /**
   * @param name    断路器名称，用于日志与 CircuitOpenError 文案
   * @param options 可选项：failureThreshold / recoveryTimeout / halfOpenMaxAttempts
   */
  constructor(
    private readonly name: string,
    private readonly options: {
      failureThreshold?: number;
      recoveryTimeout?: number;
      halfOpenMaxAttempts?: number;
    } = {},
  ) {
    this.logger = new Logger(`CircuitBreaker:${name}`);
  }

  /** 连续失败次数阈值，达到后熔断；默认 3 */
  get failureThreshold() {
    return this.options.failureThreshold ?? 3;
  }
  /** open 状态持续时间（ms），到期后允许进入 half_open 探测；默认 30000 */
  get recoveryTimeout() {
    return this.options.recoveryTimeout ?? 30000;
  }
  /** half_open 状态下连续成功多少次后回到 closed；默认 2 */
  get halfOpenMaxAttempts() {
    return this.options.halfOpenMaxAttempts ?? 2;
  }

  /**
   * 执行受断路器保护的异步任务。
   * 状态机：
   *   - open 且未到 recoveryTimeout：抛 CircuitOpenError；
   *   - open 已到 recoveryTimeout：切换为 half_open，放行单个探测；
   *   - half_open 且已有探测在途：快速失败抛 CircuitOpenError；
   *   - 其余情况：执行 fn，按结果调用 onSuccess / onFailure。
   *
   * @param fn 要执行的异步任务
   * @returns fn 的返回值
   * @throws CircuitOpenError 断路器打开或半开期被快速拒绝时抛出
   */
  async fire<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.state = 'half_open';
        this.successCount = 0;
        this.halfOpenInProgress = false;
        this.logger.log(`${this.name}: 进入半开状态,尝试恢复...`);
      } else {
        const remaining = Math.ceil(
          (this.recoveryTimeout - (Date.now() - this.lastFailureTime)) / 1000,
        );
        this.metrics.rejectedWhileOpen++;
        this.logger.warn(`${this.name}: 断路器打开,${remaining}秒后重试`);
        throw new CircuitOpenError(this.name, remaining);
      }
    }

    // 半开期单探测：已有探测在途时快速失败，避免并发请求一拥而上
    if (this.state === 'half_open' && this.halfOpenInProgress) {
      this.metrics.rejectedWhileOpen++;
      throw new CircuitOpenError(this.name, Math.ceil(this.recoveryTimeout / 1000));
    }
    const probing = this.state === 'half_open';
    if (probing) this.halfOpenInProgress = true;

    this.metrics.totalCalls++;
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.metrics.lastError = getErrorMessage(err);
      this.onFailure();
      throw err;
    } finally {
      if (probing) this.halfOpenInProgress = false;
    }
  }

  /**
   * 调用成功的内部状态推进：
   *   - closed 下清零 failureCount；
   *   - half_open 下累加 successCount，达到 halfOpenMaxAttempts 后切回 closed。
   */
  private onSuccess() {
    this.metrics.totalSuccesses++;
    this.failureCount = 0;
    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxAttempts) {
        this.state = 'closed';
        this.logger.log(`${this.name}: 断路器已关闭(恢复正常)`);
      }
    }
  }

  /**
   * 调用失败的内部状态推进：
   *   - half_open 下任意失败立即重回 open；
   *   - closed 下累加 failureCount，达到 failureThreshold 时切换为 open。
   */
  private onFailure() {
    this.metrics.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === 'half_open') {
      this.state = 'open';
      this.metrics.openedCount++;
      this.metrics.lastOpenedAt = Date.now();
      this.logger.error(`${this.name}: 半开状态失败,断路器重新打开`);
    } else if (this.state === 'closed' && this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.metrics.openedCount++;
      this.metrics.lastOpenedAt = Date.now();
      this.logger.error(`${this.name}: 连续失败 ${this.failureCount} 次,断路器打开`);
    }
  }

  /**
   * 获取断路器当前状态与运行指标快照（指标对象浅拷贝，避免外部修改）。
   *
   * @returns 包含 name / state / failureCount / lastFailureTime / metrics 的状态对象
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      metrics: { ...this.metrics },
    };
  }
}

/**
 * 断路器打开时抛出的错误。
 * 携带 circuitName 与 retryAfterSeconds，调用方可据此回退或延迟重试，
 * 不应直接返回 5xx，应转换为业务可读错误（如依赖不可用）。
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(`断路器 [${circuitName}] 已打开，${retryAfterSeconds} 秒后重试`);
    this.name = 'CircuitOpenError';
  }
}
