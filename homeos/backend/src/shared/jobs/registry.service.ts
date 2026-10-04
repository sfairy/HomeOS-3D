/**
 * @file registry.service.ts
 * @module shared/jobs
 * @description 调度作业统一注册中心：为全站各 setInterval / Cron 循环提供
 * 统一的运行监控（lastRunAt / lastDurationMs / lastError / nextRunAt / runs），
 * 并通过 GET /system/jobs 暴露给前端诊断面板（只读）。
 *
 * 接入方式（不改变既有定时器生命周期）：
 *   setInterval(() => {
 *     void this.jobs.run('data-retention', { description, intervalMs }, () => this.runCleanup());
 *   }, intervalMs);
 * run() 内部记录执行耗时与错误；nextRunAt = 本次完成时间 + intervalMs。
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger } from '@nestjs/common';

/** 作业注册选项（run/register 时传入） */
interface JobOptions {
  /** 作业中文描述（诊断面板展示） */
  description?: string;
  /** 作业周期（毫秒），用于推算 nextRunAt */
  intervalMs?: number;
  /** 是否启用（默认 true） */
  enabled?: boolean;
}

/** 作业只读快照（GET /system/jobs 下发给诊断面板） */
interface SystemJobSnapshot {
  name: string;
  description: string;
  intervalMs?: number;
  enabled: boolean;
  runs: number;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  nextRunAt: string | null;
}

/** 作业内部运行态：累计运行次数、最近执行时间/耗时/错误 */
type InternalJob = {
  description: string;
  intervalMs?: number;
  enabled: boolean;
  runs: number;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
};

@Injectable()
/**
 * JobRegistryService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 */
export class JobRegistryService {
  private readonly logger = new Logger(JobRegistryService.name);
  private readonly jobs = new Map<string, InternalJob>();

  /** 登记作业元数据（纯登记，不启动任何定时器） */
  register(name: string, options: JobOptions = {}): void {
    const existing = this.jobs.get(name);
    this.jobs.set(name, {
      description: options.description ?? existing?.description ?? '',
      intervalMs: options.intervalMs ?? existing?.intervalMs,
      enabled: options.enabled ?? existing?.enabled ?? true,
      runs: existing?.runs ?? 0,
      lastRunAt: existing?.lastRunAt ?? null,
      lastDurationMs: existing?.lastDurationMs ?? null,
      lastError: existing?.lastError ?? null,
    });
  }

  /**
   * 执行一次带监控的作业：运行 fn 并记录耗时 / 错误 / 下次运行时间。
   * 异常会原样抛出（由调用方既有 try/catch 接管），状态已记录。
   */
  async run<T>(
    name: string,
    options: JobOptions,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    this.register(name, options);
    const startedAt = Date.now();
    try {
      const result = await fn();
      this.complete(name, startedAt, null);
      return result;
    } catch (err) {
      const msg = getErrorMessage(err);
      this.complete(name, startedAt, msg);
      throw err;
    }
  }

  /** 记录一次已由调用方自行 try/catch 的作业执行（无耗时统计精度要求时使用） */
  tick(name: string, options: JobOptions = {}): void {
    this.register(name, options);
    const entry = this.jobs.get(name);
    if (!entry) return;
    entry.runs += 1;
    entry.lastRunAt = new Date().toISOString();
    entry.lastError = null;
    if (options.intervalMs) entry.intervalMs = options.intervalMs;
  }

  /** 全部作业快照（按登记时间排序，供诊断面板只读展示） */
  list(): SystemJobSnapshot[] {
    return Array.from(this.jobs.entries()).map(([name, job]) => ({
      name,
      description: job.description,
      intervalMs: job.intervalMs,
      enabled: job.enabled,
      runs: job.runs,
      lastRunAt: job.lastRunAt,
      lastDurationMs: job.lastDurationMs,
      lastError: job.lastError,
      nextRunAt: this.computeNextRunAt(job.lastRunAt, job.intervalMs),
    }));
  }

  /** 记录一次作业执行完成：累计 runs、记录耗时与错误信息 */
  private complete(name: string, startedAt: number, error: string | null): void {
    const entry = this.jobs.get(name);
    if (!entry) return;
    entry.runs += 1;
    entry.lastRunAt = new Date(startedAt).toISOString();
    entry.lastDurationMs = Date.now() - startedAt;
    entry.lastError = error;
  }

  /** 下次运行 = 上次完成时间 + 周期；尚未跑过则无法推算 */
  private computeNextRunAt(
    lastRunAt: string | null,
    intervalMs?: number,
  ): string | null {
    if (!intervalMs || !Number.isFinite(intervalMs) || intervalMs <= 0) return null;
    if (!lastRunAt) return null;
    const lastMs = Date.parse(lastRunAt);
    if (!Number.isFinite(lastMs)) return null;
    return new Date(lastMs + intervalMs).toISOString();
  }
}
