/**
 * MCP JSON-RPC HTTP 入口控制器。
 *
 * 所属模块：backend/modules/agent/mcp
 * 职责：暴露 `/api/v1/mcp`（POST JSON-RPC）与 `/api/v1/mcp/sse`（GET SSE）两类端点，
 *  供小智 ESP32 / 第三方 AI 二次开发接入。
 * 鉴权：
 *  - IP 白名单（生产环境强制 MCP_GATEWAY_ALLOW_IPS）
 *  - Header `x-homeos-mcp-key` 与 env / agentConfig 配置密钥恒定时间比较
 *  - ThrottlerGuard 限流（POST 60/min、SSE 20/min）
 * 依赖：McpGatewayService（业务核心）、ThrottlerGuard（限流）。
 * 路由：
 *  POST /api/v1/mcp      → handleMcpRequest（处理 JSON-RPC 请求）
 *  GET  /api/v1/mcp/sse  → handleMcpSse（推送 endpoint 后保持 15s 心跳）
 */
import { Body, Controller, Headers, HttpCode, Post, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Observable, interval, map, merge, of } from 'rxjs';
import { Public } from '../../auth/public.decorator';
import { McpGatewayService } from './mcp.service';
import type { JsonRpcRequest } from './mcp.types';

/**
 * MCP JSON-RPC 网关控制器。
 * 所有端点均标记 @Public（用 MCP Key + IP 白名单鉴权，不走 JWT）。
 */
@ApiTags('mcp')
@Controller('mcp')
export class McpGatewayController {
  constructor(private readonly mcp: McpGatewayService) {}

  /**
   * 处理一次 MCP JSON-RPC 请求（initialize / ping / tools / resources / prompts）。
   * 鉴权顺序：IP 白名单 → MCP 网关密钥；通过后交由 McpGatewayService.handle 分发。
   * @param body JSON-RPC 请求体
   * @param req Express 请求（用于取 IP）
   * @param homeosKey 请求头 x-homeos-mcp-key 的值
   * @returns JSON-RPC 响应
   */
  @Public()
  @Post()
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'MCP JSON-RPC 网关（initialize / ping / tools / resources / prompts）' })
  @ApiHeader({ name: 'x-homeos-mcp-key', required: false })
  async handleMcpRequest(
    @Body() body: JsonRpcRequest,
    @Req() req: Request,
    @Headers('x-homeos-mcp-key') homeosKey?: string,
  ) {
    this.mcp.assertIpAllowed(req.ip);
    await this.mcp.assertGatewayKey(homeosKey);
    return this.mcp.handle(body ?? { method: '' }, req.ip);
  }

  /**
   * 建立 MCP SSE 传输通道：先推送 endpoint=/api/v1/mcp，再每 15s 推送心跳 ping。
   * 客户端通过该 endpoint 发起 POST JSON-RPC 请求。
   * @param req Express 请求（用于取 IP）
   * @param homeosKey 请求头 x-homeos-mcp-key 的值
   * @returns Observable<MessageEvent>，SSE 消息流
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Sse('sse')
  @ApiOperation({ summary: 'MCP SSE 传输（推送 endpoint=/api/v1/mcp 后保持心跳）' })
  @ApiHeader({ name: 'x-homeos-mcp-key', required: false })
  async handleMcpSse(
    @Req() req: Request,
    @Headers('x-homeos-mcp-key') homeosKey?: string,
  ): Promise<Observable<MessageEvent>> {
    this.mcp.assertIpAllowed(req.ip);
    await this.mcp.assertGatewayKey(homeosKey);
    const endpoint = '/api/v1/mcp';
    return merge(
      of({ type: 'endpoint', data: endpoint } as MessageEvent),
      interval(15_000).pipe(map(() => ({ type: 'ping', data: '{}' } as MessageEvent))),
    );
  }
}
