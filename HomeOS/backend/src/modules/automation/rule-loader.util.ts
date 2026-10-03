/**
 * 自动化规则加载工具。
 *
 * 所属模块：backend/modules/automation
 * 职责：从 Prisma 拉取自动化记录，按 runOnHa / 启用状态过滤，逐条解析 YAML
 *  为 AutomationRule，并汇总被 watch 的 entity_id 集合与通配前缀，
 *  供 AutomationEngineService 在 onModuleInit 与 reloadRules 时调用。
 * 关键依赖：PrismaService、yaml-parse.util、state-change-filter.util。
 */
import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../shared/prisma/service';
import {
  collectWatchedEntityIds,
  collectWildcardPrefixes,
} from '../../shared/ha/state-change-filter.util';
import {
  type AutomationRule,
  parseAutomationYaml,
} from './yaml-parse.util';
import {
  buildAutomationRuleIndex,
  type AutomationRuleIndex,
} from './rule-index.util';

interface LoadAutomationRulesResult {
  rules: AutomationRule[];
  ruleIndex: AutomationRuleIndex;
  watchedEntityIds: Set<string>;
  wildcardPrefixes: string[];
  hasEventTriggers: boolean;
  parsedCount: number;
  totalFetched: number;
}

const EMPTY_RESULT: LoadAutomationRulesResult = {
  rules: [],
  ruleIndex: buildAutomationRuleIndex([]),
  watchedEntityIds: new Set(),
  wildcardPrefixes: [],
  hasEventTriggers: false,
  parsedCount: 0,
  totalFetched: 0,
};

/** 从 DB 分批加载并解析本地自动化规则（不含 watch 索引副作用） */
export async function loadAutomationRulesFromDb(deps: {
  prisma: PrismaService;
  logger: Logger;
  haSyncEnabled: boolean;
  batchSize?: number;
}): Promise<LoadAutomationRulesResult> {
  const batchSize = deps.batchSize ?? 200;
  const automations: Array<{
    id: string;
    name: string;
    yaml: string;
    haConfigId: string | null;
    runOnHa: boolean;
  }> = [];
  let cursor: string | undefined;

  for (;;) {
    const batch = await deps.prisma.automation.findMany({
      where: { enabled: true },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, name: true, yaml: true, haConfigId: true, runOnHa: true },
    });
    if (!batch.length) break;
    automations.push(...batch);
    if (batch.length < batchSize) break;
    cursor = batch[batch.length - 1].id;
  }

  const rules = automations
    .filter((a) => {
      if (deps.haSyncEnabled && a.runOnHa) {
        if (!a.haConfigId) {
          // runOnHa 但从未同步到 HA：本地兜底执行，避免规则「既不在 HA 也不在本地」而失效
          deps.logger.warn(
            `自动化 [${a.name}] 设为 HA 执行但未同步到 Home Assistant,已由本地引擎兜底执行`,
          );
        } else {
          return false;
        }
      }
      return true;
    })
    .map((a) => parseAutomationYaml(a.id, a.name, a.yaml, (msg) => deps.logger.warn(msg)))
    .filter((r): r is AutomationRule => r !== null);

  const watchedEntityIds = collectWatchedEntityIds(rules);
  const wildcardPrefixes = collectWildcardPrefixes(rules);
  const hasEventTriggers = rules.some((r) =>
    r.triggers.some((t) => t.platform === 'event' || t.platform === 'homeassistant'),
  );

  return {
    rules,
    ruleIndex: buildAutomationRuleIndex(rules),
    watchedEntityIds,
    wildcardPrefixes,
    hasEventTriggers,
    parsedCount: rules.length,
    totalFetched: automations.length,
  };
}

/** 空结果工厂：每次调用都新建空的 Set 与规则索引，避免调用方误改共享的 EMPTY_RESULT */
export function emptyAutomationRulesResult(): LoadAutomationRulesResult {
  return {
    ...EMPTY_RESULT,
    watchedEntityIds: new Set(),
    ruleIndex: buildAutomationRuleIndex([]),
  };
}
