/**
 * 环境模块
 *
 * 职责：装配环境健康监测、IAQ 综合、历史趋势、用水监测、节律照明与自适应温控等环境域服务。
 *  - EnvironmentHealthService：实时房间露点 / 霉菌风险 / IAQ 阈值告警
 *  - IaqService：多参数加权空气质量指数
 *  - EnvironmentHistoryService：每 15 分钟快照、趋势查询、季节性建议、CSV 导出
 *  - WaterMonitorService：持续水流 / 超量用水异常检测
 *  - CircadianLightingService：基于太阳高度角 / 照度 / 云量预报的色温与亮度调节
 *  - AdaptiveClimateService：室外温度 / 在家状态 / 峰电 / 室内闭环的空调设定温度推荐
 *  - EnvSensorMapHaSyncService：HA 连接后过滤 envSensorMap 并按 area_id 持久化
 *
 * 依赖：
 *  - PrismaModule / RedisModule / AppConfigModule：持久化、缓存、配置
 *  - HaConnectorModule / HaWsLeaderModule：HA 实体与 leader 选举（仅主节点下发）
 *  - HomeModeModule：节律启停与家庭模式联动
 *  - SecurityModule / SystemOpsModule / StateStoreModule：在场判定、外部 API、实体区域补全
 */
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/module';
import { RedisModule } from '../../shared/redis/module';
import { AppConfigModule } from '../../shared/app-config/module';
import { StateStoreModule } from '../state-store/module';
import { HaWsLeaderModule } from '../ha-connector/ha-ws-leader.module';
import { HaConnectorModule } from '../ha-connector/module';
import { HomeModeModule } from '../home-mode/module';
import { SecurityModule } from '../security/module';
import { SystemOpsModule } from '../system/ops/system-ops.module';
import { EnvironmentController } from './environment.controller';
import { EnvironmentHistoryService } from './history.service';
import { EnvironmentHealthService } from './health.service';
import { EnvSensorMapHaSyncService } from './env-sensor-map-ha-sync.service';
import { IaqService } from './iaq.service';
import { WaterMonitorService } from './water-monitor.service';
import { CircadianLightingService } from './circadian-lighting.service';
import { AdaptiveClimateService } from './adaptive-climate.service';

/** 环境健康 / IAQ / 历史趋势 / 用水监测 / 节律照明 / 自适应温控 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AppConfigModule,
    HaConnectorModule,
    HaWsLeaderModule,
    HomeModeModule,
    forwardRef(() => SecurityModule),
    forwardRef(() => SystemOpsModule),
    forwardRef(() => StateStoreModule),
  ],
  controllers: [EnvironmentController],
  providers: [
    EnvironmentHistoryService,
    EnvironmentHealthService,
    EnvSensorMapHaSyncService,
    IaqService,
    WaterMonitorService,
    CircadianLightingService,
    AdaptiveClimateService,
  ],
  exports: [
    EnvironmentHistoryService,
    EnvironmentHealthService,
    EnvSensorMapHaSyncService,
    IaqService,
    WaterMonitorService,
    CircadianLightingService,
    AdaptiveClimateService,
  ],
})
/**
 * EnvironmentModule：Nest @Module 模块。
 * - 所属域：modules/environment/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class EnvironmentModule
 */
export class EnvironmentModule {}
