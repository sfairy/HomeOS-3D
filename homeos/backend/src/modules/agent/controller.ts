/**
 * 智能管家 HTTP 控制器。
 *
 * 职责：暴露 `/agent` 下的 RESTful 接口，把请求转发给 AgentService。
 * 依赖：AgentService（业务核心）、JwtAuthGuard（鉴权）、RolesGuard（角色校验）。
 * 鉴权：所有接口均要求登录（JwtAuthGuard），并通过 @Roles 限定可访问角色。
 */
import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AgentService } from './service';
import { ChatDto } from './chat.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { AgentActor } from './agent-actor';
import { getErrorMessage } from '../../common/utils';

/** 鉴权后扩展 user 字段的 Express 请求类型，携带 JWT 解析出的 AgentActor 执行身份 */
type AuthRequest = Request & {
  user?: AgentActor;
};

@ApiTags('agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('agent')
/**
 * AgentController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的端点（HTTP 方法 + 路径 + DTO 校验）；
 * - 鉴权：默认 JwtAuthGuard + 角色守卫（@Roles 装饰器按方法细化）；
 * - 主要调用：同域 Service + 跨域编排工具；
 */
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * 健康检查：返回 LLM 提供商名与就绪状态。
   * 不触发缓存刷新；若需主动刷新请走保存配置接口（SYSTEM_CONFIG_UPDATED 事件会自动刷新）。
   */
  @ApiOperation({ summary: '智能管家健康检查' })
  @Roles('admin', 'adult')
  @Get('ping')
  async ping() {
    return { ok: true, ...(await this.agentService.pingProvider()) };
  }

  /**
   * 自然语言对话 / 控制。
   * 把请求体 + 当前用户身份透传给 AgentService.chat，由其按缓存 / 快路径 / LLM 顺序处理。
   * 支持 sessionId 实现连续对话（多轮上下文）。
   */
  @ApiOperation({ summary: '智能管家自然语言对话/控制' })
  @Roles('admin', 'adult')
  @Post('chat')
  async chat(@Body() dto: ChatDto, @Req() req: AuthRequest) {
    return this.agentService.chat(dto.message, dto.history ?? [], {
      actor: req.user,
      sessionId: dto.sessionId,
    });
  }

  /**
   * 流式对话（SSE）。
   * 事件类型：
   *  - token：LLM 增量文本
   *  - tool：工具调用与结果预览
   *  - done：最终 AgentChatResponse
   *  - error：异常信息
   * 通过 onProgress 回调把 AgentService 的进度事件转成 SSE 数据帧。
   */
  @ApiOperation({ summary: '智能管家流式对话（SSE：token / tool / done / error）' })
  @Roles('admin', 'adult')
  @Post('chat/stream')
  async chatStream(@Body() dto: ChatDto, @Req() req: AuthRequest, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const write = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      const result = await this.agentService.chat(dto.message, dto.history ?? [], {
        actor: req.user,
        sessionId: dto.sessionId,
        onProgress: (ev) => write(ev.type, ev),
      });
      write('done', result);
    } catch (err: unknown) {
      write('error', { message: getErrorMessage(err) });
    } finally {
      res.end();
    }
  }
}
