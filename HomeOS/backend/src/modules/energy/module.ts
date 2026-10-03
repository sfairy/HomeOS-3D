/**
 * @file energy/module.ts
 * @module backend/src/modules
 *
 * 能源模块：聚合基线学习、异常检测、阶梯电价、能耗分析、光伏储能、
 * 月度预算与时间线自愈等子服务。
 *
 * 依赖：
 * - PrismaModule：基线 / 阶梯配置 / 候选表 / 日月聚合持久化
 * - RedisModule：能源时间线（timeline:entity:*）与跨实例缓存
 * - HaConnectorModule + HaWsLeaderModule：HA 实时状态变更订阅与 Leader 单点累加
 * - StateStoreModule：实体当前状态读取（功率 / SOC 等）
 * - SystemOpsModule：预算服务外部 API（OpenWeather 预报）
 * - EnergySideEffectModule：EventLog 写入链上的能源副作用（拆出避免 TDZ 环）
 */
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/module';
import { RedisModule } from '../../shared/redis/module';
import { AppConfigModule } from '../../shared/app-config/module';
import { HaConnectorModule } from '../ha-connector/module';
import { HaWsLeaderModule } from '../ha-connector/ha-ws-leader.module';
import { StateStoreModule } from '../state-store/module';
import { SystemOpsModule } from '../system/ops/system-ops.module';
import { EnergyController } from './energy.controller';
import { TieredPricingService } from './tiered-pricing.service';
import { EnergyAnomalyService } from './anomaly.service';
import { EnergyAnalyticsService } from './analytics.service';
import { EnergySolarService } from './energy-solar.service';
import { EnergyBudgetService } from './budget.service';
import { EnergyTimelineHealService } from './timeline-heal.service';
import { EnergySideEffectModule } from './energy-side-effect.module';

/**
 * 能源 NestJS 模块：能源基线 / 分析 / 阶梯电价 / 预算 / 光伏储能 / 时间线自愈。
 * 对外导出全部子服务供控制器与其他模块（如通知模块）调用。
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AppConfigModule,
    HaConnectorModule,
    HaWsLeaderModule,
    forwardRef(() => SystemOpsModule),
    forwardRef(() => StateStoreModule),
    EnergySideEffectModule,
  ],
  controllers: [EnergyController],
  providers: [
    TieredPricingService,
    EnergyAnomalyService,
    EnergyAnalyticsService,
    EnergySolarService,
    EnergyBudgetService,
    EnergyTimelineHealService,
  ],
  exports: [
    TieredPricingService,
    EnergyAnomalyService,
    EnergyAnalyticsService,
    EnergySolarService,
    EnergyBudgetService,
    EnergyTimelineHealService,
    EnergySideEffectModule,
  ],
})
/**
 * EnergyModule：Nest @Module 模块。
 * - 所属域：modules/energy/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class EnergyModule
 */
export class EnergyModule {}
