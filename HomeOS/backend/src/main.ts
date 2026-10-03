/**
 * HomeOS 后端应用入口文件
 *
 * 职责：
 * 1. 创建并配置 NestJS 应用实例
 * 2. 加载或生成 JWT 密钥
 * 3. 配置安全中间件（Helmet、CORS）
 * 4. 设置全局验证管道和异常过滤器
 * 5. 启动 Swagger API 文档（开发环境）
 * 6. 监听指定端口并提供优雅关闭机制
 */

// 尽早注入 .env，供 Prisma Pool / 启动探测在 ConfigModule 初始化前读取 DATABASE_URL
import 'dotenv/config';

// NestJS 核心模块
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

// Swagger API 文档生成器
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Express 中间件
import { json, text, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';

// 全局异常过滤器
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import { resolveNestLogger } from './common/observability/structured-logger';

// Node.js 核心模块
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// 工具函数
import { formatBootstrapFailure, getErrorMessage } from './common/utils';

// SPA fallback 中间件
import { spaFallbackMiddleware } from './common/http-security/spa-fallback.middleware';

// 统一 CORS 来源判定（HTTP 与 WebSocket 共用）
import { resolveAllowedOrigins, isOriginAllowed, isHttpsDeployMode } from './common/http-security/cookie-cors.util';
import { JwtService } from '@nestjs/jwt';
import { HaConfigService } from './modules/ha-connector/ha-config.service';

import { getFrontendDistDir } from './common/platform/project-paths.util';
import { parseEnvBoolean } from './common/utils/parse-boolean.util';
import { isLicenseRequiredFromEnv } from './modules/license/license.constants';

// JWT / 访客密码加密密钥文件路径（持久化数据目录，容器重建后密钥不变）
const JWT_SECRET_FILE = path.join(process.cwd(), 'data', '.jwt-secret');
const GUEST_PASS_SECRET_FILE = path.join(process.cwd(), 'data', '.guest-pass-secret');

/**
 * 从持久化数据目录加载 JWT 密钥
 */
function loadJwtSecretFromFile(logger: Logger): string | null {
  try {
    if (fs.existsSync(JWT_SECRET_FILE)) {
      const secret = fs.readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
      if (secret.length >= 32) {
        logger.log(`JWT 密钥已从 ${JWT_SECRET_FILE} 加载`);
        return secret;
      }
    }
  } catch (e) {
    logger.warn(`无法读取 JWT 密钥文件: ${e instanceof Error ? e.message : e}`);
  }
  return null;
}

/**
 * 生成随机 JWT 密钥并写入持久化目录（容器重建后密钥不变）
 */
function generateAndPersistJwtSecret(logger: Logger): string {
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(JWT_SECRET_FILE), { recursive: true });
    fs.writeFileSync(JWT_SECRET_FILE, secret, { mode: 0o600 });
    logger.log(`已生成新的 JWT 密钥并保存到 ${JWT_SECRET_FILE}`);
  } catch (e) {
    logger.warn(`无法写入 JWT 密钥文件: ${e}`);
  }
  return secret;
}

/**
 * 加载或生成 JWT 密钥
 *
 * 密钥加载优先级：
 * 1. 环境变量 JWT_SECRET（排除默认值）
 * 2. 从 data/.jwt-secret 文件加载
 * 3. 生成新的随机密钥并保存到文件
 *
 * @param logger - 日志记录器实例
 * @returns JWT 密钥字符串
 */
function loadOrGenerateJwtSecret(logger: Logger): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === 'production';
  const weakDefaults = new Set([
    'changeit',
    'homeos-jwt-secret',
    'default-secret',
    'xinjiang-sfairy-to-a-random-string',
    'REPLACE_ME_run_openssl_rand_hex_32_before_deploy',
  ]);

  // 优先使用环境变量中的密钥（排除常见默认值）
  if (envSecret && !weakDefaults.has(envSecret)) {
    if (envSecret.length < 32) {
      logger.error('JWT_SECRET 长度须至少 32 字符');
      process.exit(1);
    }
    return envSecret;
  }

  const fromFile = loadJwtSecretFromFile(logger);
  if (fromFile) {
    return fromFile;
  }

  if (isProduction) {
    logger.warn(
      '未设置 JWT_SECRET,将在 data/.jwt-secret 自动生成;多副本部署请通过环境变量显式设置同一密钥',
    );
  }

  return generateAndPersistJwtSecret(logger);
}

