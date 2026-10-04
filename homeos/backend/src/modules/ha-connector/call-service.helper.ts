/**
 * HA 服务调用统一入口与路由策略（纯函数，便于单测）
 *
 * 职责：实现 callHaService 路由 ——
 *  - Leader + 已连接 → WebSocket 即时调用（callServiceViaWs）。
 *  - Follower → Redis 桥接转发到 Leader（callServiceViaBridge），桥接失败按策略降级。
 *  - 断连 → 入队等待重连 flush（入队），或 REST 降级（callServiceViaRest）。
 *  - 桥接失败 / Redis 不可用 / Leader 未处理时回退 REST。
 *  - 幂等去重：同 requestId 在 IDEMPOTENCY_WINDOW_MS 窗口内只执行一次。
 *  - climate 调温类服务自动补 turn_on（climateNeedsAutoTurnOn，所有联动路径共用）。
 * 关键依赖：HaConnectorWsLifecycle、HaWsLeaderService、HaCommandBridgeService、
 *           HaRestClientService、HaConnectorCommandQueue、climateNeedsAutoTurnOn、BusinessException。
 */
import { climateNeedsAutoTurnOn } from '../command-proxy/climate-auto-turn-on.helper';
import type { HaCommandBridgeService } from './ha-command-bridge.service';
import type { HaConnectorCommandQueue } from './command-queue.helper';
import type { HaConnectorWsLifecycle } from './ws.helper';
import type { HaRestClientService } from './ha-rest-client.service';
import type { HaWsLeaderService } from './ha-ws-leader.service';
import type { Logger } from '@nestjs/common';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';

/** 从 BusinessException / HttpException 取出业务文案（勿用 err.message，常为 Http Exception） */
function getBridgeErrorText(err: unknown): string {
  if (err instanceof BusinessException) {
    const res = err.getResponse();
    if (typeof res === 'object' && res && 'message' in res) {
      return String((res as { message: unknown }).message);
    }
  }
  return getErrorMessage(err);
}

/** 桥接失败是否应 REST 降级：超时 / Redis 不可用 / Leader 未处理 */
function shouldRestFallbackFromBridge(err: unknown): boolean {
  const msg = getBridgeErrorText(err);
  if (
    msg === API_ERROR.HA_COMMAND_BRIDGE_TIMEOUT ||
    msg === API_ERROR.HA_COMMAND_BRIDGE_UNAVAILABLE ||
    msg === API_ERROR.HA_COMMAND_BRIDGE_FAILED
  ) {
    return true;
  }
  if (msg.includes(API_ERROR.HA_COMMAND_BRIDGE_TIMEOUT)) return true;
  if (msg.includes(API_ERROR.HA_COMMAND_BRIDGE_UNAVAILABLE)) return true;
  if (typeof API_ERROR.HA_COMMAND_BRIDGE_PUBLISH_FAILED === 'function') {
    if (msg.startsWith('HA 命令桥接请求发布失败')) return true;
  }
  if (typeof API_ERROR.HA_COMMAND_BRIDGE_SUBSCRIBE_FAILED === 'function') {
    if (msg.startsWith('HA 命令桥接订阅失败')) return true;
  }
  return false;
}

export type HaConnectorCallServiceDeps = {
  logger: Logger;
  wsLifecycle: HaConnectorWsLifecycle;
  commandQueue: HaConnectorCommandQueue;
  haLeader: HaWsLeaderService;
  commandBridge: HaCommandBridgeService;
  restClient: HaRestClientService;
  getEntityState?: (entityId: string) => string | undefined;
};

/**
 * 命令幂等去重窗口（毫秒）：同一 requestId 在窗口内只执行一次。
 * 覆盖断连队列 flush 与重试/桥接重放并发到达的重复命令。
 */
const IDEMPOTENCY_WINDOW_MS = 10_000;

type IdemEntry = {
  promise: Promise<unknown>;
  settled: boolean;
  failed: boolean;
  cleanup: ReturnType<typeof setTimeout>;
};

/** requestId → 执行中/刚完成的命令（单进程内去重；Leader 端生效） */
const inflightCommands = new Map<string, IdemEntry>();

/**
 * 查询 requestId 是否已有执行中（或窗口内成功）的命令。
 * 已失败的命令返回 null，允许携带同键重试（如断连超时后的重试需真正重发）。
 */
function dedupRequestId(requestId: string | undefined): Promise<unknown> | null {
  if (!requestId) return null;
  const entry = inflightCommands.get(requestId);
  if (!entry) return null;
  if (entry.settled && entry.failed) {
    inflightCommands.delete(requestId);
    return null;
  }
  return entry.promise;
}

