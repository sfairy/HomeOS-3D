/**
 * HA WebRTC 信令转发服务。
 *
 * 职责：
 * - 经 HomeOS → HA WebSocket 转发 camera/webrtc/* 信令，HTTPS 页面无需直连 HA。
 * - 管理 ICE Server 配置合并（用户配置 + 默认 STUN）。
 * - 封装 WebRTC offer 协商、candidate 交换、会话关闭的完整流程。
 *
 * 依赖：HaConnectorService（WebSocket 通道）、AppConfigService（ICE 配置）。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { badRequest, BusinessException, ErrorCode } from '../../common/utils/business-exception';
import { getErrorMessage } from '../../common/utils';
import { HaConnectorService } from './service';
import { AppConfigService } from '../../shared/app-config/service';
import {
  buildIceServersFromConfig,
  mergeHaClientConfigWithIce,
  mergeIceServers,
  DEFAULT_STUN_SERVERS,
  type IceServerEntry,
} from '../../common/utils/webrtc-ice.util';

/** HA 基础设施类错误（超时 / 未连接）应上抛，不能伪装成「摄像头不支持」 */
function isHaInfraRequestError(err: unknown): boolean {
  const msg = getErrorMessage(err);
  return /超时|timeout|未连接|not connected/i.test(msg);
}

/** WebRTC offer 协商结果：包含 SDP answer、ICE candidates 与订阅 ID */
interface HaWebRtcNegotiateResult {
  session_id: string;
  answer: string;
  candidates: Record<string, unknown>[];
  subscription_id: number;
}

/**
 * HA WebRTC 信令转发服务（@Injectable）。
 * 经 HomeOS → HA WebSocket 转发 camera/webrtc/* 信令（HTTPS 页面无需直连 HA）。
 */
@Injectable()
export class HaWebrtcSignalService {
  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly appConfig: AppConfigService,
  ) {}

  /** @returns 从应用配置构建的 ICE Server 列表（不含默认 STUN）。 */
  getConfiguredIceServers(): IceServerEntry[] {
    return buildIceServersFromConfig(this.appConfig.get('webrtc'));
  }

  /** @returns 合并用户配置 ICE Server 与默认 STUN 后的完整列表。 */
  getMergedIceServers(): IceServerEntry[] {
    return mergeIceServers(this.getConfiguredIceServers(), DEFAULT_STUN_SERVERS);
  }

  /**
   * 校验 HA WebSocket 是否已连接，未连接时抛出 503 异常。
   * @throws {ServiceUnavailableException} HA 未连接时抛出。
   */
  private ensureConnected() {
    if (!this.haConnector.isConnected()) {
      throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, API_ERROR.HA_WEBRTC_NOT_CONNECTED);
    }
  }

  /**
   * 获取摄像头的 WebRTC 客户端配置并合并 ICE Server。
   * @param entityId 摄像头实体 ID（须以 camera. 开头）。
   * @returns 合并 ICE Server 后的客户端配置。
   * @throws {BusinessException} entityId 非 camera 域时抛出校验异常。
   */
  async getClientConfig(entityId: string): Promise<Record<string, unknown>> {
    this.ensureConnected();
    if (!entityId?.startsWith('camera.')) {
      badRequest(API_ERROR.VALIDATION_CAMERA_ENTITY_REQUIRED);
    }
    try {
      return mergeHaClientConfigWithIce(
        await this.haConnector.sendRequest<Record<string, unknown>>(
          'camera/webrtc/get_client_config',
          { entity_id: entityId },
          10_000,
        ),
        this.getConfiguredIceServers(),
      );
    } catch (e) {
      if (isHaInfraRequestError(e)) throw e;
      // 摄像头未接入 WebRTC 时 HA 会报业务错误；ICE 仍可用本地 STUN/TURN
      return mergeHaClientConfigWithIce({}, this.getConfiguredIceServers());
    }
  }

  /**
   * 发起 WebRTC offer 协商，获取 SDP answer 与 ICE candidates。
   * @param entityId 摄像头实体 ID（须以 camera. 开头）。
   * @param offer 客户端生成的 SDP offer 字符串。
   * @returns 协商结果（session_id、answer、candidates、subscription_id）。
   * @throws {BusinessException} entityId 非法或 offer 为空时抛出校验异常。
   */
  async negotiateOffer(entityId: string, offer: string): Promise<HaWebRtcNegotiateResult> {
    this.ensureConnected();
    if (!entityId?.startsWith('camera.')) {
      badRequest(API_ERROR.VALIDATION_CAMERA_ENTITY_REQUIRED);
    }
    if (!offer?.trim()) {
      badRequest(API_ERROR.VALIDATION_OFFER_REQUIRED);
    }
    return this.haConnector.subscribeWebRtcOffer(entityId, offer.trim());
  }

  /**
   * 向 HA 发送 WebRTC ICE candidate。
   * @param entityId 摄像头实体 ID。
   * @param sessionId WebRTC 会话 ID。
   * @param candidate ICE candidate 对象。
   */
  async addCandidate(
    entityId: string,
    sessionId: string,
    candidate: Record<string, unknown>,
  ): Promise<void> {
    this.ensureConnected();
    await this.haConnector.sendRequest(
      'camera/webrtc/candidate',
      { entity_id: entityId, session_id: sessionId, candidate },
      10_000,
    );
  }

  /**
   * 关闭 WebRTC 会话（取消 HA WebSocket 订阅）。
   * @param subscriptionId 协商时返回的 subscription_id。
   */
  async closeSession(subscriptionId: number): Promise<void> {
    this.ensureConnected();
    await this.haConnector.unsubscribeHaWs(subscriptionId);
  }

  /**
   * 向 HA 申请 HLS 播放列表路径（camera/stream）。
   * 返回相对路径，供前端走 stream-proxy。
   */
  async getHlsStreamPath(entityId: string): Promise<{ path: string }> {
    this.ensureConnected();
    if (!entityId?.startsWith('camera.')) {
      badRequest(API_ERROR.VALIDATION_CAMERA_ENTITY_REQUIRED);
    }
    let result: { url?: string } = {};
    try {
      result = await this.haConnector.sendRequest<{ url?: string }>(
        'camera/stream',
        { entity_id: entityId, format: 'hls' },
        20_000,
      );
    } catch (e) {
      if (isHaInfraRequestError(e)) throw e;
      return { path: '' };
    }
    const raw = String(result?.url || '').trim();
    if (!raw) {
      return { path: '' };
    }
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const url = new URL(raw);
        return { path: `${url.pathname}${url.search}` };
      } catch {
        return { path: '' };
      }
    }
    return { path: raw.startsWith('/') ? raw : `/${raw}` };
  }
}