/**
 * @file automation-yaml-normalize.util.ts
 * @module @homeos/shared/orchestrator
 * @brief 自动化 YAML 规范化中间层（引擎 / Builder 共用）。
 *
 * 职责：
 *  - 把 HA automation YAML 解析为 ParsedTrigger / ParsedCondition / ParsedAction 语义结构；
 *  - 提供触发器平台、条件类型、动作字段的能力探测与审计支持判定；
 *  - 提供 entity_id / 时间 / 周日 / 日落偏移等字段的前后端共用 normalize。
 *
 * 关键依赖：
 *  - loadHaYaml / parseHaDuration：YAML 与时长解析；
 *  - HA automation 模式（trigger / condition / action / sequence / choose / repeat）。
 *
 * 约定：
 *  - 产出 HA 语义结构；前端再映射为表单，后端再挂接引擎审计；
 *  - 引擎能力探测结果（AUTOMATION_ENGINE_CAPABILITIES）用于决定是否允许 runOnHa；
 *  - 不修改原始 YAML，仅产出结构化中间表示。
 */
import { loadHaYaml } from '../yaml/ha-yaml';
import { parseHaDuration } from './duration';

/**
 * 已规范化的触发器 AST 节点（HA automation trigger 语义的共享表示）。
 * 覆盖 state/numeric_state/time/time_pattern/sun/event/zone/calendar/device/template/webhook 等平台；
 * 扩展字段含 cron / interval / value_template / webhook_secret 等 HomeOS 扩展能力。
 */
export interface ParsedTrigger {
  platform: string;
  entity_id?: string | string[];
  from?: string;
  to?: string;
  for?: number;
  above?: number;
  below?: number;
  at?: string;
  event?: string;
  event_type?: string;
  offset?: number;
  days?: number[];
  zone?: string;
  /** event_data 透传（变量 key / 循环 interval 等） */
  event_data?: Record<string, unknown>;
  /** 监听实体属性而非 state（HA state / numeric_state attribute） */
  attribute?: string;
  /** HA device 触发器 */
  device_id?: string;
  domain?: string;
  /** HA device trigger 的 type（如 turned_on） */
  device_type?: string;
  /** time_pattern 触发器：{ hours?, minutes?, seconds? }，值为数字、'*' 或 '/N' */
  pattern?: {
    hours?: string;
    minutes?: string;
    seconds?: string;
  };
  /** time 触发器 interval 模式："HH:MM:SS"（每 N 周期触发） */
  interval?: string;
  /** cron 表达式（5 段：分 时 日 月 周），time_changed 之外的扩展 */
  cron?: string;
  /** webhook 触发器：webhook_id */
  webhook_id?: string;
  /** webhook 触发器鉴权密钥（必填；请求头须携带 HMAC 签名） */
  webhook_secret?: string;
  /** template 触发器：value_template 表达式 */
  value_template?: string;
}

/**
 * 已规范化的条件 AST 节点（HA automation condition 语义）。
 * 支持 state/numeric_state/and/or/not/time/sun/template/homeos_variable/zone/trigger/weather，
 * 以及组合递归嵌套条件，用于引擎执行期求值与前端表单渲染。
 */
export interface ParsedCondition {
  /** 条件类型：state / numeric_state / and / or / not / time / sun / template / homeos_variable / zone / trigger / weather */
  condition: string;
  /** 关联实体 ID（HA entity_id 或数组）；state / numeric_state 条件用 */
  entity_id?: string | string[];
  /** state 条件：目标状态值（如 "on" / "off"） */
  state?: string;
  /** numeric_state 条件阈值：大于该值时满足（字符串，支持带单位） */
  above?: string;
  /** numeric_state 条件阈值：小于该值时满足 */
  below?: string;
  /** numeric_state 比较运算符（默认等于；扩展写法支持 >= / <= / != 等） */
  operator?: string;
  /** time 条件：开始小时（"HH:MM[:SS]"）；或 sun 条件的 after 事件（sunrise / sunset） */
  after?: string;
  /** time 条件：结束小时；或 sun 条件的 before 事件 */
  before?: string;
  /** template 条件：Jinja 表达式；非空时按模板渲染结果真假判定 */
  value_template?: string;
  /** and / or / not 组合条件：子条件数组（可递归嵌套） */
  conditions?: ParsedCondition[];
  /** time 条件的星期过滤（0=周日 … 6=周六，对齐 JS Date.getDay） */
  days?: number[];
  /** state 条件持续秒数（对齐 HA `for`）：实体状态保持该秒数后条件才满足 */
  for?: number;
  /** homeos_variable 条件：变量名（global 或 rule 作用域） */
  key?: string;
  /** homeos_variable 条件：期望值（字符串比较） */
  value?: string;
  /** homeos_variable 作用域：global（全局） 或 rule（规则私有） */
  scope?: string;
  /** homeos_variable 作用域为 rule 时对应的规则 ID */
  rule_id?: string;
  /** state / numeric_state 条件：比较实体属性（attribute）而非 state 值 */
  attribute?: string;
  /** sun 条件 after 偏移秒数（可负，表示提前 sunrise/sunset N 秒） */
  after_offset?: number;
  /** sun 条件 before 偏移秒数（可负） */
  before_offset?: number;
  /** zone 条件：目标 zone entity_id（可带 zone. 前缀） */
  zone?: string;
  /** zone 条件事件：enter（进入区域） 或 leave（离开区域）；缺省 enter */
  event?: string;
}

