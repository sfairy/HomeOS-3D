/**
 * 系统运维、环境、语音、备份等 REST API 封装
 *
 * 职责：覆盖系统配置、健康/诊断、运行日志（含 SSE 推流）、备份导入导出、儿童模式、
 *       访客通行码、环境监测、自适应气候、昼夜节律照明、语音 STT/TTS、客户端电源、
 *       设备健康、Advisor 建议、推荐/习惯、定时提醒、外部日历/天气、模板市场、僵尸绑定解绑、
 *       数据保留策略与 HA WebRTC 信令等运维接口。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiPut / apiDelete；@homeos/shared 的运行日志契约。
 * 端点范围：/system/*、/environment/*、/ha/webrtc/*（详见各方法）。
 */
import type { AxiosRequestConfig } from 'axios'
import type { RuntimeLogEntry, RuntimeLogLevel, RuntimeLogQueryResult } from '@homeos/shared'
import { apiDelete, apiGet, apiPost, apiPut } from '../api-client'

/**
 * 获取系统配置（完整）。
 * 对应后端 endpoint：GET /system/config
 * @returns 系统配置对象
 */
export function fetchSystemConfig(config?: AxiosRequestConfig) {
  return apiGet('/system/config', config)
}

/**
 * 更新系统配置。
 * 对应后端 endpoint：PUT /system/config
 * @param body 待更新的配置字段
 * @returns 操作结果
 */
export function updateSystemConfig(body: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPut('/system/config', body, config)
}

/**
 * 获取未登录可见的公开系统配置。
 * 对应后端 endpoint：GET /system/config/public
 * @returns 公开配置对象
 */
export function fetchPublicSystemConfig<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/config/public', config)
}

/**
 * 导出系统配置为可下载内容。
 * 对应后端 endpoint：GET /system/config/export
 * @returns 配置导出载荷
 */
export function exportSystemConfig(config?: AxiosRequestConfig) {
  return apiGet('/system/config/export', config)
}

/**
 * 导入系统配置。
 * 对应后端 endpoint：POST /system/config/import
 * @param body 导入载荷
 * @returns 操作结果
 */
export function importSystemConfig(body: unknown, config?: AxiosRequestConfig) {
  return apiPost('/system/config/import', body, config)
}

/**
 * 重置指定分区或全部系统配置。
 * 对应后端 endpoint：POST /system/config/reset
 * @param section 指定分区名；省略则全部重置
 * @returns 操作结果
 */
export function resetSystemConfig(section?: string, config?: AxiosRequestConfig) {
  return apiPost('/system/config/reset', section ? { section } : {}, config)
}

/**
 * 获取配置健康检查（缺失/失效项）。
 * 对应后端 endpoint：GET /system/config/health
 * @returns 健康检查结果
 */
export function fetchConfigHealth(config?: AxiosRequestConfig) {
  return apiGet('/system/config/health', config)
}

/**
 * 获取配置变更审计记录。
 * 对应后端 endpoint：GET /system/config-audit
 * @returns 审计条目列表
 */
export function fetchConfigAudit(config?: AxiosRequestConfig) {
  return apiGet('/system/config-audit', config)
}

/**
 * 获取系统健康总览。
 * 对应后端 endpoint：GET /system/health
 * @returns 健康状态对象
 */
export function fetchSystemHealth(config?: AxiosRequestConfig) {
  return apiGet('/system/health', config)
}

/**
 * 获取系统诊断信息（资源/依赖/版本等）。
 * 对应后端 endpoint：GET /system/diagnostics
 * @returns 诊断结果
 */
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

/**
 * 获取后台任务调度快照。
 * 对应后端 endpoint：GET /system/jobs
 * @returns 任务快照数组
 */
export function fetchSystemJobs(config?: AxiosRequestConfig) {
  return apiGet<{ success: boolean; data: SystemJobSnapshot[] }>('/system/jobs', config)
}

