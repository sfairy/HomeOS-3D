/**
 * 所属模块：backend/modules/license
 * 职责：
 *  - 许可证控制器（激活/反激活/状态）；
 * 关键依赖：
 *  - license.service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { LicenseService } from './license.service';

@Controller('license')
/**
 * LicenseController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的端点（HTTP 方法 + 路径 + DTO 校验）；
 * - 鉴权：默认 JwtAuthGuard + 角色守卫（@Roles 装饰器按方法细化）；
 * - 主要调用：同域 Service + 跨域编排工具；
 * @class LicenseController
 */
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  /** 查询激活状态（含硬件指纹、公钥指纹、过期时间，供诊断页与签发服务对照） */
  @Public()
  @Get('status')
  getStatus() {
    return this.licenseService.getActivationStatus();
  }

  /**
   * 激活许可证：提交 RS256 签名的 JWT，校验 HWID 与过期后写入本地。
   * 限流 5 次/分钟（RS256 验签 CPU 密集，避免未认证 DoS）。
   */
  @Public()
  // 安全：RS256 验签为 CPU 密集型操作，限流防止未认证 DoS（5 次/分钟）
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('activate')
  activate(@Body() body: { token?: string }) {
    if (!body?.token?.trim()) {
      throw new BadRequestException('请提供许可证 JWT（token 字段）');
    }
    return this.licenseService.activate(body.token);
  }
}
