/**
 * MoviePilot 透明代理控制器（限定前缀 system/moviepilot/*）
 *
 * 模块：system/ops
 * 职责：
 *  - 将前端对 MoviePilot 的请求透明转发到外部 MoviePilot 服务，解决跨域问题
 *  - 限定前缀 system/moviepilot/*，避免历史上 catch-all `/system/:path` 抢占原生 system API
 *
 * 鉴权：JwtAuthGuard + RolesGuard，仅 admin / adult 可访问。
 */
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, All, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { MoviePilotProxyService } from './system-moviepilot-proxy.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import type { Request, Response } from 'express';

/**
 * 透传 JSON 请求体（第三方 API 代理等，不做字段白名单校验）
 * 使用空类作为 DTO，仅用于 Swagger 文档占位。
 */
class PassthroughJsonDto {}

/**
 * MoviePilot 透明代理控制器
 *
 * 注入 MoviePilotProxyService 执行实际转发；本类仅负责路由 + 鉴权 + 方法校验。
 */
@ApiTags('system')
@ApiBearerAuth()
@Controller('system/moviepilot')
export class MoviePilotProxyController {
  /**
   * @param moviePilotProxy 代理服务（封装 HTTP 转发 + 路径安全校验）
   */
  constructor(private readonly moviePilotProxy: MoviePilotProxyService) {}

  /**
   * 透传所有 HTTP 方法到 MoviePilot 后端。
   * 限制：仅支持 GET / POST，其他方法返回 405。
   *
   * @param path    子路径（多段会 join 为 / 分隔）
   * @param query   URL 查询参数
   * @param body    请求体（GET 时忽略）
   * @param req     Express 请求（取 method + headers）
   * @param res     Express 响应（写入转发结果）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @All('*path')
  async proxySystemApi(
    @Param('path') path: string | string[],
    @Query() query: Record<string, string>,
    @Body() body: PassthroughJsonDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const subPath = Array.isArray(path) ? path.join('/') : String(path || '').replace(/^\//, '');
    const method = (req.method || 'GET').toUpperCase();
    // 仅允许 GET / POST，避免 MoviePilot 后端被误删数据
    if (method !== 'GET' && method !== 'POST') {
      res.status(405).json({ message: 'MoviePilot 代理仅支持 GET/POST' });
      return;
    }
    await this.moviePilotProxy.proxySystemApi(
      subPath,
      method,
      query,
      method === 'GET' ? null : body,
      req.headers,
      res,
    );
  }
}