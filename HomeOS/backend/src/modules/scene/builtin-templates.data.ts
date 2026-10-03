/**
 * 场景内置模板数据（entities 型）。
 *
 * 所属模块：backend/modules/scene
 * 职责：从 SceneService 抽出内置场景模板常量，便于一致性回归测试与控制器按需引用。
 *  模板采用 entities 形态（非 YAML），按 entityId + state + 可选 brightness / color 描述目标态。
 * 依赖：shared/orchestrator/builtin-install.util（SceneBuiltinTemplate 类型）。
 */
import type { SceneBuiltinTemplate } from '../../shared/orchestrator/builtin-install.util';

/**
 * SCENE_BUILTIN_TEMPLATES：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：可能被模板字符串动态访问，重命名需全仓检索
 */
export const SCENE_BUILTIN_TEMPLATES: SceneBuiltinTemplate[] = [
  {
    id: 'movie_mode',
    name: '观影模式',
    description: '关闭主灯、调暗氛围灯、打开电视',
    entities: [
      { entityId: 'light.living_placeholder', state: 'off' },
      { entityId: 'light.ambient_placeholder', state: 'on', brightness: 30 },
      { entityId: 'media_player.tv_placeholder', state: 'on' },
    ],
  },
  {
    id: 'goodnight',
    name: '晚安场景',
    description: '关闭全屋灯光，保留夜灯',
    entities: [
      { entityId: 'light.all', state: 'off' },
      { entityId: 'light.night_placeholder', state: 'on', brightness: 10 },
    ],
  },
  {
    id: 'leave_home',
    name: '离家场景',
    description: '关闭灯光空调，启动安防',
    entities: [
      { entityId: 'light.all', state: 'off' },
      { entityId: 'climate.all', state: 'off' },
      { entityId: 'alarm_control_panel.home', state: 'armed_away' },
    ],
  },
  {
    id: 'morning_wake',
    name: '晨起场景',
    description: '渐亮卧室灯，打开窗帘',
    entities: [
      { entityId: 'light.bedroom_placeholder', state: 'on', brightness: 60, transition: 30 },
      { entityId: 'cover.bedroom_placeholder', state: 'open', position: 100 },
    ],
  },
  {
    id: 'guest_mode',
    name: '会客模式',
    description: '会客区灯光 70%，通知家人',
    entities: [
      { entityId: 'light.living_placeholder', state: 'on', brightness: 70 },
      { entityId: 'light.dining_placeholder', state: 'on', brightness: 60 },
    ],
  },
  {
    id: 'cleaning_vacuum',
    name: '清扫模式',
    description: '启动扫地机器人，调暗灯光',
    entities: [
      { entityId: 'vacuum.robot_placeholder', state: 'on' },
      { entityId: 'light.all', state: 'off' },
    ],
  },
  {
    id: 'reading_mode',
    name: '阅读模式',
    description: '书房/卧室阅读灯 80%，关闭电视',
    entities: [
      { entityId: 'light.study_placeholder', state: 'on', brightness: 80, colorTemp: 4000 },
      { entityId: 'media_player.tv_placeholder', state: 'off' },
    ],
  },
];
