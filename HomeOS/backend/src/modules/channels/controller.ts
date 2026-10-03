/**
 * @file channels.controller.ts
 * @module ChannelsModule
 *
 * 消息通道状态 + WebPush 订阅管理 REST 控制器。
 *
 * 职责：
 * - GET /channels/status：聚合 Email / WebPush / 企业微信 三通道运行状态
 * - GET /channels/webpush/vapid-public-key：下发 VAPID 公钥供前端注册推送
 * - GET/POST/DELETE /channels/webpush/*：WebPush 订阅设备的列表 / 注册 / 取消
 * - POST /channels/webpush/test：向全部或指定 endpoint 发送测试推送
 *
 * 依赖：ChannelsService（通道状态聚合）、WebPushService（订阅与推送）、
 *       JwtAuthGuard + RolesGuard（admin/adult/child 角色鉴权）
 */
import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ChannelsService } from './service';
import { WebPushService } from './webpush/service';

/**
 * 消息通道 REST 控制器。
 * DI 角色：@Controller('channels')，由 ChannelsModule 注册。所有路由需 JWT 鉴权 +
 * 角色守卫；通道状态与订阅列表仅 admin/adult 可访问，订阅与公钥开放到 child。
 */
@ApiTags('channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly webPush: WebPushService,
  ) {}

  /** 聚合查询 Email / WebPush / 企业微信 三通道运行状态（admin/adult） */
  @ApiOperation({ summary: '智能管家消息通道状态' })
  @Roles('admin', 'adult')
  @Get('status')
  async status() {
    return this.channelsService.getStatus();
  }

  /** 下发 WebPush VAPID 公钥，供前端 Service Worker 注册推送订阅（admin/adult/child） */
  @ApiOperation({ summary: '获取 WebPush VAPID 公钥' })
  @Roles('admin', 'adult', 'child')
  @Get('webpush/vapid-public-key')
  async vapidPublicKey() {
    return { publicKey: await this.webPush.getPublicKey() };
  }

  /** 列出已注册的 WebPush 订阅设备（admin/adult） */
  @ApiOperation({ summary: '列出 WebPush 订阅设备' })
  @Roles('admin', 'adult')
  @Get('webpush/subscriptions')
  listSubscriptions() {
    return { items: this.webPush.listSubscriptions() };
  }

  /**
   * 注册 WebPush 订阅：endpoint + keys 持久化到 Prisma + 内存缓存。
   * @remarks endpoint 须为 https 公网推送服务（防 SSRF，详见 webpush/service.ts）。
   *          userAgent 与 label 可选，用于在订阅列表中识别设备。
   */
  @ApiOperation({ summary: '注册 WebPush 订阅' })
  @Roles('admin', 'adult', 'child')
  @Post('webpush/subscribe')
  async subscribe(
    @Body()
    body: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
      label?: string;
    },
    @Req() req: { headers?: { 'user-agent'?: string } },
  ) {
    await this.webPush.registerSubscription({
      endpoint: body.endpoint,
      keys: body.keys,
      userAgent: body.userAgent || req.headers?.['user-agent'],
      label: body.label,
    });
    return { ok: true };
  }

  /**
   * 取消 WebPush 订阅：支持 query 或 body 传 endpoint。
   * @remarks endpoint 为空时静默返回 ok，避免前端重复取消时报错。
   */
  @ApiOperation({ summary: '取消 WebPush 订阅' })
  @Roles('admin', 'adult', 'child')
  @Delete('webpush/subscribe')
  async unsubscribe(@Query('endpoint') endpoint: string, @Body() body?: { endpoint?: string }) {
    const ep = endpoint || body?.endpoint || '';
    if (ep) await this.webPush.unregisterSubscription(ep);
    return { ok: true };
  }

  /**
   * 发送 WebPush 测试通知。
   * @param body.endpoint 可选，指定单设备 endpoint；不传则向全部订阅者推送
   */
  @ApiOperation({ summary: '发送 WebPush 测试通知' })
  @Roles('admin', 'adult')
  @Post('webpush/test')
  async testPush(@Body() body?: { endpoint?: string }) {
    return this.webPush.sendTest(body?.endpoint);
  }
}
