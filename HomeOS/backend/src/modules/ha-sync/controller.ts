/**
 * HA 同步控制器。
 *
 * 所属模块：ha-sync
 * 职责：暴露从 Home Assistant 导入场景/自动化/脚本/模板/Blueprint 及验证 YAML 的 HTTP 接口。
 * 依赖：HaSyncService（业务逻辑）、JwtAuthGuard/RolesGuard（认证与鉴权）。
 * 路由前缀：/api/v1/ha-sync，全部接口需 admin 角色认证。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { HaSyncService } from './service';
import { ValidateHaYamlDto } from './dto';
import { parseBooleanQuery } from '../../common/utils/parse-boolean.util';

/**
 * HA 同步控制器（DI 角色：Controller）
 * 提供从 Home Assistant 导入配置和验证 YAML 的 HTTP 接口，路由前缀 /api/v1/ha-sync。
 */
@ApiTags('orchestrate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('ha-sync')
export class HaSyncController {
  constructor(private readonly haSyncService: HaSyncService) {}

  /**
   * 获取 HA 连接状态（需要认证）
   * GET /api/v1/ha-sync/status
   * @returns HA 连接状态信息
   */
  @ApiOperation({ summary: '获取 HA 连接状态' })
  @Get('status')
  async getStatus() {
    return this.haSyncService.getHAStatus();
  }

  /**
   * 从 HA 导入场景（需要认证）
   * GET /api/v1/ha-sync/scenes/import
   * 通过 HA WebSocket API 发现所有 scene 实体，
   * 解析其实体配置后返回可用于本地存储的结构化数据。
   * @returns 场景导入数据数组
   */
  @ApiOperation({ summary: '从 HA 导入场景' })
  @Get('scenes/import')
  async importScenes() {
    return this.haSyncService.importScenesFromHA();
  }

  /**
   * 从 HA 导入自动化（需要认证）
   * GET /api/v1/ha-sync/automations/import
   * 通过 HA WebSocket API 发现所有 automation 实体，
   * 生成对应的 YAML 配置模板。
   * @returns 自动化导入数据数组
   */
  @ApiOperation({ summary: '从 HA 导入自动化' })
  @Get('automations/import')
  async importAutomations() {
    return this.haSyncService.importAutomationsFromHA();
  }

  /**
   * 从 HA 导入脚本（需要认证）
   * GET /api/v1/ha-sync/scripts/import
   * 通过 HA WebSocket API 发现所有 script 实体，
   * 生成对应的 YAML 配置模板。
   * @returns 脚本导入数据数组
   */
  @ApiOperation({ summary: '从 HA 导入脚本' })
  @Get('scripts/import')
  async importScripts() {
    return this.haSyncService.importScriptsFromHA();
  }

  /**
   * 从 HA 导入模板实体（需要认证）
   * GET /api/v1/ha-sync/templates/import
   * 通过实体注册表过滤 platform=template 的实体，避免误收录 MQTT/Zigbee 等。
   * @param refresh - 是否强制刷新实体注册表（'1'/'true' 生效）
   * @param resolve - 是否解析 YAML 来源（'1'/'true' 生效）
   * @returns 模板实体导入数据数组
   */
  @ApiOperation({ summary: '从 HA 导入模板实体' })
  @Get('templates/import')
  async importTemplates(@Query('refresh') refresh?: string, @Query('resolve') resolve?: string) {
    return this.haSyncService.importTemplatesFromHA(parseBooleanQuery(refresh), {
      resolveYaml: parseBooleanQuery(resolve),
    });
  }

  /**
   * 从 HA 配置目录发现自动化 Blueprint（需要认证）
   * GET /api/v1/ha-sync/blueprints/automation
   * 扫描 HA 配置目录下 blueprints/automation 子目录，解析 YAML 清单。
   * @returns Blueprint 导入行数组
   */
  @ApiOperation({ summary: '从 HA 配置目录发现自动化 Blueprint' })
  @Get('blueprints/automation')
  async importAutomationBlueprints() {
    return this.haSyncService.importAutomationBlueprintsFromHA();
  }

  /**
   * 加载 Blueprint 草案 YAML（需要认证）
   * GET /api/v1/ha-sync/blueprints/automation/draft
   * 读取指定 Blueprint 原始 YAML，将 !input 占位符替换为推断的实体 ID，生成可编辑草案。
   * @param filename - Blueprint 文件名（query 参数）
   * @returns {success, yaml?, name?} 草案数据；filename 缺失或文件不存在时 success=false
   */
  @ApiOperation({ summary: '加载 Blueprint 草案 YAML' })
  @Get('blueprints/automation/draft')
  async loadBlueprintDraft(@Query('filename') filename?: string) {
    if (!filename?.trim()) return { success: false, message: '缺少 filename' };
    const draft = await this.haSyncService.loadAutomationBlueprintDraft(filename.trim());
    if (!draft) return { success: false, message: 'Blueprint 未找到或 HA 配置目录未挂载' };
    return { success: true, ...draft };
  }

  /**
   * 验证 YAML 配置（需要认证）
   * POST /api/v1/ha-sync/validate-yaml
   * 将 YAML 内容发送到 HA 的 /api/config/core/check_config 端点进行验证。
   * @param body.yaml - 待验证的 YAML 字符串
   * @returns {valid: boolean, message: string}
   */
  @ApiOperation({ summary: '验证 YAML 配置' })
  @Post('validate-yaml')
  async validateYaml(@Body() body: ValidateHaYamlDto) {
    const yaml = body.yaml || '';
    // 类型判定优先级：显式 type > YAML 顶层关键字正则推断
    // 自动化：以 trigger/triggers 开头且不含 sequence
    const isAutomation =
      body.type === 'automation' ||
      (/^(trigger|triggers):/m.test(yaml) && !/^sequence:/m.test(yaml));
    if (isAutomation) return this.haSyncService.validateAutomationYaml(yaml);
    // 脚本：以 sequence 开头且不含 trigger/triggers
    const isScript =
      body.type === 'script' || (/^sequence:/m.test(yaml) && !/^(trigger|triggers):/m.test(yaml));
    if (isScript) return this.haSyncService.validateScriptYaml(yaml);
    // 模板：以 template 开头
    const isTemplate = body.type === 'template' || /^template:/m.test(yaml);
    if (isTemplate) return this.haSyncService.validateTemplateYaml(yaml);
    // 兜底：通用 YAML 校验（提交至 HA check_config）
    return this.haSyncService.validateYaml(yaml);
  }
}
