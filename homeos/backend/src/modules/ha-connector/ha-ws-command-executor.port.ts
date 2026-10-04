/**
 * Leader 端 HA WebSocket 命令执行端口
 *
 * 职责：定义 HaWsCommandExecutor 端口与 HA_WS_COMMAND_EXECUTOR Symbol 令牌，
 *      供命令桥接（HaCommandBridgeService）在 Follower → Leader 转发路径注入
 *      HaConnectorService，避免与 HaConnectorService 直接 import 造成循环依赖。
 */
export const HA_WS_COMMAND_EXECUTOR = Symbol('HA_WS_COMMAND_EXECUTOR');

/**
 * Leader 端 WebSocket 命令执行端口：Follower 经 Redis 桥接转发到 Leader 后调用本接口。
 */
export interface HaWsCommandExecutor {
  callServiceAsLeader(
    domain: string,
    service: string,
    entityId: string,
    serviceData?: Record<string, unknown>,
    returnResponse?: boolean,
    requestId?: string,
  ): Promise<unknown>;
}
