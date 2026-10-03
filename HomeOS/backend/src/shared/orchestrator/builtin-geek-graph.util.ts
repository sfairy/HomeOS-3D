/**
 * 所属模块：backend/shared/orchestrator
 * 职责：
 *  - 内置场景/自动化依赖图常量；
 * 关键依赖：
 *  - snapshot-restore.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import {
  fingerprintAutomationYaml,
  fingerprintSceneYaml,
  fingerprintScriptYaml,
  loadHaYaml,
  parseHaDuration,
} from '@homeos/shared';

/** 内置图 delay/for：解析失败时回退 1 秒，避免空 delay 节点 */
function parseHaDelayToSeconds(raw: unknown): number {
  return parseHaDuration(raw) ?? 1;
}

function parseForSeconds(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const sec = parseHaDelayToSeconds(raw);
  return sec > 0 ? String(sec) : '';
}

function entityIdOf(action: Record<string, unknown>): string {
  const direct = action.entity_id;
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct) && direct[0] != null) return String(direct[0]);
  const target = action.target;
  if (target && typeof target === 'object') {
    const tid = (target as { entity_id?: unknown }).entity_id;
    if (typeof tid === 'string') return tid;
    if (Array.isArray(tid) && tid[0] != null) return String(tid[0]);
  }
  return '';
}

