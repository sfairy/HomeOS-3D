/**
 * 商业授权全局守卫：LICENSE_REQUIRED=1 时，除白名单外所有 HTTP 请求必须处于激活有效期。
 *
 * 所属模块：modules/license（通过 APP_GUARD 注册，与 JwtAuthGuard / RolesGuard 独立判定）。
 * 行为说明：
 *  - LICENSE_REQUIRED=0 一律放行（社区/单机默认）；
 *  - 豁免路径：/health、/metrics、/auth/*、/api/v1/license/*、/system/config/public；
 *  - 其余请求调用 LicenseService#validateAccess，过期 / 指纹不匹配抛 402 业务异常。
 * 关键依赖：LicenseService（判定激活状态与指纹）。
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { isHttpContext } from '../../common/http-security/http-guard.util';
import { LicenseService } from './license.service';

// 商业授权严格路径豁免：精确匹配。LICENSE_REQUIRED=1 时未激活用户必须能完成登录、设置、
// 查看公开系统配置以及 License 自身页面，否则无法激活后被永久锁死在入口。
const LICENSE_EXEMPT_EXACT = new Set([
  '/health',
  '/metrics',
  '/api/v1/auth/status',
  '/api/v1/auth/setup',
  '/api/v1/auth/login',
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/guest-login',
  '/api/v1/auth/guest-exchange',
  '/api/v1/system/config/public',
]);

/**
 * 商业授权全局守卫。
 * LICENSE_REQUIRED=0 时一律放行；否则未激活仅允许白名单路径（与 JWT @Public 独立）。
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(private readonly licenseService: LicenseService) {}

  canActivate(context: ExecutionContext): boolean {
    // 非 HTTP（WebSocket 等）上下文无请求 URL，豁免判定无意义；商业授权只约束 HTTP API，
    // WS 链路由 connection.helper 自行校验授权，因此这里放行。
    if (!isHttpContext(context)) return true;
    if (!this.licenseService.isLicenseRequired()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ url?: string; path?: string }>();
    const url = String(request.url || request.path || '');
    if (this.isExemptUrl(url)) return true;

    return this.licenseService.validateAccess();
  }

  private isExemptUrl(url: string): boolean {
    const path = url.split('?')[0];
    if (LICENSE_EXEMPT_EXACT.has(path)) return true;
    if (path.startsWith('/api/v1/license')) return true;
    return false;
  }
}
