/** 系统运维、环境、语音、备份等 REST API 封装（/system/*、/environment/*、/ha/webrtc/*）。 */
import type { AxiosRequestConfig } from 'axios'
import type { RuntimeLogEntry, RuntimeLogLevel, RuntimeLogQueryResult } from '@homeos/shared'
import { apiDelete, apiGet, apiPost, apiPut } from './client'

/** 获取系统配置（完整）。 */
export function fetchSystemConfig(config?: AxiosRequestConfig) {
  return apiGet('/system/config', config)
}

/** 更新系统配置。 */
export function updateSystemConfig(body: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPut('/system/config', body, config)
}

/** 获取未登录可见的公开系统配置。 */
export function fetchPublicSystemConfig<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/config/public', config)
}

/** 导出系统配置为可下载内容。 */
export function exportSystemConfig(config?: AxiosRequestConfig) {
  return apiGet('/system/config/export', config)
}

/** 导入系统配置。 */
export function importSystemConfig(body: unknown, config?: AxiosRequestConfig) {
  return apiPost('/system/config/import', body, config)
}

/** 重置指定分区或全部系统配置。 */
export function resetSystemConfig(section?: string, config?: AxiosRequestConfig) {
  return apiPost('/system/config/reset', section ? { section } : {}, config)
}

/** 获取配置健康检查（缺失/失效项）。 */
export function fetchConfigHealth(config?: AxiosRequestConfig) {
  return apiGet('/system/config/health', config)
}

/** 获取配置变更审计记录。 */
export function fetchConfigAudit(config?: AxiosRequestConfig) {
  return apiGet('/system/config-audit', config)
}

/** 获取系统健康总览。 */
export function fetchSystemHealth(config?: AxiosRequestConfig) {
  return apiGet('/system/health', config)
}

/** 获取系统诊断信息（资源/依赖/版本等）。 */
export function fetchSystemDiagnostics(config?: AxiosRequestConfig) {
  return apiGet('/system/diagnostics', config)
}

/** 系统后台任务快照：名称/描述/间隔/启用/运行次数/最近/下次执行/最近错误。 */
export type SystemJobSnapshot = {
  name: string
  description: string
  intervalMs?: number
  enabled: boolean
  runs: number
  lastRunAt: string | null
  lastDurationMs: number | null
  lastError: string | null
  nextRunAt: string | null
}

/** 获取后台任务调度快照。 */
export function fetchSystemJobs(config?: AxiosRequestConfig) {
  return apiGet<{ success: boolean; data: SystemJobSnapshot[] }>('/system/jobs', config)
}

/** 运行日志契约由 @homeos/shared/observability 统一维护（与后端环形缓冲对齐） */
export type { RuntimeLogEntry, RuntimeLogLevel }

/** 运行日志查询响应（与 @homeos/shared RuntimeLogQueryResult 对齐）。 */
export type RuntimeLogsResponse = RuntimeLogQueryResult

