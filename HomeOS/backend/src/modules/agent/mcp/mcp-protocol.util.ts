/**
 * MCP JSON-RPC 协议纯处理工具（无 Nest DI 依赖）。
 *
 * 所属模块：backend/modules/agent/mcp
 * 职责：把 MCP JSON-RPC 请求按方法路由到对应的处理分支，
 *  对接小智 ESP32 / 第三方 AI 等客户端。协议子集：2025-03-26。
 *  支持方法：initialize / notifications/* / ping / logging/setLevel /
 *  tools(/list / /call) / resources(/list / /templates/list / /read) / prompts(/list / /get)。
 *  以「smart_home.control」自然语言工具聚合 HomeToolsService 的细粒度工具。
 * 依赖：mcp.types（类型）。
 */
import type { JsonRpcRequest, JsonRpcResponse, McpToolDefinition } from './mcp.types';

/** 协议版本号，与 MCP 标准对齐 */
const MCP_PROTOCOL_VERSION = '2025-03-26';
/** MCP serverInfo 中的 name 字段，固定为 homeos */
const MCP_SERVER_NAME = 'homeos';
/** 暴露给客户端的「自然语言控家」聚合工具名，转发到 AgentService.chat */
const MCP_SMART_HOME_TOOL = 'smart_home.control';

/** MCP 资源声明：固定暴露「全屋状态 / 房间 / 场景」三类只读资源 */
const MCP_RESOURCES = [
  {
    uri: 'homeos://status',
    name: '全屋状态',
    description: '全屋状态概览（家庭模式、自动化数量、能耗）',
    mimeType: 'application/json',
  },
  {
    uri: 'homeos://areas',
    name: '房间',
    description: '房间列表',
    mimeType: 'application/json',
  },
  {
    uri: 'homeos://scenes',
    name: '场景',
    description: '已配置场景名称',
    mimeType: 'application/json',
  },
] as const;

/** MCP 提示词声明：固定暴露「控家 / 全屋状态 / 解释自动化」三类预设提示词 */
const MCP_PROMPTS = [
  {
    name: 'control_home',
    description: '用自然语言控制家居',
    arguments: [{ name: 'instruction', description: '用户指令，如打开客厅灯', required: true }],
  },
  {
    name: 'home_status',
    description: '询问家里当前整体状态',
    arguments: [],
  },
  {
    name: 'explain_automation',
    description: '解释一条已配置自动化',
    arguments: [{ name: 'query', description: '自动化名称关键词', required: false }],
  },
] as const;

/** HomeToolsService 工具 schema 的最小可用形态，避免反向依赖 Nest 模块 */
interface McpToolSchemasLike {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** handleMcpJsonRpc 依赖注入接口，由 mcp.service 提供具体实现 */
interface McpHandlerDeps {
  /** 列出细粒度工具 schema，作为 smart_home.control 之外的工具集 */
  listFineTools: () => McpToolSchemasLike[];
  /** 自然语言控家：转发到 AgentService.chat 并返回文本回复 */
  callSmartHome: (message: string) => Promise<{
    text: string;
    isError?: boolean;
  }>;
  /** 调用细粒度工具：直接调 HomeToolsService.execute */
  callFineTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ text: string; isError?: boolean }>;
  /** 读取 MCP 资源（homeos://status / areas / scenes 等） */
  readResource?: (uri: string) => Promise<{ text: string; mimeType?: string; isError?: boolean }>;
  /** serverInfo.version，缺省读 npm_package_version */
  serverVersion?: string;
}

/**
 * 构造暴露给客户端的工具列表：自然语言工具 + 细粒度工具集。
 * @param fineTools HomeToolsService 的工具 schema
 * @returns MCP 工具定义数组
 */
function buildMcpToolList(fineTools: McpToolSchemasLike[]): McpToolDefinition[] {
  const nlTool: McpToolDefinition = {
    name: MCP_SMART_HOME_TOOL,
    description:
      '控制智能家居设备，如开关灯、调节空调温度、开关窗帘、查询设备状态等。传入自然语言指令即可。',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '用户的自然语言指令，如"开客厅灯"、"把卧室空调调到26度"',
        },
      },
      required: ['message'],
    },
  };
  return [
    nlTool,
    ...fineTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters ?? { type: 'object', properties: {} },
    })),
  ];
}

/** 构造成功响应 */
function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

