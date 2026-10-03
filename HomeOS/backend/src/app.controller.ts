/**
 * 所属模块：backend/common/app-controller
 * 职责：
 *  - 顶层健康检查/Prometheus 指标端点（公开、无鉴权）；
 * 关键依赖：
 *  - Nest @Controller、AppService、metrics-access.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Controller, Get, Header, NotFoundException, Req, Res, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express'; // Express 请求/响应类型
import { AppService } from './app.service';
import { decideMetricsAccess } from './common/http-security/metrics-access.util';
import { Public } from './modules/auth/public.decorator';

/**
 * 应用根控制器
 * 提供健康检查等基础 API 端点。
 * 路由挂载在根路径下（无前缀），health 端点不受全局 '/api/v1' 前缀影响。
 */
@ApiTags('健康检查')
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * 健康检查端点
   * GET /health
   * 返回服务器运行状态，包括 HA 连接状态、实体数量和运行时间。
   * @returns 包含服务器健康信息的对象
   */
  @ApiOperation({ summary: '健康检查' })
  @SkipThrottle()
  @Get('health')
  getHealth() {
    return this.appService.getPublicHealth();
  }

  /**
   * Prometheus 文本指标
   * GET /metrics
   */
  @ApiOperation({ summary: 'Prometheus 指标' })
  @SkipThrottle()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(@Req() req: Request, @Res({ passthrough: true }) res: Response): string {
    const decision = decideMetricsAccess({
      metricsToken: process.env.METRICS_TOKEN,
      isProduction: process.env.NODE_ENV === 'production',
      remoteAddress: req.ip || req.socket?.remoteAddress,
      authorizationHeader: req.headers.authorization,
      queryToken: typeof req.query.token === 'string' ? req.query.token : undefined,
    });
    if (decision === 'not_found') throw new NotFoundException();
    if (decision === 'unauthorized') throw new UnauthorizedException();

    res.setHeader('Cache-Control', 'no-store');
    return this.appService.getPrometheusMetrics();
  }
}