/** 登记 requestId → promise，窗口结束后自动清理 */
function registerRequestId(requestId: string | undefined, promise: Promise<unknown>): void {
  if (!requestId || inflightCommands.has(requestId)) return;
  const entry: IdemEntry = {
    promise,
    settled: false,
    failed: false,
    cleanup: null as unknown as ReturnType<typeof setTimeout>,
  };
  entry.cleanup = setTimeout(() => {
    inflightCommands.delete(requestId);
  }, IDEMPOTENCY_WINDOW_MS);
  promise
    .then(() => {
      entry.settled = true;
    })
    .catch(() => {
      entry.settled = true;
      entry.failed = true;
    });
  inflightCommands.set(requestId, entry);
}

/**
 * 根据服务域与是否返回响应确定超时时间。
 * weather.get_forecasts 需要更长超时（45s），return_response 需 25s，默认 10s。
 */
function getCallTimeoutMs(domain: string, service: string, returnResponse?: boolean): number {
  if (domain === 'weather' && service === 'get_forecasts') return 45_000;
  if (returnResponse) return 25_000;
  return 10_000;
}

/**
 * 通过 WebSocket 即时调用 HA 服务（构造 call_service 消息，注册 pending result，等待响应）。
 * @throws {Error} 超时时 reject。
 */
function callServiceImmediate(
  deps: HaConnectorCallServiceDeps,
  domain: string,
  service: string,
  entityId: string,
  serviceData?: Record<string, unknown>,
  returnResponse?: boolean,
): Promise<unknown> {
  const { logger, wsLifecycle } = deps;
  const id = wsLifecycle.nextMessageId();
  const payload: Record<string, unknown> = {
    id,
    type: 'call_service',
    domain,
    service,
    target: { entity_id: entityId },
    // entity_id 必须在 spread 之后，避免 serviceData.entity_id 覆盖目标
    service_data: { ...(serviceData || {}), entity_id: entityId },
  };
  if (returnResponse) payload.return_response = true;

  const timeoutMs = getCallTimeoutMs(domain, service, returnResponse);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (wsLifecycle.hasPendingResult(id)) {
        wsLifecycle.deletePendingResult(id);
        reject(
          new BusinessException(
            ErrorCode.EXTERNAL_ERROR,
            API_ERROR.HA_CALL_SERVICE_TIMEOUT(domain, service),
          ),
        );
      }
    }, timeoutMs);
    wsLifecycle.addPendingResult(id, { resolve, reject, timeout });
    wsLifecycle.sendWsMessage(payload);
    logger.debug(`[命令已发送] ID ${id}: ${domain}.${service}`);
  });
}

/**
 * Leader 专用服务调用：Redis 命令桥接接收端调用，不走 Follower 转发逻辑。
 * 直接通过 WebSocket 执行 call_service。
 * @param requestId 可选幂等键：Leader 端去重，防止桥接重放 / 队列 flush 重复执行。
 * @returns HA 服务调用结果。
 */
export function callHaServiceAsLeader(
  deps: HaConnectorCallServiceDeps,
  domain: string,
  service: string,
  entityId: string,
  serviceData?: Record<string, unknown>,
  returnResponse?: boolean,
  requestId?: string,
): Promise<unknown> {
  return callHaServiceInternal(
    deps,
    domain,
    service,
    entityId,
    serviceData,
    returnResponse,
    false,
    requestId,
  );
}

/**
 * 通过 WebSocket 调用 HA 服务（断连时短时入队，重连后 flush）。
 * 路由策略：已连接 → WebSocket 即时调用；Follower → Redis 桥接；断连 → 入队或 REST 降级。
 * @param requestId 可选幂等键：断连入队 / 重试时同键去重，避免命令重复执行。
 * @returns HA 服务调用结果。
 */
export function callHaService(
  deps: HaConnectorCallServiceDeps,
  domain: string,
  service: string,
  entityId: string,
  serviceData?: Record<string, unknown>,
  returnResponse?: boolean,
  requestId?: string,
): Promise<unknown> {
  return callHaServiceInternal(
    deps,
    domain,
    service,
    entityId,
    serviceData,
    returnResponse,
    true,
    requestId,
  );
}

