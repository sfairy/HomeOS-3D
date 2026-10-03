/**
 * 联动器占位符服务基类及业务专属 DI 占位类。
 *
 * 所属模块：shared/orchestrator（联动器横切基础设施）
 * 职责：
 *   - 提供对 YAML/场景内容中占位符（如待替换的 entity_id）的扫描与替换能力的
 *     可注入服务基类。
 *   - 通过 PlaceholderHandlers（由 placeholder.helper 工厂创建）
 *     委托具体实现，使基类保持轻量、可被多个业务模块以不同 DI token 复用。
 */
import { Injectable } from '@nestjs/common';
/** 占位符处理器集合类型（YAML / 自动化 geekGraph 同步等工厂共用形状）。 */
type PlaceholderHandlers = {
  scanPlaceholders(id: string): Promise<{
    placeholders: string[];
    suggestions: unknown;
    remaining: number;
  }>;
  replacePlaceholders(
    id: string,
    replacements: Record<string, string>,
  ): Promise<Record<string, unknown>>;
};

/**
 * 占位符服务的可注入基类。
 *
 * - 通过构造函数注入处理器集合，将扫描 / 替换调用委托给 handlers。
 * - 子类（Automation/Scene/Script）共享同一行为，但拥有不同 DI token，
 *   以便各业务模块独立配置其背后的 adapter（如 YAML 字段名、查找逻辑）。
 */
@Injectable()
class OrchestratorPlaceholderServiceBase {
  constructor(private readonly handlers: PlaceholderHandlers) {}

  /**
   * 扫描指定联动器内容中的占位符并给出替换建议。
   *
   * @param id 联动器实体 ID
   * @returns 包含 placeholders、suggestions、remaining 的结果对象
   */
  scanPlaceholders(id: string) {
    return this.handlers.scanPlaceholders(id);
  }

  /**
   * 根据传入的替换映射对占位符进行替换并持久化。
   *
   * @param id 联动器实体 ID
   * @param replacements 占位符 -> 目标值的映射
   * @returns 更新后的实体信息及剩余未替换占位符数量
   */
  replacePlaceholders(id: string, replacements: Record<string, string>) {
    return this.handlers.replacePlaceholders(id, replacements);
  }
}

/**
 * 独立 DI token：自动化占位符服务。
 * 各模块通过 factory 注入对应 adapter，行为与基类一致。
 */
export class AutomationPlaceholderService extends OrchestratorPlaceholderServiceBase {}

/** 独立 DI token：场景占位符服务。 */
export class ScenePlaceholderService extends OrchestratorPlaceholderServiceBase {}

/** 独立 DI token：脚本占位符服务。 */
export class ScriptPlaceholderService extends OrchestratorPlaceholderServiceBase {}