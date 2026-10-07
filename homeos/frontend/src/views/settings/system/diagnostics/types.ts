/**
 * 设置诊断 API 负载共享类型定义
 * 
 * 职责：定义诊断相关的数据接口类型，避免使用 any
 * 依赖：无外部依赖，纯类型定义
 */

/** Home Assistant 连接信息 */
interface DiagnosticsHaInfo {
  /** HA 版本号 */
  version?: string
  /** 是否已连接 */
  connected?: boolean
  /** WebSocket 连接模式 */
  wsMode?: string
  /** 是否为 WS leader */
  wsLeader?: boolean
  /** 重连次数 */
  reconnectCount?: number
  /** 区域注册表是否可用 */
  registryAvailable?: boolean
}

/** 编排器同步状态 */
interface DiagnosticsOrchestratorSync {
  /** 错误数量 */
  errorCount?: number
  /** 近期错误列表 */
  recentErrors?: Array<{ scope?: string; message?: string }>
}

/** 漂移定时修复上次运行摘要 */
interface DiagnosticsDriftRepairLastRun {
  startedAt?: string | null
  finishedAt?: string | null
  repaired?: number
  failed?: number
  errorCount?: number
}

/** 数据保留策略配置 */
interface DiagnosticsRetention {
  /** 保留天数 */
  days?: number
  /** 是否跳过传感器时间线 */
  skipSensorTimeline?: boolean
}

/** 诊断信息完整数据结构 */
export interface DiagnosticsDiag {
  /** 复制文本内容 */
  copyText?: string
  /** 时间戳 */
  timestamp?: string | number | Date
  /** HA 连接信息 */
  ha?: DiagnosticsHaInfo
  /** 实体统计信息 */
  entities?: {
    count?: number
    estimatedEntityStoreMb?: number
    stale?: boolean
    syncedAt?: string | null
  }
  /** WebSocket 连接统计 */
  websocket?: { clients?: number }
  /** HA 同步管线阶段延迟（含前端上报） */
  haSyncLatency?: Array<{
    stage: string
    count: number
    p50: number
    p99: number
    max: number
  }>
  /** HA WS 延期队列过载丢弃总数 */
  haWsDeferredDroppedTotal?: number
  /** 数据保留配置 */
  retention?: DiagnosticsRetention
  /** Redis 健康状态快照 */
  redis?: RedisHealthSnapshotLike
  /** 内存详情 */
  memoryDetail?: { estimatedEntityStoreMb?: number }
  /** 编排器同步状态 */
  orchestratorSync?: DiagnosticsOrchestratorSync
  /** 漂移定时修复上次运行 */
  driftRepairLastRun?: DiagnosticsDriftRepairLastRun | null
  /** 性能优化建议 */
  perfSuggestions?: string[]
  /** 其他扩展字段 */
  [key: string]: unknown
}

/** 系统健康状态 */
export interface DiagnosticsHealth {
  /** HA 连接信息 */
  ha?: DiagnosticsHaInfo
  /** CPU 使用率 */
  cpu?: number | string
  /** 内存使用率 */
  memory?: number | string
  /** 内存使用量（MB） */
  memoryMb?: number
  /** 内存限制（MB） */
  memoryLimitMb?: number
  /** 常驻内存（MB） */
  rssMb?: number
  /** 运行时长 */
  uptime?: string | number
  /** 其他扩展字段 */
  [key: string]: unknown
}

/** 配置健康度检查结果 */
export interface DiagnosticsConfigHealth {
  /** 占位符自动化数量 */
  placeholderAutomationCount?: number
  /** 占位符场景数量 */
  placeholderSceneCount?: number
  /** 是否跳过传感器时间线 */
  skipSensorTimeline?: boolean
  /** 健康度评分 */
  score?: number
  /** 绑定缺口数量 */
  bindingGapCount?: number
  /** 其他扩展字段 */
  [key: string]: unknown
}

/** Redis 健康状态快照 */
interface RedisHealthSnapshotLike {
  /** 是否已配置 Redis */
  configured?: boolean
  /** 是否正常运行 */
  ok?: boolean
  /** 是否正在加载 */
  loading?: boolean
  /** 状态文本 */
  status?: string
}