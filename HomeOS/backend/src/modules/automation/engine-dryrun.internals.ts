/**
 * 自动化试运行（dry-run）静态评估内部实现。
 *
 * 所属模块：backend/modules/automation
 * 职责：不执行任何动作，仅按「当前实体状态 / 当前时刻」评估：
 *  - 各触发器是否「此刻就绪」（state / numeric_state / zone / calendar / device /
 *    time / time_pattern / cron / sun / template 可静态评估；event / homeassistant /
 *    webhook / interval 等事件型触发器标注为需等待外部驱动）
 *  - 各条件是否满足（复用 checkAutomationSingleCondition 逐条求值）
 *  - 动作清单预览（仅描述，不执行）
 * 关键依赖：AutomationConditionDeps（用于条件求值），AutomationDryRunDeps（由引擎注入）。
 */
import type { AutomationRule, ParsedTrigger, ParsedCondition, ParsedAction } from './yaml-parse.util';
import type { AutomationConditionDeps } from './engine-conditions.internals';
import { checkAutomationSingleCondition } from './engine-conditions.internals';
import { isTimePatternTriggerNow, matchCronExpression } from './engine-triggers.internals';
import { normalizeAutomationTimeStr } from '@homeos/shared';

/**
 * AutomationDryRunDeps：业务接口定义。
 * - 表示：modules/automation/engine-dryrun.internals.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface AutomationDryRunDeps {
  entityStateOf: (entityId: string) => string | undefined;
  entityAttrOf?: (entityId: string, attr: string) => string | undefined;
  conditionDeps: AutomationConditionDeps;
  /** template 触发器求值（本地优先，HA 兜底） */
  resolveTemplate: (tpl: string) => Promise<boolean>;
  isSunTriggerNow: (trigger: ParsedTrigger, windowMs: number) => boolean;
  ruleId: string;
}

interface DryRunTriggerReport {
  platform: string;
  /** 人类可读描述，如 "light.living 变为 on" */
  label: string;
  /** 是否可静态评估（false=事件型，需等待外部驱动） */
  static: boolean;
  /** 此刻是否就绪（可静态评估时的判定结果；事件型恒为 false） */
  ready: boolean;
  /** 当前实体取值 / 时刻 / 说明 */
  detail: string;
}

interface DryRunConditionReport {
  condition: string;
  ok: boolean;
  detail: string;
  children?: DryRunConditionReport[];
}

interface DryRunActionReport {
  type: string;
  label: string;
}

interface AutomationDryRunResult {
  /** 是否存在至少一个「此刻就绪」的可静态评估触发器 */
  triggerReady: boolean;
  /** 存在无法静态评估（事件型）的触发器 */
  hasAsyncTriggers: boolean;
  /** 条件是否全部满足 */
  conditionsPass: boolean;
  /** 是否「按当前状态即会执行」（就绪触发 AND 条件通过；事件型触发器不阻塞此结论） */
  wouldFire: boolean;
  triggers: DryRunTriggerReport[];
  conditions: DryRunConditionReport[];
  actions: DryRunActionReport[];
  warnings: string[];
}

function readEntityValue(
  deps: AutomationDryRunDeps,
  entityId: string,
  attribute?: string,
): string | undefined {
  const attr = attribute ? String(attribute) : '';
  if (attr && deps.entityAttrOf) return deps.entityAttrOf(entityId, attr);
  return deps.entityStateOf(entityId);
}

function entityLabel(entityId?: string | string[]): string {
  if (!entityId) return '';
  return Array.isArray(entityId) ? entityId.join('、') : entityId;
}

function timeNow(): { hhmmss: string; hhmm: string; date: Date } {
  const d = new Date();
  const hhmmss = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { hhmmss, hhmm, date: d };
}

function inNumericRange(val: number, above?: number, below?: number): boolean {
  if (above != null && val <= above) return false;
  if (below != null && val >= below) return false;
  return true;
}

