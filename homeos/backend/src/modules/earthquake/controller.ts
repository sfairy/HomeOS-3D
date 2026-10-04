/**
 * @file earthquake/controller.ts
 * @module backend/src/modules
 *
 * 地震预警模块 - 控制器。
 *
 * 职责：
 * - 暴露地震 EEW 演练、状态查询、最新预警 / 历史读取的 HTTP 接口
 * - 暴露全球 / 区域地震目录（CENC / USGS）查询接口
 * - 暴露预警关闭（dismiss）与演练历史清理接口
 *
 * 依赖：
 * - EarthquakeService：EEW 核心，预警触发 / 状态查询
 * - EarthquakeGlobalService：全球目录拉取与缓存
 * - EewPollService：状态面板刷新时主动拉取最新数据
 * - JwtAuthGuard / RolesGuard：JWT 鉴权与角色控制（admin 触发演练 / 删除演练历史）
 */
import { Body, Controller, Delete, Get, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { EarthquakeService } from './service';
import { EarthquakeGlobalService } from './global.service';
import { EewPollService } from './eew-poll.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { BusinessException, ErrorCode } from '../../common/utils';
import type { GlobalEarthquakeSource, GlobalEarthquakePeriod } from './global.types';
import { isEewSimulationEventId } from '@homeos/shared';

/**
 * 关闭预警 DTO。
 * 仅要求 eventId 字段（必填、字符串），用于 dismiss 接口。
 */
class DismissEarthquakeDto {
  @IsString({ message: 'eventId 须为字符串' })
  @IsNotEmpty({ message: 'eventId 必填' })
  eventId!: string;
}

/**
 * 地震预警控制器（DI 角色：HTTP 入口）。
 * 路由前缀 `/earthquake`，全部接口需 JWT 鉴权。
 */
@Controller('earthquake')
@ApiTags('awareness')
@UseGuards(JwtAuthGuard)
export class EarthquakeController {
  private readonly logger = new Logger(EarthquakeController.name);

  constructor(
    private readonly earthquakeService: EarthquakeService,
    private readonly earthquakeGlobalService: EarthquakeGlobalService,
    private readonly eewPollService: EewPollService,
  ) {}

  /**
   * 触发模拟演练预警。
   * 延迟 3 秒后调用 tryFireSimulatedAlert，使前端有时间切换到预警监听状态。
   * 受 EEW 启用开关影响（即使关闭也可触发，便于演练验证）。
   */
  @Post('test')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async testEarthquake() {
    this.logger.log('🧪 地震测试端点被调用.将在 3 秒后触发模拟警报...');
    await this.earthquakeService.ensureRuntimeConfig(true);
    const cfg = this.earthquakeService.getRuntimeConfig();
    if (!cfg.enabled) {
      this.logger.warn('配置中已禁用 EEW;若已配置坐标,测试仍会触发');
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const result = await this.earthquakeService.tryFireSimulatedAlert();
    if (!result.ok) {
      throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, result.message || '模拟演练失败');
    }
    return {
      success: true,
      message: '模拟地震预警已触发。',
    };
  }

  /** 获取 EEW 状态（GET 入口，JWT 即可访问）。 */
  @Get('status')
  async getStatusGet() {
    return this.buildStatus();
  }

  /** 获取 EEW 状态（POST 入口，便于前端统一鉴权后调用）。 */
  @Post('status')
  @Roles('admin', 'adult', 'child')
  async getStatus() {
    return this.buildStatus();
  }

  /**
   * 构建 EEW 状态视图：
   * - 若本实例为 Leader 且 EEW 已启用，立即触发一次主动轮询（pollNow）
   * - 根据 Leader / 启用状态 / 是否有轮询时间戳，给出可读 hint 用于前端展示
   * @returns 状态快照（含连接 / Leader / 阈值 / 数据源诊断 / 过滤原因）
   */
  private async buildStatus() {
    await this.earthquakeService.ensureRuntimeConfig();
    const coords = this.earthquakeService.getHomeCoordinates();
    const runtime = this.earthquakeService.getRuntimeConfig();
    const leader = this.earthquakeService.getLeaderStatus();
    if (runtime.enabled && leader.isLeader) {
      await this.eewPollService.pollNow().catch(() => undefined);
    }
    const wolfx = await this.earthquakeService.getClusterConnectionStatus();
    const diagnostics = this.earthquakeService.getDiagnosticsSnapshot();
    const hasPollStamp = diagnostics.sources.some(
      (s) => s.id !== 'usgs' && (s.lastPollAt || s.lastSuccessAt),
    );
    let hint: string | null = null;
    if (!runtime.enabled) {
      hint =
        '地震预警未启用：打开开关后点「保存地震预警」，才会连接 Wolfx 并轮询 SC/CENC。';
    } else if (!leader.isLeader) {
      hint =
        '本实例不是 EEW Leader：Wolfx 连接与 SC/CENC 轮询由集群主节点执行；此处显示「待命」且无时间戳是预期行为。';
    } else if (!hasPollStamp) {
      hint =
        '已启用且本机为 Leader，但尚未记录到轮询时间。请点「刷新」；若仍为空，请检查本机访问 api.wolfx.jp 是否超时。';
    }
    return {
      connected: wolfx.clusterConnected,
      wolfx,
      leader,
      activeEventId: this.earthquakeService.getActiveEventId(),
      homeCoordinates: coords,
      enabled: runtime.enabled,
      hint,
      thresholds: {
        minMagnitude: runtime.minMagnitude,
        maxDistance: runtime.maxDistance,
        minLocalIntensity: runtime.minLocalIntensity,
      },
      sources: diagnostics.sources,
      recentFilters: diagnostics.recentFilters,
    };
  }

  /** 获取最新预警（含 isActive / payload 字段）。 */
  @Get('latest')
  async getLatestAlert() {
    return this.earthquakeService.resolveLatestAlert();
  }

  /** 获取最近 50 条预警历史（PostgreSQL 优先，回退 Redis）。 */
  @Get('history')
  async getAlertHistory() {
    return this.earthquakeService.getAlertHistory(50);
  }

  /**
   * 删除模拟演练本地预警；query.eventId 指定单条，省略则清除全部演练。
   * 仅允许删除 eventId 以 `test_` 开头的演练记录。
   */
  @Delete('history/simulation')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteSimulationHistory(@Query('eventId') eventIdRaw?: string) {
    const eventId = String(eventIdRaw || '').trim();
    if (eventId && !isEewSimulationEventId(eventId)) {
      throw new BusinessException(
        ErrorCode.VALIDATION_FAILED,
        '仅可删除模拟演练记录（eventId 以 test_ 开头）',
      );
    }
    const result = await this.earthquakeService.deleteSimulationHistory(eventId || undefined);
    return {
      success: true,
      deleted: result.deleted,
      message: eventId
        ? result.deleted
          ? '已删除该演练记录'
          : '未找到对应演练记录'
        : result.deleted
          ? `已清除 ${result.deleted} 条演练记录`
          : '暂无演练记录',
    };
  }

  /**
   * 获取全球 / 区域地震目录（CENC / USGS）。
   * @param source 数据源（cenc / usgs），缺省 cenc
   * @param period 时间窗口（hour / day / week / month），缺省 day
   * @param minMag 震级下限，缺省按源回退
   * @param limit 返回条数上限，缺省 50
   */
  @Get('global')
  async getGlobalEarthquakes(
    @Query('source') source?: string,
    @Query('period') period?: string,
    @Query('minMag') minMag?: string,
    @Query('limit') limit?: string,
  ) {
    return this.earthquakeGlobalService.getRecentFeed({
      source: source as GlobalEarthquakeSource | undefined,
      period: period as GlobalEarthquakePeriod | undefined,
      minMagnitude: minMag != null ? Number(minMag) : undefined,
      limit: limit != null ? Number(limit) : undefined,
    });
  }

  /**
   * 关闭指定预警。
   * 标记 eventId 为已关闭，清除最新预警与去重状态，避免重复弹窗。
   */
  @Post('dismiss')
  @Roles('admin', 'adult', 'child')
  async dismissAlert(@Body() body: DismissEarthquakeDto) {
    return this.earthquakeService.acknowledgeAlert(body.eventId.trim());
  }

  /**
   * 获取 HA 系统配置中的坐标（仅 admin）。
   * 用于调试 EEW 家庭坐标来源（layout 优先，回退 HA /api/config）。
   */
  @Get('ha-config')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async getHaConfig() {
    const coords = await this.earthquakeService.getHaCoordinatesOnly();
    if (coords.latitude == null || coords.longitude == null) {
      throw new BusinessException(ErrorCode.CONFIG_ERROR, 'HA 未配置坐标或坐标无效');
    }
    return { success: true, data: coords };
  }
}
