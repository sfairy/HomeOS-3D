/**
 * HA 命令 Redis 桥接服务。
 *
 * 职责：
 * - 多实例 Follower 将控制命令经 Redis 转发至 Leader 的 HA WebSocket 执行，
 *   避免 REST 兜底带来的额外 RTT。
 * - Leader 端订阅请求通道，调用 HA WebSocket 执行后将结果发布到响应通道。
 * - 基于 correlationId 的请求-响应匹配，支持超时与错误回传。
 *
 * 依赖：RedisService（Pub/Sub）、HaConnectorService（HA WebSocket 调用）、HaWsLeaderService（角色判断）。
 */
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { RedisService } from '../../shared/redis/service';
import { HaWsLeaderService } from './ha-ws-leader.service';
import { getErrorMessage, BusinessException, ErrorCode } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { signHaCommandRequest, verifyHaCommandRequest } from './ha-command-hmac.util';
import {
  HA_WS_COMMAND_EXECUTOR,
  type HaWsCommandExecutor,
} from './ha-ws-command-executor.port';

/** Redis 请求通道：Follower 发布命令，Leader 订阅执行 */
const REQ_CHANNEL = 'homeos:ha-command:req';
/** Redis 响应通道前缀：Leader 发布结果，Follower 按 correlationId 订阅 */
const RES_CHANNEL_PREFIX = 'homeos:ha-command:res:';

/** Follower → Leader 的命令请求结构 */
interface HaCommandRequest {
  correlationId: string;
  domain: string;
  service: string;
  entityId: string;
  serviceData?: Record<string, unknown>;
  returnResponse?: boolean;
  /** 幂等键：Leader 端同键去重，防止桥接重放 / 断连队列 flush 重复执行 */
  requestId?: string;
  /** 请求方对消息体的 HMAC-SHA256 签名（hex），由 Leader 校验以防外部能访问 Redis 的攻击者伪造命令 */
  hmac?: string;
}

