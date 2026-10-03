/**
 * @module shared/ha
 * @file config-flow.util.ts
 * @brief HA Config Entry Flow / Options Flow 多步表单驱动器。
 *
 * 职责：
 *  - 解析 HA Config Flow 各步骤类型（form / menu / create_entry / abort / progress）；
 *  - 根据步骤类型自动从用户配置中提取表单字段或菜单选项并提交；
 *  - 走完整个多步流程并返回 create_entry 结果（entry_id / title）。
 *
 * 关键依赖：
 *  - BusinessException / ErrorCode：统一业务异常（来自 ../utils）；
 *  - API_ERROR：错误消息常量（来自 ../errors/api-error-messages）。
 *
 * 注意：flow_id / step_id / next_step_id / menu_options 等均为 HA 原生字段名，不翻译。
 */
/** HA Config Entry Flow 步骤类型 */
import { BusinessException, ErrorCode } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';

/**
 * HA Config Flow 单步描述。
 * 对应 HA /api/config/config_entries/flow/{flow_id} 的响应结构。
 */
export type HaFlowStep = {
  /** 步骤类型：form（表单）/ menu（菜单选择）/ create_entry（完成）/ abort（中止）/ progress（进行中）等 */
  type: 'form' | 'menu' | 'create_entry' | 'abort' | 'progress' | 'progress_done' | string;
  /** 流程 ID */
  flow_id?: string;
  /** 当前步骤 ID */
  step_id?: string;
  /** menu 类型步骤的可选项列表 */
  menu_options?: string[];
  /** form 类型步骤的字段 schema */
  data_schema?: Array<{
    name?: string;
    type?: string;
    schema?: unknown[];
    description?: { suggested_value?: unknown };
    default?: unknown;
  }>;
  /** 是否为最后一步（form 类型） */
  last_step?: boolean;
  /** abort 类型步骤的中止原因 */
  reason?: string;
  /** create_entry 类型步骤的结果 */
  result?: { entry_id?: string; title?: string };
  /** form 类型步骤的字段级错误映射 */
  errors?: Record<string, string>;
  /** 其他消息文本 */
  message?: string;
};

/**
 * 菜单步骤中可能使用的字段名集合。
 * 不同 HA 版本可能用不同字段名携带菜单选择，统一识别后消费。
 */
const MENU_KEYS = new Set(['group_type', 'next_step_id', 'menu_option']);

/**
 * 提取 form 步骤 data_schema 中的字段名集合。
 *
 * @param step 当前流程步骤。
 * @returns 字段名 Set；若 data_schema 不存在则返回 null（表示接受任意字段）。
 */
function schemaFieldNames(step: HaFlowStep): Set<string> | null {
  const schema = step.data_schema;
  if (!Array.isArray(schema)) return null;
  const names = new Set<string>();
  for (const field of schema) {
    if (field?.name) names.add(field.name);
  }
  return names;
}

/**
 * 处理 menu 类型步骤：从用户配置中提取菜单选择项。
 *
 * @param step 当前 menu 步骤。
 * @param remaining 用户剩余未消费的配置（会从中删除已消费的菜单字段）。
 * @returns 选中的菜单选项 ID。
 * @throws BusinessException 若未找到任何菜单选择字段。
 */
function handleMenuStep(step: HaFlowStep, remaining: Record<string, unknown>): string {
  let choice: string | undefined;
  // 按 MENU_KEYS 顺序查找用户配置中携带的菜单选择
  for (const key of MENU_KEYS) {
    if (key in remaining) {
      choice = String(remaining[key]);
      Reflect.deleteProperty(remaining, key);
      break;
    }
  }
  if (!choice) {
    const opts = step.menu_options?.join(', ') || '未知';
    throw new BusinessException(
      ErrorCode.VALIDATION_FAILED,
      API_ERROR.HA_FLOW_MENU_CHOICE_REQUIRED(opts),
    );
  }
  return choice;
}

