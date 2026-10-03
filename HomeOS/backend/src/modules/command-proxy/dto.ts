/**
 * 命令代理 DTO 定义
 *
 * 所属模块：command-proxy
 * 职责：定义 HA 服务调用、WebRTC 信令、HA 连通性探测接口的请求体验证规则。
 * 依赖：class-validator（装饰器校验）。
 */
import { IsString, IsOptional, IsObject, IsBoolean, IsNumber, IsNotEmpty } from 'class-validator';

/**
 * HA 服务调用 DTO（数据传输对象）
 * 定义调用 Home Assistant 服务时所需的参数结构。
 * 通过 class-validator 装饰器实现自动验证和类型转换。
 */
export class CallServiceDto {
  @IsString({ message: 'domain 须为字符串' })
  domain!: string; // 服务域，如 'light', 'switch', 'climate'

  @IsString({ message: 'service 须为字符串' })
  service!: string; // 服务名称，如 'turn_on', 'turn_off', 'set_temperature'

  @IsString({ message: 'entity_id 须为字符串' })
  entity_id!: string; // 目标实体 ID，如 'light.living_room'

  @IsOptional()
  @IsObject({ message: 'service_data 须为对象' })
  service_data?: Record<string, unknown>; // 服务的额外参数，如 { brightness: 255 }（可选）

  @IsOptional()
  @IsBoolean({ message: 'return_response 须为布尔值' })
  return_response?: boolean; // 是否要求 HA 返回执行结果（可选）

  @IsOptional()
  @IsString({ message: 'idempotency_key 须为字符串' })
  idempotency_key?: string; // 幂等键，防止重复下发（可选）
}

/** WebRTC SDP 协商请求体：携带摄像头实体 ID 与客户端 Offer SDP */
export class WebRtcNegotiateDto {
  @IsString({ message: 'entity_id 须为字符串' })
  @IsNotEmpty({ message: 'entity_id 必填' })
  entity_id!: string;

  @IsString({ message: 'offer 须为字符串' })
  @IsNotEmpty({ message: 'offer 必填' })
  offer!: string;
}

/** WebRTC ICE candidate 上报请求体：按 session_id 关联到对应协商会话 */
export class WebRtcCandidateDto {
  @IsString({ message: 'entity_id 须为字符串' })
  @IsNotEmpty({ message: 'entity_id 必填' })
  entity_id!: string;

  @IsString({ message: 'session_id 须为字符串' })
  @IsNotEmpty({ message: 'session_id 必填' })
  session_id!: string;

  @IsObject({ message: 'candidate 须为对象' })
  candidate!: Record<string, unknown>;
}

/** WebRTC 会话关闭请求体：取消 HA 端对应 subscription 释放资源 */
export class WebRtcCloseDto {
  @IsString({ message: 'entity_id 须为字符串' })
  @IsNotEmpty({ message: 'entity_id 必填' })
  entity_id!: string;

  @IsNumber({}, { message: 'subscription_id 须为数字' })
  subscription_id!: number;
}

/** HA 连通性探测请求体：管理员从服务端发起，校验容器内可达性（部署前预检） */
export class HaTestConnectionDto {
  @IsString({ message: 'url 须为字符串' })
  @IsNotEmpty({ message: 'url 必填' })
  url!: string;

  @IsString({ message: 'token 须为字符串' })
  @IsNotEmpty({ message: 'token 必填' })
  token!: string;
}
