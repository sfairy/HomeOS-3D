/**
 * 联动器定时漂移修复：按配置周期调用各领域 repairAllDrift。
 *
 * 所属模块：orchestrator-bootstrap
 * 职责：
 * - 按 automation.driftRepairIntervalMin 间隔定时调用四类 HaSyncService.repairAllDrift，
 *   以 push 模式同步本地与 HA 间的配置漂移（用户在 HA 端直接修改后自动回写）。
 * - 通过 OrchestratorHaSyncEngine.recordSyncOutcome 上报修复结果，便于同步看板统计。
 * - 将每次修复 summary 持久化到 runtimeKv（id=orchestrator-drift-repair），供运维查询。
 *
 * 关键依赖：AppConfigService、PrismaService、JobRegistryService、OrchestratorHaSyncEngine、
 * Automation/Scene/Script/TemplateEntityHaSync。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_CONFIG_UPDATED, AppConfigService } from '../../shared/app-config/service';
import { PrismaService } from '../../shared/prisma/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { toInputJson } from '../../common/utils/json-field.util';
import { OrchestratorHaSyncEngine } from '../../shared/orchestrator/ha-sync.engine';
import { AutomationHaSyncService } from '../automation/ha-sync.service';
import { SceneHaSyncService } from '../scene/ha-sync.service';
import { ScriptHaSyncService } from '../script/ha-sync.service';
import { TemplateEntityHaSyncService } from '../template-entity/ha-sync.service';

const DRIFT_REPAIR_CONFIG_ID = 'orchestrator-drift-repair';

@Injectable()
/**
 * OrchestratorDriftRepairService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class OrchestratorDriftRepairService
 */
export class OrchestratorDriftRepairService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrchestratorDriftRepairService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** 已记录「已启用」日志的间隔，避免配置热更新重复刷屏 */
  private loggedIntervalMin: number | null = null;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly syncEngine: OrchestratorHaSyncEngine,
    private readonly automationHaSync: AutomationHaSyncService,
    private readonly sceneHaSync: SceneHaSyncService,
    private readonly scriptHaSync: ScriptHaSyncService,
    private readonly templateHaSync: TemplateEntityHaSyncService,
    private readonly jobs: JobRegistryService,
  ) {}

  /** 模块初始化：首次调度漂移修复任务 */
  onModuleInit() {
    this.schedule();
  }

  /** 模块销毁：清理定时器 */
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** AppConfig 热更新监听：automation 配置变更时重排定时器 */
  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(sections: string[]) {
    if (!sections?.includes('automation')) return;
    this.schedule();
  }

  /** 重排定时修复任务：间隔下限 5 分钟，未启用时清理定时器 */
  private schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    const cfg = this.appConfig.get('automation');
    if (!cfg.haSyncEnabled || !cfg.autoRepairDrift) {
      this.loggedIntervalMin = null;
      return;
    }

    const intervalMin = Math.max(cfg.driftRepairIntervalMin || 30, 5);
    const ms = intervalMin * 60_000;
    this.timer = setInterval(() => {
      void this.jobs.run(
        'orchestrator-drift-repair',
        { description: '联动器 HA 漂移定时修复', intervalMs: ms },
        () => this.runRepair(),
      );
    }, ms);
    if (this.loggedIntervalMin !== intervalMin) {
      this.loggedIntervalMin = intervalMin;
      this.logger.log(`定时修复已启用,间隔 ${intervalMin} 分钟`);
    }
  }

  /** 将上次修复 summary 持久化到 runtimeKv（upsert by id），失败时仅告警不抛出 */
  private async persistLastResult(payload: Record<string, unknown>) {
    try {
      const data = toInputJson(payload, {});
      await this.prisma.runtimeKv.upsert({
        where: { id: DRIFT_REPAIR_CONFIG_ID },
        create: { id: DRIFT_REPAIR_CONFIG_ID, data },
        update: { data },
      });
    } catch (err) {
      this.logger.warn(`写入漂移修复结果失败: ${(err as Error).message}`);
    }
  }

  /**
   * 单次定时修复：并发调用四类 repairAllDrift('push')，
   * 汇总 repaired/failed/errors，调用 syncEngine.recordSyncOutcome 上报结果，
   * 将 summary 持久化到 runtimeKv，通过 running 标志防止并发执行。
   */
  private async runRepair() {
    if (this.running) return;
    this.running = true;
    const startedAt = new Date().toISOString();
    try {
      const [auto, scene, script, template] = await Promise.all([
        this.automationHaSync.repairAllDrift('push'),
        this.sceneHaSync.repairAllDrift('push'),
        this.scriptHaSync.repairAllDrift('push'),
        this.templateHaSync.repairAllDrift('push'),
      ]);

      const repaired = auto.repaired + scene.repaired + script.repaired + template.repaired;
      const failed = auto.failed + scene.failed + script.failed + template.failed;
      const errors = [...auto.errors, ...scene.errors, ...script.errors, ...template.errors];

      if (errors.length) {
        this.syncEngine.recordSyncOutcome(
          'drift-repair:periodic',
          false,
          errors.slice(0, 8).join('; '),
        );
      } else {
        this.syncEngine.recordSyncOutcome('drift-repair:periodic', true);
      }

      const summary = {
        startedAt,
        finishedAt: new Date().toISOString(),
        repaired,
        failed,
        errors: errors.slice(0, 20),
        byDomain: {
          automation: auto,
          scene,
          script,
          template,
        },
      };
      await this.persistLastResult(summary);

      if (repaired || failed) {
        this.logger.log(
          `HA 漂移定时修复完成: 修复 ${repaired},失败 ${failed}` +
            (errors.length ? `(${errors.length} 条错误已记录)` : ''),
        );
      }
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`HA 漂移定时修复失败: ${message}`);
      this.syncEngine.recordSyncOutcome('drift-repair:periodic', false, message);
      await this.persistLastResult({
        startedAt,
        finishedAt: new Date().toISOString(),
        repaired: 0,
        failed: 1,
        errors: [message],
      });
    } finally {
      this.running = false;
    }
  }
}
