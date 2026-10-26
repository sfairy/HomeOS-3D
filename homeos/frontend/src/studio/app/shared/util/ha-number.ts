/**
 * HA 数值格式化：把「HA 侧设定的显示精度」带到 3D 舞台与各类面板。
 *
 * 精度有两个来源（HA 的 ``options.sensor``）：
 * - ``displayPrecision``：用户显式设定，优先级最高；
 * - ``suggestedDisplayPrecision``：HA 依 ``device_class`` 给出的建议值，只在上面缺省时回落。
 * 两者都没有（``null``）时**不做任何格式化**，原样显示 —— 所以这里不能拿 0 当默认值。
 *
 * 为什么放在 ``app/shared/util``：消费方横跨 ``app/bridge``（温湿度标签）与
 * ``runtime/*``（面板、舞台），而 ``app/**`` 不能反向 import ``runtime/**``，
 * 只有共享工具层两边都能用。
 */

/** 精度合法区间；超出即视为脏数据（与 HA 前端的约束一致）。 */
const MIN_DISPLAY_PRECISION = 0;
const MAX_DISPLAY_PRECISION = 100;

/** 只有这些域会走「按精度格式化」的路径。 */
const NUMERIC_ENTITY_DOMAIN_PATTERN = /^(sensor|number|input_number)\./;

/** 这些 ``device_class`` 的 ``state`` 不是可格式化数值（时间戳 / 日期 / 枚举）。 */
const NON_NUMERIC_DEVICE_CLASSES = new Set(["timestamp", "date", "enum"]);

/** 可格式化数值的字符串形态：整数、小数、科学计数法，允许前后符号与前导小数点。 */
const NUMERIC_STATE_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** ``-0`` / ``-0.00`` 这类负零：``toFixed`` 之后要露出符号，得单独抹掉。 */
const NEGATIVE_ZERO_PATTERN = /^-0(?:\.0+)?$/;

/** 一条实体记录的精度来源（API 的 camelCase 输出）。 */
type PrecisionSource = {
  displayPrecision?: unknown;
  suggestedDisplayPrecision?: unknown;
};

/** 精度是否可用：必须是整数且在 0–100 之间（``bool`` / 小数 / 字符串一律不认）。 */
function isDisplayPrecision(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_DISPLAY_PRECISION &&
    value <= MAX_DISPLAY_PRECISION
  );
}

/**
 * 取一条实体的有效精度：``displayPrecision`` → ``suggestedDisplayPrecision`` → ``null``。
 *
 * 回落这一步不能省：HA 里绝大多数传感器只带 suggested 值，用户没手动改过。
 */
function numberDisplayPrecision(entity: PrecisionSource | null | undefined): number | null {
  if (!entity) return null;
  if (isDisplayPrecision(entity.displayPrecision)) return entity.displayPrecision;
  if (isDisplayPrecision(entity.suggestedDisplayPrecision)) return entity.suggestedDisplayPrecision;
  return null;
}

/**
 * 生成「实体 → 精度」映射，供主窗口经 ``number-formats`` 消息推给舞台。
 *
 * 入参 ``metadataSource`` 既可能是 ``Map``（运行期实体目录），也可能是普通对象；
 * 只保留有有效精度的实体，否则舞台会把「无精度」误当成 0 位小数。
 */
export function entityNumberFormats(
  entityIds: readonly string[] = [],
  metadataSource: Map<string, any> | Record<string, any> | null | undefined,
): Record<string, number> {
  const formats: Record<string, number> = {};
  const lookup = (entityId: string) =>
    typeof (metadataSource as any)?.get === "function"
      ? (metadataSource as Map<string, any>).get(entityId)
      : (metadataSource as Record<string, any> | null | undefined)?.[entityId];
  for (const entityId of [...new Set(entityIds)].sort()) {
    if (!entityId) continue;
    const precision = numberDisplayPrecision(lookup(entityId));
    if (precision !== null) formats[entityId] = precision;
  }
  return formats;
}

/**
 * 按精度格式化一个数值。
 *
 * 任何一条前提不成立都**原样返回字符串**而不是报错或补 0：状态值可能是 ``unknown``、
 * ``"22.5 °C"`` 这类带单位文本、或空串，格式化它们只会把界面弄脏。
 */
export function formatHANumber(value: unknown, precision: number | null | undefined): string {
  const rawText = String(value ?? "");
  if (!isDisplayPrecision(precision)) return rawText;
  if (typeof value !== "string" && typeof value !== "number") return rawText;
  if (!NUMERIC_STATE_PATTERN.test(rawText.trim())) return rawText;
  if (!Number.isFinite(Number(value))) return rawText;
  const formatted = Number(value).toFixed(precision);
  return NEGATIVE_ZERO_PATTERN.test(formatted) ? formatted.slice(1) : formatted;
}

/**
 * 实体状态感知的格式化：只有数值域 + 非时间/日期/枚举才走精度。
 *
 * 与 :func:`formatHANumber` 的分工：那个只管「这个数怎么显示」，这个还要判断
 * 「这个实体该不该被当成数」。时间戳按精度格式化会变成一串小数字，因此必须挡在前面。
 */
export function formatEntityNumber(
  entityId: string | null | undefined,
  stateObject: any,
  precision: number | null | undefined,
): string {
  const resolvedState = stateObject?.newState || stateObject;
  const stateText = resolvedState?.state;
  if (!NUMERIC_ENTITY_DOMAIN_PATTERN.test(String(entityId || ""))) return String(stateText ?? "");
  if (NON_NUMERIC_DEVICE_CLASSES.has(resolvedState?.attributes?.device_class)) {
    return String(stateText ?? "");
  }
  return formatHANumber(stateText, precision);
}
