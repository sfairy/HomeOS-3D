/**
 * @file watch-index.services.ts
 * @module shared/ha
 *
 * HA 状态变更预过滤索引服务：
 *  单一泛型 WatchIndexService + 策略参数化，收敛告警规则与自动化两个同构索引。
 *
 *  - AlertRuleWatchIndexService：告警规则的 entity 监听索引（无通配符）
 *  - AutomationWatchIndexService：自动化引擎的 entity→rule 监听索引（含通配符前缀与事件触发器）
 *
 * 两者均作为 NestJS 单例 Provider 暴露（薄子类 + 策略注入），由各自的规则管理服务在规则增删改时调用 updateFromRules 刷新。
 * HaStateChangeRouterService 在 Cold Path 早期调用 shouldProcessEntity 快速跳过无关事件，
 * 避免对每条事件都做完整规则匹配。
 *
 * 关键依赖：
 *  - ./ha-state-change-filter.util：提供 collectWatchedEntityIds / collectWildcardPrefixes /
 *    shouldAutomationProcessEntity 工具函数
 */
import { Injectable } from '@nestjs/common';
import {
  collectWatchedEntityIds,
  collectWildcardPrefixes,
  shouldAutomationProcessEntity,
} from './state-change-filter.util';

/**
 * 索引策略：把规则列表构建为索引状态，并提供实体判定与计数。
 * 通过策略参数化，WatchIndexService 可复用于任意"规则 → entity 预过滤"场景。
 */
interface WatchIndexStrategy<TRule, TState> {
  /** 构造初始空状态（首次 updateFromRules 前的安全默认值） */
  create(): TState;
  /** 从规则列表构建（刷新）索引状态 */
  build(rules: TRule[]): TState;
  /** 判定某实体是否需要处理 */
  shouldProcess(entityId: string, state: TState): boolean;
  /** 返回当前监听的实体数量（运维监控 / 调试） */
  count(state: TState): number;
}

/**
 * 单一泛型 HA 状态变更预过滤索引服务。
 * 索引状态与判定逻辑由策略（WatchIndexStrategy）注入，规则管理服务在规则变更时调用 updateFromRules 刷新索引，
 * HaStateChangeRouterService 在 Cold Path 早期调用 shouldProcessEntity 快速跳过无关事件。
 */
@Injectable()
class WatchIndexService<TRule, TState> {
  private state: TState;

  constructor(private readonly strategy: WatchIndexStrategy<TRule, TState>) {
    this.state = strategy.create();
  }

  /** 从规则列表刷新索引。 */
  updateFromRules(rules: TRule[]): void {
    this.state = this.strategy.build(rules);
  }

  /** 判定是否需要为该 entity 处理规则。 */
  shouldProcessEntity(entityId: string): boolean {
    return this.strategy.shouldProcess(entityId, this.state);
  }

  /** 返回当前监听的实体数量（含全局规则占位计数）。 */
  getWatchedCount(): number {
    return this.strategy.count(this.state);
  }
}

/** 告警规则索引输入：每条规则可能含 entityId 与 enabled 字段 */
type AlertRuleIndexInput = { entityId?: string; enabled?: boolean };
/** 告警规则索引状态：显式监听集合 + 是否存在全局规则 */
type AlertRuleIndexState = { watchedEntityIds: Set<string>; hasGlobalRules: boolean };

/** 告警规则索引策略：禁用规则跳过；空 entityId 视作全局规则（匹配所有实体） */
const alertRuleIndexStrategy: WatchIndexStrategy<
  AlertRuleIndexInput,
  AlertRuleIndexState
> = {
  create: () => ({ watchedEntityIds: new Set<string>(), hasGlobalRules: false }),
  build(rules) {
    const ids = new Set<string>();
    let global = false;
    for (const rule of rules) {
      // 禁用规则不参与索引
      if (rule.enabled === false) continue;
      const eid = rule.entityId?.trim();
      // 无 entityId 视作全局规则，匹配所有实体
      if (!eid) global = true;
      else ids.add(eid);
    }
    return { watchedEntityIds: ids, hasGlobalRules: global };
  },
  // Hot Path 优化：先查全局规则与空集合，最后才查集合
  shouldProcess(entityId, state) {
    if (!state.hasGlobalRules && state.watchedEntityIds.size === 0) return false;
    if (state.hasGlobalRules) return true;
    return state.watchedEntityIds.has(entityId);
  },
  count: (state) => state.watchedEntityIds.size + (state.hasGlobalRules ? 1 : 0),
};

/** 自动化索引输入：每条规则含 triggers 数组 */
type AutomationIndexInput = {
  triggers: Array<{ entity_id?: string | string[]; platform?: string }>;
};
/** 自动化索引状态：显式监听集合 + 通配符前缀数组 + 是否存在 event/homeassistant 触发器 */
type AutomationIndexState = {
  watchedEntityIds: Set<string>;
  wildcardPrefixes: string[];
  hasEventTriggers: boolean;
};

/** 自动化索引策略：委托 collectWatchedEntityIds / collectWildcardPrefixes / shouldAutomationProcessEntity */
const automationIndexStrategy: WatchIndexStrategy<
  AutomationIndexInput,
  AutomationIndexState
> = {
  create: () => ({
    watchedEntityIds: new Set<string>(),
    wildcardPrefixes: [],
    hasEventTriggers: false,
  }),
  build(rules) {
    return {
      watchedEntityIds: collectWatchedEntityIds(rules),
      wildcardPrefixes: collectWildcardPrefixes(rules),
      // event / homeassistant 平台触发器不依赖具体 entity_id，必须接收所有事件
      hasEventTriggers: rules.some((r) =>
        r.triggers.some((t) => t.platform === 'event' || t.platform === 'homeassistant'),
      ),
    };
  },
  shouldProcess(entityId, state) {
    return shouldAutomationProcessEntity(
      entityId,
      state.watchedEntityIds,
      state.hasEventTriggers,
      state.wildcardPrefixes,
    );
  },
  count: (state) => state.watchedEntityIds.size,
};

/**
 * 告警规则 entity 预过滤索引（供 HaStateChangeRouterService 在 Cold Path 早期跳过无关事件）。
 * 在 DI 容器中作为单例 Provider 暴露；策略见 alertRuleIndexStrategy。
 */
@Injectable()
export class AlertRuleWatchIndexService extends WatchIndexService<
  AlertRuleIndexInput,
  AlertRuleIndexState
> {
  constructor() {
    super(alertRuleIndexStrategy);
  }
}

/**
 * 自动化引擎 entity→rule 预过滤索引（供 HaStateChangeRouterService 在 Cold Path 早期跳过无关事件）。
 * 在 DI 容器中作为单例 Provider 暴露；策略见 automationIndexStrategy。
 */
@Injectable()
export class AutomationWatchIndexService extends WatchIndexService<
  AutomationIndexInput,
  AutomationIndexState
> {
  constructor() {
    super(automationIndexStrategy);
  }
}
