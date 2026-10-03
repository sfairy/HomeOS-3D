/**
 * 通过 HA 实体执行 scene/script 的 turn_on 调用
 *
 * 所属模块：shared/orchestrator
 * 职责：
 *   - 封装 scene / script runOnHa 路径共用的 HA 实体触发逻辑
 *   - 统一拼装 entity_id（domain + haConfigId）并调用 HA 服务
 *   - 失败时抛出 ServiceUnavailableException，由上层异常过滤器处理
 * 关键依赖：
 *   - @nestjs/common（ServiceUnavailableException）
 *   - ../utils（getErrorMessage 用于规范化异常消息）
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { getErrorMessage, rethrowIfHttpException } from '../../common/utils';

/**
 * 通过 HA 实体执行 turn_on 服务调用
 *
 * 调用场景：scene / script 在 runOnHa=true 时，不直接走本地引擎，而是调用 HA 对应实体的 turn_on 服务。
 * 失败处理：已有 HttpException 原样透传；其余包装为 ServiceUnavailableException。
 *
 * @param opts.domain HA 实体域（'scene' 或 'script'）
 * @param opts.haConfigId HA Config API 中的配置 ID（不含 domain 前缀）
 * @param opts.callService HA 服务调用回调（domain, service, entityId, data）
 * @param opts.data 附加服务数据（可选，透传给 HA）
 * @param opts.execFailed 失败消息格式化函数，由调用方提供面向用户的文案
 * @returns 成功时返回拼装好的 entityId
 * @throws ServiceUnavailableException 当 HA 服务调用失败且非业务异常时抛出
 */
export async function executeViaHaEntity(opts: {
  domain: 'scene' | 'script';
  haConfigId: string;
  callService: (
    domain: string,
    service: string,
    entityId: string,
    data?: Record<string, unknown>,
  ) => Promise<unknown>;
  data?: Record<string, unknown>;
  execFailed: (msg: string) => string;
}): Promise<{ entityId: string }> {
  // 拼装 HA entity_id：domain.configId（如 scene.homeos_xxx）
  const entityId = `${opts.domain}.${opts.haConfigId}`;
  try {
    await opts.callService(opts.domain, 'turn_on', entityId, opts.data ?? {});
    return { entityId };
  } catch (err: unknown) {
    rethrowIfHttpException(err);
    throw new ServiceUnavailableException(opts.execFailed(getErrorMessage(err)));
  }
}