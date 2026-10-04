/**
 * 能源副作用模块：承接 StateStore 事件日志 → 能源候选聚合、日/月统计生成的副作用处理。
 *
 * 设计背景：与 EnergyModule 拆分为独立模块，避免 StateStore → Energy → HaConnector → StateStore
 *   在 CJS 加载期形成暂时性死区（TDZ）环——forwardRef 仅解运行时注入，挡不住模块级 import。
 * 装配清单：
 *  - imports：PrismaModule（EnergyAggregation / EnergyDailyRecord 等写入）；
 *  - providers：EnergySideEffectService（订阅 event-log 写入钩子，写候选与聚合表）；
 *  - exports：EnergySideEffectService，供 StateStoreModule 直接注入而不引入 EnergyModule 整树。
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/module';
import { EnergySideEffectService } from './energy-side-effect.service';

/**
 * 事件日志能源副作用（候选表 / 日/月聚合）。
 *
 * 与 EnergyModule 拆开，避免 StateStore → Energy → HaConnector → StateStore
 * 在 CJS 加载期形成 TDZ 环（forwardRef 挡不住模块级 import）。
 */
@Module({
  imports: [PrismaModule],
  providers: [EnergySideEffectService],
  exports: [EnergySideEffectService],
})
/**
 * EnergySideEffectModule：Nest @Module 模块。
 * - 所属域：modules/energy/energy-side-effect；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class EnergySideEffectModule {}
