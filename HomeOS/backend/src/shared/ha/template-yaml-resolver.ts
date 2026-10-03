/**
 * @file template-yaml-resolver.ts
 * @module shared/ha
 *
 * HA Template 实体 YAML 配置解析器：
 *  按优先级将 HA 中的 template 实体还原为可读的 configuration.yaml 片段：
 *    1. Config Entry（UI 创建）：通过 Template Helper Options Flow 读取
 *    2. 本地 configuration.yaml（YAML 创建）：扫描 HA_CONFIG_DIR
 *    3. 实体运行态属性增强的占位 stub（兜底，无法还原完整定义）
 *
 * 关键依赖：
 *  - ./config-flow.util：HaFlowStep 类型
 *  - ./entity-registry.util：HaEntityRegistryEntry 类型
 *  - ../types：HaEntity 类型
 *  - ./config-access.util：withAsyncTimeout 给配置目录访问加超时保护
 *  - ./template-yaml.internals：实际的块解析 / 文本编辑 / 文件系统操作工具
 *
 * 注意：本模块通过 `export * from './template-yaml.internals'` 保持向后兼容的导出面。
 */
import type { HaFlowStep } from './config-flow.util';
import type { HaEntityRegistryEntry } from './entity-registry.util';
import type { HaEntity } from '../types';
import { withAsyncTimeout } from './config-access.util';
import { stubTemplateYamlFromEntity } from './template-yaml.internals';
import {
  extractTriggerEntityIdFromYaml,
  inferTriggerEntityId,
} from './template-yaml.internals';
import {
  extractSuggestedValuesFromDataSchema,
  flowOptionsToTemplateYaml,
  enrichStubFromEntityState,
} from './template-yaml.internals';
import {
  extractTemplateBlockFromConfigTextFast,
  extractTemplateFromLocalHaConfigDir,
} from './template-yaml.internals';

// 向后兼容：保持原模块的导出面（块解析 / 文本编辑 / 文件系统）
export * from './template-yaml.internals';

/**
 * 解析 template YAML 的可选参数。
 */
export type ResolveTemplateYamlOptions = {
  // 配置目录扫描超时（毫秒），默认 12 秒
  configDirTimeoutMs?: number;
  // Config Entry Options Flow 超时（毫秒），默认 15 秒
  configEntryTimeoutMs?: number;
  // 是否跳过 Config Entry 路径（用于已知非 UI 创建的场景）
  skipConfigEntry?: boolean;
  /** 导入时仅扫描主配置与 packages，避免 SMB 全目录扫描超时 */
  fastConfigOnly?: boolean;
};

/**
 * 解析 template YAML 的结果。
 */
export interface TemplateYamlResolveResult {
  // 还原得到的 YAML 文本
  yaml: string;
  // 来源：config_entry（UI）/ configuration_yaml（YAML）/ entity_state（属性增强）/ stub（占位）
  source: 'config_entry' | 'configuration_yaml' | 'entity_state' | 'stub';
  // 是否完整还原（stub 视为不完整）
  complete: boolean;
  // 推断的触发器 entity_id（用于 trigger-based template）
  trigger_entity_id?: string;
}

/**
 * 解析器对外部 HA 访问能力的依赖注入接口。
 * 调用方需提供这些函数实现，便于在不同上下文（HTTP / 任务 / 测试）中复用。
 */
interface TemplateYamlResolverDeps {
  // 启动 Options Flow（用于读取 UI 创建的 template 配置）
  startOptionsFlow: (entryId: string) => Promise<HaFlowStep>;
  // 提交 Options Flow 步骤
  submitOptionsFlowStep: (flowId: string, data: Record<string, unknown>) => Promise<HaFlowStep>;
  // 中止 Options Flow（释放服务端资源）
  abortConfigFlow: (flowId: string) => Promise<unknown>;
  // 获取实体运行态（用于 stub 增强）
  fetchEntityState: (entityId: string) => Promise<HaEntity | null>;
  // 可选：获取实体注册表（用于 trigger entity 推断）
  fetchEntityRegistry?: () => Promise<HaEntityRegistryEntry[]>;
}

/**
 * 通过 Template Helper Options Flow 读取完整配置（UI 创建的 template）。
 *
 * @param entryId HA Config Entry ID
 * @param deps 外部依赖
 * @returns 还原的 YAML 文本；若 Options Flow 失败或无数据返回 null
 *
 * 流程：
 *  1. startOptionsFlow 启动流程
 *  2. 循环遍历 form / menu 步骤（最多 8 步防死循环），收集 suggested_value
 *  3. abortConfigFlow 中止流程（即使中途异常也通过 finally 保证中止）
 *  4. flowOptionsToTemplateYaml 将收集的字段转为 YAML
 *
 * 注意：menu 步骤默认选第一项，符合 template helper 的典型路径。
 */
