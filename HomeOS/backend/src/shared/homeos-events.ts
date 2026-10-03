/**
 * 所属模块：backend/shared
 * 职责：
 *  - 跨域事件总线（桥接集合+主题）；
 * 关键依赖：
 *  - eventemitter2；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { HA_EVENTS } from './types';

/** 应用内事件名（含 HA 生命周期） */
export const HOMEOS_EVENTS = {
  ...HA_EVENTS,
  APP_CONFIG_UPDATED: 'app.config.updated',
  SYSTEM_CONFIG_UPDATED: 'SYSTEM_CONFIG_UPDATED',
  LAYOUT_CONFIG_UPDATED: 'layout.config.updated',
  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_SEND: 'notification.homeos.send',
  HOME_MODE_ACTIVATE_REQUEST: 'homeMode.activate.request',
  HOME_MODE_ACTIVATED: 'homeMode.activated',
  HOME_MODE_DEACTIVATED: 'homeMode.deactivated',
  COOLDOWN_SET: 'cooldown.set',
  AUTOMATION_EXECUTED: 'automation.executed',
  AUTOMATION_COMPLETED: 'automation.completed',
  AUTOMATION_FAILED: 'automation.failed',
  AUTOMATION_DROPPED: 'automation.dropped',
  SCENE_EXECUTED: 'scene.executed',
  SECURITY_PANEL_SET_MODE: 'security.panel.setMode',
  SECURITY_PANEL_REQUEST_SET_MODE: 'security.panel.setMode.request',
  SECURITY_MODE_CHANGED: 'security.modeChanged',
  SECURITY_ZONES_CONFIGURED: 'security.zonesConfigured',
  SECURITY_ALARM: 'security.alarm',
  SECURITY_EMERGENCY: 'security.emergency',
  SECURITY_EMERGENCY_COMPLETED: 'security.emergencyCompleted',
  SECURITY_AWAY_SIMULATION: 'security.awaySimulation',
  PRESENCE_CHANGED: 'presence.changed',
  PRESENCE_EVERYONE_LEFT: 'presence.everyoneLeft',
  PRESENCE_ROOM_CHANGED: 'presence.roomChanged',
  ROOM_CONTEXT: 'room.context',
  AREA_UPDATED: 'area.updated',
  ENERGY_ANOMALY: 'energy.anomaly',
  ENERGY_BUDGET_EXCEEDED: 'energy.budgetExceeded',
  WATER_ANOMALY: 'water.anomaly',
  ENV_MOLD_RISK: 'env.moldRisk',
  ENV_IAQ_THRESHOLD: 'env.iaqThreshold',
  ADVISOR_TIP: 'advisor.tip',
  TTS_SPEAK: 'tts.speak',
  FRIGATE_DETECTION: 'frigate.detection',
  CHILD_MODE_CHANGED: 'childMode.changed',
  CHILD_MODE_BLOCKED: 'childMode.blocked',
  CHILD_MODE_OVERRIDE: 'childMode.override',
  CHILD_MODE_MEDIA_LIMIT: 'childMode.mediaLimitReached',
  CALENDAR_AWAY_CHANGED: 'calendar.awayChanged',
  SCHEDULE_REMINDER: 'schedule.reminder',
  GUEST_PASS_CREATED: 'guest.passCreated',
  GUEST_PASS_REVOKED: 'guest.passRevoked',
  GUEST_PASS_EXTENDED: 'guest.passExtended',
  CLIENT_POWER_REPORTED: 'clientPower.reported',
  CLIENT_POWER_LOW: 'clientPower.low',
  CLIENT_POWER_CHARGED: 'clientPower.charged',
  CLIENT_POWER_LINKAGE_FAILED: 'clientPower.linkageFailed',
  EARTHQUAKE_ALERT: 'earthquake.alert',
  WEATHER_ALERT: 'weather.alert',
} as const;

