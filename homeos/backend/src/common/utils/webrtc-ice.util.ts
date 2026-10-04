/**
 * WebRTC ICE 服务器构造与合并工具。
 *
 * 职责：
 *   - IceServerEntry：标准 ICE 服务器条目（STUN/TURN，含可选鉴权）；
 *   - DEFAULT_STUN_SERVERS：内置 Google 公开 STUN 兜底；
 *   - buildIceServersFromConfig：从系统配置「高级参数 → WebRTC」解析用户自定义 ICE/TURN；
 *   - mergeIceServers：按 JSON 序列化去重合并多组 ICE 列表；
 *   - mergeHaClientConfigWithIce：把 HA get_client_config 的 iceServers 与 HomeOS 自定义 +
 *     默认 STUN 合并，写回 configuration.iceServers。
 * 关键依赖：
 *   - ../../shared/app-config/types#AppConfigData：系统配置类型
 */
import type { AppConfigData } from '../../shared/app-config/types';

/** 标准 ICE 服务器条目（STUN / TURN，含可选 username/credential 鉴权字段） */
export interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** 兜底 STUN：未配置自定义 ICE 时使用 Google 公开 STUN */
export const DEFAULT_STUN_SERVERS: IceServerEntry[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * 将逗号 / 分号 / 换行分隔的 ICE URL 字符串切分为数组。
 * 空白与空段会被过滤。
 */
function parseWebrtcIceUrls(iceUrls: string | undefined): string[] {
  if (!iceUrls?.trim()) return [];
  return iceUrls
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 从系统配置解析额外 ICE/TURN（设置 → 高级参数 → WebRTC）。
 * 提供了 username 时整体作为单条带鉴权的 TURN 条目返回，否则每个 URL 一条。
 *
 * @param webrtc 系统配置中的 webrtc 字段
 * @returns ICE 服务器条目数组，空配置返回 []
 */
export function buildIceServersFromConfig(
  webrtc: AppConfigData['webrtc'] | undefined,
): IceServerEntry[] {
  const urls = parseWebrtcIceUrls(webrtc?.iceUrls);
  if (!urls.length) return [];
  const username = webrtc?.iceUsername?.trim() || undefined;
  const credential = webrtc?.iceCredential?.trim() || undefined;
  if (username) {
    return [{ urls, username, credential }];
  }
  return urls.map((url) => ({ urls: url }));
}

/**
 * 合并多组 ICE 服务器列表，按 JSON 序列化去重保持插入顺序。
 * 后续列表中重复条目会被丢弃，避免客户端重复 ICE 探测。
 *
 * @param lists 多组 ICE 列表（可空）
 * @returns 去重后的合并列表
 */
export function mergeIceServers(...lists: (IceServerEntry[] | undefined)[]): IceServerEntry[] {
  const seen = new Set<string>();
  const out: IceServerEntry[] = [];
  for (const list of lists) {
    for (const entry of list || []) {
      if (!entry?.urls) continue;
      const key = JSON.stringify(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

/**
 * 从 HA get_client_config 返回中提取 iceServers 数组。
 * 非预期结构（无 configuration / iceServers 非数组）时返回 []。
 */
function extractHaIceServers(haConfig: Record<string, unknown>): IceServerEntry[] {
  const conf = haConfig?.configuration;
  if (!conf || typeof conf !== 'object') return [];
  const servers = (conf as Record<string, unknown>).iceServers;
  if (!Array.isArray(servers)) return [];
  return servers.filter((s) => s && typeof s === 'object') as IceServerEntry[];
}

/**
 * 合并 HA get_client_config 与 HomeOS 额外 TURN/STUN，并兜底默认 STUN。
 * 保留 HA 原有 configuration 字段（除 iceServers 外），仅替换 iceServers。
 *
 * @param haConfig HA get_client_config 返回的原始对象
 * @param extraIce HomeOS 自定义 ICE 列表
 * @returns 写回 configuration.iceServers 后的对象
 */
export function mergeHaClientConfigWithIce(
  haConfig: Record<string, unknown>,
  extraIce: IceServerEntry[],
): Record<string, unknown> {
  const haIce = extractHaIceServers(haConfig);
  const merged = mergeIceServers(haIce, extraIce, DEFAULT_STUN_SERVERS);
  const prevConf = haConfig.configuration;
  const configuration = {
    ...(typeof prevConf === 'object' && prevConf ? prevConf : {}),
    iceServers: merged,
  };
  return { ...haConfig, configuration };
}
