/**
 * 安防面板 DTO：布防模式、区域配置、紧急求助、离家模拟等 REST 请求的入参白名单校验。
 *
 * 所属模块：modules/security/panel（由 SecurityPanelController 作为 ValidationPipe 类型使用）。
 * 对外 DTO：
 *  - ArmSecurityPanelDto：布防模式（disarmed/armed_home/armed_away/armed_night）+ 可选区域列表；
 *  - SecurityZoneDto + ConfigureSecurityZonesDto：传感器分组与覆盖式区域配置；
 *  - SecurityEmergencyDto：紧急求助动作（默认 panic）；
 *  - AwaySimEnableDto：离家模拟自定义灯池与活跃时段。
 * 关键字段：所有 DTO 都用 class-validator 装饰，配合全局 ValidationPipe（whitelist + forbidNonWhitelisted）拒绝未声明字段。
 */

import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// 安防面板布防模式常量：disarmed=撤防 | armed_home=居家布防 | armed_away=离家布防 | armed_night=夜间布防
const ARMING_MODES = ['disarmed', 'armed_home', 'armed_away', 'armed_night'] as const;

/** 布防请求 DTO：指定布防模式与可选的目标区域 ID 列表。 */
export class ArmSecurityPanelDto {
  @IsIn(ARMING_MODES, { message: 'mode 须为 disarmed | armed_home | armed_away | armed_night' })
  mode!: (typeof ARMING_MODES)[number];

  @IsOptional()
  @IsArray({ message: 'zoneIds 须为数组' })
  @IsString({ each: true, message: 'zoneIds 元素须为字符串' })
  zoneIds?: string[];
}

/**
 * 安防区域 DTO，描述一个传感器分组。
 * zoneType: perimeter=外围 | interior=室内 | all=全部（默认）；roomId 关联 HA 区域。
 */
class SecurityZoneDto {
  @IsString({ message: 'id 须为字符串' })
  id!: string;

  @IsString({ message: 'name 须为字符串' })
  name!: string;

  @IsArray({ message: 'sensors 须为数组' })
  @IsString({ each: true, message: 'sensors 元素须为字符串' })
  sensors!: string[];

  /** 可选；服务端 configureZones 会保留既有 armed 状态 */
  @IsOptional()
  @IsBoolean({ message: 'armed 须为布尔值' })
  armed?: boolean;

  @IsOptional()
  @IsString({ message: 'zoneType 须为字符串' })
  zoneType?: string;

  @IsOptional()
  @IsString({ message: 'roomId 须为字符串' })
  roomId?: string;
}

/** 配置安防区域请求 DTO：包含 zones 数组，覆盖式更新。 */
export class ConfigureSecurityZonesDto {
  @IsArray({ message: 'zones 须为数组' })
  @ValidateNested({ each: true })
  @Type(() => SecurityZoneDto)
  zones!: SecurityZoneDto[];
}

/** 紧急求助请求 DTO：action 字段（如 panic），未传时服务端默认 panic。 */
export class SecurityEmergencyDto {
  @IsOptional()
  @IsString({ message: 'action 须为字符串' })
  action?: string;
}

/**
 * 离家模拟启用请求 DTO。
 * lights: 可选自定义灯池；activeStartHour/activeEndHour: 可选活跃时段。
 */
export class AwaySimEnableDto {
  @IsOptional()
  @IsArray({ message: 'lights 须为数组' })
  @IsString({ each: true, message: 'lights 元素须为字符串' })
  lights?: string[];

  @IsOptional()
  @IsNumber({}, { message: 'activeStartHour 须为数字' })
  activeStartHour?: number;

  @IsOptional()
  @IsNumber({}, { message: 'activeEndHour 须为数字' })
  activeEndHour?: number;
}