/**
 * 已规范化的动作 AST 节点（HA automation action 语义 + HomeOS 扩展）。
 * 覆盖 call_service/delay/choose/repeat/sequence/parallel/wait_template/wait_for_trigger/fire_event/stop/device_action 等，
 * 以及 HomeOS 变量类动作（variable_set / variable_math / variable_fn）、continue_on_error 与 retry 等扩展字段。
 */
export interface ParsedAction {
  /** 动作类型：call_service / delay / choose / repeat / sequence / parallel / variables / wait_template / wait_for_trigger / fire_event / stop / device_action / homeos.variable_set 等 */
  type: string;
  /** call_service 动作：HA 服务名（含 domain，如 "light.turn_on"） */
  service?: string;
  /** call_service 动作：目标实体 ID（单值） */
  entity_id?: string;
  /** call_service 动作：服务调用参数（透传到 HA service data） */
  data?: Record<string, unknown>;
  /** delay 动作：等待秒数 */
  delay?: number;
  /** fire_event 动作：事件类型（event_type） */
  event?: string;
  /** fire_event 动作：事件附加数据（event_data） */
  event_data?: Record<string, unknown>;
  /** choose 动作：条件→动作 分支数组（任一 conditions 全满足则执行对应 actions） */
  choose?: Array<{ conditions: ParsedCondition[]; actions: ParsedAction[] }>;
  /** choose 动作默认分支：所有 conditions 均不满足时执行（可空） */
  defaultActions?: ParsedAction[];
  /** repeat 动作：循环配置（count / while / until 三选其一或组合；actions 必填） */
  repeat?: {
    /** 固定循环次数 */
    count?: number;
    /** 先检查条件：while 条件为真时执行（最多 100 次保护） */
    while?: ParsedCondition[];
    /** 先执行后检查：until 条件为真时停止（do-until 语义，最多 100 次） */
    until?: ParsedCondition[];
    /** 每次循环执行的动作列表 */
    actions: ParsedAction[];
  };
  /** sequence / parallel 子动作列表（按序 / 并发执行） */
  sequence?: ParsedAction[];
  /** if 动作条件或 wait_for_trigger 的前置条件（条件满足才进入动作） */
  conditions?: ParsedCondition[];
  /** wait_template 动作：等待 Jinja 模板渲染为真（超时 30s 默认） */
  value_template?: string;
  /** wait_for_trigger 动作：等待的触发器列表（命中任一则继续） */
  waitTriggers?: ParsedTrigger[];
  /** wait_for_trigger 超时后是否继续后续动作（HA continue_on_timeout；默认 false=超时时中止后续） */
  continueOnTimeout?: boolean;
  /** stop 动作：true 时以 error 级别停止整个脚本（抛错），false 时以 warn 静默停止 */
  stopError?: boolean;
  /** stop 动作：停止时写入的消息（日志与返回错误） */
  stopMessage?: string;
  /** HA device 动作：目标设备 ID（device_action 类型，本地引擎不执行，须 runOnHa 转发 HA） */
  device_id?: string;
  /** HA device 动作：设备动作类型（如 turned_on），与 device_id 配合识别具体服务 */
  device_type?: string;
  /** HA device 动作 / call_service 动作：domain 字段（便于分类与 UI 过滤） */
  domain?: string;
  /** HA continue_on_error：该动作失败后是否继续后续步骤（默认 false=动作失败即中止整条链） */
  continueOnError?: boolean;
  /** 动作失败重试策略（仅 call_service 类型生效）：重试次数与重试间隔毫秒 */
  retry?: {
    /** 最多重试次数（不含首次调用） */
    count?: number;
    /** 每次重试前等待毫秒（默认 0=立即重试） */
    delayMs?: number;
  };
}

/**
 * 解析 & 规范化后的单条自动化规则核心结构（前后端共享语义）。
 * name + triggers + conditions + actions + mode 为 HA 标准字段，mutexGroup 为 HomeOS DAG 扩展（同组互斥执行）。
 */
export interface AutomationRuleCore {
  name: string;
  triggers: ParsedTrigger[];
  conditions: ParsedCondition[];
  actions: ParsedAction[];
  mode: string;
  /** DAG 互斥组：同组自动化互斥执行（组被其他规则占用时丢弃本次触发） */
  mutexGroup?: string;
}

interface ParsedAutomationDoc {
  alias?: string;
  mode?: string;
  /** DAG 互斥组：同组自动化互斥执行 */
  mutex_group?: string;
  trigger?: unknown;
  condition?: unknown;
  action?: unknown;
  triggers?: unknown;
  conditions?: unknown;
  actions?: unknown;
}

