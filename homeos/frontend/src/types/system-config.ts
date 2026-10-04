/**
 * 系统配置类型：后端 GET/PUT /system/config 响应体与局部 patch。
 * 分区类型优先引用 @homeos/shared，避免 FE 平行重声明漂移。
 */
import type {
  EnvSensorMap,
  SharedAuthConfig,
  SharedCircadianConfig,
  SharedCommandProxyConfig,
  SharedEnergyConfig,
  SharedIaqConfig,
  SharedChildModeConfig,
  SharedExternalConfig,
  SharedFrontendConfig,
  SharedHaConnectorConfig,
  SharedHomeModeConfig,
  SharedNotificationConfig,
  SharedOpsConfig,
  SharedOtherConfig,
  SharedPricingConfig,
  SharedSecurityConfig,
  SharedStateStoreConfig,
  SharedVoiceConfig,
  SharedWaterConfig,
  SharedWebrtcConfig,
  SharedWsPushConfig,
} from '@homeos/shared'
import type { ClientPowerSettings } from '@/types/client-power'

/** 后端 GET/PUT /system/config 响应体（分区结构与 AppConfigData 对齐） */
export interface SystemConfig {
  _version?: number
  /** 乐观锁 revision，与 SystemConfig.updatedAt 一致 */
  _configUpdatedAt?: string
  _configAudit?: unknown[]
  envSensorMap?: EnvSensorMap
  energy?: Partial<SharedEnergyConfig>
  iaq?: Partial<SharedIaqConfig>
  childMode?: Partial<SharedChildModeConfig>
  security?: SharedSecurityConfig
  ui?: Record<string, unknown>
  homeMode?: Partial<SharedHomeModeConfig>
  haConnector?: SharedHaConnectorConfig
  external?: SharedExternalConfig
  voice?: SharedVoiceConfig
  voiceCommands?: Array<Record<string, unknown>>
  clientPower?: ClientPowerSettings
  ops?: SharedOpsConfig
  other?: SharedOtherConfig
  /** 各业务表历史数据保留天数（与后端 retention 分区对应，由「数据保留」页管理） */
  retention?: Record<string, number>
  /** 以下分区已与 @homeos/shared AppConfig 契约对齐 */
  frontend?: SharedFrontendConfig
  auth?: Partial<SharedAuthConfig>
  stateStore?: Partial<SharedStateStoreConfig>
  wsPush?: Partial<SharedWsPushConfig>
  commandProxy?: Partial<SharedCommandProxyConfig>
  notification?: Partial<SharedNotificationConfig>
  circadian?: Partial<SharedCircadianConfig>
  water?: Partial<SharedWaterConfig>
  pricing?: Partial<SharedPricingConfig>
  profiles?: Record<string, unknown>
  screensaver?: Record<string, unknown>
  weatherEffects?: Record<string, unknown>
  webrtc?: Partial<SharedWebrtcConfig>
}

/** PUT /system/config 局部 patch（任意分区均可部分更新；保留 index 以兼容动态分区键） */
export type SystemConfigPatch = {
  [K in keyof SystemConfig]?: SystemConfig[K]
} & Record<string, unknown>

/** 系统配置加载选项 */
export interface SystemConfigLoadOptions {
  force?: boolean
}

/** 系统配置保存选项 */
export interface SystemConfigSaveOptions {
  /** 显式指定 revision；默认取缓存 _configUpdatedAt */
  expectedUpdatedAt?: string | null
  /** 跳过乐观锁（仅内部特殊场景） */
  skipRevisionCheck?: boolean
}
