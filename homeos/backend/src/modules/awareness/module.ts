/**
 * @file awareness.module.ts
 * @module awareness
 * @description 感知域聚合模块。保留语音对话（Voice）与顾问设备使用统计（AdvisorUsage）；
 * 每日建议 / 配置洞察 / 习惯推荐 / 离线基线已随联动引擎与能源 / 环境模型一并移除。
 * 影音场景由 SystemLifestyleModule 提供。
 */
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/module';
import { RedisModule } from '../../shared/redis/module';
import { HaConnectorModule } from '../ha-connector/module';
import { CommandProxyModule } from '../command-proxy/module';
import { ChildModeModule } from '../child-mode/module';
import { StateStoreModule } from '../state-store/module';
import { HomeModeModule } from '../home-mode/module';
import { VoiceService } from './voice.service';
import { AdvisorUsageService } from './advisor-usage.service';
import { AdvisorUsageController } from './advisor-usage.controller';
import { AgentModule } from '../agent/module';
import { SystemLifestyleModule } from '../system/lifestyle/system-lifestyle.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    HaConnectorModule,
    CommandProxyModule,
    ChildModeModule,
    StateStoreModule,
    HomeModeModule,
    AgentModule,
    forwardRef(() => SystemLifestyleModule),
  ],
  controllers: [AdvisorUsageController],
  providers: [VoiceService, AdvisorUsageService],
  exports: [VoiceService],
})
/**
 * AwarenessModule：Nest @Module 模块。
 * - 所属域：modules/awareness/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class AwarenessModule {}
