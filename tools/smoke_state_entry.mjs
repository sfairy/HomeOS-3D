/**
 * `utils/state-entry.js` 的契约冒烟：把「状态文本归一」的边界写死成用例。
 *
 * 为什么需要它：`stateTextOf` 取 `?? ""` 而不是 `|| ""`，这个差别只在
 * `state` 为 `0` / `false` 时显形 —— 而这正是 HA 开关量的两种常见写法。
 * 改回 `|| ""` 不会让任何页面报错，只会让离线设备悄悄显示成「未知」。
 * 归一逻辑本身散落过 20 处副本，如今只此一份，所以把判据也钉在这里。
 *
 * Usage:
 *   node tools/smoke_state_entry.mjs            # 通过则 0
 *   node tools/smoke_state_entry.mjs --quiet
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quiet = process.argv.includes("--quiet");

const entry = pathToFileURL(
  path.join(ROOT, "frontend/static/utils/state-entry.js")
).href;
const { normalizedTextOf, stateTextOf } = await import(`${entry}?smoke=${Date.now()}`);

/* --------------------------------------------------------------- 用例表 ---- */

/** 归一文本：去首尾空白 + 转小写，非字符串先 String()。 */
const NORMALIZED_CASES = [
  ["  ON  ", "on", "首尾空白与大小写都吃掉"],
  ["Idle", "idle", "只转小写，不改词"],
  ["   ", "", "纯空白等于没上报"],
  ["", "", "空串原样"],
  [0, "0", "数字 0 是有效读数"],
  ["0", "0", "字符串 0 是有效读数"],
  [false, "false", "布尔 false 是有效读数"],
  [NaN, "nan", "NaN 走 String()"],
  [null, "", "null 归成空串"],
  [undefined, "", "undefined 归成空串"],
  [[], "", "空数组 String() 后是空串"],
  [{}, "[object object]", "对象走 String()，大小写已归一"]
];

/** 状态对象 → 状态文本。第三列列出该行必须与之不同的另一形态。 */
const STATE_CASES = [
  [{ state: "  AUTO " }, "auto", null, "常规归一"],
  [{ state: 0 }, "0", { state: "" }, "0 不能塌成空串"],
  [{ state: 0 }, "0", { state: "off" }, "0 不等于 off"],
  [{ state: 1 }, "1", null, "1 是有效读数"],
  [{ state: false }, "false", { state: "" }, "false 不能塌成空串"],
  [{ state: null }, "", null, "null 是没上报"],
  [{ state: "on" }, "on", null, "字符串原样小写"],
  [{ newState: { state: "on" } }, "on", null, "变更对象要剥壳"],
  [{ newState: { state: 0 } }, "0", null, "剥壳后同样保留 0"],
  [{}, "", null, "缺 state 字段"],
  [null, "", null, "整个入参为空"],
  [undefined, "", null, "整个入参没给"]
];

/* ---------------------------------------------------------------- 断言 ---- */

/** 失败信息里把用例输入写成人能读的样子：`JSON.stringify(NaN)` 会印成 `null`。 */
function describe(value) {
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (value === undefined) return "undefined";
  return JSON.stringify(value) ?? String(value);
}

const problems = [];

for (const [input, expected, why] of NORMALIZED_CASES) {
  let actual;
  try {
    actual = normalizedTextOf(input);
  } catch (error) {
    problems.push(`normalizedTextOf(${describe(input)}) 抛异常 —— ${error.message}`);
    continue;
  }
  if (actual !== expected) {
    problems.push(
      `normalizedTextOf(${describe(input)}) 得到 ${describe(actual)}，期望 ${describe(expected)}（${why}）`
    );
    continue;
  }
}

for (const [input, expected, mustDifferFrom, why] of STATE_CASES) {
  let actual;
  try {
    actual = stateTextOf(input);
  } catch (error) {
    problems.push(`stateTextOf(${describe(input)}) 抛异常 —— ${error.message}`);
    continue;
  }
  if (actual !== expected) {
    problems.push(
      `stateTextOf(${describe(input)}) 得到 ${describe(actual)}，期望 ${describe(expected)}（${why}）`
    );
    continue;
  }
  if (mustDifferFrom && stateTextOf(mustDifferFrom) === actual) {
    problems.push(
      `stateTextOf(${describe(input)}) 与 ${describe(mustDifferFrom)} 都归成 ${describe(actual)}，应可区分（${why}）`
    );
    continue;
  }
}

// stateTextOf 必须是「剥壳 + 归一」的组合，不允许自己再实现一遍归一。
for (const [input] of STATE_CASES) {
  const composed = normalizedTextOf(input?.newState?.state ?? input?.state);
  if (stateTextOf(input) !== composed) {
    problems.push(`stateTextOf 没有复用 normalizedTextOf —— ${describe(input)}`);
  }
}

/* ---------------------------------------------------------------- 汇总 ---- */

if (quiet) {
  process.exit(problems.length ? 1 : 0);
}
if (problems.length) {
  for (const problem of problems) console.log(`FAIL: ${problem}`);
  console.log(`\n${problems.length} 项问题`);
  process.exit(1);
}
console.log(`  ${NORMALIZED_CASES.length} 条归一用例、${STATE_CASES.length} 条状态用例全部符合`);
console.log('  边界分得清：state 0 → "0"、false → "false"、null/缺省 → ""');
console.log("\nOK: 状态文本归一只此一份，且 0 / false / 缺省三种边界互不塌陷。");