const SUPPORTED_TRIGGER_PLATFORMS = new Set([
  'state',
  'numeric_state',
  'time',
  'time_pattern',
  'time_changed',
  'sun',
  'homeassistant',
  'event',
  'zone',
  'calendar',
  'device',
  'template',
  'webhook',
]);

const SUPPORTED_CONDITION_TYPES = new Set([
  'state',
  'numeric_state',
  'and',
  'or',
  'not',
  'time',
  'sun',
  'template',
  'homeos_variable',
  'zone',
  'trigger',
  'weather',
]);

/**
 * HomeOS 本地自动化引擎的能力清单（触发器平台 / 条件类型 / 动作类型 / 限制说明）。
 * 前端据此决定是否提示用户启用「在 HA 执行 runOnHa」，后端据此做审计 warn。
 */
export const AUTOMATION_ENGINE_CAPABILITIES = {
  triggers: [...SUPPORTED_TRIGGER_PLATFORMS],
  conditions: [...SUPPORTED_CONDITION_TYPES],
  actions: [
    'call_service',
    'delay',
    'choose',
    'repeat',
    'sequence',
    'parallel',
    'variables',
    'wait_template',
    'wait_for_trigger',
    'fire_event',
    'stop',
    'device_action',
    'homeos.variable_set',
    'homeos.variable_math',
    'homeos.variable_fn',
  ],
  limitations: [
    '未知条件类型视为不满足（安全默认）',
    'wait_for_trigger 支持 state/numeric_state/event（含 attribute），超时默认 30s；continue_on_timeout 控制超时后是否继续',
    'repeat.while 最多迭代 100 次',
    'repeat.until 最多迭代 100 次（先执行再检查）',
    'complex template 条件回退 HA render_template',
    'zone 触发器匹配 person/device_tracker 进入/离开 zone',
    'calendar 触发器在实体 state on/off 变化时触发 start/end',
    'variables 设置模板上下文，供后续 template 步骤引用',
    'time 条件支持 after/before 时间窗与 weekday 星期过滤',
    'sun 条件支持 after/before 与 after_offset/before_offset',
    'if/scene/stop 动作规范化为 choose / scene.turn_on / stop',
    'device_id 动作保留为 device_action，本地引擎不执行，需 runOnHa',
    'continue_on_error 挂在动作上；失败时默认中止，为 true 时继续',
    'trigger: 快捷写法规范为 automation.trigger',
    'homeos.variable_set 持久变量（含 source_entity / source_var）；homeos.variable_math / homeos.variable_fn；homeos_variable 条件；homeos.var_changed / homeos.interval.tick / homeos.automation.enabled 事件触发',
    '触发器 AND / sequence 由 Builder 编译为 wait_for_trigger 链',
    'state / numeric_state 触发器与条件支持 for 持续秒数；attribute 条件 for 使用 last_updated',
    '画布同一动作多出边自动折叠为 parallel',
    'time_pattern 支持 hours/minutes/seconds 数字、* 与 /N 周期；本地 timeCheckTimer 节流扫描',
    'time.interval 按 HH:MM:SS 周期触发（复用 interval 扫描器）',
    'time_changed 等价于 time 平台每日 at 触发',
    'device 触发器本地映射为关联实体 state 触发（需 HA device registry 可解析）；type=turned_on 等按设备类型推断',
    'template 触发器按周期扫描求值（30s 节流），无法本地求值时回退 HA render_template',
    'webhook 触发器由本地 HTTP 端点触发：POST /api/v1/automation/webhook/:id',
    'zone / trigger 条件支持本地求值',
    'DAG 链路：event_type=automation.completed / automation.failed 事件触发，event_data 可按 automation_id / name 过滤；嵌套深度受 automation.dagMaxDepth 限制',
    'DAG 互斥：顶层 mutex_group 配置同组自动化互斥执行，组被占用时本次触发丢弃（automation.dropped reason=mutex-busy）',
    'per-entity 多触发合并：automation.entityTriggerDebounceMs>0 时同一实体高频状态变化在窗口内合并为一次触发评估',
  ],
} as const;

/**
 * 判断某个触发器 platform 字符串是否为本地引擎支持（对照 SUPPORTED_TRIGGER_PLATFORMS 白名单）。
 *
 * @param platform 触发器平台（如 "state" / "time" / "webhook"）
 * @returns 支持时 true，未知或大小写不匹配时 false
 */
export function isSupportedAutomationTriggerPlatform(platform: string): boolean {
  return SUPPORTED_TRIGGER_PLATFORMS.has(platform);
}

/**
 * 判断某个条件类型字符串是否为本地引擎支持（对照 SUPPORTED_CONDITION_TYPES 白名单）。
 *
 * @param condition 条件类型（如 "state" / "and" / "homeos_variable"）
 * @returns 支持时 true，未知时 false（前端据此提示"本地视为不满足"）
 */
export function isSupportedAutomationConditionType(condition: string): boolean {
  return SUPPORTED_CONDITION_TYPES.has(condition);
}

