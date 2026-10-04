/**
 * @file module.ts
 * @module shared/jobs
 * @description 全局作业注册模块：暴露 JobRegistryService（调度作业统一仪表盘数据源）。
 */
import { Global, Module } from '@nestjs/common';
import { JobRegistryService } from './registry.service';

@Global()
@Module({
  providers: [JobRegistryService],
  exports: [JobRegistryService],
})
/**
 * JobRegistryModule：Nest @Module 模块。
 * - 所属域：shared/jobs/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class JobRegistryModule {}