/** 运行日志契约由 @homeos/shared/observability 统一维护（与后端环形缓冲对齐） */
export type { RuntimeLogEntry, RuntimeLogLevel }

/** 运行日志查询响应（与 @homeos/shared RuntimeLogQueryResult 对齐）。 */
export type RuntimeLogsResponse = RuntimeLogQueryResult

/**
 * 分页查询运行日志，支持级别、关键字、上下文过滤与增量游标 afterId。
 * 对应后端 endpoint：GET /system/runtime-logs
 * @param params.limit 条数上限；params.level 级别；params.q 关键字；params.context 上下文过滤；params.afterId 增量游标
 * @returns 日志查询结果
 */
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

/**
 * 打开运行日志 SSE 推流连接（Cookie 鉴权；EventSource 无法带自定义头）。
 * 端点：GET /system/runtime-logs/stream
 * @param params.level/q/context/afterId 过滤参数，与 fetchRuntimeLogs 一致
 * @returns 浏览器 EventSource 实例，前端自行管理监听/关闭
 */
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

/**
 * 清空运行日志环形缓冲。
 * 对应后端 endpoint：DELETE /system/runtime-logs
 * @returns 已清除条目数
 */
export function clearRuntimeLogs(config?: AxiosRequestConfig) {
  return apiDelete<{ cleared: number }>('/system/runtime-logs', config)
}





/**
 * 标记向导完成并设置学习期天数。
 * 对应后端 endpoint：POST /system/setup-wizard/complete
 * @param payload.learningPeriodDays 学习期天数
 * @returns 操作结果
 */
export function completeSetupWizard(
  payload: { learningPeriodDays?: number },
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/setup-wizard/complete', payload, config)
}

/**
 * 忽略向导清单（不再展示）。
 * 对应后端 endpoint：POST /system/setup-wizard/checklist/dismiss
 * @returns 操作结果
 */
export function dismissSetupChecklist(config?: AxiosRequestConfig) {
  return apiPost('/system/setup-wizard/checklist/dismiss', undefined, config)
}

/**
 * 获取向导清单条目。
 * 对应后端 endpoint：GET /system/setup-wizard/checklist
 * @returns 清单数组
 */
export function fetchSetupChecklist<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/setup-wizard/checklist', config)
}

/**
 * 降低向导安防敏感度（用户反馈触发）。
 * 对应后端 endpoint：POST /system/setup-wizard/reduce-sensitivity
 * @param payload.recordFeedback 是否记录反馈；payload.source 来源标识
 * @returns 操作结果
 */
export function reduceSetupSecuritySensitivity(
  payload?: { recordFeedback?: boolean; source?: string },
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/setup-wizard/reduce-sensitivity', payload ?? {}, config)
}

/**
 * 创建一次性服务器备份文件。
 * 对应后端 endpoint：POST /system/backup/files/create
 * @returns 操作结果
 */
export function createServerBackup(config?: AxiosRequestConfig) {
  return apiPost('/system/backup/files/create', undefined, config)
}

/** 定时自动备份状态（开关 / 保留天数 / 上次与下次执行） */
export function fetchAutoBackupStatus(config?: AxiosRequestConfig) {
  return apiGet('/system/backup/auto/status', config)
}

/**
 * 获取服务器备份文件列表。
 * 对应后端 endpoint：GET /system/backup/files
 * @returns 备份文件元数据数组
 */
export function fetchServerBackupFiles(config?: AxiosRequestConfig) {
  return apiGet('/system/backup/files', config)
}

/**
 * 下载指定备份文件内容。
 * 对应后端 endpoint：GET /system/backup/files/download
 * @param name 备份文件名
 * @returns 备份内容（流或二进制）
 */
export function downloadServerBackupFile(name: string, config?: AxiosRequestConfig) {
  return apiGet('/system/backup/files/download', {
    ...config,
    params: { ...config?.params, name },
  })
}

