/**
 * 脚本内置模板数据（YAML 型）。
 *
 * 所属模块：backend/modules/script
 * 职责：从 ScriptService 抽出内置脚本模板常量，便于一致性回归测试与控制器按需引用。
 *  模板采用 HA script YAML sequence 形态，覆盖全屋播报、延时关灯、温馨回家等场景。
 * 依赖：shared/orchestrator/builtin-install.util（YamlBuiltinTemplate 类型）。
 */
import type { YamlBuiltinTemplate } from '../../shared/orchestrator/builtin-install.util';

/**
 * SCRIPT_BUILTIN_TEMPLATES：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：可能被模板字符串动态访问，重命名需全仓检索
 */
export const SCRIPT_BUILTIN_TEMPLATES: YamlBuiltinTemplate[] = [
  {
    id: 'announce_home',
    name: '全屋播报',
    description: '通过 notify 发送全屋提醒',
    yaml: 'sequence:\n  - service: notify.homeos\n    data:\n      message: "您好，欢迎回家"\n',
  },
  {
    id: 'lights_off_delayed',
    name: '延迟全屋关灯',
    description: '5 分钟后关闭占位灯光实体',
    yaml: 'sequence:\n  - delay: "00:05:00"\n  - service: light.turn_off\n    entity_id: light.all\n',
  },
  {
    id: 'restart_router',
    name: '重启路由器',
    description: '切换路由器电源开关（请替换占位实体）',
    yaml: 'sequence:\n  - service: switch.turn_off\n    entity_id: switch.router_placeholder\n  - delay: "00:00:30"\n  - service: switch.turn_on\n    entity_id: switch.router_placeholder\n',
  },
  {
    id: 'good_morning_sequence',
    name: '晨起序列',
    description: '渐亮卧室灯并打开窗帘',
    yaml: 'sequence:\n  - service: cover.open_cover\n    entity_id: cover.bedroom_placeholder\n  - service: light.turn_on\n    entity_id: light.bedroom_placeholder\n    data:\n      brightness_pct: 60\n      transition: 30\n',
  },
  {
    id: 'panic_lights_on',
    name: '紧急开灯',
    description: '全屋灯光 100% 并发送告警',
    yaml: 'sequence:\n  - service: light.turn_on\n    entity_id: light.all\n    data:\n      brightness_pct: 100\n  - service: notify.homeos\n    data:\n      message: "⚠️ 紧急照明已开启"\n',
  },
  {
    id: 'start_vacuum',
    name: '启动清扫',
    description: '启动扫地机器人并调暗灯光（请替换占位实体）',
    yaml: 'sequence:\n  - service: vacuum.start\n    entity_id: vacuum.robot_placeholder\n  - service: light.turn_off\n    entity_id: light.all\n',
  },
];