function asList(raw: unknown): unknown[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function mapHaSequenceAction(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (a.delay != null) {
    return { type: 'delay', seconds: parseHaDelayToSeconds(a.delay) };
  }
  if (a.device_id != null && String(a.device_id).trim()) {
    const deviceId = String(a.device_id).trim();
    const domain = a.domain != null ? String(a.domain) : '';
    const service = a.type != null ? String(a.type) : '';
    return {
      type: 'deviceAction',
      domain,
      service,
      entityId: entityIdOf(a),
      data: JSON.stringify({
        device_id: deviceId,
        ...(domain ? { domain } : {}),
        ...(service ? { type: service } : {}),
      }),
    };
  }
  if (typeof a.event === 'string' && a.event.trim()) {
    const eventName = a.event.trim();
    const eventData =
      a.event_data && typeof a.event_data === 'object'
        ? (a.event_data as Record<string, unknown>)
        : null;
    if (eventName === 'notification.homeos.send') {
      return {
        type: 'notify_homeos',
        notifyMsg: eventData?.message != null ? String(eventData.message) : '',
      };
    }
    if (eventName === 'homeos.geek_debug') {
      return {
        type: 'debug',
        notifyMsg: eventData?.message != null ? String(eventData.message) : '调试点',
      };
    }
    return {
      type: 'fire_event',
      eventType: eventName,
      eventData: eventData ? JSON.stringify(eventData) : '',
    };
  }
  if (typeof a.service === 'string' && a.service.includes('.')) {
    const [domain, service] = a.service.split('.');
    const data = a.data ?? a.service_data;
    const dataObj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    // notify.homeos → HomeOS 通知动作
    if (domain === 'notify' && (service === 'homeos' || service === 'push')) {
      return {
        type: service === 'homeos' ? 'notify_homeos' : 'notify',
        notifyMsg: dataObj?.message != null ? String(dataObj.message) : '',
        message: service === 'homeos' ? '' : `notify.${service}`,
        notifySvc: service === 'homeos' ? '' : `notify.${service}`,
      };
    }
    if (domain === 'homeos' && service === 'variable_set') {
      return {
        type: 'variable_set',
        varKey: dataObj?.key != null ? String(dataObj.key) : '',
        varScope: dataObj?.scope != null ? String(dataObj.scope) : 'global',
        varOp: dataObj?.op != null ? String(dataObj.op) : 'set',
        varType: dataObj?.type != null ? String(dataObj.type) : 'string',
        varValue: dataObj?.value != null ? String(dataObj.value) : '',
        varSourceEntityId:
          dataObj?.source_entity_id != null ? String(dataObj.source_entity_id) : '',
      };
    }
    if (domain === 'automation' && service === 'trigger') {
      return {
        type: 'trigger_automation',
        entityId: entityIdOf(a),
        domain: 'automation',
        service: 'trigger',
      };
    }
    return {
      type: 'callService',
      domain: domain || '',
      service: service || '',
      entityId: entityIdOf(a),
      data: dataObj ? JSON.stringify(dataObj) : '',
      seconds: 1,
      message: '',
      notifyMsg: '',
    };
  }
  return null;
}

function emptyTriggerFields(): Record<string, unknown> {
  return {
    entityId: '',
    stateFrom: '',
    stateTo: 'on',
    forSeconds: '',
    at: '',
    sunEvent: '',
    sunOffset: 0,
    numOp: '',
    numValue: '',
    numBelow: '',
    haEvent: '',
    eventType: '',
    eventDataKey: '',
    eventDataVal: '',
    zoneId: '',
    zoneEvent: '',
    calendarEvent: '',
    intervalSeconds: 60,
    attribute: '',
    entityIds: [],
    sequenceSteps: [],
    sequenceTimeout: 60,
  };
}

function mapHaTrigger(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const platform = String(t.platform || t.trigger || '').toLowerCase();
  const base = emptyTriggerFields();
  if (platform === 'time') {
    return { ...base, type: 'time', at: t.at != null ? String(t.at) : '08:00:00' };
  }
  if (platform === 'state') {
    return {
      ...base,
      type: 'state',
      entityId: entityIdOf(t),
      stateFrom: t.from != null ? String(t.from) : '',
      stateTo: t.to != null ? String(t.to) : 'any',
      forSeconds: parseForSeconds(t.for),
      attribute: t.attribute != null ? String(t.attribute) : '',
    };
  }
  if (platform === 'numeric_state') {
    const above = t.above;
    const below = t.below;
    let numOp = 'above';
    let numValue = '';
    let numBelow = '';
    if (above != null && below != null) {
      numOp = 'between';
      numValue = String(above);
      numBelow = String(below);
    } else if (below != null) {
      numOp = 'below';
      numValue = String(below);
    } else if (above != null) {
      numOp = 'above';
      numValue = String(above);
    }
    return {
      ...base,
      type: 'numeric',
      entityId: entityIdOf(t),
      numOp,
      numValue,
      numBelow,
      forSeconds: parseForSeconds(t.for),
    };
  }
  if (platform === 'event') {
    const eventData =
      t.event_data && typeof t.event_data === 'object'
        ? (t.event_data as Record<string, unknown>)
        : null;
    const keys = eventData ? Object.keys(eventData) : [];
    return {
      ...base,
      type: 'event',
      eventType: t.event_type != null ? String(t.event_type) : '',
      eventDataKey: keys[0] || '',
      eventDataVal:
        eventData && keys[0] != null ? String(eventData[keys[0]] ?? '') : '',
    };
  }
  if (platform === 'sun') {
    return {
      ...base,
      type: 'sun',
      sunEvent: t.event != null ? String(t.event) : 'sunset',
      sunOffset: t.offset != null ? parseHaDelayToSeconds(t.offset) : 0,
    };
  }
  if (platform === 'zone') {
    return {
      ...base,
      type: 'zone',
      entityId: entityIdOf(t),
      zoneId: t.zone != null ? String(t.zone) : 'zone.home',
      zoneEvent: t.event != null ? String(t.event) : 'enter',
    };
  }
  if (platform === 'homeassistant') {
    return {
      ...base,
      type: 'homeassistant',
      haEvent: t.event != null ? String(t.event) : 'start',
    };
  }
  if (platform === 'time_pattern' || platform === 'interval') {
    const seconds =
      typeof t.seconds === 'number'
        ? t.seconds
        : typeof t.minutes === 'number'
          ? t.minutes * 60
          : 60;
    return { ...base, type: 'interval', intervalSeconds: Number(seconds) || 60 };
  }
  return null;
}

function mapHaCondition(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const kind = String(c.condition || '').toLowerCase();
  if (kind === 'state') {
    return {
      operator: 'eq',
      entityId: entityIdOf(c),
      state: c.state != null ? String(c.state) : 'on',
      forSeconds: parseForSeconds(c.for),
      attribute: c.attribute != null ? String(c.attribute) : '',
    };
  }
  if (kind === 'numeric_state') {
    if (c.above != null && c.below == null) {
      return { operator: 'gt', entityId: entityIdOf(c), state: String(c.above) };
    }
    if (c.below != null && c.above == null) {
      return { operator: 'lt', entityId: entityIdOf(c), state: String(c.below) };
    }
    if (c.above != null && c.below != null) {
      return {
        operator: 'between',
        entityId: entityIdOf(c),
        state: String(c.above),
        stateTo: String(c.below),
      };
    }
  }
  if (kind === 'sun') {
    if (c.after != null) {
      return {
        operator: 'sun_after',
        entityId: '',
        state: String(c.after),
        forSeconds: c.after_offset != null ? String(c.after_offset) : '',
      };
    }
    if (c.before != null) {
      return {
        operator: 'sun_before',
        entityId: '',
        state: String(c.before),
        forSeconds: c.before_offset != null ? String(c.before_offset) : '',
      };
    }
  }
  if (kind === 'time') {
    const daysRaw = c.weekday ?? c.days;
    if (Array.isArray(daysRaw) && daysRaw.length) {
      return {
        operator: 'weekday',
        entityId: '',
        state: '',
        days: daysRaw.map((d) => String(d)),
      };
    }
    if (c.after != null || c.before != null) {
      return {
        operator: 'time_after',
        entityId: '',
        state: c.after != null ? String(c.after) : '',
        stateTo: c.before != null ? String(c.before) : '',
      };
    }
  }
  if (kind === 'homeos_variable') {
    const opRaw = String(c.operator || 'eq').trim();
    const opMap: Record<string, string> = {
      '<': 'var_lt',
      '>': 'var_gt',
      '<=': 'var_lte',
      '>=': 'var_gte',
      '==': 'var_eq',
      '=': 'var_eq',
      '!=': 'var_neq',
      eq: 'var_eq',
      neq: 'var_neq',
      lt: 'var_lt',
      gt: 'var_gt',
      lte: 'var_lte',
      gte: 'var_gte',
    };
    return {
      operator: opMap[opRaw] || (opRaw.startsWith('var_') ? opRaw : `var_${opRaw}`),
      entityId: '',
      state: c.value != null ? String(c.value) : '',
      varKey: c.key != null ? String(c.key) : '',
      varScope: c.scope != null ? String(c.scope) : 'global',
    };
  }
  return null;
}

/** 从脚本 YAML sequence 构建图（覆盖内置模板常用动作） */
export function buildScriptGeekGraphFromYaml(
  name: string,
  yaml: string,
): Record<string, unknown> | null {
  try {
    const parsed = loadHaYaml(yaml) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const sequence = parsed.sequence ?? parsed.actions;
    const list = Array.isArray(sequence) ? sequence : sequence ? [sequence] : [];
    const actions = list
      .map(mapHaSequenceAction)
      .filter((x): x is Record<string, unknown> => Boolean(x));
    if (!actions.length) return null;
    return {
      version: 2,
      name: String(parsed.alias || name || ''),
      mode: String(parsed.mode || 'single'),
      triggerLogic: 'or',
      triggerAndTimeout: 60,
      condRootLogic: 'and',
      triggerGroups: [],
      conditionGroups: [],
      triggers: [],
      conditions: [],
      actions,
      yamlDigest: fingerprintScriptYaml(yaml),
    };
  } catch {
    return null;
  }
}

/**
 * 从自动化 YAML 构建图（经典内置模板安装兜底）。
 * 覆盖 state/time/event/sun/zone/numeric 触发与常见条件/动作。
 */
export function buildAutomationGeekGraphFromYaml(
  name: string,
  yaml: string,
): Record<string, unknown> | null {
  try {
    const parsed = loadHaYaml(yaml) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;

    const metaMatch = String(yaml || '').match(/#\s*homeos_meta:\s*(\{[^}]+\})/);
    let triggerLogic = 'or';
    let triggerAndTimeout = 60;
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1]) as {
          triggerLogic?: string;
          triggerAndTimeout?: number;
        };
        if (meta.triggerLogic === 'and' || meta.triggerLogic === 'or') {
          triggerLogic = meta.triggerLogic;
        }
        if (typeof meta.triggerAndTimeout === 'number' && meta.triggerAndTimeout > 0) {
          triggerAndTimeout = meta.triggerAndTimeout;
        }
      } catch {
        /* 忽略 */
      }
    }

    const triggers = asList(parsed.triggers ?? parsed.trigger)
      .map(mapHaTrigger)
      .filter((x): x is Record<string, unknown> => Boolean(x));
    const conditions = asList(parsed.conditions ?? parsed.condition)
      .map(mapHaCondition)
      .filter((x): x is Record<string, unknown> => Boolean(x));
    const actions = asList(parsed.actions ?? parsed.action)
      .map(mapHaSequenceAction)
      .filter((x): x is Record<string, unknown> => Boolean(x));

    if (!triggers.length && !actions.length) return null;

    return {
      version: 2,
      name: String(parsed.alias || name || ''),
      mode: String(parsed.mode || 'single'),
      triggerLogic,
      triggerAndTimeout,
      condRootLogic: 'and',
      triggerGroups: triggers.length
        ? [{ logic: triggerLogic, triggers }]
        : [],
      conditionGroups: conditions.length ? [{ logic: 'and', conditions }] : [],
      triggers,
      conditions,
      actions,
      yamlDigest: fingerprintAutomationYaml(yaml),
    };
  } catch {
    return null;
  }
}

