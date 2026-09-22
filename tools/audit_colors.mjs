/**
 * 全站配色审计（开发工具，**不进 CI**）。
 *
 * 为什么需要它：全站去注释、去白/黑叠加层后仍有约 2100 处颜色字面量，散在 19 个样式表里，
 * 且每套页面自成一个色板（编辑器一套中性石板、显示端另一套中性灰、舞台一套暖羊皮纸金、
 * 工作室一套中性灰绿）。这种规模的债务靠人眼看是收不动的 —— 改完一个文件，没有任何东西
 * 会告诉你「这一处颜色没走令牌」，因为它不报错、只是与旁边那一处差了 8 度。
 *
 * 它做四件事，前三件是**真值校验**（都应当是绿的），第四件是**债务度量**（用来定优先级）：
 *
 *   1. design/scene/ 的五个文件在三份分发副本里逐字节一致。
 *      这条曾是 check_scene_sync.mjs 的职责，那道护栏在上一轮整体移除，于是「改了
 *      canonical 忘了同步副本」重新变成一个静默失效点：改的人看到自己的页面变对了，
 *      另外两个部署（主应用入口页 / 商店）停在旧色上，且没有任何报错。
 *
 *   2. store/static/theme.css 的 --hb-* 与 design/scene/page.css 的 --hos-* 按镜像表逐 token 相等。
 *      theme.css 的文件头写着这条契约，但它是**手写**的，没有自动比对 —— 这正是过去
 *      两个色板能走散几个月的原因（改一侧，另一侧不知道）。
 *
 *   3. 颜色字面量与令牌同名（「这就是某个令牌的值，却写成了字面量」）。
 *      这类是最值得先修的：写成 var() 之后，管理员改主控色时它会跟着走；写成字面量时
 *      它留在旧色上，而同屏其余部分已经变色 —— 表现为「这个按钮看着有点旧」，没人会是
 *      先怀疑一个十六进制。
 *
 *   4. 每一对「前景令牌 × 背景令牌」的 WCAG 对比度，列出正文档（4.5:1）不达标的组合。
 *
 * ## 什么不算违规
 *
 * 白/黑叠加层（`#ffffff06`、`rgba(0,0,0,.58)`）是合法的：它们表达的是「往上叠一层光」
 * 而不是「这是品牌色」，且阴影/遮罩/发丝线本来就只能用透明度表达。`mask-image` 里的
 * `#000` / `#fff` 同理，它们是**遮罩停点**而非颜色（写 var() 反而会让遮罩失效）。
 * 这些一律归入 overlay 桶，不计入债务。
 *
 * 判不准的一律放过：令牌名不在镜像表里的（新增的临时令牌）、同一个值对应多个语义角色的
 * （`#ffd9a0` 既是 accent-bright 也可能是某处的一枚写死的暖色）。宁可漏报也不误报 ——
 * 这条底线与 check_invariants.mjs 一致。
 *
 * ## 用法
 *
 *   node tools/audit_colors.mjs            只读报告；真值校验失败才置退出码 1
 *   node tools/audit_colors.mjs --json     机器可读（给后续脚本消费）
 *
 * 债务度量（字面量数量、对比度）**刻意不置退出码**：它们在清扫期间本来就是红的，
 * 红着的闸门等于没有闸门，还会让人养成「反正它一直红」的习惯。真值校验则相反 ——
 * 它们平时是绿的，红了一定是这次改动弄坏了什么。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_MODE = process.argv.includes("--json");

const SKIP_DIRS = new Set([
  "vendor",
  "node_modules",
  ".venv",
  ".venv-store",
  ".extracted",
  "__pycache__",
  ".ruff_cache",
  ".git",
  "data"
]);

function* walk(dir, extensions) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full, extensions);
      continue;
    }
    if (!entry.isFile()) continue;
    if (extensions && !extensions.has(path.extname(entry.name))) continue;
    yield full;
  }
}

const rel = file => path.relative(ROOT, file).split(path.sep).join("/");
const read = file => fs.readFileSync(file, "utf8");

// ---------------------------------------------------------------------------
// 颜色解析与对比度
// ---------------------------------------------------------------------------

/** 三位 / 四位 / 六位 / 八位十六进制 → `{ r, g, b, a }`；`a` 是 0–1。无法解析返回 null。 */
function parseHex(raw) {
  const value = raw.trim().toLowerCase().replace(/^#/, "");
  let digits = value;
  if (digits.length === 3 || digits.length === 4) {
    digits = [...digits].map(char => char + char).join("");
  }
  if (digits.length !== 6 && digits.length !== 8) return null;
  if (!/^[0-9a-f]+$/.test(digits)) return null;
  const channel = index => Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16);
  return {
    r: channel(0),
    g: channel(1),
    b: channel(2),
    a: digits.length === 8 ? channel(3) / 255 : 1
  };
}

/**
 * `rgb()` / `rgba()` → `{ r, g, b, a }`。只认数字写法（本仓的派生色一律是
 * `rgba(255, 196, 106, 0.32)` 这种形式，`color-mix()` 那几处不参与对比度判定）。
 */
function parseRgbFunction(raw) {
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    raw.trim()
  );
  if (!match) return null;
  const channel = index => clamp255(Number.parseFloat(match[index]));
  return {
    r: channel(1),
    g: channel(2),
    b: channel(3),
    a: match[4] === undefined ? 1 : Math.min(1, Math.max(0, Number.parseFloat(match[4])))
  };
}

const clamp255 = value => Math.min(255, Math.max(0, Math.round(value)));

function parseColor(raw) {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.startsWith("#")) return parseHex(text);
  if (text.startsWith("rgb")) return parseRgbFunction(text);
  return null;
}

/** 把半透明前景压到不透明背景上，得到实际看到的颜色。 */
function composite(fg, bg) {
  if (fg.a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  const mix = channel => fg[channel] * fg.a + bg[channel] * (1 - fg.a);
  return { r: clamp255(mix("r")), g: clamp255(mix("g")), b: clamp255(mix("b")), a: 1 };
}

function relativeLuminance(color) {
  const channel = value => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** WCAG 对比度。两个入参都应当是不透明色（前景先经 composite）。 */
function contrast(fg, bg) {
  const first = relativeLuminance(fg);
  const second = relativeLuminance(bg);
  const [high, low] = first > second ? [first, second] : [second, first];
  return (high + 0.05) / (low + 0.05);
}

// ---------------------------------------------------------------------------
// 注释剥离
// ---------------------------------------------------------------------------

/**
 * 去掉 CSS 注释。
 *
 * 必须先剥再统计，否则注释里的色值会被当成活着的字面量。这个仓库的历史注释里**存着**
 * 大量已废弃的色值（theme.css 顶部那张被删掉的对照表就留着 `#050910` / `#0a1520` /
 * `#58bd93`），不剥的话统计出来的一半是历史存档。
 *
 * 不处理字符串里的 `/*`：CSS 里没有这种转义场景（`url()` 里不会出现裸 `/*`），
 * 引入引号状态机只会让这段更难核对。
 */
/**
 * 去掉 CSS 注释，**保留行号与字符偏移**（把注释内容换成等量空格，换行原样留下）。
 *
 * 与下面 stripScriptComments 同一套路，理由也一样：早期这里写的是
 * `replace(/\/\*…\*\//g, "")`，把整段注释真删掉 —— 于是调用方按换行数算出来的行号
 * 是「剥离后的行号」，与文件里真实的行号对不上。实测 renderer.css 报「行 3350」而
 * 实际在 3528：**一条都定位不到**，等于把报告里最有用的那一列作废了。
 * 保留偏移还有第二个好处：var() 兜底位是按下标区间标的，删字符会让后面的下标整体左移。
 */
const stripCssComments = text => text.replace(/\/\*[\s\S]*?\*\//g, match => blank(match));

/** 去掉 JS / HTML 行注释与块注释，以及 HTML 的 <!-- -->。 */
/**
 * 去掉注释，但**保留行数**。
 *
 * 这里每个被删掉的注释都要用等量的换行补回来 —— 否则调用方按「第 N 个换行」算出来的
 * 行号是「剥离后的行号」，与文件里真实的行号对不上，清单里报的位置根本找不到。
 * （这条是踩出来的：JS/HTML 段落报的行号曾经系统性偏小，因为文件头的块注释被整段删掉。）
 *
 * 补法统一走 `blank()`：把注释内容换成等量空格、内部换行原样留下，既抹掉内容又不动行结构。
 */
const blank = text => text.replace(/[^\n]/g, " ");

function stripScriptComments(text) {
  // HTML 注释：<!-- … -->（可能跨行）。注意结尾的 `-->` 也要占位，否则同一行的后续代码会左移。
  text = text.replace(/<!--[\s\S]*?-->/g, match => blank(match));
  // 块注释：/* … */
  text = text.replace(/\/\*[\s\S]*?\*\//g, match => blank(match));
  // 行注释：// …（前面不能是 `:` `"` `'` 反引号或反斜杠，避开 "https://" 与模板串里的 //）
  text = text.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (match, prefix) => prefix + blank(match.slice(prefix.length)));
  return text;
}

// ---------------------------------------------------------------------------
// 令牌解析
// ---------------------------------------------------------------------------

/**
 * 取一份样式表**第一个** `:root { … }` 块里的自定义属性。
 *
 * 只取第一个：`:root` 在 canonical 文件里是唯一的定义处，后面出现的 `:root` 都是
 * 覆盖片段（例如 display-boot.css 只能自带一份焦点环，它不引 --hos-*）。把后面那几个
 * 一并读进来会让「令牌表」这个概念失焦 —— 我们要比对的是那**一份**真值。
 */
function parseRootTokens(cssText) {
  const source = stripCssComments(cssText);
  const start = source.indexOf(":root");
  if (start === -1) return new Map();
  const open = source.indexOf("{", start);
  if (open === -1) return new Map();
  // 花括号配平：令牌值里可能出现 linear-gradient(…)，但不会出现裸 { }。
  let depth = 0;
  let end = -1;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end === -1) return new Map();

  const tokens = new Map();
  const body = source.slice(open + 1, end);
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!tokens.has(match[1])) tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/**
 * 把一个令牌值解析成字面量颜色：跟随 `var()` 链（`--hb-surface` → `--hb-sky-low` → `#081020`）。
 *
 * 三种写法都要认，缺一种就会**静默漏检**：
 *   ① 直接色值：`#081020`、`rgb(8, 16, 32)`
 *   ② 纯别名：`var(--hb-sky-low)`
 *   ③ 通道三元组拼接：`rgba(var(--hos-muted-rgb), 0.64)` —— 本仓所有半透明派生色都是这个形状。
 *      第一版只认 ①②，于是 `--hos-muted` 整个解析不出来、被当成「无法比对」跳过，
 *      而它正是实测在 sky-haze 上只有 4.13:1 的那一枚（一条真实的超标就这样漏掉了）。
 *
 * `depth` 是环检测：本仓有 `--hb-danger-line: var(--hb-alert-line)` 这类正常的转发，
 * 链长不超过三层；超过八层一定是有人写出了环（`--a: var(--b)` + `--b: var(--a)`），
 * 那时返回 null 让调用方按「解析不了」处理，而不是栈溢出。
 */
function resolveColor(name, tokens, depth = 0) {
  if (depth > 8) return null;
  const raw = tokens.get(name);
  if (raw === undefined) return null;
  const direct = parseColor(raw);
  if (direct) return { color: direct, from: name };

  const reference = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]+))?\)$/.exec(raw.trim());
  if (reference) {
    const resolved = resolveColor(reference[1], tokens, depth + 1);
    if (resolved) return resolved;
    if (reference[2]) {
      const fallback = parseColor(reference[2].trim());
      if (fallback) return { color: fallback, from: name };
    }
    return null;
  }

  return resolveTripletComposite(raw, tokens, depth) ?? null;
}