/** 单条触发器静态评估 */
async function evaluateDryRunTrigger(
  trigger: ParsedTrigger,
  deps: AutomationDryRunDeps,
): Promise<DryRunTriggerReport> {
  const { platform } = trigger;
  const now = timeNow();

  switch (platform) {
    case 'state': {
      const ids = Array.isArray(trigger.entity_id)
        ? trigger.entity_id
        : trigger.entity_id
          ? [trigger.entity_id]
          : [];
      const label = `实体 ${entityLabel(trigger.entity_id)}${trigger.attribute ? `.${trigger.attribute}` : ''} 变为 ${trigger.to || '任意'}${trigger.from ? `（从 ${trigger.from}）` : ''}`;
      if (!ids.length) {
        return { platform, label, static: false, ready: false, detail: '未配置实体，无法静态评估' };
      }
      const current = ids.map((id) => ({ id, value: readEntityValue(deps, id, trigger.attribute) }));
      const matched = current.find((c) => c.value !== undefined);
      const currentValue = matched?.value;
      const targetOk =
        currentValue !== undefined &&
        (!trigger.to || trigger.to === 'any' || currentValue === trigger.to);
      const detail = current.map((c) => `${c.id} = ${c.value ?? '∅'}`).join('，');
      return {
        platform,
        label,
        static: true,
        ready: Boolean(targetOk),
        detail: trigger.for && trigger.for > 0
          ? `${detail}；需持续 ${trigger.for}s`
          : `${detail}${trigger.from ? '；还需发生一次「从旧值→目标值」的变化' : ''}`,
      };
    }
    case 'device': {
      const label = `设备 ${entityLabel(trigger.entity_id)} 事件 ${trigger.device_type || 'state_changed'}`;
      const ids = Array.isArray(trigger.entity_id)
        ? trigger.entity_id
        : trigger.entity_id
          ? [trigger.entity_id]
          : [];
      const current = ids.map((id) => ({ id, value: deps.entityStateOf(id) }));
      const currentValue = current.find((c) => c.value !== undefined)?.value;
      const type = (trigger.device_type || 'changed').toLowerCase();
      let ready = false;
      if (currentValue !== undefined) {
        if (type === 'turned_on') ready = currentValue === 'on';
        else if (type === 'turned_off') ready = currentValue === 'off';
        else ready = true;
      }
      return {
        platform,
        label,
        static: true,
        ready,
        detail: current.map((c) => `${c.id} = ${c.value ?? '∅'}`).join('，'),
      };
    }
    case 'numeric_state': {
      const label = `数值 ${entityLabel(trigger.entity_id)}${trigger.attribute ? `.${trigger.attribute}` : ''} ${trigger.above != null ? `> ${trigger.above}` : ''}${trigger.below != null ? ` < ${trigger.below}` : ''}`;
      const ids = Array.isArray(trigger.entity_id)
        ? trigger.entity_id
        : trigger.entity_id
          ? [trigger.entity_id]
          : [];
      const current = ids.map((id) => ({
        id,
        value: readEntityValue(deps, id, trigger.attribute),
      }));
      const matched = current.find((c) => {
        const v = parseFloat(c.value || '');
        return Number.isFinite(v);
      });
      const val = matched ? parseFloat(matched.value as string) : NaN;
      const ready = Number.isFinite(val) && inNumericRange(val, trigger.above, trigger.below);
      return {
        platform,
        label,
        static: true,
        ready,
        detail: current
          .map((c) => {
            const v = parseFloat(c.value || '');
            return `${c.id} = ${c.value ?? '∅'}${Number.isFinite(v) ? `（范围内：${inNumericRange(v, trigger.above, trigger.below)}）` : ''}`;
          })
          .join('，'),
      };
    }
    case 'zone': {
      const zoneName = (trigger.zone || '').replace(/^zone\./, '');
      const event = (trigger.event || trigger.event_type || 'enter').toLowerCase();
      const label = `区域 ${entityLabel(trigger.entity_id)} ${event === 'leave' ? '离开' : '进入'} ${zoneName}`;
      const ids = Array.isArray(trigger.entity_id)
        ? trigger.entity_id
        : trigger.entity_id
          ? [trigger.entity_id]
          : [];
      const current = ids.map((id) => ({ id, value: deps.entityStateOf(id) }));
      const currentValue = current.find((c) => c.value !== undefined)?.value;
      const ready =
        currentValue !== undefined &&
        (event === 'leave' ? currentValue !== zoneName : currentValue === zoneName);
      return {
        platform,
        label,
        static: true,
        ready,
        detail: `${current.map((c) => `${c.id} = ${c.value ?? '∅'}`).join('，')}${event === 'leave' ? '（需发生离开动作）' : ''}`,
      };
    }
    case 'calendar': {
      const calEvent = (trigger.event || trigger.event_type || 'start').toLowerCase();
      const label = `日历 ${entityLabel(trigger.entity_id)} ${calEvent === 'end' ? '结束' : '开始'}`;
      const ids = Array.isArray(trigger.entity_id)
        ? trigger.entity_id
        : trigger.entity_id
          ? [trigger.entity_id]
          : [];
      const current = ids.map((id) => ({ id, value: deps.entityStateOf(id) }));
      const currentValue = current.find((c) => c.value !== undefined)?.value;
      const ready =
        currentValue !== undefined &&
        (calEvent === 'end' ? currentValue === 'off' : currentValue === 'on');
      return {
        platform,
        label,
        static: true,
        ready,
        detail: current.map((c) => `${c.id} = ${c.value ?? '∅'}`).join('，'),
      };
    }
    case 'time':
    case 'time_changed': {
      const at = normalizeAutomationTimeStr(trigger.at || '');
      const label = `定时 ${at || '—'}`;
      const ready = Boolean(at) && at === now.hhmmss;
      const dayOk = !trigger.days?.length || trigger.days.includes(now.date.getDay());
      return {
        platform,
        label,
        static: true,
        ready: ready && dayOk,
        detail: `当前 ${now.hhmmss}；目标 ${at || '未设置'}${trigger.days?.length ? `（星期 ${trigger.days.join('/')}）` : ''}`,
      };
    }
    case 'time_pattern': {
      const label = `时间模式 ${now.hhmm}（${trigger.pattern ? `${trigger.pattern.hours ?? '*'}时 ${trigger.pattern.minutes ?? '*'}分` : '—'}）`;
      const ready = Boolean(trigger.pattern) && isTimePatternTriggerNow(trigger, now.date);
      return {
        platform,
        label,
        static: true,
        ready,
        detail: `当前 ${now.hhmmss}`,
      };
    }
    case 'cron': {
      const label = `Cron ${trigger.cron || '—'}`;
      const ready = Boolean(trigger.cron) && matchCronExpression(trigger.cron || '', now.date);
      return {
        platform,
        label,
        static: true,
        ready,
        detail: `当前 ${now.hhmmss}（${now.date.toDateString()}）`,
      };
    }
    case 'sun': {
      const event = (trigger.event || trigger.event_type || '').toLowerCase();
      const label = `日出日落 ${event === 'sunset' ? '日落' : '日出'}`;
      const ready = deps.isSunTriggerNow(trigger, 90_000);
      return {
        platform,
        label,
        static: true,
        ready,
        detail: `窗口 ±${trigger.offset ? `${trigger.offset}s` : '默认 90s'}`,
      };
    }
    case 'template': {
      const label = `模板 ${(trigger.value_template || '').slice(0, 60)}`;
      let ready = false;
      if (trigger.value_template) {
        try {
          ready = await deps.resolveTemplate(trigger.value_template);
        } catch {
          ready = false;
        }
      }
      return {
        platform,
        label,
        static: true,
        ready,
        detail: '需模板求值（本地优先，HA 兜底）',
      };
    }
    case 'event':
    case 'homeassistant': {
      const eventName = trigger.event_type || trigger.event || '';
      return {
        platform,
        label: `事件 ${eventName}`,
        static: false,
        ready: false,
        detail: `等待事件 ${eventName} 发生，无法按当前状态评估`,
      };
    }
    case 'webhook': {
      return {
        platform,
        label: `Webhook ${trigger.webhook_id || '—'}`,
        static: false,
        ready: false,
        detail: `等待 webhook ${trigger.webhook_id || ''} 调用`,
      };
    }
    case 'interval': {
      const label = `周期间隔 ${trigger.interval || ''}`;
      return {
        platform,
        label,
        static: false,
        ready: true,
        detail: `每 ${trigger.interval || '—'} 周期触发，会周期性就绪`,
      };
    }
    default:
      return {
        platform,
        label: platform,
        static: false,
        ready: false,
        detail: '未知触发器类型',
      };
  }
}

