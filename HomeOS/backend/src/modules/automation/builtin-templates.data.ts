/**
 * 自动化内置模板数据（YAML + 可选 geekGraph）。
 *
 * 所属模块：backend/modules/automation
 * 职责：从 AutomationService 抽出内置模板常量，便于一致性回归测试与控制器按需引用。
 *  模板包含日常节能、安防、人感、浇水、暴雨、烟感、燃气等高频联动场景。
 * 依赖：被 AutomationService / 控制器 / 测试引用。
 */

/** 内置自动化模板结构：YAML 字符串 + 可选的画布 geekGraph 形态 */
type AutomationBuiltinTemplate = {
  /** 模板 ID（唯一，作为安装时的去重 key） */
  id: string;
  /** 模板名称，用于安装界面展示 */
  name: string;
  /** 模板描述，说明适用场景与替换提示 */
  description: string;
  /** 自动化 YAML 文本，含 placeholder 占位符 */
  yaml: string;
  /** 可选：geekGraph 画布数据（与 YAML 同义的图形化表达），用于画布模式回显 */
  geekGraph?: Record<string, unknown>;
};

/**
 * AUTOMATION_BUILTIN_TEMPLATES：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：可能被模板字符串动态访问，重命名需全仓检索
 */
export const AUTOMATION_BUILTIN_TEMPLATES: AutomationBuiltinTemplate[] = [
    {
      id: 'lights_off_at_midnight',
      name: '午夜自动关灯',
      description: '每天 23:30 自动关闭所有灯光',
      yaml: 'triggers:\n  - platform: time\n    at: "23:30"\nconditions:\n  - condition: state\n    entity_id: binary_sensor.home_empty\n    state: "off"\nactions:\n  - service: light.turn_off\n    entity_id: light.all\n  - service: switch.turn_off\n    entity_id: switch.all',
    },
    {
      id: 'away_mode_climate',
      name: '离家自动节能',
      description: '所有人离家时自动关闭空调/暖气',
      yaml: 'triggers:\n  - platform: event\n    event_type: presence.everyoneLeft\nconditions: []\nactions:\n  - service: climate.turn_off\n    entity_id: climate.all\n  - service: light.turn_off\n    entity_id: light.all\n  - service: alarm_control_panel.alarm_arm_away\n    entity_id: alarm_control_panel.home',
    },
    {
      id: 'motion_light',
      name: '人来灯亮',
      description: '人体传感器检测到移动时自动开灯',
      yaml: 'triggers:\n  - platform: state\n    entity_id: binary_sensor.motion_placeholder\n    to: "on"\n    for: "0:00:01"\nconditions:\n  - condition: sun\n    after: sunset\n    after_offset: "-00:30"\nactions:\n  - service: light.turn_on\n    entity_id: light.placeholder\n    data:\n      brightness_pct: 80\n  - delay: "0:05:00"\n  - service: light.turn_off\n    entity_id: light.placeholder',
    },
    {
      id: 'leak_protection',
      name: '漏水保护',
      description: '水浸传感器触发时自动关闭水阀',
      yaml: 'triggers:\n  - platform: state\n    entity_id: binary_sensor.leak_placeholder\n    to: "on"\nconditions: []\nactions:\n  - service: valve.turn_off\n    entity_id: valve.water_main\n  - service: notify.push\n    data:\n      message: "🚨 检测到漏水！水阀已自动关闭"',
    },
    {
      id: 'sunset_curtain',
      name: '日落关窗帘',
      description: '日落时自动关闭所有窗帘',
      yaml: 'triggers:\n  - platform: sun\n    event: sunset\n    offset: "0:00:00"\nconditions: []\nactions:\n  - service: cover.close_cover\n    entity_id: cover.all',
    },
    {
      id: 'night_mode',
      name: '晚安模式',
      description: '22:00 自动切换到睡眠模式',
      yaml: 'triggers:\n  - platform: time\n    at: "22:00"\nconditions:\n  - condition: state\n    entity_id: binary_sensor.sleeping\n    state: "off"\nactions:\n  - service: light.turn_off\n    entity_id: light.all\n  - service: climate.set_temperature\n    entity_id: climate.bedroom\n    data:\n      temperature: 26\n  - service: alarm_control_panel.alarm_arm_night\n    entity_id: alarm_control_panel.home',
    },
    {
      id: 'window_open_ac_off',
      name: '开窗关空调',
      description: '窗户打开时自动关闭同房间空调',
      yaml: 'triggers:\n  - platform: state\n    entity_id: binary_sensor.window_placeholder\n    to: "on"\nconditions:\n  - condition: state\n    entity_id: climate.placeholder\n    state: "cool"\nactions:\n  - service: climate.turn_off\n    entity_id: climate.placeholder',
    },
    {
      id: 'high_temp_alert',
      name: '高温开窗提醒',
      description: '室内温度过高时 TTS 提醒开窗通风',
      yaml: 'triggers:\n  - platform: numeric_state\n    entity_id: sensor.indoor_temp_placeholder\n    above: 28\n    for: "0:10:00"\nconditions:\n  - condition: state\n    entity_id: binary_sensor.window_placeholder\n    state: "off"\nactions:\n  - service: notify.homeos\n    data:\n      message: "室内温度偏高，建议开窗通风"',
    },
    {
      id: 'garage_door_reminder',
      name: '车库门未关提醒',
      description: '车库门开启超过 10 分钟发送提醒',
      yaml: 'triggers:\n  - platform: state\n    entity_id: cover.garage_placeholder\n    to: "open"\n    for: "0:10:00"\nconditions: []\nactions:\n  - service: notify.homeos\n    data:\n      message: "车库门已开启超过 10 分钟，请检查"',
    },
    {
      id: 'irrigation_morning',
      name: '定时浇花',
      description: '每天早晨 6:30 触发浇灌服务（请替换 entity_id；可用 input_boolean.weather_irrigate_lock 作恶劣天气拦截）',
      yaml: 'triggers:\n  - platform: time\n    at: "06:30"\nconditions:\n  - condition: state\n    entity_id: binary_sensor.rain_placeholder\n    state: "off"\n  - condition: state\n    entity_id: input_boolean.weather_irrigate_lock\n    state: "off"\nactions:\n  - service: switch.turn_on\n    entity_id: switch.irrigation_placeholder\n  - delay: "0:15:00"\n  - service: switch.turn_off\n    entity_id: switch.irrigation_placeholder',
    },
    {
      id: 'storm_close_covers',
      name: '暴雨关窗',
      description: '天气实体进入 pouring/rainy 时关闭窗帘（请替换 cover 实体）',
      yaml: 'triggers:\n  - platform: state\n    entity_id: weather.home\n    to:\n      - pouring\n      - rainy\nconditions: []\nactions:\n  - service: cover.close_cover\n    entity_id: cover.all\n  - service: notify.homeos\n    data:\n      message: "检测到降雨，已关闭窗帘"',
    },
    {
      id: 'thunderstorm_notify',
      name: '雷暴通知',
      description: '天气实体进入雷暴状态时发送 HomeOS 通知',
      yaml: 'triggers:\n  - platform: state\n    entity_id: weather.home\n    to:\n      - lightning\n      - lightning-rainy\nconditions: []\nactions:\n  - service: notify.homeos\n    data:\n      message: "雷暴预警，请关窗并远离电器"',
    },
    {
      id: 'smoke_emergency',
      name: '烟感紧急联动',
      description: '烟感触发时全屋开灯并播报',
      yaml: 'triggers:\n  - platform: state\n    entity_id: binary_sensor.smoke_placeholder\n    to: "on"\nconditions: []\nactions:\n  - service: light.turn_on\n    entity_id: light.all\n    data:\n      brightness_pct: 100\n  - service: notify.homeos\n    data:\n      message: "⚠️ 烟感告警！请立即检查"',
    },
    {
      id: 'arrive_home_welcome',
      name: '回家欢迎',
      description: '有人到家时打开玄关灯',
      yaml: 'triggers:\n  - platform: event\n    event_type: presence.changed\n    event_data:\n      atHome: true\nconditions:\n  - condition: sun\n    after: sunset\nactions:\n  - service: light.turn_on\n    entity_id: light.entrance_placeholder\n    data:\n      brightness_pct: 70',
    },
    {
      id: 'zone_enter_home',
      name: '进入家区域',
      description: 'person 进入 home 区域时打开玄关灯（本地引擎 zone 触发）',
      yaml: 'triggers:\n  - platform: zone\n    entity_id: person.placeholder\n    zone: zone.home\n    event: enter\nconditions: []\nactions:\n  - service: light.turn_on\n    entity_id: light.entrance_placeholder\n    data:\n      brightness_pct: 70',
    },
    {
      id: 'gas_leak_emergency',
      name: '燃气泄漏紧急联动',
      description: '燃气传感器触发时关阀、开排风并全屋播报',
      yaml: 'triggers:\n  - platform: state\n    entity_id: binary_sensor.gas_placeholder\n    to: "on"\nconditions: []\nactions:\n  - service: valve.turn_off\n    entity_id: valve.gas_main\n  - service: fan.turn_on\n    entity_id: fan.kitchen_hood\n  - service: notify.homeos\n    data:\n      message: "🚨 燃气泄漏告警！请立即通风并撤离"',
    },
    {
      id: 'humidity_dehumidifier',
      name: '高湿除湿',
      description: '湿度超过 70% 自动开启除湿机',
      yaml: 'triggers:\n  - platform: numeric_state\n    entity_id: sensor.humidity_placeholder\n    above: 70\n    for: "0:05:00"\nconditions: []\nactions:\n  - service: switch.turn_on\n    entity_id: switch.dehumidifier_placeholder',
    },
    {
      id: 'vacuum_scheduled',
      name: '定时清扫',
      description: '工作日 10:00 启动扫地机器人',
      yaml: 'triggers:\n  - platform: time\n    at: "10:00"\nconditions:\n  - condition: time\n    weekday:\n      - mon\n      - tue\n      - wed\n      - thu\n      - fri\nactions:\n  - service: vacuum.start\n    entity_id: vacuum.robot_placeholder',
    },
    {
      id: 'geek_occupancy_illuminance',
      name: '人在且昏暗开灯',
      description: '人体有人 + 照度偏低时开灯（双条件）',
      yaml:
        '# homeos_meta: {"triggerLogic":"or","triggerAndTimeout":60}\nalias: 人在且昏暗开灯\nmode: single\n\ntrigger:\n  - platform: state\n    entity_id: binary_sensor.motion_placeholder\n    to: "on"\n\ncondition:\n  - condition: numeric_state\n    entity_id: sensor.illuminance_placeholder\n    below: 50\n\naction:\n  - service: light.turn_on\n    target:\n      entity_id: light.placeholder\n    data:\n      brightness_pct: 60',
      geekGraph: {
        version: 1,
        name: '人在且昏暗开灯',
        mode: 'single',
        triggerLogic: 'or',
        triggerAndTimeout: 60,
        condRootLogic: 'and',
        triggers: [
          {
            type: 'state',
            entityId: 'binary_sensor.motion_placeholder',
            stateFrom: '',
            stateTo: 'on',
            forSeconds: '',
            at: '',
            sunEvent: '',
            sunOffset: 0,
            numOp: '',
            numValue: '',
            haEvent: '',
            eventType: '',
            eventDataKey: '',
            eventDataVal: '',
            zoneId: '',
            zoneEvent: '',
            calendarEvent: '',
          },
        ],
        conditions: [
          {
            operator: 'lt',
            entityId: 'sensor.illuminance_placeholder',
            state: '50',
          },
        ],
        actions: [
          {
            type: 'callService',
            domain: 'light',
            service: 'turn_on',
            entityId: 'light.placeholder',
            data: '{"brightness_pct":60}',
          },
        ],
      },
    },
    {
      id: 'geek_var_counter_limit',
      name: '变量限次通知',
      description: '触发后自增计数变量，最多通知 3 次（第 4 次起跳过）',
      yaml:
        '# homeos_meta: {"triggerLogic":"or","triggerAndTimeout":60}\nalias: 变量限次通知\nmode: single\n\ntrigger:\n  - platform: state\n    entity_id: binary_sensor.alert_placeholder\n    to: "on"\n\ncondition:\n  - condition: homeos_variable\n    key: alert_count\n    operator: "<"\n    value: "3"\n\naction:\n  - service: homeos.variable_set\n    data:\n      key: alert_count\n      scope: global\n      op: add\n      type: number\n      value: 1\n  - event: notification.homeos.send\n    event_data:\n      message: "告警通知（未超限）"',
      geekGraph: {
        version: 1,
        name: '变量限次通知',
        mode: 'single',
        triggerLogic: 'or',
        triggerAndTimeout: 60,
        condRootLogic: 'and',
        triggers: [
          {
            type: 'state',
            entityId: 'binary_sensor.alert_placeholder',
            stateFrom: '',
            stateTo: 'on',
            forSeconds: '',
            at: '',
            sunEvent: '',
            sunOffset: 0,
            numOp: '',
            numValue: '',
            haEvent: '',
            eventType: '',
            eventDataKey: '',
            eventDataVal: '',
            zoneId: '',
            zoneEvent: '',
            calendarEvent: '',
          },
        ],
        conditions: [
          {
            operator: 'var_lt',
            varKey: 'alert_count',
            state: '3',
          },
        ],
        actions: [
          {
            type: 'variable_set',
            varKey: 'alert_count',
            varScope: 'global',
            varOp: 'add',
            varType: 'number',
            varValue: '1',
          },
          {
            type: 'notify_homeos',
            notifyMsg: '告警通知（未超限）',
          },
        ],
      },
    },
    {
      id: 'geek_only_n_times',
      name: '最多执行 N 次',
      description: '用变量计数，达到上限后不再执行动作（需先创建全局变量 run_count=0）',
      yaml:
        '# homeos_meta: {"triggerLogic":"or","triggerAndTimeout":60}\nalias: 最多执行N次\nmode: single\n\ntrigger:\n  - platform: state\n    entity_id: binary_sensor.trigger_placeholder\n    to: "on"\n\ncondition:\n  - condition: homeos_variable\n    key: run_count\n    operator: "<"\n    value: "5"\n\naction:\n  - service: homeos.variable_set\n    data:\n      key: run_count\n      scope: global\n      op: add\n      type: number\n      value: 1\n  - service: light.turn_on\n    target:\n      entity_id: light.placeholder',
      geekGraph: {
        version: 1,
        name: '最多执行N次',
        mode: 'single',
        triggerLogic: 'or',
        triggerAndTimeout: 60,
        condRootLogic: 'and',
        triggers: [
          {
            type: 'state',
            entityId: 'binary_sensor.trigger_placeholder',
            stateFrom: '',
            stateTo: 'on',
            forSeconds: '',
            at: '',
            sunEvent: '',
            sunOffset: 0,
            numOp: '',
            numValue: '',
            haEvent: '',
            eventType: '',
            eventDataKey: '',
            eventDataVal: '',
            zoneId: '',
            zoneEvent: '',
            calendarEvent: '',
          },
        ],
        conditions: [
          {
            operator: 'var_lt',
            varKey: 'run_count',
            state: '5',
          },
        ],
        actions: [
          {
            type: 'variable_set',
            varKey: 'run_count',
            varScope: 'global',
            varOp: 'add',
            varType: 'number',
            varValue: '1',
          },
          {
            type: 'callService',
            domain: 'light',
            service: 'turn_on',
            entityId: 'light.placeholder',
          },
        ],
      },
    },
    {
      id: 'geek_sequence_door_then_motion',
      name: '先开门后有人',
      description: '门开后 60 秒内检测到运动再开灯（事件序列）',
      yaml:
        '# homeos_meta: {"triggerLogic":"or","triggerAndTimeout":60}\nalias: 先开门后有人\nmode: restart\n\ntrigger:\n  - platform: state\n    entity_id: binary_sensor.door_placeholder\n    to: "on"\n\ncondition: []\n\naction:\n  - wait_for_trigger:\n      - platform: state\n        entity_id: binary_sensor.motion_placeholder\n        to: "on"\n    timeout: 00:01:00\n    continue_on_timeout: false\n  - service: light.turn_on\n    target:\n      entity_id: light.placeholder',
      geekGraph: {
        version: 1,
        name: '先开门后有人',
        mode: 'restart',
        triggerLogic: 'or',
        triggerAndTimeout: 60,
        condRootLogic: 'and',
        triggers: [
          {
            type: 'sequence',
            entityId: '',
            stateFrom: '',
            stateTo: '',
            forSeconds: '',
            at: '',
            sunEvent: '',
            sunOffset: 0,
            numOp: '',
            numValue: '',
            haEvent: '',
            eventType: '',
            eventDataKey: '',
            eventDataVal: '',
            zoneId: '',
            zoneEvent: '',
            calendarEvent: '',
            sequenceTimeout: 60,
            sequenceSteps: [
              {
                type: 'state',
                entityId: 'binary_sensor.door_placeholder',
                stateFrom: '',
                stateTo: 'on',
                forSeconds: '',
                at: '',
                sunEvent: '',
                sunOffset: 0,
                numOp: '',
                numValue: '',
                haEvent: '',
                eventType: '',
                eventDataKey: '',
                eventDataVal: '',
                zoneId: '',
                zoneEvent: '',
                calendarEvent: '',
              },
              {
                type: 'state',
                entityId: 'binary_sensor.motion_placeholder',
                stateFrom: '',
                stateTo: 'on',
                forSeconds: '',
                at: '',
                sunEvent: '',
                sunOffset: 0,
                numOp: '',
                numValue: '',
                haEvent: '',
                eventType: '',
                eventDataKey: '',
                eventDataVal: '',
                zoneId: '',
                zoneEvent: '',
                calendarEvent: '',
              },
            ],
          },
        ],
        conditions: [],
        actions: [
          {
            type: 'callService',
            domain: 'light',
            service: 'turn_on',
            entityId: 'light.placeholder',
          },
        ],
      },
    },
    {
      id: 'geek_device_to_var',
      name: '设备触发→写变量',
      description: '传感器状态变化时把当前值写入持久变量',
      yaml:
        '# homeos_meta: {"triggerLogic":"or","triggerAndTimeout":60}\nalias: 设备触发→写变量\nmode: single\n\ntrigger:\n  - platform: state\n    entity_id: sensor.temp_placeholder\n\ncondition: []\n\naction:\n  - service: homeos.variable_set\n    data:\n      key: last_temp\n      scope: global\n      op: set\n      type: number\n      source_entity_id: sensor.temp_placeholder\n  - event: notification.homeos.send\n    event_data:\n      message: "已把传感器值写入变量 last_temp"',
      geekGraph: {
        version: 1,
        name: '设备触发→写变量',
        mode: 'single',
        triggerLogic: 'or',
        triggerAndTimeout: 60,
        condRootLogic: 'and',
        triggers: [
          {
            type: 'state',
            entityId: 'sensor.temp_placeholder',
            stateFrom: '',
            stateTo: 'any',
            forSeconds: '',
            at: '',
            sunEvent: '',
            sunOffset: 0,
            numOp: '',
            numValue: '',
            haEvent: '',
            eventType: '',
            eventDataKey: '',
            eventDataVal: '',
            zoneId: '',
            zoneEvent: '',
            calendarEvent: '',
          },
        ],
        conditions: [],
        actions: [
          {
            type: 'variable_set',
            varKey: 'last_temp',
            varScope: 'global',
            varOp: 'set',
            varType: 'number',
            varSourceEntityId: 'sensor.temp_placeholder',
            varSourceAttribute: '',
          },
          {
            type: 'notify_homeos',
            notifyMsg: '已把传感器值写入变量 last_temp',
          },
        ],
      },
    },
    {
      // 电价低谷时段条件：默认 23:00-07:00（可在能源设置-峰谷电价中调整后同步修改本条件）
      // 安装后请将 switch.high_power_appliance_placeholder 替换为实际大功率设备（如热水器/充电桩）
      id: 'valley_start_high_power_appliance',
      name: '低谷自动启动大功率设备',
      description: '电价低谷时段自动开启大功率设备（如热水器/充电桩），请在能源设置中核对峰谷时段',
      yaml: 'triggers:\n  - platform: time\n    at: "23:00"\nconditions:\n  - condition: time\n    after: "23:00"\n    before: "07:00"\nactions:\n  - service: switch.turn_on\n    entity_id: switch.high_power_appliance_placeholder',
    },
    {
      // 高峰时段条件：默认 08:00-22:00（可在能源设置-峰谷电价中调整后同步修改本条件）
      // 安装后请将 switch.noncritical_devices_placeholder 替换为实际非关键设备
      id: 'peak_off_noncritical_devices',
      name: '高峰关断非关键设备',
      description: '高峰电价时段自动关闭非关键设备（如装饰灯/待机电器），降低用电成本',
      yaml: 'triggers:\n  - platform: time\n    at: "08:00"\nconditions:\n  - condition: time\n    after: "08:00"\n    before: "22:00"\nactions:\n  - service: switch.turn_off\n    entity_id: switch.noncritical_devices_placeholder\n  - service: notify.homeos\n    data:\n      message: "已进入高峰电价时段，非关键设备已自动关闭"',
    },
    {
      // 总功率超限保护：总功率超过阈值（默认 5000W）且非关键设备在运行时自动关断并通知
      // 安装后请替换 sensor.total_power_placeholder 与 switch.noncritical_devices_placeholder，并可按需调整 above 阈值
      id: 'power_overload_protection',
      name: '总功率超限保护',
      description: '全屋总功率超过阈值时自动关闭非关键设备并通知，防止过载跳闸',
      yaml: 'triggers:\n  - platform: numeric_state\n    entity_id: sensor.total_power_placeholder\n    above: 5000\n    for: "0:01:00"\nconditions:\n  - condition: state\n    entity_id: switch.noncritical_devices_placeholder\n    state: "on"\nactions:\n  - service: switch.turn_off\n    entity_id: switch.noncritical_devices_placeholder\n  - service: notify.homeos\n    data:\n      message: "全屋总功率超限，已自动关闭非关键设备"',
    },
  ];
