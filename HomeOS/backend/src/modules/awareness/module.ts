/**
 * @file awareness.module.ts
 * @module awareness
 * @description 感知域聚合模块。整合智能顾问（SmartAdvisor）、语音对话（Voice）、
 * 配置洞察（ConfigInsights）、习惯推荐（Recommendation）与离线基线（IntelligenceBaseline）。
 * 影音场景由 SystemLifestyleModule 提供。
 */
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/module';
import { RedisModule } from '../../shared/redis/module';
import { HaConnectorModule } from '../ha-connector/module';
import { CommandProxyModule } from '../command-proxy/module';
import { ChildModeModule } from '../child-mode/module';
import { StateStoreModule } from '../state-store/module';
import { AutomationModule } from '../automation/module';
import { HomeModeModule } from '../home-mode/module';
import { SceneModule } from '../scene/module';
import { SmartAdvisorService } from './smart-advisor.service';
import { VoiceService } from './voice.service';
import { SystemAdvisorController } from './system-advisor.controller';
import { RecommendationService } from './recommendation.service';
import { EnvironmentModule } from '../environment/module';
import { EnergyModule } from '../energy/module';
import { SystemSetupModule } from '../system/setup/system-setup.module';
import { AgentModule } from '../agent/module';
import { ConfigInsightsService } from './config-insights.service';
import { IntelligenceBaselineService } from './intelligence-baseline.service';
import { SystemLifestyleModule } from '../system/lifestyle/system-lifestyle.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    HaConnectorModule,
    CommandProxyModule,
    ChildModeModule,
    StateStoreModule,
    AutomationModule,
    HomeModeModule,
    SceneModule,
    EnvironmentModule,
    EnergyModule,
    SystemSetupModule,
    AgentModule,
    forwardRef(() => SystemLifestyleModule),
  ],
  controllers: [SystemAdvisorController],
  providers: [
    SmartAdvisorService,
    VoiceService,
    ConfigInsightsService,
    RecommendationService,
    IntelligenceBaselineService,
  ],
  exports: [
    SmartAdvisorService,
    VoiceService,
    RecommendationService,
    IntelligenceBaselineService,
    EnvironmentModule,
    EnergyModule,
  ],
})
/**
 * AwarenessModule：Nest @Module 模块。
 * - 所属域：modules/awareness/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class AwarenessModule
 */
export class AwarenessModule {}