/**
 * `rgba(var(--x-rgb), 0.64)` → 一个带 alpha 的颜色。
 *
 * `--x-rgb` 的值是 `186, 214, 232` 这样的裸三元组（故意不带 `rgb()`，好让各处能自由
 * 拼出不同 α 的派生色），parseColor 认不出来，所以这里单独解析。
 */
function resolveTripletComposite(raw, tokens, depth) {
  const match = /^rgba?\(\s*var\(\s*(--[\w-]+)\s*\)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    raw.trim()
  );
  if (!match) return null;
  const triplet = tokens.get(match[1]);
  if (triplet === undefined) return null;
  const channels = parseTriplet(triplet);
  if (!channels) return null;
  const alpha = match[2] === undefined ? 1 : Math.min(1, Math.max(0, Number.parseFloat(match[2])));
  return { color: { ...channels, a: alpha }, from: match[1] };
}

/** `186, 214, 232` → `{ r, g, b }`。 */
function parseTriplet(raw) {
  const match = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/.exec(raw);
  if (!match) return null;
  return { r: clamp255(Number(match[1])), g: clamp255(Number(match[2])), b: clamp255(Number(match[3])) };
}

// ---------------------------------------------------------------------------
// 1) 三份分发副本逐字节一致
// ---------------------------------------------------------------------------

/**
 * canonical 是 `design/scene/`，两个分发副本是主应用入口页与商店各自的那份。
 *
 * 这五个文件**没有构建步骤**，靠手工复制。历史上它们整体走散过（商店侧漏掉一轮令牌补齐），
 * 而症状是「商店的琥珀比登录页旧一档」—— 那种差异没人会报 bug。
 */
const SYNCED_SCENE_FILES = [
  "page.css",
  "panel.css",
  "scene.css",
  "scene.html",
  "appearance.js"
];

const SCENE_COPIES = [
  "design/scene",
  "frontend/static/auth/scene",
  "store/static/scene"
];

