/**
 * 职责：
 *  - UI 配置控制器（偏好/布局/静态资源）；
 * 关键依赖：
 *  - static-asset.service、dto.ts；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Body,
  Query,
  Param,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { badRequest, BusinessException, ErrorCode } from '../../common/utils/business-exception';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UiConfigService } from './service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { API_ERROR } from '../../common/errors/api-error-messages';
import {
  SetActiveProfileDto,
  SetNewTerminalDefaultDto,
  TerminalBindingDto,
  ImportAllConfigsDto,
  SaveProjectConfigDto,
  MkdirDto,
} from './dto';

/**
 * 单次批量上传的最大文件数。
 *
 * 与前端 `useAssetManager` 的 `MAX_UPLOAD_FILES` 保持一致：前端按 `UPLOAD_BATCH_SIZE`
 * 分批提交，因此这里需要为单批 20 个留出余量；100 为「一次性选择」的硬上限。
 * 注意上传使用 memoryStorage，调大该值会线性放大单次请求的内存峰值。
 */
const MAX_UPLOAD_FILES = 100;

/** UI 配置 REST 控制器（@Controller('config')） */
@ApiTags('display')
@ApiBearerAuth()
@Controller('config')
export class UiConfigController {
  /** @param uiConfigService UI 配置服务 */
  constructor(private readonly uiConfigService: UiConfigService) {}

  /** 设置当前激活的配置方案 ID（供服务端联动读取 layout） */
  @ApiOperation({ summary: '同步当前激活的配置方案 ID（供服务端联动读取 layout）' })
  @Put('project/active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async setActiveProfile(@Body() body: SetActiveProfileDto) {
    return this.uiConfigService.setActiveProfile(body?.projectId);
  }

  /** 读取当前激活方案与新终端默认策略 */
  @ApiOperation({ summary: '读取当前激活方案与新终端默认策略' })
  @Get('project/active')
  @UseGuards(JwtAuthGuard)
  getActiveProfileSettings() {
    return this.uiConfigService.getActiveProfileSettings();
  }

  /** 更新新终端默认策略（activeProfile / default） */
  @ApiOperation({ summary: '更新新终端默认策略' })
  @Put('project/defaults')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async setNewTerminalDefault(@Body() body: SetNewTerminalDefaultDto) {
    return this.uiConfigService.setNewTerminalDefault(body?.newTerminalDefault);
  }

  /** 解析终端应使用的 display profile（优先绑定 → 激活方案 → default） */
  @ApiOperation({ summary: '解析终端应使用的 display profile' })
  @Get('terminal/resolve')
  @UseGuards(JwtAuthGuard)
  async resolveTerminalProfile(@Query('clientId') clientId: string) {
    return this.uiConfigService.resolveProfileForTerminal(clientId);
  }

  /** 列出全部终端绑定 */
  @ApiOperation({ summary: '列出全部终端绑定' })
  @Get('terminal/bindings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  listTerminalBindings() {
    return this.uiConfigService.listTerminalBindings();
  }

  /** 绑定 / 更新终端 display profile */
  @ApiOperation({ summary: '绑定/更新终端 display profile' })
  @Put('terminal/binding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async upsertTerminalBinding(
    @Body() body: TerminalBindingDto,
    @Req() req: Request & { user?: { userId?: string } },
  ) {
    return this.uiConfigService.upsertTerminalBinding(body, req.user?.userId);
  }

  /** 本机绑定 display profile（切换方案时自动调用） */
  @ApiOperation({ summary: '本机绑定 display profile（切换方案时自动调用）' })
  @Put('terminal/binding/self')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult', 'child')
  async bindSelfTerminal(
    @Body() body: TerminalBindingDto,
    @Req() req: Request & { user?: { role?: string; userId?: string } },
  ) {
    return this.uiConfigService.bindSelfTerminal(body, req.user);
  }

  /** 解除终端 display profile 绑定 */
  @ApiOperation({ summary: '解除终端 display profile 绑定' })
  @Delete('terminal/binding/:clientId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async removeTerminalBinding(@Param('clientId') clientId: string) {
    return this.uiConfigService.removeTerminalBinding(clientId);
  }
  /** 获取项目 UI 配置（非 admin 脱敏 HA token） */
  @ApiOperation({ summary: '获取项目 UI 配置' })
  @UseGuards(JwtAuthGuard)
  @Get('project/:id')
  async getConfig(
    @Param('id') projectId: string,
    @Req() req: Request & { user?: { role?: string } },
  ) {
    return this.uiConfigService.getConfigForApi(projectId, req.user?.role);
  }

