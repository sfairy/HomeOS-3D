/**
 * @file csrf.middleware.ts
 * @module common/http-security
 *
 * NestJS 全局 CSRF 中间件（Double-submit Cookie 模式）。
 *
 * 职责：
 * - 拦截所有变更类请求（POST/PUT/PATCH/DELETE 等），校验请求头 X-CSRF-Token 与
 *   Cookie csrf_token 是否一致，防止跨站请求伪造。
 * - 公开路径（登录、健康检查、WebSocket 轮询等）与幂等方法（GET/HEAD/OPTIONS）
 *   在 csrf.util.validateCsrf 内部放行，不进入校验逻辑。
 *
 * 关键依赖：
 * - @nestjs/common（Injectable、NestMiddleware）
 * - ./csrf.util（CSRF 常量与 validateCsrf 校验函数）
 * - ../utils/business-exception（forbidden 抛出 403 业务异常）
 * - ../errors/api-error-messages（API_ERROR 统一错误码）
 *
 * 安全相关：CSRF 校验失败直接抛 403，不进入后续 handler；时序安全比较在
 * validateCsrf 中完成，避免 token 泄露。
 */
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { forbidden } from '../utils/business-exception';
import type { Request, Response, NextFunction } from 'express';
import { CSRF, validateCsrf } from './csrf.util';
import { API_ERROR } from '../errors/api-error-messages';

/**
 * Double-submit Cookie CSRF 防护中间件。
 *
 * 在 NestJS DI 容器中作为全局中间件注册（AppModule.configure 中 apply(CsrfMiddleware)），
 * 对所有进入路由的请求执行 CSRF 校验。变更类请求需携带与 csrf_token Cookie 一致的
 * X-CSRF-Token 头，否则拒绝。
 *
 * 安全意图：Double-submit 模式无需服务端会话存储即可防御 CSRF，适合无状态 JWT 鉴权
 * 场景；token 通过 crypto.randomBytes 生成，不可预测。
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name);
  /**
   * 处理请求：校验 CSRF token，通过则放行，否则抛 403。
   *
   * @param req Express 请求对象。
   * @param _res Express 响应对象（本中间件不直接操作）。
   * @param next 放行到下一个中间件/handler 的回调。
   * @throws {BusinessException} CSRF 校验失败时通过 forbidden() 抛出 403。
   */
  use(req: Request, _res: Response, next: NextFunction) {
    // 去掉 query string，仅用路径部分匹配豁免规则
    const path = req.originalUrl.split('?')[0];
    const method = req.method;
    const cookieToken = req.cookies?.[CSRF.COOKIE];
    const headerToken = req.headers[CSRF.HEADER] as string;
    if (
      !validateCsrf(
        method,
        path,
        cookieToken,
        headerToken,
      )
    ) {
      // 失败时打印诊断：method、path、cookie 状态、header 状态，便于区分「cookie 缺 / header 缺 / 不匹配」
      const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
      const reason = isMutating
        ? cookieToken && headerToken
          ? 'cookie 与 header 值不匹配 / 长度不一致'
          : !cookieToken && !headerToken
            ? 'cookie 与 header 均缺失'
            : !cookieToken
              ? 'cookie 缺失（可能 set-cookie 未被浏览器接收）'
              : 'header 缺失（可能前端 applyCsrfHeader 未生效）'
        : '非变方法不应进入拒绝分支';
      this.logger.warn(
        `CSRF 校验失败 method=${method} path=${path} reason=[${reason}] ` +
          `cookie=${cookieToken ? `len=${cookieToken.length}` : 'absent'} ` +
          `header=${headerToken ? `len=${headerToken.length}` : 'absent'}`,
      );
      // 校验失败：抛 403，不调用 next()，请求到此终止
      forbidden(API_ERROR.CSRF_INVALID);
    }
    next();
  }
}