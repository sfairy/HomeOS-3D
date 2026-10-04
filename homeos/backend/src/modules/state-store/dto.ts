/**
 * 状态存储 DTO 定义
 *
 * 职责：定义实体批量区域更新与引用解绑接口的请求体验证规则。
 * 依赖：class-validator（装饰器校验）
 */
import { IsArray, IsOptional, IsString } from 'class-validator';

/** 批量更新实体房间 / 通用实体集合请求体 */
export class StateStoreQueryDto {
  @IsOptional()
  @IsArray({ message: 'entity_ids 须为数组' })
  @IsString({ each: true, message: 'entity_ids 每项须为字符串' })
  entity_ids?: string[];

  @IsOptional()
  @IsString({ message: 'area_id 须为字符串' })
  area_id?: string;
}

/** 从指定功能配置中解除实体引用 */
export class UnlinkEntityReferenceDto {
  @IsOptional()
  @IsString({ message: 'kind 须为字符串' })
  kind?: string;

  @IsOptional()
  @IsString({ message: 'id 须为字符串' })
  id?: string;

  @IsOptional()
  @IsString({ message: 'detail 须为字符串' })
  detail?: string;
}
