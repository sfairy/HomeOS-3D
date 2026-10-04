/**
 * 客户端系统信息上报 DTO（数据传输对象）。
 *
 * 职责：
 *  - 定义客户端上报系统信息（硬件、平台、显示、网络、电量等）时的请求体结构。
 *  - 通过 class-validator 装饰器声明字段校验规则，并给出中文校验错误信息。
 *
 * 依赖：
 *  - class-transformer 提供 @Type 装饰器以支持嵌套对象转换。
 *  - class-validator 提供各类校验装饰器。
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 客户端电池信息子 DTO：描述浏览器 Battery API 上报的电量与充放电状态 */
class ClientSystemBatteryDto {
  @IsOptional()
  @IsBoolean({ message: 'battery.supported 须为布尔值' })
  supported?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'battery.level 须为数字' })
  @Min(0, { message: 'battery.level 不能小于 0' })
  @Max(100, { message: 'battery.level 不能大于 100' })
  level?: number | null;

  @IsOptional()
  @IsBoolean({ message: 'battery.charging 须为布尔值' })
  charging?: boolean | null;

  @IsOptional()
  @IsNumber({}, { message: 'battery.chargingTime 须为数字' })
  @Min(0, { message: 'battery.chargingTime 不能小于 0' })
  chargingTime?: number | null;

  @IsOptional()
  @IsNumber({}, { message: 'battery.dischargingTime 须为数字' })
  @Min(0, { message: 'battery.dischargingTime 不能小于 0' })
  dischargingTime?: number | null;

  @IsOptional()
  @IsString({ message: 'battery.unsupportedReason 须为字符串' })
  @MaxLength(32, { message: 'battery.unsupportedReason 最长 32 字符' })
  unsupportedReason?: string;
}

/** 客户端系统信息子 DTO：聚合硬件、平台、显示、能力、网络、电量等子结构 */
class ClientSystemInfoDto {
  @IsOptional()
  @IsObject({ message: 'systemInfo.hardware 须为对象' })
  hardware?: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'systemInfo.platform 须为对象' })
  platform?: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'systemInfo.display 须为对象' })
  display?: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'systemInfo.capabilities 须为对象' })
  capabilities?: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'systemInfo.network 须为对象' })
  network?: Record<string, unknown> | null;

  @IsOptional()
  @ValidateNested({ message: 'systemInfo.battery 格式无效' })
  @Type(() => ClientSystemBatteryDto)
  battery?: ClientSystemBatteryDto;

  @IsOptional()
  @IsString({ message: 'systemInfo.reportedAt 须为字符串' })
  @MaxLength(64, { message: 'systemInfo.reportedAt 最长 64 字符' })
  reportedAt?: string;
}

/** 客户端系统信息上报（含电量） */
export class ClientSystemReportDto {
  @IsString({ message: 'clientId 须为字符串' })
  @MaxLength(128, { message: 'clientId 最长 128 字符' })
  clientId!: string;

  @IsOptional()
  @ValidateNested({ message: 'systemInfo 格式无效' })
  @Type(() => ClientSystemInfoDto)
  systemInfo?: ClientSystemInfoDto;

  /** 配对后终端持有的上报密钥（防伪造开关联动） */
  @IsOptional()
  @IsString({ message: 'reportToken 须为字符串' })
  @MaxLength(128, { message: 'reportToken 最长 128 字符' })
  reportToken?: string;
}