/**
 * HA WebRTC 信令工具（纯函数，便于单测）
 *
 * 所属模块：ha-connector
 * 职责：封装摄像头 WebRTC SDP 协商与取消订阅 ——
 *  - subscribeHaWebRtcOffer：发 camera/webrtc/offer，先 result 确认订阅，再 event 收 answer/candidate。
 *  - unsubscribeHaWs：会话结束取消 HA 订阅，释放资源。
 * 关键依赖：API_ERROR、BusinessException、HaConnectorWsLifecycle（WS 生命周期）。
 */
import { API_ERROR } from '../../common/errors/api-error-messages';
import { BusinessException, ErrorCode } from '../../common/utils';
import type { HaConnectorWsLifecycle } from './ws.helper';

/** WebRTC 协商结果：会话 ID、SDP answer、远端 ICE candidates、订阅 ID */
type WebRtcOfferResult = {
  session_id: string;
  answer: string;
  candidates: Record<string, unknown>[];
  subscription_id: number;
};

/**
 * camera/webrtc/offer：先 result 确认订阅，再通过 event 推送 session/answer/candidate。
 *
 * 协商流程：
 * 1. 发送 camera/webrtc/offer 消息，等待 result 确认订阅成功（ackTimeout 10s）
 * 2. 通过 event 接收 session_id、SDP answer、ICE candidates
 * 3. 收到 answer 后延迟 800ms 等待剩余 candidate，然后 resolve
 * 4. 整体超时 25s
 *
 * @param wsLifecycle WebSocket 生命周期实例。
 * @param entityId 摄像头实体 ID。
 * @param offer 客户端 SDP offer。
 * @returns 协商结果（session_id、answer、candidates、subscription_id）。
 * @throws {BusinessException} WebSocket 未连接时抛出。
 * @throws {Error} 协商超时或 HA 返回错误时抛出。
 */
export function subscribeHaWebRtcOffer(
  wsLifecycle: HaConnectorWsLifecycle,
  entityId: string,
  offer: string,
): Promise<WebRtcOfferResult> {
  if (!wsLifecycle.isConnected()) {
    throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, API_ERROR.HA_WS_NOT_CONNECTED);
  }
  const id = wsLifecycle.nextMessageId();
  return new Promise((resolve, reject) => {
    const remoteCandidates: Record<string, unknown>[] = [];
    let sessionId = '';
    let answer = '';
    let settleTimer: NodeJS.Timeout | null = null;
    let offerAcked = false;

    const cleanup = (err?: Error, result?: WebRtcOfferResult) => {
      clearTimeout(overallTimeout);
      clearTimeout(ackTimeout);
      if (settleTimer) clearTimeout(settleTimer);
      wsLifecycle.removeEventSubscription(id);
      if (err) reject(err);
      else if (result) resolve(result);
      else reject(new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_WEBRTC_NO_RESULT));
    };

    const overallTimeout = setTimeout(
      () => cleanup(new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_WEBRTC_TIMEOUT)),
      25_000,
    );

    wsLifecycle.addEventSubscription(id, (event) => {
      if (!offerAcked) return;
      const type = event.type;
      if (type === 'session') sessionId = String(event.session_id ?? '');
      if (type === 'answer') {
        answer = String(event.answer ?? '');
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          cleanup(undefined, {
            session_id: sessionId,
            answer,
            candidates: remoteCandidates,
            subscription_id: id,
          });
        }, 800);
      }
      if (type === 'candidate') {
        const c = event.candidate;
        if (c && typeof c === 'object') remoteCandidates.push(c as Record<string, unknown>);
      }
      if (type === 'error') {
        cleanup(
          new BusinessException(
            ErrorCode.EXTERNAL_ERROR,
            String(event.message || event.code || API_ERROR.HA_WEBRTC_ERROR),
          ),
        );
      }
    });

    const ackTimeout = setTimeout(
      () =>
        cleanup(
          new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_WEBRTC_OFFER_ACK_TIMEOUT),
        ),
      10_000,
    );

    wsLifecycle.addPendingResult(id, {
      resolve: () => {
        offerAcked = true;
      },
      reject: (err: unknown) => {
        cleanup(err instanceof Error ? err : new BusinessException(ErrorCode.EXTERNAL_ERROR, String(err)));
      },
      timeout: ackTimeout,
    });

    try {
      wsLifecycle.sendWsMessage({
        id,
        type: 'camera/webrtc/offer',
        entity_id: entityId,
        offer,
      });
    } catch (e: unknown) {
      cleanup(e instanceof Error ? e : new BusinessException(ErrorCode.EXTERNAL_ERROR, String(e)));
    }
  });
}

/**
 * 取消 HA WebSocket 订阅（WebRTC offer 会话结束）。
 * @param wsLifecycle WebSocket 生命周期实例。
 * @param subscriptionId 订阅 ID（subscribeHaWebRtcOffer 返回的 subscription_id）。
 * @param timeoutMs 超时毫秒数，默认 5s。
 * @returns WebSocket 未连接时直接 resolve，否则等待 HA 确认取消。
 */
export function unsubscribeHaWs(
  wsLifecycle: HaConnectorWsLifecycle,
  subscriptionId: number,
  timeoutMs = 5000,
): Promise<void> {
  if (!wsLifecycle.isConnected()) return Promise.resolve();
  const id = wsLifecycle.nextMessageId();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (wsLifecycle.hasPendingResult(id)) {
        wsLifecycle.deletePendingResult(id);
        reject(new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_UNSUBSCRIBE_TIMEOUT));
      }
    }, timeoutMs);
    wsLifecycle.addPendingResult(id, {
      resolve: () => resolve(),
      reject,
      timeout,
    });
    try {
      wsLifecycle.sendWsMessage({ id, type: 'unsubscribe', subscription: subscriptionId });
    } catch (e: unknown) {
      clearTimeout(timeout);
      wsLifecycle.deletePendingResult(id);
      reject(e);
    }
  });
}
