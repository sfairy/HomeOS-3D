/**
 * 家庭模式 REST 控制器。
 *
 * 职责：暴露家庭模式的 CRUD、激活 / 停用、排序、复制、预设安装、
 *  触发日志与执行历史查询等 REST 端点。
 * 权限模型：
 *  - 读取操作：JwtAuthGuard（任意已登录用户）
 *  - 写操作与预设安装 / 初始化：RolesGuard + admin / adult
 *  - 初始化默认模式（seed）：仅 admin
 * 依赖：HomeModeService（CRUD + 激活 + 触发器 + 运行日志）。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { HomeModeService } from './service';
import { parseCrudPagination, runCrudFindAll } from '../../common/crud/pagination.util';
import {
  InstallPresetDto,
  ReorderModesDto,
  CreateHomeModeDto,
  UpdateHomeModeDto,
} from './dto';
import type { OrchestratorExecActor } from '../../common/http-security/entity-execute-acl.util';

type AuthRequest = Request & { user?: OrchestratorExecActor };

@ApiTags('orchestrate')
@ApiBearerAuth()
@Controller('modes')
@UseGuards(JwtAuthGuard)
/**
 * HomeModeController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的端点（HTTP 方法 + 路径 + DTO 校验）；
 * - 鉴权：默认 JwtAuthGuard + 角色守卫（@Roles 装饰器按方法细化）；
 * - 主要调用：同域 Service + 跨域编排工具；
 */
export class HomeModeController {
  constructor(private readonly homeModeService: HomeModeService) {}

  @ApiOperation({ summary: '获取所有家庭模式（可选 page/limit 分页）' })
  @Get()
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return runCrudFindAll(
      page,
      limit,
      () => this.homeModeService.findAll(),
      (pageNum, pageSize) => this.homeModeService.findAllPaginated(pageNum, pageSize),
    );
  }

  @ApiOperation({ summary: '获取当前激活模式' })
  @Get('active')
  getActive() {
    return this.homeModeService.getActive();
  }

  @ApiOperation({ summary: '模式触发日志与日历联动状态' })
  @Get('context')
  getContext() {
    return this.homeModeService.getModeContext();
  }

  @ApiOperation({ summary: '模式触发日志（支持来源/结果服务端过滤）' })
  @Get('trigger-logs')
  getTriggerLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('source') source?: string,
    @Query('result') result?: string,
  ) {
    const { pageNum, pageSize, enabled } = parseCrudPagination(page, limit);
    const filters = {
      source: source ? String(source) : undefined,
      success: result === 'ok' ? true : result === 'fail' ? false : undefined,
    };
    if (enabled) return this.homeModeService.getTriggerLogsPaginated(pageNum, pageSize, filters);
    return this.homeModeService.getTriggerLogs(30);
  }

  @ApiOperation({ summary: '模式执行历史' })
  @Get('execution-history')
  getExecutionHistory() {
    return this.homeModeService.getExecutionHistory(40);
  }

  @ApiOperation({ summary: '动作模板（全屋场景推荐）' })
  @Get('templates')
  getTemplates() {
    return this.homeModeService.getActionTemplates();
  }

  @ApiOperation({ summary: '家庭模式预设包列表' })
  @Get('presets')
  getPresets() {
    return this.homeModeService.getPresets();
  }

  @ApiOperation({ summary: '一键安装家庭模式预设包' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('presets/:presetId/install')
  installPreset(@Param('presetId') presetId: string, @Body() body: InstallPresetDto) {
    return this.homeModeService.installPreset(
      presetId,
      body.entityOverrides || {},
      body.merge ?? false,
    );
  }

  @ApiOperation({ summary: '批量调整模式排序' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Post('reorder')
  reorder(@Body() body: ReorderModesDto) {
    return this.homeModeService.reorder(body.items || []);
  }

  @ApiOperation({ summary: '根据 ID 获取家庭模式' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.homeModeService.findOne(id);
  }

  @ApiOperation({ summary: '创建家庭模式' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Post()
  create(@Body() body: CreateHomeModeDto) {
    return this.homeModeService.create(body);
  }

  @ApiOperation({ summary: '更新家庭模式' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateHomeModeDto) {
    return this.homeModeService.update(id, body);
  }

  @ApiOperation({ summary: '删除家庭模式' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.homeModeService.remove(id);
  }

  @ApiOperation({ summary: '复制家庭模式' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.homeModeService.duplicate(id);
  }

  @ApiOperation({ summary: '激活指定家庭模式' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Post(':id/activate')
  activate(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.homeModeService.activate(id, {
      source: 'manual',
      reason: '手动切换',
      actor: req.user,
    });
  }

  @ApiOperation({ summary: '取消激活家庭模式' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Post('deactivate')
  deactivate() {
    return this.homeModeService.deactivate();
  }

  @ApiOperation({ summary: '初始化默认家庭模式' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('seed')
  seed() {
    return this.homeModeService.seedDefaults();
  }
}