/** 规范 entity_id / target.entity_id → 单值或数组 */
export function normalizeEntityId(raw: unknown): string | string[] | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const ids = raw.map((v) => String(v)).filter(Boolean);
    if (!ids.length) return undefined;
    return ids.length === 1 ? ids[0] : ids;
  }
  if (typeof raw === 'object') {
    const target = (raw as Record<string, unknown>).entity_id;
    if (target != null) return normalizeEntityId(target);
  }
  return String(raw);
}

/** Builder 表单：entity_id → 逗号分隔字符串 */
export function entityIdToFormString(raw: unknown): string {
  const n = normalizeEntityId(raw);
  if (n == null) return '';
  return Array.isArray(n) ? n.join(', ') : n;
}

/**
 * 解析「星期过滤」字段（支持数字 0-6 / 英文缩写 sun…sat / 混和数组）。
 *
 * @param raw 字符串 / 数字 / 数组 / null（null 时返回 undefined）
 * @returns 去重后的周日数字数组（0=周日 … 6=周六）；空或非法返回 undefined
 */
export function parseWeekdays(raw: unknown): number[] | undefined {
  if (raw == null) return undefined;
  const list = Array.isArray(raw) ? raw : [raw];
  const nameMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const out: number[] = [];
  for (const item of list) {
    if (typeof item === 'number' && item >= 0 && item <= 6) {
      out.push(item);
    } else if (typeof item === 'string') {
      const mapped = nameMap[item.toLowerCase().trim()];
      if (mapped != null) out.push(mapped);
      else {
        const n = parseInt(item, 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 6) out.push(n);
      }
    }
  }
  const unique = [...new Set(out)];
  return unique.length ? unique : undefined;
}

/** sun offset → 秒（可负）；支持 ±HH:MM:SS / ±HH:MM / 纯秒数 */
export function parseSunOffsetSeconds(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return undefined;
    const negative = s.startsWith('-');
    const positive = s.startsWith('+');
    const body = negative || positive ? s.slice(1) : s;
    const parts = body.split(':');
    if (parts.length === 3 || parts.length === 2) {
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      const secPart = parts.length === 3 ? parseInt(parts[2], 10) || 0 : 0;
      const sec = h * 3600 + m * 60 + secPart;
      if (!Number.isFinite(sec)) return undefined;
      return negative ? -sec : sec;
    }
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

/** sun offset → 表单分钟 */
export function parseSunOffsetMinutes(raw: unknown): number {
  const sec = parseSunOffsetSeconds(raw);
  if (sec == null) return 0;
  return Math.round(sec / 60);
}

/** "8:00" → "08:00:00" */
export function normalizeAutomationTimeStr(t: string): string {
  const parts = t.split(':').map((p) => p.trim());
  if (parts.length === 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
  }
  if (parts.length >= 3) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
  }
  return t;
}

/**
 * 将 YAML 中单值 / 数组 / null 统一规范化为 unknown[] 数组（null/undefined → 空数组）。
 * 用于 trigger/condition/action 字段可能是单对象或数组的 HA YAML 结构。
 *
 * @param raw 任意值（可能为对象单值、数组、null、undefined、空字符串）
 * @returns 非 null 数组；单值→[raw]；null/undefined/false/空字符串→[]
 */