/**
 * call_service 内部路由实现（核心路径）。
 *
 * 路由策略：
 * 1. WS 已连接 → callServiceImmediate（WebSocket 即时调用）
 * 2. WS 断连 + Follower + Redis 可用 → commandBridge.forwardCommand（Redis 桥接转发至 Leader）
 *    - 桥接失败（timeout / unavailable / failed）→ REST 降级
 * 3. WS 断连 + Follower + Redis 不可用 → REST 降级
 * 4. WS 断连 + Leader → commandQueue.enqueue（入队等待重连 flush）
 *
 * 幂等：requestId 存在时窗口内去重，防止断连队列 flush 与重试/桥接重放重复执行。
 *
 * @param allowFollowerBridge 是否允许 Follower 桥接（Leader 专用调用设为 false）。
 * @param requestId 可选幂等键。
 * @returns HA 服务调用结果。
 */
function callHaServiceInternal(
  deps: HaConnectorCallServiceDeps,
  domain: string,
  service: string,
  entityId: string,
  serviceData?: Record<string, unknown>,
  returnResponse?: boolean,
  allowFollowerBridge = true,
  requestId?: string,
): Promise<unknown> {
  const { wsLifecycle, haLeader, commandBridge, restClient, commandQueue } = deps;

  // 同键去重：窗口内已有相同 requestId 的命令在执行/已入队，直接复用其结果
  const deduped = dedupRequestId(requestId);
  if (deduped) return deduped;

  const restPayload = (withReturnResponse: boolean) => {
    const payload: Record<string, unknown> = { ...(serviceData || {}), entity_id: entityId };
    if (withReturnResponse) payload.return_response = true;
    return payload;
  };

  const routeCall = (): Promise<unknown> => {
    const weatherForecastRest =
      domain === 'weather' && service === 'get_forecasts' && !!returnResponse;
    if (!wsLifecycle.isConnected()) {
      if (weatherForecastRest) {
        return restClient.callServiceViaRest(domain, service, entityId, restPayload(true), 45_000);
      }
      if (allowFollowerBridge && haLeader.isHaWsFollower()) {
        if (commandBridge.isAvailable()) {
          return commandBridge
            .forwardCommand(domain, service, entityId, serviceData, returnResponse, 12_000, requestId)
            .catch((err: unknown) => {
              if (shouldRestFallbackFromBridge(err)) {
                return restClient.callServiceViaRest(
                  domain,
                  service,
                  entityId,
                  restPayload(!!returnResponse),
                );
              }
              throw err;
            });
        }
        return restClient.callServiceViaRest(
          domain,
          service,
          entityId,
          restPayload(!!returnResponse),
        );
      }
      return commandQueue
        .enqueue(domain, service, entityId, serviceData, returnResponse, {
          ttlMs: returnResponse ? undefined : 5_000,
          requestId,
        })
        .then((result) => tagQueuedResult(result));
    }
    let immediate = callServiceImmediate(deps, domain, service, entityId, serviceData, returnResponse);
    if (weatherForecastRest) {
      immediate = immediate.catch((err: unknown) => {
        deps.logger.warn(`天气预报 WS 失败,REST 回退: ${getBridgeErrorText(err)}`);
        return restClient.callServiceViaRest(domain, service, entityId, restPayload(true), 45_000);
      });
    }
    return immediate;
  };

  const promise = (async () => {
    const current = deps.getEntityState?.(entityId);
    if (climateNeedsAutoTurnOn(domain, service, current, serviceData)) {
      deps.logger.log(
        `温控自动开启:${entityId} 当前 ${current ?? 'off'},先 turn_on 再执行 ${service}`,
      );
      try {
        await callHaServiceInternal(
          deps,
          'climate',
          'turn_on',
          entityId,
          {},
          false,
          allowFollowerBridge,
        );
      } catch (e: unknown) {
        deps.logger.warn(`温控自动开启失败(继续原命令): ${getBridgeErrorText(e)}`);
      }
    }
    return routeCall();
  })();

  registerRequestId(requestId, promise);
  return promise;
}

/** 标记经断连队列发出的结果，供 command-proxy / FE 识别 queued 协议 */
function tagQueuedResult(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return { ...(result as Record<string, unknown>), queued: true };
  }
  return { result, queued: true };
}

/** 供 commandQueue flush 回调使用 */
export function createCallServiceImmediateFn(deps: HaConnectorCallServiceDeps) {
  return (
    domain: string,
    service: string,
    entityId: string,
    serviceData?: Record<string, unknown>,
    returnResponse?: boolean,
  ) => callServiceImmediate(deps, domain, service, entityId, serviceData, returnResponse);
}
