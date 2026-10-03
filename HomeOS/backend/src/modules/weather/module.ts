/**
 * 天气模块
 *
 * 职责：装配天气预警后台监听与极端天气安全联动。
 *  - WeatherWatchService：轮询 OpenWeather 预警 + 推送 + 事件广播
 *  - WeatherAutoLinkageService：监听 weather.alert 执行安全联动
 *
 * 依赖：
 *  - SystemOpsModule：ExternalApiService（OpenWeather 预警拉取）
 *  - NotificationModule：NotificationService（预警推送）
 *  - SceneModule / HomeModeModule：极端天气安全联动执行
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/module';
import { RedisModule } from '../../shared/redis/module';
import { AppConfigModule } from '../../shared/app-config/module';
import { NotificationModule } from '../notification/module';
import { SceneModule } from '../scene/module';
import { HomeModeModule } from '../home-mode/module';
import { SystemOpsModule } from '../system/ops/system-ops.module';
import { WeatherWatchService } from './weather-watch.service';
import { WeatherAutoLinkageService } from './weather-auto-linkage.service';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AppConfigModule,
    NotificationModule,
    SceneModule,
    HomeModeModule,
    SystemOpsModule,
  ],
  providers: [WeatherWatchService, WeatherAutoLinkageService],
  exports: [WeatherWatchService, WeatherAutoLinkageService],
})
/**
 * WeatherModule：Nest @Module 模块。
 * - 所属域：modules/weather/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class WeatherModule
 */
export class WeatherModule {}
