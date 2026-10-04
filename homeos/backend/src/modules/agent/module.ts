/**
 * 智能管家模块（AgentModule）装配定义。
 *
 * 职责：聚合智能管家所需的全部 Provider / Service / Controller，并对外暴露 AgentService。
 * 依赖：
 *  - PrismaModule：数据库访问
 *  - StateStoreModule：HA 实体状态缓存
 *  - CommandProxyModule：下发 HA 服务调用
 *  - UiConfigModule：读取竖屏端布局（房间-设备映射、常用监控列表等）
 *  - AppConfigModule：读取 envSensorMap 等应用级配置
 *
 * 关键设计：
 *  - AgentSessionStoreService（10 分钟 / 16 轮 / Redis）负责连续对话长上下文；
 *    AgentShortTermMemoryService（45s / 2 轮 / 纯内存）负责反问闭环与指代消解，两者并存互补。
 *  - 通过 `LLM_PROVIDER` Symbol Token 把 ResolvingLlmProvider 注入为 LlmProvider 实现，
 *    业务侧只依赖 LlmProvider 接口，由 ResolvingLlmProvider 负责在 mock / deepseek 间按配置热切换。
 */
import { forwardRef, Module } from '@nestjs/common';
import { AgentController } from './controller';
import { AgentService } from './service';
import { AgentConfigService } from './config.service';
import { AgentAreaService } from './area.service';
import { AgentSessionStoreService } from './session-store.service';
import { AgentShortTermMemoryService } from './short-term-memory.service';
import { HomeToolsService } from './tools/home-tools.service';
import { FastPathService } from './fast-path.service';
import { CommandCacheService } from './command-cache.service';
import { LangTemplateService } from './lang-template.service';
import { LLM_PROVIDER } from './providers/llm-provider.interface';
import { ResolvingLlmProvider } from './providers/resolving-llm.provider';
import { McpGatewayController } from './mcp/mcp.controller';
import { McpGatewayService } from './mcp/mcp.service';
import { StateStoreModule } from '../state-store/module';
import { CommandProxyModule } from '../command-proxy/module';
import { UiConfigModule } from '../ui-config/module';
import { PrismaModule } from '../../shared/prisma/module';
import { AppConfigModule } from '../../shared/app-config/module';
import { ChildModeModule } from '../child-mode/module';
import { HaConnectorModule } from '../ha-connector/module';
import { HomeModeModule } from '../home-mode/module';
import { SystemOpsModule } from '../system/ops/system-ops.module';

/**
 * 智能管家：自然语言家居控制（快路径 / 命令缓存 / LLM tool-calling）+ MCP 网关
 */
@Module({
  imports: [
    PrismaModule,
    StateStoreModule,
    CommandProxyModule,
    UiConfigModule,
    AppConfigModule,
    ChildModeModule,
    HaConnectorModule,
    forwardRef(() => HomeModeModule),
    forwardRef(() => SystemOpsModule),
  ],
  controllers: [AgentController, McpGatewayController],
  providers: [
    AgentService,
    AgentConfigService,
    AgentAreaService,
    AgentSessionStoreService,
    AgentShortTermMemoryService,
    HomeToolsService,
    FastPathService,
    CommandCacheService,
    LangTemplateService,
    McpGatewayService,
    ResolvingLlmProvider,
    {
      // 把 ResolvingLlmProvider 以 LLM_PROVIDER Token 暴露，业务侧通过 @Inject(LLM_PROVIDER) 拿到
      provide: LLM_PROVIDER,
      useExisting: ResolvingLlmProvider,
    },
  ],
  exports: [AgentService, HomeToolsService, AgentConfigService],
})
/**
 * AgentModule：Nest @Module 模块。
 * - 所属域：modules/agent/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class AgentModule {}