/**
 * @file smart-advisor-events.helper.ts
 * @module awareness
 * @description 智能顾问事件处理 helper。将各类 HomeOS 事件（安防报警、紧急求助、
 * 房间上下文、离家、自动化、能耗异常、用水异常、霉菌风险、通知）转换为
 * TTS 播报与建议推送。所有函数纯逻辑、无状态，依赖通过 deps 注入。
 *
 * 依赖（SmartAdvisorEventsDeps）：
 * - appConfig / voiceAlertRules / voiceConfig：语音告警规则与配置。
 * - alertTemplates / customAlerts：TTS 模板与自定义告警。
 * - speakForRule / queueSpeak / pushTip：播报与建议出口。
 * - usage：SmartAdvisorUsageHelper，用于离家遗忘检测。
 * - roomLabel：房间标签解析。
 */
import { buildWaterValveAdvisorTip } from './smart-advisor-water.util';
import { AppConfigService } from '../../shared/app-config/service';
import type { RoomContextSnapshot } from '../security/presence/room-context.service';
import {
  applyAlertTemplate,
  buildSecurityAlarmSpeech,
  isVoiceAlertEnabled,
  matchCustomNotificationAlert,
  resolveAlertSpeech,
  resolveVoiceAlertRules,
  securityAlarmRuleKey,
  type VoiceAlertRuleKey,
  type VoiceAlertRules,
} from '../../common/alert-support/voice-alert.util';
import type { AppConfigData } from '../../shared/app-config/types';
import type { CustomTtsAlertRule } from '../../common/alert-support/voice-alert.util';
import type { SmartAdvisorUsageHelper } from './smart-advisor-usage.helper';

/** 智能顾问事件处理依赖注入接口 */
export interface SmartAdvisorEventsDeps {
  appConfig: AppConfigService;
  usage: SmartAdvisorUsageHelper;
  voiceAlertRules: () => VoiceAlertRules;
  voiceConfig: () => AppConfigData['voice'];
  alertTemplates: () => Record<string, string>;
  customAlerts: () => CustomTtsAlertRule[];
  speakForRule: (
    key: VoiceAlertRuleKey,
    defaultMsg: string,
    dedupKey: string,
    vars?: Record<string, string | number | undefined | null>,
    opts?: { bypassDnd?: boolean },
  ) => void;
  queueSpeak: (message: string, dedupKey: string, opts?: { bypassDnd?: boolean }) => void;
  pushTip: (title: string, message: string, category: string) => void;
  roomLabel: (room: string) => string;
}

/**
 * 处理安防报警事件：根据规则键与模板生成 TTS 播报。
 *
 * 烟雾、燃气泄漏、水浸类型 bypassDnd（绕过勿扰）。
 *
 * @param deps 依赖注入。
 * @param data 报警数据，含 type/friendlyName/zoneNames/entityId 等。
 */
export function handleAlarm(
  deps: SmartAdvisorEventsDeps,
  data: {
    friendlyName?: string;
    zoneNames?: string;
    type?: string;
    message?: string;
    entityId?: string;
    level?: string;
  },
) {
  const rules = deps.voiceAlertRules();
  const ruleKey = securityAlarmRuleKey(data);
  if (!ruleKey || !isVoiceAlertEnabled(rules, ruleKey)) return;
  const template = deps.alertTemplates()[ruleKey];
  const msg = buildSecurityAlarmSpeech(data, template);
  const bypassDnd = data.type === 'smoke' || data.type === 'gas_leak' || data.type === 'water_leak';
  if (msg) deps.queueSpeak(msg, `alarm_${data.type || data.entityId || 'generic'}`, { bypassDnd });
}

/**
 * 处理紧急求助事件：播报紧急求助已触发，始终 bypassDnd。
 *
 * @param deps 依赖注入。
 * @param data 含 action 字段（默认 'SOS'）。
 */
export function handleEmergency(deps: SmartAdvisorEventsDeps, data: { action?: string }) {
  deps.speakForRule(
    'securityEmergency',
    `紧急求助已触发：${data.action || 'SOS'}，请立即处理`,
    'security_emergency',
    { action: data.action || 'SOS' },
  );
}

