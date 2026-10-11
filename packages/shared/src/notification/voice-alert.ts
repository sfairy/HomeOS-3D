/**
 * @file voice-alert.ts
 * @module @homeos/shared/notification
 * @brief 语音告警（TTS）规则与自定义 / 实体播报（前后端共享）。
 *
 * 职责：
 *  - 维护语音告警开关矩阵（VoiceAlertRules）与默认值；
 *  - 维护告警类型目录（VOICE_ALERT_CATALOG）含中文标签 / 描述 / 分组；
 *  - 提供自定义 TTS 规则与按实体精确匹配 TTS 规则的归一化；
 *  - 提供唤醒词归一化与每日顾问播报默认话术。
 *
 * 关键依赖：
 *  - 后端 voice-alert 服务按本类型持久化与执行；
 *  - 前端语音告警设置页按 VOICE_ALERT_CATALOG 渲染开关列表。
 *
 * 约定：
 *  - 规则 key 与 VOICE_ALERT_PRIORITY 的 key 对齐（决定播报优先级）；
 *  - 自定义规则 id 缺省时由前缀 + idx + 时间戳生成；
 *  - isExactEntityId 用于校验"按实体精确匹配"形式的 entity_id（domain.object_id）。
 */

/**
 * 语音告警开关矩阵（每个 key 对应一类告警是否启用 TTS 播报）。
 */
export interface VoiceAlertRules {
  /** 总开关（关闭后所有 TTS 告警静默） */
  enabled: boolean;
  /** 安防区域告警（人体 / 门磁等） */
  securityZone: boolean;
  /** 异常行为检测（滞留 / 全屋无人） */
  securityAnomaly: boolean;
  /** 烟雾告警 */
  safetySmoke: boolean;
  /** 燃气泄漏 */
  safetyGas: boolean;
  /** 漏水告警 */
  safetyWater: boolean;
  /** 紧急求救（SOS / 紧急按钮） */
  securityEmergency: boolean;
  /** 全员离家自动布防提示 */
  presenceLeft: boolean;
  /** 能耗异常（设备功耗高于基线） */
  energyAnomaly: boolean;
  /** 能源预算超支 */
  energyBudget: boolean;
  /** 用水异常 */
  waterAnomaly: boolean;
  /** 霉菌风险 */
  envMoldRisk: boolean;
  /** danger 级站内通知同步语音播报 */
  notificationDanger: boolean;
  /** warn 级站内通知（易频繁，默认关） */
  notificationWarn: boolean;
}

/**
 * 语音告警默认开关矩阵（首次初始化/配置重置使用）。
 * 默认启用安全类/能耗异常类告警；关闭预算超限（易频繁）、霉菌风险（非紧急）、warn 级通知播报（太噪）。
 * 与 VoiceAlertRules 接口一一对应，字段完全一致，便于浅拷贝合并。
 */
export const DEFAULT_VOICE_ALERT_RULES: VoiceAlertRules = {
  enabled: true,
  securityZone: true,
  securityAnomaly: true,
  safetySmoke: true,
  safetyGas: true,
  safetyWater: true,
  securityEmergency: true,
  presenceLeft: true,
  energyAnomaly: true,
  energyBudget: false,
  waterAnomaly: true,
  envMoldRisk: false,
  notificationDanger: true,
  notificationWarn: false,
};

/**
 * 语音告警类型目录（前端设置页按此渲染开关列表，含中文标签/描述/分组）。
 * key 必须是 VoiceAlertRules 中非 enabled 的布尔字段；group 分三类：security（安防与安全）、life（能源与环境）、notify（通知同步）。
 * 与 DEFAULT_VOICE_ALERT_RULES 对齐，新增 key 时须同步修改此常量。
 */
export const VOICE_ALERT_CATALOG: Array<{
  key: Exclude<keyof VoiceAlertRules, 'enabled'>;
  label: string;
  description: string;
  group: 'security' | 'life' | 'notify';
}> = [
  {
    key: 'securityZone',
    label: '安防区域告警',
    description: '人体/门磁等传感器触发布防区域',
    group: 'security',
  },
  {
    key: 'securityAnomaly',
    label: '异常行为检测',
    description: '长时间滞留、全屋无人异常等',
    group: 'security',
  },
  {
    key: 'safetySmoke',
    label: '烟雾告警',
    description: '烟雾传感器触发，联动关燃气阀/排风',
    group: 'security',
  },
  { key: 'safetyGas', label: '燃气泄漏', description: '燃气传感器触发', group: 'security' },
  {
    key: 'safetyWater',
    label: '漏水告警',
    description: '漏水传感器触发，联动关水阀',
    group: 'security',
  },
  {
    key: 'securityEmergency',
    label: '紧急求救',
    description: '安防面板 SOS / 紧急按钮',
    group: 'security',
  },
  {
    key: 'presenceLeft',
    label: '全员离家',
    description: '家人全部离开，自动布防提示',
    group: 'security',
  },
  { key: 'energyAnomaly', label: '能耗异常', description: '单设备功耗明显高于基线', group: 'life' },
  {
    key: 'energyBudget',
    label: '能源预算超支',
    description: '本月用能预计超出预算',
    group: 'life',
  },
  { key: 'waterAnomaly', label: '用水异常', description: '持续水流或日用水超阈值', group: 'life' },
  {
    key: 'envMoldRisk',
    label: '霉菌风险',
    description: '房间湿度/露点霉菌风险偏高',
    group: 'life',
  },
  {
    key: 'notificationDanger',
    label: '危险通知',
    description: '站内 danger 级通知同步语音播报',
    group: 'notify',
  },
  {
    key: 'notificationWarn',
    label: '警告通知',
    description: '站内 warn 级通知（易频繁，默认关）',
    group: 'notify',
  },
];

