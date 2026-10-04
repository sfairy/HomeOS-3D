/**
 * @file access.controller.ts
 * @module system
 * @description 访客临时密码 / 儿童模式 REST 控制器。从原 SystemController 拆出，路由前缀 system/，
 * 对外暴露访客通行码的增删改查与延期、儿童模式状态查询 / 配置更新 / 家长 override 等接口。
 *
 * 鉴权：
 *  - JwtAuthGuard + RolesGuard；admin 专属接口叠加 @Roles('admin')
 *
 * 依赖：
 *  - GuestAccessService：访客临时密码生成 / 撤销 / 延期（写入 HA lock 槽位）
 *  - ChildModeService：儿童模式配置 / 状态 / 家长 override
 *  - CreateGuestPassDto / ExtendGuestPassDto / ExtendGuestPassesDto / UpdateChildModeDto / OverrideChildModeDto：请求体校验
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { GuestAccessService } from './lifestyle/guest-access.service';
import { ChildModeService } from '../child-mode/service';
import {
  CreateGuestPassDto,
  ExtendGuestPassDto,
  ExtendGuestPassesDto,
  UpdateChildModeDto,
  OverrideChildModeDto,
} from './dto/system-access.dto';

/**
 * 访客密码 / 儿童模式（从 SystemController 拆出）
 */
@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemAccessController {
  constructor(
    private readonly guestAccess: GuestAccessService,
    private readonly childMode: ChildModeService,
  ) {}

  @ApiOperation({ summary: '列出访客临时密码' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('guest/passes')
  listGuestPasses() {
    return this.guestAccess.list();
  }

  @ApiOperation({ summary: '创建访客临时密码' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('guest/passes')
  createGuestPass(@Body() body: CreateGuestPassDto) {
    return this.guestAccess.createPass(body);
  }

  @ApiOperation({ summary: '撤销访客临时密码' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('guest/passes/:id')
  revokeGuestPass(@Param('id') id: string) {
    return this.guestAccess.revokePass(id);
  }

  @ApiOperation({ summary: '延长访客临时密码' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('guest/passes/:id/extend')
  extendGuestPass(@Param('id') id: string, @Body() body: ExtendGuestPassDto) {
    return this.guestAccess.extendPass(id, body?.hours);
  }

  @ApiOperation({ summary: '批量延长访客临时密码' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('guest/passes/extend-batch')
  extendGuestPasses(@Body() body: ExtendGuestPassesDto) {
    return this.guestAccess.extendMany(body?.ids || [], body?.hours);
  }

  @ApiOperation({ summary: '获取儿童模式状态' })
  @UseGuards(JwtAuthGuard)
  @Get('child-mode')
  getChildMode() {
    return this.childMode.getStatus();
  }

  @ApiOperation({ summary: '更新儿童模式配置' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put('child-mode')
  updateChildMode(@Body() body: UpdateChildModeDto) {
    return this.childMode.updateConfig(body);
  }

  @ApiOperation({ summary: '家长临时解除儿童模式（5–180 分钟）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('child-mode/override')
  overrideChildMode(@Body() body: OverrideChildModeDto) {
    return this.childMode.requestOverride(body?.minutes ?? 30);
  }
}
