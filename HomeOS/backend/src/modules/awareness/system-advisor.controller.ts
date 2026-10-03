/**
 * @file system-advisor.controller.ts
 * @module awareness
 * @description 智能顾问与习惯推荐 REST 控制器。路由前缀 system/，对外暴露
 * 每日顾问建议、TTS 问候播报、设备使用报告、遗忘设备检测、习惯推荐列表与采纳/忽略、
 * 配置洞察聚合、习惯基线摘要与离线基线重建、语音 STT/对话/执行等接口。
 *
 * 鉴权：
 *  - JwtAuthGuard 通用；admin 专属接口叠加 RolesGuard + @Roles('admin')
 *
 * 依赖：
 *  - SmartAdvisorService：每日顾问、使用报告、遗忘设备检测
 *  - RecommendationService：习惯推荐挖掘与状态变更
 *  - ConfigInsightsService：配置型洞察聚合
 *  - VoiceService：语音转写、对话、播报、命令执行
 *  - IntelligenceBaselineService：离线基线重建
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Logger, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';
import { SmartAdvisorService } from './smart-advisor.service';
import { RecommendationService } from './recommendation.service';
import { ConfigInsightsService } from './config-insights.service';
import { VoiceService } from './voice.service';
import { IntelligenceBaselineService } from './intelligence-baseline.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { parseOptionalInt } from '../../common/crud/pagination.util';

/**
 * AdvisorReplacePlaceholdersDto：数据传输对象（DTO）。
 * - 表示：HTTP 请求/响应的类型结构；
 * - 字段约束：由 class-validator 装饰器逐字段声明；
 * @class AdvisorReplacePlaceholdersDto
 */
class AdvisorReplacePlaceholdersDto {
  @IsOptional()
  @IsObject({ message: 'replacements 须为对象' })
  replacements?: Record<string, string>;

  @IsOptional()
  @IsBoolean({ message: 'enableAfter 须为布尔值' })
/**
 * ExecuteAdvisorTipDto：数据传输对象 DTO。
 * - 表示：顾问执行/反馈接口的请求体结构；
 * - 字段约束：由 class-validator 装饰器逐字段表达；
 * @class ExecuteAdvisorTipDto
 */
/**
 * ExecuteAdvisorTipDto：数据传输对象（DTO）。
 * - 表示：HTTP 请求/响应的类型结构；
 * - 字段约束：由 class-validator 装饰器逐字段声明；
 * @class ExecuteAdvisorTipDto
 */
  enableAfter?: boolean;
}

class ExecuteAdvisorTipDto {
  @IsOptional()
  @IsString({ message: 'category 须为字符串' })
/**
 * MarkTipFeedbackDto：数据传输对象 DTO。
 * - 表示：顾问执行/反馈接口的请求体结构；
 * - 字段约束：由 class-validator 装饰器逐字段表达；
 * @class MarkTipFeedbackDto
 */
/**
 * MarkTipFeedbackDto：数据传输对象（DTO）。
 * - 表示：HTTP 请求/响应的类型结构；
 * - 字段约束：由 class-validator 装饰器逐字段声明；
 * @class MarkTipFeedbackDto
 */
  category?: string;
}

class MarkTipFeedbackDto {
  @IsString({ message: 'category 须为字符串' })
  category!: string;
  @IsString({ message: 'state 须为字符串' })
  state!: 'done' | 'ignored';
}

/** 智能顾问与习惯推荐（路由前缀 system/advisor|recommendations 不变） */
@ApiTags('awareness')
@ApiBearerAuth()
@Controller('system')
export class SystemAdvisorController {
  private readonly logger = new Logger(SystemAdvisorController.name);

  constructor(
    private readonly advisor: SmartAdvisorService,
    private readonly recommendations: RecommendationService,
    private readonly configInsights: ConfigInsightsService,
    private readonly voice: VoiceService,
    private readonly baseline: IntelligenceBaselineService,
  ) {}

  @ApiOperation({ summary: '获取每日智能建议' })
  @UseGuards(JwtAuthGuard)
  @Get('advisor/daily')
  async getDailyAdvice() {
    return this.advisor.getDailyAdvice();
  }

  @ApiOperation({ summary: '播报每日智能顾问问候（TTS）' })
  @Roles('admin', 'adult')
  @Post('advisor/daily/speak')
  async speakDailyAdvice() {
    const { tts } = await this.advisor.getDailyAdvice();
    if (!tts?.trim()) {
      return { success: false, message: '暂无顾问播报内容' };
    }
    return this.voice.speak(tts);
  }

  @ApiOperation({ summary: '获取设备使用报告' })
  @UseGuards(JwtAuthGuard)
  @Get('advisor/report')
  getUsageReport() {
    return this.advisor.getUsageReport();
  }

