/**
 * 首装向导与实体同步控制器
 *
 * 模块：system/setup
 * 职责：
 *  - 从原 SystemController 拆出，路由前缀 system/（保持向后兼容）
 *  - 首装向导：状态 / 校验实体 / 完成 / 降低灵敏度 / 引导任务清单 / 关闭清单提示
 *  - 实体同步：resyncFromHa（重新拉取全量实体刷新 state-store）
 *  - 配置健康：绑定缺口 / 健康评分
 *
 * 鉴权：JwtAuthGuard + RolesGuard，仅 admin 可访问。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SetupWizardService } from './wizard.service';
import { StateStoreService } from '../../state-store/service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { rethrowIfHttpException, BusinessException, ErrorCode, getErrorMessage } from '../../../common/utils';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import {
  ValidateSetupEntitiesDto,
  ReduceSetupSecurityDto,
  CompleteSetupWizardDto,
} from '../dto/system.dto';

/**
 * 首装向导与实体同步控制器（路由前缀 system/ 不变）
 *
 * 注入 SetupWizardService + StateStoreService，由 SystemSetupModule 提供。
 */
@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemSetupController {
  /**
   * @param setupWizard 首装向导服务
   * @param stateStore  实体状态存储（resync 入口）
   */
  constructor(
    private readonly setupWizard: SetupWizardService,
    private readonly stateStore: StateStoreService,
  ) {}

  @ApiOperation({ summary: '首装向导进度与步骤完成度' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('setup-wizard/status')
  getSetupWizardStatus() {
    return this.setupWizard.getStatus();
  }

  @ApiOperation({ summary: '批量校验 entity 是否在 HA / state-store 可用' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('setup-wizard/validate-entities')
  validateSetupEntities(@Body() body: ValidateSetupEntitiesDto) {
    return this.setupWizard.validateEntities(body?.entityIds || []);
  }

  /**
   * 向 HA 重新拉取全量实体并刷新 state-store。
   * 失败时返回 503 + 错误信息（不抛 500，避免前端误判为代码错误）。
   *
   * @throws HttpException(503) HA 状态同步失败
   */
  @ApiOperation({ summary: '向 HA 重新拉取全量实体并刷新 state-store（admin）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('entities/resync')
  async resyncEntities() {
    try {
      return await this.stateStore.resyncFromHa();
    } catch (e: unknown) {
      rethrowIfHttpException(e);
      const msg = getErrorMessage(e);
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        API_ERROR.HA_STATE_RESYNC_FAILED(msg || '未知错误'),
      );
    }
  }

  @ApiOperation({ summary: '完成首装向导' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('setup-wizard/complete')
  completeSetupWizard(@Body() body?: CompleteSetupWizardDto) {
    return this.setupWizard.completeWizard(body);
  }

  @ApiOperation({ summary: '降低安防传感器告警灵敏度（延长冷却）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('setup-wizard/reduce-sensitivity')
  reduceSetupSecuritySensitivity(@Body() body?: ReduceSetupSecurityDto) {
    return this.setupWizard.reduceSecuritySensitivity(body);
  }

  @ApiOperation({ summary: '首装后引导任务清单' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('setup-wizard/checklist')
  getSetupChecklist() {
    return this.setupWizard.getPostSetupChecklist();
  }

  @ApiOperation({ summary: '关闭首装后引导任务清单提示' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('setup-wizard/checklist/dismiss')
  dismissSetupChecklist() {
    return this.setupWizard.dismissPostSetupChecklist();
  }

  @ApiOperation({ summary: '集成绑定缺口清单（含修复深链）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('bindings/gaps')
  getBindingGaps() {
    return this.setupWizard.getBindingGaps();
  }

  @ApiOperation({ summary: '配置健康评分（绑定/HA/占位自动化）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('config/health')
  getConfigHealth() {
    return this.setupWizard.getConfigHealthScore();
  }
}