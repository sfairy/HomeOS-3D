/** 地震预警模块：EarthquakeService、EEW 主节点选举与 HTTP/Redis 依赖。 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../shared/prisma/module';
import { AppConfigModule } from '../../shared/app-config/module';
import { RedisModule } from '../../shared/redis/module';
import { NotificationModule } from '../notification/module';
import { EarthquakeService } from './service';
import { EarthquakeController } from './controller';
import { EarthquakeGlobalService } from './global.service';
import { EarthquakeCatalogNotifyService } from './catalog-notify.service';
import { EewLeaderService } from './eew-leader.service';
import { EewPollService } from './eew-poll.service';

/**
 * 地震预警 NestJS 模块：聚合 EEW 相关控制器、服务与工具。
 *
 * 注册的 providers：
 *  - EarthquakeService：EEW 核心，负责 WolfX WebSocket 接入、预警评估与下发。
 *  - EarthquakeGlobalService：全球/区域地震目录（CENC / USGS）拉取与缓存。
 *  - EarthquakeCatalogNotifyService：CENC 目录新增事件定时通知。
 *  - EewPollService：SC EEW + CENC 主动查询与 USGS 兜底轮询。
 *  - EewLeaderService：基于 Redis 的主节点选举，确保多副本下仅主节点连接 WolfX。
 *
 * 导出 EarthquakeService 供其他模块注入使用。
 */
@Module({
  imports: [PrismaModule, AppConfigModule, HttpModule, RedisModule, NotificationModule],
  controllers: [EarthquakeController],
  providers: [
    EarthquakeService,
    EarthquakeGlobalService,
    EarthquakeCatalogNotifyService,
    EewPollService,
    EewLeaderService,
  ],
  exports: [EarthquakeService],
})
/**
 * EarthquakeModule：Nest @Module 模块。
 * - 所属域：modules/earthquake/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class EarthquakeModule {}