/** 语音告警分组 → 中文标题（前端设置页 VOICE_ALERT_CATALOG 的 group 字段展示用）；三组值固定，不可扩展 */
export const VOICE_ALERT_GROUP_LABELS = {
  security: '安防与安全',
  life: '能源与环境',
  notify: '通知同步',
} as const;

/** 白天时段每日顾问播报默认话术（首次初始化使用；支持 {{变量}} 占位符，{{hour}} 会在播报时替换为当前小时） */
export const DEFAULT_DAILY_ADVISOR_TTS_DAYTIME = '智能家居小贴士：空调设定26度最省电哦';
/** 夜间时段每日顾问播报默认话术（首次初始化使用；{{hour}} 占位符在播报时替换为当前小时，其余文字原样播出） */
export const DEFAULT_DAILY_ADVISOR_TTS_EVENING =
  '晚上好，现在是{{hour}}点，请检查门窗是否关好，祝您晚安';

/**
 * 从 SharedVoiceConfig（或等价对象）中解析语音告警开关矩阵；
 * 未配置 ttsAlerts 或其不是对象时，返回 DEFAULT_VOICE_ALERT_RULES 的浅拷贝；否则用 DEFAULT 做基底后与传入值做 Object.assign 合并。
 *
 * @param voice 任意含 ttsAlerts 字段的对象（通常是 SharedVoiceConfig）；可 null/undefined，等价于使用默认值
 * @returns 完整的 VoiceAlertRules 对象（所有布尔字段均有确定值；非 null，直接使用无需判空）
 * @throws 不抛异常；ttsAlerts 字段类型错误时按未配置处理，返回默认矩阵
 */
export function resolveVoiceAlertRules(voice?: {
  ttsAlerts?: Partial<VoiceAlertRules>;
}): VoiceAlertRules {
  const raw = voice?.ttsAlerts;
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_VOICE_ALERT_RULES };
  }
  return { ...DEFAULT_VOICE_ALERT_RULES, ...raw };
}

/**
 * 语义糖：把 Partial<VoiceAlertRules> 合并到默认矩阵，返回完整开关。
 * 内部直接委托 resolveVoiceAlertRules，仅为调用方提供更贴合「partial→full」语义的命名。
 *
 * @param raw 语音告警开关的部分字段（用户修改/存储的片段）；undefined 返回默认矩阵
 * @returns 合并后的完整 VoiceAlertRules（所有布尔字段确定值）
 */
export function mergeVoiceAlertRules(raw?: Partial<VoiceAlertRules>): VoiceAlertRules {
  return resolveVoiceAlertRules({ ttsAlerts: raw });
}

/**
 * 自定义 TTS 告警规则（用户在设置页创建的规则，触发来源分 entity_state 状态变化与 notification 站内通知两类）。
 * id 缺省时由 normalizeCustomTtsAlerts 按 custom_{idx}_{timestamp} 自动生成，避免碰撞。
 */
export interface CustomTtsAlertRule {
  id: string;
  label: string;
  enabled: boolean;
  trigger: 'entity_state' | 'notification';
  entityMatch?: string;
  stateTo?: string;
  notificationLevel?: 'danger' | 'warn' | 'info' | '';
  messageContains?: string;
  sourceContains?: string;
  messageTemplate: string;
}

/** 按实体精确匹配的 TTS 播报（每个实体独立话术） */
export interface EntityTtsAlertRule {
  id: string;
  entityId: string;
  enabled: boolean;
  stateTo?: string;
  messageTemplate: string;
}

/**
 * 判断某字符串是否为「domain.object_id」形式的 HA 精确实体 ID（非前缀/通配）。
 * 用于 EntityTtsAlertRule 校验；格式要求：domain（小写字母+下划线）.object_id（小写字母+数字+下划线）。
 *
 * @param value 待判定字符串
 * @returns true 表示满足精确实体 ID 格式；空串/以点结尾/含非法字符时返回 false
 */
export function isExactEntityId(value: string): boolean {
  const m = String(value || '').trim();
  if (!m || m.endsWith('.')) return false;
  return /^[a-z_]+\.[a-z0-9_]+$/i.test(m);
}

