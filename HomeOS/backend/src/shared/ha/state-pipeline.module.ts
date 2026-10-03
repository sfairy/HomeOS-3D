/**
 * HA 状态 Hot/Cold 派发管道模块：组装 StateStore 热路径写入与 WsPush 客户端推送。
 *
 * 所属模块：shared/ha（与 HaEntityStateSharedModule 分开，避免端口 token 解析期依赖循环）。
 * 装配清单：
 *  - imports：StateStoreModule（写入实体缓存 + 事件日志）、WsPushModule（客户端实时广播）；
 *  - providers：HaStatePipelineService（热/冷路径分流：实时变更 vs 归档与补数）；
 *  - exports：HaStatePipelineService，供 HaConnectorModule 接入到 WS 订阅。
 * 关键依赖：StateStoreService、WsPushGateway。
 */

import { Module } from '@nestjs/common';
import { StateStoreModule } from '../../modules/state-store/module';
import { WsPushModule } from '../../modules/ws-push/module';
import { HaStatePipelineService } from './state-pipeline.service';

/**
 * HA 状态 Hot/Cold 管道。
 * 必须 import 提供端口的 StateStore / WsPush；不能放进 HaEntityStateSharedModule
 *（该模块刻意不依赖 StateStore，否则端口 token 无法解析）。
 */
@Module({
  imports: [StateStoreModule, WsPushModule],
  providers: [HaStatePipelineService],
  exports: [HaStatePipelineService],
})
/**
 * HaStatePipelineModule：Nest @Module 模块。
 * - 所属域：shared/ha/state-pipeline；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class HaStatePipelineModule
 */
export class HaStatePipelineModule {}
