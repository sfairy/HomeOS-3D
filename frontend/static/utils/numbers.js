/**
 * 数值夹取：把「夹到区间内」与「非法值怎么办」拆成四个各自有名字的契约。
 *
 * 位置：`utils/` 下的纯工具，被编辑器（`home.js` / `editor-utils.js`）、
 *   3D 工作室（`studio-normalization.js` / `studio-curtain-track.js` / `export-presets.js`）
 *   与运行时渲染器（`renderer/registry.js`）引用。
 *
 * 为什么要有这个文件：这些地方原本各自定义了一个叫 `clampNumber` 的函数 —— 名字一样、
 *   参数顺序不一样、对「非法值」的处理更是三种（分别把空串当 0、当「未设置」、当非法）。
 *   这是 4.3 B 类「同名不同义」里最危险的一种：照着名字换一个实现去调用，参数错位时
 *   **不会报错**，只会把下限当成兜底值静默用下去（例如 `clampNumber(v, 0, 100)` 在
 *   四参版本里意味着「兜底 0」，而调用者以为是「夹到 0~100」）。
 *   现在四个函数的参数顺序统一为 `(值, 下限, 上限[, 兜底])`，而叫 `clampNumber` 的
 *   只剩「纯夹取」这一个 —— 名字即契约。
 *
 * 契约对照（每行只有「非法值」这一列不同）：
 *
 *   | 函数 | 数字字符串 | `null` / `""` | 其他（`NaN` / 对象 …） |
 *   | --- | --- | --- | --- |
 *   | `clampNumber`         | 按数字用 | 交给 `Math`（→ 0） | 结果是 `NaN`（原样传播） |
 *   | `clampCoercedNumber`  | 按数字用 | 按 0 用 | 用兜底值 |
 *   | `clampOptionalNumber` | 按数字用 | 视为「未设置」→ 兜底值 | 用兜底值 |
 *   | `clampTypedNumber`    | **算非法** | 用兜底值 | 用兜底值 |
 *
 * 兜底值本身另有一条口径差异（**已按原语义各自保留**，见下表最后一行）：注册表那份的兜底
 *   与值走同一次夹取，所以它不能用 `null` 这类区间外的哨兵当兜底；可选与严格那两份的兜底
 *   原样返回。统一这条口径会改变 `renderer/registry.js` 的运行语义（那里 190 处调用里有 20 处
 *   兜底是表达式、不是字面量），因此不在「同名不同义」这一批里顺手改。
 *
 *   | 函数 | 兜底值是否参与夹取 |
 *   | --- | --- |
 *   | `clampCoercedNumber`  | **参与**（区间外的兜底会被夹进区间） |
 *   | `clampOptionalNumber` | 不参与，原样返回 |
 *   | `clampTypedNumber`    | 不参与，原样返回 |
 */

/**
 * 纯夹取：把数值夹到 `[minimum, maximum]`，不做换算、也不兜底。
 *
 * 只该用在**已经确认是数字**的地方（例如刚从 `Number()` / `finite()` 出来的值）。
 * 输入不是数字时按 `Math` 的规则走：`""` 与 `null` 会被当成 0，`NaN` 会一路传播成
 * `NaN` —— 后者是有意的：静默换一个数比冒出一个 NaN 更难查。
 *
 * @param {number|string} value 待夹取的值。
 * @param {number} minimum 下限。
 * @param {number} maximum 上限。
 * @returns {number} 夹取后的值。
 */
export function clampNumber(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * 先换算再夹取：`Number(value)` 之后是有限数就夹，否则用兜底值。
 *
 * 注意 `Number("")` 与 `Number(null)` 都是 0 —— 这个契约把空值当成 0（对「文档里存的是
 * 字符串」那类调用点是想要的）；要把空值当「未设置」，用 `clampOptionalNumber`。
 * 也要注意**兜底值会跟着夹一次**（与另外两个带兜底的函数不同，见模块头的口径表）：
 * 所以区间外的哨兵（`null` 表示「没设过」）不能交给这个函数。原注册表里的注释写的是
 * 「兜底值本身不参与夹取」，与实现相反；这里以**实现**（也就是既有行为）为准。
 *
 * @param {*} value 待处理的值。
 * @param {number} minimum 下限。
 * @param {number} maximum 上限。
 * @param {number} fallback 换算后不是有限数时使用的兜底值。
 * @returns {number} 夹取后的值或兜底值。
 */
export function clampCoercedNumber(value, minimum, maximum, fallback) {
  const parsedValue = Number(value);
  return Math.max(
    minimum,
    Math.min(maximum, Number.isFinite(parsedValue) ? parsedValue : fallback)
  );
}

/**
 * 空值感知的夹取：`null` / `undefined` / 空串视为「未设置」，直接回落兜底值。
 *
 * 为什么不能直接用 `clampCoercedNumber`：`Number("")` 是 0，而 0 是个合法值 ——
 * 窗帘参数里 `curtainPreview: ""` 会被静默当成「预览 0%」，那是合法但错误的默认值。
 * 数字字符串仍然认（`"1.5"` 按 1.5 用），因为这类值来自服务端与文档的文本字段。
 * 兜底值原样返回，不参与夹取 —— 它可能是区间外的哨兵。
 *
 * @param {*} value 待处理的值。
 * @param {number} minimum 下限。
 * @param {number} maximum 上限。
 * @param {number} fallback 未设置或非法时使用的兜底值。
 * @returns {number} 夹取后的值或兜底值。
 */
export function clampOptionalNumber(value, minimum, maximum, fallback) {
  // 空串与 null 都视为「未设置」：Number("") 会得到 0，那是个合法但错误的默认值。
  const parsedValue = value == null || value === "" ? NaN : Number(value);
  if (Number.isFinite(parsedValue)) {
    return Math.max(minimum, Math.min(maximum, parsedValue));
  } else {
    return fallback;
  }
}

/**
 * 只认真正的数字：`typeof value === "number"` 且有限才夹，其余（含数字字符串）一律回落。
 *
 * 用在「值只可能是我们自己写进去的 number」的地方：这时字符串不是「另一种写法」，
 * 而是文档坏了 —— 与其猜它想表达什么，不如用默认值。兜底值原样返回，不参与夹取
 * （`null` 在这里是合法兜底：调用方要区分「没设过」与「设成了 0」）。
 *
 * @param {*} value 待处理的值。
 * @param {number} minimum 下限。
 * @param {number} maximum 上限。
 * @param {*} fallback 非数字时使用的兜底值（可以是 `null` 这类哨兵）。
 * @returns {number|null} 夹取后的值或兜底值。
 */
export function clampTypedNumber(value, minimum, maximum, fallback) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}