function checkSceneSync() {
  const problems = [];
  for (const name of SYNCED_SCENE_FILES) {
    const canonical = path.join(ROOT, SCENE_COPIES[0], name);
    if (!fs.existsSync(canonical)) {
      problems.push({ file: rel(canonical), detail: `canonical 缺失：${name}` });
      continue;
    }
    const expected = read(canonical);
    for (const copy of SCENE_COPIES.slice(1)) {
      const candidate = path.join(ROOT, copy, name);
      if (!fs.existsSync(candidate)) {
        problems.push({ file: rel(candidate), detail: `分发副本缺失：${name}` });
        continue;
      }
      if (read(candidate) === expected) continue;
      const actual = read(candidate).split("\n");
      const wanted = expected.split("\n");
      const firstDiff = wanted.findIndex((line, index) => line !== actual[index]);
      problems.push({
        file: rel(candidate),
        detail:
          `与 design/scene/${name} 不一致（首个差异在第 ${firstDiff + 1} 行）` +
          `，请从 design/scene/ 同步这一份`
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 2) --hb-* 与 --hos-* 逐 token 相等
// ---------------------------------------------------------------------------

/**
 * 镜像表：商店侧的名字 → 场景侧的名字。
 *
 * 刻意是一张**显式表**而不是「按值自动配对」。商店的面板叫 `surface`、场景叫 `sky`，
 * 两者指向同一批值 —— 这层同名不同字的映射是本仓的既定契约（theme.css 顶注写明），
 * 按值配对会把它退化成「值偶然相等」，那正是两个色板走散的起点。
 *
 * 新增令牌时在这里补一行；漏补的令牌不会被这个脚本发现，所以 theme.css 顶注那句话
 * （「要看两侧是否走散，按 token 逐个比」）仍然成立 —— 这个脚本把「逐 token 比」自动化，
 * 但它只能比到登记过的那些。
 */
const MIRROR_ALIAS = {
  "--hb-bg": "--hos-sky-deep",
  "--hb-surface": "--hos-sky-low",
  "--hb-surface-soft": "--hos-sky-mid",
  "--hb-surface-raised": "--hos-sky-high",
  ...Object.fromEntries(
    ["accent", "lumen", "aura", "eco", "heat", "cool", "alert", "sensor"].flatMap(name =>
      ["", "-rgb", "-bright", "-deep"].map(suffix => [
        `--hb-${name}${suffix}`,
        `--hos-${name}${suffix}`
      ])
    )
  ),
  ...Object.fromEntries(
    ["sky-deep", "sky-low", "sky-mid", "sky-high", "sky-haze"].flatMap(name => [
      [`--hb-${name}`, `--hos-${name}`],
      [`--hb-${name}-rgb`, `--hos-${name}-rgb`]
    ])
  ),
  "--hb-ink": "--hos-ink",
  "--hb-ink-bright": "--hos-ink-bright",
  "--hb-ink-rgb": "--hos-ink-rgb",
  "--hb-muted-rgb": "--hos-muted-rgb",
  "--hb-on-bright": "--hos-on-bright",
  "--hb-star-rgb": "--hos-star-rgb",
  "--hb-star-cool-rgb": "--hos-star-cool-rgb"
};

/** 两侧同名同值、但**故意**重复定义的令牌（不是漂移）。目前没有，留作登记处。 */
const MIRROR_IGNORED = new Set();

function checkTokenMirror(storeTokens, sceneTokens) {
  const problems = [];
  for (const [storeName, sceneName] of Object.entries(MIRROR_ALIAS)) {
    if (MIRROR_IGNORED.has(storeName)) continue;
    const storeSide = storeTokens.get(storeName);
    const sceneSide = sceneTokens.get(sceneName);
    if (storeSide === undefined && sceneSide === undefined) continue;
    if (storeSide === undefined) {
      problems.push({ file: "store/static/theme.css", detail: `缺少镜像令牌 ${storeName}` });
      continue;
    }
    if (sceneSide === undefined) {
      problems.push({ file: "design/scene/page.css", detail: `缺少 ${sceneName}（镜像 ${storeName}）` });
      continue;
    }
    // 比**解析后**的值而不是原始文本：`--hb-surface: var(--hb-sky-low)` 与
    // `--hos-sky-low: #081020` 只差一层别名，按文本比会误报四条（实测如此）。
    //
    // `-rgb` 令牌是例外：它的值是 `255, 196, 106` 这样的**裸通道三元组**，不是颜色，
    // 解析器认不出来。那几枚直接按归一化后的文本比（去掉空白差异）。
    if (storeName.endsWith("-rgb")) {
      const normalize = value => (value ?? "").replace(/\s+/g, "");
      if (normalize(storeSide) === normalize(sceneSide)) continue;
      problems.push({
        file: "store/static/theme.css",
        detail: `${storeName} = ${storeSide} 与 ${sceneName} = ${sceneSide} 取值不同`
      });
      continue;
    }
    const storeResolved = resolveColor(storeName, storeTokens);
    const sceneResolved = resolveColor(sceneName, sceneTokens);
    if (!storeResolved || !sceneResolved) {
      problems.push({
        file: "store/static/theme.css",
        detail: `${storeName} / ${sceneName} 至少一侧解析不出颜色，无法比对`
      });
      continue;
    }
    const same =
      storeResolved.color.r === sceneResolved.color.r &&
      storeResolved.color.g === sceneResolved.color.g &&
      storeResolved.color.b === sceneResolved.color.b &&
      Math.abs(storeResolved.color.a - sceneResolved.color.a) < 0.001;
    if (!same) {
      problems.push({
        file: "store/static/theme.css",
        detail:
          `${storeName} = ${storeResolved.color.a === 1 ? "" : `rgba `}` +
          `(${storeResolved.color.r}, ${storeResolved.color.g}, ${storeResolved.color.b})` +
          ` 与 ${sceneName} = (${sceneResolved.color.r}, ${sceneResolved.color.g}, ${sceneResolved.color.b})` +
          ` 取值不同`
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 3) soft / line / text 三件套的 α 与取值契约
// ---------------------------------------------------------------------------

/**
 * `appearanceTokens()` 会为四束光（accent / lumen / aura / eco）发一整套令牌，
 * 其中 soft / line / text 三个值是 **α 或明暗档的硬契约**：
 *
 *   -soft = rgba(triplet, 0.13)
 *   -line = rgba(triplet, 0.32)
 *   -text = <bright>
 *
 * 为什么它是契约而不是实现细节：管理员「打开配色面板 → 什么都不改 → 点保存」时，
 * 写回的内联变量会**盖过 theme.css**。如果 theme.css 里写的是 0.12 / 0.42，
 * 那一次保存就把全站的强调描边悄悄改成 0.32 —— 这正是 theme.css 在
 * --hb-accent-soft 上方用一段注释警告过的事，但那段注释防不住 alert / sensor
 * 这种「不在面板里、却和面板里的成员同族」的令牌：审计实际查出 alert-line 是 0.34、
 * sensor-soft 是 0.12、sensor 的 tone-line 内联成 0.28，三处都过了几个月没人发现。
 *
 * 所以这条守卫从 appearance.js **现读** α 与 -text 的取值规则，再逐族比对 theme.css。
 * 改 appearance.js 的派生常量时这里会跟着变（不是抄一份），
 * 而改 theme.css 单侧会被当场拦下。
 */
function readAppearanceContract() {
  const file = path.join(ROOT, "design", "scene", "appearance.js");
  if (!fs.existsSync(file)) return null;
  const source = stripScriptComments(read(file));
  const softMatch = /--hb-\$\{name\}-soft`\]\s*=\s*`rgba\(\$\{triplet\},\s*([\d.]+)\)/.exec(source);
  const lineMatch = /--hb-\$\{name\}-line`\]\s*=\s*`rgba\(\$\{triplet\},\s*([\d.]+)\)/.exec(source);
  const textMatch = /--hb-\$\{name\}-text`\]\s*=\s*(\w+)/.exec(source);
  if (!softMatch || !lineMatch || !textMatch) return null;
  return {
    soft: Number.parseFloat(softMatch[1]),
    line: Number.parseFloat(lineMatch[1]),
    text: textMatch[1],
    configurable: (/CONFIGURABLE\s*=\s*\[([^\]]*)\]/.exec(source)?.[1] ?? "")
      .split(",")
      .map(item => item.trim().replace(/["']/g, ""))
      .filter(Boolean)
  };
}

function checkSoftLineContract(storeTokens, appearance) {
  if (!appearance) {
    return [{ file: "design/scene/appearance.js", detail: "读不到 appearanceTokens() 的派生常量，守卫失效" }];
  }
  const problems = [];
  // 四束光（面板可配）+ 四族设备读色（面板不可配，但同族同契约）。
  const families = [
    ...appearance.configurable,
    "heat",
    "cool",
    "alert",
    "sensor"
  ];
  for (const family of unique(families)) {
    for (const [suffix, expected] of [
      ["soft", appearance.soft],
      ["line", appearance.line]
    ]) {
      const name = `--hb-${family}-${suffix}`;
      const raw = storeTokens.get(name);
      if (raw === undefined) {
        problems.push({ file: "store/static/theme.css", detail: `缺少 ${name}` });
        continue;
      }
      const match = /^rgba\(\s*var\(\s*--hb-[\w-]+-rgb\s*\)\s*,\s*([\d.]+)\s*\)$/.exec(raw.trim());
      if (!match) {
        problems.push({
          file: "store/static/theme.css",
          detail: `${name} 应当是 rgba(var(--hb-${family}-rgb), ${expected})，实际是 ${raw}`
        });
        continue;
      }
      if (Math.abs(Number.parseFloat(match[1]) - expected) > 0.0001) {
        problems.push({
          file: "store/static/theme.css",
          detail:
            `${name} 的 α 是 ${match[1]}，契约（appearance.js 发出、并被 [data-tone] 依赖）是 ${expected}`
        });
      }
    }
    // -text 必须存在，且与同族的 语义别名 指向同一个值。
    const textName = `--hb-${family}-text`;
    if (!storeTokens.has(textName)) {
      problems.push({ file: "store/static/theme.css", detail: `缺少 ${textName}` });
    }
  }
  // 语义别名（success / danger / warning）必须转发到对应族的 -text，而不是自己写死。
  for (const [alias, target] of [
    ["--hb-success-text", "--hb-eco-text"],
    ["--hb-danger-text", "--hb-alert-text"],
    ["--hb-warning-text", "--hb-lumen-text"]
  ]) {
    const raw = storeTokens.get(alias);
    if (raw === undefined) {
      problems.push({ file: "store/static/theme.css", detail: `缺少 ${alias}` });
      continue;
    }
    if (raw.trim() !== `var(${target})`) {
      problems.push({
        file: "store/static/theme.css",
        detail: `${alias} 应写 var(${target})（一族一张脸，改色只改一处），实际是 ${raw}`
      });
    }
  }
  return problems;
}

const unique = list => [...new Set(list)];

/**
 * `-tone-text` 必须**逐族**指向本族的 `-text`。
 *
 * 这条曾是一处真实的混用：accent / aura / eco 三个 [data-tone] 块写 `var(--hb-X-bright)`、
 * lumen 写 `var(--hb-lumen-text)`、而 heat / cool / sensor 直接写 base 色。
 * 三种写法当时都得出了正确颜色，所以没有任何东西会报警 —— 但它们的「正确」靠的是
 * 两个名字恰好同值，改色时必然会裂开。现在八族一张脸：`var(--hb-<family>-text)`。
 */
function checkToneTextWiring(storeTokens, storeText) {
  const problems = [];
  const roots = [...storeText.matchAll(/--hb-tone-text:\s*([^;]+);/g)].map(match => match[1].trim());
  for (const value of roots) {
    const match = /^var\(--hb-([a-z]+)-text\)$/.exec(value);
    if (!match) {
      problems.push({
        file: "store/static/theme.css",
        detail: `--hb-tone-text 应写 var(--hb-<族>-text)，实际是 ${value}`
      });
      continue;
    }
    if (!storeTokens.has(`--hb-${match[1]}-text`)) {
      problems.push({
        file: "store/static/theme.css",
        detail: `--hb-tone-text 指向不存在的 --hb-${match[1]}-text`
      });
    }
  }
  if (roots.length !== 9) {
    problems.push({
      file: "store/static/theme.css",
      detail: `--hb-tone-text 应出现 9 次（:root 默认 + 8 个 [data-tone]），实际 ${roots.length} 次`
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 4) 颜色字面量分类
// ---------------------------------------------------------------------------

/**
 * 白/黑叠加层与遮罩停点 —— 合法，不计入债务。
 *
 * 判定只看**通道是否全等**（`#ffffff` / `#000000` 及其带 alpha 的写法），不看具体 α：
 * `#ffffff06` 与 `#ffffff2e` 是同一件事的强弱两档，都要放行。
 * 三位写法 `#fff` / `#000` 先在 parseHex 里展开成六位，所以这里统一按展开后的通道比。
 */
function isOverlay(color) {
  return (
    (color.r === 255 && color.g === 255 && color.b === 255) ||
    (color.r === 0 && color.g === 0 && color.b === 0)
  );
}

/**
 * 扫描一份样式表里所有的颜色字面量。
 *
 * 只认 `#hex` 与 `rgb()/rgba()` 的数字写法；`color-mix()` / `currentColor` / `transparent`
 * 不参与（前者本仓只有一处 `::backdrop`，后两者没有色值可言）。
 *
 * 两处位置的字面量会被标记成**不是债务**，判定写在这里而不是留给调用方：
 *
 *   ① `var(--x, #hex)` 的兜底位。它表达的是「令牌取不到时用这个」，是刻意的降级路径
 *      （renderer.css 的 `var(--hos-eco, #5fd0a8)` 就是范例：渲染容器上还没有主题变量时
 *      整片失色，兜底值让它至少还是对的颜色）。要求它改成 var() 是自指的矛盾。
 *   ② 调色板自己的 `:root` 定义块。那里**就是**真值，统计进债务毫无意义 ——
 *      design/scene/page.css 会被报成 32 处「与令牌同值的字面量」，而那 32 处正是令牌本身。
 *
 * `tokenBlockEnd` 由调用方（只对调色板归属文件）传入，其余文件是 -1。
 */

/**
 * 取该位置字面量所属的 CSS 属性名（取最近一个 `{` / `}` / `;` 之后的 `prop:`）。
 *
 * 用途只有一个：让「与令牌同值却写成字面量」这条提示**带上角色**。只比色值会把
 * `background: linear-gradient(180deg, #65717c, #3d4650)` 里的渐变停点报成
 * 「该用 --hos-tool-disabled」—— 而那是金属光泽的材质停点，与「禁用态文字灰」
 * 只是碰巧同值。色板自己的原则写得很清楚：令牌按角色命名，同值不同角色不是问题。
 */
function propertyInfo(before) {
  const start = Math.max(before.lastIndexOf(";"), before.lastIndexOf("{"), before.lastIndexOf("}"));
  const segment = before.slice(start + 1);
  const match = segment.match(/([a-zA-Z0-9_-]+)\s*:\s*[^:]*$/);
  const prop = match ? match[1].toLowerCase() : "";
  // 这一段是不是**材质**（渐变停点 / 阴影层）。材质不该被收进 chrome 令牌：
  // 停点是刻意的明暗层次，并到平色令牌上会把层次抹平；而它常常与某个令牌同值
  // （金属光泽的 #65717c 正好等于「禁用态文字灰」），只比色值就会误收。
  const material = /gradient\(|shadow/i.test(segment);
  return { prop, material };
}

function collectLiterals(cssText, tokenBlockEnd = -1) {
  const source = stripCssComments(cssText);
  const findings = [];

  // ① 先圈出所有 var() 的兜底位，后面按字符区间判断。
  const fallbackSpans = [];
  for (const match of source.matchAll(/var\(\s*--[\w-]+\s*,([^)]*)\)/g)) {
    fallbackSpans.push([match.index + match[0].indexOf(","), match.index + match[0].length]);
  }
  const inFallback = index => fallbackSpans.some(([start, end]) => index >= start && index < end);

  const pattern =
    /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g;
  for (const match of source.matchAll(pattern)) {
    const color = parseColor(match[0]);
    if (!color) continue;
    const before = source.slice(0, match.index);
    const line = before.split("\n").length;
    const info = propertyInfo(before);
    findings.push({
      literal: match[0].toLowerCase(),
      color,
      line,
      // 该字面量所属的属性名与「是否材质」，给两条下游判断用：
      // ①「与令牌同值」提示做角色过滤（只比色值会把渐变停点错认成文字令牌）；
      // ② 颜色簇报告标出「这一簇是材质，别收」。
      prop: info.prop,
      material: info.material,
      legitimate: inFallback(match.index) || (tokenBlockEnd > 0 && match.index < tokenBlockEnd)
    });
  }
  return findings;
}

/**
 * 调色板 `:root` 定义块的结束位置（字符偏移）；文件里没有 `:root` 时返回 -1。
 * 只对「真值归属文件」调用，见 collectLiterals 的说明 ②。
 */
function tokenBlockEndOffset(cssText) {
  const source = stripCssComments(cssText);
  const start = source.indexOf(":root");
  if (start === -1) return -1;
  const open = source.indexOf("{", start);
  if (open === -1) return -1;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * 合法的字面量例外。
 *
 * 每一条都必须写明**为什么它不能是令牌**，否则这里会慢慢变成「把误报一条条塞进去」的
 * 垃圾桶，审计也就死了（与 check_invariants.mjs 的 DYNAMIC_IDS 同一条纪律）。
 */
const LITERAL_ALLOWLIST = [
  {
    file: /^frontend\/static\/assets\/icons\/.*\.svg$/,
    reason: "品牌标识 SVG：独立文件，读不到页面上的 CSS 变量，只能自备色值"
  },
  {
    file: /^store\/static\/homeos-mark.*\.svg$/,
    reason: "同上的商店侧品牌标识"
  },
  {
    file: /^store\/security\/request_security\.py$/,
    reason: "500 错误页：刻意不引 /store-static（500 常常正是静态读取失败导致的），只能自备一套"
  },
  {
    file: /^store\/ops\/mailer\.py$/,
    reason: "验证码邮件：邮件客户端不执行外部样式表，只能内联色值"
  },
  {
    file: /^frontend\/static\/display\/display-boot\.css$/,
    reason: "启动首屏：必须早于任何令牌表就能画出正确颜色（那是「页面还没样式时」的一屏）"
  },
  {
    file: /^frontend\/display\.html$/,
    reason:
      "启动图：内联 SVG 品牌标 + theme-color meta，两者都**刻意写死**。" +
      "SVG 部分与 display-boot.css 是同一屏的两个载体 —— 内联 SVG 的呈现属性确实支持 var()" +
      "（已实测 fill / stop-color 均能解析），但这一屏的意义就是「令牌表还没加载时也要画对」，" +
      "此刻 var() 会解析为空、整个标变成空白，比颜色不对严重得多。" +
      "meta[name=theme-color] 另有一层限制：它不参与 CSS 级联，本来就吃不下 var()。" +
      "边界：这个文件里除上述两者外的颜色若需要跟主题，应写进 CSS 而不是继续内联"
  },
  {
    file: /\/scene\/appearance\.js$/,
    reason: "PRESETS / appearanceTokens() 里的四束光**就是**调色板的 JS 侧真值（三份副本）"
  },
  {
    file: /^frontend\/static\/templates\/component-templates\.js$/,
    reason:
      "组件出厂默认值：这些颜色是**文档数据**，会被写进仪表盘文档的属性里、由颜色输入框与" +
      "行内样式消费，不是运行时去读样式的 chrome，所以结构上接不了 var()。" +
      "其中与令牌同值的几枚是**手工对齐**过的（buttonOnColor 对 --hos-lumen、glowColor 对" +
      "--hos-accent，文件里注明了原值分别是 #feae01 / #ffa200），换色板时要跟着改"
  },
  {
    file: /(?:scene\/scene\.html|templates\/_scene\.html)$/,
    reason:
      "登录/设置页的场景插画（含商店模板里的同一份）：山脊、雪面、建筑暗面的色阶是为这幅画" +
      "手工推的，不在 :root 里，只把少数几枚同值端点换成 var() 会让渐变在换主题时撕裂" +
      "（详见文件内注释与那张对照表）"
  },
  {
    file: /^frontend\/static\/utils\/airflow-colors\.js$/,
    reason:
      "气流「其它」档的唯一出处：无色相中性灰，调色板里刻意没有对应令牌。" +
      "它恰好与 --hos-tool-ink-dim 同值，但那是工具面的弱文字色，套上去会把「其它模式」" +
      "误读成一种界面状态 —— 「同值 ≠ 同角色」。原先是五处各写一遍（其中一处还写成 #ffffff），" +
      "现已收成这一份，与 cover-features.js 同一处理"
  }
];

const isAllowedLiteral = file => LITERAL_ALLOWLIST.find(entry => entry.file.test(file));

/**
 * 把字面量分三类：
 *
 *   legit   —— 白/黑叠加、`var()` 兜底位、调色板自身的定义块。合法，不计入债务
 *   palette —— 与某个令牌的取值**完全相同**，也就是说这里本该写 var()
 *   other   —— 既不是叠加层、也不等于任何令牌，是各页面自带色板的残骸（债务的主体）
 */
function classifyLiterals(findings, paletteValues) {
  const buckets = { legit: [], palette: [], other: [] };
  for (const finding of findings) {
    if (finding.legitimate || isOverlay(finding.color)) {
      buckets.legit.push(finding);
      continue;
    }
    const roles = paletteValues.get(finding.literal);
    if (roles) buckets.palette.push({ ...finding, roles });
    else buckets.other.push(finding);
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// 5) 对比度
// ---------------------------------------------------------------------------

/**
 * 令牌名 → 它扮演的角色。用于挑出有意义的「前景 × 背景」组合。
 *
 * 单靠前缀不够，有好几处必须按后缀排除，否则会产出大量无意义的组合（实测第一版报出
 * 88 条，其中绝大多数是假的）：
 *
 *   `-deep`       —— 深色档**只**作为渐变的暗端（`linear-gradient(bright, deep)`），
 *                    从不直接当文字色。拿它跟深色底算对比度，算的是「深色压深色」，
 *                    必然不达标，而现实中它上面压的是 `-bright` 或 `on-bright`。
 *   `-soft`       —— 13% 的柔和底色，是**背景**不是文字。若当背景算，它与它叠在
 *                    其上的那个 surface 差异不足 13% α，得数几乎相同 —— 只会把
 *                    同一个结论按表面数量重复三遍（sky-* 与 surface-* 各一遍）。
 *   `-line`       —— 描边色，更不是文字。
 *   `-faint`      —— 6% 的极淡底，同 `-soft`。
 *   `-rgb`        —— 通道三元组，不是颜色（parse 不出来，前面已过滤）。
 *   `on-bright`   —— 它是**亮底上的深色字**（主按钮渐变上的文字），该跟渐变两端比，
 *                    不是跟夜空底比。单独走 checkOnBright()。
 */
const NON_FOREGROUND_SUFFIXES = ["-rgb", "-deep", "-soft", "-line", "-faint", "-glow"];

function roleOfToken(name) {
  // 例外：名字里带 `-text` 的一律是前景色，**哪怕它以 `-soft` / `-deep` 这类
  // 「非前景」后缀结尾**。
  //
  // 起因是 `--accent-text-soft`（主控色文字三档里的柔档，α 0.82）：它因为后缀是
  // `-soft` 被整族排除，从未进过对比度清单 —— 而它实实在在是 9 处 `color:` 的取值。
  // 判据取「`-text` 出现在名字里」而不是「以 `-text-` 结尾」，于是
  // `--accent-text-soft` / `--hos-tool-text-dim` / `--x-text-*` 这一整类都不再漏。
  // 通道三元组（`-rgb`）不含 `-text`，仍按原样排除。
  if (!name.includes("-text") && NON_FOREGROUND_SUFFIXES.some(suffix => name.endsWith(suffix))) {
    return null;
  }
  // 工具面族（编辑器 / 显示端 / 工作室三套界面共用的一组 --hos-tool-*）。
  // 它自成一套：面走 --hos-tool-{bg,surface,field,panel,track}，文字走 --hos-tool-{ink,text,hint,muted}。
  // 必须单列，不能指望下面那两条正则：它们写的是「--hos- 紧跟 ink/sky/…」，
  // 而 --hos-tool-ink 在 --hos- 之后是 tool，两条都不匹配 —— 这一族此前对对比度检查
  // 完全不可见（表里没有它，于是「全绿」是假的）。
  if (/^--hos-tool-(?:bg|surface|field|panel|track)\b/.test(name)) return "surface";
  // `disabled` 一并归入文字：它 19 处取用全是 `color:`（禁用态 / 空状态 / 步进标签）。
  // 必须显式列进来 —— 否则正是上面注释警告的那种情形：「表里没有它，于是全绿是假的」。
  // 它压在工具面上只有 3.3–3.9:1，是最需要被看见的一档；看见之后再交给
  // FOREGROUND_CEILING 如实登记为「刻意的低对比」而放行，而不是靠漏检蒙混过去。
  // `label` 是 2026-09 新增的「次级按钮标签」角色（安静按钮 / 相机叠加文字）。
  // 它必须显式列进来，理由同 `disabled`：不列就是「表里没有它，于是全绿是假的」。
  if (/^--hos-tool-(?:ink|text|hint|muted|disabled|label)/.test(name)) return "text";
  if (/--(?:hos|hb)-(?:sky|surface|bg|field)/.test(name)) return "surface";
  if (/--(?:hos|hb)-on-bright/.test(name)) return "onbright";
  if (/--(?:hos|hb)-(?:ink|muted)/.test(name)) return "text";
  // `readout` 是 2026-09 新增的「器件读数」色（灯亮度 / 窗帘位置的数值文字，见
  // design/scene/page.css 的 --hos-readout）。它落进这里的理由与上面 `--hos-tool-*`
  // 那条完全一样：不显式列进来，这枚用在 `color:` 上的令牌对对比度检查
  // **完全不可见**，「全绿」就成了假的。
  // 它目前在工具面上 4.64–6.27:1 全部达标（最坏是 surface-raised 的 4.64），
  // 所以不进 FOREGROUND_CEILING；列进来是为了让**将来**改值时会有人拦住。
  if (/--(?:hos|hb)-(?:accent|lumen|aura|eco|heat|cool|alert|sensor|danger|warning|success|readout)/.test(name)) {
    return "accent";
  }
  return null;
}

/**
 * 令牌的角色族：面 / 前景 / 无所谓。
 *
 * 直接复用 roleOfToken，不另写一套正则 —— 「同一个判断只有一个出处」，
 * 否则对比度检查与提示过滤会各自漂移。
 *
 *   surface    —— 该令牌的面就是给 `background` / 描边用的
 *   foreground —— 文字 / 图标色，只能出现在 `color` 上
 *   any        —— roleOfToken 判不出来（`-line` / `-deep` / `-soft` / `-faint`
 *                 这类按后缀排除的），从哪边都说得通，不进过滤
 */
function familyOfToken(name) {
  const role = roleOfToken(name);
  if (role === "surface") return "surface";
  if (role === null) return "any";
  return "foreground";
}

/**
 * 这批字面量所在属性的角色族（见 familyOfProperty 的调用点）。
 *
 * 属性名混着来（一个值同时出现在 `background` 与 `color` 上）时返回 null：
 * 说不清就该闭嘴，而不是替人挑一个令牌。
 */
/**
 * 单条字面量的角色族（颜色簇报告用）。与 familyOfProperty 的区别：
 * 它看的是**单处**属性 + 材质标记，而那个看的是「一批同值处的属性集合」。
 */
function roleFamily(prop, material) {
  if (material) return "material";
  if (/^(background|border|outline|box-shadow|fill|stroke|stop-color|column-rule|text-shadow)/.test(prop)) {
    return "surface";
  }
  if (/^(color|caret-color|text-decoration-color|-webkit-text-fill-color)/.test(prop)) {
    return "foreground";
  }
  return "other";
}

function familyOfProperty(bucket) {
  const props = [...bucket.props];
  if (props.length === 0) return null;
  // 令牌自身的定义行（`--i3d-climate-accent: #dce2e6`）：这里**本来就该**是字面量。
  // 它与别的令牌同值只是「此刻恰好相等」，是否该改成 var() 是另一个问题（那叫别名），
  // 不能由「值相等」推出来。
  if (props.every(prop => prop.startsWith("--"))) return "definition";
  const families = new Set(
    props.map(prop => {
      if (/^(background|border|outline|box-shadow|fill|stroke|stop-color|column-rule|text-shadow)/.test(prop)) {
        return "surface";
      }
      if (/^(color|caret-color|text-decoration-color|-webkit-text-fill-color)/.test(prop)) {
        return "foreground";
      }
      return null;
    })
  );
  return families.size === 1 ? [...families][0] : null;
}

/**
 * 收一份令牌表里的前景与表面。
 *
 * 表面侧的判别要同时认「面板名」与「天空名」：商店把同一批值叫 `--hb-surface*`，
 * 场景叫 `--hos-sky-*`，两者都在 roleOfToken 的 surface 分支里。
 * 「表面」在这里只是**场景插画的分层**，它进的是 decorativePairs 那张参考表；
 * 真正承载文字的面见 TEXT_SURFACES。
 */
function collectRoles(tokens) {
  const surfaces = [];
  const foregrounds = [];
  const onBright = [];
  for (const [name] of tokens) {
    const role = roleOfToken(name);
    if (!role) continue;
    const resolved = resolveColor(name, tokens);
    if (!resolved) continue;
    if (role === "surface") surfaces.push({ name, color: resolved.color });
    else if (role === "onbright") onBright.push({ name, color: resolved.color });
    else foregrounds.push({ name, color: resolved.color });
  }
  return { surfaces, foregrounds, onBright };
}

/**
 * 文字**真正**压在什么面上。
 *
 * `--hos-sky-*` 那五档是**场景插画**的分层（天幕渐变的停点），不是文字的背景板。
 * 文字的背景板是坞体/面板那层玻璃（`rgba(sky-mid, .82)` 叠 `rgba(sky-low, .92)` 再叠场景）
 * 或者商店的不透明面。拿「文字 × 原始天空档位」直接比，会得到一批页面上不存在的组合。
 *
 * 第一版就是这么干的，于是报出三条**假缺陷**：
 *
 *   --hos-muted  on sky-haze 4.13   —— 坞体玻璃上的最坏情形实测 5.29:1
 *   --hos-alert  on sky-haze 4.31   —— 状态条同在坞体玻璃内，实测 6.24:1
 *   --hb-muted-dim on sky-haze 3.08 —— 商店前台根本没有 sky-haze 这个面
 *
 * 而同时它**漏判**了一条真缺陷的方向：`.hb-page-head` 的底色是
 * `linear-gradient(126deg, surface-soft 0%, surface 58%, surface-raised 100%)`，
 * 右下角（`.hb-page-head__feed` 所在）恰好落在 `--hb-surface-raised` = sky-high 上，
 * 那里的 `--hb-muted-dim` 只有 4.04:1。只有把「文字实际落在哪个面」写清楚，
 * 这条才会浮出来。
 *
 * 所以这张表按**面的来源**分两种：
 *   solid  —— 不透明面，直接取色板取值（商店全是这一类）
 *   layers —— 玻璃层叠：按 α 依次叠到 `over` 指定的最坏叠底上，算出合成色
 *
 * 叠底一律取 `sky-haze`（色板里最亮也最饱和的一档）：玻璃透上来的光最多，
 * 是最坏情形。取 sky-deep 会让每个玻璃面都显得比实际更暗，报出来的问题全是假的。
 */
const TEXT_SURFACES = [
  // ── 商店：不透明面（`--hb-*` 文字落在这些面上）──
  {
    app: "store",
    name: "store/bg",
    reason: "商店前台画布（body 的 --hb-bg）",
    solid: "--hos-sky-deep"
  },
  {
    app: "store",
    name: "store/surface",
    reason: ".hb-block / .hb-card 的渐变暗端",
    solid: "--hos-sky-low"
  },
  {
    app: "store",
    name: "store/surface-soft",
    reason: ".hb-table thead / .hb-tag 的底，卡片渐变亮端",
    solid: "--hos-sky-mid"
  },
  {
    app: "store",
    name: "store/surface-raised",
    reason: ".hb-page-head 渐变 100% 停点（右下角，feed 读数条所在）、.hb-toast、.hb-select option",
    solid: "--hos-sky-high"
  },
  // ── 入口页：玻璃面，叠在场景最亮处（`--hos-*` 文字落在这些面上）──
  {
    app: "scene",
    name: "scene/dock-top",
    reason: ".hos-panel 渐变 0% 停点（panel.css:31）",
    layers: [["--hos-sky-mid-rgb", 0.82]],
    over: "--hos-sky-haze"
  },
  {
    app: "scene",
    name: "scene/dock-bottom",
    reason: ".hos-panel 渐变 100% 停点",
    layers: [["--hos-sky-low-rgb", 0.92]],
    over: "--hos-sky-haze"
  },
  {
    app: "scene",
    name: "scene/popover",
    reason: "日期选择器等浮层（panel.css:1015），比坞体更不透明",
    layers: [["--hos-sky-mid-rgb", 0.96]],
    over: "--hos-sky-haze"
  },
  {
    app: "scene",
    name: "scene/modal-card",
    reason: "模态卡片，压在 0.72 的黑幕上（panel.css:1482）再叠场景",
    layers: [
      ["--hos-sky-deep-rgb", 0.72],
      ["--hos-sky-mid-rgb", 0.9]
    ],
    over: "--hos-sky-haze"
  },
  // ── 工具面：编辑器 / 显示端 / 工作室三套界面共用的中性面 ──
  // 这几套界面走 --hos-tool-* 那组令牌，与场景的玻璃面无关；归 app:"tool"，
  // 只在 contrastMatrix 的 tool 那一侧与 --hos-tool-* 文字比对（见那里的侧别表）。
  {
    app: "tool",
    name: "tool/bg",
    reason: "编辑器画布底、输入框底（--bg / --field 都转发到它）",
    solid: "--hos-tool-bg"
  },
  {
    app: "tool",
    name: "tool/surface",
    reason: "侧栏 / 面板 / 卡片的底",
    solid: "--hos-tool-surface"
  },
  {
    app: "tool",
    name: "tool/surface-soft",
    reason: "抬升一档的内层块（分组卡、表头）",
    solid: "--hos-tool-surface-soft"
  },
  {
    app: "tool",
    name: "tool/surface-raised",
    reason: "最亮一档：弹层 / 卡片头 / 选中态",
    solid: "--hos-tool-surface-raised"
  },
  {
    app: "tool",
    name: "tool/panel",
    reason: "运行时弹窗面板渐变的最亮停点（renderer.css 的 --hos-tool-panel）",
    solid: "--hos-tool-panel-stop"
  }
];

/** 把一条 TEXT_SURFACES 定义算成不透明色。 */
function resolveSurface(entry, tokens) {
  const base = resolveColor(entry.over ?? entry.solid, tokens);
  if (!base) return null;
  let painted = base.color;
  for (const [rgbToken, alpha] of entry.layers ?? []) {
    const raw = tokens.get(rgbToken);
    const channels = raw ? parseTriplet(raw) : null;
    if (!channels) return null;
    painted = composite({ ...channels, a: alpha }, painted);
  }
  return painted;
}

/**
 * 前景档位的**使用上限**：这一档最亮只允许压在哪一级面上。
 *
 * 为什么必须有这张表，而不是把每个不达标组合都当缺陷：
 *
 * 「合成后足够亮」这个目标对**固定字面量**的前景档位是做不到的。以 `--hb-muted-dim`
 * (#6d8797) 为例，它要同时满足两条：
 *   ① 比 `--hb-muted` 更暗（它是「比 muted 再低一档」的那个语义）
 *   ② 在最亮的面上也过 4.5:1
 * 而 `--hb-muted` 是 **α 派生**的（`rgba(muted-rgb, .64)`）：在最深的 sky-deep 上
 * 它合成出来只有 L=.2525，要让固定字面量的 muted-dim 达到「在 sky-high 上也 4.5:1」
 * 需要 L≥.2605 —— 那反而**比 muted 在深底上更亮**，①就破了。
 *
 * 也就是说：一个固定档位不可能既是「最暗的一档」、又「在所有面上都达标」。
 * 这是调色板的结构性事实，不是某个值的疏忽。所以正确的约束是**使用范围**：
 * muted-dim 只允许压到 `--hb-surface-soft` 这一级为止。
 *
 * 这条约束写出来之后，它就从「一个没人知道的隐含前提」变成「一条会被检查的契约」：
 * 超出上限的组合会被列成 note（而不是 fail），而一旦有人真的把 dim 档放到亮面上，
 * `.hb-page-head` 那次就是这么发生的 —— 它会在**使用处**暴露（见下面 ceiling 的用法）。
 *
 * 上限用「面的相对亮度」表达而不是面的名字：面表会增删，而亮度是这件事的物理量。
 */
const FOREGROUND_CEILING = {
  "--hb-muted-dim": {
    maxLuminance: 0.012,
    reason:
      "商店自有最暗一档（#6d8797）。上限落在 store/surface-soft(#0d1728, L=.0093) 与 " +
      "store/surface-raised(#16263c, L=.0188) 之间：前者 4.80:1 达标，后者 4.04:1 不达标。" +
      "**它因此不能出现在 .hb-page-head / .hb-account-heading 里** —— 那两块横幅的渐变 " +
      "100% 停点正是 surface-raised；右下角的 __path 与 __feed small 已改用 --hb-muted（5.03:1）。" +
      "契约同时写在 store/static/theme.css 的 --hb-muted-dim 定义处。"
  },
  // ── 工具文字梯的下三档 ──
  // 中性文字梯从 ink 到 hint-dim 跨越 L .96 → .20；最暗的这三档**本来就不该出现在亮面上**，
  // 它们的值是「弱化」这一语义本身，把值提亮到能在 surface-raised 上过 4.5:1，三档就会
  // 挤成同一个灰、梯度消失。所以正确的做法是声明使用上限，而不是改值。
  "--hos-tool-muted-dim": {
    maxLuminance: 0.0155,
    reason:
      "弱标签（#8d989f）。在 tool/surface(5.95) / surface-soft(5.52) / panel(5.45) / bg(6.53) 上均达标，" +
      "唯独在最亮的 surface-raised(#26313c) 上是 4.49:1 —— 差 0.01。要它在 raised 上达标需提到约 #8e999f，" +
      "而那样它就与 hint 只剩 3 个通道、两档并成一档，所以此处声明上限而非改值：**不得出现在 surface-raised 上**。"
  },
  "--hos-tool-hint": {
    maxLuminance: 0.0155,
    reason:
      "弹窗副行 / 提示（#808b91，已为「压面板」+2 个通道）。在主场面 panel(4.52) / surface(4.94) / " +
      "surface-soft(4.60) / bg(5.43) 上达标；在 surface-raised 上是 3.69:1，**不得出现**。" +
      "它的主场是弹窗与卡片副行 —— 那些面的底是 panel / surface，不是 raised。"
  },
  "--hos-tool-hint-dim": {
    maxLuminance: 0.0050,
    reason:
      "最弱一档（#727e86）—— 占位符、禁用态、空状态标签。只在最暗的 tool/bg 与 tool/field（同一个值 " +
      "#0b0f12，4.62:1）上达标；压 surface(4.21) / surface-soft(3.91) / raised(3.18) 都不足。" +
      "这是三档里唯一「只允许压画布底」的。实测其 27 处取用也确实都在画布底、输入框底或禁用态上；" +
      "其中 .workspace-empty-state / .canvas-placeholder 的 11px 空状态标签是**刻意的低对比**" +
      "（app.css 有注释：「不让它比真正的画布内容更抢眼」），属阶段 4 说的装饰性文字，此处如实登记。"
  },
  "--hos-tool-disabled": {
    maxLuminance: 0.0155,
    reason:
      "非活动文字（#65717c）—— 禁用态与空状态标签，比 hint-dim 还暗 36 个色差单位，是全库最暗的一档文字。" +
      "压 tool/bg 只有 3.85:1、压 surface 3.51、压 surface-soft 3.26 —— 全都不足 4.5:1，而且**不应该**去补足：" +
      "它的语义就是「内容此刻不可用 / 不存在」，把值提亮到过线，禁用态就会看起来像可用态。" +
      "放行的依据有两条：WCAG 1.4.3 明确豁免 disabled 控件；空状态标签的定位与 hint-dim 那条同理（装饰性、不该抢眼）。" +
      "上限取 0.0155，与 muted-dim / hint 一致 —— 覆盖它合法出现的 bg / surface / surface-soft / panel，" +
      "但不含最亮的 surface-raised（0.0293），后者是 hover/激活底，那里不该有非活动文字。"
  }
};

/**
 * 刻意低于 AA、且**有据可依**的前景色令牌 —— 它们的低对比是语义本身，不是疏忽。
 *
 * 为什么需要这一张表，而不是继续靠 FOREGROUND_CEILING：
 * 上限表能表达两种意思，但**只有一种是对的**：
 *   · 「这个组合不该出现」→ 正确。那是使用处写错了。
 *   · 「这个组合会出现、也允许出现，只是它就是不该够亮」→ 上限表表达不了，
 *     写成 note 会被读成「不该出现」，写成 problem 又会被当成待修缺陷。
 * 禁用态就是后一种：WCAG 1.4.3 明确豁免 inactive 控件，把值提到 4.5:1 反而让
 * 禁用态看起来像可用态 —— 这不是待修项，是**设计约束**。
 *
 * 所以给这类令牌单开一段「豁免登记」：既不计入失败数，也不放进「不该出现」，
 * 而是**必须写明依据**地留在报告里。这样门禁保持全绿的同时，豁免也不会变成
 * 一条没人看见的静默后门（本文件 roleOfToken 的注释里警告的正是那个）。
 */
const WCAG_EXEMPT_FOREGROUNDS = new Map([
  [
    "--hos-tool-disabled",
    "WCAG 1.4.3 豁免禁用控件；空状态 / 占位符标签按装饰性文字登记（与 hint-dim 同理）"
  ]
]);

/**
 * 算每个前景令牌压在**真实文字面**上的对比度。
 *
 * 两侧令牌都要算：场景侧提供 canonical 值，商店侧还额外带 `--hb-muted-dim` /
 * `--hb-ink-soft` 这几个商店独有的档位 —— `--hb-muted-dim` 正是上面说的那条真缺陷
 * （`.hb-page-head` 右下角的 4.04:1），只在商店表里找得到。
 *
 * 前景自身带 α（`--hb-muted` 是 0.64）时先按 α 压到面上再算亮度 —— 直接拿 α 色算
 * 会得到虚高的对比度。
 */
function contrastMatrix(sceneMap, storeMap) {
  const problems = [];
  const notes = [];
  const exempt = [];
  const seen = new Set();
  // 面表里的名字混了两侧：`--hos-sky-*` 是场景的（solid 面用），`--hos-*-rgb` 是通道。
  // 合并两份表来解析，否则商店那一侧解析 `--hos-sky-high` 会得到 null、整张面表被
  // 静默过滤掉 —— 第二版就是这样，把一个真缺陷修成了一条「全绿」（实测踩到）。
  const merged = new Map([...storeMap, ...sceneMap]);
  const surfaces = TEXT_SURFACES.map(entry => {
    const color = resolveSurface(entry, merged);
    return color
      ? { app: entry.app, name: entry.name, color, luminance: relativeLuminance(color) }
      : null;
  }).filter(Boolean);
  if (surfaces.length !== TEXT_SURFACES.length) {
    problems.push({
      fg: "（工具自检）",
      bg: `TEXT_SURFACES 有 ${TEXT_SURFACES.length - surfaces.length} 条解析不出颜色`,
      ratio: 0
    });
  }

  for (const [side, tokens, fgFilter] of [
    // 工具面族（--hos-tool-*）是编辑器 / 显示端 / 工作室专用的另一套面，与场景玻璃面、
    // 商店面**从不同时出现在一张页面上**。两侧各加一道互斥过滤，否则会报出一批
    // 「3D 面板副行压商店横幅」这种页面上不存在的组合，把真问题淹掉。
    // （工具面那一侧见下面 tool 分支；那边原本就有反方向的同一道过滤。）
    ["scene", sceneMap, name => !name.startsWith("--hos-tool-")],
    ["store", storeMap, name => !name.startsWith("--hos-tool-")],
    // 工具面那一侧：只用 --hos-tool-* 的文字比 --hos-tool-* 的面。
    // 不加这一条过滤的话，场景的 --hos-accent / --hos-muted 等也会去比工具面，
    // 报出一批「两套 CSS 从不同时出现在一张页面上」的组合，把真问题淹掉。
    // `disabled` 必须列进来：它 19 处取用全是 `color`，是本族最暗的一档，
    // 漏掉它等于让它对对比度检查隐形（正是 roleOfToken 注释里警告的那种假全绿）。
    ["tool", sceneMap, name => /^--hos-tool-(?:ink|text|hint|muted|disabled|label)/.test(name)]
  ]) {
    const { foregrounds } = collectRoles(tokens);
    // 只拿「本侧的文字」比「本侧的面」：`--hb-muted-dim` 是商店独有令牌，拿它去比
    // 入口页的玻璃面是纯噪声（那两套 CSS 从不同时加载到一张页面上）。
    const own = surfaces.filter(entry => entry.app === side);
    for (const fg of foregrounds) {
      if (fgFilter && !fgFilter(fg.name)) continue;
      for (const bg of own) {
        const ceiling = FOREGROUND_CEILING[fg.name];
        const ratio = contrast(composite(fg.color, bg.color), bg.color);
        const rounded = Number(ratio.toFixed(2));
        if (ceiling && bg.luminance > ceiling.maxLuminance) {
          // 超出契约声明的上限：这个组合按契约不应当出现，列成 note 备查。
          notes.push({ fg: fg.name, bg: bg.name, ratio: rounded });
          continue;
        }
        if (ratio >= 4.5) continue;
        const key = `${fg.name}|${bg.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // 刻意低对比的令牌走豁免登记（仍带依据留在报告里），不计入失败数。
        // 顺序很关键：**先**过 ceiling、再过 exemption —— 豁免只覆盖「允许出现」的面，
        // 一旦有人把它放到 ceiling 之外的亮面上，那还是 note（使用处写错了）。
        if (WCAG_EXEMPT_FOREGROUNDS.has(fg.name)) {
          exempt.push({ fg: fg.name, bg: bg.name, ratio: rounded, basis: WCAG_EXEMPT_FOREGROUNDS.get(fg.name) });
          continue;
        }
        problems.push({ fg: fg.name, bg: bg.name, ratio: rounded });
      }
    }
  }
  return {
    problems: problems.sort((a, b) => a.ratio - b.ratio),
    notes,
    exempt: exempt.sort((a, b) => a.ratio - b.ratio)
  };
}

/**
 * 「文字 × 原始天空档位」的清单，**只报不判**。
 *
 * 这些组合在页面上多半不存在（文与天之间永远隔着玻璃），所以不置退出码、也不进
 * 主清单。留着它是为了让「文字直接压在场景插画上」这类新增用法有个可见的参考值 ——
 * 真出现时人能从这张表里读到该用哪一档。
 */
function decorativePairs(sceneMap) {
  const { surfaces, foregrounds } = collectRoles(sceneMap);
  const rows = [];
  for (const fg of foregrounds) {
    // 工具面族（--hos-tool-*）不参与这张表：它们只压 --hos-tool-* 那几档中性面，
    // 从不压场景插画；收进来只会给这张参考表添一堆「页面上不存在」的组合。
    if (fg.name.startsWith("--hos-tool-")) continue;
    for (const bg of surfaces) {
      const ratio = contrast(composite(fg.color, bg.color), bg.color);
      if (ratio >= 4.5) continue;
      rows.push({
        fg: fg.name,
        bg: bg.name.replace(/^--(?:hos|hb)-/, ""),
        ratio: Number(ratio.toFixed(2))
      });
    }
  }
  return rows.sort((a, b) => a.ratio - b.ratio);
}

/**
 * 亮底上的深色字（`--hos-on-bright`）单独判。
 *
 * 它的对照面不是夜空底而是四束光的主按钮渐变 —— 在 `#ffd9a0 → #e09523` 上都要能读。
 * 混进上面那张表会得到「on-bright 压在 sky-deep 上只有 1.04:1」这种正确但无意义的结果
 * （深色字压在深色底上当然不达标，可它从来不会被放在那里）。
 */
function checkOnBright(sceneMap) {
  const source = resolveColor("--hos-on-bright", sceneMap);
  if (!source) return [];
  const targets = [
    "--hos-accent-bright",
    "--hos-accent",
    "--hos-accent-deep",
    "--hos-lumen-bright",
    "--hos-lumen",
    "--hos-eco-bright",
    "--hos-eco",
    "--hos-aura-bright",
    "--hos-aura",
    "--hos-alert-bright",
    "--hos-alert",
    "--hos-cool",
    "--hos-sensor-bright"
  ];
  const problems = [];
  for (const name of targets) {
    const target = resolveColor(name, sceneMap);
    if (!target) continue;
    const ratio = contrast(source.color, target.color);
    if (ratio >= 4.5) continue;
    problems.push({
      fg: "--hos-on-bright",
      bg: name.replace(/^--hos-/, ""),
      ratio: Number(ratio.toFixed(2))
    });
  }
  return problems.sort((a, b) => a.ratio - b.ratio);
}

// ---------------------------------------------------------------------------
// 6) 近似重复的颜色簇（把「2000 处字面量」变成一张可排序的清单）
// ---------------------------------------------------------------------------

/**
 * redmean 色差 —— 比裸欧氏距离更贴近人眼对灰阶的判别。
 *
 * 用它的唯一理由是**中性灰**：本仓三个工具面（编辑器 / 渲染器 / 工作室）各自
 * 独立推了一套中性灰阶，同一档在不同文件里差 1–3 个单位（`#aeb7bc` vs `#aeb7bd`
 * vs `#aeb9c2`）。裸欧氏距离在这种「只差 1 个通道」的情形下给出的数很小、
 * 与「完全同色」区分不开，而 redmean 对绿通道加权更重、且随亮度自适应，
 * 正好把这类差异稳定地落在一个可判定的区间里。
 */
function redmean(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const rmean = (a.r + b.r) / 2;
  return Math.sqrt(
    (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db
  );
}

/** 彩度（HSV 的 S）。用来把「中性灰簇」与「有色调的品牌色簇」分开报。 */
function saturation(color) {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * 把全站的字面量按色差聚类 —— **星形聚类，不做传递闭包**。
 *
 * 第一版用的是并查集（A≈B、B≈C 则 A≈C），结果整条灰阶被链成一坨：
 * 三个巨大的簇（575 / 343 / 273 处、上千个值），读起来比原始清单还难用 ——
 * 因为「整条中性灰阶」本来就是连续的，任何传递性聚类都会把它连成一块。
 *
 * 改成星形：按出现次数从多到少扫，每个尚未归类的值**自己当簇心**，只吸收
 * 「与簇心」在阈值内的值。于是簇是「某一档灰 + 它的几个近值」，
 * 而不是「一整条灰阶」，正好对应要做的动作（把这几处并到那一档上）。
 *
 * 阈值 12：本仓实测「同一档灰」的差在 1–3 个通道，redmean 约 2–11；
 * 而刻意相邻的两档（#343e46 与 #46515a）Δ≈27。12 把两边都留出余量。
 */
const DRIFT_THRESHOLD = 12;

function clusterLiterals(stylesheets) {
  /** literal → { color, count, files:Set, props:Map } */
  const index = new Map();
  for (const entry of stylesheets) {
    for (const item of entry.other) {
      if (!/^#[0-9a-f]{6}$/.test(item.literal)) continue;
      if (!index.has(item.literal)) {
        index.set(item.literal, { color: item.color, count: 0, files: new Set(), props: new Map() });
      }
      const record = index.get(item.literal);
      record.count += 1;
      record.files.add(entry.file.replace(/^(frontend|store)\/static\//, "").replace(/\.css$/, ""));
      // 角色构成（按属性族归并）。收簇的前提是**角色同质** —— 详见 roleFamily。
      const family = roleFamily(item.prop, item.material);
      record.props.set(family, (record.props.get(family) ?? 0) + 1);
    }
  }

  // 簇心优先取「出现最多的值」：它最可能是这一档本来的取值，其余是各文件推出来的近值。
  const ordered = [...index.entries()].sort((a, b) => b[1].count - a[1].count);
  const claimed = new Set();
  const groups = [];
  for (const [key, record] of ordered) {
    if (claimed.has(key)) continue;
    claimed.add(key);
    const members = [{ literal: key, ...record }];
    for (const [otherKey, otherRecord] of ordered) {
      if (claimed.has(otherKey)) continue; // 单向：只吸进尚未归类的，保证只有一个簇心
      if (redmean(record.color, otherRecord.color) > DRIFT_THRESHOLD) continue;
      claimed.add(otherKey);
      members.push({ literal: otherKey, ...otherRecord });
    }
    if (members.length < 2) continue;
    const total = members.reduce((sum, item) => sum + item.count, 0);
    if (total < 4) continue;
    // 整簇的角色构成：成员各自的 props 加起来。
    // 「单一角色」才可以直接收成一档；混角色（如文字 5 处 + 描边 8 处）必须先拆开，
    // 否则就是拿一个令牌去演两个角色 —— 正是本仓一直在修的那种名实不符。
    const roleTally = new Map();
    for (const member of members) {
      for (const [family, n] of member.props) {
        roleTally.set(family, (roleTally.get(family) ?? 0) + n);
      }
    }
    groups.push({
      members: members.sort((a, b) => b.count - a.count),
      total,
      files: [...new Set(members.flatMap(item => [...item.files]))].sort(),
      lead: members[0],
      neutral: saturation(record.color) < 0.18,
      roleTally,
      // 材质类属性（渐变停点 / 阴影 / 器件填充）单独标出来：它们**不该**被收进 chrome 令牌，
      // 所以「单一角色 = material」的簇不是待办，而是「到此为止」的结论。
      materialOnly: [...roleTally.keys()].every(family => family === "material")
    });
  }
  return groups.sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const sceneTokens = parseRootTokens(read(path.join(ROOT, "design/scene/page.css")));
const storeTokens = parseRootTokens(read(path.join(ROOT, "store/static/theme.css")));
const storeCssText = read(path.join(ROOT, "store/static/theme.css"));

/**
 * 调色板字面量 → 扮演哪些角色。用于把「与令牌同值」的字面量指出来。
 *
 * 只登记**不透明**的基础色：半透明派生色（`-soft` / `-line`）在源码里是
 * `rgba(var(--x-rgb), .13)` 这种**引用**写法，匹配不上某个 hex，收进来只会有害。
 */
function buildPaletteValues() {
  const map = new Map();
  for (const [name, tokens] of [
    ["hos", sceneTokens],
    ["hb", storeTokens]
  ]) {
    for (const [tokenName] of tokens) {
      if (/-rgb$/.test(tokenName)) continue;
      const resolved = resolveColor(tokenName, tokens);
      if (!resolved || resolved.color.a < 1) continue;
      const key = `#${[resolved.color.r, resolved.color.g, resolved.color.b]
        .map(value => value.toString(16).padStart(2, "0"))
        .join("")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(`${name}:${tokenName}`);
    }
  }
  return map;
}

const paletteValues = buildPaletteValues();

/**
 * 真值归属文件：它们 `:root` 里的字面量就是调色板本身，统计成债务毫无意义。
 * 其余文件（renderer / app / studio / stage …）都是**消费方**，那里的字面量才是债务。
 *
 * 两份分发副本也要算进来 —— 它们与 design/scene/page.css 逐字节相同（第 1 项真值校验
 * 保证这一点），不登记的话审计会把同一份调色板报三遍、每次 32 处。
 */
const TOKEN_OWNER_FILES = new Set([
  "design/scene/page.css",
  "frontend/static/auth/scene/page.css",
  "store/static/scene/page.css",
  "store/static/theme.css"
]);

function auditStylesheets() {
  const report = [];
  for (const file of walk(ROOT, new Set([".css"]))) {
    const relative = rel(file);
    const text = read(file);
    const findings = collectLiterals(
      text,
      TOKEN_OWNER_FILES.has(relative) ? tokenBlockEndOffset(text) : -1
    );
    if (findings.length === 0) continue;
    const buckets = classifyLiterals(findings, paletteValues);
    const allowed = isAllowedLiteral(relative);
    report.push({
      file: relative,
      total: findings.length,
      legit: buckets.legit.length,
      // 已登记例外的文件，它的「palette 命中」同样不算债务 —— 例外的理由（独立文件读不到
      // CSS 变量、必须早于令牌表渲染）对这两类命中一视同仁。
      palette: allowed ? [] : buckets.palette,
      other: allowed ? [] : buckets.other,
      allowedReason: allowed ? allowed.reason : null
    });
  }
  return report.sort((a, b) => b.other.length - a.other.length);
}

/**
 * JS / HTML 里的字面量单独一栏，不与 CSS 混排。
 *
 * 理由：SVG 与 2D canvas **读不到 CSS 变量**，那边的字面量有一部分是不可避免的
 * （`light-range-editor.js` 就是因为这个改成了 `paletteColor()` 从计算样式取一次）。
 * 把它们计入 CSS 的债务会掩盖真正可修的那些。
 */
function auditScriptLiterals() {
  const report = [];
  for (const file of walk(ROOT, new Set([".js", ".html"]))) {
    const relative = rel(file);
    if (relative.startsWith("tools/")) continue;
    if (relative.startsWith("frontend/static/vendor/")) continue;
    if (isAllowedLiteral(relative)) continue;
    const source = stripScriptComments(read(file));
    // 先圈出所有 paletteColor(...) 调用区间：它们第二个参数是**兜底色**，
    // 按设计就该逐字节等于令牌的 canonical 值（check_invariants.mjs 第 12 条专门校验这一点），
    // 所以「与令牌同值」在这里是**要求**而不是债务。CSS 侧的 var(--x, #兜底) 一直是这么归类的，
    // 这里只是把 JS 侧同一件事对齐，否则每写一枚合规兜底就多一条假债务。
    const fallbackSpans = [];
    for (const call of source.matchAll(/\bpaletteColor\s*\(/g)) {
      let depth = 0;
      let index = call.index + call[0].length - 1;
      for (; index < source.length; index += 1) {
        const character = source[index];
        if (character === "(") depth += 1;
        else if (character === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      fallbackSpans.push([call.index, index]);
    }
    const insideFallback = position =>
      fallbackSpans.some(([start, end]) => position > start && position < end);
    // 具名兜底常量：`const STUDIO_ACCENT_FALLBACK = "#ffc46a";` 与调用点上的兜底是同一件事，
    // 只是提到了常量、以便多处共用 / 在注释里引用 —— 同样属于「按设计就该等于令牌值」。
    // 命名约定（含 FALLBACK 的全大写名）是判据，所以名字写错就会被当债务报出来。
    // 名字可以带前后缀（`CHART_THRESHOLD_FALLBACK_COLORS` 是数组、元素散在声明行上）。
    const fallbackConstantLines = new Set();
    // 下面几类字面量**结构上就吃不下 var()**，与主题无关，不算债务。判据都写在代码形状上，
    // 不是按文件白名单 —— 文件里新加的、真正该跟主题的颜色仍会被报出来。
    const untokenizableLines = new Set();
    source.split("\n").forEach((line, index) => {
      if (/^\s*(?:export\s+)?(?:const|let|var)\s+[A-Z][A-Z0-9_]*FALLBACK[A-Z0-9_]*\s*=/.test(line)) {
        fallbackConstantLines.add(index + 1);
      }
      // 数据形态：{ token: "--hos-x", fallback: "#lit", rgbFallback: "r, g, b" }
      // 一行里可能同时有 fallback 与 rgbFallback 两枚，都属于「与令牌同值是要求」。
      if (/\btoken\s*:\s*["']--(?:hos|hb)-/.test(line) && /\b(?:rgb|rgba)?[Ff]allback\s*:/.test(line)) {
        fallbackConstantLines.add(index + 1);
      }
      // meta[name=theme-color] 的 content：meta 不参与 CSS 级联，var() 无从解析。
      // （display.html 的启动图同属这一条，并在那边写了完整理由。）
      if (/\bname\s*=\s*["']theme-color["']/.test(line)) untokenizableLines.add(index + 1);
      // <input type="color" value="#…">：按 HTML 规范 value 必须是简单颜色字面量，不吃 var()。
      if (/\btype\s*=\s*["']color["']/.test(line) && /\bvalue\s*=\s*["']#/.test(line)) {
        untokenizableLines.add(index + 1);
      }
      // placeholder="#ffc46a"：那是**输入提示文字**，本来就不是颜色，只是长得像。
      if (/\bplaceholder\s*=\s*["']#/.test(line)) untokenizableLines.add(index + 1);
    });
    const findings = [];
    for (const match of source.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      if (insideFallback(match.index)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      if (fallbackConstantLines.has(line)) continue;
      if (untokenizableLines.has(line)) continue;
      const color = parseColor(match[0]);
      if (!color || isOverlay(color)) continue;
      const roles = paletteValues.get(match[0].toLowerCase());
      if (!roles) continue;
      findings.push({
        literal: match[0].toLowerCase(),
        line,
        roles
      });
    }
    if (findings.length === 0) continue;
    report.push({ file: relative, palette: findings });
  }
  return report.sort((a, b) => b.palette.length - a.palette.length);
}

if (!JSON_MODE) {
  console.log("配色审计（只读）。真值校验平时应当是绿的；债务度量用来定优先级。\n");
}

const syncProblems = checkSceneSync();
const mirrorProblems = checkTokenMirror(storeTokens, sceneTokens);
const contractProblems = [
  ...checkSoftLineContract(storeTokens, readAppearanceContract()),
  ...checkToneTextWiring(storeTokens, storeCssText)
];
const stylesheets = auditStylesheets();
const scripts = auditScriptLiterals();
const contrastReport = contrastMatrix(sceneTokens, storeTokens);
const contrastProblems = [...contrastReport.problems, ...checkOnBright(sceneTokens)];
const contrastNotes = contrastReport.notes;
const contrastExempt = contrastReport.exempt;
const decorative = decorativePairs(sceneTokens);
const driftClusters = clusterLiterals(stylesheets);

const totals = stylesheets.reduce(
  (accumulator, entry) => ({
    total: accumulator.total + entry.total,
    legit: accumulator.legit + entry.legit,
    palette: accumulator.palette + entry.palette.length,
    other: accumulator.other + entry.other.length
  }),
  { total: 0, legit: 0, palette: 0, other: 0 }
);

if (JSON_MODE) {
  console.log(
    JSON.stringify(
      { syncProblems, mirrorProblems, contractProblems, stylesheets, scripts, contrastProblems, contrastExempt, driftClusters, totals },
      null,
      2
    )
  );
  process.exit(syncProblems.length || mirrorProblems.length || contractProblems.length ? 1 : 0);
}

// --- 真值校验 ---
console.log("=== 真值校验（应当全绿）===");
if (syncProblems.length === 0) {
  console.log("[ok] design/scene 的五份文件在三处副本中逐字节一致");
} else {
  console.error(`[fail] design/scene 分发副本不一致 —— ${syncProblems.length} 处`);
  for (const problem of syncProblems) console.error(`       ${problem.file}: ${problem.detail}`);
}
if (mirrorProblems.length === 0) {
  console.log(`[ok] --hb-* / --hos-* 镜像表 ${Object.keys(MIRROR_ALIAS).length} 对逐 token 相等`);
} else {
  console.error(`[fail] --hb-* / --hos-* 走散 —— ${mirrorProblems.length} 处`);
  for (const problem of mirrorProblems) console.error(`       ${problem.file}: ${problem.detail}`);
}
if (contractProblems.length === 0) {
  console.log("[ok] soft / line 的 α 与 -text 三件套符合 appearance.js 发出的契约（八族逐族）");
} else {
  console.error(`[fail] soft / line / text 契约被破坏 —— ${contractProblems.length} 处`);
  for (const problem of contractProblems) console.error(`       ${problem.file}: ${problem.detail}`);
}

// --- 债务度量 ---
console.log("\n=== 颜色字面量（去注释后；合法 = 叠加层 / var() 兜底 / 调色板定义）===");
console.log(
  `${"文件".padEnd(52)}${"合计".padStart(6)}${"合法".padStart(7)}` +
    `${"palette".padStart(9)}${"债务".padStart(7)}  唯一值`
);
for (const entry of stylesheets) {
  if (entry.other.length === 0 && entry.palette.length === 0) continue;
  const unique = new Set(entry.other.map(item => item.literal)).size;
  const flag = entry.allowedReason ? "  [已登记例外]" : "";
  console.log(
    `${entry.file.padEnd(52)}${String(entry.total).padStart(6)}` +
      `${String(entry.legit).padStart(7)}${String(entry.palette.length).padStart(9)}` +
      `${String(entry.other.length).padStart(7)}${String(unique).padStart(9)}${flag}`
  );
}
console.log(
  `${"合计".padEnd(52)}${String(totals.total).padStart(6)}` +
    `${String(totals.legit).padStart(7)}${String(totals.palette).padStart(9)}` +
    `${String(totals.other).padStart(7)}`
);

const paletteOffenders = stylesheets.filter(entry => entry.palette.length > 0);
if (paletteOffenders.length > 0) {
  console.log(
    "\n--- 与令牌同值却写成字面量（改成 var() 后，管理员换主控色时它会跟着走）---"
  );
  for (const entry of paletteOffenders) {
    // 按**字面量**归并再列角色：同一个 hex 往往同时等于 --hos-eco 与 --hb-eco，
    // 那是同一件事的两个名字，按角色分行会把 9 处写成 27 行。
    const byLiteral = new Map();
    for (const item of entry.palette) {
      if (!byLiteral.has(item.literal)) byLiteral.set(item.literal, { roles: new Set(), lines: [], props: new Set() });
      const bucket = byLiteral.get(item.literal);
      for (const role of item.roles) bucket.roles.add(role);
      if (item.prop) bucket.props.add(item.prop);
      bucket.lines.push(item.line);
    }
    console.log(`  ${entry.file}`);
    for (const [literal, bucket] of [...byLiteral].sort((a, b) => b[1].lines.length - a[1].lines.length)) {
      const tokens = [...bucket.roles].filter(role => role.startsWith("hos:")).map(role => role.slice(4));
      // 只列**角色对得上**的：底/描边属性该接面族令牌，color 属性该接文字族令牌。
      // 角色对不上的多半是巧合（渐变停点、中性主控色），硬接才叫名实不符。
      const family = familyOfProperty(bucket);
      const fits = family === null || family === "definition"
        ? (family === "definition" ? [] : tokens)
        : tokens.filter(token => {
            const tokenFamily = familyOfToken(token);
            return tokenFamily === "any" || tokenFamily === family;
          });
      const shown = bucket.lines.slice(0, 6).join(",");
      const suffix = bucket.lines.length > 6 ? ` …共 ${bucket.lines.length} 处` : "";
      const roles = fits.length > 0 ? fits.join(" / ") : "（无同族）";
      console.log(`      ${literal}  → ${roles}   行 ${shown}${suffix}`);
      if (fits.length === 0 && tokens.length > 0 && family === "definition") {
        console.log(`          ↳ 这是令牌自身的定义（${tokens.join(" / ")} 与它此刻同值）—— 要不要改成别名是另一个决定`);
      } else if (fits.length === 0 && tokens.length > 0) {
        console.log(`          ↳ 同值但角色不符：${tokens.join(" / ")} —— 那是别的角色碰巧取了同一个值，别硬接`);
      }
    }
  }
}

if (scripts.length > 0) {
  console.log("\n--- JS / HTML 里与令牌同值的字面量（SVG 与 2D canvas 读不到 CSS 变量）---");
  for (const entry of scripts) {
    console.log(`  ${entry.file}  ${entry.palette.length} 处`);
    for (const item of entry.palette.slice(0, 5)) {
      console.log(`      行 ${item.line}: ${item.literal} → ${item.roles.join(", ")}`);
    }
    if (entry.palette.length > 5) console.log(`      …另有 ${entry.palette.length - 5} 处`);
  }
}

console.log("\n=== 对比度：文字压在真实文字面上（正文档 4.5:1）===");
if (contrastProblems.length === 0) {
  console.log("[ok] 所有「前景令牌 × 真实文字面」组合都达标");
} else {
  const grouped = new Map();
  for (const problem of contrastProblems) {
    if (!grouped.has(problem.fg)) grouped.set(problem.fg, []);
    grouped.get(problem.fg).push(problem);
  }
  for (const [fg, list] of grouped) {
    const detail = list
      .sort((a, b) => a.ratio - b.ratio)
      .map(item => `${item.bg} ${item.ratio}`)
      .join(" · ");
    console.log(`  ${fg.padEnd(28)}${detail}`);
  }
  console.log(`  —— 共 ${contrastProblems.length} 对不达标。`);
  console.log("  说明：面取自 TEXT_SURFACES（玻璃面已按最坏叠底合成），不是原始天空档位；");
  console.log(
    "        「文字 × 天空档位」的参考值见下方 decorative 段，那些组合页面上多数不存在。"
  );
}

if (contrastExempt.length > 0) {
  console.log("\n=== 豁免登记（刻意低于 AA，有据可依；不计入失败数）===");
  const grouped = new Map();
  for (const item of contrastExempt) {
    if (!grouped.has(item.fg)) grouped.set(item.fg, { basis: item.basis, list: [] });
    grouped.get(item.fg).list.push(item);
  }
  for (const [fg, bucket] of grouped) {
    const detail = bucket.list
      .sort((a, b) => a.ratio - b.ratio)
      .map(item => `${item.bg} ${item.ratio}`)
      .join(" · ");
    console.log(`  ${fg.padEnd(28)}${detail}`);
    console.log(`      —— 依据：${bucket.basis}`);
  }
  console.log(`  —— 共 ${contrastExempt.length} 对。改这几个令牌的值之前先读依据：把值提到 4.5:1`);
  console.log("     会改变语义（禁用态看起来像可用态），不是「顺手修一下」。");
}

if (contrastNotes.length > 0) {
  console.log("\n=== 按契约不该出现的组合（超出该档声明的使用上限，列此备查）===");
  const grouped = new Map();
  for (const note of contrastNotes) {
    if (!grouped.has(note.fg)) grouped.set(note.fg, []);
    grouped.get(note.fg).push(note);
  }
  for (const [fg, list] of grouped) {
    const ceiling = FOREGROUND_CEILING[fg];
    console.log(`  ${fg}  —— ${ceiling ? ceiling.reason : "未登记上限"}`);
    const detail = list
      .sort((a, b) => a.ratio - b.ratio)
      .map(item => `${item.bg} ${item.ratio}`)
      .join(" · ");
    console.log(`      超出上限的面：${detail}`);
  }
}

if (decorative.length > 0) {
  console.log("\n=== 参考：文字 × 原始天空档位（页面上不存在，仅备查）===");
  const grouped = new Map();
  for (const row of decorative) {
    if (!grouped.has(row.fg)) grouped.set(row.fg, []);
    grouped.get(row.fg).push(row);
  }
  for (const [fg, list] of grouped) {
    const detail = list
      .sort((a, b) => a.ratio - b.ratio)
      .map(item => `${item.bg} ${item.ratio}`)
      .join(" · ");
    console.log(`  ${fg.padEnd(28)}${detail}`);
  }
}

const decorativeBadge = `（另有 ${decorative.length} 对天空档位组合低于 4.5:1，见 decorative 段）`;
console.log(`\n${decorativeBadge}`);

console.log(
  `\n=== 近似重复的颜色簇（星形聚类，色差 ≤ ${DRIFT_THRESHOLD}，共 ${driftClusters.length} 簇、` +
    `${driftClusters.reduce((sum, group) => sum + group.total, 0)} 处）===`
);
console.log("簇心是出现最多的那个值（最可能是这一档本来的取值），其余是各文件独立推出来的近值。");
if (driftClusters.length === 0) {
  console.log("[ok] 没有近似重复的颜色簇");
} else {
  for (const group of driftClusters.slice(0, 30)) {
    const kind = group.neutral ? "中性" : "有色";
    const shown = group.members.slice(0, 10);
    const rest = group.members.length - shown.length;
    const tally = [...group.roleTally].sort((a, b) => b[1] - a[1]);
    const materialCount = group.roleTally.get("material") ?? 0;
    const chrome = tally.filter(([family]) => family !== "material" && family !== "other");
    const chromeTotal = chrome.reduce((sum, [, n]) => sum + n, 0);
    // 结论写在簇标题行：一个令牌只能演一个角色，混角色的簇必须先拆；
    // 材质（渐变停点 / 器件填充）不该收进 chrome 令牌 —— 收了会把刻意的明暗层次抹平，
    // 所以先把它排除，只看**剩下的 chrome 部分**是否同质。
    const verdict = chromeTotal === 0
      ? "全材质 → 不收"
      : chrome.length === 1
        ? `chrome 只有 ${chrome[0][0]}×${chrome[0][1]} → 可收为一档`
        : `chrome 角色混合（${chrome.map(([f, n]) => `${f}×${n}`).join(" ")}）→ 先拆后收`;
    console.log(
      `  ${kind}  共 ${String(group.total).padStart(4)} 处 / ${group.members.length} 个值` +
        `  簇心 ${group.lead.literal}    ${verdict}`
    );
    console.log(
      `        角色 ${tally.map(([family, n]) => `${family}×${n}`).join(" ")}` +
        (materialCount > 0 ? `（材质 ${materialCount} 处不计入可收范围）` : "")
    );
    console.log(
      `        ${shown.map(item => `${item.literal}×${item.count}`).join(" ")}` +
        (rest > 0 ? `  …另 ${rest} 个` : "")
    );
    console.log(`        ${group.files.join(" · ")}`);
  }
  if (driftClusters.length > 30) {
    const rest = driftClusters.slice(30);
    console.log(
      `  …另有 ${rest.length} 簇（合计 ${rest.reduce((sum, group) => sum + group.total, 0)} 处）未列出`
    );
  }
}

const failed = syncProblems.length > 0 || mirrorProblems.length > 0 || contractProblems.length > 0;
console.log("");
if (failed) {
  console.error("真值校验未通过：请先修上面的 [fail] 项，再谈债务度量。");
  process.exit(1);
}
console.log("真值校验通过。债务度量仅供定优先级，不置退出码（见文件头说明）。");