export function toUnknownList(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

/**
 * 从 YAML 解析后的顶层对象中拆出 alias / mode / triggers / conditions / actions 五段。
 * 兼容 HA 单复数写法：trigger(s) / condition(s) / action(s)，后者优先覆盖前者。
 *
 * @param doc loadHaYaml 得到的对象（顶层 Record）
 * @returns 五段结构化结果；alias 默认空串，mode 默认 'single'，其余三字段保留原始 unknown
 */
export function extractAutomationYamlSections(doc: Record<string, unknown>) {
  return {
    alias: doc.alias != null ? String(doc.alias) : '',
    mode: typeof doc.mode === 'string' ? doc.mode : 'single',
    triggers: doc.triggers ?? doc.trigger,
    conditions: doc.conditions ?? doc.condition,
    actions: doc.actions ?? doc.action,
  };
}

/**
 * 规范化原始 triggers/trigger YAML 段为 ParsedTrigger AST 数组（空值/非对象都兜底，不抛异常）。
 *
 * @param raw YAML 中 trigger(s) 段原始 unknown（单值/数组/空）
 * @returns ParsedTrigger 数组；至少返回空数组（永不 null/undefined）
 *
 * 字段处理：
 *  - entity_id 经 normalizeEntityId（支持 target.entity_id）；
 *  - for 经 parseHaDuration（秒数）；above/below 经 parseFloat；
 *  - at 经 normalizeAutomationTimeStr；weekday/days 经 parseWeekdays；
 *  - webhook：secret / webhook_secret 合并为 webhook_secret；webhook_id 缺失时尝试用 id。
 */
export function normalizeTriggers(raw: unknown): ParsedTrigger[] {
  return toUnknownList(raw).map((item) => {
    const t = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const platform = (t.platform as string) || (t.trigger as string) || 'state';
    let pattern: ParsedTrigger['pattern'] | undefined;
    if (t.pattern && typeof t.pattern === 'object') {
      const p = t.pattern as Record<string, unknown>;
      pattern = {
        hours: p.hours != null ? String(p.hours) : undefined,
        minutes: p.minutes != null ? String(p.minutes) : undefined,
        seconds: p.seconds != null ? String(p.seconds) : undefined,
      };
    }
    return {
      platform,
      entity_id: normalizeEntityId(
        t.entity_id ?? (t.target as Record<string, unknown> | undefined)?.entity_id,
      ),
      from: t.from as string | undefined,
      to: t.to as string | undefined,
      for: parseHaDuration(t.for),
      above: t.above != null ? parseFloat(String(t.above)) : undefined,
      below: t.below != null ? parseFloat(String(t.below)) : undefined,
      at: t.at != null ? normalizeAutomationTimeStr(String(t.at)) : undefined,
      event: (t.event as string) || (platform === 'calendar' ? 'start' : undefined),
      event_type: t.event_type as string | undefined,
      offset: parseSunOffsetSeconds(t.offset),
      days: parseWeekdays(t.weekday ?? t.days),
      zone: (t.zone as string) || undefined,
      event_data:
        t.event_data && typeof t.event_data === 'object'
          ? (t.event_data as Record<string, unknown>)
          : undefined,
      attribute: t.attribute != null ? String(t.attribute) : undefined,
      device_id: t.device_id != null ? String(t.device_id) : undefined,
      domain: t.domain != null ? String(t.domain) : undefined,
      device_type:
        platform === 'device' && t.type != null ? String(t.type) : undefined,
      pattern,
      interval:
        t.interval != null ? String(t.interval) : undefined,
      cron: t.cron != null ? String(t.cron) : undefined,
      webhook_id:
        platform === 'webhook' && t.webhook_id != null
          ? String(t.webhook_id)
          : t.id != null && platform === 'webhook'
            ? String(t.id)
            : undefined,
      webhook_secret:
        platform === 'webhook'
          ? String(t.secret ?? t.webhook_secret ?? '').trim() || undefined
          : undefined,
      value_template:
        platform === 'template' && t.value_template != null
          ? String(t.value_template)
          : undefined,
    };
  });
}

/**
 * 规范化原始 conditions/condition YAML 段为 ParsedCondition AST 数组（递归处理 and/or/not 子条件）。
 *
 * @param raw YAML 中 condition(s) 段原始 unknown
 * @returns ParsedCondition 数组；至少返回空数组
 *
 * 字段处理：
 *  - condition 默认 'state'；子条件通过 normalizeConditions 递归；
 *  - weekday/days 经 parseWeekdays；for 经 parseHaDuration；after_offset/before_offset 经 parseSunOffsetSeconds。
 */
export function normalizeConditions(raw: unknown): ParsedCondition[] {
  return toUnknownList(raw).map((item) => {
    const c = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      condition: (c.condition as string) || 'state',
      entity_id: normalizeEntityId(
        c.entity_id ?? (c.target as Record<string, unknown> | undefined)?.entity_id,
      ),
      state: c.state as string | undefined,
      above: c.above != null ? String(c.above) : undefined,
      below: c.below != null ? String(c.below) : undefined,
      operator: c.operator as string | undefined,
      after: c.after as string | undefined,
      before: c.before as string | undefined,
      value_template: (c.value_template as string) || undefined,
      conditions: c.conditions ? normalizeConditions(c.conditions) : undefined,
      days: parseWeekdays(c.weekday ?? c.days),
      for: parseHaDuration(c.for),
      key: c.key != null ? String(c.key) : undefined,
      value: c.value != null ? String(c.value) : undefined,
      scope: c.scope != null ? String(c.scope) : undefined,
      rule_id: c.rule_id != null ? String(c.rule_id) : undefined,
      attribute: c.attribute != null ? String(c.attribute) : undefined,
      after_offset: parseSunOffsetSeconds(c.after_offset),
      before_offset: parseSunOffsetSeconds(c.before_offset),
      zone: c.zone != null ? String(c.zone) : undefined,
      event: c.event != null ? String(c.event) : undefined,
    };
  });
}