  /** 获取配置方案列表（仅 projectId 与更新时间） */
  @ApiOperation({ summary: '获取配置方案列表' })
  @Get('profiles')
  @UseGuards(JwtAuthGuard)
  async listProfiles() {
    const profiles = await this.uiConfigService.listProfiles();
    return { success: true, data: profiles };
  }

  /** 导出全部 UI 配置（全量备份） */
  @ApiOperation({ summary: '导出全部 UI 配置' })
  @Get('all/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async exportConfigs() {
    const data = await this.uiConfigService.exportAllConfigs();
    return { success: true, data };
  }

  /** 导入 UI 配置（全量恢复） */
  @ApiOperation({ summary: '导入 UI 配置' })
  @Post('all/import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async importConfigs(@Body() body: ImportAllConfigsDto) {
    return this.uiConfigService.importAllConfigsValidated(body);
  }

  /** 保存项目 UI 配置（含 layout 序列化与 HA URL 校验） */
  @ApiOperation({ summary: '保存项目 UI 配置' })
  @Post('project/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async saveConfig(@Param('id') projectId: string, @Body() body: SaveProjectConfigDto) {
    return this.uiConfigService.saveConfigFromBody(projectId, body);
  }

  /** 删除配置方案（不允许删除 default） */
  @ApiOperation({ summary: '删除配置方案' })
  @Delete('project/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteProfile(@Param('id') projectId: string) {
    return this.uiConfigService.deleteProfileSafe(projectId);
  }

  /** 列出平面图文件 */
  @ApiOperation({ summary: '列出平面图文件' })
  @UseGuards(JwtAuthGuard)
  @Get('floorplans')
  listFloorplans(@Query('path') subPath: string) {
    return {
      success: true,
      data: this.uiConfigService.listFloorplans(subPath || ''),
    };
  }

  /** 列出背景图文件 */
  @ApiOperation({ summary: '列出背景图文件' })
  @UseGuards(JwtAuthGuard)
  @Get('backgrounds')
  listBackgrounds(@Query('path') subPath: string) {
    return {
      success: true,
      data: this.uiConfigService.listBackgrounds(subPath || ''),
    };
  }

  /** 列出图标文件 */
  @ApiOperation({ summary: '列出图标文件' })
  @UseGuards(JwtAuthGuard)
  @Get('icons')
  listIcons(@Query('path') subPath: string) {
    return {
      success: true,
      data: this.uiConfigService.listIcons(subPath || ''),
    };
  }

  /** 列出房间图文件 */
  @ApiOperation({ summary: '列出房间图文件' })
  @UseGuards(JwtAuthGuard)
  @Get('room_images')
  listRoomImages(@Query('path') subPath: string) {
    return {
      success: true,
      data: this.uiConfigService.listRoomImages(subPath || ''),
    };
  }

  /** 创建图标目录 */
  @ApiOperation({ summary: '创建图标目录' })
  @Post('icons/mkdir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createIconDirectory(@Body() body: MkdirDto) {
    const subPath = body.path;
    if (!subPath) badRequest(API_ERROR.UI_CONFIG_PATH_REQUIRED);
    return {
      success: true,
      data: this.uiConfigService.createIconDirectory(subPath),
    };
  }

  /** 创建房间图目录 */
  @ApiOperation({ summary: '创建房间图目录' })
  @Post('room_images/mkdir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createRoomImageDirectory(@Body() body: MkdirDto) {
    const subPath = body.path;
    if (!subPath) badRequest(API_ERROR.UI_CONFIG_PATH_REQUIRED);
    return {
      success: true,
      data: this.uiConfigService.createRoomImageDirectory(subPath),
    };
  }

  /** 创建平面图目录 */
  @ApiOperation({ summary: '创建平面图目录' })
  @Post('floorplans/mkdir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createDirectory(@Body() body: MkdirDto) {
    const subPath = body.path;
    if (!subPath) badRequest(API_ERROR.UI_CONFIG_PATH_REQUIRED);
    return {
      success: true,
      data: this.uiConfigService.createDirectory(subPath),
    };
  }

