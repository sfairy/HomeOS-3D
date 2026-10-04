/**
 * 家庭模式预设包与动作模板定义。
 *
 * 职责：声明家庭模式预设包（HOME_MODE_PRESETS）与动作模板（HOME_MODE_ACTION_TEMPLATES），
 *  供前端「一键安装」与「动作模板推荐」使用。预设包含实体键映射、触发器与动作序列，
 *  安装时由 actions.internals.buildHomeModePresetInstallPlan 应用实体覆盖后落库。
 *  另定义 ModeActionKind / ModeTrigger / HomeModePreset 等共享类型。
 */

/** 家庭模式动作类型：实体操作 / 场景 / 脚本 / 通知 / 安防布防 */
export type ModeActionKind = 'entity' | 'scene' | 'script' | 'notify' | 'security';

/** 家庭模式触发器配置 */
export interface ModeTrigger {
  /** 触发类型 */
  type: 'lock_unlock' | 'all_leave' | 'arrive_home' | 'time' | 'state' | 'manual' | 'calendar_away';
  /** 关联实体 ID（lock_unlock / state 类型使用） */
  entityId?: string;
  /** 触发时间（time 类型，HH:mm 格式） */
  at?: string;
  /** 期望的新状态（state 类型） */
  to?: string;
  /** 期望的旧状态（state 类型） */
  from?: string;
  /** 日历外出标记（calendar_away 类型） */
  calendarAway?: boolean;
  /** 是否启用（false 时跳过该触发器） */
  enabled?: boolean;
  /** 星期过滤（0=周日 … 6=周六），仅 time 触发器生效 */
  days?: number[];
}

export const HOME_MODE_ACTION_TEMPLATES = [
  {
    id: 'away_lights_off',
    label: '离家 · 关闭灯光',
    kind: 'entity' as ModeActionKind,
    domain: 'light',
    service: 'turn_off',
    placeholder: 'light.all 或选择分组',
  },
  {
    id: 'away_climate_off',
    label: '离家 · 关闭空调',
    kind: 'entity' as ModeActionKind,
    domain: 'climate',
    service: 'turn_off',
    placeholder: 'climate.all',
  },
  {
    id: 'home_lights_on',
    label: '回家 · 开玄关灯',
    kind: 'entity' as ModeActionKind,
    domain: 'light',
    service: 'turn_on',
    service_data: { brightness_pct: 80 },
    placeholder: 'light.entrance',
  },
  {
    id: 'sleep_scene',
    label: '睡眠 · 激活场景',
    kind: 'scene' as ModeActionKind,
    domain: 'scene',
    service: 'turn_on',
    placeholder: 'scene.sleep',
  },
  {
    id: 'notify_family',
    label: '通知 · 应用内提醒',
    kind: 'notify' as ModeActionKind,
    domain: 'notify',
    service: 'send_message',
    placeholder: '模式已切换',
  },
  {
    id: 'cleaning_vacuum_start',
    label: '清扫 · 启动扫地机',
    kind: 'entity' as ModeActionKind,
    domain: 'vacuum',
    service: 'start',
    placeholder: 'vacuum.robot',
  },
];

/** 预设实体键定义（用于安装时映射实际 entity_id） */
interface HomeModePresetEntityKey {
  /** 键名（与 action.key 对应） */
  key: string;
  /** 中文标签 */
  label: string;
  /** 占位实体 ID 提示 */
  placeholder: string;
}

/** 预设动作定义（安装时应用实体覆盖后转为 ModeAction） */
export interface HomeModePresetAction {
  /** 关联的实体键（用于覆盖映射） */
  key?: string;
  /** 动作类型 */
  kind?: ModeActionKind;
  /** 目标实体 ID（或预设占位） */
  entity_id: string;
  /** HA 域 */
  domain?: string;
  /** HA 服务 */
  service?: string;
  /** 服务数据 */
  service_data?: Record<string, unknown>;
  /** 执行延迟（毫秒） */
  delay?: number;
}

/** 家庭模式预设包（一键安装模板） */
export interface HomeModePreset {
  /** 预设 ID */
  id: string;
  /** 预设名称 */
  name: string;
  /** 图标 */
  icon: string;
  /** 描述 */
  description: string;
  /** 实体键定义列表 */
  entityKeys: HomeModePresetEntityKey[];
  /** 触发器列表 */
  triggers?: ModeTrigger[];
  /** 动作列表 */
  actions: HomeModePresetAction[];
  /** 同组模式互斥（切换时恢复快照） */
  exclusiveGroup?: string;
  /** 数值越大优先级越高 */
  priority?: number;
}

