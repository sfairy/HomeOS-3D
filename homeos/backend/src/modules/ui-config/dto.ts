/**
 * 职责：
 *  - UI 配置 DTO；
 * 关键依赖：
 *  - class-validator；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** 设置当前激活配置方案的请求体 */
export class SetActiveProfileDto {
  /** 配置方案 ID */
  @IsOptional()
  @IsString({ message: 'projectId 须为字符串' })
  projectId?: string;
}

/** 更新新终端默认策略的请求体 */
export class SetNewTerminalDefaultDto {
  /** 策略值：activeProfile 或 default */
  @IsOptional()
  @IsString({ message: 'newTerminalDefault 须为字符串' })
  newTerminalDefault?: string;
}

/** 终端绑定配置方案的请求体 */
export class TerminalBindingDto {
  /** 终端客户端 ID */
  @IsOptional()
  @IsString({ message: 'clientId 须为字符串' })
  clientId?: string;

  /** 绑定的配置方案 ID */
  @IsOptional()
  @IsString({ message: 'profileId 须为字符串' })
  profileId?: string;

  /** 终端标签（展示用） */
  @IsOptional()
  @IsString({ message: 'label 须为字符串' })
  label?: string;
}

/** 单条导入配置条目 */
class ImportConfigEntryDto {
  /** 配置方案 ID */
  @IsOptional()
  @IsString({ message: 'projectId 须为字符串' })
  projectId?: string;

  /** 布局配置，可为 JSON 字符串或对象 */
  @IsOptional()
  layout?: string | Record<string, unknown>;
}

/** 批量导入 UI 配置的请求体 */
export class ImportAllConfigsDto {
  /** 配置条目数组 */
  @IsOptional()
  @IsArray({ message: 'configs 须为数组' })
  @ValidateNested({ each: true })
  @Type(() => ImportConfigEntryDto)
  configs?: ImportConfigEntryDto[];
}

/** 保存项目 UI 配置的请求体 */
export class SaveProjectConfigDto {
  /** 布局配置，可为 JSON 字符串或对象 */
  @IsOptional()
  layout?: string | Record<string, unknown>;
}

/** 创建目录的请求体 */
export class MkdirDto {
  /** 目录相对路径 */
  @IsString({ message: 'path 须为字符串' })
  path!: string;
}
