/**
 * 环境模块请求 DTO
 *
 * 所属模块：environment
 * 职责：定义 IAQ 综合指数计算接口的入参校验结构（pm25 / co2 / tvoc / 温度 / 湿度均为可选）。
 * 依赖：class-validator（数值校验）。
 */
import { IsOptional, IsNumber } from 'class-validator';

/** IAQ 综合指数计算请求体，各传感器读数均为可选，缺省项不参与加权计算。 */
export class ComputeIaqDto {
  @IsOptional()
  @IsNumber({}, { message: 'pm25 须为数字' })
  pm25?: number;

  @IsOptional()
  @IsNumber({}, { message: 'co2 须为数字' })
  co2?: number;

  @IsOptional()
  @IsNumber({}, { message: 'tvoc 须为数字' })
  tvoc?: number;

  @IsOptional()
  @IsNumber({}, { message: 'temperature 须为数字' })
  temperature?: number;

  @IsOptional()
  @IsNumber({}, { message: 'humidity 须为数字' })
  humidity?: number;
}
