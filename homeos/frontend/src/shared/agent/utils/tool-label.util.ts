/**
 * 工具轨迹的中文短标签。
 *
 * 气泡里只该给人看「管家做了什么」，而不是 `get_home_status` 这类内部函数名 ——
 * 原名对用户没有意义，还会让回复看起来像调试输出。未收录的工具（第三方 MCP、
 * 后续新增但没来得及补标签的）回落成「去下划线的原名」，至少不露出蛇形命名。
 */

/** 工具名 → 中文短标签；与后端 `home_tools_schemas.py` 的工具名一一对应 */
const TOOL_LABELS: Record<string, string> = {
  search_entities: '搜索设备',
  get_entity_state: '设备状态',
  control_device: '控制设备',
  list_areas: '房间列表',
  get_area_snapshot: '房间快照',
  control_room: '房间控制',
  activate_scene: '执行场景',
  list_scenes: '场景列表',
  activate_home_mode: '切换模式',
  list_home_modes: '模式列表',
  get_home_status: '全屋状态',
  get_weather: '天气',
  get_weather_forecast: '天气预报',
  get_calendar: '日程',
  get_notifications: '通知',
  get_energy_usage: '能耗',
  query_events: '事件查询',
  query_device_timeline: '设备轨迹',
  query_system_logs: '系统日志',
  query_camera: '摄像头',
  set_light_brightness: '灯光亮度',
  set_cover_position: '窗帘位置',
  media_control: '媒体控制',
  run_proactive_patrol: '主动巡检',
  schedule_task: '创建计划',
  list_scheduled_tasks: '计划列表',
  cancel_scheduled_task: '取消计划',
  manage_user_policy: '用户规则',
  send_notification: '发送通知',
  manage_todo: '待办清单',
  manage_calendar: '日历事件',
  manage_memory: '长期记忆',
  web_search: '联网搜索',
}

/** 单个工具名的展示文案（空名返回空串，调用方据此不渲染） */
function toolLabel(name: string): string {
  const key = String(name || '').trim()
  if (!key) return ''
  return TOOL_LABELS[key] || key.replace(/_/g, ' ')
}

/**
 * 把气泡里保存的 `a → b` 轨迹串拆成标签数组。
 *
 * 轨迹串是历史会话的持久化格式（见 `ChatMessage.tools`），这里只做展示层拆解，
 * 不去改动存储形态；重复项保持首次出现的位置，避免同一轮里工具多次调用刷屏。
 */
export function toolLabels(trace: string | undefined): string[] {
  const seen = new Set<string>()
  for (const name of String(trace || '').split('→')) {
    const label = toolLabel(name)
    if (label) seen.add(label)
  }
  return [...seen]
}
