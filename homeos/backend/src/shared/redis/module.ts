/**
 * 全局 Redis 模块（NestJS DI 容器入口）。
 *
 * 职责：
 *   - 注册并导出 RedisService（连接管理 + Pub/Sub + KV + Sorted Set）与 EventBusService（跨副本事件桥接）；
 *   - 被 @Global() 标记，AppModule 导入一次后，RedisService / EventBusService 可在任意模块直接注入。
 * 关键依赖：./service（RedisService）、./event-bus.service（EventBusService）。
 */
import { Global, Module } from '@nestjs/common';
import { RedisService } from './service';
import { EventBusService } from './event-bus.service';

@Global()
@Module({
  providers: [RedisService, EventBusService],
  exports: [RedisService, EventBusService],
})
/**
 * RedisModule：Nest @Module 模块。
 * - 所属域：shared/redis/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class RedisModule {}
