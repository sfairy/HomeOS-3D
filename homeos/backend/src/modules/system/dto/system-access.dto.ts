/**
 * 系统门禁/访问相关请求 DTO
 *
 * 职责：定义访客通行码、通行码延期与儿童模式的请求体校验结构，
 *  配合 class-validator 进行入参校验。
 */
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 创建访客通行码请求体。
 * 指定门锁实体、可选槽位号与有效期小时数，可自定义通行码。
 */
export class CreateGuestPassDto {
  /** 访客名称 */
  @IsString({ message: 'name 须为字符串' })
  name!: string;

  /** 目标门锁实体 ID */
  @IsString({ message: 'lockEntityId 须为字符串' })
  lockEntityId!: string;

  /** 门锁用户槽位号（可选） */
  @IsOptional()
  @IsNumber({}, { message: 'slot 须为数字' })
  slot?: number;

  /** 通行码有效时长（小时，1–168） */
  @IsOptional()
  @IsNumber({}, { message: 'durationHours 须为数字' })
  @Min(1, { message: 'durationHours 最小为 1' })
  @Max(168, { message: 'durationHours 最大为 168' })
  durationHours?: number;

  /** 自定义通行码（可选，缺省由系统生成） */
  @IsOptional()
  @IsString({ message: 'code 须为字符串' })
  code?: string;
}

/**
 * 单个访客通行码延期请求体。
 */
export class ExtendGuestPassDto {
  /** 延长的小时数（可选） */
  @IsOptional()
  @IsNumber({}, { message: 'hours 须为数字' })
  hours?: number;
}

/**
 * 批量访客通行码延期请求体。
 */
export class ExtendGuestPassesDto {
  /** 待延期的通行码 ID 列表 */
  @IsArray({ message: 'ids 须为数组' })
  @IsString({ each: true, message: 'ids 每项须为字符串' })
  ids!: string[];

  /** 延长的小时数（可选） */
  @IsOptional()
  @IsNumber({}, { message: 'hours 须为数字' })
  hours?: number;
}

/**
 * 儿童模式时间窗条目。
 * days 支持 0-6 数字数组（0=周日）或 'weekday' / 'weekend' 快捷维度。
 */
class ChildModeTimeWindowDto {
  /** 适用日期：0-6 数组（0=周日）或 'weekday'（周一至周五）/ 'weekend'（周六日） */
  @IsArray({ message: 'days 须为数组' })
  @IsOptional()
  days: number[] | 'weekday' | 'weekend' = [];

  /** 开始时间 HH:mm（24 小时制，可选） */
  @IsOptional()
  @IsString({ message: 'start 须为字符串' })
  start: string = '';

  /** 结束时间 HH:mm（24 小时制，可选），支持跨午夜（如 21:00-07:00） */
  @IsOptional()
  @IsString({ message: 'end 须为字符串' })
  end: string = '';
}

/**
 * 更新儿童模式设置请求体。
 * 含开关、每日媒体时长限制，
 * 以及「设备白名单 + 时间窗」模式（deviceWhitelist 非空时启用）。
 */
export class UpdateChildModeDto {
  /** 是否启用儿童模式（可选） */
  @IsOptional()
  @IsBoolean({ message: 'enabled 须为布尔值' })
  enabled?: boolean;

  /** 每日媒体时长上限（分钟，可选） */
  @IsOptional()
  @IsNumber({}, { message: 'dailyMediaLimitMin 须为数字' })
  dailyMediaLimitMin?: number;

  /** 设备白名单 entity_id 列表（可选）；非空时启用「白名单 + 时间窗」模式 */
  @IsOptional()
  @IsArray({ message: 'deviceWhitelist 须为数组' })
  @IsString({ each: true, message: 'deviceWhitelist 每项须为字符串' })
  deviceWhitelist?: string[];

  /** 白名单设备允许使用的时间窗数组（可选，嵌套校验） */
  @IsOptional()
  @IsArray({ message: 'timeWindows 须为数组' })
  @ValidateNested({ each: true })
  @Type(() => ChildModeTimeWindowDto)
  timeWindows?: ChildModeTimeWindowDto[];
}

/**
 * 临时覆盖儿童模式请求体（如临时解锁若干分钟）。
 */
export class OverrideChildModeDto {
  /** 覆盖持续时长（分钟，可选） */
  @IsOptional()
  @IsNumber({}, { message: 'minutes 须为数字' })
  minutes?: number;
}
