/**
 * 所属模块：backend/modules/template-entity
 * 职责：
 *  - 模板实体 Nest 模块；
 * 关键依赖：
 *  - shared/prisma、shared/app-config；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Module } from '@nestjs/common';
// 导入本模块组件
import { TemplateEntityController } from './controller';
import { TemplateEntityService } from './service';
import { TemplateEntityHaSyncService } from './ha-sync.service';
import { PrismaModule } from '../../shared/prisma/module';
import { HaConnectorModule } from '../ha-connector/module';
import { AppConfigModule } from '../../shared/app-config/module';
import { HaConfigImportModule } from '../ha-sync/module';

@Module({
  imports: [PrismaModule, HaConnectorModule, AppConfigModule, HaConfigImportModule],
  controllers: [TemplateEntityController],
  providers: [TemplateEntityService, TemplateEntityHaSyncService],
  exports: [TemplateEntityService, TemplateEntityHaSyncService],
})
/**
 * TemplateEntityModule：Nest @Module 模块。
 * - 所属域：modules/template-entity/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class TemplateEntityModule
 */
export class TemplateEntityModule {}