function normalizeActionItem(raw: unknown): ParsedAction | null {
  if (typeof raw !== 'object' || !raw) return null;
  const action = raw as Record<string, unknown>;

  if (action.choose) {
    const branches = Array.isArray(action.choose) ? action.choose : [action.choose];
    return {
      type: 'choose',
      choose: branches.map((b: Record<string, unknown>) => ({
        conditions: b.conditions ? normalizeConditions(b.conditions) : [],
        actions: normalizeActions(b.sequence ?? b.actions ?? []),
      })),
      defaultActions: action.default ? normalizeActions(action.default) : [],
    };
  }

  // HA if/then/else → choose（规范化）
  if (action.if != null) {
    return {
      type: 'choose',
      choose: [
        {
          conditions: normalizeConditions(action.if),
          actions: normalizeActions(action.then ?? []),
        },
      ],
      defaultActions: action.else ? normalizeActions(action.else) : [],
    };
  }

  if (action.repeat) {
    const r = action.repeat as Record<string, unknown>;
    return {
      type: 'repeat',
      repeat: {
        count: r.count != null ? parseInt(String(r.count), 10) : undefined,
        while: r.while ? normalizeConditions(r.while) : undefined,
        until: r.until ? normalizeConditions(r.until) : undefined,
        actions: normalizeActions(r.sequence ?? []),
      },
    };
  }

  if (action.sequence) {
    return { type: 'sequence', sequence: normalizeActions(action.sequence) };
  }

  if (action.condition) {
    return {
      type: 'condition',
      conditions: normalizeConditions(action.condition),
    };
  }

  if (action.delay) {
    const seconds = parseHaDuration(action.delay) ?? 1;
    return { type: 'delay', delay: seconds };
  }

  if (action.event) {
    return {
      type: 'fire_event',
      event: action.event as string,
      event_data: action.event_data as Record<string, unknown> | undefined,
    };
  }

  // HA scene 快捷写法 → scene.turn_on
  if (action.scene != null && action.scene !== '') {
    const sceneRaw = String(action.scene).trim();
    const entityId = sceneRaw.includes('.') ? sceneRaw : `scene.${sceneRaw}`;
    return {
      type: 'call_service',
      service: 'scene.turn_on',
      entity_id: entityId,
    };
  }

  // HA stop：结束后续步骤
  if ('stop' in action) {
    return {
      type: 'stop',
      stopError: Boolean(action.error),
      stopMessage: typeof action.stop === 'string' ? action.stop : undefined,
    };
  }

  // HA / 部分导出：trigger: <automation_id | { entity_id }> → automation.trigger
  if (action.trigger != null) {
    const t = action.trigger;
    let entityId = '';
    if (typeof t === 'string' || typeof t === 'number') {
      const raw = String(t).trim();
      entityId = raw.includes('.') ? raw : raw ? `automation.${raw}` : '';
    } else if (t && typeof t === 'object') {
      const obj = t as Record<string, unknown>;
      const eid =
        obj.entity_id ?? (obj.target as Record<string, unknown> | undefined)?.entity_id;
      entityId = Array.isArray(eid) ? String(eid[0] || '') : String(eid || '');
    }
    if (entityId) {
      return {
        type: 'call_service',
        service: 'automation.trigger',
        entity_id: entityId,
        data:
          t && typeof t === 'object' && (t as Record<string, unknown>).data
            ? ((t as Record<string, unknown>).data as Record<string, unknown>)
            : undefined,
      };
    }
  }

  // HA device 动作（本地引擎不执行，需 runOnHa；保留 AST 以免静默丢失）
  if (action.device_id != null && String(action.device_id)) {
    return {
      type: 'device_action',
      device_id: String(action.device_id),
      device_type: action.type != null ? String(action.type) : undefined,
      domain: action.domain != null ? String(action.domain) : undefined,
      entity_id: (action.entity_id ||
        (action.target as Record<string, unknown> | undefined)?.entity_id) as string | undefined,
      data: {
        device_id: String(action.device_id),
        ...(action.domain != null ? { domain: String(action.domain) } : {}),
        ...(action.type != null ? { type: String(action.type) } : {}),
      },
    };
  }

  if (action.service || action.action) {
    return {
      type: 'call_service',
      service: (action.service || action.action) as string,
      entity_id: (action.entity_id ||
        (action.target as Record<string, unknown> | undefined)?.entity_id) as string | undefined,
      data: (action.data || action.service_data) as Record<string, unknown> | undefined,
    };
  }

  if (action.wait_template) {
    return { type: 'wait_template', value_template: String(action.wait_template) };
  }
  if (action.wait_for_trigger) {
    const waitRaw = action.wait_for_trigger;
    const waitList = Array.isArray(waitRaw) ? waitRaw : [waitRaw];
    const timeoutSec = parseHaDuration(action.timeout) || 30;
    return {
      type: 'wait_for_trigger',
      waitTriggers: normalizeTriggers(waitList),
      delay: timeoutSec,
      continueOnTimeout: Boolean(action.continue_on_timeout),
    };
  }

  if (action.parallel) {
    return { type: 'parallel', sequence: normalizeActions(action.parallel) };
  }

  if (action.variables && typeof action.variables === 'object') {
    return { type: 'variables', data: action.variables as Record<string, unknown> };
  }

  return null;
}

/**
 * 规范化原始 actions/action YAML 段为 ParsedAction AST 数组（支持 choose/if/repeat/sequence/parallel 嵌套）。
 *
 * @param raw YAML 中 action(s) 段原始 unknown
 * @returns ParsedAction 数组；不能识别形状的动作会被 normalizeActionItem 返回 null 并跳过
 *
 * 附加处理（normalizeActionItem 之后）：
 *  - HA continue_on_error 映射到 continueOnError 字段；
 *  - retry（retry.count / retry.delay_ms）映射到 retry: { count, delayMs } 对象。
 */
