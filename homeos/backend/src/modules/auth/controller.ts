/**
 * 职责：
 *  - 认证控制器（登录/MFA/会话/游客/刷新）；
 * 关键依赖：
 *  - service.ts、session.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Request,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
  Delete,
  Query,
  Logger,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request as ExpressRequest, Response } from 'express';
import { AuthService } from './service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';
import { RolesGuard, Roles } from './roles.guard';
import { CSRF, generateCsrfToken } from '../../common/http-security/csrf.util';
import {
  resolveCookieSecureForRequest,
  isRequestSecure,
  getCookieSecureMode,
} from '../../common/http-security/cookie-cors.util';
import { forbidden } from '../../common/utils/business-exception';
import { API_ERROR } from '../../common/errors/api-error-messages';
import {
  LoginDto,
  SetupDto,
  UpdateProfileDto,
  CreateUserDto,
  UpdateUserDto,
  GuestTokenDto,
  GuestLoginDto,
  GuestExchangeDto,
  MfaVerifyDto,
  MfaSetupConfirmDto,
} from './dto/auth.dto';
import { UpdateUserPreferencesDto } from './dto/user-preferences.dto';

/**
 * Cookie 基础选项（maxAge / secure 由请求上下文动态决定）
 */
function cookieBase(req: ExpressRequest) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: resolveCookieSecureForRequest(req),
    path: '/',
  };
}

/**
 * 扩展 Express Request 类型，包含解码后的用户信息
 */
interface AuthRequest extends ExpressRequest {
  user: { userId: string; username: string; role: string };
}

