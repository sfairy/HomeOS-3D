/**
 * 联动健康模块（LinkageHealthModule）装配定义。
 *
 * 所属模块：backend/modules/linkage-health
 * 职责：聚合三类服务——
 *  - LinkageHealthService：联动健康巡检（场景/自动化/脚本配置漂移、HA 同步状态、占用率分析）
 *  - EnergyAutoLinkageService：能源自动联动（峰谷电价时段自动启停设备）
 *  - ExecutionHistoryService：自动化 / 场景 / 脚本的统一执行历史查询与导出
 * 依赖：
 *  - PrismaModule：DB
 *  - HaConnectorModule / HaConfigImportModule：HA 状态与配置
 *  - SecurityModule / HomeModeModule：占用与家庭模式联动判定
 *  - NotificationModule：异常告警通知
 *  - OrchestratorHaSyncModule：HA 同步状态查询
 *  - AutomationModule / SceneModule / ScriptModule：被巡检的业务模块
 *  - SystemLifestyleModule / WeatherModule / EnvironmentModule：环境上下文（温湿度 / 天气 / 在家状态）
 * 暴露：LinkageHealthService / EnergyAutoLinkageService / ExecutionHistoryService。
 */
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/module';
import { OrchestratorHaSyncModule } from '../../shared/orchestrator/ha-sync.module';
import { HaConnectorModule } from '../ha-connector/module';
import { HaConfigImportModule } from '../ha-sync/module';
import { SecurityModule } from '../security/module';
import { HomeModeModule } from '../home-mode/module';
import { NotificationModule } from '../notification/module';
import { AutomationModule } from '../automation/module';
import { SceneModule } from '../scene/module';
import { ScriptModule } from '../script/module';
import { SystemLifestyleModule } from '../system/lifestyle/system-lifestyle.module';
import { WeatherModule } from '../weather/module';
import { EnvironmentModule } from '../environment/module';
import { LinkageHealthService } from './linkage-health.service';
import { EnergyAutoLinkageService } from './auto-linkage.service';
import { ExecutionHistoryService } from './execution-history.service';

@Module({
  imports: [
    PrismaModule,
    HaConnectorModule,
    HaConfigImportModule,
    SecurityModule,
    HomeModeModule,
    NotificationModule,
    OrchestratorHaSyncModule,
    AutomationModule,
    SceneModule,
    ScriptModule,
    SystemLifestyleModule,
    WeatherModule,
    forwardRef(() => EnvironmentModule),
  ],
  providers: [LinkageHealthService, EnergyAutoLinkageService, ExecutionHistoryService],
  exports: [LinkageHealthService, EnergyAutoLinkageService, ExecutionHistoryService],
})
/**
 * LinkageHealthModule：Nest @Module 模块。
 * - 所属域：modules/linkage-health/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class LinkageHealthModule
 */
export class LinkageHealthModule {}
