/**
 * 用户偏好 DTO：仅暴露白名单字段，供 /auth/preferences 端点做部分更新。
 *
 * 所属模块：modules/auth/dto（被 AuthController#updatePreferences 作为 ValidationPipe 入参）。
 * 对外 DTO：UpdateUserPreferencesDto（所有字段可选；缺失字段保持原值不改动）。
 * 关键字段：
 *  - defaultTemperature：温控默认目标温度（10–35℃）；
 *  - preferredLightKelvin：偏好色温（2000–6500K）；
 *  - autoNightMode / nightModeTime：自动夜间模式开关与触发时刻（HH:mm）；
 *  - presencePersonId：在家感知绑定的人员配置 ID（不含 person: 前缀）；
 *  - temperatureUnit：摄氏度 / 华氏度。
 * 配合全局 whitelist + forbidNonWhitelisted，拒绝未声明字段越界写入。
 */

import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/** 用户偏好更新（白名单字段） */
export class UpdateUserPreferencesDto {
  @IsOptional()
  @IsNumber({}, { message: 'defaultTemperature 须为数字' })
  @Min(10, { message: 'defaultTemperature 最小为 10' })
  @Max(35, { message: 'defaultTemperature 最大为 35' })
  defaultTemperature?: number;

  @IsOptional()
  @IsNumber({}, { message: 'preferredLightKelvin 须为数字' })
  @Min(2000, { message: 'preferredLightKelvin 最小为 2000' })
  @Max(6500, { message: 'preferredLightKelvin 最大为 6500' })
  preferredLightKelvin?: number;

  @IsOptional()
  @IsBoolean({ message: 'autoNightMode 须为布尔值' })
  autoNightMode?: boolean;

  @IsOptional()
  @IsString({ message: 'nightModeTime 须为字符串' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'nightModeTime 须为 HH:mm 格式' })
  nightModeTime?: string;

  /** 绑定在家感知人员配置 id（不含 person: 前缀） */
  @IsOptional()
  @IsString({ message: 'presencePersonId 须为字符串' })
  presencePersonId?: string;

  @IsOptional()
  @IsString({ message: 'temperatureUnit 须为字符串' })
  @Matches(/^(celsius|fahrenheit)$/, { message: 'temperatureUnit 须为 celsius 或 fahrenheit' })
  temperatureUnit?: 'celsius' | 'fahrenheit';
}