/** Leader → Follower 的命令响应结构 */
interface HaCommandResponse {
  correlationId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * HA 命令 Redis 桥接服务（@Injectable）。
 *
 * 多实例 Follower 将控制命令经 Redis 转发至 Leader 的 HA WebSocket 执行，
 * 避免 REST 兜底带来的额外 RTT。
 *
 * 使用 HA_WS_COMMAND_EXECUTOR 端口注入 Leader 执行器，避免与 service.ts 循环导入。
 */
@Injectable()
export class HaCommandBridgeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HaCommandBridgeService.name);
  private unsubReq: (() => void) | null = null;
  /** 内部共享密钥缓存（优先 HOMEOS_INTERNAL_SECRET 环境变量；未配置时生成实例级密钥） */
  private internalSecret: string | null = null;

  constructor(
    private readonly redisService: RedisService,
    // forwardRef：与 HaConnectorService 互为依赖，避免 InstanceLoader 死锁
    @Inject(forwardRef(() => HA_WS_COMMAND_EXECUTOR))
    private readonly haExecutor: HaWsCommandExecutor,
    private readonly haLeader: HaWsLeaderService,
  ) {}

  /** @returns Redis 是否就绪（桥接是否可用）。 */
  isAvailable(): boolean {
    return this.redisService.isReady();
  }

  /** NestJS 生命周期钩子：应用启动时订阅请求通道（仅 Leader 会处理请求）。 */
  async onApplicationBootstrap() {
    // 预热内部密钥，避免首条命令才初始化
    this.getInternalSecret();
    if (!this.redisService.isReady()) return;
    this.unsubReq = await this.redisService.subscribe(REQ_CHANNEL, (msg) => {
      void this.handleLeaderRequest(msg as HaCommandRequest);
    });
    this.logger.log('HA 命令 Redis 桥接已就绪');
  }

  /** NestJS 生命周期钩子：模块销毁时取消请求通道订阅。 */
  onModuleDestroy() {
    this.unsubReq?.();
    this.unsubReq = null;
  }

  /**
   * Follower 端转发命令至 Leader 执行（请求-响应模式）。
   *
   * 流程：生成 correlationId → 订阅响应通道 → 发布请求到 REQ_CHANNEL → 等待 Leader 响应或超时。
   *
   * @param domain HA 服务域（如 light、switch）。
   * @param service HA 服务名（如 turn_on）。
   * @param entityId 目标实体 ID。
   * @param serviceData 服务调用附加参数。
   * @param returnResponse 是否返回 HA 响应体。
   * @param timeoutMs 超时毫秒数，默认 12s。
   * @returns Leader 执行结果。
   * @throws {BusinessException} Redis 不可用或超时时抛出。
   */
  async forwardCommand(
    domain: string,
    service: string,
    entityId: string,
    serviceData?: Record<string, unknown>,
    returnResponse?: boolean,
    timeoutMs = 12_000,
    requestId?: string,
  ): Promise<unknown> {
    if (!this.redisService.isReady()) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        API_ERROR.HA_COMMAND_BRIDGE_UNAVAILABLE,
      );
    }
    const correlationId = randomBytes(8).toString('hex');
    const resChannel = `${RES_CHANNEL_PREFIX}${correlationId}`;

    return new Promise((resolve, reject) => {
      let settled = false;
      // 统一收尾：确保只 settle 一次，清理定时器与订阅
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubRes?.();
        fn();
      };

      const timer = setTimeout(() => {
        finish(() =>
          reject(
            new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_COMMAND_BRIDGE_TIMEOUT),
          ),
        );
      }, timeoutMs);

      let unsubRes: (() => void) | undefined;
      void this.redisService
        .subscribe(resChannel, (msg) => {
          const res = msg as HaCommandResponse;
          // 仅处理匹配当前 correlationId 的响应
          if (res.correlationId !== correlationId) return;
          finish(() => {
            if (res.ok) resolve(res.result);
            else reject(
              new BusinessException(
                ErrorCode.EXTERNAL_ERROR,
                res.error || API_ERROR.HA_COMMAND_BRIDGE_FAILED,
              ),
            );
          });
        })
        .then((unsub) => {
          unsubRes = unsub;
          // 订阅就绪后发布请求，避免响应早于订阅丢失
          // 附加 HMAC 签名：Leader 校验通过才执行，防止能访问 Redis 的攻击者伪造危险服务调用
          const requestPayload = {
            correlationId,
            domain,
            service,
            entityId,
            serviceData,
            returnResponse,
            requestId,
          };
          // publish 失败单独捕获，避免 unhandled rejection
          return this.redisService
            .publish(REQ_CHANNEL, {
              ...requestPayload,
              hmac: this.signRequest(requestPayload),
            } satisfies HaCommandRequest)
            .catch((e) => {
              this.logger.warn(`HA 命令桥接请求发布失败: ${getErrorMessage(e)}`);
              finish(() =>
                reject(
                  new BusinessException(
                    ErrorCode.EXTERNAL_ERROR,
                    API_ERROR.HA_COMMAND_BRIDGE_PUBLISH_FAILED(getErrorMessage(e)),
                  ),
                ),
              );
            });
        })
        .catch((e) => {
          // 订阅失败：结束请求并 reject，避免 Promise 悬挂与 unhandled rejection
          this.logger.warn(`HA 命令桥接订阅失败: ${getErrorMessage(e)}`);
          finish(() =>
            reject(
              new BusinessException(
                ErrorCode.EXTERNAL_ERROR,
                API_ERROR.HA_COMMAND_BRIDGE_SUBSCRIBE_FAILED(getErrorMessage(e)),
              ),
            ),
          );
        });
    });
  }

  /**
   * Leader 端处理 Follower 转发的命令请求。
   * 仅当本实例为 Leader 时执行；调用 HA WebSocket 服务后将结果发布到响应通道。
   * @param req Follower 发来的命令请求。
   */
  private async handleLeaderRequest(req: HaCommandRequest) {
    if (!req?.correlationId) return;
    if (!this.haLeader.isHaWsLeader()) return;
    // 校验 HMAC 签名：任何能向 req 通道 publish 的客户端均可构造 serviceData，
    // 必须确认请求来自持有共享密钥的 HomeOS 实例，避免 lock.unlock 等危险调用被伪造
    if (!this.verifyRequest(req)) {
      this.logger.warn(
        `HA 命令桥接请求 HMAC 校验失败,已丢弃:correlationId=${req.correlationId}`,
      );
      return;
    }
    const resChannel = `${RES_CHANNEL_PREFIX}${req.correlationId}`;
    try {
      const result = await this.haExecutor.callServiceAsLeader(
        req.domain,
        req.service,
        req.entityId,
        req.serviceData,
        req.returnResponse,
        req.requestId,
      );
      await this.redisService.publish(resChannel, {
        correlationId: req.correlationId,
        ok: true,
        result,
      } satisfies HaCommandResponse);
    } catch (err: unknown) {
      // 执行失败或成功响应发布失败：统一回传错误响应
      try {
        await this.redisService.publish(resChannel, {
          correlationId: req.correlationId,
          ok: false,
          error: getErrorMessage(err),
        } satisfies HaCommandResponse);
      } catch (pubErr) {
        // 错误响应也无法发布：请求方超时自行收尾，仅记录日志避免 unhandled rejection
        this.logger.warn(`HA 命令桥接错误响应发布失败: ${getErrorMessage(pubErr)}`);
      }
    }
  }

  /**
   * 获取内部共享密钥：优先读 HOMEOS_INTERNAL_SECRET 环境变量；
   * 未配置时从 data/.internal-secret 文件读取，不存在则生成并持久化
   * （与 JWT 密钥同目录，Docker 多副本共享 data 卷时各实例密钥一致）。
   * @returns 用于 HMAC 签名/校验的密钥字符串。
   */
  private getInternalSecret(): string {
    if (this.internalSecret) return this.internalSecret;
    const fromEnv = (process.env.HOMEOS_INTERNAL_SECRET || '').trim();
    if (fromEnv) {
      this.internalSecret = fromEnv;
      return this.internalSecret;
    }
    const secretFile = path.join(process.cwd(), 'data', '.internal-secret');
    try {
      if (fs.existsSync(secretFile)) {
        const persisted = fs.readFileSync(secretFile, 'utf-8').trim();
        if (persisted.length >= 32) {
          this.internalSecret = persisted;
          return this.internalSecret;
        }
      }
    } catch (e) {
      this.logger.warn(`读取内部共享密钥文件失败: ${getErrorMessage(e)}`);
    }
    this.internalSecret = randomBytes(32).toString('hex');
    try {
      fs.mkdirSync(path.dirname(secretFile), { recursive: true });
      fs.writeFileSync(secretFile, this.internalSecret, { mode: 0o600 });
    } catch (e) {
      this.logger.warn(`持久化内部共享密钥失败: ${getErrorMessage(e)}`);
    }
    this.logger.warn(
      'HOMEOS_INTERNAL_SECRET 未配置:已生成并持久化到 data/.internal-secret;多副本请确保共享 data 卷或显式配置同一密钥.',
    );
    return this.internalSecret;
  }

  /**
   * 计算命令请求消息体的 HMAC-SHA256 签名。
   * 采用固定字段顺序的规范 JSON，确保发布方与校验方计算结果一致。
   * @param payload 请求体（不含 hmac 字段）。
   * @returns hex 编码的签名。
   */
  private signRequest(payload: {
    correlationId: string;
    domain: string;
    service: string;
    entityId: string;
    serviceData?: Record<string, unknown>;
    returnResponse?: boolean;
    requestId?: string;
  }): string {
    return signHaCommandRequest(payload, this.getInternalSecret());
  }

  /**
   * 校验命令请求的 HMAC 签名。
   * @param req 收到的命令请求（可能含 hmac 字段）。
   * @returns 签名存在且匹配返回 true，否则 false。
   */
  private verifyRequest(req: HaCommandRequest): boolean {
    return verifyHaCommandRequest(req, this.getInternalSecret());
  }
}