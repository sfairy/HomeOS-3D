/**
 * 联动器配置定时拉取服务：从 HA 自动导入 automation/scene/script/template。
 *
 * 所属模块：orchestrator-bootstrap
 * 职责：
 * - 按 automation.haAutoImportIntervalMin 间隔定时调用各 HaSyncService.pullAllFromHA，
 *   拉取失败的项目按 configId 入重试队列，5 分钟轮询重试至 maxRetry 上限后放弃。
 * - 配置热更新时重排定时器，避免间隔变更后等待旧周期。
 * - 拉取成功后调用 AutomationEngineService.reloadRules 让引擎消费最新规则。
 *
 * 关键依赖：AppConfigService、JobRegistryService、Automation/Scene/Script/TemplateEntityHaSync、AutomationEngineService。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_CONFIG_UPDATED, AppConfigService } from '../../shared/app-config/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { AutomationHaSyncService } from '../automation/ha-sync.service';
import { SceneHaSyncService } from '../scene/ha-sync.service';
import { ScriptHaSyncService } from '../script/ha-sync.service';
import { TemplateEntityHaSyncService } from '../template-entity/ha-sync.service';
import { AutomationEngineService } from '../automation/engine.service';

type OrchestratorImportKind = 'automation' | 'scene' | 'script' | 'template';

/**
 * 定时从 HA 拉取联动器配置（自动化/场景/脚本/模板实体），补齐 ha-sync 手动导入能力。
 */