/**
 * 导入备份文件。
 * 对应后端 endpoint：POST /system/backup/files/import
 * @param body.bundle 备份内容；body.name 可选文件名
 * @returns 操作结果
 */
export function importServerBackupFile(
  body: { bundle: unknown; name?: string },
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/backup/files/import', body, config)
}

/**
 * 删除指定备份文件。
 * 对应后端 endpoint：DELETE /system/backup/files
 * @param name 备份文件名
 * @returns 操作结果
 */
export function deleteServerBackupFile(name: string, config?: AxiosRequestConfig) {
  return apiDelete('/system/backup/files', {
    ...config,
    params: { ...config?.params, name },
  })
}

/**
 * 还原指定备份文件，需 confirm=true，可选分区与配置合并模式。
 * 对应后端 endpoint：POST /system/backup/files/restore
 * @param body.name 文件名；body.confirm 是否确认；body.appConfigMode 应用配置合并/替换；body.sections 限定还原分区
 * @returns 操作结果
 */
export function restoreServerBackupFile(
  body: {
    name: string
    confirm: boolean
    appConfigMode?: 'merge' | 'replace'
    sections?: Array<'ui' | 'appConfig' | 'users'>
  },
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/backup/files/restore', body, config)
}

















/**
 * 获取语音模块元信息（语言/引擎/能力）。
 * 对应后端 endpoint：GET /system/voice/meta
 * @returns 元信息对象
 */
export function fetchVoiceMeta(config?: AxiosRequestConfig) {
  return apiGet('/system/voice/meta', config)
}

/**
 * 获取语音预设列表。
 * 对应后端 endpoint：GET /system/voice/presets
 * @returns 预设数组
 */
export function fetchVoicePresets(config?: AxiosRequestConfig) {
  return apiGet('/system/voice/presets', config)
}

/**
 * 获取 STT 健康状态 / 可用 provider / 自动探测实体。
 * 对应后端 endpoint：GET /system/voice/stt-status
 * @returns STT 状态
 */
export function fetchVoiceSttStatus(config?: AxiosRequestConfig) {
  return apiGet('/system/voice/stt-status', config)
}

/**
 * 调用 HA Assistant conversation.process 进行文本对话测试。
 * 对应后端 endpoint：POST /system/voice/conversation
 * @param text 测试文本
 * @returns 对话结果
 */
export function processVoiceConversation(text: string, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/conversation', { text }, config)
}

/**
 * 语音转文字（STT）。
 * 对应后端 endpoint：POST /system/voice/transcribe
 * @param payload 音频载荷与配置
 * @returns 转写结果
 */
export function transcribeVoice(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/transcribe', payload, config)
}

/**
 * 执行文本语音指令（意图解析 + 调用）。
 * 对应后端 endpoint：POST /system/voice/execute
 * @param text 指令文本
 * @returns 执行结果
 */
export function executeVoiceCommand(text: string, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/execute', { text }, config)
}

/**
 * 文字转语音（TTS）合成与播报。
 * 对应后端 endpoint：POST /system/voice/speak
 * @param payload 文本与音色配置
 * @returns 合成/播报结果
 */
export function speakVoice(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/speak', payload, config)
}

/**
 * 获取客户端电源状态（接入/电池/在离线）。
 * 对应后端 endpoint：GET /system/client-power/status
 * @returns 客户端电源状态
 */
export function fetchClientPowerStatus<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/client-power/status', config)
}

/**
 * 客户端上报电源状态（背景任务，跳过 401 跳转由调用方控制）。
 * 对应后端 endpoint：POST /system/client-power/report
 * @param payload 电源状态载荷
 * @returns 操作结果
 */
export function reportClientPower(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/client-power/report', payload, config)
}

/**
 * 忽略客户端电源待处理事项。
 * 对应后端 endpoint：POST /system/client-power/pending/dismiss
 * @param payload 标识载荷
 * @returns 操作结果
 */