  /** 创建背景图目录 */
  @ApiOperation({ summary: '创建背景图目录' })
  @Post('backgrounds/mkdir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createBackgroundDirectory(@Body() body: MkdirDto) {
    const subPath = body.path;
    if (!subPath) badRequest(API_ERROR.UI_CONFIG_PATH_REQUIRED);
    return {
      success: true,
      data: this.uiConfigService.createBackgroundDirectory(subPath),
    };
  }
  /**
   * 上传平面图文件（最多 MAX_UPLOAD_FILES 个，单个 10MB 限制）。
   * fileFilter 校验扩展名，非法类型抛出 BusinessException。
   */
  @ApiOperation({ summary: '上传平面图文件' })
  @Post('floorplans/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FilesInterceptor('files', MAX_UPLOAD_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const allowed = /\.(jpg|jpeg|png|webp|gif|svg)$/i;
        if (!allowed.test(file.originalname)) {
          return cb(
            new BusinessException(
              ErrorCode.VALIDATION_FAILED,
              `不允许的文件类型：${file.originalname}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadFloorplans(@UploadedFiles() files: Express.Multer.File[], @Query('path') subPath: string) {
    return this.uiConfigService.uploadFloorplanFiles(files, subPath || '');
  }

  /** 删除平面图文件 */
  @ApiOperation({ summary: '删除平面图文件' })
  @Delete('floorplans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deleteFloorplan(@Query('path') fullPath: string) {
    if (!fullPath) badRequest(API_ERROR.UI_CONFIG_PATH_REQUIRED);
    this.uiConfigService.deleteFloorplan(fullPath);
    return { success: true, deleted: fullPath };
  }

  /**
   * 上传背景图文件（最多 MAX_UPLOAD_FILES 个，单个 10MB 限制）。
   * fileFilter 校验扩展名，非法类型抛出 BusinessException。
   */
  @ApiOperation({ summary: '上传背景图文件' })
  @Post('backgrounds/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FilesInterceptor('files', MAX_UPLOAD_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const allowed = /\.(jpg|jpeg|png|webp|gif|svg)$/i;
        if (!allowed.test(file.originalname)) {
          return cb(
            new BusinessException(
              ErrorCode.VALIDATION_FAILED,
              `不允许的文件类型：${file.originalname}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadBackgrounds(@UploadedFiles() files: Express.Multer.File[], @Query('path') subPath: string) {
    return this.uiConfigService.uploadBackgroundFiles(files, subPath || '');
  }

  /** 删除背景图文件 */
  @ApiOperation({ summary: '删除背景图文件' })
  @Delete('backgrounds')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deleteBackground(@Query('path') fullPath: string) {
    if (!fullPath) badRequest(API_ERROR.UI_CONFIG_PATH_REQUIRED);
    this.uiConfigService.deleteBackground(fullPath);
    return { success: true, deleted: fullPath };
  }

  /**
   * 上传图标文件（最多 MAX_UPLOAD_FILES 个，单个 2MB 限制）。
   * 仅允许 .svg 文件，非法类型抛出 BusinessException。
   */
  @ApiOperation({ summary: '上传图标文件' })
  @Post('icons/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FilesInterceptor('files', MAX_UPLOAD_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!/\.svg$/i.test(file.originalname)) {
          return cb(
            new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.UI_CONFIG_SVG_ONLY),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadIcons(@UploadedFiles() files: Express.Multer.File[], @Query('path') subPath: string) {
    return this.uiConfigService.uploadIconFiles(files, subPath || '');
  }

  /** 删除图标文件 */
  @ApiOperation({ summary: '删除图标文件' })
  @Delete('icons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deleteIcon(@Query('path') fullPath: string) {
    if (!fullPath) badRequest(API_ERROR.UI_CONFIG_PATH_REQUIRED);
    this.uiConfigService.deleteIcon(fullPath);
    return { success: true, deleted: fullPath };
  }

  /**
   * 上传房间图文件（最多 MAX_UPLOAD_FILES 个，单个 10MB 限制）。
   * fileFilter 校验扩展名，非法类型抛出 BusinessException。
   */
  @ApiOperation({ summary: '上传房间图文件' })
  @Post('room_images/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FilesInterceptor('files', MAX_UPLOAD_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const allowed = /\.(jpg|jpeg|png|webp|gif|svg)$/i;
        if (!allowed.test(file.originalname)) {
          return cb(
            new BusinessException(
              ErrorCode.VALIDATION_FAILED,
              `不允许的文件类型：${file.originalname}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadRoomImages(@UploadedFiles() files: Express.Multer.File[], @Query('path') subPath: string) {
    return this.uiConfigService.uploadRoomImageFiles(files, subPath || '');
  }

  /** 删除房间图文件 */
  @ApiOperation({ summary: '删除房间图文件' })
  @Delete('room_images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deleteRoomImage(@Query('path') fullPath: string) {
    if (!fullPath) badRequest(API_ERROR.UI_CONFIG_PATH_REQUIRED);
    this.uiConfigService.deleteRoomImage(fullPath);
    return { success: true, deleted: fullPath };
  }
}