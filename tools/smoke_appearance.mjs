/**
 * 站点配色的冒烟测试：设计系统里唯一一段「算出来的颜色」必须一直是可用的。
 *
 * 为什么值得一个独立脚本：`design/scene/appearance.js` 的 deriveShades() 是全站唯一
 * 一处从任意十六进制推颜色的代码。它出错不会抛异常，只会让管理员选到的色看起来
 * 「脏一档」—— 没有测试的话，只有等真有人换过主控色才会发现，而那时改动早已合入。
 *
 * 三件事必须成立：
 *   1. 默认预设展开后与 design/scene/page.css 的 --hos-* 字面量逐字相等。
 *      否则「打开配色面板点一下保存」就会悄悄改掉默认外观 —— 这是这个功能最可能的坏法。
 *   2. 派生函数在极端输入下仍产出合法 hex（纯黑 / 纯白 / 纯灰都取不到 HSL 的亮度差）。
 *   3. 令牌名清单与展开结果一致（后端白名单直接用它，缺一项就会把那项挡在门外）。
 *   4. 两份后端白名单正则能接住每一枚令牌名。"两份"指的是 backend/core/appearance.py
 *      与 store/ops/appearance.py —— 两个服务各自独立构建，没有可共享的 Python 包，
 *      所以「哪些令牌可配」这条规则在仓库里存在三份（JS 一份、Python 两份）。
 *      这三份里唯一会走散的是两条正则：JS 那边加了新令牌，Python 正则没跟上，
 *      结果是**保存时被 422 挡回来**，而前端预览一切正常 —— 一个只在保存那一刻
 *      才出现、且看起来像「后端坏了」的故障。所以这里把 JS 的清单灌进 Python 的正则。
 *
 * Usage: node tools/smoke_appearance.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CONFIGURABLE,
  DEFAULT_PRESET,
  PRESETS,
  appearanceTokens,
  deriveShades,
  normalizeHex,
  presetTokens,
  tokensToCss,
  tokenNames,
} from "../design/scene/appearance.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_CSS = path.join(ROOT, "design", "scene", "page.css");

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  x ${message}`);
};
const ok = (message) => console.log(`  ok ${message}`);

/* 1. 从 page.css 读出 --hos-<color>(-bright|-deep|-rgb) 的字面量。 */
const css = fs.readFileSync(PAGE_CSS, "utf8");
const literal = {};
for (const match of css.matchAll(/--(hos-[a-z-]+):\s*([^;]+);/g)) {
  literal[`--${match[1]}`] = match[2].trim();
}

console.log("默认预设 vs design/scene/page.css");
const defaults = presetTokens(DEFAULT_PRESET);
for (const name of CONFIGURABLE) {
  for (const suffix of ["", "-bright", "-deep", "-rgb"]) {
    const token = `--hos-${name}${suffix}`;
    const expected = literal[token];
    if (!expected) {
      // page.css 里 -rgb 也写着字面量，与展开结果同为「通道三元组」。
      fail(`${token} 在 page.css 里找不到`);
      continue;
    }
    if (expected !== defaults[token]) {
      fail(`${token}: page.css=${expected} 展开=${defaults[token]}`);
    }
  }
}
if (!failures) ok("四个颜色的 base / bright / deep / rgb 全部逐字相等");

/* 商店侧镜像的 -text 必须等于 -bright，否则 tab / 徽标的文字色会比底亮一档而看不清。 */
for (const name of CONFIGURABLE) {
  if (defaults[`--hb-${name}-text`] !== defaults[`--hos-${name}-bright`]) {
    fail(`--hb-${name}-text 应等于 --hos-${name}-bright`);
  }
}

/* 2. 派生函数：极端输入。 */
console.log("deriveShades 极端输入");
const HEX = /^#[0-9a-f]{6}$/;
for (const input of ["#000000", "#ffffff", "#808080", "#ff0000", "#00ff00", "#0000ff", "#123456"]) {
  const shades = deriveShades(input);
  if (!HEX.test(shades.bright) || !HEX.test(shades.deep)) {
    fail(`${input} -> ${shades.bright} / ${shades.deep} 不是合法 hex`);
  }
}
ok("纯黑 / 纯白 / 纯灰 / 三原色都产出合法 hex");

console.log("normalizeHex 拒绝脏输入");
for (const bad of ["", "#abcd", "rgb(1,2,3)", "url(x)", "red", "--hos-accent", null, 42]) {
  if (normalizeHex(bad) !== null) fail(`${JSON.stringify(bad)} 应被拒绝`);
}
ok("长度不对 / 非十六进制 / 非字符串一律返回 null");

console.log("normalizeHex 接受并规范化合法输入");
for (const [input, expected] of [
  ["#ABC", "#aabbcc"],
  ["abc", "#aabbcc"],
  ["#AABBCC", "#aabbcc"],
  ["  #aabbcc  ", "#aabbcc"],
]) {
  if (normalizeHex(input) !== expected) fail(`${JSON.stringify(input)} -> ${normalizeHex(input)}，期望 ${expected}`);
}
ok("三位缩写会展开、大小写与空白会归一");

