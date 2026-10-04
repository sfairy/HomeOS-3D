/**
 * 联动器动作序列执行工具
 *
 * 职责：
 *   - 提供家庭模式等家居执行链路共用的动作序列执行能力
 *   - 支持"无延时的动作并发批量执行"与"带延时的动作串行执行"混合调度
 *   - 统一延时单位换算（毫秒）
 * 关键依赖：../utils（getErrorMessage 用于捕获批量执行失败原因；sleep 用于动作间延时）
 */
import { getErrorMessage } from '../../common/utils';
import { sleep } from '../../common/utils/sleep.util';

/** 动作延时单位：脚本 YAML 遵循 HA 秒；场景/家庭模式配置为毫秒 */
type ActionDelayUnit = 'seconds' | 'milliseconds';

/**
 * 将延时值统一换算为毫秒
 *
 * @param delay 原始延时值（缺省或非有效数字返回 0）
 * @param unit 延时单位（'seconds' 按 HA 脚本规范换算为毫秒，'milliseconds' 原样返回）
 * @returns 毫秒数；非正数或非有限数返回 0，避免触发无效 setTimeout
 */
function delayToMs(
  delay: number | undefined,
  unit: ActionDelayUnit = 'milliseconds',
): number {
  if (typeof delay !== 'number' || delay <= 0 || !Number.isFinite(delay)) return 0;
  return unit === 'seconds' ? delay * 1000 : delay;
}

/**
 * 异步睡眠指定毫秒数。
 *
 * 复用 common/utils 的统一 sleep，保持各处退避/间隔语义一致。
 *
 * @param ms 毫秒数；非正数立即返回
 */
async function sleepMs(ms: number): Promise<void> {
  await sleep(ms);
}

/** 动作序列项通用结构：包含可选延时（用于在执行该动作前进行等待） */
interface ActionSequenceItem {
  delay?: number;
}

/** 单个动作执行结果 */
interface ActionExecutionResult {
  /** HA 实体 ID（如 light.xxx） */
  entity_id: string;
  /** 触发的 HA 服务（如 turn_on） */
  service: string;
  /** 是否执行成功 */
  success: boolean;
  /** 失败时的错误描述 */
  error?: string;
}

/**
 * 批量并发 + 延时串行执行动作序列（场景/家庭模式等共用）
 *
 * 算法说明：
 *   - 按顺序扫描 items，把"无延时"的连续动作组成一批，使用 Promise.allSettled 并发执行
 *   - 遇到带延时（delay > 0）的动作时：先按延时等待，再单独串行执行该动作
 *   - 这样既保证并发性能，又满足延时顺序的语义
 *   - 失败动作不会中断后续动作（allSettled 捕获所有结果）
 *
 * @param items 动作序列
 * @param executeOne 单个动作执行回调，返回结构化执行结果
 * @param delayUnit 延时单位（默认毫秒）
 * @returns 与 items 顺序对齐的执行结果数组
 */
export async function executeActionSequence<T extends ActionSequenceItem>(
  items: T[],
  executeOne: (item: T) => Promise<ActionExecutionResult>,
  delayUnit: ActionDelayUnit = 'milliseconds',
): Promise<ActionExecutionResult[]> {
  const results: ActionExecutionResult[] = [];
  let i = 0;

  while (i < items.length) {
    // 收集连续的"无延时"动作作为一批，并发触发
    const batch: T[] = [];
    while (i < items.length && (!items[i].delay || items[i].delay === 0)) {
      batch.push(items[i]);
      i++;
    }

    if (batch.length > 0) {
      // allSettled：单条失败不影响批次内其它动作
      const batchResults = await Promise.allSettled(batch.map((item) => executeOne(item)));
      for (const r of batchResults) {
        results.push(
          r.status === 'fulfilled'
            ? r.value
            : {
                entity_id: 'unknown',
                service: 'unknown',
                success: false,
                error: getErrorMessage(r.reason),
              },
        );
      }
    }

    // 处理当前位置的延时动作：先等待延时，再串行执行
    if (i < items.length) {
      const item = items[i];
      if (item.delay && item.delay > 0) {
        await sleepMs(delayToMs(item.delay, delayUnit));
      }
      results.push(await executeOne(item));
      i++;
    }
  }

  return results;
}