/**
 * @file hazard.util.ts
 * @module common/http-security
 *
 * 危险布局绑定、自动关阀/排风动作与 SecurityEvent 异步写入。
 *
 * 职责：
 * - 从房间/布局的 haConfig 中解析危险设备绑定（烟感、燃气、漏水传感器、紧急关阀、
 *   排风、紧急场景），供危险事件触发时执行自动化动作。
 * - 在烟/燃气/漏水告警时自动关闭对应主阀并开启排风（带重试），降低灾害扩散风险。
 * - 异步写入 SecurityEvent 审计记录，支持告警版（logger.warn）与静默版两种模式。
 *
 * 关键依赖：
 * - @homeos/shared（getEntityDomain、parseHazardEntityIdList、HazardActionResult 类型）
 * - ../prisma/prisma.service（SecurityEvent 持久化）
 * - ../resilience/circuit-breaker（scheduleBackgroundTask 后台任务调度）
 *
 * 安全相关：自动关阀/排风是物理安全动作，演习模式下跳过执行；SecurityEvent 写入
 * 失败不影响主流程，但会记录日志以便排查。
 */
import type { Logger } from '@nestjs/common';
import { getEntityDomain, parseHazardEntityIdList, type HazardActionResult } from '@homeos/shared';
import type { PrismaService } from '../../shared/prisma/service';
import { scheduleBackgroundTask } from '../resilience/circuit-breaker.helper';

// ── 危险源布局绑定 ── ────────────────────

/**
 * 危险布局绑定配置。
 *
 * 由房间/布局的 haConfig 字段解析而来，描述该空间内各类危险传感器与对应自动动作
 * 实体的关联关系。
 */
interface HazardLayoutBindings {
  /** 烟感传感器实体 ID 列表 */
  smokeEntityIds: string[];
  /** 燃气传感器实体 ID 列表 */
  gasEntityIds: string[];
  /** 漏水传感器实体 ID 列表 */
  leakEntityIds: string[];
  /** 触发时执行的 HomeOS 场景 ID（逗号分隔，可多选） */
  emergencySceneIds: string[];
  /** 燃气紧急关阀实体（valve / switch） */
  gasValveEntityId: string;
  /** 漏水紧急关阀实体 */
  waterValveEntityId: string;
  /** 烟/燃气告警时开启的排风实体（逗号分隔） */
  exhaustFanEntityIds: string[];
  /** 演习模式：不执行关阀/排风自动动作 */
  hazardDrillMode: boolean;
}

/**
 * 将逗号/分号/空白分隔的字符串解析为去重后的 ID 数组。
 * @param raw 原始字符串。
 * @returns 去空白且过滤空值后的 ID 数组。
 */
function parseCommaIds(raw: string): string[] {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 从布局对象解析危险设备绑定配置。
 *
 * 仅读取复数实体 ID 字段（hazardSmokeEntityIds 等）与 emergency 场景列表。
 *
 * @param layout 房间/布局对象，需包含 haConfig 字段。
 * @returns 解析后的绑定配置；无 haConfig 时返回全空值对象。
 */
export function parseHazardLayoutBindings(
  layout: Record<string, unknown> | null | undefined,
): HazardLayoutBindings {
  const ha = (
    layout?.haConfig && typeof layout.haConfig === 'object' ? layout.haConfig : {}
  ) as Record<string, unknown>;
  const pick = (k: string) => String(ha[k] ?? '').trim();
  const emergencySceneIds = parseCommaIds(pick('hazardEmergencySceneId'));
  return {
    smokeEntityIds: parseHazardEntityIdList(ha, 'hazardSmokeEntityIds'),
    gasEntityIds: parseHazardEntityIdList(ha, 'hazardGasEntityIds'),
    leakEntityIds: parseHazardEntityIdList(ha, 'hazardLeakEntityIds'),
    emergencySceneIds,
    gasValveEntityId: pick('hazardGasValveEntityId'),
    waterValveEntityId: pick('hazardWaterValveEntityId'),
    exhaustFanEntityIds: parseCommaIds(pick('hazardExhaustFanEntityIds')),
    hazardDrillMode: Boolean(ha.hazardDrillMode),
  };
}
/**
 * 根据实体 ID 反查其所属的危险类型（烟/燃气/漏水）。
 *
 * @param entityId HA 实体 ID。
 * @param bindings 已解析的布局绑定。
 * @returns 'smoke' | 'gas' | 'leak'，未绑定时返回 null。
 */
export function resolveBoundHazardKind(
  entityId: string,
  bindings: HazardLayoutBindings,
): 'smoke' | 'gas' | 'leak' | null {
  const id = String(entityId || '').trim();
  if (!id) return null;
  if (bindings.smokeEntityIds.includes(id)) return 'smoke';
  if (bindings.gasEntityIds.includes(id)) return 'gas';
  if (bindings.leakEntityIds.includes(id)) return 'leak';
  return null;
}

// ── 危险源自动动作 ── ────────────────────

/**
 * HA 服务调用抽象接口，供 runHazardAutoActions 注入实际调用逻辑。
 */
interface HazardAutoActionRunner {
  callService: (domain: string, service: string, entityId: string) => Promise<unknown>;
}

/** 阀门/排风重试间隔（毫秒），用于 HA 临时不可达时短重试 */
const VALVE_RETRY_DELAY_MS = 400;

/**
 * 带重试的 HA 服务调用。
 *
 * 安全意图：关阀是关键安全动作，HA 偶发抖动时短重试一次以提高成功率；排风重试次数
 * 较低（retries=0），因排风失败影响小于关阀失败。
 *
 * @param runner HA 服务调用器。
 * @param domain HA 域（如 'valve'、'switch'、'fan'）。
 * @param service 服务名（如 'turn_off'、'turn_on'）。
 * @param entityId 目标实体 ID。
 * @param retries 额外重试次数（不含首次）。
 * @returns true 表示最终成功；false 表示所有尝试均失败。
 */
async function callWithRetry(
  runner: HazardAutoActionRunner,
  domain: string,
  service: string,
  entityId: string,
  retries = 1,
): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await runner.callService(domain, service, entityId);
      return true;
    } catch {
      if (attempt >= retries) return false;
      await new Promise((resolve) => setTimeout(resolve, VALVE_RETRY_DELAY_MS));
    }
  }
  return false;
}

