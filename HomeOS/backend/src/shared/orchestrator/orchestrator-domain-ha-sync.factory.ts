/**
 * 所属模块：backend/shared/orchestrator
 * 职责：
 *  - 域 HA 同步工厂基类；
 * 关键依赖：
 *  - ha-sync.engine；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Injectable } from '@nestjs/common';
import { OrchestratorHaSyncEngine } from './ha-sync.engine';
import {
  createOrchestratorDomainHaSync,
  type CreateOrchestratorDomainHaSyncOpts,
} from './yaml-ha-sync.util';

/**
 * OrchestratorDomainHaSyncDomainOpts：业务类型别名。
 * - 表示：shared/orchestrator/orchestrator-domain-ha-sync.factory.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
type OrchestratorDomainHaSyncDomainOpts = Omit<
  CreateOrchestratorDomainHaSyncOpts,
  'syncEngine'
>;

@Injectable()
/**
 * OrchestratorDomainHaSyncFactory：类声明。
 * - 所属文件：backend/src/shared/orchestrator/orchestrator-domain-ha-sync.factory.ts；
 * - 主要用途：封装域内职责的可复用类结构；
 * - 构造参数见 constructor 依赖注入列表；
 * @class OrchestratorDomainHaSyncFactory
 */
export class OrchestratorDomainHaSyncFactory {
  constructor(private readonly syncEngine: OrchestratorHaSyncEngine) {}

  create(
    opts: OrchestratorDomainHaSyncDomainOpts,
  ): ReturnType<typeof createOrchestratorDomainHaSync> {
    return createOrchestratorDomainHaSync({ ...opts, syncEngine: this.syncEngine });
  }
}
