/**
 * MoviePilot 代理模块
 *
 * 模块：system/ops
 * 职责：
 *  - 注册 MoviePilotProxyController（catch-all 代理 /system/moviepilot/*）
 *
 * 注意：本模块须在 AppModule 末尾导入，注册于全部 /system/* 路由之后，
 * 否则 catch-all 会抢占原生 system API 路由。
 *
 * 依赖：SystemModule（提供 MoviePilotProxyService 所需的 UiConfigService 等）
 */
import { Module } from '@nestjs/common';
import { MoviePilotProxyController } from './moviepilot-proxy.controller';
import { SystemModule } from '../module';

/** MoviePilot catch-all 代理 — 须在 AppModule 末尾导入，注册于全部 /system/* 路由之后 */
@Module({
  imports: [SystemModule],
  controllers: [MoviePilotProxyController],
})
/**
 * MoviePilotProxyModule：Nest @Module 模块。
 * - 所属域：modules/system/ops/moviepilot-proxy；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class MoviePilotProxyModule
 */
export class MoviePilotProxyModule {}