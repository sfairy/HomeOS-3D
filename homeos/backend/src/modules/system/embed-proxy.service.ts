/**
 * @file embed-proxy.service.ts
 * @module system
 * @description 内嵌页反向代理服务。HTTPS 站点下浏览器会拒绝以 iframe 内嵌 HTTP 站点
 * （混合内容安全策略），由本服务充当同源反向代理：将前端对
 * `/api/v1/embed-proxy/<id>` 与 `/api/v1/embed-proxy/<id>/*path` 的请求转发至真实上游 HTTP 内嵌站，
 * 并对响应体中的 URL 进行重写以维持同源链路。
 *
 * 关键策略：
 *  - 上游目标来自 UiConfigService 的 layout.customEmbeds / 内置 embed 配置
 *  - 响应头按 EMBED_PROXY_STRIP_RESPONSE_HEADERS 清理，Set-Cookie / Location / Referer 重写为同源
 *  - 静态资源走前端 dist 目录（开发态自动定位 ../dist/frontend）
 *  - 转发请求体由 buildEmbedForwardBody 重建，并剥离 HomeOS 自身 Cookie
 *  - 失败时返回 502 / 504 友好错误，不向上游暴露内部堆栈
 *
 * 依赖：
 *  - UiConfigService：embed 配置来源
 *  - fetchHaWithTimeout：HA 上游请求（带超时）
 *  - common/embed/proxy.util：URL 校验、HTML / 资源重写工具
 *  - common/embed/proxy-forward.util：转发请求体构建与 Cookie 剥离
 *  - common/http-security/cookie-cors.util：HTTPS 判定
 */
import { Injectable, Logger } from '@nestjs/common';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { getErrorMessage, notFound } from '../../common/utils';
import { existsSync, createReadStream, readFileSync } from 'fs';
import { extname, join, resolve, sep } from 'path';
import { UiConfigService } from '../ui-config/service';
import { fetchHaWithTimeout } from '../../shared/ha/rest-fetch.util';
import {
  buildEmbedProxyPrefix,
  buildEmbedUpstreamUrl,
  EMBED_PROXY_SKIP_REQUEST_HEADERS,
  EMBED_PROXY_STRIP_RESPONSE_HEADERS,
  getEmbedUpstreamOrigin,
  isEmbedSameOriginAsRequest,
  isEmbedRewriteableContentType,
  isFrontendDistAssetPath,
  isHtmlContentType,
  rewriteEmbedHtml,
  rewriteEmbedAssetContent,
  rewriteEmbedLocation,
  rewriteEmbedReferer,
  rewriteEmbedSetCookie,
  validateEmbedTargetUrl,
} from '../../common/embed/proxy.util';
import { buildEmbedForwardBody, stripHomeosCookies } from '../../common/embed/proxy-forward.util';
import { isRequestSecure } from '../../common/http-security/cookie-cors.util';
import { STATIC_MIME } from '../../common/http-security/spa-fallback.middleware';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { Request, Response } from 'express';

interface LayoutEmbed {
  id?: string;
  url?: string;
}

@Injectable()
/**
 * EmbedProxyService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 */
export class EmbedProxyService {
  private readonly logger = new Logger(EmbedProxyService.name);
  private readonly frontendDistPath: string;

  constructor(private readonly uiConfigService: UiConfigService) {
    const isDev = existsSync(join(process.cwd(), '..', 'frontend'));
    this.frontendDistPath = isDev
      ? join(process.cwd(), '..', 'dist', 'frontend')
      : join(process.cwd(), 'dist', 'frontend');
  }

  private async loadLayout(): Promise<Record<string, unknown>> {
    const config = await this.uiConfigService.getConfig(
      this.uiConfigService.resolveActiveProjectId(),
    );
    if (!config?.layout) return {};
    const { layout, parseError } = this.uiConfigService.parseLayoutField(config.layout);
    return parseError ? {} : layout;
  }

