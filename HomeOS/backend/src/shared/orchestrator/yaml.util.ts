/**
 * 联动器 YAML 工具函数。
 *
 * 所属模块：shared/orchestrator（联动器横切基础设施）
 * 职责：
 *   - 统一封装联动器（脚本 / 自动化 / 场景）相关的 YAML 序列化、解析、校验逻辑，
 *     屏蔽 @homeos/shared 中 HA YAML 工具的调用细节。
 *   - 提供 toItemList 用于将 HA action / trigger / sequence 单值与数组形态归一化。
 *   - 提供 buildAliasModeYamlHeader 生成 script/automation YAML 的公共头部。
 * 关键依赖：
 *   - @homeos/shared：dumpHaYaml / loadHaYamlObject 提供 HA 风格 YAML 处理。
 *   - ../utils：getErrorMessage 统一错误信息提取。
 */
import { dumpHaYaml, toItemList, parseOrchestratorYaml } from '@homeos/shared';
import { getErrorMessage } from '../../common/utils';

/** 联动器 YAML 序列化选项：行宽 120 字符，避免过早折行。 */
const ORCHESTRATOR_YAML_DUMP_OPTS = { lineWidth: 120 } as const;

/**
 * 将对象序列化为联动器 YAML 字符串。
 *
 * @param obj 待序列化对象
 * @returns YAML 字符串
 */
export function dumpOrchestratorYaml(obj: Record<string, unknown>): string {
  return dumpHaYaml(obj, ORCHESTRATOR_YAML_DUMP_OPTS);
}

// ── 以 @homeos/shared 为真相源：toItemList（原名 toUnknownList）与 parseOrchestratorYaml（原名 loadHaYamlObject）已上移至 shared ──
export { toItemList, parseOrchestratorYaml };

/**
 * 校验字符串是否可被解析为合法 YAML。
 *
 * @param yamlStr 待校验 YAML 字符串
 * @returns valid 是否通过；message 校验结果描述文案
 */
export function validateYamlParsable(yamlStr: string): { valid: boolean; message: string } {
  try {
    // 解析返回 null 视为内容缺失或格式异常
    if (!parseOrchestratorYaml(yamlStr)) return { valid: false, message: 'YAML 解析失败' };
    return { valid: true, message: '结构校验通过' };
  } catch (e: unknown) {
    return { valid: false, message: getErrorMessage(e) || 'YAML 无效' };
  }
}

/**
 * script / automation HA Config 转 YAML 时的公共头部
 *
 * 生成包含 alias / mode（可选 description）的头部对象，
 * alias 缺省回退到 id，mode 缺省默认 'single'（HA 默认模式）。
 *
 * @param config HA 配置对象
 * @returns YAML 头部对象
 */
export function buildAliasModeYamlHeader(config: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    alias: config.alias || config.id,
    mode: config.mode || 'single',
  };
  if (config.description) obj.description = config.description;
  return obj;
}