/**
 * HomeMode 窄接口端口（依赖注入令牌）。
 *
 * 所属模块：backend/modules/home-mode
 * 职责：定义 HOME_MODE_LOOKUP 令牌与 HomeModeLookup 窄接口，供 Agent tools 等模块
 *  注入家庭模式查询 / 激活能力，避免直接 import HomeModeService 导致循环依赖（TDZ）。
 *  实际由 HomeModeModule 通过 useExisting(HomeModeService) 绑定到 HomeModeService。
 */
import type { OrchestratorExecActor } from '../scene/scene-execute-acl.util';

/**
 * HOME_MODE_LOOKUP：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：可能被模板字符串动态访问，重命名需全仓检索
 */
export const HOME_MODE_LOOKUP = Symbol('HOME_MODE_LOOKUP');

/**
 * HomeModeLookup：业务接口定义。
 * - 表示：modules/home-mode/home-mode.tokens.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface HomeModeLookup {
  getActive(): Promise<{ id: string; name: string } | null>;
  findOne(id: string): Promise<unknown>;
  activate(
    id: string,
    opts?: { source?: string; reason?: string; actor?: OrchestratorExecActor },
  ): Promise<unknown>;
}
