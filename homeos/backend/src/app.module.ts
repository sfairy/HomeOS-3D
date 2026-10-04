/**
 * NestJS 应用根模块：装配全局中间件、跨域基础设施、各业务子域模块与 DI Token 端口。
 *
 * 装配说明：
 *  - 全局模块：ConfigModule / EventEmitterModule / ScheduleModule / ThrottlerModule（Redis 存储）；
 *  - 静态资源：ServeStaticModule 注册前端 SPA 分发 + 平面图 / 图标 / 背景 / 房间图 / 音效 / Logo 路径；
 *  - 功能子域：HA 连接器、状态存储、命令代理、认证、通知、安防、地震、模式与授权、天气、语音等；
 *  - 共享层：PrismaModule / RedisModule / AppConfigModule / HaEntityStateSharedModule；
 *  - 中间件：TraceMiddleware（全链路 traceId）、CsrfMiddleware（对非公开写端点强制 CSRF Token）。
 * 对外暴露：AppController（健康检查 / Prometheus）、AppService（聚合探针与指标）。
 */

// 导入 NestJS 核心模块装饰器
import {
  ExecutionContext,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { getStorageToken, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CsrfMiddleware } from './common/http-security/csrf.middleware';
import { TraceMiddleware } from './common/observability/trace.middleware';
import { MemoryThrottlerStorage } from './common/http-security/throttler-memory.storage';
// 导入配置模块（环境变量自动注入）
import { ConfigModule } from '@nestjs/config';
// 导入事件发射器模块（用于模块间松耦合通信）
import { EventEmitterModule } from '@nestjs/event-emitter';
// 导入 ServeStatic 模块（为前端 SPA 提供静态文件服务）
import { ServeStaticModule } from '@nestjs/serve-static';
// 导入速率限制模块（防止 API 滥用）
import { ScheduleModule } from '@nestjs/schedule';
// 静态资源缓存头类型
import { ServerResponse } from 'http';
// 导入各功能模块
import { HaConnectorModule } from './modules/ha-connector/module';
import { StateStoreModule } from './modules/state-store/module';
import { CommandProxyModule } from './modules/command-proxy/module';
import { WsPushModule } from './modules/ws-push/module';
import { AuthModule } from './modules/auth/module';
import { LicenseModule } from './modules/license/module';
import { UiConfigModule } from './modules/ui-config/module';
import { SecurityModule } from './modules/security/module';
import { SystemModule } from './modules/system/module';
import { MoviePilotProxyModule } from './modules/system/ops/moviepilot-proxy.module';
import { NotificationModule } from './modules/notification/module';
import { HomeModeModule } from './modules/home-mode/module';
import { EarthquakeModule } from './modules/earthquake/module';
import { AwarenessModule } from './modules/awareness/module';
import { AgentModule } from './modules/agent/module';
import { ChannelsModule } from './modules/channels/module';
import { ClientPowerModule } from './modules/client-power/module';
import { ChildModeModule } from './modules/child-mode/module';
import { WeatherModule } from './modules/weather/module';
import { PrismaModule } from './shared/prisma/module';
import { RedisModule } from './shared/redis/module';
import { JobRegistryModule } from './shared/jobs/module';
import { AppConfigModule } from './shared/app-config/module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HaEntityStateSharedModule } from './shared/ha/entity-state-shared.module';
import { HaStatePipelineModule } from './shared/ha/state-pipeline.module';
import {
  getBackgroundsDir,
  getFloorplansDir,
  getFrontendDistDir,
  getIconsDir,
  getLogoDir,
  getRoomImagesDir,
  getSoundsDir,
} from './common/platform/project-paths.util';

/** 可替换静态资源（logo / sounds / 用户上传图）：短缓存，换文件后刷新即可生效 */
function setReplaceableAssetHeaders(res: ServerResponse): void {
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
}

/**
 * 应用根模块
 *
 * 负责组装所有功能模块和中间件，是整个应用的装配入口。
 *
 * 核心配置：
 * - ServeStaticModule：平面图 / 背景 / 图标 / 房间图 / Logo / 音效 + 前端 SPA
 * - ConfigModule：全局环境变量读取（.env 文件）
 * - EventEmitterModule：模块间事件驱动通信
 * - ThrottlerModule：全局 API 速率限制（60秒内最多300次请求）
 *
 * 功能模块：
 * - HaConnectorModule：与 Home Assistant 的 WebSocket 通信核心
 * - StateStoreModule：实体状态缓存（L1内存 + L2 Redis）
 * - CommandProxyModule：HA 控制指令的 REST API 封装
 * - WsPushModule：通过 Socket.IO 向客户端实时推送状态
 * - AuthModule：JWT 认证与用户管理
 * - UiConfigModule：前端布局配置和静态资源管理
 * - SecurityModule：安防面板 / 存在感知 / 监控联动
 * - SystemModule：生活方式/运维/备份/设备/首装向导等子域聚合（感知与充放电已提升为顶层）
 * - HaConfigImportModule：HA 配置导入（场景/自动化/脚本）
 * - NotificationModule：站内通知与告警规则
 * - HomeModeModule：家庭模式管理
 * - AwarenessModule：语音对话 / STT / TTS
 * - AgentModule：自然语言家居控制（LLM 工具调用）
 * - ChannelsModule：外部渠道（Email / WebPush）
 * - ClientPowerModule：墙面板电量上报与自充联动
 * - EarthquakeModule：地震预警与震情目录
 * - MoviePilotProxyModule：MoviePilot 透明代理（须注册在 AppModule 末尾）
 */
@Module({
  imports: [
    // 静态资源托管

    // 托管 floorplans 目录，路由前缀 /floorplans
    // 用于存储用户上传的平面图 SVG/PNG 文件
    ServeStaticModule.forRoot({
      rootPath: getFloorplansDir(),
      serveRoot: '/floorplans',
      serveStaticOptions: { fallthrough: false, setHeaders: setReplaceableAssetHeaders },
    }),

    // 托管图标文件，路由前缀 /icons
    // 开发与生产均使用 assets/icons（Docker 挂载卷）
    ServeStaticModule.forRoot({
      rootPath: getIconsDir(),
      serveRoot: '/icons',
      serveStaticOptions: { fallthrough: false, setHeaders: setReplaceableAssetHeaders },
    }),

    // 托管仪表盘背景图，路由前缀 /backgrounds（开灯/关灯氛围图等）
    ServeStaticModule.forRoot({
      rootPath: getBackgroundsDir(),
      serveRoot: '/backgrounds',
      serveStaticOptions: { fallthrough: false, setHeaders: setReplaceableAssetHeaders },
    }),

    // 托管竖屏房间背景图，路由前缀 /room_images（Docker 挂载卷）
    ServeStaticModule.forRoot({
      rootPath: getRoomImagesDir(),
      serveRoot: '/room_images',
      serveStaticOptions: { fallthrough: false, setHeaders: setReplaceableAssetHeaders },
    }),

    // 托管音效（assets/sounds，Docker 挂载卷），路由前缀 /sounds
    ServeStaticModule.forRoot({
      rootPath: getSoundsDir(),
      serveRoot: '/sounds',
      serveStaticOptions: { fallthrough: false, setHeaders: setReplaceableAssetHeaders },
    }),

    // 托管品牌 Logo（assets/logo，Docker 挂载卷），路由前缀 /logo
    ServeStaticModule.forRoot({
      rootPath: getLogoDir(),
      serveRoot: '/logo',
      serveStaticOptions: { fallthrough: false, setHeaders: setReplaceableAssetHeaders },
    }),

    // 托管前端 SPA 静态文件（Vue.js 构建产物）
    // 排除 API / 健康检查 / Prometheus，避免抢走 Nest 根路由
    ServeStaticModule.forRoot({
      rootPath: getFrontendDistDir(),
      exclude: ['/api*splat', '/health', '/metrics'],
      renderPath: '*splat',
      serveStaticOptions: {
        setHeaders: (res: ServerResponse, filePath: string) => {
          // index.html / 入口 HTML 不缓存：每次都校验，确保拿到引用最新哈希资源的版本
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return;
          }
          // assets 下为内容哈希命名的产物，可安全长期强缓存（immutable）
          if (/[\\/]assets[\\/]/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      },
    }),

    // 核心基础设施模块

    // 全局配置模块：从 .env 文件读取环境变量
    ConfigModule.forRoot({
      isGlobal: true, // 设为全局模块，所有模块均可注入 ConfigService
      envFilePath: '.env',
    }),

    // 事件发射器模块：模块间解耦通信
    // 使用发布-订阅模式，避免模块间直接依赖
    EventEmitterModule.forRoot({
      wildcard: false, // 不使用通配符事件
      delimiter: '.', // 事件命名空间分隔符（如 'entity.state_changed'）
      maxListeners: 40, // 单个事件最大监听器数（防止内存泄漏）
      verboseMemoryLeak: true, // 内存泄漏时输出详细信息
    }),

    ScheduleModule.forRoot(),

    // 全局速率限制：防止 API 滥用
    // 每 60 秒内最多允许 300 次请求
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 时间窗口：60 秒
        limit: 300, // 请求上限：300 次
        // 仅对 HTTP 生效。ThrottlerGuard 通过 APP_GUARD 全局注册，其 canActivate 也会在
        // WebSocket 等非 HTTP 上下文执行；而 handleRequest 会往「响应对象」写
        // X-RateLimit-* 响应头，WS 上下文里 switchToHttp().getResponse() 取到的是
        // Socket 客户端（没有 header() 方法），于是每次 WS 消息都抛 TypeError 并被
        // WsExceptionsHandler 打印。限流语义本就只针对 HTTP API，这里直接跳过非 HTTP 上下文。
        // 注意：必须以数组元素形式传入——数组模式下 ThrottlerGuard 的 commonOptions 为空，
        // 只读取 namedThrottler.skipIf（对象形式的顶层 skipIf 不会被继承）。
        skipIf: (context: ExecutionContext) => context.getType() !== 'http',
      },
    ]),

    // 业务功能模块

    // Home Assistant 连接器（WebSocket 客户端）
    HaConnectorModule,

    // 实体状态存储（内存 + Redis 双层缓存）
    StateStoreModule,

    // HA 指令代理（REST API 封装）
    CommandProxyModule,

    // WebSocket 推送（Socket.IO 网关）+ HA Hot/Cold 状态管道
    WsPushModule,

    // 数据库访问层（Prisma ORM）
    PrismaModule,

    // Redis 缓存和事件总线
    RedisModule,
    AppConfigModule,
    HaEntityStateSharedModule,
    HaStatePipelineModule,
    JobRegistryModule,

    // 用户认证与授权（JWT）
    AuthModule,

    // 商业授权（离线永久 JWT；生产默认启用门禁，LICENSE_REQUIRED=0 可关闭）
    LicenseModule,

    // 前端 UI 配置管理
    UiConfigModule,

    // 安防监控与事件查询
    SecurityModule,

    // 系统信息与第三方 API 代理
    SystemModule,

    // 儿童模式 / 天气
    ChildModeModule,
    WeatherModule,

    // 通知管理
    NotificationModule,

    // 家庭模式管理（在家/离家/睡眠等）
    HomeModeModule,

    // 感知域（智能顾问 / 习惯推荐 / 语音）
    AwarenessModule,

    // 智能管家（自然语言控制 / LLM tool-calling）
    AgentModule,

    // 智能管家消息通道（Email / WebPush / 企业微信）
    ChannelsModule,

    // 客户端充放电联动
    ClientPowerModule,

    // 地震预警（EEW）— Wolfx WebSocket 监听与告警推送
    EarthquakeModule,

    // MoviePilot catch-all 代理（须最后注册，避免覆盖 /system/recommendations 等原生路由）
    MoviePilotProxyModule,
  ],

  // 根控制器（健康检查等基础端点）
  controllers: [AppController],

  // 根服务提供者
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 限流计数走进程内存（单副本部署）
    {
      provide: getStorageToken(),
      useClass: MemoryThrottlerStorage,
    },
  ],
})
/**
 * AppModule：Nest @Module 模块。
 * - 所属域：app；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes({
      path: '{*splat}',
      method: RequestMethod.ALL,
    });
    // NestJS 11 / Express 5：通配符须命名，避免 LegacyRouteConverter 警告
    consumer.apply(CsrfMiddleware).forRoutes({
      path: '{*splat}',
      method: RequestMethod.ALL,
    });
  }
}
