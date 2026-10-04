/**
 * 安防模块：聚合布防面板、人员存在感知、Frigate 监控、离家模拟、危险演习与联动子服务。
 *
 * 装配清单：
 *  - imports：PrismaModule、HttpModule（Frigate/门铃文件拉取）、HaConnectorModule、HomeModeModule、ChildModeModule、AppConfigModule、forwardRef(StateStoreModule) 破环；
 *  - controllers：SecurityController（事件抓拍与安防状态聚合）、SecurityPanelController（布防 / 区域 / 紧急求助 / 离家模拟）；
 *  - providers：SecurityService + 子服务（Panel/Presence/Frigate/MmWavePresence/RoomContext/AwaySimulation/HazardDrill/SecurityLinkage）；
 *  - exports：上述核心子服务供 HomeModeModule 等联动场景复用。
 */

/**
 * 安防模块（Security Module）
 *
 * 职责：聚合安防面板、人员存在感知、Frigate AI 监控、离家模拟、
 *      危险传感器演习等子服务，对外提供 SecurityController 与 SecurityPanelController。
 * 依赖模块：PrismaModule、HttpModule、HaConnectorModule、HomeModeModule、
 *          ChildModeModule、AppConfigModule、StateStoreModule（forwardRef 避免循环依赖）。
 * 导出服务：SecurityService、SecurityPanelService、PresenceService、FrigateService、
 *          MmWavePresenceService、RoomContextService、AwaySimulationService。
 */
import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SecurityController } from './controller';
import { SecurityService } from './service';
import { SecurityPanelController } from './panel/security-panel.controller';
import { SecurityPanelService } from './panel/security-panel.service';
import { PresenceService } from './presence/service';
import { FrigateService } from './surveillance/frigate.service';
import { MmWavePresenceService } from './presence/mmwave-presence.service';
import { AwaySimulationService } from './surveillance/away-simulation.service';
import { HazardDrillService } from './hazard-drill.service';
import { SecurityLinkageService } from './panel/security-linkage.service';
import { RoomContextService } from './presence/room-context.service';
import { PrismaModule } from '../../shared/prisma/module';
import { HaConnectorModule } from '../ha-connector/module';
import { HomeModeModule } from '../home-mode/module';
import { ChildModeModule } from '../child-mode/module';
import { AppConfigModule } from '../../shared/app-config/module';
import { StateStoreModule } from '../state-store/module';

/**
 * 安防模块定义。
 *
 * DI 角色：@Module，注册控制器与所有安防子服务 provider，并通过 exports 暴露给 * HomeModeModule 等需要联动安防的模块使用。StateStoreModule 使用 forwardRef 解决循环依赖。
 */
@Module({
  imports: [
    PrismaModule,
    HttpModule,
    HaConnectorModule,
    HomeModeModule,
    ChildModeModule,
    AppConfigModule,
    forwardRef(() => StateStoreModule),
  ],
  controllers: [SecurityController, SecurityPanelController],
  providers: [
    SecurityService,
    SecurityPanelService,
    PresenceService,
    FrigateService,
    MmWavePresenceService,
    RoomContextService,
    AwaySimulationService,
    HazardDrillService,
    SecurityLinkageService,
  ],
  exports: [
    SecurityService,
    SecurityPanelService,
    PresenceService,
    FrigateService,
    MmWavePresenceService,
    RoomContextService,
    AwaySimulationService,
  ],
})
/**
 * SecurityModule：Nest @Module 模块。
 * - 所属域：modules/security/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class SecurityModule {}
