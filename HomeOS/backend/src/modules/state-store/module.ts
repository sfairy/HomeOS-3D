/**
 * 状态存储模块：HA 实体的 L1 内存 + L2 Redis 双层缓存、事件日志持久化与查询、实体区域富集与引用分析。
 *
 * 所属模块：modules/state-store。
 * 装配清单：
 *  - imports：PrismaModule（事件日志 / 聚合写入）、HaWsLeaderModule（Follower 写缓存策略）、UiConfigModule（房间 / 区域映射）、EnergySideEffectModule（避免 CJS 环的拆分模块）；
 *  - providers：StateStoreService（双层缓存门面 + 端口实现）、StateStorePersistenceService（L2 → DB 周期落库）、EventLogService / QueryService / ReportCompareService（事件日志三件套）、EntityAreaEnrichmentService、EntityReferencesService + 多个端口 Token；
 *  - controllers：StateStoreController（实体查询与详情）、EventLogController（事件历史与统计）；
 *  - exports：StateStoreService / EntityAreaEnrichmentService / EventLogQueryService / 四个 DI 端口，供共享管道与上层业务注入。
 */

import { Module } from '@nestjs/common';
import { StateStoreService } from './service';
import { StateStorePersistenceService } from './state-store-persistence.service';
import { StateStoreController } from './controller';
import { EntityAreaEnrichmentService } from './entity-area-enrichment.service';
import { EventLogService } from './event-log/service';
import { EventLogQueryService } from './event-log/query.service';
import { ReportCompareService } from './event-log/report.service';
import { EventLogController } from './event-log/controller';
import { EntityReferencesService } from './entity-references.service';
import { PrismaModule } from '../../shared/prisma/module';
import { HaWsLeaderModule } from '../ha-connector/ha-ws-leader.module';
import { UiConfigModule } from '../ui-config/module';
import { EnergySideEffectModule } from '../energy/energy-side-effect.module';
import {
  ENTITY_STATE_CACHE_READER,
  ENTITY_STATE_CACHE_WRITER,
} from '../../shared/ha/entity-state-cache.interface';
import {
  HA_STATE_AREA_ENRICH_PORT,
  HA_STATE_STORE_HOT_PORT,
} from '../../shared/ha/state-pipeline.ports';

/**
 * 状态存储模块：HA 实体 L1/L2 缓存与事件日志。
 * 能源副作用由 EnergySideEffectModule 提供（不 import 整棵 EnergyModule，避免 CJS 环）。
 */
@Module({
  imports: [PrismaModule, HaWsLeaderModule, UiConfigModule, EnergySideEffectModule],
  providers: [
    StateStoreService,
    StateStorePersistenceService,
    EventLogQueryService,
    EventLogService,
    ReportCompareService,
    EntityAreaEnrichmentService,
    EntityReferencesService,
    { provide: ENTITY_STATE_CACHE_READER, useExisting: StateStoreService },
    { provide: ENTITY_STATE_CACHE_WRITER, useExisting: StateStoreService },
    { provide: HA_STATE_STORE_HOT_PORT, useExisting: StateStoreService },
    { provide: HA_STATE_AREA_ENRICH_PORT, useExisting: EntityAreaEnrichmentService },
  ],
  controllers: [StateStoreController, EventLogController],
  exports: [
    StateStoreService,
    EntityAreaEnrichmentService,
    EventLogQueryService,
    ENTITY_STATE_CACHE_READER,
    ENTITY_STATE_CACHE_WRITER,
    HA_STATE_STORE_HOT_PORT,
    HA_STATE_AREA_ENRICH_PORT,
  ],
})
/**
 * StateStoreModule：Nest @Module 模块。
 * - 所属域：modules/state-store/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class StateStoreModule
 */
export class StateStoreModule {}