  @ApiOperation({ summary: '获取单设备使用统计' })
  @UseGuards(JwtAuthGuard)
  @Get('advisor/usage/summary')
  getUsageSummary(@Query('days') days?: string) {
    return this.advisor.getUsageSummary(parseOptionalInt(days, 7));
  }

  @ApiOperation({ summary: '获取单设备使用统计' })
  @UseGuards(JwtAuthGuard)
  @Get('advisor/usage/:entityId')
  getEntityUsage(@Param('entityId') entityId: string, @Query('days') days?: string) {
    return this.advisor.getEntityUsage(entityId, parseOptionalInt(days, 7));
  }

  @ApiOperation({ summary: '清除设备使用统计记录' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('advisor/report/clear')
  clearUsageReport() {
    return this.advisor.clearUsageStats();
  }

  @ApiOperation({ summary: '检测可能遗忘开启的设备' })
  @UseGuards(JwtAuthGuard)
  @Get('advisor/forgotten')
  getForgottenDevices() {
    return this.advisor.getForgottenDevices();
  }

  @ApiOperation({ summary: '获取习惯学习推荐列表' })
  @UseGuards(JwtAuthGuard)
  @Get('recommendations')
  async listRecommendations(@Query('status') status?: string, @Query('limit') limit?: string) {
    try {
      return await this.recommendations.list(status || 'pending', parseOptionalInt(limit));
    } catch (err) {
      this.logger.error(`获取推荐列表失败: ${(err as Error).message}`);
      return [];
    }
  }

  @ApiOperation({ summary: '获取配置型智能推荐聚合' })
  @UseGuards(JwtAuthGuard)
  @Get('recommendations/insights')
  async getConfigInsights() {
    try {
      return await this.configInsights.getInsights();
    } catch (err) {
      this.logger.error(`获取配置洞察失败: ${(err as Error).message}`);
      return { insights: [], pendingCount: 0 };
    }
  }

  @ApiOperation({ summary: '习惯基线摘要（房间活跃高峰）' })
  @UseGuards(JwtAuthGuard)
  @Get('recommendations/habit-summary')
  async getHabitSummary() {
    try {
      return await this.recommendations.getHabitSummary();
    } catch (err) {
      this.logger.error(`获取习惯摘要失败: ${(err as Error).message}`);
      return { pendingCount: 0, topRooms: [], awayLightHints: [], note: '习惯摘要暂不可用' };
    }
  }

  @ApiOperation({ summary: '采纳推荐（创建草稿自动化或标记场景）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('recommendations/:id/adopt')
  async adoptRecommendation(@Param('id') id: string, @Body() body?: AdvisorReplacePlaceholdersDto) {
    try {
      return await this.recommendations.adopt(id, {
        replacements: body?.replacements,
        enableAfter: body?.enableAfter,
      });
    } catch (err) {
      this.logger.error(`采纳推荐 ${id} 失败: ${(err as Error).message}`);
      return { success: false, message: '采纳推荐失败' };
    }
  }

  @ApiOperation({ summary: '忽略推荐' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('recommendations/:id/dismiss')
  async dismissRecommendation(@Param('id') id: string) {
    try {
      return await this.recommendations.dismiss(id);
    } catch (err) {
      this.logger.error(`忽略推荐 ${id} 失败: ${(err as Error).message}`);
      return { success: false };
    }
  }

  @ApiOperation({ summary: '推荐草稿占位实体建议' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('recommendations/:id/placeholders')
  async getRecommendationPlaceholders(@Param('id') id: string) {
    return this.recommendations.getPlaceholderSuggestions(id);
  }

  @ApiOperation({ summary: '一键执行智能顾问建议' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('advisor/execute-tip')
  executeAdvisorTip(@Body() body: ExecuteAdvisorTipDto) {
    const category = body?.category?.trim();
    if (!category) {
      return { success: false, message: '缺少建议类别' };
    }
    return this.advisor.executeTip(category);
  }

  @ApiOperation({ summary: '标记今日建议反馈（已完成/忽略，持久化到次日）' })
  @UseGuards(JwtAuthGuard)
  @Post('advisor/tip-feedback')
  markTipFeedback(@Body() body: MarkTipFeedbackDto) {
    const state = body?.state === 'done' || body?.state === 'ignored' ? body.state : null;
    if (!state) {
      return { success: false, message: 'state 仅支持 done / ignored' };
    }
    return this.advisor.markTipFeedback(body.category, state);
  }

  /** 原 system-intelligence.controller：重建智能基线 */
  @ApiTags('system')
  @ApiOperation({ summary: '重建智能基线（活动/能耗/离家模式）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('intelligence/baseline/rebuild')
  async rebuildBaseline() {
    return this.baseline.rebuildAll();
  }
}