/**
 * 处理房间上下文变化：房间从空到有人时推送舒适度建议。
 *
 * 内置 bedroom/living/kitchen/bathroom/study 五类房间提示文案，
 * 其他房间使用通用文案。
 *
 * @param deps 依赖注入。
 * @param payload 房间上下文快照，含 changedRoom。
 */
export function handleRoomContext(
  deps: SmartAdvisorEventsDeps,
  payload: RoomContextSnapshot & { changedRoom?: string },
) {
  const room = payload.changedRoom;
  if (!room) return;
  const entry = payload.rooms[room];
  if (!entry?.occupied) return;

  const hints: Record<string, { title: string; message: string }> = {
    bedroom: { title: '卧室舒适', message: '卧室已有人，建议空调设定 24–26°C 助眠' },
    living: { title: '客厅舒适', message: '客厅已有人，可开启节律照明或调至 26°C 节能' },
    kitchen: { title: '厨房提醒', message: '厨房已有人，烹饪后请确认燃气与灶具已关闭' },
    bathroom: { title: '卫浴提醒', message: '卫生间已有人，注意防滑与通风' },
    study: { title: '书房舒适', message: '书房已有人，建议色温 4500K 以上提升专注度' },
  };
  const hint = hints[room] ?? {
    title: `${deps.roomLabel(room)}舒适`,
    message: `${deps.roomLabel(room)}已有人，可检查温控与照明是否舒适`,
  };
  deps.pushTip(hint.title, hint.message, 'comfort');
}

/**
 * 处理全员离家事件：播报布防提示并检测遗忘设备。
 *
 * 根据 security.autoArmOnEveryoneLeft 决定文案（已自动布防 / 请检查门窗）。
 * 副作用：调用 usage.checkForgottenOnLeave()。
 *
 * @param deps 依赖注入。
 */
export function handleEveryoneLeft(deps: SmartAdvisorEventsDeps) {
  const autoArm = deps.appConfig.get('security').autoArmOnEveryoneLeft;
  deps.speakForRule(
    'presenceLeft',
    autoArm ? '所有家人已离家，系统已自动布防' : '所有家人已离家，请注意检查门窗',
    'presence_left',
  );
  deps.pushTip(
    '离家提醒',
    autoArm ? '记得检查门窗是否关闭' : '全员离家，可在安防面板手动布防',
    'security',
  );
  void deps.usage.checkForgottenOnLeave();
}

/**
 * 处理自动化执行事件：推送「自动化已执行」建议。
 *
 * @param deps 依赖注入。
 * @param data 含自动化名称。
 */
export function handleAutomation(deps: SmartAdvisorEventsDeps, data: { name?: string }) {
  if (data.name) {
    deps.pushTip('自动化执行', `"${data.name}" 已自动执行`, 'automation');
  }
}

/**
 * 处理能耗异常事件：播报设备功耗异常并推送节能建议。
 *
 * @param deps 依赖注入。
 * @param data 含 friendlyName / current / average。
 */
export function handleEnergyAnomaly(
  deps: SmartAdvisorEventsDeps,
  data: { friendlyName?: string; current?: number; average?: number },
) {
  const name = data.friendlyName || '设备';
  const cur = data.current ? `${data.current}W` : '';
  deps.speakForRule('energyAnomaly', `能源告警：${name} 当前功耗异常，请检查`, `energy_${name}`, {
    name,
    current: cur,
  });
  deps.pushTip('节能建议', `${name} 当前功耗 ${cur}，比平时偏高，建议检查`, 'energy');
}

/**
 * 处理能源预算告警事件：播报预算超支提示。
 *
 * @param deps 依赖注入。
 * @param data 含告警 message。
 */
export function handleEnergyBudget(deps: SmartAdvisorEventsDeps, data: { message?: string }) {
  deps.speakForRule(
    'energyBudget',
    `能源预算告警：${data.message || '本月用能预计超支'}`,
    'energy_budget',
    { message: data.message || '' },
  );
}

