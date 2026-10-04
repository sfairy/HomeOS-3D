/**
 * 客户端系统信息与充电器开关滞回联动 控制器。
 *
 * 职责：
 *  - 暴露 REST 接口供客户端上报系统信息（含电量），并提供状态快照与待配对终端管理接口。
 *  - 上报接口允许 admin/adult/child 角色调用；待配对相关管理接口仅 admin 可用。
 *  - reportToken 以 HttpOnly Cookie（homeos_cprt）下发与回传，避免落入 localStorage。
 *
 * 依赖：
 *  - ClientPowerService：负责业务逻辑（持久化、联动评估、token 校验）。
 *  - JwtAuthGuard / RolesGuard：JWT 鉴权与角色守卫。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { resolveCookieSecureForRequest } from '../../common/http-security/cookie-cors.util';
import { ClientPowerService } from './service';
import { ClientSystemReportDto } from './report.dto';

/** Cookie 名：客户端上报密钥（HttpOnly，与 body.reportToken 二选一） */
const CLIENT_REPORT_TOKEN_COOKIE = 'homeos_cprt';

/** 客户端系统信息上报与联动管理控制器（DI 角色：HTTP 入口） */
@ApiTags('orchestrate')
@ApiBearerAuth()
@Controller('system')
export class ClientPowerController {
  constructor(private readonly clientPower: ClientPowerService) {}

  /**
   * 上报客户端系统信息（含电量）。
   * 允许 admin/adult/child 角色调用；未配对终端仅记录为待配对，不执行联动。
   */
  @Roles('admin', 'adult', 'child')
  @Post('client-power/report')
  @ApiOperation({ summary: '上报客户端系统信息（含电量）' })
  async report(
    @Body() body: ClientSystemReportDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie = String(req.cookies?.[CLIENT_REPORT_TOKEN_COOKIE] || '').trim();
    const fromBody = String(body.reportToken || '').trim();
    const merged: ClientSystemReportDto = {
      ...body,
      reportToken: fromBody || fromCookie || undefined,
    };

    const result = await this.clientPower.report(merged);

    if (result.deliverToken) {
      res.cookie(CLIENT_REPORT_TOKEN_COOKIE, result.deliverToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: resolveCookieSecureForRequest(req),
        path: '/',
        maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
      });
      // token 仅通过 HttpOnly Cookie 下发，从 JSON body 中剔除，防止 XSS 读取明文
      const { deliverToken: _omit, ...rest } = result;
      return rest;
    }

    return result;
  }

  /** 获取客户端系统信息状态快照（含在线状态、电量、待配对列表等） */
  @UseGuards(JwtAuthGuard)
  @Get('client-power/status')
  @ApiOperation({ summary: '获取客户端系统信息状态快照' })
  getStatus() {
    return this.clientPower.getStatusSnapshot();
  }

  /** 获取待配对客户端列表（仅管理员） */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('client-power/pending')
  @ApiOperation({ summary: '获取待配对客户端列表（管理员）' })
  getPending() {
    return { pending: this.clientPower.getPendingClients() };
  }

  /** 清除指定离线待配对终端的发现记录（仅管理员） */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('client-power/pending/dismiss')
  @ApiOperation({ summary: '清除离线待配对终端的发现记录（管理员）' })
  dismissPending(@Body('clientId') clientId: string) {
    return this.clientPower.dismissPending(clientId);
  }

  /** 批量清除所有离线待配对终端的发现记录（仅管理员） */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('client-power/pending/dismiss-offline')
  @ApiOperation({ summary: '批量清除所有离线待配对终端的发现记录（管理员）' })
  dismissAllOfflinePending() {
    return this.clientPower.dismissAllOfflinePending();
  }
}