/** 文档化事件目录（供 IDE / 测试校验） */
const HOMEOS_EVENT_CATALOG: Array<{
  name: string;
  bridged: boolean;
  description: string;
}> = [
  { name: HA_EVENTS.STATE_CHANGED, bridged: false, description: 'HA 实体状态变更（仅本进程；跨副本走 BATCH）' },
  {
    name: HA_EVENTS.STATE_CHANGED_BATCH,
    bridged: true,
    description: 'HA 实体状态变更（Ingress 合并批次；跨副本状态同步）',
  },
  {
    name: HA_EVENTS.STATE_CHANGED_COLD_BATCH,
    bridged: false,
    description: 'HA 状态冷路径批次（副作用消费者）',
  },
  { name: HA_EVENTS.INITIAL_STATES, bridged: true, description: 'HA 全量状态同步' },
  { name: HA_EVENTS.CONNECTED, bridged: true, description: 'HA WebSocket 已连接' },
  { name: HA_EVENTS.DISCONNECTED, bridged: true, description: 'HA WebSocket 断开' },
  { name: HA_EVENTS.RECONNECTING, bridged: true, description: 'HA 重连中' },
  { name: HA_EVENTS.REDIS_STATUS, bridged: true, description: 'Redis 连接状态' },
  { name: HOMEOS_EVENTS.APP_CONFIG_UPDATED, bridged: true, description: '系统配置分区已更新（跨副本 peer reload）' },
  { name: HOMEOS_EVENTS.NOTIFICATION_CREATED, bridged: true, description: '应用内通知已创建' },
  {
    name: HOMEOS_EVENTS.HOME_MODE_ACTIVATE_REQUEST,
    bridged: false,
    description: '请求激活家庭模式',
  },
  { name: HOMEOS_EVENTS.HOME_MODE_ACTIVATED, bridged: true, description: '家庭模式已激活' },
  { name: HOMEOS_EVENTS.HOME_MODE_DEACTIVATED, bridged: true, description: '家庭模式已停用' },
  { name: HOMEOS_EVENTS.AUTOMATION_EXECUTED, bridged: true, description: '自动化执行完成' },
  {
    name: HOMEOS_EVENTS.AUTOMATION_COMPLETED,
    bridged: false,
    description: '自动化执行成功（DAG 链路触发，仅 Leader 进程派发）',
  },
  { name: HOMEOS_EVENTS.AUTOMATION_FAILED, bridged: true, description: '自动化执行失败' },
  { name: HOMEOS_EVENTS.AUTOMATION_DROPPED, bridged: true, description: '自动化触发被丢弃（并发超限）' },
  { name: HOMEOS_EVENTS.SCENE_EXECUTED, bridged: true, description: '场景执行完成' },
  { name: HOMEOS_EVENTS.SECURITY_MODE_CHANGED, bridged: true, description: '安防模式变更' },
  { name: HOMEOS_EVENTS.SECURITY_ZONES_CONFIGURED, bridged: true, description: '安防区域配置变更' },
  {
    name: HOMEOS_EVENTS.SECURITY_PANEL_REQUEST_SET_MODE,
    bridged: true,
    description: '安防布防/撤防请求（Follower 转发至 Leader 执行）',
  },
  { name: HOMEOS_EVENTS.SECURITY_ALARM, bridged: true, description: '安防告警' },
  { name: HOMEOS_EVENTS.SECURITY_EMERGENCY, bridged: true, description: '紧急求助' },
  { name: HOMEOS_EVENTS.SECURITY_EMERGENCY_COMPLETED, bridged: true, description: '紧急求助结束' },
  { name: HOMEOS_EVENTS.SECURITY_AWAY_SIMULATION, bridged: true, description: '离家模拟启停（跨实例同步运行态）' },
  { name: HOMEOS_EVENTS.PRESENCE_CHANGED, bridged: true, description: '人员到家/离家' },
  { name: HOMEOS_EVENTS.PRESENCE_EVERYONE_LEFT, bridged: true, description: '全员离家' },
  { name: HOMEOS_EVENTS.PRESENCE_ROOM_CHANGED, bridged: true, description: '房间占用变化' },
  { name: HOMEOS_EVENTS.ENERGY_ANOMALY, bridged: true, description: '用电异常' },
  { name: HOMEOS_EVENTS.ENERGY_BUDGET_EXCEEDED, bridged: false, description: '能源预算超支' },
  { name: HOMEOS_EVENTS.WATER_ANOMALY, bridged: false, description: '用水异常' },
  { name: HOMEOS_EVENTS.ENV_MOLD_RISK, bridged: false, description: '霉菌风险' },
  { name: HOMEOS_EVENTS.ENV_IAQ_THRESHOLD, bridged: false, description: 'IAQ 超阈值' },
  { name: HOMEOS_EVENTS.ADVISOR_TIP, bridged: false, description: '智能顾问提示' },
  { name: HOMEOS_EVENTS.TTS_SPEAK, bridged: false, description: 'TTS 播报请求' },
  { name: HOMEOS_EVENTS.FRIGATE_DETECTION, bridged: true, description: 'Frigate 检测' },
  { name: HOMEOS_EVENTS.CHILD_MODE_CHANGED, bridged: true, description: '儿童模式开关' },
  { name: HOMEOS_EVENTS.CHILD_MODE_BLOCKED, bridged: true, description: '儿童模式拦截控制' },
  { name: HOMEOS_EVENTS.ROOM_CONTEXT, bridged: true, description: '房间上下文' },
  { name: HOMEOS_EVENTS.COOLDOWN_SET, bridged: true, description: '通知/联动冷却设置（跨实例同步 L1 缓存）' },
  { name: HOMEOS_EVENTS.AREA_UPDATED, bridged: false, description: 'DB 房间目录已更新' },
  { name: HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, bridged: true, description: 'UI 布局配置已更新' },
  { name: HOMEOS_EVENTS.CLIENT_POWER_REPORTED, bridged: true, description: '客户端电量已上报' },
  { name: HOMEOS_EVENTS.CLIENT_POWER_LOW, bridged: true, description: '客户端电量过低' },
  { name: HOMEOS_EVENTS.CLIENT_POWER_CHARGED, bridged: true, description: '客户端电量已充满' },
  {
    name: HOMEOS_EVENTS.CLIENT_POWER_LINKAGE_FAILED,
    bridged: false,
    description: '客户端电量联动失败',
  },
  { name: HOMEOS_EVENTS.EARTHQUAKE_ALERT, bridged: true, description: '地震预警 (EEW) 告警' },
  { name: HOMEOS_EVENTS.WEATHER_ALERT, bridged: true, description: '天气预警推送' },
];

/** 返回需桥接的事件名称集合（bridged=true 的事件子集）。 */
export function getBridgedEventSet(): ReadonlySet<string> {
  return new Set(HOMEOS_EVENT_CATALOG.filter((e) => e.bridged).map((e) => e.name));
}