function readCurrentValueText(
  deps: AutomationDryRunDeps,
  cond: ParsedCondition,
): string {
  const ids = Array.isArray(cond.entity_id)
    ? cond.entity_id
    : cond.entity_id
      ? [cond.entity_id]
      : [];
  const attr = cond.attribute;
  const values = ids
    .map((id) => {
      const v =
        attr && deps.entityAttrOf
          ? String(deps.entityAttrOf(id, attr) ?? '∅')
          : deps.entityStateOf(id) ?? '∅';
      return `${id} = ${v}`;
    })
    .join('，');
  return values || '（无实体）';
}

/** 单条条件递归评估（含 and/or/not 分组） */
async function evaluateDryRunCondition(
  cond: ParsedCondition,
  deps: AutomationDryRunDeps,
  currentRuleId?: string,
): Promise<DryRunConditionReport> {
  const base: DryRunConditionReport = {
    condition: cond.condition,
    ok: false,
    detail: '',
  };
  switch (cond.condition) {
    case 'and': {
      const children: DryRunConditionReport[] = [];
      for (const sub of cond.conditions || []) {
        children.push(await evaluateDryRunCondition(sub, deps, currentRuleId));
      }
      base.children = children;
      base.ok = children.every((c) => c.ok);
      base.detail = `全部满足（${children.filter((c) => c.ok).length}/${children.length}）`;
      return base;
    }
    case 'or': {
      const children: DryRunConditionReport[] = [];
      for (const sub of cond.conditions || []) {
        children.push(await evaluateDryRunCondition(sub, deps, currentRuleId));
      }
      base.children = children;
      base.ok = children.some((c) => c.ok);
      base.detail = `任一满足（${children.filter((c) => c.ok).length}/${children.length}）`;
      return base;
    }
    case 'not': {
      const children: DryRunConditionReport[] = [];
      for (const sub of cond.conditions || []) {
        children.push(await evaluateDryRunCondition(sub, deps, currentRuleId));
      }
      base.children = children;
      base.ok = !children.some((c) => c.ok);
      base.detail = '取反';
      return base;
    }
    case 'state':
      base.ok = await checkAutomationSingleCondition(cond, deps.conditionDeps, currentRuleId);
      base.detail = `${readCurrentValueText(deps, cond)}；要求 = ${cond.state ?? '任意'}${cond.for && cond.for > 0 ? `，持续 ${cond.for}s` : ''}`;
      return base;
    case 'numeric_state':
      base.ok = await checkAutomationSingleCondition(cond, deps.conditionDeps, currentRuleId);
      base.detail = `${readCurrentValueText(deps, cond)}；范围 > ${cond.above ?? '−∞'} < ${cond.below ?? '＋∞'}`;
      return base;
    case 'zone':
      base.ok = await checkAutomationSingleCondition(cond, deps.conditionDeps, currentRuleId);
      base.detail = `${readCurrentValueText(deps, cond)}；目标区域 ${cond.zone || ''}`;
      return base;
    case 'template':
      base.ok = await checkAutomationSingleCondition(cond, deps.conditionDeps, currentRuleId);
      base.detail = (cond.value_template || '').slice(0, 80);
      return base;
    case 'time':
      base.ok = await checkAutomationSingleCondition(cond, deps.conditionDeps, currentRuleId);
      base.detail = `窗口 ${cond.after || '00:00:00'} ~ ${cond.before || '23:59:59'}（当前 ${new Date().toTimeString().slice(0, 8)}）`;
      return base;
    case 'sun':
      base.ok = await checkAutomationSingleCondition(cond, deps.conditionDeps, currentRuleId);
      base.detail = `${cond.after || ''}${cond.before ? ` ~ ${cond.before}` : ''}`;
      return base;
    case 'homeos_variable':
      base.ok = await checkAutomationSingleCondition(cond, deps.conditionDeps, currentRuleId);
      base.detail = `变量 ${cond.key || ''} ${cond.operator || '=='} ${cond.value ?? cond.state ?? ''}`;
      return base;
    case 'weather':
      base.ok = await checkAutomationSingleCondition(cond, deps.conditionDeps, currentRuleId);
      base.detail = `${readCurrentValueText(deps, cond)}；要求天气 ${cond.state ?? '任意'}${cond.attribute ? `，${cond.attribute} > ${cond.above ?? '−∞'} < ${cond.below ?? '＋∞'}` : ''}`;
      return base;
    default:
      base.ok = await checkAutomationSingleCondition(cond, deps.conditionDeps, currentRuleId);
      base.detail = `条件 ${cond.condition}`;
      return base;
  }
}

