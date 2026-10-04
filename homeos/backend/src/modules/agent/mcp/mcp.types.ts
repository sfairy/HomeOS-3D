/**
 * MCP JSON-RPC 类型定义。
 *
 * 职责：定义 JSON-RPC 2.0 请求 / 响应结构与 MCP 工具描述结构，
 *  供 mcp-protocol.util 与 mcp.service 共享类型。
 * 协议子集：MCP 2025-03-26（initialize / ping / tools / resources / prompts）。
 */

/** JSON-RPC 2.0 请求结构（id 可空以兼容通知） */
export interface JsonRpcRequest {
  jsonrpc?: string;
  /** 请求 ID；通知类方法可不带，响应时原样回传 */
  id?: string | number | null;
  /** 方法名，如 initialize / tools/list / tools/call */
  method: string;
  /** 方法参数，按方法不同结构不同 */
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 响应结构；result 与 error 互斥 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  /** 与对应请求的 id 一致 */
  id: string | number | null;
  /** 成功结果（与 error 互斥） */
  result?: unknown;
  /** 错误对象（与 result 互斥），code 为标准 JSON-RPC 错误码 */
  error?: { code: number; message: string; data?: unknown };
}

/** MCP 工具定义：名称 + 描述 + JSON Schema 形态的入参定义 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
