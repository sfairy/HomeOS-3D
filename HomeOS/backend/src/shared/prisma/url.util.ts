/**
 * Prisma 7 + node-pg 数据库连接解析：DATABASE_URL 校验 + PoolConfig 构造 + 池超时识别。
 *
 * 所属模块：shared/prisma（被 client.factory 与启动引导使用）。
 * 核心职责：
 *  - resolvePgPoolConfig：解析 URL、缺失密码段抛 BusinessException、localhost 强制 IPv4、postgres 主机名仅容器可用；
 *  - 环境变量 PRISMA_CONNECTION_LIMIT / PRISMA_CONNECT_TIMEOUT / PRISMA_POOL_TIMEOUT 控制连接池参数；
 *  - isPrismaPoolTimeout：识别 Prisma P2024 / pg 连接超时 / Pool is full 等短暂可重试错误，供上层判定。
 * 关键依赖：pg PoolConfig 类型、fs.existsSync（Docker 容器判断）。
 */

import { getErrorMessage } from '../../common/utils';
import { existsSync } from 'fs';
import type { PoolConfig } from 'pg';
import { BusinessException, ErrorCode } from '../../common/utils/business-exception';

function isRunningInDocker(): boolean {
  try {
    return existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/**
 * 解析 Prisma 7 + node-pg 连接池参数（替代 v6 在 DATABASE_URL 上的 connection_limit 等查询参数）。
 *
 * @param raw - 数据库连接字符串，默认读取 `process.env.DATABASE_URL`
 * @returns node-pg `PoolConfig`，含 connectionString / max / 超时参数
 * @throws {BusinessException} CONFIG_ERROR — URL 未配置、缺密码段或格式非法
 */
export function resolvePgPoolConfig(raw = process.env.DATABASE_URL): PoolConfig {
  const url = raw?.trim();
  if (!url) {
    throw new BusinessException(
      ErrorCode.CONFIG_ERROR,
      'DATABASE_URL 未配置：请复制 backend/.env.example 为 backend/.env，并确保密码与仓库根 .env 的 POSTGRES_PASSWORD 一致',
    );
  }

  // node-pg SCRAM 要求 password 为 string；缺密码段时 URL 解析出 null/undefined 会抛晦涩 SASL 错误
  // 这里提前校验，给出明确提示而不是底层 SASL 报错
  // Windows + Docker Desktop 下 localhost 可能走 IPv6(::1) 抖动；强制 IPv4 更稳
  let connectionString = url;
  try {
    const parsed = new URL(url);
    if (parsed.password === '' || parsed.password == null) {
      throw new BusinessException(
        ErrorCode.CONFIG_ERROR,
        'DATABASE_URL 缺少密码段（postgresql://user:password@host:port/db）',
      );
    }
    // Compose 服务名仅在容器网络内可解析；本机 bun run 误用会导致 ENOTFOUND
    if (parsed.hostname === 'postgres' && !isRunningInDocker()) {
      throw new BusinessException(
        ErrorCode.CONFIG_ERROR,
        'DATABASE_URL 主机名为 postgres（仅 Docker Compose 内网可用）。本机开发请改为 127.0.0.1 或 localhost（先 bun run dev:db）',
      );
    }
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      connectionString = parsed.toString();
    }
  } catch (err) {
    // 已经是我们主动抛出的结构化错误，直接向上抛（勿按 message 字符串匹配）
    if (err instanceof BusinessException) throw err;
    throw new BusinessException(
      ErrorCode.CONFIG_ERROR,
      `DATABASE_URL 格式无效：${getErrorMessage(err)}`,
    );
  }

  // 默认 10：对齐 Docker Compose 中 Postgres mem_limit=512m（NAS 单实例）；多核/大内存可调高
  const max = parseInt(process.env.PRISMA_CONNECTION_LIMIT || '10', 10);
  const connectionTimeoutMillis = parseInt(process.env.PRISMA_CONNECT_TIMEOUT || '10', 10) * 1000;
  const idleTimeoutMillis = parseInt(process.env.PRISMA_POOL_TIMEOUT || '30', 10) * 1000;

  return {
    connectionString,
    // 解析失败或非法值时回退到默认值，避免运行时崩在配置上
    max: Number.isFinite(max) && max >= 1 ? max : 10,
    connectionTimeoutMillis:
      Number.isFinite(connectionTimeoutMillis) && connectionTimeoutMillis >= 100
        ? connectionTimeoutMillis
        : 10_000,
    idleTimeoutMillis:
      Number.isFinite(idleTimeoutMillis) && idleTimeoutMillis >= 1000 ? idleTimeoutMillis : 30_000,
  };
}

/**
 * 判断错误是否为可短暂重试的连接池/建连超时。
 * 上层 `client.factory.ts` 据此决定是否重试。
 *
 * 覆盖：
 *  - Prisma P2024（从池中取连接超时）
 *  - node-pg `timeout exceeded when trying to connect`（Windows Docker 端口转发抖动常见）
 *
 * @param err - 待判断的未知错误对象
 */
export function isPrismaPoolTimeout(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    if ((err as { code?: string }).code === 'P2024') return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('timeout exceeded when trying to connect') ||
    lower.includes('timed out fetching a new connection from the connection pool') ||
    lower.includes('connect etimedout')
  );
}
