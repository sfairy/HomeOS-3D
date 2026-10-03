/**
 * 告警规则条件求值器（纯函数，不使用 eval）
 *
 * 所属模块：backend/src/common/utils
 * 职责：
 *   - 将 HA 实体状态 + 属性代入告警规则表达式，求出是否触发；
 *   - 支持复合表达式 `A && B || C`：`||` 切分为 OR 组，组内按 `&&` 切分为 AND；
 *   - 支持单子条件：`> 30` / `== on` / `= on` / `attr:brightness > 100` / `contains motion`，
 *     左侧可显式 `state|value` 或 `attr:<attrName>` 指定取值来源（默认 state）；
 *   - 数值两侧都能解析时按数值比较，否则按字符串比较；`contains` 走包含判定；
 *   - `=` 为 `==` 的别名（兼容用户手写与参考实现 equals 语义）。
 * 关键依赖：无外部依赖，纯函数，可在告警评估热路径反复调用。
 */
/**
 * 告警规则条件求值入口。
 * 支持复合：`A && B || C`（`||` 优先于 `&&` 的 OR 组，组内为 AND）
 * 单子条件："> 30" / "== on" / "= on" / "attr:brightness > 100" / "contains motion"
 *
 * @param condition  规则表达式
 * @param state      实体当前 state 字符串
 * @param attributes 实体属性字典，供 `attr:<name>` 引用
 * @returns 是否满足触发条件
 */
export function evaluateCondition(
  condition: string,
  state: string,
  attributes?: Record<string, unknown>,
): boolean {
  if (!condition) return false;
  const expr = condition.trim();
  const orParts = expr
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean);
  if (orParts.length > 1) {
    return orParts.some((part) => evaluateAndGroup(part, state, attributes));
  }
  return evaluateAndGroup(expr, state, attributes);
}

/**
 * 求值 AND 组：按 `&&` 切分后逐项求值，全部为真才返回真。
 */
function evaluateAndGroup(
  expr: string,
  state: string,
  attributes?: Record<string, unknown>,
): boolean {
  const andParts = expr
    .split('&&')
    .map((s) => s.trim())
    .filter(Boolean);
  if (andParts.length > 1) {
    return andParts.every((part) => evaluateSingleCondition(part, state, attributes));
  }
  return evaluateSingleCondition(expr, state, attributes);
}

/**
 * 求值单个子条件：解析操作符与右值，左侧默认取 state，可用 `attr:<name>` 切换到属性。
 * 两边都能 parseFloat 时走数值比较，否则走字符串比较；`contains` 走子串包含。
 */
function evaluateSingleCondition(
  expr: string,
  state: string,
  attributes?: Record<string, unknown>,
): boolean {
  if (!expr) return false;
  let lhsRaw = state;
  let rest = expr;
  const attrMatch = expr.match(/^attr:([a-zA-Z0-9_]+)\s*(.*)$/);
  if (attrMatch) {
    const attrVal = attributes?.[attrMatch[1]];
    lhsRaw = attrVal == null ? '' : String(attrVal);
    rest = attrMatch[2].trim();
  } else {
    rest = expr.replace(/^(state|value)\s+/i, '');
  }

  const m = rest.match(/^(>=|<=|==|!=|>|<|=|contains)\s*(.+)$/i);
  if (!m) {
    return lhsRaw.toLowerCase() === expr.toLowerCase();
  }
  const op = m[1].toLowerCase();
  const rhs = m[2].trim().replace(/^['"]|['"]$/g, '');

  const lhsNum = parseFloat(lhsRaw);
  const rhsNum = parseFloat(rhs);
  const bothNumeric = !Number.isNaN(lhsNum) && !Number.isNaN(rhsNum);

  if (op === 'contains') {
    return lhsRaw.toLowerCase().includes(rhs.toLowerCase());
  }
  // 两侧都能解析为数值时按数值比较（供能源/自动化等多处复用同一口径）
  if (bothNumeric) return compareNumeric(lhsNum, op, rhsNum);

  switch (op) {
    case '==':
    case '=':
      return lhsRaw.toLowerCase() === rhs.toLowerCase();
    case '!=':
      return lhsRaw.toLowerCase() !== rhs.toLowerCase();
    default:
      return false;
  }
}

/**
 * 数值比较器：按操作符比较两个数值。
 *
 * 与 evaluateCondition 共用同一套操作符语义，避免自动化引擎等调用方各自维护一份 switch
 * 而产生 `=` / `==` 别名或 `!=` 语义漂移。
 *
 * @param lhs 左值
 * @param op 操作符（> >= < <= == = !=）
 * @param rhs 右值
 * @returns 是否满足；未知操作符返回 false
 */
export function compareNumeric(lhs: number, op: string, rhs: number): boolean {
  switch (op) {
    case '>':
      return lhs > rhs;
    case '>=':
      return lhs >= rhs;
    case '<':
      return lhs < rhs;
    case '<=':
      return lhs <= rhs;
    case '==':
    case '=':
      return lhs === rhs;
    case '!=':
      return lhs !== rhs;
    default:
      return false;
  }
}