/**
 * 加载或生成访客临时密码加密密钥（与 JWT 同样自动持久化，避免启动 WARN）。
 * 优先级：环境变量 → data/.guest-pass-secret → 生成并写入文件。
 */
function loadOrGenerateGuestPassSecret(logger: Logger): string {
  const envSecret = process.env.GUEST_PASS_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }

  try {
    if (fs.existsSync(GUEST_PASS_SECRET_FILE)) {
      const fromFile = fs.readFileSync(GUEST_PASS_SECRET_FILE, 'utf-8').trim();
      if (fromFile.length >= 16) {
        logger.log(`访客密码加密密钥已从 ${GUEST_PASS_SECRET_FILE} 加载`);
        return fromFile;
      }
    }
  } catch (e) {
    logger.warn(`无法读取访客密码密钥文件: ${e instanceof Error ? e.message : e}`);
  }

  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(GUEST_PASS_SECRET_FILE), { recursive: true });
    fs.writeFileSync(GUEST_PASS_SECRET_FILE, secret, { mode: 0o600 });
    logger.log(`已生成访客密码加密密钥并保存到 ${GUEST_PASS_SECRET_FILE}`);
  } catch (e) {
    logger.warn(`无法写入访客密码密钥文件: ${e}`);
  }
  return secret;
}

/** 明显占位/过弱密码 */
const WEAK_DB_PASSWORDS = new Set(['change-me', 'password', 'postgres', 'homeos']);
/** 一键部署演示默认密码；LAN 可用，公网/加固模式须更换 */
const DEMO_DB_PASSWORD = 'xinjiang-sfairy';

/**
 * 是否启用生产加固（拒绝过弱 / 演示默认 DB 密码）。
 * HOMEOS_HARDENED 显式 0/false/no/off → 关闭；1/true/yes/on → 开启；
 * 未设置时：production 默认开启（与 Compose 缺省一致）。
 */
function isHomeosHardenedFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = parseEnvBoolean(env.HOMEOS_HARDENED);
  if (explicit !== null) return explicit;
  return env.NODE_ENV === 'production';
}

/**
 * 生产环境拒绝过弱数据库密码。Compose 默认 HOMEOS_HARDENED=1，演示口令一律拒绝；
 * 本机 NODE_ENV=production 连已有演示库时设 HOMEOS_HARDENED=0。
 */
function assertProductionDatabaseUrl(logger: Logger): void {
  if (process.env.NODE_ENV !== 'production') return;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;
  try {
    const parsed = new URL(url);
    const password = decodeURIComponent(parsed.password || '');
    const weak = !password || WEAK_DB_PASSWORDS.has(password) || password.length < 12;
    const demo = password === DEMO_DB_PASSWORD;
    if (!weak && !demo) return;
    if (!isHomeosHardenedFromEnv()) {
      logger.warn(
        demo
          ? 'HOMEOS_HARDENED=0：已允许演示默认数据库密码，仅限内网；公网请设 HOMEOS_HARDENED=1 并更换 POSTGRES_PASSWORD'
          : 'HOMEOS_HARDENED=0：已允许过弱数据库密码，仅限内网',
      );
      return;
    }
    if (demo) {
      logger.error('禁止使用演示默认密码 xinjiang-sfairy,请设置随机 POSTGRES_PASSWORD(≥12 位)');
      process.exit(1);
    }
    logger.error('生产环境 DATABASE_URL 密码过弱;请设置 POSTGRES_PASSWORD(至少 12 位随机)');
    process.exit(1);
  } catch {
    logger.warn('无法解析 DATABASE_URL,跳过数据库密码强度检查');
  }
}