export const HOME_MODE_PRESETS: HomeModePreset[] = [
  {
    id: 'preset_home',
    name: '回家',
    icon: 'door-open',
    description: '开玄关灯、居家布防、舒适空调温度',
    entityKeys: [
      { key: 'entrance_light', label: '玄关灯', placeholder: 'light.entrance' },
      { key: 'climate', label: '空调（可选）', placeholder: 'climate.living_room' },
      { key: 'lock', label: '门锁触发（可选）', placeholder: 'lock.front_door' },
    ],
    triggers: [{ type: 'lock_unlock', entityId: 'lock.front_door' }],
    actions: [
      {
        key: 'entrance_light',
        kind: 'entity',
        entity_id: 'light.entrance',
        domain: 'light',
        service: 'turn_on',
        service_data: { brightness_pct: 80 },
      },
      { kind: 'security', entity_id: 'armed_home', domain: 'security', service: 'arm' },
      {
        key: 'climate',
        kind: 'entity',
        entity_id: 'climate.living_room',
        domain: 'climate',
        service: 'set_temperature',
        service_data: { temperature: 24 },
        delay: 500,
      },
    ],
  },
  {
    id: 'preset_away',
    name: '离家',
    icon: 'door-closed',
    description: '关灯、关空调、外出布防',
    entityKeys: [
      { key: 'lights', label: '灯光分组', placeholder: 'light.all' },
      { key: 'climate', label: '空调分组', placeholder: 'climate.all' },
    ],
    triggers: [{ type: 'all_leave' }],
    actions: [
      {
        key: 'lights',
        kind: 'entity',
        entity_id: 'light.all',
        domain: 'light',
        service: 'turn_off',
      },
      {
        key: 'climate',
        kind: 'entity',
        entity_id: 'climate.all',
        domain: 'climate',
        service: 'turn_off',
      },
      { kind: 'security', entity_id: 'armed_away', domain: 'security', service: 'arm' },
      { kind: 'notify', entity_id: '已切换离家模式', domain: 'notify', service: 'send_message' },
    ],
  },
  {
    id: 'preset_sleep',
    name: '睡眠',
    icon: 'moon',
    description: '关窗帘、睡眠场景、白噪音、夜间布防与勿扰提示',
    exclusiveGroup: 'comfort',
    priority: 80,
    entityKeys: [
      { key: 'curtains', label: '卧室窗帘（可选）', placeholder: 'cover.bedroom' },
      { key: 'sleep_scene', label: '睡眠场景', placeholder: 'scene.sleep' },
      { key: 'white_noise', label: '白噪音音箱（可选）', placeholder: 'media_player.bedroom' },
    ],
    triggers: [{ type: 'time', at: '22:30' }],
    actions: [
      {
        key: 'curtains',
        kind: 'entity',
        entity_id: 'cover.bedroom',
        domain: 'cover',
        service: 'close_cover',
      },
      {
        key: 'sleep_scene',
        kind: 'scene',
        entity_id: 'scene.sleep',
        domain: 'scene',
        service: 'turn_on',
        delay: 300,
      },
      {
        key: 'white_noise',
        kind: 'entity',
        entity_id: 'media_player.bedroom',
        domain: 'media_player',
        service: 'play_media',
        service_data: { media_content_id: 'white_noise', media_content_type: 'music' },
        delay: 500,
      },
      {
        kind: 'security',
        entity_id: 'armed_night',
        domain: 'security',
        service: 'arm',
        delay: 800,
      },
      {
        kind: 'notify',
        entity_id: '睡眠模式已启用，夜间布防已激活',
        domain: 'notify',
        service: 'send_message',
        delay: 1000,
      },
      {
        kind: 'notify',
        entity_id: '已进入睡眠勿扰模式，非紧急通知将静默',
        domain: 'notify',
        service: 'send_message',
        delay: 1200,
      },
    ],
  },
  {
    id: 'preset_cinema',
    name: '影院',
    icon: 'film',
    description: '关主灯、激活观影场景',
    exclusiveGroup: 'comfort',
    priority: 50,
    entityKeys: [
      { key: 'main_light', label: '主灯', placeholder: 'light.living_room' },
      { key: 'cinema_scene', label: '观影场景', placeholder: 'scene.cinema' },
    ],
    actions: [
      {
        key: 'main_light',
        kind: 'entity',
        entity_id: 'light.living_room',
        domain: 'light',
        service: 'turn_off',
      },
      {
        key: 'cinema_scene',
        kind: 'scene',
        entity_id: 'scene.cinema',
        domain: 'scene',
        service: 'turn_on',
        delay: 300,
      },
    ],
  },
  {
    id: 'preset_guest',
    name: '会客',
    icon: 'users',
    description: '会客灯光、通知家人',
    entityKeys: [{ key: 'guest_lights', label: '会客区灯光', placeholder: 'light.living_room' }],
    actions: [
      {
        key: 'guest_lights',
        kind: 'entity',
        entity_id: 'light.living_room',
        domain: 'light',
        service: 'turn_on',
        service_data: { brightness_pct: 70 },
      },
      { kind: 'notify', entity_id: '会客模式已启用', domain: 'notify', service: 'send_message' },
    ],
  },
  {
    id: 'preset_cleaning',
    name: '清扫中',
    icon: 'vacuum',
    description: '启动扫地机器人并通知家人',
    entityKeys: [{ key: 'vacuum', label: '扫地机', placeholder: 'vacuum.robot' }],
    actions: [
      {
        key: 'vacuum',
        kind: 'entity',
        entity_id: 'vacuum.robot',
        domain: 'vacuum',
        service: 'start',
      },
      {
        kind: 'notify',
        entity_id: '清扫模式已启用',
        domain: 'notify',
        service: 'send_message',
        delay: 300,
      },
    ],
  },
];