/**
 * 处理 form 类型步骤：从用户配置中提取表单字段值。
 *
 * @param step 当前 form 步骤。
 * @param remaining 用户剩余未消费的配置（会从中删除已消费的字段）。
 * @returns 提交给 HA 的表单数据。
 * @throws BusinessException 若步骤包含字段级错误（errors 非空）。
 */
function handleFormStep(
  step: HaFlowStep,
  remaining: Record<string, unknown>,
): Record<string, unknown> {
  // 步骤返回了字段级校验错误，直接抛出供前端展示
  if (step.errors && Object.keys(step.errors).length > 0) {
    const detail = Object.entries(step.errors)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    throw new BusinessException(
      ErrorCode.VALIDATION_FAILED,
      API_ERROR.HA_FLOW_FORM_VALIDATION_FAILED(detail),
    );
  }
  const fields = schemaFieldNames(step);
  const formData: Record<string, unknown> = {};
  if (fields === null) {
    // 无 schema 时接受所有非菜单字段
    for (const key of Object.keys(remaining)) {
      if (MENU_KEYS.has(key)) continue;
      formData[key] = remaining[key];
      Reflect.deleteProperty(remaining, key);
    }
    return formData;
  }
  // 有 schema 时仅接受 schema 中声明的字段，避免提交多余数据
  for (const key of Object.keys(remaining)) {
    if (MENU_KEYS.has(key)) continue;
    if (fields.has(key)) {
      formData[key] = remaining[key];
      Reflect.deleteProperty(remaining, key);
    }
  }
  return formData;
}

/**
 * 流程步骤提交函数类型。
 * 由调用方提供，负责将 payload POST 到 HA 并返回下一步骤。
 */
type FlowSubmitFn = (
  flowId: string,
  payload: Record<string, unknown>,
) => Promise<HaFlowStep>;

/**
 * 走完多步 Config/Options Flow，返回 create_entry 结果。
 *
 * @param flowId 流程 ID。
 * @param initialStep 首步骤（通常为 form 或 menu）。
 * @param config 用户提供的配置数据（按字段名 / 菜单选项匹配）。
 * @param submitStep 步骤提交回调。
 * @param maxSteps 最大步数守卫，默认 10，防止无限循环。
 * @returns create_entry 结果 { entry_id?, title? }。
 * @throws BusinessException 流程被中止、步骤类型不支持或超过最大步数时抛出。
 */
/** 走完多步 Config/Options Flow，返回 create_entry 结果 */
export async function runHaConfigFlow(
  flowId: string,
  initialStep: HaFlowStep,
  config: Record<string, unknown>,
  submitStep: FlowSubmitFn,
  maxSteps = 10,
): Promise<{ entry_id?: string; title?: string }> {
  const remaining = { ...config };
  let current = initialStep;
  let lastMenuChoice: string | null = null;

  for (let i = 0; i < maxSteps; i++) {
    const type = current.type;
    // 分支：流程完成，返回结果
    if (type === 'create_entry') {
      return current.result || {};
    }
    // 分支：流程被 HA 中止
    if (type === 'abort') {
      throw new BusinessException(
        ErrorCode.EXTERNAL_ERROR,
        API_ERROR.HA_FLOW_ABORTED(current.reason || '未知'),
      );
    }
    // 分支：菜单选择步骤
    if (type === 'menu') {
      lastMenuChoice = handleMenuStep(current, remaining);
      current = await submitStep(flowId, { next_step_id: lastMenuChoice });
      continue;
    }
    // 分支：表单步骤
    if (type === 'form') {
      const formData = handleFormStep(current, remaining);
      current = await submitStep(flowId, formData);
      continue;
    }
    // 分支：未知的步骤类型
    throw new BusinessException(
      ErrorCode.EXTERNAL_ERROR,
      API_ERROR.HA_FLOW_STEP_UNSUPPORTED(String(type)),
    );
  }
  // 超过最大步数仍未完成，防止死循环
  throw new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_FLOW_MAX_STEPS(maxSteps));
}