/** 动作树 → 人类可读清单（仅描述，不执行） */
function summarizeDryRunActions(actions: ParsedAction[]): DryRunActionReport[] {
  const out: DryRunActionReport[] = [];
  for (const a of actions) {
    switch (a.type) {
      case 'call_service':
        out.push({
          type: a.type,
          label: `调用服务 ${a.service || '—'}${a.entity_id ? ` @ ${a.entity_id}` : ''}`,
        });
        break;
      case 'delay':
        out.push({ type: a.type, label: `延迟 ${a.delay ?? 0}s` });
        break;
      case 'wait_for_trigger':
        out.push({
          type: a.type,
          label: `等待触发${a.continueOnTimeout ? '（超时继续）' : ''}`,
        });
        break;
      case 'wait_template':
        out.push({ type: a.type, label: `等待模板（${(a.value_template || '').slice(0, 40)}）` });
        break;
      case 'fire_event':
        out.push({
          type: a.type,
          label: `触发事件 ${a.event || '—'}${a.event_data ? `（${Object.keys(a.event_data).join('/')}）` : ''}`,
        });
        break;
      case 'choose': {
        const branches = Array.isArray(a.choose) ? a.choose : [];
        out.push({
          type: a.type,
          label: `选择分支（${branches.length} 个）`,
        });
        for (const b of branches) {
          out.push(...summarizeDryRunActions(b.actions || []).map((x) => ({ ...x })));
        }
        if (Array.isArray(a.defaultActions) && a.defaultActions.length) {
          out.push({ type: 'choose.default', label: '默认分支：' });
          out.push(...summarizeDryRunActions(a.defaultActions));
        }
        break;
      }
      case 'repeat': {
        const rep = a.repeat;
        const how = rep?.count
          ? `重复 ${rep.count} 次`
          : rep?.while
            ? '条件循环'
            : rep?.until
              ? '直到条件循环'
              : '重复';
        out.push({ type: a.type, label: how });
        out.push(...summarizeDryRunActions(rep?.actions || []).map((x) => ({ ...x })));
        break;
      }
      case 'parallel': {
        out.push({ type: a.type, label: '并行执行' });
        out.push(...summarizeDryRunActions(a.sequence || []));
        break;
      }
      case 'sequence': {
        out.push(...summarizeDryRunActions(a.sequence || []));
        break;
      }
      case 'stop':
        out.push({
          type: a.type,
          label: `停止${a.stopError ? '（作为错误）' : ''}${a.stopMessage ? `：${a.stopMessage}` : ''}`,
        });
        break;
      default:
        out.push({ type: a.type, label: a.type });
        break;
    }
  }
  return out;
}

