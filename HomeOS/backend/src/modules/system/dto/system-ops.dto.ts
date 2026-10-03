/**
 * 系统运维日程提醒请求 DTO
 *
 * 所属模块：system/dto
 * 职责：定义新增与推迟日程提醒的请求体校验结构，
 *  配合 class-validator 进行入参校验（含枚举取值与数值范围限制）。
 */
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/** 新增日程提醒请求体 */
export class AddReminderDto {
  /** 提醒类型标识（如 trash/meeting 等） */
  @IsString({ message: 'type 须为字符串' })
  type!: string;

  /** 提醒显示名称 */
  @IsString({ message: 'label 须为字符串' })
  label!: string;

  /** 提醒图标标识 */
  @IsString({ message: 'icon 须为字符串' })
  icon!: string;

  /** 重复频率：每周 / 每两周 / 每月 / 每天 / 自定义 */
  @IsIn(['weekly', 'biweekly', 'monthly', 'daily', 'custom'], { message: 'frequency 取值无效' })
  frequency!: 'weekly' | 'biweekly' | 'monthly' | 'daily' | 'custom';

  /** 一周中的第几天（0=周日，6=周六） */
  @IsInt({ message: 'dayOfWeek 须为整数' })
  @Min(0, { message: 'dayOfWeek 不能小于 0' })
  @Max(6, { message: 'dayOfWeek 不能大于 6' })
  dayOfWeek!: number;

  /** 自定义提醒日数组（与 frequency=custom 配合使用） */
  @IsArray({ message: 'customDays 须为数组' })
  @IsInt({ each: true, message: 'customDays 各元素须为整数' })
  customDays!: number[];

  /** 提醒展示颜色 */
  @IsString({ message: 'color 须为字符串' })
  color!: string;

  /** 提醒时间 HH:MM（如 07:00 / 21:30），空或非法时回退 07:00 */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time 须为 HH:MM 格式' })
  time?: string;
}

/** 推迟日程提醒请求体 */
export class SnoozeReminderDto {
  /** 待推迟的提醒 ID */
  @IsString({ message: 'id 须为字符串' })
  id!: string;

  /** 推迟时长（分钟，1-1440） */
  @IsOptional()
  @IsInt({ message: 'minutes 须为整数' })
  @Min(1, { message: 'minutes 不能小于 1' })
  @Max(1440, { message: 'minutes 不能大于 1440' })
  minutes?: number;
}