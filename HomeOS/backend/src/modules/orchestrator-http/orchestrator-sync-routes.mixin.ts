/**
 * 联动器 HA 同步路由 Nest mixin（modules/orchestrator-http）。
 *
 * 所属模块：orchestrator-http
 * 职责：
 * - 为 automation / scene / script 控制器注入统一的 HA 同步路由（全量推/拉、单条推/拉、漂移修复、状态查询）。
 * - 通过 OrchestratorHaSyncPort 抽象端口委托具体同步逻辑给各业务控制器，路由实现与领域逻辑解耦。
 * - 可选 afterOrchestratorSync 钩子（如自动化规则重载）在同步成功后执行。
 *
 * 关键依赖：JwtAuthGuard / RolesGuard（鉴权）、controller.util（同步函数封装）、
 * sync.dto（请求体校验）、ha-sync.engine（同步状态类型）。
 */
import {
  Body,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  type Type,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { RemoveFromHaDto, SyncFromHaDto } from '../../shared/orchestrator/sync.dto';
import {
  runOrchestratorGetBulkSyncStatuses,
  runOrchestratorHaSyncThen,
  runOrchestratorRemoveFromHa,
  runOrchestratorRepairAllDrift,
  runOrchestratorRepairDrift,
  runOrchestratorSyncFromHa,
} from '../../shared/orchestrator/controller.util';

import type { SyncStatusResult } from '../../shared/orchestrator/ha-sync.engine';
import { parseBooleanQuery } from '../../common/utils/parse-boolean.util';

/**
 * 联动器控制器共用的 HA-sync 端口
 *
 * 各业务控制器实现该端口以提供具体的同步能力，mixin 路由将所有调用委托给 haSync。
 */
type OrchestratorHaSyncPort = {
  /** 全量推送本地联动器到 HA。 */
  syncAllToHA: () => Promise<unknown>;
  /** 全量从 HA 拉取联动器，allHaScenes 仅对场景生效。 */
  pullAllFromHA: (opts?: { allHaScenes?: boolean }) => Promise<unknown>;
  /** 根据 HA 配置 ID 拉取单条联动器，runOnHa 控制是否同时在 HA 端执行。 */
  syncFromHA: (haConfigId: string, opts?: { runOnHa?: boolean }) => Promise<unknown>;
  /** 根据 HA 配置 ID 从 HA 移除联动器，可附带 entity_id / name 上下文。 */
  removeFromHAByConfigId: (
    haConfigId: string,
    opts?: { entityId?: string; name?: string },
  ) => Promise<unknown>;
  /** 查询单条联动器的同步状态。 */
  getSyncStatus: (id: string) => Promise<SyncStatusResult>;
  /** 查询单条联动器的同步前预览（YAML diff 等）。 */
  getSyncPreview: (id: string) => Promise<unknown>;
  /** 推送单条联动器到 HA。 */
  syncToHA: (id: string) => Promise<{ success: boolean; message?: string }>;
  /** 修复单条联动器的漂移，direction 决定推送或拉取方向。 */
  repairDrift: (id: string, direction: 'push' | 'pull') => Promise<unknown>;
  /** 批量修复漂移，返回成功/失败计数。 */
  repairAllDrift: (
    direction: 'push' | 'pull',
  ) => Promise<{ repaired: number; failed: number }>;
};

/**
 * mixin 配置项。
 */
export type OrchestratorSyncRoutesOptions = {
  /** 实体中文标签（用于接口文档与日志），如“自动化”、“场景”、“脚本”。 */
  entityLabel: string;
  /** scene：pull-from-ha 支持 ?all= */
  supportPullAllQuery?: boolean;
  /** 同步预览接口的 Swagger 摘要文案，默认“同步前 YAML diff 预览”。 */
  previewSummary?: string;
  /** 同步写操作（全量推送 / 单条推送 / 漂移修复）所需角色，默认仅 admin（可覆盖 HA 配置）。 */
  writeRoles?: string[];
};

/**
 * Nest mixin：注入 automation / scene / script 共用的 HA 同步路由。
 * 子类需提供 `haSync`；可选 `afterOrchestratorSync`（如 reloadRules）。
 *
 * @param options mixin 配置项
 * @returns 抽象宿主类，子类继承并实现 haSync 后即可挂载全部同步路由
 */
export function OrchestratorSyncRoutesMixin(options: OrchestratorSyncRoutesOptions) {
  const {
    entityLabel,
    supportPullAllQuery = false,
    previewSummary = '同步前 YAML diff 预览',
    writeRoles = ['admin'],
  } = options;

  /**
   * 抽象宿主类：承载所有同步路由。
   * 子类必须实现 haSync，可选实现 afterOrchestratorSync 以便在同步后执行后续动作。
   */
  abstract class OrchestratorSyncRoutesHost {
    /** 子类提供的 HA 同步端口实现。 */
    protected abstract readonly haSync: OrchestratorHaSyncPort;
    /** 可选的同步后钩子（如自动化规则重载）。 */
    protected afterOrchestratorSync?(): Promise<void>;

    /**
     * 包装 afterOrchestratorSync 为可执行函数，未定义时返回 undefined。
     * 通过 .call(this) 绑定上下文，保证钩子内可访问子类实例。
     */
    private afterSyncHook(): (() => Promise<void>) | undefined {
      const hook = this.afterOrchestratorSync;
      if (!hook) return undefined;
      return () => hook.call(this);
    }
    /** 全量推送当前类型联动器到 HA。 */
    @ApiOperation({ summary: `全量推送${entityLabel}到 HA` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...writeRoles)
    @Post('sync/all-to-ha')
    async syncAllToHa() {
      return runOrchestratorHaSyncThen(
        () => this.haSync.syncAllToHA(),
        this.afterSyncHook(),
      );
    }

    /** 从 HA 全量拉取当前类型联动器；scene 类型支持 ?all=true|1 拉取全部 HA 场景。 */
    @ApiOperation({ summary: `从 HA 全量拉取${entityLabel}` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post('sync/pull-from-ha')
    async pullFromHa(@Query('all') all?: string) {
      const run = () =>
        // scene 路径下支持 ?all= 透传 allHaScenes；其他类型忽略该参数
        supportPullAllQuery
          ? this.haSync.pullAllFromHA({
              allHaScenes: parseBooleanQuery(all),
            })
          : this.haSync.pullAllFromHA();
      return runOrchestratorHaSyncThen(run, this.afterSyncHook());
    }

    /** 根据 HA 配置 ID 从 HA 同步单条联动器。 */
    @ApiOperation({ summary: `从 HA 同步单条${entityLabel}` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post('sync/from-ha')
    async syncFromHa(@Body() body: SyncFromHaDto) {
      return runOrchestratorSyncFromHa(
        body,
        (id, opts) => this.haSync.syncFromHA(id, opts),
        this.afterSyncHook(),
      );
    }

    /** 根据 HA 配置 ID 从 HA 移除单条联动器。 */
    @ApiOperation({ summary: `从 HA 移除${entityLabel}` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post('sync/remove-from-ha')
    async removeFromHa(@Body() body: RemoveFromHaDto) {
      return runOrchestratorRemoveFromHa(
        body,
        (id, opts) => this.haSync.removeFromHAByConfigId(id, opts),
        this.afterSyncHook(),
      );
    }

    /** 批量获取联动器同步状态（?ids=逗号分隔 ID 列表）。 */
    @ApiOperation({ summary: `批量获取${entityLabel}同步状态` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin', 'adult')
    @Get('sync/statuses')
    async getBulkSyncStatuses(@Query('ids') ids?: string) {
      return runOrchestratorGetBulkSyncStatuses(ids, (id) => this.haSync.getSyncStatus(id));
    }

    /** 查询单条联动器的同步状态。 */
    @ApiOperation({ summary: `获取${entityLabel}同步状态` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin', 'adult')
    @Get(':id/sync-status')
    async getSyncStatus(@Param('id') id: string) {
      return this.haSync.getSyncStatus(id);
    }

    /** 查询单条联动器同步前的预览信息（YAML diff 等）。仅 admin 可调用。 */
    @ApiOperation({ summary: previewSummary })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get(':id/sync-preview')
    async getSyncPreview(@Param('id') id: string) {
      return this.haSync.getSyncPreview(id);
    }

    /** 推送单条联动器到 HA。 */
    @ApiOperation({ summary: `推送单条${entityLabel}到 HA` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...writeRoles)
    @Post(':id/sync-to-ha')
    async syncToHa(@Param('id') id: string) {
      return runOrchestratorHaSyncThen(
        () => this.haSync.syncToHA(id),
        this.afterSyncHook(),
      );
    }

    /** 修复单条联动器漂移，?direction=push|pull 决定修复方向。 */
    @ApiOperation({ summary: `修复${entityLabel}漂移` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...writeRoles)
    @Post(':id/repair-drift')
    async repairDrift(
      @Param('id') id: string,
      @Query('direction') direction?: 'push' | 'pull',
    ) {
      return runOrchestratorRepairDrift(
        id,
        direction,
        (itemId, dir) => this.haSync.repairDrift(itemId, dir),
        this.afterSyncHook(),
      );
    }

    /** 批量修复漂移，?direction=push|pull 决定修复方向。 */
    @ApiOperation({ summary: `批量修复${entityLabel}漂移` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...writeRoles)
    @Post('sync/repair-all-drift')
    async repairAllDrift(@Query('direction') direction?: 'push' | 'pull') {
      return runOrchestratorRepairAllDrift(
        direction,
        (dir) => this.haSync.repairAllDrift(dir),
        this.afterSyncHook(),
      );
    }
  }

  // 返回构造器类型，使 mixin 可被 NestJS DI 系统当作可注入控制器基类使用
  return OrchestratorSyncRoutesHost as Type<OrchestratorSyncRoutesHost> & {
    new (...args: unknown[]): OrchestratorSyncRoutesHost;
  };
}