/** 从场景 entities 构建 geekSceneGraph（布局由前端 reconcile） */
export function buildSceneGeekSceneGraph(
  name: string,
  entities: unknown,
  yaml?: string | null,
): Record<string, unknown> {
  const list = Array.isArray(entities) ? entities : [];
  const normalized = list
    .map((e) => {
      if (typeof e === 'string') {
        return { entityId: e, state: 'on' };
      }
      if (!e || typeof e !== 'object') return null;
      const row = e as Record<string, unknown>;
      const entityId = String(row.entityId || row.entity_id || '').trim();
      if (!entityId) return null;
      const out: Record<string, unknown> = {
        entityId,
        state: row.state != null ? String(row.state) : 'on',
      };
      for (const key of [
        'customState',
        'brightness',
        'colorTemp',
        'rgbColor',
        'transition',
        'effect',
        'position',
        'temperature',
        'hvacMode',
        'volume',
        'source',
        'percentage',
        'code',
        'option',
        'value',
        'humidity',
        'fanSpeed',
      ]) {
        if (row[key] != null && row[key] !== '') out[key] = row[key];
      }
      return out;
    })
    .filter((x): x is Record<string, unknown> => Boolean(x));

  const graph: Record<string, unknown> = {
    version: 1,
    name: name || '',
    entities: normalized,
  };
  if (yaml != null && String(yaml).trim()) {
    graph.yamlDigest = fingerprintSceneYaml(yaml);
  }
  return graph;
}
