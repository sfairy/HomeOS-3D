/**
 * @file ha-rest-fetch.util.ts
 * @module shared/ha
 *
 * Home Assistant REST API 调用的通用工具函数集合：
 *  - 校验 HA 服务地址（区分开发 / 生产环境）
 *  - 带超时的 fetch 封装（用于 HA REST 与对话 API）
 *  - 解析 HA REST 错误响应体
 *  - 鉴权失败时（401/403）使 HA 配置缓存失效
 *
 * 关键依赖：
 *  - @homeos/shared：提供 URL 校验规则
 *  - ../utils/business-exception：抛出业务级 HTTP 异常
 */
import { existsSync } from 'fs';
import { validateHaUrlForDeploy } from '@homeos/shared';
import { badRequest } from '../../common/utils/business-exception';

/** 容器内 localhost 不可达宿主机 HA；本机 bun 即使 NODE_ENV=production 也应允许 */
function allowHaLocalhost(): boolean {
  try {
    return !existsSync('/.dockerenv');
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
}

/**
 * 部署/保存前校验 HA URL（非 Docker 本机允许 localhost）。
 *
 * @param url 待校验的 HA 服务地址
 * @param message 校验失败时使用的错误文案
 * @throws {BusinessException} 当 URL 不合法时通过 badRequest 抛出业务异常
 */
export function validateHaUrlForDeployOrThrow(
  url: string,
  message = 'Home Assistant 地址无效',
): void {
  const err = describeHaUrlForDeployError(url);
  if (err) {
    badRequest(err || message);
  }
}

/**
 * 描述 HA URL 在部署场景下的校验问题（不抛异常）。
 *
 * 与 validateHaUrlForDeployOrThrow 共享同一套 allowLocalhost 判定，供"诊断型"接口
 * （如连通性探测）使用：这类接口应把地址问题当作探测结果返回给前端展示，
 * 而不是直接抛 400 —— 否则前端只能看到「连接失败」，把地址问题误报成网络故障。
 *
 * @param url 待校验的 HA 服务地址
 * @returns 错误描述字符串；校验通过返回 null
 */
export function describeHaUrlForDeployError(url: string): string | null {
  return validateHaUrlForDeploy(url, {
    allowLocalhost: allowHaLocalhost(),
  });
}

/**
 * 带超时的 fetch 封装（HA REST / 对话 API 等共用）。
 *
 * @param url 请求目标 URL
 * @param init 原始 fetch 初始化参数（headers / method / body 等）
 * @param timeoutMs 超时毫秒数，<=0 表示禁用超时；默认 10 秒
 * @returns fetch 的 Response 对象
 *
 * 实现说明：通过 AbortController 在超时后中断请求，避免长时间挂起；
 * finally 块清理定时器，防止 Node.js 进程因未清理的 timer 不能退出。
 */
export async function fetchHaWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  if (timeoutMs <= 0) {
    return fetch(url, init);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 解析 HA REST 错误响应体。
 *
 * @param response HA REST 调用返回的 Response 对象
 * @returns 可读的错误描述字符串：
 *  - 空 body 时返回 `HTTP {status}`
 *  - JSON body 优先返回 message / error 字段
 *  - 非 JSON 时返回原文
 *
 * 解析失败不会抛出，保证调用方在错误路径上也能拿到字符串描述。
 */
export async function parseHaRestErrorResponse(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;
  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message || json.error || text;
  } catch {
    return text;
  }
}

/**
 * 401/403 时使 HA 配置缓存失效。
 *
 * @param status HA REST 响应状态码
 * @param invalidateCache 调用方提供的缓存失效回调
 * @param onWarn 可选的告警回调（用于记录日志）
 *
 * 触发条件：status === 401（未授权）或 403（禁止访问），通常意味着长期 Token 已过期或被撤销，
 * 此时本地缓存的 HA 配置可能已不可信，需立即失效以触发下一次请求重新拉取。
 */
export function invalidateHaConfigOnAuthError(
  status: number,
  invalidateCache: () => void,
  onWarn?: (message: string) => void,
): void {
  if (status === 401 || status === 403) {
    onWarn?.(`HA REST 返回 ${status}：Token 可能已失效，正在使配置缓存失效`);
    invalidateCache();
  }
}