export function normalizeActions(raw: unknown): ParsedAction[] {
  const result: ParsedAction[] = [];
  for (const a of toUnknownList(raw)) {
    const parsed = normalizeActionItem(a);
    if (!parsed) continue;
    if (a && typeof a === 'object' && 'continue_on_error' in (a as object)) {
      parsed.continueOnError = Boolean((a as Record<string, unknown>).continue_on_error);
    }
    if (a && typeof a === 'object' && (a as Record<string, unknown>).retry != null) {
      const r = (a as Record<string, unknown>).retry as Record<string, unknown>;
      if (r && typeof r === 'object') {
        parsed.retry = {
          count: r.count != null ? parseInt(String(r.count), 10) : undefined,
          delayMs: r.delay_ms != null ? parseInt(String(r.delay_ms), 10) : undefined,
        };
      }
    }
    result.push(parsed);
  }
  return result;
}

function actionHasRecognizedShape(a: Record<string, unknown>): boolean {
  return Boolean(
    a.service ||
      a.action ||
      a.event ||
      a.delay ||
      a.condition ||
      a.choose ||
      a.repeat ||
      a.sequence ||
      a.wait_template ||
      a.wait_for_trigger ||
      a.scene ||
      a.device_id ||
      a.if ||
      a.parallel ||
      a.variables ||
      'stop' in a ||
      a.trigger,
  );
}

/** 递归校验 action 节点（含 choose/repeat/if/sequence/parallel 嵌套） */
function validateActionNode(a: unknown, path: string, errors: string[]): void {
  if (!a || typeof a !== 'object') {
    errors.push(`${path}: 不是有效的对象`);
    return;
  }
  const obj = a as Record<string, unknown>;
  if (!actionHasRecognizedShape(obj)) {
    errors.push(`${path}: 缺少 service/action/event/delay/choose/repeat/sequence 字段`);
  }

  if (obj.choose != null) {
    const branches = toUnknownList(obj.choose);
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i] as Record<string, unknown> | null;
      if (!b || typeof b !== 'object') {
        errors.push(`${path}.choose[${i}]: 不是有效的对象`);
        continue;
      }
      const seq = b.sequence ?? b.actions;
      if (seq != null) {
        toUnknownList(seq).forEach((child, j) =>
          validateActionNode(child, `${path}.choose[${i}].sequence[${j}]`, errors),
        );
      }
    }
  }
  if (obj.default != null) {
    toUnknownList(obj.default).forEach((child, j) =>
      validateActionNode(child, `${path}.default[${j}]`, errors),
    );
  }
  if (obj.if != null && obj.then != null) {
    toUnknownList(obj.then).forEach((child, j) =>
      validateActionNode(child, `${path}.then[${j}]`, errors),
    );
  }
  if (obj.else != null) {
    toUnknownList(obj.else).forEach((child, j) =>
      validateActionNode(child, `${path}.else[${j}]`, errors),
    );
  }
  if (obj.repeat != null && typeof obj.repeat === 'object') {
    const r = obj.repeat as Record<string, unknown>;
    toUnknownList(r.sequence).forEach((child, j) =>
      validateActionNode(child, `${path}.repeat.sequence[${j}]`, errors),
    );
  }
  if (obj.sequence != null) {
    toUnknownList(obj.sequence).forEach((child, j) =>
      validateActionNode(child, `${path}.sequence[${j}]`, errors),
    );
  }
  if (obj.parallel != null) {
    toUnknownList(obj.parallel).forEach((child, j) => {
      if (child && typeof child === 'object' && 'sequence' in (child as object)) {
        const row = child as Record<string, unknown>;
        toUnknownList(row.sequence).forEach((step, k) =>
          validateActionNode(step, `${path}.parallel[${j}].sequence[${k}]`, errors),
        );
      } else {
        validateActionNode(child, `${path}.parallel[${j}]`, errors);
      }
    });
  }
}

/**
 * 对 YAML 解析顶层对象做基础结构校验（必填 action、trigger/condition 形状、webhook secret 必填等），返回人类可读错误。
 *
 * @param parsed 顶层 YAML 解析 Record（未规范化的原始对象）
 * @returns 错误字符串数组；无错误返回空数组（零长度即校验通过）
 *
 * 校验点：
 *  - 至少存在 action/actions；
 *  - 每个 action 须有识别字段（service/delay/choose/repeat/...）；递归 validate choose/repeat/if/sequence/parallel 嵌套；
 *  - 每个 trigger 须为对象且至少有 platform/trigger/entity_id/event/at 之一；webhook 必须含 secret；
 *  - 每个 condition 须为对象且有 condition 字段。
 */