/**
 * 处理用水异常事件：播报持续水流或超阈值提示，并附加关阀建议。
 *
 * @param deps 依赖注入。
 * @param data 含 friendlyName / entityId / type / flowRate / totalUsage。
 */
export function handleWaterAnomaly(
  deps: SmartAdvisorEventsDeps,
  data: {
    friendlyName?: string;
    entityId?: string;
    type?: string;
    flowRate?: number;
    totalUsage?: number;
  },
) {
  const name = data.friendlyName || data.entityId || '水表';
  const detail =
    data.type === 'continuous_flow' ? `${name} 持续水流，疑似漏水` : `${name} 今日用水超出阈值`;
  deps.speakForRule('waterAnomaly', `用水告警：${detail}`, `water_${data.entityId || name}`, {
    name,
    entity_id: data.entityId || '',
    message: detail,
  });
  const valveTip = buildWaterValveAdvisorTip(
    deps.appConfig.get('water').mainValveEntityId,
    name,
    data.type,
  );
  if (valveTip) {
    deps.pushTip(valveTip.title, valveTip.message, valveTip.category);
  }
}

/**
 * 处理霉菌风险事件：播报房间霉菌风险提示。
 *
 * @param deps 依赖注入。
 * @param data 含 roomId / message。
 */
export function handleMoldRisk(
  deps: SmartAdvisorEventsDeps,
  data: { roomId?: string; message?: string },
) {
  const room = data.roomId || '环境';
  deps.speakForRule(
    'envMoldRisk',
    `${room}霉菌风险偏高：${data.message || '请注意通风除湿'}`,
    `mold_${room}`,
    { room, message: data.message || '' },
  );
}

/**
 * 处理通知事件：根据 level（danger/warn）与 channels 决定是否 TTS 播报。
 *
 * 跳过规则：
 * - emergency 来源（已有专用 TTS）。
 * - security 来源（已有 handleAlarm）。
 * - hazard 来源（不走通用 TTS）。
 * - channels 不含 tts。
 *
 * 同时匹配自定义告警规则并播报。
 *
 * @param deps 依赖注入。
 * @param data 含 level / message / source / channels。
 */
export function handleNotification(
  deps: SmartAdvisorEventsDeps,
  data: { level?: string; message?: string; source?: string; channels?: string[] },
) {
  const channels = data.channels?.length ? data.channels : ['in_app', 'socket', 'tts'];
  if (!channels.includes('tts')) return;
  // 紧急求助已有专用 TTS 规则，避免与 notificationDanger 重复播报
  if (data.source === 'emergency') return;
  // 安防/危险传感器已有专用 TTS 规则（handleAlarm），避免重复播报
  if (data.source === 'security') return;
  // 危险传感器场景失败等 hazard 来源通知不走通用 TTS
  if (data.source === 'hazard') return;
  const rules = deps.voiceAlertRules();
  const level = data.level;
  const allow =
    (level === 'danger' && isVoiceAlertEnabled(rules, 'notificationDanger')) ||
    (level === 'warn' && isVoiceAlertEnabled(rules, 'notificationWarn'));
  if (allow) {
    const key: VoiceAlertRuleKey = level === 'warn' ? 'notificationWarn' : 'notificationDanger';
    const msg = resolveAlertSpeech(key, data.message || '通知提醒', deps.alertTemplates(), {
      message: data.message || '',
      level: level || '',
      source: data.source || '',
    });
    deps.queueSpeak(msg, `notif:${level}:${msg}`, { bypassDnd: level === 'danger' });
  }
  if (!resolveVoiceAlertRules(deps.voiceConfig()).enabled) return;
  for (const rule of deps.customAlerts()) {
    if (!matchCustomNotificationAlert(data, rule)) continue;
    const msg = applyAlertTemplate(rule.messageTemplate, {
      message: data.message || '',
      level: data.level || '',
      source: data.source || '',
    });
    if (msg) {
      deps.queueSpeak(msg, `custom_notif:${rule.id}`, { bypassDnd: data.level === 'danger' });
    }
  }
}
