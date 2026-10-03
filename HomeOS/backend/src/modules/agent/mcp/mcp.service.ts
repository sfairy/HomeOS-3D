/**
 * 所属模块：backend/modules/agent/mcp
 * 职责：
 *  - MCP 网关服务（连接 MCP Server 并暴露工具目录给 Agent）；
 * 关键依赖：
 *  - @modelcontextprotocol/sdk；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { AgentService } from '../service';
import { HomeToolsService } from '../tools/home-tools.service';
import { AgentConfigService } from '../config.service';
import { formatChannelReply } from '../../channels/reply.util';
import type { JsonRpcRequest, JsonRpcResponse } from './mcp.types';
import { handleMcpJsonRpc } from './mcp-protocol.util';
import { MCP_GATEWAY_ACTOR, type AgentActor } from '../agent-actor';
import { PrismaService } from '../../../shared/prisma/service';
import { resolveRestrictions } from '../../auth/user-auth-resolve.util';

/** 恒定时间字符串比较（MCP Key / 同类密钥）；长度不等直接拒绝 */
function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@Injectable()
/**
 * McpGatewayService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class McpGatewayService
 */
export class McpGatewayService {
  private readonly logger = new Logger(McpGatewayService.name);
  /** 密钥轮换提醒只输出一次，避免每个请求刷告警 */
  private keyReminderLogged = false;

