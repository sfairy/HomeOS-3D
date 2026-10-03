/**
 * 自动化规则索引工具。
 *
 * 所属模块：backend/modules/automation
 * 职责：把规则按 entity_id / time / sun 等触发器建立倒排索引，
 *  运行时收到 HA 状态变化或定时事件时按索引快速定位候选规则，
 *  避免每条规则逐条全量匹配（O(N) → O(1) 命中候选集）。
 *  索引内容：实体触发器（state / numeric_state / zone / calendar / device）、
 *  时间触发器（time / time_pattern / cron）、日出日落触发器、事件触发器开关。
 */
import type { AutomationRule } from './yaml-parse.util';
import { normalizeAutomationTimeStr } from './engine-conditions.internals';

const ENTITY_TRIGGER_PLATFORMS = new Set(['state', 'numeric_state', 'zone', 'calendar', 'device']);
const TIME_TRIGGER_PLATFORMS = new Set(['time', 'time_pattern', 'time_changed']);
const PATTERN_TRIGGER_PLATFORMS = new Set(['time_pattern', 'cron', 'template']);

function addToSetMap<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

function indexEntityPatterns(
  rule: AutomationRule,
  entityRef: string | string[] | undefined,
  exactMap: Map<string, Set<AutomationRule>>,
  wildcardMap: Map<string, Set<AutomationRule>>,
  openRules: Set<AutomationRule>,
) {
  if (!entityRef) {
    openRules.add(rule);
    return;
  }
  const patterns = Array.isArray(entityRef) ? entityRef : [entityRef];
  for (const p of patterns) {
    if (typeof p !== 'string' || !p) continue;
    if (p.endsWith('*')) {
      const prefix = p.replace(/\*+$/, '');
      addToSetMap(wildcardMap, prefix, rule);
    } else {
      addToSetMap(exactMap, p, rule);
    }
  }
}

/**
 * AutomationRuleIndex：业务接口定义。
 * - 表示：modules/automation/rule-index.util.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface AutomationRuleIndex {
  getRulesForEntity(entityId: string): AutomationRule[];
  getOpenRules(): AutomationRule[];
  getTimeRulesAt(timeStr: string): AutomationRule[];
  getSunRules(): AutomationRule[];
  /** time_pattern / cron / template 周期扫描规则 */
  getPatternRules(): AutomationRule[];
  /** webhook 触发器规则（含 webhook_id） */
  getWebhookRules(): AutomationRule[];
}

/** 按实体/时间/日出日落/周期/webhook 触发器建立规则倒排索引，供运行时快速定位候选规则 */
export function buildAutomationRuleIndex(rules: AutomationRule[]): AutomationRuleIndex {
  const exactMap = new Map<string, Set<AutomationRule>>();
  const wildcardMap = new Map<string, Set<AutomationRule>>();
  const openRules = new Set<AutomationRule>();
  const timeByAt = new Map<string, Set<AutomationRule>>();
  const sunRules = new Set<AutomationRule>();
  const patternRules = new Set<AutomationRule>();
  const webhookRules = new Map<string, Set<AutomationRule>>();

  for (const rule of rules) {
    for (const trigger of rule.triggers) {
      if (TIME_TRIGGER_PLATFORMS.has(trigger.platform) && trigger.at) {
        addToSetMap(timeByAt, normalizeAutomationTimeStr(trigger.at), rule);
      } else if (trigger.platform === 'sun') {
        sunRules.add(rule);
      } else if (PATTERN_TRIGGER_PLATFORMS.has(trigger.platform)) {
        patternRules.add(rule);
      } else if (trigger.platform === 'webhook' && trigger.webhook_id) {
        addToSetMap(webhookRules, trigger.webhook_id, rule);
      } else if (ENTITY_TRIGGER_PLATFORMS.has(trigger.platform)) {
        indexEntityPatterns(rule, trigger.entity_id, exactMap, wildcardMap, openRules);
      }
    }
  }

  return {
    getRulesForEntity(entityId: string): AutomationRule[] {
      const result = new Set<AutomationRule>();
      const exact = exactMap.get(entityId);
      if (exact) {
        for (const rule of exact) result.add(rule);
      }
      for (const [prefix, wildcardRules] of wildcardMap) {
        if (entityId.startsWith(prefix)) {
          for (const rule of wildcardRules) result.add(rule);
        }
      }
      return [...result];
    },
    getOpenRules(): AutomationRule[] {
      return [...openRules];
    },
    getTimeRulesAt(timeStr: string): AutomationRule[] {
      const set = timeByAt.get(timeStr);
      return set ? [...set] : [];
    },
    getSunRules(): AutomationRule[] {
      return [...sunRules];
    },
    getPatternRules(): AutomationRule[] {
      return [...patternRules];
    },
    getWebhookRules(): AutomationRule[] {
      const result = new Set<AutomationRule>();
      for (const set of webhookRules.values()) {
        for (const rule of set) result.add(rule);
      }
      return [...result];
    },
  };
}
