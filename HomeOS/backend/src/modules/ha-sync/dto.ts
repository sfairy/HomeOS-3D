/**
 * HA 同步模块 - 数据传输对象（DTO）定义。
 *
 * 职责：声明 ha-sync 控制器在接收 HTTP 请求时使用的入参校验结构，
 * 依托 class-validator 装饰器完成请求体校验，校验失败由 NestJS 全局过滤器统一返回 400。
 *
 * 依赖：class-validator（校验装饰器）。
 */
import { IsOptional, IsString } from 'class-validator';

/**
 * 校验 HA YAML（自动化/脚本/模板/通用）请求体。
 *
 * 用于 POST /api/v1/ha-sync/validate-yaml 接口，承载待验证的 YAML 文本，
 * 可选 type 字段用于显式指定 YAML 类型，避免在内容歧义时误判。
 */
export class ValidateHaYamlDto {
  /** 待验证的 YAML 文本（必填） */
  @IsString({ message: 'yaml 须为字符串' })
  yaml!: string;

  /**
   * YAML 类型提示（可选）。
   * 取值：'automation' | 'script' | 'template'；未提供时由控制器按 YAML 关键字正则推断。
   */
  @IsOptional()
  @IsString({ message: 'type 须为字符串' })
  type?: string;
}