/**
 * 解析 trust proxy 配置。
 *
 * 默认仅信任来自私有网段/回环来源的反代（Express 逐跳校验）：公网直连时
 * X-Forwarded-For / X-Forwarded-Proto 可被客户端伪造，若不校验来源会导致
 * 限流按伪造 IP 稀释、HTTPS 判定被篡改。
 * 复杂反代链路（如 CDN → 多层代理）可显式设置 TRUST_PROXY（取值同 Express
 * `trust proxy`：数字跳数 / loopback / IP 子网 / false 等）。
 */
function resolveTrustProxyValue(): boolean | number | string | ((ip: string) => boolean) {
  const raw = process.env.TRUST_PROXY?.trim();
  if (raw !== undefined && raw !== '') {
    if (raw === 'false') return false;
    if (/^\d+$/.test(raw)) return Number(raw);
    return raw;
  }
  // 默认：仅信任私有网段/回环来源的转发头（公网直连不信任）
  return (ip: string) => {
    if (!ip) return false;
    const normalized = ip === '::ffff:127.0.0.1' ? '127.0.0.1' : ip;
    if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
      return true;
    }
    if (/^10\./.test(normalized)) return true;
    if (/^192\.168\./.test(normalized)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) return true;
    // link-local（容器桥接 / K8s 常见）
    if (/^169\.254\./.test(normalized)) return true;
    return false;
  };
}

