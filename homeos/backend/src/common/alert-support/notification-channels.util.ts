/**
 * LAN 站内通知渠道与列表拉取条数工具。
 *
 * 职责：定义局域网通知可用渠道（in_app / socket / tts / email / webpush / wecom），解析用户传入的渠道过滤参数，
 *   并根据前端 / 通知分区配置计算通知列表 API 的安全拉取条数。
 * 零依赖：无外部依赖，纯工具函数。
 */

/** LAN 站内通知渠道：in_app / socket / tts / email / webpush / wecom */
export type LanNotificationChannel =
  | 'in_app'
  | 'socket'
  | 'tts'
  | 'email'
  | 'webpush'
  | 'wecom';

/** 全部可用渠道的有序列表，空数组过滤参数视为全选 */
const LAN_NOTIFICATION_CHANNELS: LanNotificationChannel[] = [
  'in_app',
  'socket',
  'tts',
  'email',
  'webpush',
  'wecom',
];

/**
 * 解析用户传入的渠道过滤参数，返回有效的渠道列表。
 *
 * @param channels 用户指定的渠道数组；null/undefined/空数组 视为"全选"
 * @returns 去重后的有效渠道列表；若输入全部非法则回退为全选
 *
 * 实现要点：
 * - 使用 Set 自动去重，避免同一渠道重复出现。
 * - 仅保留 LAN_NOTIFICATION_CHANNELS 中已定义的渠道，过滤掉非法值。
 * - 最终若集合为空（全部非法），回退为全渠道，确保通知总能送达。
 */
/** 空数组 = 全选 */
export function resolveLanChannels(channels?: string[] | null): LanNotificationChannel[] {
  const raw = Array.isArray(channels) ? channels.filter(Boolean) : [];
  // 空数组视为全选，避免用户传空导致通知无法送达
  if (raw.length === 0) return [...LAN_NOTIFICATION_CHANNELS];
  const set = new Set<LanNotificationChannel>();
  for (const c of raw) {
    // 仅保留预定义渠道，忽略非法值
    if (LAN_NOTIFICATION_CHANNELS.includes(c as LanNotificationChannel)) {
      set.add(c as LanNotificationChannel);
    }
  }
  // 全部非法时回退为全选
  return set.size > 0 ? [...set] : [...LAN_NOTIFICATION_CHANNELS];
}

/**
 * 解析告警规则（应用内规则）的推送渠道。
 *
 * 与 `resolveLanChannels` 的关键差异：**空数组不视为全选**，而是收敛为「仅站内 + 实时」。
 * 告警规则面板承诺「默认写入通知中心，勾选后才额外推送」，若沿用全选语义，
 * 用户未勾选 Email / WebPush / 企业微信时也会被全渠道外发。
 *
 * @param channels 规则持久化的渠道数组
 * @returns 去重后的渠道列表；空/非法输入回退 ['in_app', 'socket']
 */
export function resolveAlertRuleChannels(channels?: string[] | null): LanNotificationChannel[] {
  const raw = Array.isArray(channels) ? channels.filter(Boolean) : [];
  if (raw.length === 0) return ['in_app', 'socket'];
  const set = new Set<LanNotificationChannel>();
  for (const c of raw) {
    if (LAN_NOTIFICATION_CHANNELS.includes(c as LanNotificationChannel)) {
      set.add(c as LanNotificationChannel);
    }
  }
  return set.size > 0 ? [...set] : ['in_app', 'socket'];
}

/**
 * 计算通知列表 API 的安全拉取条数。
 *
 * @param limit 调用方请求的条数；非法或未传时回退到前端默认值
 * @param frontend 前端配置分区，提供 maxRemoteNotifications 作为默认拉取数
 * @param notification 通知配置分区，提供 maxNotifications 作为存储上限
 * @returns 最终拉取条数：≥1 且 ≤ 存储上限
 *
 * 实现要点：
 * - defaultFetch：前端配置的远端默认拉取数，非法时回退 100。
 * - storageCap：通知存储上限，非法时回退 500，防止拉取过多撑爆存储。
 * - 最终值在 [1, storageCap] 范围内，确保既不少于 1 条也不超过存储容量。
 */
export function resolveNotificationFetchLimit(
  limit: number | undefined | null,
  frontend: { maxRemoteNotifications?: number },
  notification: { maxNotifications?: number },
): number {
  // 前端默认拉取数，配置缺失或非法时回退 100
  const defaultFetch =
    Number(frontend.maxRemoteNotifications) > 0 ? Number(frontend.maxRemoteNotifications) : 100;
  // 通知存储上限，配置缺失或非法时回退 500
  const storageCap =
    Number(notification.maxNotifications) > 0 ? Number(notification.maxNotifications) : 500;
  // 解析调用方传入的 limit：须为正有限数，否则回退默认值
  const parsed =
    limit != null && Number.isFinite(Number(limit)) && Number(limit) > 0
      ? Math.floor(Number(limit))
      : defaultFetch;
  // 最终值 clamp 到 [1, storageCap]
  return Math.min(Math.max(parsed, 1), storageCap);
}
