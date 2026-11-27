import { type EnvSensorMap, type SharedCircadianConfig, type SharedCommandProxyConfig, type SharedEnergyConfig, type SharedIaqConfig, type SharedExternalConfig, type SharedFrontendConfig, type SharedHaConnectorConfig, type SharedHomeModeConfig, type SharedNotificationConfig, type SharedOpsConfig, type SharedOtherConfig, type SharedPricingConfig, type SharedSecurityConfig, type SharedStateStoreConfig, type SharedVoiceConfig, type SharedWaterConfig, type SharedWebrtcConfig, type SharedWsPushConfig } from '@homeos/shared'
import { type ClientPowerSettings } from '@/kernel/types/client-power'

/**
 * 高级运行参数编辑器：分区 / 字段结构。
 * 用于系统配置编辑器的动态表单渲染与序列化。
 */

/** 配置字段类型：string=字符串，number=数值，boolean=布尔，password=密码，array=数组，object=对象，entity=实体，entity-list=实体列表，select=下拉选择，
 * multi-select=固定选项多选（来源静音 / 免打扰星期） */
type SystemConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'password'
  | 'array'
  | 'object'
  | 'entity'
  | 'entity-list'
  | 'multi-select'
  | 'select'

/** 可编辑配置字段 */
export interface EditableConfigField {
  key: string // 字段 key
  type: SystemConfigFieldType | string // 字段类型
  value: string | number | boolean // 字段值
  isMasked?: boolean // 是否脱敏显示（password 类型）
}

/** 可编辑配置分区 */
export interface EditableConfigSection {
  key: string // 分区 key
  label: string // 分区展示名称
  fields: EditableConfigField[] // 字段列表
}

/** fromEditableSections 序列化结果：sectionKey -> fieldKey -> value */
export type EditableConfigSnapshot = Record<string, Record<string, unknown>>

/** 待保存字段 key（格式：sectionKey:fieldKey） */
export type SystemConfigPendingFieldKey = `${string}:${string}`

/**
 * 系统配置类型：后端 GET/PUT /system/config 响应体与局部 patch。
 * 分区类型优先引用 @homeos/shared，避免 FE 平行重声明漂移。
 */

/** 后端 GET/PUT /system/config 响应体（分区结构与 AppConfigData 对齐） */
export interface SystemConfig {
  _version?: number
  /** 乐观锁 revision，与 SystemConfig.updatedAt 一致 */
  _configUpdatedAt?: string
  _configAudit?: unknown[]
  envSensorMap?: EnvSensorMap
  energy?: Partial<SharedEnergyConfig>
  iaq?: Partial<SharedIaqConfig>
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
  stateStore?: Partial<SharedStateStoreConfig>
  wsPush?: Partial<SharedWsPushConfig>
  commandProxy?: Partial<SharedCommandProxyConfig>
  notification?: Partial<SharedNotificationConfig>
  circadian?: Partial<SharedCircadianConfig>
  water?: Partial<SharedWaterConfig>
  pricing?: Partial<SharedPricingConfig>
  profiles?: Record<string, unknown>
  screensaver?: Record<string, unknown>
  webrtc?: Partial<SharedWebrtcConfig>
}

/** PUT /system/config 局部 patch（任意分区均可部分更新；index 支持动态分区键） */
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