/**
 * 将后端原始配置规范化为实体级 TTS 播报规则数组。
 *
 * @param raw 后端存储的未知格式原始值（期望数组，非数组直接返回空）
 * @returns 规范化后的 EntityTtsAlertRule 数组；空或非法输入返回空数组（永不返回 null/undefined）
 *
 * 规范化规则：
 *  - 非数组 → 空数组；
 *  - 每条必须含有效 entityId（匹配 HA entity_id 正则）+ 非空 messageTemplate，否则跳过；
 *  - 同 entityId 只保留第一条（seen 去重）；
 *  - stateTo 为空时不写入对象；enabled 默认 true。
 */
export function normalizeEntityTtsAlerts(raw: unknown): EntityTtsAlertRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: EntityTtsAlertRule[] = [];
  for (const item of raw) {
    const r = item as Partial<EntityTtsAlertRule>;
    const entityId = String(r.entityId || '').trim();
    const messageTemplate = String(r.messageTemplate || '').trim();
    if (!entityId || !isExactEntityId(entityId) || !messageTemplate) continue;
    if (seen.has(entityId)) continue;
    seen.add(entityId);
    const stateTo = String(r.stateTo || '').trim();
    out.push({
      id: String(r.id || `entity_tts_${entityId}`).trim(),
      entityId,
      enabled: r.enabled !== false,
      ...(stateTo ? { stateTo } : {}),
      messageTemplate,
    });
  }
  return out;
}

/**
 * 判断某个 HA 实体状态变化事件是否命中给定的实体级 TTS 规则。
 *
 * @param entityId  发生变化的 HA entity_id
 * @param newState  变化后的新状态字符串
 * @param oldState  变化前的旧状态（可能 undefined，如首次上报）
 * @param rule      待匹配的实体级 TTS 规则
 * @returns 命中返回 true；未启用 / 实体不匹配 / 目标状态不匹配 / 状态未变化均返回 false
 */
export function matchEntityTtsAlert(
  entityId: string,
  newState: string,
  oldState: string | undefined,
  rule: EntityTtsAlertRule,
): boolean {
  if (!rule.enabled) return false;
  const id = rule.entityId?.trim();
  if (!id || entityId !== id) return false;
  const target = rule.stateTo?.trim();
  if (target && newState !== target) return false;
  if (oldState === newState) return false;
  return true;
}

/**
 * 规范化语音唤醒词列表（去重 + trim + 空过滤），空时回退默认「小智」。
 *
 * @param voice 可选的语音配置对象，含 wakeWords 字符串数组字段
 * @returns 非空去重后的唤醒词列表；若输入非法或为空数组 → ['小智']（永不返回空）
 */
export function normalizeWakeWords(voice?: { wakeWords?: string[] }): string[] {
  if (Array.isArray(voice?.wakeWords)) {
    const list = [...new Set(voice.wakeWords.map((s) => String(s).trim()).filter(Boolean))];
    if (list.length) return list;
  }
  return ['小智'];
}

/**
 * 将后端原始配置规范化为自定义 TTS 播报规则数组。
 *
 * @param raw 后端存储的未知格式原始值（期望数组，非数组直接返回空）
 * @returns 规范化后的 CustomTtsAlertRule 数组；空或非法输入返回空数组（永不 null/undefined）
 *
 * 规范化规则：
 *  - 非数组 → 空数组；
 *  - trigger 仅允许 'notification' / 'entity_state'，非法或缺失 → 'entity_state'；
 *  - messageTemplate 为空 → 整条丢弃（返回 null 后被 filter 去掉）；
 *  - entityMatch / stateTo / messageContains / sourceContains / notificationLevel 为空时不写入对象；
 *  - label 为空 → 回退为「自定义规则」；enabled 默认 true。
 */
export function normalizeCustomTtsAlerts(raw: unknown): CustomTtsAlertRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, idx): CustomTtsAlertRule | null => {
      const r = item as Partial<CustomTtsAlertRule>;
      const trigger = r.trigger === 'notification' ? 'notification' : 'entity_state';
      const messageTemplate = String(r.messageTemplate || '').trim();
      if (!messageTemplate) return null;
      const entityMatch = String(r.entityMatch || '').trim();
      const stateTo = String(r.stateTo || '').trim();
      const messageContains = String(r.messageContains || '').trim();
      const sourceContains = String(r.sourceContains || '').trim();
      return {
        id: String(r.id || `custom_${idx}_${Date.now()}`).trim(),
        label: String(r.label || '自定义规则').trim() || '自定义规则',
        enabled: r.enabled !== false,
        trigger,
        ...(entityMatch ? { entityMatch } : {}),
        ...(stateTo ? { stateTo } : {}),
        notificationLevel: (r.notificationLevel as CustomTtsAlertRule['notificationLevel']) || '',
        ...(messageContains ? { messageContains } : {}),
        ...(sourceContains ? { sourceContains } : {}),
        messageTemplate,
      };
    })
    .filter((x): x is CustomTtsAlertRule => x != null);
}