/* 3. 令牌清单与展开结果一致。 */
console.log("令牌清单");
const names = tokenNames();
const expanded = Object.keys(appearanceTokens(PRESETS[0].colors));
const missing = expanded.filter((name) => !names.includes(name));
const extra = names.filter((name) => !expanded.includes(name));
if (missing.length) fail(`tokenNames() 缺少：${missing.join(", ")}`);
if (extra.length) fail(`tokenNames() 多出：${extra.join(", ")}`);
if (new Set(names).size !== names.length) fail("令牌名有重复");
for (const name of names) {
  if (!name.startsWith("--hos-") && !name.startsWith("--hb-")) fail(`${name} 不是设计系统命名空间`);
}
ok(`${names.length} 枚令牌，命名空间正确且无重复`);

/* 4. 自定义主控色：只换 accent，其余三束光保持预设值。 */
console.log("自定义主控色");
const custom = appearanceTokens({ ...PRESETS[0].colors, accent: "#ff7ab8" });
if (custom["--hos-accent"] !== "#ff7ab8") fail("自定义主控色没生效");
if (custom["--hos-lumen"] !== PRESETS[0].colors.lumen) fail("换主控色不该动暖光");
if (!HEX.test(custom["--hos-accent-bright"]) || !HEX.test(custom["--hos-accent-deep"])) {
  fail("自定义主控色的派生档不是合法 hex");
}
if (!custom["--hb-accent-grad-hover"].includes("#ff7ab8")) fail("主按钮悬停渐变没跟上主控色");
ok("只影响主控色，且派生档与悬停渐变一起跟上");

/* 5. 样式表正文形状（后端把它原样写进响应体）。 */
const body = tokensToCss(defaults);
if (!body.startsWith("/*") || !body.includes("\n:root {\n") || !body.trimEnd().endsWith("}")) {
  fail("tokensToCss() 的响应体形状不对");
}
ok("tokensToCss() 产出可直接返回的 :root 样式表");

/*
 * 6. 两份后端白名单正则必须接住每一枚令牌名。
 *
 * 只读正则、不 import Python：这里要验证的正是「那条正则写得够不够宽」，
 * 起一个解释器再走一遍 pydantic 只能证明「我调用了它」，证明不了覆盖。
 * 唯一会走散的是正则本身，所以直接盯它。
 */
console.log("后端白名单覆盖");
const BACKENDS = [
  ["backend/core/appearance.py", "主应用中控"],
  ["store/ops/appearance.py", "商店"],
];
for (const [relative, label] of BACKENDS) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) {
    fail(`${relative}（${label}）不存在`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/_TOKEN_NAME = re\.compile\(\s*\n?\s*r?'([^']+)'/);
  if (!match) {
    fail(`${relative}：读不到 _TOKEN_NAME 正则`);
    continue;
  }
  let pattern;
  try {
    pattern = new RegExp(match[1]);
  } catch (error) {
    fail(`${relative}：_TOKEN_NAME 不是合法正则（${error.message}）`);
    continue;
  }
  // 白名单是「正则 ∪ 例外集合」。悬停渐变同时用两枚色，套不进按后缀分类的取值规则，
  // 所以两边都把它单列成 _TOKEN_NAME_EXTRA —— 漏读这一集合会把唯一一枚合法令牌
  // 报成越权（这个脚本第一版就是这么挂的，所以这段话留在这儿）。
  const extraMatch = source.match(/_TOKEN_NAME_EXTRA = frozenset\(\{([^}]*)\}\)/);
  const extra = extraMatch
    ? [...extraMatch[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1])
    : [];
  const allowed = (name) => pattern.test(name) || extra.includes(name);
  const rejected = names.filter((name) => !allowed(name));
  if (rejected.length) {
    fail(`${relative}（${label}）挡下了 ${rejected.length} 枚合法令牌：${rejected.slice(0, 4).join("、")}`);
    continue;
  }
  // 白名单必须也挡住构造出来的越权名：能过正则就说明那道墙是漏的。
  const escapes = [
    "--hos-accent} body{display:none",
    "--hos-accent:red",
    "--hos-accent-x",
    "--evil-token",
    "hos-accent",
  ];
  const leaked = escapes.filter((name) => allowed(name));
  if (leaked.length) {
    fail(`${relative}（${label}）放行了越权令牌名：${leaked.join("、")}`);
    continue;
  }
  const extraNote = extra.length ? `，另收 ${extra.length} 枚例外` : "";
  ok(`${relative}（${label}）放行全部 ${names.length} 枚${extraNote}、挡下 ${escapes.length} 种越权名`);
}

if (failures) {
  console.error(`\n${failures} 项不通过。`);
  process.exit(1);
}
console.log("\nOK: 预设与设计系统一致、派生函数健壮、令牌清单完整、后端白名单覆盖。");
