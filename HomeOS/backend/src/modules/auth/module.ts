/**
 * 认证授权模块：初始化设置 / 登录续期 / 访客分享 / MFA / 角色与场景守卫的集中装配入口。
 *
 * 所属模块：modules/auth（APP_GUARD 注册 JwtAuthGuard + GuestWriteGuard + RolesGuard，全局生效）。
 * 装配清单：
 *  - imports：PassportModule（default=jwt）、JwtModule（从 ConfigService 动态读密钥与过期）、forwardRef（NotificationModule 登录安全告警）；
 *  - controllers：AuthController（setup/login/refresh/guest/login/mfa/preferences 端点）；
 *  - providers：AuthService、GuestShareCodeService、JwtStrategy + 三个 APP_GUARD；
 *  - exports：AuthService / JwtStrategy / PassportModule / 各 Guard / JwtModule，供其他模块做授权复用。
 * 安全要点：登录接口 RateLimit 5 次/分，setup 3 次/分；bcryptjs 密码校验；JWT 滑动续期。
 */

// 导入 NestJS 模块装饰器
import { forwardRef, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
// 导入 JWT 模块（Token 生成和验证）
import { JwtModule } from '@nestjs/jwt';
// 导入 Passport 认证模块
import { PassportModule } from '@nestjs/passport';
// 导入配置模块（动态读取 JWT 密钥）
import { ConfigModule, ConfigService } from '@nestjs/config';
// 导入本模块组件
import { AuthService } from './service';
import { AuthController } from './controller';
import { GuestShareCodeService } from './guest-share-code.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { GuestWriteGuard } from './guest-write.guard';
import { GuestSceneGuard } from './guest-scene.guard';
import { NotificationModule } from '../notification/module';

/**
 * 认证模块
 *
 * 负责系统的用户认证和授权功能：
 * - 系统初始化（首次设置管理员账户）
 * - 用户登录（用户名/密码 → JWT Token）
 * - 用户资料更新
 *
 * 技术栈：
 * - JWT（JSON Web Token）：无状态认证，Token 有效期 3650 天
 * - Passport：Node.js 认证中间件框架
 * - bcryptjs：密码加密，盐值轮数 10
 *
 * 安全措施：
 * - 登录接口受速率限制（每分钟 5 次）
 * - 初始化接口受速率限制（每分钟 3 次）
 * - JWT_SECRET 从环境变量读取，生产环境需使用强随机密钥
 */
@Module({
  imports: [
    // 注册 Passport 模块，默认策略为 jwt
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // 异步注册 JWT 模块（从 ConfigService 动态读取密钥）
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
        // 访问令牌有效期可配置（默认 30 天，与 Cookie maxAge 一致）。
        // 配合 /auth/refresh 滑动续期：活跃使用的设备会在有效期内自动续期。
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') || '30d' },
      }),
    }),
    // 登录安全告警：复用通知模块的站内通知 + 外部渠道推送
    forwardRef(() => NotificationModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GuestShareCodeService,
    JwtStrategy,
    RolesGuard,
    GuestWriteGuard,
    GuestSceneGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: GuestWriteGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [
    AuthService,
    JwtStrategy,
    PassportModule,
    RolesGuard,
    GuestWriteGuard,
    GuestSceneGuard,
    JwtModule,
  ],
})
/**
 * AuthModule：Nest @Module 模块。
 * - 所属域：modules/auth/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class AuthModule
 */
export class AuthModule {}
