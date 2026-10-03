/**
 * 所属模块：backend/modules/template-entity
 * 职责：
 *  - 模板 DTO（class-validator）；
 * 关键依赖：
 *  - class-validator；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';

/** 校验模板 YAML 的请求体 */
export class ValidateTemplateYamlDto {
  /** 待校验的 YAML 文本（模板 DSL） */
  @IsString({ message: 'yaml 须为字符串' })
  yaml!: string;
}

/** 创建模板实体的请求体 */
export class CreateTemplateEntityDto {
  /** 模板实体名称（展示用） */
  @IsString({ message: 'name 须为字符串' })
  name!: string;

  /** 模板类型，例如 sensor / binary_sensor / trigger 等 */
  @IsString({ message: 'type 须为字符串' })
  type!: string;

  /** 模板 DSL 的 YAML 文本 */
  @IsString({ message: 'yaml 须为字符串' })
  yaml!: string;

  /** 家电模板的槽位映射（slot -> entity_id） */
  @IsOptional()
  @IsObject({ message: 'slotMapping 须为对象' })
  slotMapping?: Record<string, string>;
}

/** 更新模板实体的请求体（所有字段可选） */
export class UpdateTemplateEntityDto {
  /** 模板实体名称 */
  @IsOptional()
  @IsString({ message: 'name 须为字符串' })
  name?: string;

  /** 模板类型 */
  @IsOptional()
  @IsString({ message: 'type 须为字符串' })
  type?: string;

  /** 模板 DSL 的 YAML 文本 */
  @IsOptional()
  @IsString({ message: 'yaml 须为字符串' })
  yaml?: string;

  /** 槽位映射；传 null 表示清空 */
  @IsOptional()
  @IsObject({ message: 'slotMapping 须为对象' })
  slotMapping?: Record<string, string> | null;

  /** YAML 是否完整（导入占位片段时为 false） */
  @IsOptional()
  @IsBoolean({ message: 'yamlComplete 须为布尔值' })
  yamlComplete?: boolean;
}

/** 从 JSON 配置包导入模板实体的请求体 */
export class ImportTemplateConfigDto {
  /** 模板实体名称 */
  @IsString({ message: 'name 须为字符串' })
  name!: string;

  /** 模板类型 */
  @IsString({ message: 'type 须为字符串' })
  type!: string;

  /** 模板 DSL 的 YAML 文本 */
  @IsString({ message: 'yaml 须为字符串' })
  yaml!: string;

  /** 槽位映射，可为扁平对象或带元信息的结构 */
  @IsOptional()
  @IsObject({ message: 'slotMapping 须为对象' })
  slotMapping?: Record<string, string> | { mapping: Record<string, string>; slotsMeta?: unknown[] };

  /** 额外追加的计量单位（unit_of_measurement） */
  @IsOptional()
  @IsString({ message: 'extraUnit 须为字符串' })
  extraUnit?: string;

  /** 额外追加的设备类别（device_class） */
  @IsOptional()
  @IsString({ message: 'extraDeviceClass 须为字符串' })
  extraDeviceClass?: string;

  /** 额外追加的图标（icon） */
  @IsOptional()
  @IsString({ message: 'extraIcon 须为字符串' })
  extraIcon?: string;
}

/** 管理员粘贴 configuration.yaml 原文导入的请求体 */
export class ImportTemplateYamlDto {
  /** 模板实体名称 */
  @IsString({ message: 'name 须为字符串' })
  name!: string;

  /** 粘贴的 YAML 原文 */
  @IsString({ message: 'yaml 须为字符串' })
  yaml!: string;

  /** 可选的 HA 配置 ID（unique_id），未提供则从 YAML 解析 */
  @IsOptional()
  @IsString({ message: 'haConfigId 须为字符串' })
  haConfigId?: string;

  /** 可选的实体 ID，用于关联已有 HA 实体 */
  @IsOptional()
  @IsString({ message: 'entity_id 须为字符串' })
  entity_id?: string;
}

/** 配置 HA 配置目录（configuration.yaml 所在路径）的请求体 */
export class ConfigureHaConfigDirDto {
  /** HA 配置目录路径，可为本地路径或 UNC 路径 */
  @IsString({ message: 'path 须为字符串' })
  path!: string;

  /** SMB 用户名（UNC 路径场景使用） */
  @IsOptional()
  @IsString({ message: 'user 须为字符串' })
  user?: string;

  /** SMB 密码（UNC 路径场景使用） */
  @IsOptional()
  @IsString({ message: 'password 须为字符串' })
  password?: string;
}