@Injectable()
export class OrchestratorAutoImportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrchestratorAutoImportService.name);
  private timer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private running = false;
  /** 已记录「已启用」日志的间隔，避免配置热更新重复刷屏 */
  private loggedIntervalMin: number | null = null;
  private readonly retryQueue: Array<{
    kind: OrchestratorImportKind;
    configId: string;
    attempts: number;
  }> = [];

  /** 单个 configId 最大重试次数（来自 ops.orchestratorImportMaxRetry） */
  private get maxRetry() {
    return this.appConfig.get('ops').orchestratorImportMaxRetry;
  }

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly automationHaSync: AutomationHaSyncService,
    private readonly sceneHaSync: SceneHaSyncService,
    private readonly scriptHaSync: ScriptHaSyncService,
    private readonly templateHaSync: TemplateEntityHaSyncService,
    private readonly automationEngine: AutomationEngineService,
    private readonly jobs: JobRegistryService,
  ) {}

  /** 模块初始化：首次调度定时拉取 */
  onModuleInit() {
    this.schedule();
  }

  /** 模块销毁：清理定时器与重试队列 */
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

  /** AppConfig 热更新监听：automation 配置变更时重排定时器 */
  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(sections: string[]) {
    if (!sections?.includes('automation')) return;
    this.schedule();
  }

  /**
   * 重排定时拉取任务：间隔下限 30 分钟，未启用时清理定时器。
   * 同时启动 5 分钟一次的重试队列轮询定时器，失败 configId 走重试路径。
   */
  private schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    const cfg = this.appConfig.get('automation');
    if (!cfg.haSyncEnabled || !cfg.haAutoImportEnabled) {
      this.loggedIntervalMin = null;
      return;
    }

    const intervalMin = Math.max(cfg.haAutoImportIntervalMin || 360, 30);
    const ms = intervalMin * 60_000;
    this.timer = setInterval(() => {
      void this.jobs.run(
        'orchestrator-auto-import',
        { description: 'HA 联动器配置定时拉取', intervalMs: ms },
        () => this.runImport(),
      );
    }, ms);
    if (!this.retryTimer) {
      this.retryTimer = setInterval(() => {
        void this.jobs.run(
          'orchestrator-import-retry',
          { description: 'HA 拉取失败重试队列处理', intervalMs: 5 * 60_000 },
          () => this.processRetryQueue(),
        );
      }, 5 * 60_000);
    }
    if (this.loggedIntervalMin !== intervalMin) {
      this.loggedIntervalMin = intervalMin;
      this.logger.log(`定时拉取已启用,间隔 ${intervalMin} 分钟`);
    }
  }

  /**
   * 从错误信息中解析 configId（错误格式约定为 "configId: 详细原因"）。
   * 解析失败返回 null（错误信息不包含可识别的 configId 时跳过重试）。
   */
  private parseConfigIdFromError(err: string): string | null {
    const colonIdx = err.indexOf(':');
    if (colonIdx <= 0) return null;
    const configId = err.slice(0, colonIdx).trim();
    if (!configId || !/^[\w.-]+$/.test(configId)) return null;
    return configId;
  }

  /**
   * 将批量错误按 configId 入重试队列；已存在时保留原 attempts 不重置。
   * 队列上限 20 项，超出后从队首裁剪以避免无界增长。
   */
  private enqueueErrors(kind: OrchestratorImportKind, errors: string[]) {
    for (const err of errors) {
      const configId = this.parseConfigIdFromError(err);
      if (!configId) continue;
      const exists = this.retryQueue.find((q) => q.kind === kind && q.configId === configId);
      if (exists) {
        // 已存在时保留原 attempts，避免每次导入周期重置计数导致无限重试绕过 maxRetry
      } else {
        this.retryQueue.push({ kind, configId, attempts: 0 });
      }
    }
    if (this.retryQueue.length > 20) {
      this.retryQueue.splice(0, this.retryQueue.length - 20);
    }
  }

  /**
   * 处理重试队列：取出队首项，超过 maxRetry 放弃；
   * 调用对应 HaSyncService.syncFromHA 单 configId 重试，成功则触发 engine reload。
   * 失败时把项重新放回队尾（不阻塞下一次轮询）。
   */
  private async processRetryQueue() {
    if (this.running || this.retryQueue.length === 0) return;
    const item = this.retryQueue.shift();
    if (!item) return;
    if (item.attempts >= this.maxRetry) {
      this.logger.warn(`HA 导入重试已放弃 [${item.kind}] ${item.configId}`);
      return;
    }

    item.attempts += 1;
    try {
      let result: { success: boolean; message?: string };
      if (item.kind === 'automation') {
        result = await this.automationHaSync.syncFromHA(item.configId);
      } else if (item.kind === 'scene') {
        result = await this.sceneHaSync.syncFromHA(item.configId);
      } else if (item.kind === 'template') {
        result = await this.templateHaSync.syncFromHA(item.configId);
      } else {
        result = await this.scriptHaSync.syncFromHA(item.configId);
      }
      if (result.success) {
        await this.automationEngine.reloadRules();
        this.logger.log(`HA 导入重试成功 [${item.kind}] ${item.configId}`);
      } else {
        this.retryQueue.push(item);
        this.logger.warn(
          `HA 导入重试失败 [${item.kind}] ${item.configId}: ${result.message || ''}`,
        );
      }
    } catch (err) {
      this.retryQueue.push(item);
      this.logger.warn(
        `HA 导入重试异常 [${item.kind}] ${item.configId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * 单次定时拉取：并发调用四类 HaSyncService.pullAllFromHA，
   * 完成后触发 engine.reloadRules，并将失败项入重试队列。
   * 通过 running 标志防止与重试队列并发执行造成 HA 压力。
   */
  private async runImport() {
    if (this.running) return;
    this.running = true;
    try {
      const [auto, scene, script, template] = await Promise.all([
        this.automationHaSync.pullAllFromHA(),
        this.sceneHaSync.pullAllFromHA(),
        this.scriptHaSync.pullAllFromHA(),
        this.templateHaSync.pullAllFromHA(),
      ]);
      await this.automationEngine.reloadRules();
      const totalImported = auto.imported + scene.imported + script.imported + template.imported;
      const totalUpdated = auto.updated + scene.updated + script.updated + template.updated;
      const errors = [...auto.errors, ...scene.errors, ...script.errors, ...template.errors];
      this.enqueueErrors('automation', auto.errors);
      this.enqueueErrors('scene', scene.errors);
      this.enqueueErrors('script', script.errors);
      this.enqueueErrors('template', template.errors);
      if (totalImported || totalUpdated) {
        this.logger.log(
          `HA 定时拉取完成: 新增 ${totalImported},更新 ${totalUpdated}` +
            (errors.length
              ? `,${errors.length} 项失败(已入重试队列 ${this.retryQueue.length})`
              : ''),
        );
      }
    } catch (err) {
      this.logger.warn(`HA 定时拉取失败: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
