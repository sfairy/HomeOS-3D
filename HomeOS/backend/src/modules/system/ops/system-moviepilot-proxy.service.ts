/**
 * MoviePilot 代理服务
 *
 * 模块：system/ops
 * 职责：
 *  - 将前端的图片 / 接口请求透明转发到外部 MoviePilot 服务，解决跨域问题
 *  - 路径安全校验（防目录穿越）+ 图片 URL 安全校验（防 SSRF）
 *  - 请求头过滤（移除 host / connection 等）
 *
 * 从 SystemService 拆出，使系统域核心服务专注版本 / 健康查询。
 *
 * 依赖：
 *  - HttpService     axios HTTP 客户端
 *  - UiConfigService 读取 MoviePilot URL（存在 UI 配置 layout.moviePilotUrl）
 */
import { getErrorMessage } from '../../../common/utils';
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import {
  BusinessException,
  ErrorCode,
  badRequest,
  notFound,
  rethrowIfHttpException,
} from '../../../common/utils/business-exception';
import { HttpService } from '@nestjs/axios';
import { UiConfigService } from '../../ui-config/service';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { Request, Response } from 'express';
import * as path from 'path';
import * as dns from 'node:dns';
import * as net from 'node:net';
import { API_ERROR } from '../../../common/errors/api-error-messages';

/**
 * MoviePilot 代理服务
 * 将前端的图片/接口请求透明转发到外部 MoviePilot 服务，解决跨域问题。
 * 从 SystemService 拆出，使系统域核心服务专注版本/健康查询。
 */
@Injectable()
export class MoviePilotProxyService {
  private readonly logger = new Logger(MoviePilotProxyService.name);

  /**
   * @param httpService   axios HTTP 客户端
   * @param uiConfigService UI 配置（读取 MoviePilot URL）
   */
  constructor(
    private readonly httpService: HttpService,
    private readonly uiConfigService: UiConfigService,
  ) {}

  /**
   * 校验代理路径安全性，防止目录穿越。
   * 判定逻辑：
   *  1. 任一段为 .. / . / 空 → 拒绝
   *  2. path.posix.normalize 后须与原路径（去末尾斜杠）一致
   *
   * 注意：必须用 posix 规范化，避免 Windows 下 path.normalize 变成反斜杠导致误判。
   *
   * @param subPath 待校验子路径
   * @returns true 安全；false 危险
   */
  private isSafePath(subPath: string): boolean {
    const dangerous = subPath.split('/').some((seg) => seg === '..' || seg === '.' || seg === '');
    if (dangerous) return false;
    // URL 路径须用 posix 规范化，避免 Windows 下 path.normalize 变成反斜杠导致误判
    const normalized = path.posix.normalize('/' + subPath);
    const expected = '/' + subPath.replace(/\/+$/, '');
    return normalized === expected || normalized === path.posix.normalize(expected);
  }