  constructor(
    private readonly agentService: AgentService,
    private readonly tools: HomeToolsService,
    private readonly agentConfig: AgentConfigService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** MCP_GATEWAY_ALLOW_IPS 白名单（逗号分隔，支持精确 IP 与网段前缀，如 192.168.1.） */
  private resolveIpAllowlist(): string[] {
    const raw = this.configService.get<string>('MCP_GATEWAY_ALLOW_IPS') || '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * IP 白名单校验。
   * 生产环境必须配置 MCP_GATEWAY_ALLOW_IPS，否则拒绝全部 MCP 请求。
   * 配置后仅放行白名单来源（精确 IP 或网段前缀，如 192.168.1.）。
   */
  assertIpAllowed(ip: string | undefined): void {
    const allow = this.resolveIpAllowlist();
    const isProd =
      this.configService.get<string>('NODE_ENV') === 'production' ||
      process.env.NODE_ENV === 'production';
    if (!allow.length) {
      if (isProd) {
        throw new ForbiddenException(
          '生产环境必须配置 MCP_GATEWAY_ALLOW_IPS（逗号分隔的 IP 或网段前缀）',
        );
      }
      return;
    }
    const normalized = (ip || '').trim().replace(/^::ffff:/, '');
    const matched = allow.some((entry) => {
      const e = entry.trim().replace(/^::ffff:/, '');
      if (e === normalized) return true;
      if (e.endsWith('.') && normalized.startsWith(e)) return true;
      return false;
    });
    if (!matched) {
      throw new ForbiddenException('MCP 网关 IP 不在白名单');
    }
  }

  /**
   * 校验 MCP 网关密钥。
   * 优先 env MCP_GATEWAY_SECRET，其次 layout.agentConfig.mcpGatewaySecret。
   * 仅首次调用时输出密钥轮换提醒（弱密钥 / 未走环境变量）。
   */
  async assertGatewayKey(apiKey: string | undefined): Promise<void> {
    const envKey = (this.configService.get<string>('MCP_GATEWAY_SECRET') || '').trim();
    const layoutKey = await this.agentConfig.getMcpGatewaySecret();
    const expected = envKey || layoutKey;
    if (!expected) {
      throw new UnauthorizedException(
        'MCP 网关未配置密钥：请设置环境变量 MCP_GATEWAY_SECRET 或 agentConfig.mcpGatewaySecret',
      );
    }
    if (!apiKey || !safeEqualString(apiKey, expected)) {
      throw new UnauthorizedException('MCP 网关密钥无效');
    }
    if (expected.length < 16) {
      throw new UnauthorizedException(
        'MCP 网关密钥过短：请使用 ≥16 位随机字符串并定期轮换',
      );
    }
    if (!this.keyReminderLogged) {
      this.keyReminderLogged = true;
      if (!envKey) {
        this.logger.warn(
          'MCP 网关使用 agentConfig.mcpGatewaySecret 而非环境变量 MCP_GATEWAY_SECRET;' +
            '建议优先使用环境变量并定期轮换密钥',
        );
      }
    }
  }

  /** 绑定 agentConfig.mcpActorUserId 对应的真实用户；未绑定则无 role，控制类工具拒绝 */
  async resolveMcpActor(): Promise<AgentActor> {
    const userId = await this.agentConfig.getMcpActorUserId();
    if (!userId) return { ...MCP_GATEWAY_ACTOR };
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, role: true, preferences: true },
      });
      if (!user) {
        this.logger.warn(`MCP 绑定用户不存在: ${userId}`);
        return { ...MCP_GATEWAY_ACTOR };
      }
      return {
        role: user.role,
        userId: user.id,
        username: user.username,
        restrictions: resolveRestrictions(user.role, user.preferences),
      };
    } catch (err) {
      this.logger.warn(`解析 MCP 执行身份失败: ${String(err)}`);
      return { ...MCP_GATEWAY_ACTOR };
    }
  }

  /**
   * 处理一次 MCP JSON-RPC 请求。
   * - 记录来源 IP / 方法 / 工具名到日志，便于第三方 Agent 异常排查
   * - 把 HomeToolsService / AgentService 注入为 handleMcpJsonRpc 的依赖回调
   *   - listFineTools：暴露细粒度工具 schema
   *   - callSmartHome：转发自然语言到 AgentService.chat，结果按渠道格式化
   *   - callFineTool：直接调 HomeToolsService.execute，把结果序列化为文本
   *   - readResource：把 homeos:// 资源 URI 映射到对应 HomeToolsService 工具
   * @param body JSON-RPC 请求体
   * @param ip 来源 IP（用于审计日志）
   * @returns JSON-RPC 响应
   */
  async handle(body: JsonRpcRequest, ip?: string): Promise<JsonRpcResponse> {
    const method = String(body?.method || '');
    const toolName =
      typeof body?.params === 'object' && body.params && 'name' in body.params
        ? String((body.params as { name?: unknown }).name || '')
        : '';
    // 操作审计：记录来源 IP、方法与被调用的工具，便于排查第三方 Agent 异常调用
    this.logger.log(
      `[MCP] 方法=${method}${toolName ? ` 工具=${toolName}` : ''} IP=${ip || '-'}`,
    );
    return handleMcpJsonRpc(body ?? { method: '' }, {
      listFineTools: () => this.tools.getToolSchemas(),
      callSmartHome: async (message) => {
        const actor = await this.resolveMcpActor();
        const result = await this.agentService.chat(message, [], {
          actor,
          sessionId: `mcp:${ip || 'anon'}`,
        });
        let textReply = formatChannelReply(result);
        if (result.outcome === 'success' && !textReply) {
          textReply = `已成功执行「${message}」`;
        }
        return {
          text: textReply || '已处理',
          isError: result.outcome === 'failed' || result.outcome === 'blocked',
        };
      },
      callFineTool: async (name, args) => {
        const actor = await this.resolveMcpActor();
        const toolResult = await this.tools.execute(name, args, actor);
        const isError = Boolean(
          toolResult &&
            typeof toolResult === 'object' &&
            'error' in toolResult &&
            toolResult.error,
        );
        return { text: JSON.stringify(toolResult), isError };
      },
      readResource: async (uri) => {
        const actor = await this.resolveMcpActor();
        const toolName =
          uri === 'homeos://status'
            ? 'get_home_status'
            : uri === 'homeos://areas'
              ? 'list_areas'
              : uri === 'homeos://scenes'
                ? 'list_scenes'
                : '';
        if (!toolName) return { text: '{}', mimeType: 'application/json', isError: true };
        const toolResult = await this.tools.execute(toolName, {}, actor);
        return { text: JSON.stringify(toolResult), mimeType: 'application/json' };
      },
    });
  }
}