/** 试运行评估入口 */
export async function dryRunAutomation(
  rule: AutomationRule,
  deps: AutomationDryRunDeps,
): Promise<AutomationDryRunResult> {
  const warnings: string[] = [];

  const triggers: DryRunTriggerReport[] = [];
  for (const t of rule.triggers) {
    triggers.push(await evaluateDryRunTrigger(t, deps));
  }
  const hasAsyncTriggers = triggers.some((t) => !t.static);
  const triggerReady = triggers.some((t) => t.static && t.ready);
  if (hasAsyncTriggers) {
    warnings.push('存在事件/周期型触发器，其就绪与否需等待外部驱动，评估仅供参考');
  }
  if (!rule.triggers.length) {
    warnings.push('未配置触发器，该规则不会自动运行（仅可手动触发）');
  }

  const conditions: DryRunConditionReport[] = [];
  for (const c of rule.conditions) {
    conditions.push(await evaluateDryRunCondition(c, deps, rule.id));
  }
  const conditionsPass = conditions.every((c) => c.ok);

  const actions = summarizeDryRunActions(rule.actions);
  if (!rule.actions.length) warnings.push('未配置动作，触发后不会有任何操作');

  const wouldFire = triggerReady && conditionsPass;

  return {
    triggerReady,
    hasAsyncTriggers,
    conditionsPass,
    wouldFire,
    triggers,
    conditions,
    actions,
    warnings,
  };
}