/**
 * 执行危险告警的自动动作（关阀 + 排风），返回每个动作的结果。
 *
 * 动作策略：
 * - 烟感/燃气：关闭燃气主阀 + 开启排风。
 * - 漏水：关闭水主阀（不开排风，因水泄漏无燃气积聚风险）。
 *
 * 未配置阀门/排风实体时回退到默认实体（valve.gas_main / valve.water_main /
 * fan.exhaust 等），尽力执行以降低风险。
 *
 * @param bindings 布局绑定配置。
 * @param hazard 危险类型。
 * @param runner HA 服务调用器。
 * @returns 每个动作的执行结果数组（含目标实体、动作类型、成功标志）。
 */
export async function runHazardAutoActions(
  bindings: HazardLayoutBindings,
  hazard: 'smoke' | 'gas' | 'leak',
  runner: HazardAutoActionRunner,
): Promise<HazardActionResult[]> {
  const results: HazardActionResult[] = [];
  const isSmoke = hazard === 'smoke';
  const isGas = hazard === 'gas';
  const isLeak = hazard === 'leak';

  /**
   * 关闭指定阀门实体（带 1 次重试），结果追加到 results。
   */
  async function closeValve(target: string) {
    const ok = await callWithRetry(runner, getEntityDomain(target), 'turn_off', target, 1);
    results.push({ target, action: 'close_valve', ok });
  }

  /**
   * 开启指定排风实体（无重试），结果追加到 results。
   */
  async function openExhaust(target: string) {
    const ok = await callWithRetry(runner, getEntityDomain(target), 'turn_on', target, 0);
    results.push({ target, action: 'open_exhaust', ok });
  }

  // 烟感/燃气：关燃气主阀（阻断气源）
  if (isSmoke || isGas) {
    const gasValve = bindings.gasValveEntityId || 'valve.gas_main';
    await closeValve(gasValve);
  }

  // 漏水：关水主阀（阻断水源）
  if (isLeak) {
    const waterValve = bindings.waterValveEntityId || 'valve.water_main';
    await closeValve(waterValve);
  }

  // 烟感/燃气：开启排风（稀释可燃气体/烟雾）
  if (isSmoke || isGas) {
    const fanTargets = bindings.exhaustFanEntityIds.length
      ? bindings.exhaustFanEntityIds
      : ['fan.exhaust', 'fan.ventilation', 'switch.exhaust_fan'];
    for (const target of fanTargets) {
      await openExhaust(target);
    }
  }

  return results;
}
// ── 安防事件持久化 ── ────────────────────

/**
 * SecurityEvent 写入选项。
 */
interface SecurityEventOpts {
  /** 布防模式（armed_home / armed_away / disarmed 等） */
  mode?: string;
  /** 关联的实体 ID */
  entityId?: string;
  /** 触发的区域列表 */
  zones?: string[];
}

/**
 * 异步写入 SecurityEvent；失败时 logger.warn，不抛错。
 *
 * 安全意图：审计日志写入不应阻塞主流程，但需记录告警详情到日志以便即时排查；
 * 底层失败由 scheduleBackgroundTask 兜底处理。
 *
 * @param prisma Prisma 服务实例。
 * @param logger NestJS Logger 实例。
 * @param type 事件类型。
 * @param detail 事件详情（同时输出到 logger.warn）。
 * @param opts 可选的布防模式、实体、区域信息。
 */
export function scheduleSecurityEvent(
  prisma: PrismaService,
  logger: Logger,
  type: string,
  detail: string,
  opts?: SecurityEventOpts,
) {
  logger.warn(detail);
  scheduleBackgroundTask(logger, 'SecurityEvent 写入', () =>
    prisma.securityEvent.create({
      data: {
        type,
        mode: opts?.mode || 'disarmed',
        entityId: opts?.entityId,
        detail,
        zones: opts?.zones || [],
      },
    }),
  );
}

/**
 * 静默写入 SecurityEvent（无 logger.warn，失败静默），与安防面板原 persistEvent 行为一致。
 *
 * 安全意图：用于高频或非关键事件审计，避免日志噪声；失败仅 debug 级别记录。
 *
 * @param prisma Prisma 服务实例。
 * @param type 事件类型。
 * @param detail 事件详情。
 * @param opts 可选的布防模式、实体、区域、默认模式、logger。
 */
export function scheduleSecurityEventSilent(
  prisma: PrismaService,
  type: string,
  detail: string,
  opts?: SecurityEventOpts & { defaultMode?: string; logger?: Logger },
) {
  setImmediate(() => {
    prisma.securityEvent
      .create({
        data: {
          type,
          mode: opts?.mode || opts?.defaultMode || 'disarmed',
          entityId: opts?.entityId,
          detail,
          zones: opts?.zones || [],
        },
      })
      .catch((err) => {
        opts?.logger?.debug?.(`SecurityEvent 静默写入失败: ${(err as Error).message}`);
      });
  });
}