  /**
   * 解析内嵌目标的反代基准地址，返回 **origin（协议+主机+端口，不含路径）**。
   *
   * 关键：基准须为 origin 而非 origin+路径。若内嵌目标配置带 base 路径（如
   * `http://host:5666/p`，常见于 Vite `base:'/p/'` 等子路径部署），其页面会以根相对
   * 绝对地址引用资源（`/p/assets/x.js`）。前端 iframe 会带上该路径加载
   * （`/api/v1/embed-proxy/<id>/p`），反代再把资源重写为 `/api/v1/embed-proxy/<id>/p/assets/x.js`。
   * 此时若基准含 `/p`，上游 URL 会拼成 `host/p/p/assets/x.js`（路径重复）→ 命中上游 SPA
   * 回退返回 index.html（text/html）→ 浏览器模块脚本严格 MIME 校验失败而白屏。
   * 以 origin 为基准时，「反代路径 == 上游 origin 路径」为恒等映射，彻底避免重复拼接。
   */
  /** 解析内嵌目标配置 URL（含路径），供反代取 origin 与 base 路径使用 */
  async resolveEmbedConfiguredUrl(embedId: string): Promise<URL> {
    const layout = await this.loadLayout();
    const customEmbeds = Array.isArray(layout.customEmbeds)
      ? (layout.customEmbeds as LayoutEmbed[])
      : [];

    if (embedId === 'movie-pilot') {
      const fromList = customEmbeds.find((e) => e.id === 'movie-pilot')?.url;
      const url = (fromList || layout.moviePilotUrl || '') as string;
      if (!url?.trim()) notFound(API_ERROR.EMBED_MOVIEPILOT_URL_MISSING);
      return validateEmbedTargetUrl(url);
    }

    const embed = customEmbeds.find((e) => e.id === embedId);
    if (!embed?.url?.trim()) {
      notFound(API_ERROR.EMBED_NOT_FOUND(embedId));
    }
    return validateEmbedTargetUrl(embed.url);
  }

  async resolveEmbedBaseUrl(embedId: string): Promise<string> {
    return (await this.resolveEmbedConfiguredUrl(embedId)).origin;
  }

  /**
   * 解析本地 dist 下的静态资源路径（防 path.join 绝对路径覆盖与 .. 穿越）。
   */
  private resolveLocalAssetPath(subPath: string): string | null {
    if (!isFrontendDistAssetPath(subPath)) return null;
    const cleanPath = subPath.split('?')[0].split('#')[0];
    const relative = cleanPath.replace(/^\/+/, '');
    if (!relative || relative.includes('..')) return null;
    const localPath = resolve(this.frontendDistPath, relative);
    const root = resolve(this.frontendDistPath);
    if (localPath !== root && !localPath.startsWith(`${root}${sep}`)) return null;
    if (!existsSync(localPath)) return null;
    return localPath;
  }

  private discardUpstreamBody(upstream: Awaited<ReturnType<typeof fetchHaWithTimeout>>): void {
    try {
      void upstream.body?.cancel?.();
    } catch {
      /* 短路与本地伺服时丢弃未读 body，避免连接泄漏 */
    }
  }