@ApiTags('system')
@Controller('auth')
/**
 * AuthController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的端点（HTTP 方法 + 路径 + DTO 校验）；
 * - 鉴权：默认 JwtAuthGuard + 角色守卫（@Roles 装饰器按方法细化）；
 * - 主要调用：同域 Service + 跨域编排工具；
 */
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  private sessionCookieOptions(req: ExpressRequest, maxAge?: number) {
    return {
      ...cookieBase(req),
      maxAge: maxAge ?? this.authService.getSessionCookieMaxAgeMs(),
    };
  }

  private setAuthCookie(res: Response, req: ExpressRequest, token: string, maxAge?: number) {
    const opts = this.sessionCookieOptions(req, maxAge);
    // 双协议登录诊断：当 HTTP(:8126) 登录写不进 Cookie 时，据此判断 secure 标志是否被错误置位
    // （多由 COOKIE_SECURE=true 或上游误注入 X-Forwarded-Proto=https 引起；auto 模式应随访问协议变化）。
    this.logger.debug(
      `[登录 Cookie] 写入 auth_token secure=${opts.secure} sameSite=${opts.sameSite} ` +
        `模式=${getCookieSecureMode()} 请求是否 HTTPS=${isRequestSecure(req)} ` +
        `xfp=${req.headers['x-forwarded-proto'] ?? '-'} host=${req.headers.host ?? '-'}`,
    );
    res.cookie('auth_token', token, opts);
  }

  private setCsrfCookie(res: Response, req: ExpressRequest) {
    res.cookie(CSRF.COOKIE, generateCsrfToken(), {
      httpOnly: false,
      sameSite: 'lax',
      secure: resolveCookieSecureForRequest(req),
      maxAge: this.authService.getSessionCookieMaxAgeMs(),
      path: '/',
    });
  }

  /**
   * 仅在缺少 csrf_token 时下发，避免 /auth/status 轮询或 CSRF bootstrap
   * 与并发 POST（如 /auth/refresh）抢写 Cookie，导致 Header/Cookie 不一致 403。
   */
  private ensureCsrfCookie(res: Response, req: ExpressRequest) {
    const existing = req.cookies?.[CSRF.COOKIE];
    if (typeof existing === 'string' && existing.length > 0) return;
    this.setCsrfCookie(res, req);
  }

  /**
   * 获取系统初始化状态（同时检测是否已登录）
   *
   * 返回：
   * - initialized: 系统是否已初始化（是否有用户）
   * - authenticated: 当前请求是否已认证
   * - username: 已认证用户的用户名
   */
  @ApiOperation({ summary: '获取系统初始化与登录状态' })
  @Public()
  @Get('status')
  async getStatus(@Request() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.ensureCsrfCookie(res, req);
    const count = await this.authService.countUsers();
    const token = req.cookies?.['auth_token'] || null;
    let authenticated = false;
    let username = '';
    let role = '';
    let restrictions: string[] = [];
    if (token) {
      try {
        const payload = await this.authService.verifyToken(token);
        authenticated = true;
        username = payload.username;
        role = payload.role;
        restrictions = payload.restrictions || [];
      } catch {
        /* token无效，忽略 */
      }
    }
    return {
      initialized: count > 0,
      authenticated,
      username,
      role,
      restrictions,
      // 仅在系统已初始化时下发远程访问地址，避免未认证即可探测 WAN 地址
      external_url: count > 0 ? await this.authService.getExternalUrl() : '',
    };
  }

  /**
   * 系统初始化设置 — 注册第一个管理员并设置 Cookie
   *
   * 限制：
   * - 仅在系统未初始化时可用（无用户时）
   * - 速率限制：每分钟最多 3 次
   */
  @ApiOperation({ summary: '首次初始化（创建管理员）' })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  @Post('setup')
  async setup(
    @Body() body: SetupDto,
    @Request() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const count = await this.authService.countUsers();
    if (count > 0) {
      forbidden(API_ERROR.AUTH_SYSTEM_INITIALIZED);
    }
    const user = await this.authService.registerFirstUser(body.username, body.password);
    const result = await this.authService.login(user);

    // 设置 HttpOnly Cookie
    this.setAuthCookie(res, req, result.access_token);
    this.setCsrfCookie(res, req);
    return {
      username: result.username,
      role: result.role,
      restrictions: result.restrictions,
      external_url: result.external_url,
    };
  }

  /**
   * 用户登录 — 验证凭据并设置 HttpOnly Cookie
   *
   * 速率限制：每分钟最多 15 次（家庭局域网墙屏/首装重试场景）
   */
  @ApiOperation({ summary: '用户登录' })
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Request() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim();
    const userAgent = req.headers['user-agent']?.toString().slice(0, 256);
    const user = await this.authService.validateUser(body.username, body.password, ip, userAgent);
    if (this.authService.userRequiresMfa(user)) {
      return { requiresMfa: true, username: user.username };
    }
    const result = await this.authService.login(user);

    this.setAuthCookie(res, req, result.access_token);
    this.setCsrfCookie(res, req);
    return {
      username: result.username,
      role: result.role,
      restrictions: result.restrictions,
      external_url: result.external_url,
    };
  }

  /**
   * 滑动续期 — 凭有效令牌换取新令牌并刷新 Cookie 有效期
   * 活跃使用的设备（如墙面板）会自动续期，长期不访问的会话则在有效期后过期
   */
  @ApiOperation({ summary: '滑动续期会话' })
  @ApiBearerAuth()
  @Roles('admin', 'adult', 'child')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Request() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.refresh(req.user);
    this.setAuthCookie(res, req, result.access_token);
    // 滑动续期不轮换 CSRF：与并发写请求/二次 refresh 错开时会 Header≠Cookie → 403
    this.ensureCsrfCookie(res, req);
    return { username: result.username, role: result.role, restrictions: result.restrictions };
  }

  /**
   * 用户登出 — 清除 Cookie
   */
  @ApiOperation({ summary: '用户登出' })
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: ExpressRequest, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.auth_token;
    if (token) {
      // 仅吊销当前设备的会话（按 jti），其它设备保持登录
      await this.authService.revokeSessionByToken(token);
    }
    const secure = resolveCookieSecureForRequest(req);
    res.clearCookie('auth_token', { path: '/', httpOnly: true, sameSite: 'lax' as const, secure });
    res.clearCookie(CSRF.COOKIE, { path: '/', sameSite: 'lax', secure });
    return { message: '已登出' };
  }

  /**
   * 更新用户资料（需要认证）
   */
  @ApiOperation({ summary: '更新个人资料' })
  @ApiBearerAuth()
  @Roles('admin', 'adult', 'child')
  @Patch('profile')
  async updateProfile(@Request() req: AuthRequest, @Body() body: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.userId, body);
  }

  /**
   * 生成访客限时访问凭证
   */
  @ApiOperation({ summary: '签发访客限时 Token' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('guest-token')
  createGuestToken(@Request() req: AuthRequest, @Body() body: GuestTokenDto) {
    return this.authService.generateGuestToken(
      req.user.userId,
      body.validHours || 8,
      body.restrictions,
      body.allowedSceneIds,
    );
  }

  /**
   * 访客短码兑换登录
   */
  @ApiOperation({ summary: '访客短码兑换登录' })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  @Post('guest-exchange')
  @HttpCode(HttpStatus.OK)
  async guestExchange(
    @Body() body: GuestExchangeDto,
    @Request() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.exchangeGuestCode(body.code);
    const maxAge = Math.max(new Date(result.expiresAt).getTime() - Date.now(), 60_000);
    this.setAuthCookie(res, req, result.access_token, maxAge);
    this.setCsrfCookie(res, req);
    return { role: result.role, restrictions: result.restrictions, expiresAt: result.expiresAt };
  }

  @ApiOperation({ summary: '访客 Token 登录' })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  @Post('guest-login')
  @HttpCode(HttpStatus.OK)
  guestLogin(
    @Body() body: GuestLoginDto,
    @Request() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = this.authService.guestLogin(body.token);
    const maxAge = Math.max(new Date(result.expiresAt).getTime() - Date.now(), 60_000);
    this.setAuthCookie(res, req, result.access_token, maxAge);
    this.setCsrfCookie(res, req);
    return { role: result.role, restrictions: result.restrictions, expiresAt: result.expiresAt };
  }

  @ApiOperation({ summary: '列出所有用户' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('users')
  listUsers() {
    return this.authService.listUsers();
  }

  @ApiOperation({ summary: '登录审计记录（admin）' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('login-audit')
  getLoginAudit(@Query('limit') limit?: string, @Query('page') page?: string) {
    return this.authService.getLoginAudit(limit ? Number(limit) : 20, page ? Number(page) : 1);
  }

  @ApiOperation({ summary: 'MFA 第二步登录（admin TOTP）' })
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async mfaVerify(
    @Body() body: MfaVerifyDto,
    @Request() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim();
    const userAgent = req.headers['user-agent']?.toString().slice(0, 256);
    const result = await this.authService.loginWithMfa(body.username, body.password, body.code, ip, userAgent);
    this.setAuthCookie(res, req, result.access_token);
    this.setCsrfCookie(res, req);
    return {
      username: result.username,
      role: result.role,
      restrictions: result.restrictions,
      external_url: result.external_url,
    };
  }

  @ApiOperation({ summary: 'MFA 状态' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('mfa/status')
  getMfaStatus(@Request() req: AuthRequest) {
    return this.authService.getMfaStatus(req.user.userId);
  }

  @ApiOperation({ summary: '发起 MFA 设置（返回 QR）' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('mfa/setup')
  startMfaSetup(@Request() req: AuthRequest) {
    return this.authService.startMfaSetup(req.user.userId);
  }

  @ApiOperation({ summary: '确认启用 MFA' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('mfa/confirm')
  confirmMfa(@Request() req: AuthRequest, @Body() body: MfaSetupConfirmDto) {
    return this.authService.confirmMfaSetup(req.user.userId, body.code);
  }

  @ApiOperation({ summary: '关闭 MFA' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('mfa/disable')
  disableMfa(@Request() req: AuthRequest, @Body() body: MfaSetupConfirmDto) {
    return this.authService.disableMfa(req.user.userId, body.code);
  }

  @ApiOperation({ summary: '创建用户' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('users')
  createUser(@Body() body: CreateUserDto) {
    return this.authService.createUser({
      username: body.username,
      password: body.password,
      role: body.role,
      entityRestrictions: body.entityRestrictions,
    });
  }

  @ApiOperation({ summary: '更新用户' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('users/:id')
  updateUser(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.authService.updateUser(id, body, req.user.role);
  }

  @ApiOperation({ summary: '删除用户' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('users/:id')
  deleteUser(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.authService.deleteUser(id, req.user.userId);
  }

  /**
   * 获取用户偏好
   */
  @ApiOperation({ summary: '获取用户偏好' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  getPreferences(@Request() req: AuthRequest) {
    return this.authService.getUserPreferences(req.user.userId);
  }

  /**
   * 更新用户偏好
   */
  @ApiOperation({ summary: '更新用户偏好' })
  @ApiBearerAuth()
  @Roles('admin', 'adult', 'child')
  @Put('preferences')
  updatePreferences(@Request() req: AuthRequest, @Body() body: UpdateUserPreferencesDto) {
    return this.authService.updateUserPreferences(req.user.userId, body);
  }
}
