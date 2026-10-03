/** 全局应用配置模块：提供 AppConfigService 及 HA 状态路由、会话吊销等共享服务。 */
import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './service';
import { HaStateChangeRouterService } from '../ha/state-change-router.service';
import { ColdPathConsumerRegistry } from '../ha/cold-path-consumer';
import {
  AlertRuleWatchIndexService,
  AutomationWatchIndexService,
} from '../ha/watch-index.services';
import { TokenVersionCacheService } from '../../common/http-security/token-version-cache.service';
import { SessionRevocationService } from '../../common/http-security/session-revocation.service';

@Global()
@Module({
  providers: [
    AppConfigService,
    HaStateChangeRouterService,
    ColdPathConsumerRegistry,
    AutomationWatchIndexService,
    AlertRuleWatchIndexService,
    TokenVersionCacheService,
    SessionRevocationService,
  ],
  exports: [
    AppConfigService,
    HaStateChangeRouterService,
    ColdPathConsumerRegistry,
    AutomationWatchIndexService,
    AlertRuleWatchIndexService,
    TokenVersionCacheService,
    SessionRevocationService,
  ],
})
/**
 * AppConfigModule：Nest @Module 模块。
 * - 所属域：shared/app-config/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class AppConfigModule
 */
export class AppConfigModule {}
