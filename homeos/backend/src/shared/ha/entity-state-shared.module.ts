/**
 * @module shared/ha
 * @file ha-entity-state-shared.module.ts
 * @brief HA 实体状态共享桥接层 NestJS 模块。
 *
 * 职责：
 *  - 将 HaStateEventBus、HaEntitySyncFilterService、HaInitialStatesCoordinatorService、
 *    HaRegistryQueryService 注册为全局共享 Provider；
 *    Hot/Cold 管道见 HaStatePipelineModule（需 StateStore / WsPush 端口）。
 *  - 通过 exports 暴露给其他模块注入，无需各自 import 本模块（@Global）。
 *
 * 关键依赖：
 *  - @nestjs/common：Global / Module 装饰器；
 *  - 各 Provider 服务来自 ./entity-sync-filter.service 与 ./ha-entity-state-bridge.service。
 *
 * 设计说明：
 *  本模块不依赖 StateStore / HaConnector 模块，避免循环依赖。
 *  HaConnector 在启动时通过 registerPort 注入真实端口实现到委托服务。
 */
import { Global, Module } from '@nestjs/common';
import { HaEntitySyncFilterService } from './entity-sync-filter.service';
import { HaStateEventBus, HaInitialStatesCoordinatorService, HaRegistryQueryService } from './entity-state-bridge.service';

/**
 * HA 实体状态共享桥接层：事件总线、同步过滤与注册表/快照委托（无 StateStore / HaConnector 模块依赖）。
 *
 * 标记为 @Global，使得全局任意模块均可直接注入其导出的 Provider，无需在各自 imports 中声明。
 */
/** HA 实体状态共享桥接层：事件总线、同步过滤与注册表/快照委托（无 StateStore / HaConnector 模块依赖） */
@Global()
@Module({
  providers: [
    HaStateEventBus,
    HaEntitySyncFilterService,
    HaInitialStatesCoordinatorService,
    HaRegistryQueryService,
  ],
  exports: [
    HaStateEventBus,
    HaEntitySyncFilterService,
    HaInitialStatesCoordinatorService,
    HaRegistryQueryService,
  ],
})
/**
 * HaEntityStateSharedModule：Nest @Module 模块。
 * - 所属域：shared/ha/entity-state-shared；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class HaEntityStateSharedModule {}