/**
 * 全局联动器 HA 同步模块：分布式锁、OrchestratorHaSyncEngine、YAML 域装配工厂。
 *
 * 不 import HaConnectorModule：引擎经 ORCHESTRATOR_HA_CONNECTOR_PORT 注入，
 * 由全局 HaConnectorModule 导出适配器，避免 common → modules 模块图依赖。
 * AppModule 须先注册 HaConnectorModule，再注册本模块。
 */
import { Global, Module } from '@nestjs/common';
import { OrchestratorHaSyncEngine } from './ha-sync.engine';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';
import { OrchestratorDomainHaSyncFactory } from './orchestrator-domain-ha-sync.factory';
import { OrchestratorHaSyncBinder } from './orchestrator-ha-sync.binder';

@Global()
@Module({
  providers: [
    DistributedLockService,
    OrchestratorHaSyncEngine,
    OrchestratorDomainHaSyncFactory,
    OrchestratorHaSyncBinder,
  ],
  exports: [
    DistributedLockService,
    OrchestratorHaSyncEngine,
    OrchestratorDomainHaSyncFactory,
    OrchestratorHaSyncBinder,
  ],
})
/**
 * OrchestratorHaSyncModule：Nest @Module 模块。
 * - 所属域：shared/orchestrator/ha-sync；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class OrchestratorHaSyncModule
 */
export class OrchestratorHaSyncModule {}
