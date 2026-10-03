/**
 * @file channels.module.ts
 * @module ChannelsModule
 *
 * 智能管家消息通道模块：负责将外部通道（Email、WebPush）接入通知与 Agent 体系。
 */
import { forwardRef, Module } from '@nestjs/common';
import { AgentModule } from '../agent/module';
import { UiConfigModule } from '../ui-config/module';
import { PrismaModule } from '../../shared/prisma/module';
import { ChannelsService } from './service';
import { ChannelsController } from './controller';
import { EmailService } from './email/service';
import { WebPushService } from './webpush/service';
import { ChannelConfigService } from './channel-config.service';
import { WecomService } from './wecom/wecom.service';
import { WecomController } from './wecom/wecom.controller';

@Module({
  imports: [UiConfigModule, forwardRef(() => AgentModule), PrismaModule],
  controllers: [ChannelsController, WecomController],
  providers: [
    ChannelsService,
    ChannelConfigService,
    EmailService,
    WebPushService,
    WecomService,
  ],
  exports: [
    ChannelsService,
    ChannelConfigService,
    EmailService,
    WebPushService,
    WecomService,
  ],
})
/**
 * ChannelsModule：Nest @Module 模块。
 * - 所属域：modules/channels/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class ChannelsModule
 */
export class ChannelsModule {}
