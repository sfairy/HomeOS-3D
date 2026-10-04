/**
 * 儿童模式子模块：ChildModeService 与 Prisma、HA 连接器依赖。
 *
 * 职责：
 *  - 注册并对外提供 ChildModeService（白名单 + 时间窗 / 媒体时长限制 / 实时拦截）
 *
 * 依赖：
 *  - PrismaModule：运行时状态（mediaUsedMin / overrideUntil）
 *  - AppConfigService：@Global()，儿童模式配置走 AppConfig.childMode
 *  - HaConnectorService：@Global() 导出，调用 HA 关闭受限设备（不 import HaConnectorModule，避免 CJS 环）
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/module';
import { ChildModeService } from './service';

/**
 * 儿童模式 NestJS 模块
 * 作为可被 SystemModule 等上层模块导入的 DI 单元。
 */
@Module({
  imports: [PrismaModule],
  providers: [ChildModeService],
  exports: [ChildModeService],
})
/**
 * ChildModeModule：Nest @Module 模块。
 * - 所属域：modules/child-mode/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class ChildModeModule {}