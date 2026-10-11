/**
 * 实体同步优先级模块
 *
 * 职责：
 *  - 在冷启动 / 初始同步时，将控制类 domain 的实体排到队列前部，缩短用户可见延迟。
 *  - 维护两套关键 domain 清单：初始同步版（不含 lock）与 WS 推送版（含 lock）。
 *
 * 关键依赖：
 *  - getEntityDomain：从 entity_id 提取 domain 用于匹配。
 *
 * 调用场景：
 *  - 后端 WS 网关在客户端订阅时按此排序推送首批状态；
 *  - 前端收到批量实体后也可用此排序优先渲染控制卡片。
 */
import { getEntityDomain } from './domain';

/**
 * 初始同步 / 冷启动优先推送的控制类 domain（不含 lock；WS 网关可额外叠加）。
 * 不含 lock 的原因：初始同步阶段 lock 状态非紧急，避免与高频控制类抢带宽。
 */
export const DEFAULT_CRITICAL_DOMAINS = [
  'light',         // 灯具：用户最常操作的实体
  'switch',        // 开关：高频控制
  'cover',         // 窗帘：状态需及时反馈
  'climate',       // 恒温器：目标温度需即时显示
  'media_player',  // 媒体播放器：播放状态需同步
  'fan',           // 风扇：风速 / 状态
] as const;

/**
 * 冷启动按需订阅时仍优先推送的关键 domain（含 lock）。
 * WS 网关在客户端建立长连接后用此清单决定哪些 domain 的状态变更立即推送。
 */
export const WS_PUSH_CRITICAL_DOMAINS = [...DEFAULT_CRITICAL_DOMAINS, 'lock'] as const;

/**
 * 实体最小形状：仅需 entity_id 字段即可参与优先级排序。
 */
export type EntityIdLike = { entity_id?: string };

/**
 * 按关键域优先排序实体列表。
 *
 * @param entities        待排序实体数组
 * @param criticalDomains 关键 domain 清单（默认 DEFAULT_CRITICAL_DOMAINS）
 * @returns 新数组：关键域实体在前，其余在后；不修改原数组
 *
 * 实现说明：
 *  - 单元素或空数组直接返回，避免无谓拷贝；
 *  - 一次遍历分流到 hi / lo 两个缓冲区，再 concat，时间复杂度 O(n)；
 *  - lo 为空时直接返回 hi，避免产生多余的空数组拼接。
 */
export function sortEntitiesBySyncPriority<T extends EntityIdLike>(
  entities: T[],
  criticalDomains: readonly string[] = DEFAULT_CRITICAL_DOMAINS,
): T[] {
  if (!Array.isArray(entities) || entities.length <= 1) return entities || [];
  // 兜底：传入空数组时回退到默认清单
  const critical = new Set(
    criticalDomains?.length ? criticalDomains : DEFAULT_CRITICAL_DOMAINS,
  );
  const hi: T[] = [];
  const lo: T[] = [];
  for (const entity of entities) {
    if (critical.has(getEntityDomain(entity?.entity_id ?? ''))) hi.push(entity);
    else lo.push(entity);
  }
  // lo 为空时无需 concat，直接返回 hi
  return lo.length ? hi.concat(lo) : hi;
}