export function dismissClientPowerPending(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/client-power/pending/dismiss', payload, config)
}

/**
 * 忽略客户端离线待处理事项。
 * 对应后端 endpoint：POST /system/client-power/pending/dismiss-offline
 * @param payload 标识载荷
 * @returns 操作结果
 */
export function dismissClientPowerOffline(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/client-power/pending/dismiss-offline', payload, config)
}


/**
 * 获取指定实体的 Advisor 用量明细。
 * 对应后端 endpoint：GET /system/advisor/usage/{entityId}
 * @param entityId 实体 ID
 * @param params 查询参数
 * @returns 用量明细
 */
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

/**
 * 获取 Advisor 用量汇总。
 * 对应后端 endpoint：GET /system/advisor/usage/summary
 * @param params.days 统计天数
 * @returns 汇总数据
 */
export function fetchAdvisorUsageSummary(params?: { days?: number }, config?: AxiosRequestConfig) {
  return apiGet('/system/advisor/usage/summary', {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/**
 * 获取被遗忘设备/实体列表（长期未触发）。
 * 对应后端 endpoint：GET /system/advisor/forgotten
 * @returns 被遗忘条目数组
 */
export function fetchAdvisorForgotten(config?: AxiosRequestConfig) {
  return apiGet('/system/advisor/forgotten', config)
}







/**
 * 获取实体绑定缺口（未绑定到布局/区域的实体）。
 * 对应后端 endpoint：GET /system/bindings/gaps
 * @returns 缺口列表
 */
export function fetchBindingsGaps(config?: AxiosRequestConfig) {
  return apiGet('/system/bindings/gaps', config)
}





/**
 * 获取向导状态（是否已完成、当前阶段等）。
 * 对应后端 endpoint：GET /system/setup-wizard/status
 * @returns 向导状态
 */
export function fetchSetupWizardStatus<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/setup-wizard/status', config)
}

/**
 * 校验向导所选实体是否满足接入条件。
 * 对应后端 endpoint：POST /system/setup-wizard/validate-entities
 * @param entityIds 待校验实体 ID 数组
 * @returns 校验结果
 */
export function validateSetupWizardEntities(entityIds: string[], config?: AxiosRequestConfig) {
  return apiPost('/system/setup-wizard/validate-entities', { entityIds }, config)
}

/**
 * 导出系统备份 bundle（多分区打包）。
 * 对应后端 endpoint：GET /system/backup/bundle/export
 * @returns bundle 内容
 */
export function exportBackupBundle(config?: AxiosRequestConfig) {
  return apiGet('/system/backup/bundle/export', config)
}

/**
 * 导入系统备份 bundle。
 * 对应后端 endpoint：POST /system/backup/bundle/import
 * @param body bundle 内容
 * @returns 操作结果
 */
export function importBackupBundle(body: unknown, config?: AxiosRequestConfig) {
  return apiPost('/system/backup/bundle/import', body, config)
}

/**
 * 获取备份 bundle 摘要（分区/大小/时间）。
 * 对应后端 endpoint：GET /system/backup/bundle/summary
 * @returns 摘要对象
 */
export function fetchBackupBundleSummary(config?: AxiosRequestConfig) {
  return apiGet('/system/backup/bundle/summary', config)
}



/**
 * 同时为多个目标合成并播报 TTS。
 * 对应后端 endpoint：POST /system/voice/speak-multiple
 * @param payload 多目标播报载荷
 * @returns 操作结果
 */
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

/**
 * 获取跨端网络与远程访问信息（内网地址 / 公网 IPv4·IPv6 / 端口回退）。
 * 对应后端 endpoint：GET /system/network-info（仅 admin）
 * 断网时公网字段为 null 且仍返回 200，不会抛错。
 * @returns 网络信息
 */
export function fetchSystemNetworkInfo(config?: AxiosRequestConfig) {
  return apiGet<SystemNetworkInfo>('/system/network-info', config)
}
