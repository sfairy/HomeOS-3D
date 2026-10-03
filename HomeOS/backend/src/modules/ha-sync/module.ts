/**
 * HA 配置导入模块：把 Home Assistant 侧的自动化 / 场景 / 脚本 YAML 读入 HomeOS 本地编排器。
 *
 * 所属模块：modules/ha-sync。
 * 注意：与 shared/orchestrator/ha-sync.module（编排引擎双向同步）不是同一件事——本模块仅做「用户侧」批量导入，不监听实时状态。
 * 装配清单：
 *  - imports：HaConnectorModule（读 HA REST 配置）、PrismaModule（写入本地 scene/automation/script 表）；
 *  - controllers：HaSyncController（/ha-sync/discovery /import /status 端点）；
 *  - providers：HaSyncService（YAML 解析、与本地条目 diff、幂等落库）；
 *  - exports：HaSyncService，供 orchestrator-bootstrap 触发首次导入。
 */

import { Module } from '@nestjs/common';
import { HaSyncService } from './service';
import { HaSyncController } from './controller';
import { HaConnectorModule } from '../ha-connector/module';
import { PrismaModule } from '../../shared/prisma/module';

/**
 * HA 配置导入模块（从 Home Assistant 导入 automation / scene / script）。
 * 与 `OrchestratorHaSyncModule`（编排引擎同步）不是同一件事。
 */
@Module({
  imports: [HaConnectorModule, PrismaModule],
  controllers: [HaSyncController],
  providers: [HaSyncService],
  exports: [HaSyncService],
})
/**
 * HaConfigImportModule：Nest @Module 模块。
 * - 所属域：modules/ha-sync/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class HaConfigImportModule
 */
export class HaConfigImportModule {}
