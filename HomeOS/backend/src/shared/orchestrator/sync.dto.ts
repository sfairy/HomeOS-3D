/**
 * 联动器 HA 同步相关 DTO。
 *
 * 所属模块：shared/orchestrator（联动器横切基础设施）
 * 职责：
 *   - 定义从 HA 同步 / 从 HA 移除联动器时的请求体校验契约，
 *     供 orchestrator-sync-routes.mixin 中各 POST 端点使用。
 *   - 通过 class-validator 装饰器声明字段类型校验，
 *     配合 NestJS ValidationPipe 完成入参校验。
 *   - Template* 变体扩展模板实体专用字段（yaml / trigger_entity_id 等）。
 * 关键依赖：
 *   - @nestjs/swagger：ApiProperty / ApiPropertyOptional 用于 OpenAPI 文档。
 *   - class-validator：IsString / IsOptional / IsBoolean 提供运行时校验。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

/**
 * 从 HA 同步单条联动器的请求体。
 * 用于 POST sync/from-ha。
 */
export class SyncFromHaDto {
  /** HA 配置 ID，标识 HA 侧的一条配置项 */
  @IsString({ message: 'HA配置ID须为字符串' })
  @ApiProperty({ description: 'HA 配置 ID' })
  haConfigId!: string;

  /** 是否在 HA 上立即执行（仅对脚本/自动化类有意义） */
  @IsOptional()
  @IsBoolean({ message: 'runOnHa 须为布尔值' })
  @ApiPropertyOptional({ description: '是否在 HA 上执行' })
  runOnHa?: boolean;
}

/**
 * 从 HA 移除联动器的请求体。
 * 用于 POST sync/remove-from-ha。
 */
export class RemoveFromHaDto {
  /** HA 配置 ID，标识待移除的 HA 侧配置项 */
  @IsString({ message: 'HA配置ID须为字符串' })
  @ApiProperty({ description: 'HA 配置 ID' })
  haConfigId!: string;

  /** HA 实体 ID，用于在 HA 侧精准定位实体（保留原名，HA 概念） */
  @IsOptional()
  @IsString({ message: 'entity_id 须为字符串' })
  @ApiPropertyOptional()
  entity_id?: string;

  /** 实体名称，便于日志与上下文展示 */
  @IsOptional()
  @IsString({ message: 'name 须为字符串' })
  @ApiPropertyOptional()
  name?: string;

  /** HA config entry ID（保留原名，HA 概念） */
  @IsOptional()
  @IsString({ message: 'ha_config_entry_id 须为字符串' })
  @ApiPropertyOptional()
  ha_config_entry_id?: string;

  /** config entry ID（保留原名，HA 概念） */
  @IsOptional()
  @IsString({ message: 'config_entry_id 须为字符串' })
  @ApiPropertyOptional()
  config_entry_id?: string;
}

/**
 * 模板实体从 HA 同步（扩展字段）
 *
 * 在 SyncFromHaDto 基础上扩展模板专用字段，用于模板类型联动器
 * （如 trigger-based sensor 等）的同步入参校验。
 */
export class TemplateSyncFromHaDto extends SyncFromHaDto {
  /** 模板 YAML 内容 */
  @IsOptional()
  @IsString({ message: 'yaml 须为字符串' })
  @ApiPropertyOptional()
  yaml?: string;

  /** 模板实体名称 */
  @IsOptional()
  @IsString({ message: 'name 须为字符串' })
  @ApiPropertyOptional()
  name?: string;

  /** 模板对应的 entity_id（保留原名，HA 概念） */
  @IsOptional()
  @IsString({ message: 'entity_id 须为字符串' })
  @ApiPropertyOptional()
  entity_id?: string;

  /** 模板类型（如 sensor / template 等） */
  @IsOptional()
  @IsString({ message: 'type 须为字符串' })
  @ApiPropertyOptional()
  type?: string;

  /** YAML 来源标识（如 ha / manual） */
  @IsOptional()
  @IsString({ message: 'yaml_source 须为字符串' })
  @ApiPropertyOptional()
  yaml_source?: string;

  /** YAML 是否已完整（部分拉取场景下可能为 false） */
  @IsOptional()
  @IsBoolean({ message: 'yaml_complete 须为布尔值' })
  @ApiPropertyOptional()
  yaml_complete?: boolean;

  /** HA config entry ID（保留原名，HA 概念） */
  @IsOptional()
  @IsString({ message: 'ha_config_entry_id 须为字符串' })
  @ApiPropertyOptional()
  ha_config_entry_id?: string;

  /** 触发该模板的 entity_id（保留原名，HA 概念） */
  @IsOptional()
  @IsString({ message: 'trigger_entity_id 须为字符串' })
  @ApiPropertyOptional()
  trigger_entity_id?: string;
}

/**
 * 模板实体从 HA 移除（字段与 RemoveFromHaDto 相同，保留类型别名便于控制器语义）
 */
export class TemplateRemoveFromHaDto extends RemoveFromHaDto {}