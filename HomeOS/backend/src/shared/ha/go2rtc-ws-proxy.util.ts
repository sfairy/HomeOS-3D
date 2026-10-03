/**
 * 所属模块：backend/shared/ha
 * 职责：
 *  - go2rtc WS 信令代理+鉴权注入；
 * 关键依赖：
 *  - http-proxy；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { getErrorMessage } from '../../common/utils';
import type { Server, IncomingMessage } from 'http';
import { URL } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { Logger } from '@nestjs/common';
import type { JwtUserLike } from '@homeos/shared';
import { assertWebRtcWsTokenAllowed } from '../../common/http-security/device-access.util';
import { bridgeClientToUpstream, parseCookie } from '../../common/utils/ws-upgrade-proxy.util';

const PROXY_PATH = '/api/v1/ha/webrtc-ws';
const logger = new Logger('HaGo2RtcWsProxy');

/**
 * HaGo2RtcWsProxyDeps：业务类型别名。
 * - 表示：shared/ha/go2rtc-ws-proxy.util.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
type HaGo2RtcWsProxyDeps = {
  /** 解析 Cookie JWT 为用户（含会话吊销 / tokenVersion） */
  resolveWsUser: (token: string) => Promise<JwtUserLike>;
  /** 返回当前 HA base URL；未配置时返回空 */
  getHaUrl: () => Promise<string | undefined>;
};

async function verifyWebRtcWsAuth(
  req: IncomingMessage,
  deps: HaGo2RtcWsProxyDeps,
  entityId: string,
): Promise<boolean> {
  const token = parseCookie(req, 'auth_token');
  if (!token) return false;
  try {
    const user = await deps.resolveWsUser(token);
    return assertWebRtcWsTokenAllowed(user, entityId);
  } catch {
    return false;
  }
}

/** HTTPS 页面经同源 WSS 反代 HA /api/webrtc/ws（go2rtc 路径） */
export function attachHaGo2RtcWsProxy(server: Server, deps: HaGo2RtcWsProxyDeps): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== PROXY_PATH) return;

    void (async () => {
      try {
        const entityId = url.searchParams.get('entity_id')?.trim();
        const token = url.searchParams.get('token')?.trim();
        if (!entityId?.startsWith('camera.') || !token) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }

        if (!(await verifyWebRtcWsAuth(req, deps, entityId))) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const haUrl = await deps.getHaUrl();
        if (!haUrl?.trim()) {
          socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
          socket.destroy();
          return;
        }

        const upstreamUrl = `${haUrl.replace(/\/$/, '').replace(/^http/, 'ws')}/api/webrtc/ws?entity_id=${encodeURIComponent(entityId)}&token=${encodeURIComponent(token)}`;

        wss.handleUpgrade(req, socket, head, (clientWs) => {
          const upstream = new WebSocket(upstreamUrl);
          bridgeClientToUpstream({
            clientWs,
            upstream,
            onClose: (err) => {
              if (err) logger.debug(`go2rtc WS 反代已关闭: ${err.message}`);
            },
          });
        });
      } catch (err) {
        logger.warn(
          `WebRTC WS 升级失败: ${getErrorMessage(err)}`,
        );
        socket.destroy();
      }
    })();
  });

  logger.log(`go2rtc WebSocket 反代已挂载:${PROXY_PATH}`);
}