async function readTemplateYamlFromConfigEntry(
  entryId: string,
  deps: TemplateYamlResolverDeps,
): Promise<string | null> {
  let step: HaFlowStep;
  try {
    step = await deps.startOptionsFlow(entryId);
  } catch {
    // Options Flow 启动失败：UI 创建的 template 可能未提供 helper，返回 null 走兜底
    return null;
  }
  const flowId = step.flow_id;
  if (!flowId) return null;

  const collected: Record<string, unknown> = {};
  let platform = '';
  try {
    // 最多遍历 8 步，防止流程异常导致死循环
    for (let i = 0; i < 8; i++) {
      if (step.type === 'abort') break;
      if (step.type === 'form') {
        // 提取表单字段的 suggested_value（即用户当前配置值）
        Object.assign(collected, extractSuggestedValuesFromDataSchema(step.data_schema));
        // step_id 非 init/user 时记录为 platform（如 sensor / binary_sensor）
        if (step.step_id && step.step_id !== 'init' && step.step_id !== 'user') {
          platform = step.step_id;
        }
        if (step.last_step) break;
        step = await deps.submitOptionsFlowStep(flowId, {});
        continue;
      }
      if (step.type === 'menu' && step.menu_options?.length) {
        // 菜单步骤默认选第一项（template helper 的典型下一步）
        const choice = step.menu_options[0];
        step = await deps.submitOptionsFlowStep(flowId, { next_step_id: choice });
        continue;
      }
      break;
    }
  } finally {
    // 无论成功失败都中止 Flow，释放 HA 服务端资源
    await deps.abortConfigFlow(flowId).catch(() => {});
  }

  if (!Object.keys(collected).length) return null;
  // platform 未识别时回退到 template_type 字段，再不行默认 sensor
  if (!platform && collected.template_type) platform = String(collected.template_type);
  return flowOptionsToTemplateYaml(platform || 'sensor', collected);
}
/**
 * 综合解析：Config Entry → 本地配置目录 → 实体属性增强占位。
 *
 * @param registryEntry HA 实体注册表项
 * @param deps 外部依赖
 * @param haConfigDir 本机 HA 配置目录（可选）
 * @param options 解析选项
 * @returns 解析结果（含 yaml / source / complete / trigger_entity_id）
 *
 * 流程按优先级尝试三种来源，任一成功即返回：
 *  1. Config Entry（UI 创建）：通过 Options Flow 读取完整配置
 *  2. 本地配置目录（YAML 创建）：扫描 configuration.yaml 等
 *  3. 实体属性增强占位（兜底）：从实体运行态属性生成不完整的 stub
 *
 * 各来源均通过 withAsyncTimeout 加超时保护，避免 HA 慢响应或 SMB 慢扫描阻塞导入流程。
 */
export async function resolveTemplateYamlForImport(
  registryEntry: HaEntityRegistryEntry,
  deps: TemplateYamlResolverDeps,
  haConfigDir?: string,
  options?: ResolveTemplateYamlOptions,
): Promise<TemplateYamlResolveResult> {
  const uniqueId = String(registryEntry.unique_id || '');
  const entityId = registryEntry.entity_id;
  const name = registryEntry.name || entityId;
  const configDirTimeoutMs = options?.configDirTimeoutMs ?? 12_000;
  const configEntryTimeoutMs = options?.configEntryTimeoutMs ?? 15_000;

  // 实体注册表用于 trigger entity 推断（同设备功率传感器等）
  const registry = deps.fetchEntityRegistry ? await deps.fetchEntityRegistry() : [];

  // 优先级 1：Config Entry（UI 创建的 template）
  if (registryEntry.config_entry_id && !options?.skipConfigEntry) {
    const fromEntry = await withAsyncTimeout(
      readTemplateYamlFromConfigEntry(registryEntry.config_entry_id, deps),
      configEntryTimeoutMs,
    );
    if (fromEntry?.trim()) {
      // 优先从 YAML 提取 trigger entity，提取不到则从注册表推断
      const triggerEntityId =
        extractTriggerEntityIdFromYaml(fromEntry) || inferTriggerEntityId(registryEntry, registry);
      return {
        yaml: fromEntry,
        source: 'config_entry',
        complete: true,
        trigger_entity_id: triggerEntityId || undefined,
      };
    }
  }

  // 优先级 2：本地配置目录（YAML 创建的 template）
  if (haConfigDir) {
    // fastConfigOnly 模式仅扫描主配置候选文件 + packages 目录，避免 SMB 全目录扫描超时
    const loadFromDir = options?.fastConfigOnly
      ? () => extractTemplateBlockFromConfigTextFast(haConfigDir, uniqueId, entityId)
      : () => extractTemplateFromLocalHaConfigDir(haConfigDir, uniqueId, entityId);
    const fromFiles = await withAsyncTimeout(loadFromDir(), configDirTimeoutMs);
    if (fromFiles?.trim()) {
      const triggerEntityId =
        extractTriggerEntityIdFromYaml(fromFiles) || inferTriggerEntityId(registryEntry, registry);
      return {
        yaml: fromFiles,
        source: 'configuration_yaml',
        complete: true,
        trigger_entity_id: triggerEntityId || undefined,
      };
    }
  }

  // 优先级 3：实体属性增强占位（兜底，无法还原完整定义）
  const entity = await deps.fetchEntityState(entityId);
  const stub = stubTemplateYamlFromEntity(entityId, name, uniqueId);
  const enriched = enrichStubFromEntityState(stub, entity);
  // enriched 与 stub 不同表示属性增强生效，但仍是占位
  const complete = enriched !== stub;
  const triggerEntityId = inferTriggerEntityId(registryEntry, registry);
  return {
    yaml: enriched,
    source: complete ? 'entity_state' : 'stub',
    complete: false,
    trigger_entity_id: triggerEntityId || undefined,
  };
}