/**
 * 职责：
 *  - Agent 执行体封装；
 * 关键依赖：
 *  - @langchain/core, mcp/mcp.service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * Agent / MCP / 渠道执行身份。
 * 与 command-proxy 的 CommandProxyAuthUser 对齐，供工具层做同一套实体 ACL。
 */
export type AgentActor = {
  role?: string;
  restrictions?: string[];
  userId?: string;
  username?: string;
};

/**
 * MCP 网关密钥已校验时的执行身份。
 * 未绑定真实用户时不带 role，控制类工具会拒绝（「未绑定执行身份」）。
 * 生产环境请在 agentConfig.mcpActorUserId 绑定 HomeOS 用户。
 */
export const MCP_GATEWAY_ACTOR: AgentActor = {
  username: 'mcp-gateway',
};

/** 控制类工具：无有效执行身份时一律拒绝 */
export const AGENT_CONTROL_TOOLS = new Set([
  'control_device',
  'control_room',
  'activate_scene',
  'activate_home_mode',
  'set_light_brightness',
  'set_cover_position',
  'media_control',
]);
