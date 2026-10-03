/**
 * 所属模块：backend/shared/orchestrator
 * 职责：
 *  - 四域同步绑定器；
 * 关键依赖：
 *  - orchestrator-domain-ha-sync.factory；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Injectable } from '@nestjs/common';
import {
  OrchestratorHaSyncEngine,
  type SyncResult,
  type SyncStatusResult,
} from './ha-sync.engine';
import { createOrchestratorCrudMethods } from './crud-ha-sync.util';

type CrudOpts = Omit<Parameters<typeof createOrchestratorCrudMethods>[0], 'syncEngine'>;
type DriftOpts = Parameters<OrchestratorHaSyncEngine['computeContentDriftStatus']>[0];

@Injectable()
/**
 * OrchestratorHaSyncBinder：类声明。
 * - 所属文件：backend/src/shared/orchestrator/orchestrator-ha-sync.binder.ts；
 * - 主要用途：封装域内职责的可复用类结构；
 * - 构造参数见 constructor 依赖注入列表；
 * @class OrchestratorHaSyncBinder
 */
export class OrchestratorHaSyncBinder {
  constructor(private readonly syncEngine: OrchestratorHaSyncEngine) {}

  createCrud(opts: CrudOpts): ReturnType<typeof createOrchestratorCrudMethods> {
    return createOrchestratorCrudMethods({ ...opts, syncEngine: this.syncEngine });
  }

  runExclusiveSync<T>(scope: string, fn: () => Promise<T>, onBusy?: () => T): Promise<T> {
    return this.syncEngine.runExclusiveSync(scope, fn, onBusy);
  }

  guardHaSyncEnabled(): SyncResult | null {
    return this.syncEngine.guardHaSyncEnabled();
  }

  guardHaSync(requireConnected = true): Promise<SyncResult | null> {
    return this.syncEngine.guardHaSync(requireConnected);
  }

  syncOutcomeFinisher(scope: string): ReturnType<OrchestratorHaSyncEngine['syncOutcomeFinisher']> {
    return this.syncEngine.syncOutcomeFinisher(scope);
  }

  syncStatusErrorFields(scope: string): ReturnType<OrchestratorHaSyncEngine['syncStatusErrorFields']> {
    return this.syncEngine.syncStatusErrorFields(scope);
  }

  computeContentDriftStatus(opts: DriftOpts): Promise<SyncStatusResult> {
    return this.syncEngine.computeContentDriftStatus(opts);
  }
}
