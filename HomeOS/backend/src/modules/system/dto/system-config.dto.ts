/**
 * 系统配置更新请求 DTO
 *
 * 所属模块：system/dto
 * 职责：定义 PUT /system/config 分区局部更新的请求体校验结构，
 *  以及重置配置分区的请求体。各分区字段均为可选，类型由 AppConfigData 派生。
 * 依赖：class-validator（结构校验）、AppConfigData（配置类型来源）。
 */
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';
import type { AppConfigData } from '../../../shared/app-config/types';
import type { RetentionConfig } from '../../../common/database/retention-tables';

/** 分区可选的深度部分更新类型（各分区字段均可选，匹配 PUT /system/config 的局部更新语义） */
type DeepPartialAppConfig = {
  [K in keyof AppConfigData]?: Partial<AppConfigData[K]>;
};

/**
 * 系统配置分区更新（各分区均为可选）。
 * 类型由 AppConfigData 派生（替代裸 Record<string, unknown>），class-validator 仅做结构校验。
 */
export class UpdateSystemConfigDto {
  /** 乐观锁：与 GET /system/config 返回的 _configUpdatedAt 一致，冲突时 409 */
  @IsOptional()
  @IsString({ message: 'expectedUpdatedAt 须为 ISO 时间字符串' })
  expectedUpdatedAt?: string;
  /** 认证分区配置（可选） */
  @IsOptional() @IsObject({ message: 'auth 须为对象' }) auth?: DeepPartialAppConfig['auth'];
  /** 通知分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'notification 须为对象' })
  notification?: DeepPartialAppConfig['notification'];
  /** 安防分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'security 须为对象' })
  security?: DeepPartialAppConfig['security'];
  /** 水务分区配置（可选） */
  @IsOptional() @IsObject({ message: 'water 须为对象' }) water?: DeepPartialAppConfig['water'];
  /** 昼夜节律光照分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'circadian 须为对象' })
  circadian?: DeepPartialAppConfig['circadian'];
  /** 自适应气候分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'adaptiveClimate 须为对象' })
  adaptiveClimate?: DeepPartialAppConfig['adaptiveClimate'];
  /** 智能化分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'intelligence 须为对象' })
  intelligence?: DeepPartialAppConfig['intelligence'];
  /** 能源分区配置（可选） */
  @IsOptional() @IsObject({ message: 'energy 须为对象' }) energy?: DeepPartialAppConfig['energy'];
  /** 计价分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'pricing 须为对象' })
  pricing?: DeepPartialAppConfig['pricing'];
  /** 设备分区配置（可选） */
  @IsOptional() @IsObject({ message: 'device 须为对象' }) device?: DeepPartialAppConfig['device'];
  /** 自动化分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'automation 须为对象' })
  automation?: DeepPartialAppConfig['automation'];
  /** 其它分区配置（可选） */
  @IsOptional() @IsObject({ message: 'other 须为对象' }) other?: DeepPartialAppConfig['other'];
  /** 前端分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'frontend 须为对象' })
  frontend?: DeepPartialAppConfig['frontend'];
  /** 能源预算分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'energyBudget 须为对象' })
  energyBudget?: DeepPartialAppConfig['energyBudget'];
  /** 场景档案分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'profiles 须为对象' })
  profiles?: DeepPartialAppConfig['profiles'];
  /** UI 分区配置（可选） */
  @IsOptional() @IsObject({ message: 'ui 须为对象' }) ui?: DeepPartialAppConfig['ui'];
  /** 屏保分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'screensaver 须为对象' })
  screensaver?: DeepPartialAppConfig['screensaver'];
  /** 天气特效分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'weatherEffects 须为对象' })
  weatherEffects?: DeepPartialAppConfig['weatherEffects'];
  /** 外部集成分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'external 须为对象' })
  external?: DeepPartialAppConfig['external'];
  /** 环境传感器映射（可选，整体替换） */
  @IsOptional()
  @IsObject({ message: 'envSensorMap 须为对象' })
  envSensorMap?: AppConfigData['envSensorMap'];
  /** 媒体播放列表（可选，整体替换） */
  @IsOptional()
  @IsObject({ message: 'mediaPlaylists 须为对象' })
  mediaPlaylists?: AppConfigData['mediaPlaylists'];
  /** 语音分区配置（可选） */
  @IsOptional() @IsObject({ message: 'voice 须为对象' }) voice?: DeepPartialAppConfig['voice'];
  /** 语音命令列表（可选，整体替换） */
  @IsOptional()
  @IsArray({ message: 'voiceCommands 须为数组' })
  voiceCommands?: AppConfigData['voiceCommands'];
  /** HA 连接器分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'haConnector 须为对象' })
  haConnector?: DeepPartialAppConfig['haConnector'];
  /** 运维分区配置（可选） */
  @IsOptional() @IsObject({ message: 'ops 须为对象' }) ops?: DeepPartialAppConfig['ops'];
  /** 状态存储分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'stateStore 须为对象' })
  stateStore?: DeepPartialAppConfig['stateStore'];
  /** WebSocket 推送分区配置（可选） */
  @IsOptional() @IsObject({ message: 'wsPush 须为对象' }) wsPush?: DeepPartialAppConfig['wsPush'];
  /** 命令代理分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'commandProxy 须为对象' })
  commandProxy?: DeepPartialAppConfig['commandProxy'];
  /** WebRTC 分区配置（可选） */
  @IsOptional() @IsObject({ message: 'webrtc 须为对象' }) webrtc?: DeepPartialAppConfig['webrtc'];
  /** 家庭模式分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'homeMode 须为对象' })
  homeMode?: DeepPartialAppConfig['homeMode'];
  /** 客户端功耗分区配置（可选） */
  @IsOptional()
  @IsObject({ message: 'clientPower 须为对象' })
  clientPower?: DeepPartialAppConfig['clientPower'];
  /** 数据保留分区配置（可选，各表保留天数 1~365） */
  @IsOptional()
  @IsObject({ message: 'retention 须为对象' })
  retention?: DeepPartialAppConfig['retention'];
}

/**
 * 数据保留策略更新请求体（PUT /system/config/retention）。
 * 与 UpdateSystemConfigDto 分离：本接口仅允许调整 retention 分区，
 * 字段值范围（1~365）由 AppConfigService 校验层负责。
 */
export class UpdateRetentionConfigDto {
  /** 表键 → 保留天数（部分更新，未提供的表保持原值） */
  @IsOptional()
  @IsObject({ message: 'retention 须为对象' })
  retention?: Partial<RetentionConfig>;
}

/**
 * 重置系统配置分区请求体。
 * 传入 section 时仅重置指定分区，缺省重置全部。
 */
export class ResetSystemConfigDto {
  /** 待重置的分区名称（可选，缺省重置全部） */
  @IsOptional()
  @IsString({ message: 'section 须为字符串' })
  section?: string;
}