  /**
   * 同机内嵌 HomeOS 时，从本地 dist 直接伺服 /assets/*，避免经 LAN/HTTPS 反代回环
   * （Docker/NAS 上 server-side fetch 自身 :8443/:8501 常 404 或返回 SPA HTML）。
   */
  private tryServeLocalFrontendAsset(
    embedId: string,
    embedBase: string,
    basePath: string | undefined,
    subPath: string,
    req: Request,
    res: Response,
  ): boolean {
    if (!isEmbedSameOriginAsRequest(embedBase, req.headers.host, isRequestSecure(req))) return false;

    const localPath = this.resolveLocalAssetPath(subPath);
    if (!localPath) return false;

    const ext = extname(localPath).toLowerCase();
    const mime = STATIC_MIME[ext] || 'application/octet-stream';
    res.status(200);
    res.setHeader('Content-Type', mime);
    if (/[\\/]assets[\\/]/.test(localPath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    if (isEmbedRewriteableContentType(mime)) {
      const text = readFileSync(localPath, 'utf-8');
      res.send(rewriteEmbedAssetContent(text, embedBase, embedId, basePath));
    } else {
      createReadStream(localPath).pipe(res);
    }
    return true;
  }

  /** 上游对静态资源返回 HTML（SPA 回退）时，返回正确 MIME 的 404，避免模块脚本校验失败 */
  private respondAssetNotFound(subPath: string, res: Response): void {
    const cleanPath = subPath.split('?')[0].split('#')[0];
    const ext = extname(cleanPath).toLowerCase();
    res
      .status(404)
      .type(STATIC_MIME[ext] || 'text/plain')
      .end();
  }

  /** 上游不可达时返回可读 HTML（iframe 内嵌），避免冒成 500 UNKNOWN */
  private respondUpstreamUnreachable(upstreamUrl: string, err: unknown, res: Response): void {
    const raw = getErrorMessage(err);
    const timedOut =
      /abort|timeout|timed?\s*out/i.test(raw) ||
      (err instanceof Error && err.name === 'TimeoutError');
    const message = timedOut
      ? API_ERROR.EMBED_UPSTREAM_TIMEOUT(upstreamUrl)
      : API_ERROR.EMBED_UPSTREAM_UNREACHABLE(upstreamUrl);
    this.logger.warn(`内嵌代理上游不可达 ${upstreamUrl}: ${raw}`);
    const safeMsg = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    res
      .status(502)
      .type('html')
      .send(
        '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>内嵌页不可达</title>' +
          '<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#1a1a1a;background:#f6f6f6}' +
          'main{max-width:36rem;padding:1.25rem 1.5rem;background:#fff;border-radius:8px;' +
          'border:1px solid #e5e5e5}h1{font-size:1.1rem;margin:0 0 .75rem}p{margin:0;line-height:1.5;color:#444}</style>' +
          `</head><body><main><h1>内嵌页无法连接</h1><p>${safeMsg}</p></main></body></html>`,
      );
  }

  private filterRequestHeaders(
    headers: Request['headers'],
    embedBase: string,
    proxyPrefix: string,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (EMBED_PROXY_SKIP_REQUEST_HEADERS.has(lower)) continue;
      if (lower === 'cookie') {
        const raw =
          typeof value === 'string' ? value : Array.isArray(value) ? value.join('; ') : undefined;
        const stripped = stripHomeosCookies(raw);
        if (stripped) out[key] = stripped;
        continue;
      }
      // Origin/Referer 还原为内嵌站真实地址，否则上游同源/CSRF 校验会拒绝登录提交
      if (lower === 'origin') {
        out[key] = getEmbedUpstreamOrigin(embedBase);
        continue;
      }
      if (lower === 'referer') {
        const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
        out[key] = rewriteEmbedReferer(raw, embedBase, proxyPrefix);
        continue;
      }
      if (typeof value === 'string') out[key] = value;
      else if (Array.isArray(value) && value[0]) out[key] = value[0];
    }
    return out;
  }

  async proxy(embedId: string, req: Request, res: Response): Promise<void> {
    const target = await this.resolveEmbedConfiguredUrl(embedId);
    const embedBase = target.origin;
    // 配置 URL 的 base 路径（如 /p）。基路径型 SPA 的路由 basename 据此重定位到反代前缀下。
    const basePath = target.pathname && target.pathname !== '/' ? target.pathname : undefined;
    const proxyPrefix = buildEmbedProxyPrefix(embedId);

    const pathOnly = (req.originalUrl || req.url).split('?')[0];
    const mount = `/api/v1/embed-proxy/${embedId}`;
    let subPath = '/';
    if (pathOnly.length > mount.length) {
      subPath = pathOnly.slice(mount.length) || '/';
    }
    const query = req.url.includes('?') ? `?${req.url.split('?')[1]}` : '';
    const upstreamUrl = buildEmbedUpstreamUrl(embedBase, subPath, query);

    if (this.tryServeLocalFrontendAsset(embedId, embedBase, basePath, subPath, req, res)) {
      return;
    }

    this.logger.debug(`内嵌代理 ${req.method} ${upstreamUrl}`);

    const forwardBody = buildEmbedForwardBody(
      req.method,
      req.headers['content-type'],
      (req as Request & { body?: unknown }).body,
      (req as unknown as Record<string, unknown>).rawBody as Buffer | undefined,
    );

    // 内嵌反代目标已限定为局域网地址（validateEmbedTargetUrl），其 HTTPS 站点
    // 常用自签证书；放行证书校验，避免反代 HTTPS 内嵌页时握手失败。
    // （Bun fetch 支持 tls 选项；类型未覆盖，故经断言扩展 RequestInit。）
    const upstreamIsHttps = upstreamUrl.toLowerCase().startsWith('https:');
    const fetchInit = {
      method: req.method,
      headers: this.filterRequestHeaders(req.headers, embedBase, proxyPrefix),
      body: forwardBody,
      redirect: 'manual' as const,
      ...(upstreamIsHttps ? { tls: { rejectUnauthorized: false } } : {}),
    } as RequestInit;

    // 超时仅作用于「连接+响应头」阶段（fetch 在拿到响应头即 resolve 并清除计时器），
    // 不会中断后续 body 流式传输，故对大文件/媒体下载安全。
    let upstream: Awaited<ReturnType<typeof fetchHaWithTimeout>>;
    try {
      upstream = await fetchHaWithTimeout(upstreamUrl, fetchInit, 30_000);
    } catch (err) {
      this.respondUpstreamUnreachable(upstreamUrl, err, res);
      return;
    }

    const reqSecure = isRequestSecure(req);

    const status = upstream.status;

    // set-cookie 须单独处理：Headers.forEach 会把多个 Set-Cookie 合并成单个
    // 逗号分隔字符串，破坏含逗号属性（如 Expires）的 Cookie，导致登录态写不进去。
    // 登录流程常以 302 + Set-Cookie 返回，故对重定向分支同样需转发。
    const setCookies =
      typeof (upstream.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (upstream.headers as { getSetCookie: () => string[] }).getSetCookie()
        : [];
    const forwardSetCookies = () => {
      if (setCookies.length) {
        res.setHeader(
          'Set-Cookie',
          setCookies.map((c) => rewriteEmbedSetCookie(c, proxyPrefix, reqSecure)),
        );
      }
    };

    // 诊断：非 GET/HEAD（登录提交等）、重定向（登录跳转链）、401/403（鉴权失败）。
    // 仅打印 Cookie 名称与属性（Path/Secure/SameSite/HttpOnly），不打印 Cookie 值。
    // debug 级别：正常运行时不可见，需要时通过 Nest 日志级别 `debug` 开启。
    const isWrite = !['GET', 'HEAD'].includes((req.method || '').toUpperCase());
    const isRedirect = status >= 300 && status < 400;
    const isAuthFail = status === 401 || status === 403;
    if (isWrite || isRedirect || isAuthFail) {
      const cookieSummary = setCookies
        .map((c) => {
          const rewritten = rewriteEmbedSetCookie(c, proxyPrefix, reqSecure);
          const parts = rewritten.split(';').map((p) => p.trim());
          const name = parts[0]?.split('=')[0] || '?';
          const flags = parts
            .slice(1)
            .map((p) => (p.toLowerCase().startsWith('path=') ? p : p.split('=')[0]))
            .join(',');
          return `${name}[${flags}]`;
        })
        .join(' ');
      const reqCookieNames = (req.headers['cookie'] || '')
        .split(';')
        .map((c) => c.split('=')[0]?.trim())
        .filter(Boolean)
        .join(',');
      this.logger.debug(
        `[内嵌登录] ${req.method} ${subPath} → ${status} ` +
          `内容类型=${upstream.headers.get('content-type') || '-'} ` +
          `鉴权=${req.headers['authorization'] ? '有' : '-'} ` +
          `请求 Cookie=${reqCookieNames || '-'} ` +
          `Set-Cookie=${setCookies.length}{${cookieSummary}} ` +
          `跳转=${upstream.headers.get('location') || '-'}`,
      );
    }

    const location = upstream.headers.get('location');
    if (location && status >= 300 && status < 400) {
      res.status(status);
      forwardSetCookies();
      res.setHeader('Location', rewriteEmbedLocation(location, embedBase, proxyPrefix));
      res.end();
      return;
    }

    res.status(status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (EMBED_PROXY_STRIP_RESPONSE_HEADERS.has(lower)) return;
      if (lower === 'set-cookie') return;
      if (lower === 'location') {
        res.setHeader(key, rewriteEmbedLocation(value, embedBase, proxyPrefix));
        return;
      }
      res.setHeader(key, value);
    });

    forwardSetCookies();

    const contentType = upstream.headers.get('content-type');

    if (isHtmlContentType(contentType)) {
      if (isFrontendDistAssetPath(subPath)) {
        this.discardUpstreamBody(upstream);
        if (this.tryServeLocalFrontendAsset(embedId, embedBase, basePath, subPath, req, res)) {
          return;
        }
        this.respondAssetNotFound(subPath, res);
        return;
      }
      const html = await upstream.text();
      // 设置内嵌上下文 Cookie（Path=/），使子资源请求在 Referer 缺失时仍可被
      // SPA fallback 中间件识别并重定向回反代前缀，避免逃逸到根路径触发模块脚本 MIME 报错。
      const embedSecurePart = reqSecure ? '; Secure' : '';
      const embedCookie = `embed_ctx__${encodeURIComponent(embedId)}=1; Path=/; SameSite=Lax${embedSecurePart}`;
      const existing = res.getHeader('Set-Cookie');
      if (existing) {
        res.setHeader(
          'Set-Cookie',
          Array.isArray(existing) ? [...existing, embedCookie] : [String(existing), embedCookie],
        );
      } else {
        res.setHeader('Set-Cookie', embedCookie);
      }
      res.send(rewriteEmbedHtml(html, embedBase, proxyPrefix, embedId, subPath, basePath));
      return;
    }

    if (status === 404 && isFrontendDistAssetPath(subPath)) {
      this.discardUpstreamBody(upstream);
      if (this.tryServeLocalFrontendAsset(embedId, embedBase, basePath, subPath, req, res)) {
        return;
      }
      this.respondAssetNotFound(subPath, res);
      return;
    }

    if (isEmbedRewriteableContentType(contentType)) {
      const text = await upstream.text();
      res.send(rewriteEmbedAssetContent(text, embedBase, embedId, basePath));
      return;
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(
      upstream.body as unknown as import('stream/web').ReadableStream<Uint8Array>,
    );
    const onClose = () => nodeStream.destroy();
    req.on('close', onClose);
    res.on('close', onClose);
    try {
      await pipeline(nodeStream, res);
    } finally {
      req.off('close', onClose);
      res.off('close', onClose);
    }
  }
}
