/**
 * @file energy/dto.ts
 * @module backend/src/modules
 *
 * 能源模块请求 DTO：
 *  - CircuitBreakdownDto：分路用电计量请求体（分类名 → entity_id 列表）
 *  - EnergyBudgetDto：月度预算设置请求体（kWh / 元，均可选）
 *  - UpdateTieredPricingDto：阶梯电价配置更新请求体（档位 / 单价 / 分时段 / 用量）
 *
 * 使用 class-validator 装饰器校验，由 NestJS ValidationPipe 自动执行。
 */
import { IsString, IsOptional, IsObject, IsNumber, IsArray, IsBoolean } from 'class-validator';

/**
 * 分路用电计量请求体。
 * circuitMap 为分类名（如「空调」「厨卫」）到 entity_id 列表的映射；
 * hours 可选，缺省由服务端按学习周期回退。
 */
export class CircuitBreakdownDto {
  @IsObject({ message: 'circuitMap 须为对象' })
  circuitMap!: Record<string, string[]>;

  @IsOptional()
  @IsString({ message: 'hours 须为字符串' })
  hours?: string;
}

/**
 * 月度能源预算设置请求体。
 * monthlyKwh / monthlyCost 均可选，仅更新提供的字段。
 */
export class EnergyBudgetDto {
  @IsOptional()
  @IsNumber({}, { message: 'monthlyKwh 须为数字' })
  monthlyKwh?: number;

  @IsOptional()
  @IsNumber({}, { message: 'monthlyCost 须为数字' })
  monthlyCost?: number;
}

/**
 * 阶梯电价配置更新请求体。
 * 支持阶梯 / 固定两种 pricingMode，分时段峰谷平字段，以及 tiers 数组配置。
 * 用于 Widget 快捷编辑与高级参数同步。
 */
export class UpdateTieredPricingDto {
  @IsOptional()
  @IsNumber({}, { message: 'monthUsage 须为数字' })
  monthUsage?: number;

  @IsOptional()
  @IsNumber({}, { message: 'yearUsage 须为数字' })
  yearUsage?: number;

  @IsOptional()
  @IsNumber({}, { message: 'daysInMonth 须为数字' })
  daysInMonth?: number;

  @IsOptional()
  @IsNumber({}, { message: 'currentDay 须为数字' })
  currentDay?: number;

  @IsOptional()
  @IsArray({ message: 'tiers 须为数组' })
  tiers?: Array<{
    label: string;
    maxKwh: number | null;
    pricePerKwh: number;
  }>;

  @IsOptional()
  @IsString({ message: 'pricingMode 须为字符串' })
  pricingMode?: 'tiered' | 'fixed';

  @IsOptional()
  @IsNumber({}, { message: 'fixedPrice 须为数字' })
  fixedPrice?: number;

  @IsOptional()
  @IsString({ message: 'regionLabel 须为字符串' })
  regionLabel?: string;

  @IsOptional()
  @IsBoolean({ message: 'timeOfUseEnabled 须为布尔值' })
  timeOfUseEnabled?: boolean;

  @IsOptional()
  @IsString({ message: 'peakStart1 须为字符串' })
  peakStart1?: string;

  @IsOptional()
  @IsString({ message: 'peakEnd1 须为字符串' })
  peakEnd1?: string;

  @IsOptional()
  @IsString({ message: 'peakStart2 须为字符串' })
  peakStart2?: string;

  @IsOptional()
  @IsString({ message: 'peakEnd2 须为字符串' })
  peakEnd2?: string;

  @IsOptional()
  @IsString({ message: 'valleyStart 须为字符串' })
  valleyStart?: string;

  @IsOptional()
  @IsString({ message: 'valleyEnd 须为字符串' })
  valleyEnd?: string;

  @IsOptional()
  @IsNumber({}, { message: 'peakPrice 须为数字' })
  peakPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'valleyPrice 须为数字' })
  valleyPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'flatPrice 须为数字' })
  flatPrice?: number;
}
