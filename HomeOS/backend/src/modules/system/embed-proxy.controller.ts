/**
 * @file embed-proxy.controller.ts
 * @module system/embed-proxy
 * @description
 * 内嵌页反向代理控制器。HTTPS 站点下，浏览器会拒绝以 iframe 内嵌 HTTP 站点（混合内容
 * 安全策略），故由后端充当同源反向代理：前端 iframe 指向 `/api/v1/embed-proxy/<id>`，
 * 后端再将请求转发至真实上游 HTTP 内嵌站，并对响应体中的 URL 进行重写以维持同源链路。
 *
 * 依赖：
 * - EmbedProxyService：执行实际的反向代理与内容重写逻辑。
 * - JwtAuthGuard + RolesGuard：仅允许已认证的 admin/adult/child 角色访问。
 * - 分级限流：根文档较严、子路径（静态资源/轮询）较宽；不再整控制器 SkipThrottle，
 *   避免账号被盗后对上游的无上限打流。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { All, Controller, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { EmbedProxyService } from './embed-proxy.service';

/**
 * 内嵌页反向代理控制器。
 *
 * DI 角色：将 `/api/v1/embed-proxy/:embedId` 与 `/api/v1/embed-proxy/:embedId/*path`
 * 两个路由下的所有 HTTP 方法转发给 EmbedProxyService 统一处理。
 *
 * 限流策略（覆盖全局 60s/300）：
 *  - 控制器默认：60s/1200（覆盖静态资源与轮询子路径）
 *  - 根路径文档：60s/120（页面导航远少于资源请求）
 */
@ApiTags('display')
@ApiBearerAuth()
@Controller('embed-proxy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'adult', 'child')
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class EmbedProxyController {
  /**
   * @param embedProxy 内嵌代理服务，负责上游请求转发与响应重写。
   */
  constructor(private readonly embedProxy: EmbedProxyService) {}

  /**
   * 反代内嵌页根路径（如 `/api/v1/embed-proxy/movie-pilot`）。
   *
   * @param embedId 内嵌标识（如 `movie-pilot` 或布局中的 customEmbeds id）。
   * @param req Express 请求对象，透传给代理服务用于读取 headers / body。
   * @param res Express 响应对象，由代理服务直接写入响应。
   */
  @ApiOperation({ summary: 'HTTPS 下反代 HTTP 内嵌页（同源 iframe）' })
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @All(':embedId')
  async proxyRoot(@Param('embedId') embedId: string, @Req() req: Request, @Res() res: Response) {
    await this.embedProxy.proxy(embedId, req, res);
  }

  /**
   * 反代内嵌页子路径（如 `/api/v1/embed-proxy/movie-pilot/assets/x.js`）。
   *
   * @param embedId 内嵌标识。
   * @param req Express 请求对象。
   * @param res Express 响应对象。
   */
  @ApiOperation({ summary: 'HTTPS 下反代 HTTP 内嵌页子路径' })
  @All(':embedId/*path')
  async proxyPath(@Param('embedId') embedId: string, @Req() req: Request, @Res() res: Response) {
    await this.embedProxy.proxy(embedId, req, res);
  }
}
