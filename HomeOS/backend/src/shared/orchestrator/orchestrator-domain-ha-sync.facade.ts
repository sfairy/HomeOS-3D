/**
 * 统一域 HA 同步门面基类
 *
 * 收敛 automation / script / scene 三个域门面中逐字相同的 10 个转发方法：
 * syncToHA / syncFromHA / pullAllFromHA / removeFromHA / removeFromHAByConfigId /
 * getSyncPreview / getSyncStatus / repairDrift / repairAllDrift / syncAllToHA。
 *
 * 子类职责（仅保留域差异）：
 *  1. 构造器内注入域依赖并调用 super(yamlHaSync)；
 *  2. 在构造器体内执行 this.sync = this.yamlHaSync.create({ ... }) 完成域装配。
 *
 * 域差异收敛于 OrchestratorDomainAdapter（toHaConfig / haConfigToYaml / canonicalLocal 等）：
 * - yaml 域（script / automation）：本地行以 yaml 为真相；
 * - scene 域：本地行以 entities 为真相（canonical 往返规范化）。
 */
import type { OrchestratorDomainHaSyncFactory } from './orchestrator-domain-ha-sync.factory';

export abstract class OrchestratorDomainHaSyncFacade {
  /** 域装配入口（OrchestratorDomainHaSyncFactory），由子类构造器内经 super 注入 */
  protected readonly yamlHaSync: OrchestratorDomainHaSyncFactory;
  /** 装配后的同步对象：由子类构造器赋值（create 的返回） */
  protected sync!: ReturnType<OrchestratorDomainHaSyncFactory['create']>;

  protected constructor(yamlHaSync: OrchestratorDomainHaSyncFactory) {
    this.yamlHaSync = yamlHaSync;
  }

  syncToHA = (localId: string) => this.sync.syncToHA(localId);
  syncFromHA = (haConfigId: string, opts?: { runOnHa?: boolean }) =>
    this.sync.syncFromHA(haConfigId, opts);
  pullAllFromHA = () => this.sync.pullAllFromHA();
  removeFromHA = (localId: string) => this.sync.removeFromHA(localId);
  removeFromHAByConfigId = (
    haConfigId: string,
    options?: Parameters<typeof this.sync.removeFromHAByConfigId>[1],
  ) => this.sync.removeFromHAByConfigId(haConfigId, options);
  getSyncPreview = (localId: string) => this.sync.getSyncPreview(localId);
  getSyncStatus = (localId: string) => this.sync.getSyncStatus(localId);
  repairDrift = (localId: string, direction: 'push' | 'pull' = 'push') =>
    this.sync.repairDrift(localId, direction);
  repairAllDrift = (direction: 'push' | 'pull' = 'push') => this.sync.repairAllDrift(direction);
  syncAllToHA = () => this.sync.syncAllToHA();
}