  /**
   * 校验图片 URL 安全性，防止 SSRF。
   * 拒绝条件：
   *  1. 非 http/https 协议
   *  2. localhost / 127.0.0.1 / ::1 主机名
   *  3. 域名解析出的任一 IP 命中回环/私网/链路本地/保留地址（DNS 解析失败保守拒绝）
   *
   * @param url 待校验 URL
   * @returns true 安全；false 危险
   */
  private async isSafeImgUrl(url: string): Promise<boolean> {
    if (!url) return false;
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return false;
    }
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    // IPv6 地址的 hostname 带方括号，取出去除后用于直连拒绝与 DNS 解析
    const rawHostname = u.hostname;
    const hostname =
      rawHostname.startsWith('[') && rawHostname.endsWith(']')
        ? rawHostname.slice(1, -1)
        : rawHostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }
    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      // 任一解析结果命中不安全网段即拒绝
      return addresses.every(({ address }) => !this.isUnsafeIp(address));
    } catch {
      // DNS 无法解析时保守拒绝，避免通过解析绕过
      return false;
    }
  }

  /**
   * 判断单个 IP 是否为回环/私网/链路本地/保留地址。
   * 覆盖 IPv4 与 IPv6（含 IPv4-mapped IPv6 归一化）。
   */
  private isUnsafeIp(ip: string): boolean {
    const mapped = ip.match(/^::ffff:(?:\d+:)?(\d{1,3}(?:\.\d{1,3}){3})$/i);
    const addr = mapped ? mapped[1] : ip;
    const family = net.isIP(addr);
    if (family === 4) {
      const [a, b, c] = addr.split('.').map((part) => Number(part));
      // 0.0.0.0/8 本网络
      if (a === 0) return true;
      // 10.0.0.0/8 私网
      if (a === 10) return true;
      // 100.64.0.0/10 运营商级 NAT 保留
      if (a === 100 && b >= 64 && b <= 127) return true;
      // 127.0.0.0/8 回环
      if (a === 127) return true;
      // 169.254.0.0/16 链路本地
      if (a === 169 && b === 254) return true;
      // 172.16.0.0/12 私网
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.0.0.0/24（含 192.0.2.0/24 TEST-NET-1）
      if (a === 192 && b === 0) return true;
      // 192.168.0.0/16 私网
      if (a === 192 && b === 168) return true;
      // 198.18.0.0/15 基准测试；198.51.100.0/24 TEST-NET-2
      if (a === 198 && (b === 18 || b === 19)) return true;
      if (a === 198 && b === 51 && c === 100) return true;
      // 203.0.113.0/24 TEST-NET-3
      if (a === 203 && b === 0 && c === 113) return true;
      // 224.0.0.0/4 组播；240.0.0.0/4 保留
      if (a >= 224) return true;
      return false;
    }
    if (family === 6) {
      const a = addr.toLowerCase();
      // :: 未指定；::1 回环
      if (a === '::' || a === '::1') return true;
      // fe80::/10 链路本地
      if (/^fe[89ab]/.test(a)) return true;
      // fc00::/7 唯一本地地址
      if (/^f[cd]/.test(a)) return true;
      // 2001:db8::/32 文档保留地址
      if (a.startsWith('2001:db8:')) return true;
      // ff00::/8 组播
      if (a.startsWith('ff')) return true;
      return false;
    }
    return false;
  }
  /**
   * 获取 MoviePilot 服务 URL
   * 从数据库的 UI 配置中动态读取（layout.moviePilotUrl）。
   *
   * @returns MoviePilot 的完整 URL（已去除末尾斜杠）
   * @throws InternalServerErrorException 配置缺失或 layout JSON 解析失败
   * @throws NotFoundException           moviePilotUrl 未配置（由 notFound 抛出 BusinessException）
   */
  private async getMoviePilotUrl() {
    const config = await this.uiConfigService.getConfig(
      this.uiConfigService.resolveActiveProjectId(),
    );
    if (!config || !config.layout) {
      throw new InternalServerErrorException(API_ERROR.SYSTEM_CONFIG_NOT_FOUND);
    }

    try {
      const { layout, parseError } = this.uiConfigService.parseLayoutField(config.layout);
      if (parseError) {
        throw new InternalServerErrorException(API_ERROR.SYSTEM_INVALID_LAYOUT);
      }
      const url = layout.moviePilotUrl;
      if (!url) {
        notFound(API_ERROR.MOVIEPILOT_URL_NOT_CONFIGURED);
      }
      return String(url).replace(/\/$/, '');
    } catch (e: unknown) {
      rethrowIfHttpException(e);
      const errMsg = getErrorMessage(e);
      this.logger.error(`解析布局配置失败:${errMsg}`);
      throw new InternalServerErrorException(API_ERROR.SYSTEM_INVALID_LAYOUT);
    }
  }

  /**
   * 代理 MoviePilot 图像请求
   * 将前端的图片请求转发到 MoviePilot 服务，解决跨域问题。
   *
   * 副作用：
   *  - 校验 imgUrl 安全性（SSRF 防护）
   *  - 通过 axios 拉取图片二进制
   *  - 透传 content-type / cache-control 响应头
   *
   * @param imgUrl          远程图片 URL
   * @param incomingHeaders 原始请求头
   * @param res             Express 响应对象
   * @throws BadRequestException imgUrl 不安全
   * @throws NotFoundException   代理拉取失败
   */
  async proxyImage(imgUrl: string, incomingHeaders: Request['headers'], res: Response) {
    if (!(await this.isSafeImgUrl(imgUrl))) {
      badRequest(API_ERROR.SYSTEM_INVALID_IMAGE_URL);
    }
    const baseUrl = await this.getMoviePilotUrl();
    const targetUrl = `${baseUrl}/api/v1/system/img/0?imgurl=${encodeURIComponent(imgUrl)}`;

    this.logger.debug(`正在代理图像请求到:${targetUrl}`);

    const headers = this.filterHeaders(incomingHeaders);

    try {
      const response = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(targetUrl, {
          responseType: 'arraybuffer',
          headers,
          timeout: 10000,
        }),
      );

      // 透传 content-type
      const contentType = response.headers['content-type'];
      if (typeof contentType === 'string') res.setHeader('Content-Type', contentType);

      // 透传 cache-control，缺省则默认 1 小时
      const cacheControl = response.headers['cache-control'];
      if (typeof cacheControl === 'string') {
        res.setHeader('Cache-Control', cacheControl);
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }

      res.send(response.data);
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e);
      this.logger.error(`从 ${targetUrl} 代理图像失败:${errMsg}`);
      notFound(API_ERROR.MOVIEPILOT_PROXY_IMAGE_FAILED);
    }
  }
  /**
   * 代理 MoviePilot API 请求（通用 GET/POST 转发）
   * 将请求透明转发到 MoviePilot 后端，解决跨域问题。
   *
   * 副作用：
   *  - 校验 path 安全性（目录穿越防护）
   *  - 通过 axios 转发请求（透传 query + body + 过滤后的 headers）
   *  - 透传目标服务的 HTTP 状态码 + 响应体
   *
   * @param path            API 子路径
   * @param method          HTTP 方法（GET/POST）
   * @param query           URL 查询参数
   * @param body            请求体
   * @param incomingHeaders 原始请求头
   * @param res             Express 响应对象
   * @throws BadRequestException             path 不安全
   * @throws InternalServerErrorException    非 axios 错误（如网络中断）
   */
  async proxySystemApi(
    path: string,
    method: string,
    query: Record<string, unknown>,
    body: unknown,
    incomingHeaders: Request['headers'],
    res: Response,
  ) {
    if (!this.isSafePath(path)) {
      badRequest(API_ERROR.SYSTEM_INVALID_API_PATH);
    }
    const baseUrl = await this.getMoviePilotUrl();
    const targetUrl = `${baseUrl}/api/v1/system/${path}`;

    this.logger.debug(`代理 ${method} 请求到:${targetUrl}`);

    const headers = this.filterHeaders(incomingHeaders);

    try {
      const response = await firstValueFrom(
        this.httpService.request<unknown>({
          url: targetUrl,
          method,
          params: query,
          data: body,
          headers,
          timeout: 5000,
        }),
      );

      // 透传目标服务的状态码 + 响应体
      res.status(response.status).json(response.data);
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e);
      const errCode = isAxiosError(e) ? e.code || 'UNKNOWN' : 'UNKNOWN';
      this.logger.error(`从 ${targetUrl} 代理 API 失败 [${errCode}]:${errMsg}`);
      if (isAxiosError(e) && e.response) {
        // 目标服务返回了非 2xx：透传其状态码 + 响应体
        res.status(e.response.status).json(e.response.data);
      } else {
        // 非 axios 错误（网络中断 / 超时等）：抛 500
        throw new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.MOVIEPILOT_PROXY_IMAGE_FAILED);
      }
    }
  }

  /**
   * 过滤转发的 HTTP 请求头
   * 移除不应转发的头（如 host、connection 等），避免干扰目标服务。
   *
   * @param incomingHeaders 原始请求头对象
   * @returns 过滤后的请求头
   */
  private filterHeaders(incomingHeaders: Request['headers']) {
    const forwardHeaders: Record<string, string | string[] | undefined> = {};
    const exclude = [
      'host',
      'connection',
      'content-length',
      'content-encoding',
      'transfer-encoding',
    ];

    for (const key in incomingHeaders) {
      if (!exclude.includes(key.toLowerCase())) {
        forwardHeaders[key] = incomingHeaders[key];
      }
    }

    return forwardHeaders;
  }
}