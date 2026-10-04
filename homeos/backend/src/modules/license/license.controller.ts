/**
 * 职责：
 *  - 许可证控制器（状态查询 / 激活 / 重试）。
 * 关键依赖：
 *  - license.service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 *  - 授权采用联网租约模型：邮箱 + 激活码换取签名租约。
 */

import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { LicenseService } from './license.service';

@Controller('license')
/**
 * LicenseController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的端点（HTTP 方法 + 路径 + DTO 校验）；
 * - 鉴权：默认 JwtAuthGuard + 角色守卫（@Roles 装饰器按方法细化）；
 * - 主要调用：同域 Service + 跨域编排工具；
 */
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  /** 查询授权状态（含状态机、权益、租约时间与恢复信息，供激活页轮询与诊断页展示） */
  @Public()
  @Get('status')
  getStatus() {
    return this.licenseService.getActivationStatus();
  }

  /**
   * 激活授权：提交「购买邮箱 + 激活码」，由授权商店签发签名租约并本地落盘。
   * 限流 5 次/分钟（激活涉及加密与验签，避免未认证 DoS）。
   */
  @Public()
  // 安全：激活涉及 X25519 密钥协商与 Ed25519 验签，限流防止未认证 DoS（5 次/分钟）
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('activate')
  activate(@Body() body: { email?: string; activationCode?: string }) {
    return this.licenseService.activate(body?.email ?? '', body?.activationCode ?? '');
  }

  /** 显式重试当前实例的授权续租 / 恢复。 */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('retry')
  retry() {
    return this.licenseService.retryNow();
  }
}