/**
 * 应用启动函数
 *
 * 执行以下初始化步骤：
 * 1. 加载 JWT 密钥
 * 2. 创建 NestJS 应用实例
 * 3. 配置安全中间件（Helmet、压缩、Cookie）
 * 4. 设置 CORS 跨域策略
 * 5. 配置全局验证管道和异常过滤器
 * 6. 设置 API 路由前缀
 * 7. 启动 Swagger 文档（开发环境）
 * 8. 监听端口并注册优雅关闭钩子
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // 加载或生成 JWT / 访客密码加密密钥并注入环境变量
  process.env.JWT_SECRET = loadOrGenerateJwtSecret(logger);
  process.env.GUEST_PASS_SECRET = loadOrGenerateGuestPassSecret(logger);
  assertProductionDatabaseUrl(logger);

  const licenseRequired = isLicenseRequiredFromEnv();
  if (licenseRequired && process.env.NODE_ENV === 'production') {
    const machineIdPath = '/etc/machine-id';
    if (!fs.existsSync(machineIdPath) || !fs.readFileSync(machineIdPath, 'utf8').trim()) {
      const hint =
        process.platform === 'win32'
          ? 'Windows：若已有 data/.internal/device.id 则保持原指纹；否则使用 MachineGuid'
          : '将回落到 macUUID / 已有 device.id / Windows MachineGuid / 新建 device.id（清数据卷可能丢指纹）。Linux 建议挂载: /etc/machine-id:/etc/machine-id:ro';
      logger.warn(`LICENSE_REQUIRED=1 但 /etc/machine-id 不可用;${hint}`);
    }
  }

  const cookieSecure = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (process.env.NODE_ENV === 'production' && cookieSecure === 'false') {
    logger.warn(
      'COOKIE_SECURE=false:登录 Cookie 将通过 HTTP 明文传输,仅建议在纯内网 HTTP 调试时使用',
    );
  }

  // 创建 NestJS 应用实例（LOG_FORMAT=json 时输出结构化 JSON 日志）
  const app = await NestFactory.create(AppModule, {
    logger: resolveNestLogger(),
  });

  // 置于 Caddy / nginx 等反代之后时，信任 X-Forwarded-* 头。
  // 默认仅信任私有网段/回环来源的反代（逐跳校验），避免公网直连客户端伪造
  // X-Forwarded-For 绕过限流/审计；复杂反代链路可用 TRUST_PROXY 显式覆盖。
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', resolveTrustProxyValue());

  // 配置 Helmet 安全中间件（设置各种 HTTP 头以增强安全性）
  // HTTPS 反代部署（COOKIE_SECURE=true）时启用 HSTS；auto/false 则不启用以免锁死 HTTP :8126
  const httpsDeploy = isHttpsDeployMode();
  app.use(
    helmet({
      contentSecurityPolicy: false, // 禁用 CSP（与前端开发服务器冲突）
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
      originAgentCluster: false,
      hsts: httpsDeploy ? { maxAge: 15552000, includeSubDomains: true } : false,
    }),
  );

  // 启用 Gzip 压缩（减少响应体积）
  app.use(compression());

  // SPA fallback 全局中间件（必须在 ServeStaticModule 之前注册）
  // 对 /assets/ 等静态资源路径，若文件不存在则返回 404，避免被回退成 index.html
  app.use(spaFallbackMiddleware(getFrontendDistDir()));

  // 启用 Cookie 解析器
  app.use(cookieParser());

  // 企业微信回调为 XML 明文，需在 JSON 解析器之前按路径接收原始文本
  app.use(
    '/api/v1/channels/wecom/callback',
    text({
      type: ['text/xml', 'application/xml', 'text/plain', '*/*'],
      limit: '2mb',
      verify: (req: import('express').Request, _res: import('express').Response, buf: Buffer) => {
        (req as unknown as Record<string, unknown>).rawBody = buf;
      },
    }),
  );

  // 配置 JSON 和 URL 编码解析器（限制最大请求体为 50MB）
  // verify 回调保留 rawBody 供内嵌反代透传原始请求体，避免重序列化破坏上游签名校验
  app.use(
    json({
      limit: '50mb',
      verify: (req: import('express').Request, _res: import('express').Response, buf: Buffer) => {
        (req as unknown as Record<string, unknown>).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // 公开 / 未认证路由独立挂载小体积解析器（先于全局 50mb，body-parser 对已解析请求自动跳过）：
  // 防止未认证请求携带超大 JSON body 消耗 Express 解析 CPU 与内存（绕过多级限流阈值前即可被拒绝）
  const publicJson = json({
    limit: '1mb',
    verify: (req: import('express').Request, _res: import('express').Response, buf: Buffer) => {
      (req as unknown as Record<string, unknown>).rawBody = buf;
    },
  });
  // 未鉴权端点使用小体积 body 解析器（1MB，而非默认 50MB）：
  // 这些都是登录/状态/公开配置端点，故意不经过鉴权即解析；如果允许超大 JSON body，
  // 攻击者可在被 JWT 限流拒绝之前就用巨型 body 耗光 bun 解析 CPU 与堆内存。
  const PUBLIC_BODY_LIMIT_PATHS = [
    '/api/v1/auth/login',
    '/api/v1/auth/setup',
    '/api/v1/auth/guest-login',
    '/api/v1/auth/status',
    '/api/v1/system/config/public',
    '/api/v1/ha/status',
    '/api/v1/entities',
    '/api/v1/mcp',
  ];
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const p = req.path;
    if (PUBLIC_BODY_LIMIT_PATHS.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) {
      return publicJson(req, _res, next);
    }
    next();
  });

  // 配置 CORS 跨域策略（与 WebSocket 网关共用 cookie-cors.util 判定逻辑）
  const allowedOrigins = resolveAllowedOrigins();

  if (allowedOrigins.length === 0) {
    logger.warn(
      'CORS_ORIGINS 未配置:默认仅放行同源,localhost 与局域网(RFC1918)来源.' +
        '如需公网访问,请显式配置 CORS_ORIGINS.',
    );
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // 允许无 origin 的请求（如移动应用、Postman、同源导航）
      if (!origin) return callback(null, true);
      // 不在白名单：不抛错（否则同源静态资源也会被 500），仅不附带 CORS 头
      callback(null, isOriginAllowed(origin, allowedOrigins));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'x-homeos-mcp-key',
    ],
    credentials: true, // 允许携带 Cookie
  });

  // 配置全局验证管道（自动验证 DTO、剔除未定义属性）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剔除 DTO 中未定义的属性
      transform: true, // 自动转换类型（如字符串转数字）
      forbidNonWhitelisted: true, // 拒绝包含未定义属性的请求
    }),
  );

  // 注册全局异常过滤器（统一错误响应格式）
  app.useGlobalFilters(new GlobalExceptionFilter());

  // 设置全局 API 路由前缀（排除健康检查端点）
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });

  // 从环境变量读取端口号（默认 8501）
  const port = process.env.PORT || 8501;

  // Swagger API 文档（仅开发环境可见）
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('HomeOS 接口文档')
      .setDescription('HomeOS 智能家居中控平台 API 文档')
      .setVersion('1.0')
      .addBearerAuth() // 启用 Bearer Token 认证
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, doc);
    logger.log('Swagger API 文档: http://localhost:' + port + '/api/docs');
  }

  // 启动 HTTP 服务器，监听所有网络接口
  const server = await app.listen(port, '0.0.0.0');

  try {
    const jwtService = app.get(JwtService);
    const haConfig = app.get(HaConfigService);
    const { PrismaService } = await import('./shared/prisma/service');
    const { TokenVersionCacheService } =
      await import('./common/http-security/token-version-cache.service');
    const { SessionRevocationService } =
      await import('./common/http-security/session-revocation.service');
    const { resolveWsUserFromToken } = await import('./modules/ws-push/auth.util');
    const { attachHaGo2RtcWsProxy } = await import('./shared/ha/go2rtc-ws-proxy.util');
    const prisma = app.get(PrismaService);
    const tokenVersionCache = app.get(TokenVersionCacheService);
    const sessionRevocation = app.get(SessionRevocationService);
    attachHaGo2RtcWsProxy(server, {
      resolveWsUser: (token) =>
        resolveWsUserFromToken(
          token,
          jwtService,
          prisma,
          tokenVersionCache,
          sessionRevocation,
        ),
      getHaUrl: async () => {
        const { haUrl } = await haConfig.getConfig();
        return haUrl?.trim() || undefined;
      },
    });

    const { EmbedProxyService } = await import('./modules/system/embed-proxy.service');
    const embedProxy = app.get(EmbedProxyService);
    const { attachEmbedWsProxy } = await import('./common/embed/ws-proxy.util');
    attachEmbedWsProxy(server, jwtService, (embedId) => embedProxy.resolveEmbedBaseUrl(embedId));
  } catch (err) {
    logger.warn(`WebSocket 反代未完全启用: ${getErrorMessage(err)}`);
  }

  logger.log(`HomeOS 后端运行在端口 ${port}`);

  // 检查 Home Assistant 连接配置（UI/DB 配置优先；HA_URL 仅为环境变量兜底）
  if (process.env.HA_URL) {
    logger.log('HA_URL 环境变量已配置(也可被 UI/数据库配置覆盖)');
  } else {
    logger.log('未设置 HA_URL 环境变量,将使用 UI/数据库中的 HA 配置');
  }

  // 注册优雅关闭钩子（处理 SIGTERM 和 SIGINT 信号）
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.log(`收到 ${signal} 信号,正在优雅关闭...`);
      try {
        // 关闭 NestJS 应用（触发模块的 onModuleDestroy 钩子）
        await app.close();
        server.close(() => {
          logger.log('HTTP 服务器已关闭');
          process.exit(0);
        });
      } catch (err) {
        logger.error('关闭过程中出错', err instanceof Error ? err.stack : String(err));
        process.exit(1);
      }
    });
  }
}

// 启动应用并捕获启动错误
bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  const { summary, dumpStack } = formatBootstrapFailure(err);
  for (const line of summary.split('\n')) {
    if (line.length > 0) logger.error(line);
  }
  if (dumpStack && err instanceof Error && err.stack) {
    logger.error(err.stack);
  }
  process.exit(1);
});
