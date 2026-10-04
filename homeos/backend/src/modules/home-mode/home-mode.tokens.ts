/**
 * HomeMode 窄接口端口（依赖注入令牌）。
 *
 * 职责：定义 HOME_MODE_LOOKUP 令牌与 HomeModeLookup 窄接口，供 Agent tools 等模块
 *  注入家庭模式查询 / 激活能力，避免直接 import HomeModeService 导致循环依赖（TDZ）。
 *  实际由 HomeModeModule 通过 useExisting(HomeModeService) 绑定到 HomeModeService。
 */
import type { OrchestratorExecActor } from '../../common/http-security/entity-execute-acl.util';

export const HOME_MODE_LOOKUP = Symbol('HOME_MODE_LOOKUP');

export interface HomeModeLookup {
  getActive(): Promise<{ id: string; name: string } | null>;
  findOne(id: string): Promise<unknown>;
  activate(
    id: string,
    opts?: { source?: string; reason?: string; actor?: OrchestratorExecActor },
  ): Promise<unknown>;
}