/** 构造错误响应（标准 JSON-RPC 错误码） */
function err(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * 构造 prompts/get 的 messages 数组。
 * @param name 提示词名（control_home / home_status / explain_automation）
 * @param args 提示词参数
 * @returns 提示词描述 + messages，未知名返回 null
 */
function promptMessages(name: string, args: Record<string, unknown>): { description: string; messages: unknown[] } | null {
  if (name === 'control_home') {
    const instruction = String(args.instruction || '').trim() || '查看家里现在的状态';
    return {
      description: '自然语言控家',
      messages: [{ role: 'user', content: { type: 'text', text: instruction } }],
    };
  }
  if (name === 'home_status') {
    return {
      description: '全屋状态',
      messages: [{ role: 'user', content: { type: 'text', text: '家里现在什么状态？' } }],
    };
  }
  if (name === 'explain_automation') {
    const query = String(args.query || '').trim();
    const text = query ? `解释自动化「${query}」做什么` : '列出并解释当前已配置的自动化';
    return {
      description: '解释自动化',
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  }
  return null;
}

/**
 * MCP JSON-RPC 请求总入口，按 method 分发到对应处理分支。
 * @param body JSON-RPC 请求体
 * @param deps 依赖回调（listFineTools / callSmartHome / callFineTool / readResource / serverVersion）
 * @returns JSON-RPC 响应
 */
export async function handleMcpJsonRpc(
  body: JsonRpcRequest,
  deps: McpHandlerDeps,
): Promise<JsonRpcResponse> {
  const id = body?.id ?? null;
  const method = String(body?.method || '');

  // initialize：返回协议版本、能力声明与 serverInfo
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {},
        resources: { subscribe: false },
        prompts: {},
      },
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: deps.serverVersion || process.env.npm_package_version || '0.0.0',
      },
    });
  }
  // 通知类 / ping / 日志级别：客户端无需业务处理，统一回空 result
  if (
    method === 'notifications/initialized' ||
    method === 'notifications/cancelled' ||
    method === 'ping' ||
    method === 'logging/setLevel'
  ) {
    return ok(id, {});
  }
  // tools/list：暴露自然语言 + 细粒度工具
  if (method === 'tools/list') {
    return ok(id, { tools: buildMcpToolList(deps.listFineTools()) });
  }
  // resources/list：返回固定的三类只读资源
  if (method === 'resources/list') {
    return ok(id, { resources: MCP_RESOURCES });
  }
  // resources/templates/list：当前不支持参数化资源模板
  if (method === 'resources/templates/list') {
    return ok(id, { resourceTemplates: [] });
  }
  // resources/read：按 uri 读取资源文本
  if (method === 'resources/read') {
    const uri = String(body.params?.uri || '').trim();
    if (!uri) return err(id, -32602, '缺少必需参数：uri');
    const known = MCP_RESOURCES.some((r) => r.uri === uri);
    if (!known) return err(id, -32602, `未知资源：${uri}`);
    if (!deps.readResource) return err(id, -32603, '资源读取未就绪');
    try {
      const result = await deps.readResource(uri);
      const mime = result.mimeType || 'application/json';
      return ok(id, {
        contents: [{ uri, mimeType: mime, text: result.text }],
      });
    } catch {
      return err(id, -32603, '资源读取失败');
    }
  }
  // prompts/list：返回固定的三类预设提示词
  if (method === 'prompts/list') {
    return ok(id, { prompts: MCP_PROMPTS });
  }
  // prompts/get：按 name + arguments 构造提示词消息
  if (method === 'prompts/get') {
    const name = String(body.params?.name || '').trim();
    const args = (body.params?.arguments as Record<string, unknown>) || {};
    const built = promptMessages(name, args);
    if (!built) return err(id, -32602, `未知提示词：${name || '(空)'}`);
    return ok(id, built);
  }
  // tools/call：按 name 分发到 smart_home.control 或细粒度工具
  if (method === 'tools/call') {
    try {
      const params = body.params;
      const name = String(params?.name || '');
      const args = (params?.arguments as Record<string, unknown>) || {};
      // smart_home.control：转发到 AgentService.chat
      if (name === MCP_SMART_HOME_TOOL) {
        const message = String(args.message || '').trim();
        if (!message) return err(id, -32602, '缺少必需参数：message');
        const result = await deps.callSmartHome(message);
        return ok(id, {
          content: [{ type: 'text', text: result.text || '已处理' }],
          isError: result.isError,
        });
      }
      // 细粒度工具：先校验是否在工具集中，再调用
      const known = deps.listFineTools().some((t) => t.name === name);
      if (!known) return err(id, -32601, `未知工具：${name}`);
      const result = await deps.callFineTool(name, args);
      return ok(id, {
        content: [{ type: 'text', text: result.text }],
        isError: result.isError,
      });
    } catch {
      return err(id, -32603, '智能家居控制失败，请稍后重试');
    }
  }
  // 未匹配的方法：返回 -32601 method not found
  return err(id, -32601, `未找到方法：${method}`);
}
