/**
 * 内嵌页 WebSocket 反代
 *
 * 所属模块：backend/src/common/embed
 * 职责：将 HTTPS 父页 iframe 内嵌的 HTTP 站点的 WebSocket 流量同源反代到上游，
 *   使其可在 HTTPS 父页下正常工作；并复用 HTTP 侧的 Cookie Path 设计，
 *   让登录后的 WS 通道自动带上会话 Cookie。
 * 关键依赖：
 *   - ws#WebSocketServer：WS 服务端实现
 *   - @nestjs/jwt#JwtService：解析 auth_token cookie，校验 WS 握手权限
 *   - ./proxy.util / ./proxy-forward.util：URL / Cookie 处理函数
 *   - ../utils/ws-upgrade-proxy.util：底层 WS 桥接
 */
import { getErrorMessage } from '../utils';
import type { Server, IncomingMessage } from 'http';
import { URL } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import {
  buildEmbedUpstreamUrl,
  getEmbedUpstreamOrigin,
} from './proxy.util';
import { stripHomeosCookies } from './proxy-forward.util';
import { bridgeClientToUpstream, parseCookie } from '../utils/ws-upgrade-proxy.util';

// 与 HTTP 反代同根：内嵌站 Cookie 的 Path 收敛在 /api/v1/embed-proxy/<id>/ 之下，
// WS 握手须落在同一路径前缀，浏览器才会带上登录后的会话 Cookie。
const WS_MOUNT = '/api/v1/embed-proxy/';
const logger = new Logger('EmbedWsProxy');

/**
 * 与 HTTP 侧 embed-proxy 的 RolesGuard 保持一致：仅放行 admin/adult/child。
 * 防止未授权用户通过 WS 通道访问内嵌站资源。
 */
const EMBED_WS_ALLOWED_ROLES = new Set(['admin', 'adult', 'child']);

/**
 * 校验 WS 升级请求的鉴权 Cookie。
 *
 * @param req        HTTP 升级请求
 * @param jwtService JwtService 实例
 * @returns true 表示鉴权通过；失败（无 token / 校验失败 / 角色不允许）返回 false
 */
function verifyEmbedWsAuth(req: IncomingMessage, jwtService: JwtService): boolean {
  // 从 Cookie 头解析 auth_token（HomeOS 自身鉴权 token）
  const token = parseCookie(req, 'auth_token');
  if (!token) return false;
  try {
    const payload = jwtService.verify(token) as { role?: string };
    // 角色未声明时按 'user' 兜底，不在白名单内则拒绝
    return EMBED_WS_ALLOWED_ROLES.has(payload.role || 'user');
  } catch {
    return false;
  }
}

/**
 * 构造上游 WS URL：先按 HTTP 规则拼接上游地址，再把协议 http(s) 替换为 ws(s)。
 *
 * @param embedBase 上游 origin
 * @param subPath   子路径
 * @param search    查询串
 * @returns 完整的 ws(s):// URL
 */
function buildUpstreamWsUrl(embedBase: string, subPath: string, search: string): string {
  const httpUrl = buildEmbedUpstreamUrl(embedBase, subPath || '/', search || '');
  // 仅替换开头的 http 协议为 ws（https 同步变为 wss）
  return httpUrl.replace(/^http/i, 'ws');
}

/**
 * HTTPS 父页 iframe 内嵌 HTTP 站点的 WebSocket 同源反代。
 *
 * 挂载流程：
 *   1. 在 HTTP server 上监听 'upgrade' 事件；
 *   2. 仅处理路径以 WS_MOUNT 开头的请求，其余放行；
 *   3. 校验 auth_token Cookie 鉴权；
 *   4. 从 URL 解析 embedId，反查 embedBase；
 *   5. 转发 Cookie / Origin / User-Agent 给上游；
 *   6. wss 上游放行自签证书；
 *   7. 转发客户端子协议，与上游建立 WS 连接并桥接。
 *
 * @param server          HTTP server 实例
 * @param jwtService      JwtService 实例
 * @param resolveEmbedBase 通过 embedId 解析上游 origin 的回调
 */
export function attachEmbedWsProxy(
  server: Server,
  jwtService: JwtService,
  resolveEmbedBase: (embedId: string) => Promise<string>,
): void {
  // 回显客户端请求的首个子协议，保持 clientWs.protocol 与内嵌站期望一致
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      const first = protocols.values().next().value;
      return first ?? false;
    },
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    // 非内嵌反代路径：交给其他 upgrade 处理器
    if (!url.pathname.startsWith(WS_MOUNT)) return;

    void (async () => {
      try {
        // 鉴权失败：回 401 并销毁 socket
        if (!verifyEmbedWsAuth(req, jwtService)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // 从 pathname 解析 embedId 与 subPath：
        // /api/v1/embed-proxy/<embedId>/<subPath...>
        const rest = decodeURIComponent(url.pathname.slice(WS_MOUNT.length));
        const slash = rest.indexOf('/');
        const embedId = (slash >= 0 ? rest.slice(0, slash) : rest).trim();
        const subPath = slash >= 0 ? rest.slice(slash) : '/';
        if (!embedId) {
          // 缺 embedId：回 400
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }

        // 反查上游地址并构造 WS URL
        const embedBase = await resolveEmbedBase(embedId);
        const upstreamUrl = buildUpstreamWsUrl(embedBase, subPath, url.search);

        // 转发握手头：内嵌站会话 Cookie（剔除 HomeOS 自身 Cookie）+ 还原 Origin，
        // 使内嵌站「登录后才放行的 WebSocket」在反代下也能通过鉴权；
        // wss 上游常用自签证书，放行证书校验避免握手失败。
        const upstreamHeaders: Record<string, string> = {
          origin: getEmbedUpstreamOrigin(embedBase),
        };
        const fwdCookie = stripHomeosCookies(req.headers.cookie);
        if (fwdCookie) upstreamHeaders.cookie = fwdCookie;
        if (typeof req.headers['user-agent'] === 'string') {
          upstreamHeaders['user-agent'] = req.headers['user-agent'];
        }
        const upstreamOptions: WebSocket.ClientOptions = { headers: upstreamHeaders };
        // wss 自签证书放行：仅对 wss 协议生效
        if (upstreamUrl.toLowerCase().startsWith('wss:')) {
          upstreamOptions.rejectUnauthorized = false;
        }

        // 转发客户端请求的子协议，否则使用子协议的内嵌站 WS 会握手失败
        const protoHeader = req.headers['sec-websocket-protocol'];
        const protocols =
          typeof protoHeader === 'string'
            ? protoHeader
                .split(',')
                .map((p) => p.trim())
                .filter(Boolean)
            : [];

        wss.handleUpgrade(req, socket, head, (clientWs) => {
          // 携带子协议时传给上游 WebSocket 构造器
          const upstream =
            protocols.length > 0
              ? new WebSocket(upstreamUrl, protocols, upstreamOptions)
              : new WebSocket(upstreamUrl, upstreamOptions);

          // 桥接客户端与上游连接：30s 心跳保活，关闭时记录日志
          bridgeClientToUpstream({
            clientWs,
            upstream,
            heartbeatMs: 30_000,
            onClose: (err) => {
              if (err) logger.debug(`内嵌页 WS 反代已关闭: ${err.message}`);
            },
          });
        });
      } catch (err) {
        logger.warn(`内嵌页 WS 升级失败: ${getErrorMessage(err)}`);
        socket.destroy();
      }
    })();
  });

  logger.log(`内嵌页 WebSocket 反代已挂载:${WS_MOUNT}:embedId/*`);
}