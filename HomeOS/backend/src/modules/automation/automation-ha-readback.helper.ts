/**
 * 所属模块：backend/modules/automation
 * 职责：
 *  - HA automation 配置回读对齐；
 * 关键依赖：
 *  - yaml-parse.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../shared/prisma/service';
import { getErrorMessage } from '../../common/utils';
import { recordAutomationExecution } from '../../shared/orchestrator/execution-history-helper.util';
import type { HaAutomationTriggeredEvent } from '../../shared/types';

/** 去重记录上限：超过后清理最旧条目，防止内存无限增长 */
const DEDUP_MAX_SIZE = 2000;

interface AutomationHaReadbackDeps {
  prisma: Pick<PrismaService, 'automation' | 'automationExecution'>;
  logger: Logger;
  maxHistory: number;
  /**
   * 去重 Map（调用方单例持有）：key 为 automationId:triggerId 或 automationId:触发秒，
   * value 为触发秒时间戳，同秒已记录则跳过。
   */
  dedup: Map<string, number>;
}

/** 从 trigger 载荷中提取唯一 id（对象形态兼容，如 event 触发器自带 id） */
function extractTriggerId(trigger: unknown): string | undefined {
  if (trigger && typeof trigger === 'object') {
    const id = (trigger as { id?: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return undefined;
}

/** 将 trigger 载荷规整为 trace 可读的摘要字符串（超长截断） */
function summarizeTrigger(trigger: unknown): string {
  if (trigger == null) return '';
  if (typeof trigger === 'string') return trigger.slice(0, 200);
  try {
    const text = JSON.stringify(trigger);
    return text ? text.slice(0, 200) : String(trigger);
  } catch {
    return String(trigger);
  }
}

/**
 * 回读一次 HA 自动化触发并写入执行历史。
 *
 * 匹配规则：优先按 entity_id（automation.<haConfigId>）匹配本地 Automation，
 * 未命中时按事件 name 回退匹配（runOnHa=true）；非 HomeOS 管理的 HA 原生
 * 自动化或非 runOnHa 规则直接忽略。
 *
 * 去重策略：优先使用 trigger 中的唯一 id（HA 部分触发器自带），否则使用
 * （automationId + 触发秒）组合键，避免同一触发被重复记录。
 *
 * 写历史失败仅告警，不抛出、不影响 HA WS 消息处理链路。
 */
export async function recordAutomationHaTriggeredExecution(
  deps: AutomationHaReadbackDeps,
  payload: HaAutomationTriggeredEvent,
): Promise<void> {
  try {
    const entityId = payload.entity_id || '';
    const configId = entityId.startsWith('automation.') ? entityId.slice('automation.'.length) : '';
    // 1. 匹配本地 Automation（优先实体 ID，回退名称）
    let row = configId
      ? await deps.prisma.automation.findFirst({ where: { haConfigId: configId } })
      : null;
    if (!row && payload.name) {
      row = await deps.prisma.automation.findFirst({
        where: { name: payload.name, runOnHa: true },
      });
    }
    if (!row) return;
    if (!row.runOnHa) return;

    // 2. 去重：优先 trigger 唯一 id（存在即视为同一触发），否则 automationId+触发秒
    const triggeredAt = new Date();
    const triggerRaw = payload.trigger;
    const triggerId = extractTriggerId(triggerRaw);
    const secondKey = Math.floor(triggeredAt.getTime() / 1000);
    const key = triggerId ? `${row.id}:${triggerId}` : `${row.id}:${secondKey}`;
    if (triggerId) {
      if (deps.dedup.has(key)) return;
      deps.dedup.set(key, secondKey);
    } else {
      if (deps.dedup.get(key) === secondKey) return;
      deps.dedup.set(key, secondKey);
    }
    if (deps.dedup.size > DEDUP_MAX_SIZE) {
      const oldestKey = deps.dedup.keys().next().value;
      if (oldestKey !== undefined) deps.dedup.delete(oldestKey);
    }

    // 3. 写执行历史（HA 侧已确认触发，标记为成功并记录触发来源与 trigger 摘要）
    recordAutomationExecution(deps.prisma.automationExecution, deps.logger, deps.maxHistory, {
      automationId: row.id,
      name: row.name,
      success: true,
      trace: [
        {
          source: 'ha-triggered',
          haSource: payload.source || 'unknown',
          trigger: summarizeTrigger(triggerRaw),
          entityId,
          at: triggeredAt.toISOString(),
        },
      ],
    });
  } catch (err: unknown) {
    deps.logger.warn(`回读 HA 自动化触发执行历史失败: ${getErrorMessage(err)}`);
  }
}