/** 分页查询运行日志，支持级别、关键字、上下文过滤与增量游标 afterId。 */
export function fetchRuntimeLogs(
  params?: {
    limit?: number
    level?: string
    q?: string
    context?: string
    afterId?: number
  },
  config?: AxiosRequestConfig,
) {
  return apiGet<RuntimeLogsResponse>('/system/runtime-logs', {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/** 打开运行日志 SSE 推流连接（Cookie 鉴权；EventSource 无法带自定义头）。 */
export function openRuntimeLogsStream(params?: {
  level?: string
  q?: string
  context?: string
  afterId?: number
}) {
  const qs = new URLSearchParams()
  if (params?.level) qs.set('level', params.level)
  if (params?.q) qs.set('q', params.q)
  if (params?.context) qs.set('context', params.context)
  if (params?.afterId != null && params.afterId > 0) qs.set('afterId', String(params.afterId))
  const query = qs.toString()
  const url = `/api/v1/system/runtime-logs/stream${query ? `?${query}` : ''}`
  return new EventSource(url, { withCredentials: true })
}

/** 清空运行日志环形缓冲。 */
export function clearRuntimeLogs(config?: AxiosRequestConfig) {
  return apiDelete<{ cleared: number }>('/system/runtime-logs', config)
}





/** 标记向导完成并设置学习期天数。 */
export function completeSetupWizard(
  payload: { learningPeriodDays?: number },
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/setup-wizard/complete', payload, config)
}

/** 忽略向导清单（不再展示）。 */
export function dismissSetupChecklist(config?: AxiosRequestConfig) {
  return apiPost('/system/setup-wizard/checklist/dismiss', undefined, config)
}

/** 获取向导清单条目。 */
export function fetchSetupChecklist<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/setup-wizard/checklist', config)
}

/** 降低向导安防敏感度（用户反馈触发）。 */
export function reduceSetupSecuritySensitivity(
  payload?: { recordFeedback?: boolean; source?: string },
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/setup-wizard/reduce-sensitivity', payload ?? {}, config)
}

/** 创建一次性服务器备份文件。 */
export function createServerBackup(config?: AxiosRequestConfig) {
  return apiPost('/system/backup/files/create', undefined, config)
}

/** 定时自动备份状态（开关 / 保留天数 / 上次与下次执行） */
export function fetchAutoBackupStatus(config?: AxiosRequestConfig) {
  return apiGet('/system/backup/auto/status', config)
}

/** 获取服务器备份文件列表。 */
export function fetchServerBackupFiles(config?: AxiosRequestConfig) {
  return apiGet('/system/backup/files', config)
}

/** 下载指定备份文件内容。 */
export function downloadServerBackupFile(name: string, config?: AxiosRequestConfig) {
  return apiGet('/system/backup/files/download', {
    ...config,
    responseType: 'blob',
    params: { ...config?.params, name },
  })
}

/** 删除指定备份文件。 */
export function deleteServerBackupFile(name: string, config?: AxiosRequestConfig) {
  return apiDelete('/system/backup/files', {
    ...config,
    params: { ...config?.params, name },
  })
}

/**
 * 还原指定全量备份文件（含数据库）。
 *
 * 需 `confirm=true` **且**提供当前管理员密码：这条接口会用备份包整体覆盖数据库
 * （含账号与授权），仅凭登录态不足以执行。
 */
export function restoreServerBackupFile(
  body: { name: string; confirm: boolean; adminPassword: string },
  config?: AxiosRequestConfig,
) {
  return apiPost(
    '/system/backup/files/restore',
    { name: body.name, confirm: body.confirm === true, adminPassword: body.adminPassword },
    config,
  )
}

















/** 获取语音模块元信息（语言/引擎/能力）。 */
export function fetchVoiceMeta(config?: AxiosRequestConfig) {
  return apiGet('/system/voice/meta', config)
}

/** 获取语音预设列表。 */
export function fetchVoicePresets(config?: AxiosRequestConfig) {
  return apiGet('/system/voice/presets', config)
}

/** 获取 STT 健康状态 / 可用 provider / 自动探测实体。 */
export function fetchVoiceSttStatus(config?: AxiosRequestConfig) {
  return apiGet('/system/voice/stt-status', config)
}

/** 调用 HA Assistant conversation.process 进行文本对话测试。 */
export function processVoiceConversation(text: string, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/conversation', { text }, config)
}

/** 语音转文字（STT）。 */
export function transcribeVoice(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/transcribe', payload, config)
}

/** 执行文本语音指令（意图解析 + 调用）。 */
export function executeVoiceCommand(text: string, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/execute', { text }, config)
}

/** 文字转语音（TTS）合成与播报。 */
export function speakVoice(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/speak', payload, config)
}

/** 获取客户端电源状态（接入/电池/在离线）。 */
export function fetchClientPowerStatus<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/client-power/status', config)
}

/** 客户端上报电源状态（背景任务，跳过 401 跳转由调用方控制）。 */
export function reportClientPower(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/client-power/report', payload, config)
}

/** 忽略客户端电源待处理事项。 */
export function dismissClientPowerPending(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/client-power/pending/dismiss', payload, config)
}

/** 忽略客户端离线待处理事项。 */
export function dismissClientPowerOffline(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/client-power/pending/dismiss-offline', payload, config)
}


/** 获取指定实体的 Advisor 用量明细。 */
export function fetchAdvisorUsage(
  entityId: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiGet(`/system/advisor/usage/${encodeURIComponent(entityId)}`, {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/** 获取 Advisor 用量汇总。 */
export function fetchAdvisorUsageSummary(params?: { days?: number }, config?: AxiosRequestConfig) {
  return apiGet('/system/advisor/usage/summary', {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/** 获取被遗忘设备/实体列表（长期未触发）。 */
export function fetchAdvisorForgotten(config?: AxiosRequestConfig) {
  return apiGet('/system/advisor/forgotten', config)
}







/** 获取实体绑定缺口（未绑定到布局/区域的实体）。 */
export function fetchBindingsGaps(config?: AxiosRequestConfig) {
  return apiGet('/system/bindings/gaps', config)
}





/** 获取向导状态（是否已完成、当前阶段等）。 */
export function fetchSetupWizardStatus<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/setup-wizard/status', config)
}

/** 校验向导所选实体是否满足接入条件。 */
export function validateSetupWizardEntities(entityIds: string[], config?: AxiosRequestConfig) {
  return apiPost('/system/setup-wizard/validate-entities', { entityIds }, config)
}


/** 同时为多个目标合成并播报 TTS。 */
export function speakVoiceMultiple(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/speak-multiple', payload, config)
}

/** 僵尸绑定来源类型（与后端 ZombieBindingSource 对齐） */
type ZombieBindingSource = 'layoutWidget' | 'alertRule' | 'deviceLifespan'

/** 单条僵尸绑定 */
export type ZombieBindingItem = {
  source: ZombieBindingSource
  entityId: string
  /** 展示用实体名；缺省时前端回退为 object_id */
  entityName?: string
  refId: string
  location: string
}

/** GET /system/devices 响应 */
export type DevicesOverviewResponse = {
  zombieBindings: ZombieBindingItem[]
}

/** 批量解绑结果 */
export type ZombieUnbindResponse = {
  processed: number
  unbound: number
  skipped: number
  failed: number
  results: Array<{
    source: ZombieBindingSource
    entityId: string
    refId: string
    status: 'unbound' | 'skipped' | 'failed'
    message?: string
  }>
}

/** 设备管理总览：僵尸绑定列表 */
export function fetchDevicesOverview(config?: AxiosRequestConfig) {
  return apiGet<DevicesOverviewResponse>('/system/devices', config)
}

/** 批量解绑僵尸绑定（幂等，返回处理统计） */
export function unbindZombieBindings(items: ZombieBindingItem[], config?: AxiosRequestConfig) {
  return apiPost<ZombieUnbindResponse>('/system/devices/unbind', { items }, config)
}

// 数据保留（E9：设置面板「数据保留」）

/** 单表保留策略项（对应后端 RetentionTablePolicy） */
type RetentionPolicyItem = {
  key: string
  table: string
  label: string
  retentionDays: number
}

/** 最近一次清理统计（对应后端 RetentionCleanupStats） */
type RetentionLastCleanup = {
  at: string
  retentionDays: number
  total: number
  deleted: Record<string, number>
  elapsedMs: number
}

/** GET /system/config/retention 响应 */
export type RetentionConfigResponse = {
  policies: RetentionPolicyItem[]
  lastCleanup: RetentionLastCleanup | null
  estimatedRows: Record<string, number>
}

/** 获取各表保留策略与最近一次清理统计 */
export function fetchRetentionConfig(config?: AxiosRequestConfig) {
  return apiGet<RetentionConfigResponse>('/system/config/retention', config)
}

/** 更新各表保留天数（部分更新，未提供的表保持原值） */
export function updateRetentionConfig(
  body: { retention: Record<string, number> },
  config?: AxiosRequestConfig,
) {
  return apiPut<RetentionConfigResponse>('/system/config/retention', body, config)
}

// 跨端网络与远程访问（供原生端同步与登录下发读取）

/** GET /system/network-info 响应（与后端 NetworkInfo 对齐） */
export type SystemNetworkInfo = {
  /** 后端监听端口 */
  port: number
  /** 前端访问端口（生产由后端托管 SPA，走后端回退链推导） */
  frontendPort: number
  /** 后端端口（与 port 同源） */
  backendPort: number
  /** 本机内网 IP */
  localIp: string
  /** 内网访问地址 */
  internalUrl: string
  /** 远程访问地址（layout.externalUrl） */
  externalUrl: string
  /** 公网 IPv4；探针失败为 null */
  publicIpv4: string | null
  /** 公网 IPv6；探针失败为 null */
  publicIpv6: string | null
  /** 本机原生 IPv6（公网探针失败时的回退展示） */
  localIpv6: string | null
  /** 采集时间戳（ISO 8601） */
  timestamp: string
}

/** 获取跨端网络与远程访问信息（内网地址 / 公网 IPv4·IPv6 / 端口回退）。 */
export function fetchSystemNetworkInfo(config?: AxiosRequestConfig) {
  return apiGet<SystemNetworkInfo>('/system/network-info', config)
}
