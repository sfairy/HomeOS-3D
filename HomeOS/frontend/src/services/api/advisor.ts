/**
 * 智能顾问与日程 REST API 封装
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：封装每日顾问、使用报告、设备寿命、提醒日程等接口。
 * 提醒 CRUD 统一委托 system.ts，本模块仅做 data unwrap 以适配顾问 UI。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiPut；./system 提供的提醒 CRUD。
 * 端点范围：/system/advisor/daily[/speak]、/system/advisor/report[/clear]、
 *           /system/device/lifespan、/system/schedule/reminders[/{id}|/all|/presets|/snooze|/clear]、
 *           /system/advisor/tip-feedback。
 */
import { apiGet, apiPost, apiPut } from '../api-client'
import {
  createScheduleReminder,
  deleteScheduleReminder,
  snoozeScheduleReminder,
} from './system'

/**
 * 获取每日智能顾问数据。
 * 对应后端 endpoint：GET /system/advisor/daily
 * @returns 每日顾问内容（建议、洞察等）
 */
export async function fetchDailyAdvisor() {
  const res = await apiGet('/system/advisor/daily')
  return res.data
}

/**
 * 获取使用量报告。
 * 对应后端 endpoint：GET /system/advisor/report
 * @returns 使用量统计数据
 */
export async function fetchUsageReport() {
  const res = await apiGet('/system/advisor/report')
  return res.data
}

/**
 * 清除使用量报告。
 * 对应后端 endpoint：POST /system/advisor/report/clear
 * @returns 操作结果
 */
export async function clearUsageReport() {
  const res = await apiPost('/system/advisor/report/clear')
  return res.data
}

/**
 * 获取设备寿命评估数据。
 * 对应后端 endpoint：GET /system/device/lifespan
 * @returns 设备寿命预估列表
 */
export async function fetchDeviceLifespan() {
  const res = await apiGet('/system/device/lifespan')
  return res.data
}

/**
 * 获取全部日程提醒列表。
 * 对应后端 endpoint：GET /system/schedule/reminders/all
 * @returns 提醒列表
 */
export async function fetchAllReminders() {
  const res = await apiGet('/system/schedule/reminders/all')
  return res.data
}

/**
 * 获取提醒预设列表。
 * 对应后端 endpoint：GET /system/schedule/reminders/presets
 * @returns 可用的预设集合
 */
export async function fetchReminderPresets() {
  const res = await apiGet('/system/schedule/reminders/presets')
  return res.data
}

/**
 * 应用指定提醒预设。
 * 对应后端 endpoint：POST /system/schedule/reminders/presets/{presetId}/apply
 * @param presetId 预设标识
 * @returns 应用结果
 */
export async function applyReminderPreset(presetId: string) {
  const res = await apiPost(
    `/system/schedule/reminders/presets/${encodeURIComponent(presetId)}/apply`,
  )
  return res.data
}

/**
 * 创建日程提醒。
 * 对应后端 endpoint：POST /system/schedule/reminders
 * @param payload 提醒配置载荷
 * @returns 创建后的提醒对象
 */
export async function createReminder(payload: Record<string, unknown>) {
  const res = await createScheduleReminder(payload)
  return res.data
}

/**
 * 更新指定日程提醒。
 * 对应后端 endpoint：PUT /system/schedule/reminders/{id}
 * @param id 提醒标识
 * @param payload 待更新字段
 * @returns 更新后的提醒对象
 */
export async function updateReminder(id: string, payload: Record<string, unknown>) {
  const res = await apiPut(`/system/schedule/reminders/${encodeURIComponent(id)}`, payload)
  return res.data
}

/**
 * 删除指定日程提醒。
 * 对应后端 endpoint：DELETE /system/schedule/reminders/{id}
 * @param id 提醒标识
 * @returns 删除结果
 */
export async function deleteReminder(id: string) {
  const res = await deleteScheduleReminder(id)
  return res.data
}

/**
 * 延后提醒响铃。
 * 对应后端 endpoint：POST /system/schedule/reminders/snooze
 * @param id 提醒标识
 * @param minutes 延后分钟数，默认 60
 * @returns 操作结果
 */
export async function snoozeReminder(id: string, minutes = 60) {
  const res = await snoozeScheduleReminder(id, minutes)
  return res.data
}

/**
 * 清空全部日程提醒。
 * 对应后端 endpoint：POST /system/schedule/reminders/clear
 * @returns 操作结果
 */
export async function clearReminders() {
  const res = await apiPost('/system/schedule/reminders/clear')
  return res.data
}

/**
 * 语音播报每日顾问内容。
 * 对应后端 endpoint：POST /system/advisor/daily/speak
 * @returns 操作结果
 */
export async function speakDailyAdvisor() {
  const res = await apiPost('/system/advisor/daily/speak')
  return res.data
}

/**
 * 标记今日建议反馈（已完成/忽略），持久化到次日。
 * 对应后端 endpoint：POST /system/advisor/tip-feedback
 * @param category 建议类别
 * @param state done | ignored
 * @returns 操作结果
 */
export async function markTipFeedback(category: string, state: 'done' | 'ignored') {
  const res = await apiPost('/system/advisor/tip-feedback', { category, state })
  return res.data
}