export function validateAutomationYamlStructure(parsed: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const rawAction = parsed.actions ?? parsed.action;
  const rawTrigger = parsed.triggers ?? parsed.trigger;
  const rawCondition = parsed.conditions ?? parsed.condition;

  if (!rawAction) {
    errors.push('缺少 action/actions 字段，自动化必须有至少一个动作');
    return errors;
  }

  toUnknownList(rawAction).forEach((a, i) => validateActionNode(a, `action[${i}]`, errors));

  if (rawTrigger) {
    const triggers = toUnknownList(rawTrigger);
    for (let i = 0; i < triggers.length; i++) {
      const t = triggers[i] as Record<string, unknown> | null | undefined;
      if (!t || typeof t !== 'object') {
        errors.push(`trigger[${i}]: 不是有效的对象`);
        continue;
      }
      if (!t.platform && !t.trigger && !t.entity_id && !t.event && !t.event_type && !t.at) {
        errors.push(`trigger[${i}]: 缺少 platform/trigger/entity_id/event/at 字段`);
      }
      const platform = String(t.platform ?? t.trigger ?? '');
      if (platform === 'webhook') {
        const secret = String(t.secret ?? t.webhook_secret ?? '').trim();
        if (!secret) {
          errors.push(`trigger[${i}]: webhook 必须配置 secret 或 webhook_secret`);
        }
      }
    }
  }

  if (rawCondition) {
    const conditions = toUnknownList(rawCondition);
    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i] as Record<string, unknown> | null | undefined;
      if (!c || typeof c !== 'object') {
        errors.push(`condition[${i}]: 不是有效的对象`);
        continue;
      }
      if (!c.condition) {
        errors.push(`condition[${i}]: 缺少 condition 字段`);
      }
    }
  }

  return errors;
}

/**
 * 将 YAML 解析为规范化自动化文档（不含 id/enabled）。
 * 结构失败或空文档返回 null。
 */
export function parseAutomationYamlCore(
  yamlStr: string,
  fallbackName = '',
  warn?: (message: string) => void,
): { core: AutomationRuleCore; rawActionCount: number } | null {
  if (!yamlStr || yamlStr.trim().startsWith('#')) return null;

  try {
    const parsed = loadHaYaml(yamlStr) as ParsedAutomationDoc;
    if (!parsed || typeof parsed !== 'object') return null;

    const validationErrors = validateAutomationYamlStructure(parsed as Record<string, unknown>);
    if (validationErrors.length > 0) {
      warn?.(`自动化 [${fallbackName}] YAML 结构校验失败: ${validationErrors.join('; ')}`);
      return null;
    }

    const sections = extractAutomationYamlSections(parsed as Record<string, unknown>);
    const core: AutomationRuleCore = {
      name: sections.alias || fallbackName,
      triggers: normalizeTriggers(sections.triggers),
      conditions: normalizeConditions(sections.conditions),
      actions: normalizeActions(sections.actions),
      mode: ['single', 'restart', 'queued', 'parallel'].includes(sections.mode)
        ? sections.mode
        : 'single',
      mutexGroup:
        (parsed as Record<string, unknown>).mutex_group != null
          ? String((parsed as Record<string, unknown>).mutex_group)
          : undefined,
    };
    return { core, rawActionCount: toUnknownList(sections.actions).length };
  } catch (e) {
    warn?.(`解析自动化 [${fallbackName}] YAML 失败: ${e}`);
    return null;
  }
}

/**
 * 对已规范化的 AST 做本地引擎能力审计：未知触发器/条件类型/device 动作/无法规范化的动作 都通过 warn 回调输出中文提示。
 *
 * @param name           规则展示名（warn 信息中用方括号标识）
 * @param triggers       已规范化的 ParsedTrigger 数组
 * @param conditions     已规范化的 ParsedCondition 数组
 * @param rawActionCount 原始动作条目数（来自 parseAutomationYamlCore 的 rawActionCount，用于对比丢条数）
 * @param actions        已规范化的 ParsedAction 数组
 * @param warn           可选警告回调；未传入时直接静默返回（不 throw）
 *
 * warn 输出条目：
 *  - 未知 trigger platform → 建议启用 runOnHa；
 *  - 未知 condition type → 提示本地视为不满足；
 *  - device_action 动作数 → 提示 runOnHa；
 *  - rawActionCount > parsedActionCount → 报告跳过条数。
 */
export function auditAutomationEngineSupport(
  name: string,
  triggers: ParsedTrigger[],
  conditions: ParsedCondition[],
  rawActionCount: number,
  actions: ParsedAction[],
  warn?: (message: string) => void,
): void {
  if (!warn) return;
  const parsedActionCount = actions.length;

  for (const trigger of triggers) {
    if (!SUPPORTED_TRIGGER_PLATFORMS.has(trigger.platform)) {
      warn(
        `自动化 [${name}] 触发器 platform "${trigger.platform}" 本地引擎不支持，请启用「在 HA 执行」`,
      );
    }
  }
  for (const cond of conditions) {
    if (cond.condition && !SUPPORTED_CONDITION_TYPES.has(cond.condition)) {
      warn(`自动化 [${name}] 条件类型 "${cond.condition}" 本地引擎不支持，视为不满足`);
    }
  }
  const deviceCount = actions.filter((a) => a.type === 'device_action').length;
  if (deviceCount > 0) {
    warn(
      `自动化 [${name}] 含 ${deviceCount} 个 HA device 动作，本地引擎不支持，请启用「在 HA 执行」`,
    );
  }
  if (rawActionCount > parsedActionCount) {
    warn(
      `自动化 [${name}] 含 ${rawActionCount - parsedActionCount} 个本地引擎不支持的动作，已忽略`,
    );
  }
}
