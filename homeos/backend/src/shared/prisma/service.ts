/**
 * Prisma 全局单例服务：NestJS 生命周期钩子 + Proxy 透明代理到底层扩展 PrismaClient。
 *
 * 核心职责：
 *  - OnModuleInit：按 PRISMA_MAX_RETRIES / PRISMA_RETRY_DELAY_MS 指数退避建连；
 *  - OnModuleDestroy：优雅 $disconnect，防止进程退出时的连接泄漏；
 *  - Proxy：转发属性访问到 client，保持 `prisma.notification.findMany()` 现有写法不变。
 * 关键依赖：./client.factory#createExtendedPrismaClient、common/utils#getErrorMessage。
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getErrorMessage } from '../../common/utils';
import { createExtendedPrismaClient, type ExtendedPrismaClient } from './client.factory';

/**
 * 解析 Prisma 启动连接重试次数。
 * @returns 环境变量 PRISMA_MAX_RETRIES 的值（>=1），缺省 3
 */
function resolvePrismaMaxRetries(): number {
  const n = parseInt(process.env.PRISMA_MAX_RETRIES || '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

/**
 * 解析 Prisma 启动连接重试间隔（毫秒）。
 * @returns 环境变量 PRISMA_RETRY_DELAY_MS 的值（>=100），缺省 2000
 */
function resolvePrismaRetryDelayMs(): number {
  const n = parseInt(process.env.PRISMA_RETRY_DELAY_MS || '', 10);
  return Number.isFinite(n) && n >= 100 ? n : 2000;
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- NestJS + Prisma Proxy 合并惯例 */

/**
 * Prisma 全局客户端：扩展连接池参数 + P2024 自动重试。
 * 通过 Proxy 转发模型访问，保持 `this.prisma.notification.findMany()` 等现有用法不变。
 *
 * @Injectable 在 DI 容器中注册为单例；实现 OnModuleInit / OnModuleDestroy 生命周期钩子。
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly maxRetries = resolvePrismaMaxRetries();
  private readonly retryDelayMs = resolvePrismaRetryDelayMs();
  /** 底层扩展 Prisma 客户端（含 pool-retry $extends） */
  readonly client: ExtendedPrismaClient;

  constructor() {
    this.client = createExtendedPrismaClient((msg) => this.logger.warn(msg));

    // Proxy 拦截属性访问：优先返回 PrismaService 自身属性（logger / client / 方法等），
    // 其余透明转发到底层 client，使 prismaService.xxx === prismaService.client.xxx
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        const value = (target.client as Record<string | symbol, unknown>)[prop];
        if (typeof value === 'function') {
          // 绑定 this 到 client，避免 Prisma 内部 this 丢失
          return (value as (...args: unknown[]) => unknown).bind(target.client);
        }
        return value;
      },
    }) as this;
  }

  /** NestJS 生命周期：模块初始化时建立数据库连接（带重试） */
  async onModuleInit() {
    await this.connectWithRetry();
  }

  /** NestJS 生命周期：模块销毁时优雅断开连接，避免进程退出时的连接泄漏 */
  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  /**
   * 带重试的数据库连接建立。
 * 失败时按 retryDelayMs 间隔重试，达到 maxRetries 仍失败则抛出原始错误。
   *
   * @param attempt - 当前尝试次数（从 1 开始）
   * @throws {unknown} 重试耗尽后抛出最后一次连接错误
   */
  private async connectWithRetry(attempt = 1): Promise<void> {
    try {
      await this.client.$connect();
      this.logger.log('数据库连接成功');
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err);
      if (attempt < this.maxRetries) {
        this.logger.warn(
          `数据库连接失败(第 ${attempt}/${this.maxRetries} 次),${this.retryDelayMs}ms 后重试:${errMsg}`,
        );
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
        return this.connectWithRetry(attempt + 1);
      }
      this.logger.error(`数据库连接最终失败(已重试 ${this.maxRetries} 次):${errMsg}`);
      throw err;
    }
  }
}

/** 供注入处标注类型：含全部 Prisma 模型与 $transaction 等（Proxy 运行时转发） */
export interface PrismaService extends ExtendedPrismaClient {}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type */