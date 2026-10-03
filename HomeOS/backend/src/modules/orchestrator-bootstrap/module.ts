/**
 * 所属模块：backend/modules/orchestrator-bootstrap
 * 职责：
 *  - 编排引导+漂移修复模块；
 * 关键依赖：
 *  - orchestrator-ha-sync.binder；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Module, forwardRef } from '@nestjs/common';
import { AppConfigModule } from '../../shared/app-config/module';
import { AutomationModule } from '../automation/module';
import { SceneModule } from '../scene/module';
import { ScriptModule } from '../script/module';
import { TemplateEntityModule } from '../template-entity/module';
import { OrchestratorAutoImportService } from './orchestrator-auto-import.service';
import { OrchestratorDriftRepairService } from './orchestrator-drift-repair.service';

@Module({
  imports: [
    AppConfigModule,
    forwardRef(() => AutomationModule),
    forwardRef(() => SceneModule),
    forwardRef(() => ScriptModule),
    forwardRef(() => TemplateEntityModule),
  ],
  providers: [OrchestratorAutoImportService, OrchestratorDriftRepairService],
  exports: [OrchestratorAutoImportService, OrchestratorDriftRepairService],
})
/**
 * OrchestratorBootstrapModule：Nest @Module 模块。
 * - 所属域：modules/orchestrator-bootstrap/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class OrchestratorBootstrapModule
 */
export class OrchestratorBootstrapModule {}
