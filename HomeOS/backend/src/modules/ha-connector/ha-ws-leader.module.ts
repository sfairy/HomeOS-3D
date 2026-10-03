/**
 * HA WebSocket Leader 选举模块（基于 Redis）：多副本中选出唯一 Leader 维护到 HA 的 WS 长连接。
 *
 * 所属模块：modules/ha-connector（作为子模块引入，避免与 StateStore 产生循环依赖）。
 * 装配清单：
 *  - imports：RedisModule（获取分布式锁键与 Pub/Sub 通道）；
 *  - providers：HaWsLeaderService（抢锁 + 续期 + 退避重选 + 健康探针）；
 *  - exports：HaWsLeaderService，供 HaConnectorModule 判断本实例是 Leader/Follower 以启动对应策略。
 * 行为：使用 Redis 带 TTL 的 SET NX 选主，定时续租；崩溃或网络抖动后等待剩余 TTL + 抖动窗口重新选主。
 */

import { Module } from '@nestjs/common';
import { RedisModule } from '../../shared/redis/module';
import { HaWsLeaderService } from './ha-ws-leader.service';

/**
 * HA WebSocket Leader 选举模块（基于 Redis）。
 *
 * 职责：
 * - 通过 Redis 在多副本间选举唯一 Leader，仅 Leader 维护到 Home Assistant 的 WebSocket 长连接。
 * - 独立于 HaConnectorModule 单独成模块，以避免与 StateStore 产生循环依赖。
 *
 * 依赖：RedisModule（提供 Redis 连接）。
 */
@Module({
  imports: [RedisModule],
  providers: [HaWsLeaderService],
  exports: [HaWsLeaderService],
})
/**
 * HaWsLeaderModule：Nest @Module 模块。
 * - 所属域：modules/ha-connector/ha-ws-leader；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class HaWsLeaderModule
 */
export class HaWsLeaderModule {}
