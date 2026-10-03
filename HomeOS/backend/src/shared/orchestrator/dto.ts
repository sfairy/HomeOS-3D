/**
 * 联动器（场景 / 脚本 / 自动化）通用 DTO 与列表行类型定义。
 *
 * 所属模块：shared/orchestrator（联动器横切基础设施）
 * 职责：
 *   - 提供场景 / 脚本 / 自动化的创建与更新 DTO 基类，复用 name + runOnHa 校验。
 *   - 提供 YAML 校验、占位符替换、脚本运行等通用请求体 DTO。
 * 关键依赖：
 *   - class-validator：运行时字段类型校验。
 *   - @nestjs/swagger：PartialType 用于生成更新 DTO，ApiPropertyOptional 用于文档。
 */
import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';

/**
 * 场景 / 脚本 / 自动化创建公共：名称 + runOnHa
 *
 * 作为各业务创建 DTO 的基类，统一名称必填、runOnHa 可选的校验规则。
 */
class CreateOrchestratorBaseDto {
  /** 联动器名称，必填 */
  @IsString({ message: 'name 须为字符串' })
  name!: string;

  /** 是否在 HA 上运行，可选 */
  @IsOptional()
  @IsBoolean({ message: 'runOnHa 须为布尔值' })
  runOnHa?: boolean;
}

/**
 * YAML 联动器（脚本 / 自动化）创建公共字段
 *
 * 在基类之上扩展 yaml 必填字段。
 */
class CreateYamlOrchestratorDto extends CreateOrchestratorBaseDto {
  /** YAML 内容，必填 */
  @IsString({ message: 'yaml 须为字符串' })
  yaml!: string;
}

/**
 * 场景创建/更新 DTO
 *
 * 场景以 entities JSON 字符串为执行真相；可选 yaml 保留 HA 原文（有损回退）。
 */
export class CreateSceneDto extends CreateOrchestratorBaseDto {
  /** 实体集合 JSON 字符串，必填 */
  @IsString({ message: 'entities 须为字符串' })
  entities!: string;

  /** HA / 粘贴 YAML 原文（可选；与 entities 一并保存） */
  @ApiPropertyOptional({ description: '场景 YAML 原文' })
  @IsOptional()
  @IsString({ message: 'yaml 须为字符串' })
  yaml?: string;

  /** 场景图 JSON（可选；与 entities 一并保存） */
  @ApiPropertyOptional({ description: '场景图 JSON' })
  @IsOptional()
  geekSceneGraph?: Record<string, unknown> | null;

  /** 叠加执行（可选）：true=仅改变声明实体并在执行前采集快照（可取消恢复） */
  @ApiPropertyOptional({ description: '叠加执行开关' })
  @IsOptional()
  @IsBoolean({ message: 'overlay 须为布尔值' })
  overlay?: boolean;
}

/** 场景更新 DTO：所有字段可选。 */
export class UpdateSceneDto extends PartialType(CreateSceneDto) {}

/**
 * 脚本创建/更新 DTO
 *
 * 脚本属于 YAML 类联动器，直接复用 CreateYamlOrchestratorDto。
 */
export class CreateScriptDto extends CreateYamlOrchestratorDto {
  /** 脚本图 JSON（可选；与 yaml 一并保存） */
  @ApiPropertyOptional({ description: '脚本图 JSON' })
  @IsOptional()
  geekGraph?: Record<string, unknown> | null;
}

/** 脚本更新 DTO：所有字段可选。 */
export class UpdateScriptDto extends PartialType(CreateScriptDto) {}

/**
 * 自动化创建/更新 DTO
 *
 * 在 YAML 类基类上扩展 enabled 启用状态字段。
 */
export class CreateAutomationDto extends CreateYamlOrchestratorDto {
  /** 是否启用，默认 true */
  @ApiPropertyOptional({ description: '是否启用（默认 true）' })
  @IsOptional()
  @IsBoolean({ message: 'enabled 须为布尔值' })
  enabled?: boolean;

  /** 流程图 JSON（可选；与 yaml 一并保存） */
  @ApiPropertyOptional({ description: '流程图 JSON' })
  @IsOptional()
  geekGraph?: Record<string, unknown> | null;
}

/** 自动化更新 DTO：所有字段可选。 */
export class UpdateAutomationDto extends PartialType(CreateAutomationDto) {}

/**
 * YAML 校验请求体 DTO。
 * 用于 POST /orchestrator/validate-yaml 等接口的请求体。
 */
export class ValidateYamlBodyDto {
  /** 待校验的 YAML 字符串，可选 */
  @IsOptional()
  @IsString({ message: 'yaml 须为字符串' })
  yaml?: string;
}

/**
 * 占位符替换请求体 DTO。
 * 用于联动器占位符批量替换接口。
 */
export class ReplacePlaceholdersDto {
  /** 占位符 -> 目标值 的映射对象，可选 */
  @IsOptional()
  @IsObject({ message: 'replacements 须为对象' })
  replacements?: Record<string, string>;
}

/**
 * 运行脚本请求体 DTO。
 * 用于脚本执行接口，可携带运行时变量。
 */
export class RunScriptDto {
  /** 运行时变量对象，可选 */
  @IsOptional()
  @IsObject({ message: 'variables 须为对象' })
  variables?: Record<string, unknown>;
}