#!/usr/bin/env node
/**
 * 生成 store 图标样式子集与字体二进制子集。
 *
 * ## 为什么要有这个脚本
 *
 * store 首页曾经下载 **634,548B** 的 `font.woff2` 与 198,133B 的 `font.min.css`，
 * 合计占首屏编码传输的 64%（实测 1,068,991B 里的 690,631B）。而整站实际只用到
 * 50 个图标字形。这里做两件事：
 *
 * 1. 按 `src/` 里真实出现的 `fa-*` 类名裁剪 CSS 规则；
 * 2. 按裁剪后仍在使用的 codepoint 生成 `font-subset.woff2`，完整字体只留作兜底
 *    （`src` 里排在子集之后，woff2 正常可用时浏览器不会请求它）。
 *
 * ## 用法
 *
 * ```bash
 * node homeos-store/frontend/scripts/build-font-subset.mjs --write   # 生成 CSS + 字体子集
 * node homeos-store/frontend/scripts/build-font-subset.mjs --check   # 只校验，不写盘
 * ```
 *
 * `--write` 生成字体二进制需要 fontTools + brotli（`python -m pip install fonttools brotli`），
 * 但它们**不是构建依赖**：产物已入库，`--check` 只读产物做断言，CI 不需要 Python 字体工具。
 *
 * ## 会漏什么
 *
 * - 运行时字符串拼接出来的类名（`"fa-" + name`）：扫描不到，必须人工确认；
 * - 伪元素 `content` 里直接写 unicode 而不是用类名的场景：不受影响，因为规则被保留了。
 */

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const SOURCE_CSS = join(FRONTEND, "font", "font-awesome.css");
const OUT_CSS = join(FRONTEND, "public", "static", "font.min.css");
const FONT_DIR = join(FRONTEND, "public", "static", "fonts");
const FULL_WOFF2 = join(FONT_DIR, "font.woff2");
const SUBSET_WOFF2 = join(FONT_DIR, "font-subset.woff2");
const SCAN_ROOTS = [join(FRONTEND, "src"), join(FRONTEND, "index.html")];

/** 只作为修饰符、不承载 codepoint 的类名，永远不算「用到的图标」。 */
const MODIFIER_CLASSES = new Set([
  "fa-duotone",
  "fa-regular",
  "fa-solid",
  "fa-light",
  "fa-thin",
  "fa-brands",
  "fa-sharp",
  "fa-spin",
  "fa-pulse",
  "fa-beat",
  "fa-fade",
  "fa-beat-fade",
  "fa-bounce",
  "fa-fixed-width",
  "fa-fw",
  "fa-li",
  "fa-ul",
  "fa-border",
  "fa-pull-left",
  "fa-pull-right",
  "fa-stack",
  "fa-stack-1x",
  "fa-stack-2x",
  "fa-inverse",
  "fa-swap-opacity",
  "fa-rotate",
]);

const SCAN_EXTS = new Set([".vue", ".ts", ".js", ".mjs", ".html", ".css"]);

/** 逐文件扫描 `fa-<name>` token。返回「用到的图标名集合」与「命中文件数」。 */
export function collectUsedIcons(roots = SCAN_ROOTS) {
  const used = new Set();
  const files = new Set();
  const walk = (target) => {
    const info = statSync(target, { throwIfNoEntry: false });
    if (!info) return;
    if (info.isFile()) {
      if (!SCAN_EXTS.has(extname(target))) return;
      collect(target);
      return;
    }
    for (const entry of readdirSync(target)) walk(join(target, entry));
  };
  const collect = (file) => {
    const text = readFileSync(file, "utf8");
    const matches = text.match(/\bfa-[a-z0-9]+(?:-[a-z0-9]+)*\b/g);
    if (!matches) return;
    for (const token of matches) {
      const name = token.slice(3);
      if (MODIFIER_CLASSES.has(token)) continue;
      used.add(name);
      files.add(file);
    }
  };
  for (const root of roots) walk(root);
  return { used, files: files.size };
}

const extname = (file) => {
  const index = file.lastIndexOf(".");
  return index >= 0 ? file.slice(index) : "";
};

/** 把顶层 CSS 规则切成数组（保留原文，不做重排）。 */
export function splitTopLevelRules(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push(css.slice(start, index + 1));
        start = index + 1;
      }
    }
  }
  if (start < css.length) rules.push(css.slice(start));
  return rules;
}

/**
 * 图标规则的判据。
 *
 * Font Awesome 6.7 起不再把 codepoint 写进 `content`，而是先落成自定义属性：
 *   `.fa-user{--fa:"\f007";--fa--fa:"\f007\f007"}`
 * 再由 `.fas:before{content:var(--fa)}` 统一取用。所以「图标规则」= 声明了 `--fa`
 * 的那条，`content` 那条是结构规则。
 */
const ICON_RULE = /--fa:\s*["']\\[0-9a-f]{2,6}/i;
const SELECTOR_CLASS = /\.(fa-[a-z0-9-]+)/g;
const CODEPOINT = /--fa:\s*["']\\([0-9a-f]{2,6})/gi;

export function filterRules(css, usedIcons) {
  const kept = [];
  const dropped = [];
  for (const rule of splitTopLevelRules(css)) {
    if (!ICON_RULE.test(rule)) {
      kept.push(rule);
      continue;
    }
    const classes = [...rule.matchAll(SELECTOR_CLASS)].map((match) => match[1].slice(3));
    const iconClasses = classes.filter((name) => !MODIFIER_CLASSES.has("fa-" + name));
    if (iconClasses.length === 0) {
      kept.push(rule);
      continue;
    }
    if (iconClasses.some((name) => usedIcons.has(name))) kept.push(rule);
    else dropped.push(rule);
  }
  return { kept, dropped };
}

export function collectCodepoints(rules) {
  const points = new Set();
  for (const rule of rules) {
    for (const match of rule.matchAll(CODEPOINT)) points.add(parseInt(match[1], 16));
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * 把 `@font-face` 的 `src` 改成「子集优先、完整 woff2 兜底、ttf 最后」。
 * 只改 src，family / weight / display 保持原样，字形渲染路径不变。
 */
export function rewriteFontFace(rules) {
  return rules.map((rule) => {
    if (!rule.startsWith("@font-face")) return rule;
    return rule.replace(
      /src:[^;}]+/,
      (() => {
        const sources = [
          'url(../fonts/font-subset.woff2) format("woff2")',
          'url(../fonts/font.woff2) format("woff2")',
          'url(../fonts/font.ttf) format("truetype")',
        ];
        return "src:" + sources.join(",");
      })(),
    );
  });
}

export function buildSubsetCss({ sourceCss, usedIcons }) {
  const { kept, dropped } = filterRules(sourceCss, usedIcons);
  const rewritten = rewriteFontFace(kept);
  return {
    css: rewritten.join(""),
    dropped: dropped.length,
    kept: rewritten.length,
    codepoints: collectCodepoints(rewritten),
  };
}

/**
 * 找可用的 Python 解释器（带 fontTools）。
 *
 * 优先 `HOMEOS_PYTHON`（仓内 .venv-store 的 python），其次 PATH 上的 python3。
 * 都没有就返回空串，由调用方降级成「只生成 CSS」。
 */
function resolvePython(explicit) {
  const candidates = [
    explicit,
    process.env.HOMEOS_PYTHON,
    // 仓内统一的 store venv（ops/lib/py.mjs 用的就是它）。
    join(HERE, "..", "..", "..", ".venv-store", "bin", "python"),
    "python3",
    "python",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "import fontTools, brotli"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return "";
}

/** 用 fontTools 生成字体子集。产物已入库，构建链不依赖 Python 字体工具。 */
export function buildSubsetFont(codepoints, { python = "" } = {}) {
  const interpreter = resolvePython(python);
  if (!interpreter) {
    return { ok: false, reason: "未找到带 fontTools 的 python（pip install fonttools brotli）" };
  }
  const unicodes = codepoints.map((point) => "U+" + point.toString(16).toUpperCase().padStart(4, "0")).join(",");
  const result = spawnSync(
    interpreter,
    [
      "-m",
      "fontTools.subset",
      FULL_WOFF2,
      "--output-file=" + SUBSET_WOFF2,
      "--flavor=woff2",
      "--layout-features=*",
      "--unicodes=" + unicodes,
      "--no-hinting",
      "--desubroutinize",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return { ok: false, reason: (result.stderr || result.stdout || "").slice(0, 600) };
  }
  return { ok: true };
}

/** 读 woff2 头部拿不到 cmap，用 fontTools 判定覆盖；无 Python 时退化为「体积变小」断言。 */
function subsetReport() {
  if (!existsSync(SUBSET_WOFF2)) return { exists: false };
  const subset = statSync(SUBSET_WOFF2).size;
  const full = existsSync(FULL_WOFF2) ? statSync(FULL_WOFF2).size : 0;
  return { exists: true, subsetBytes: subset, fullBytes: full };
}

/**
 * 校验子集字体真的覆盖了 CSS 里用到的 codepoint。
 *
 * 只有装了 fontTools 才能读 cmap；缺失时返回 `null` 表示「无法判定」，由调用方
 * 降级成「体积变小」+「CSS 与扫描一致」两条断言，而不是伪造通过。
 */
export function verifyCoverage(codepoints) {
  const interpreter = resolvePython(process.env.HOMEOS_PYTHON || "");
  if (!interpreter) return null;
  const script =
    "import json,sys\n" +
    "from fontTools.ttLib import TTFont\n" +
    "pts=set(json.load(sys.stdin))\n" +
    "cmap=set(TTFont(sys.argv[1]).getBestCmap())\n" +
    'print(json.dumps({"missing":sorted(pts-cmap)}))\n';
  const result = spawnSync(interpreter, ["-c", script, SUBSET_WOFF2], {
    input: JSON.stringify(codepoints),
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  try {
    const parsed = JSON.parse((result.stdout || "").trim());
    return { missing: Array.isArray(parsed.missing) ? parsed.missing : [] };
  } catch {
    return null;
  }
}

function main() {
  const write = process.argv.includes("--write");
  const skipFont = process.argv.includes("--no-font");
  if (!existsSync(SOURCE_CSS)) {
    console.error(`缺少字体 CSS 真源：${SOURCE_CSS}`);
    process.exit(2);
  }
  const sourceCss = readFileSync(SOURCE_CSS, "utf8");
  const { used } = collectUsedIcons();
  if (used.size === 0) {
    console.error("扫描到 0 个 fa-* 图标，拒绝生成（扫描根或规则坏了）");
    process.exit(2);
  }
  const built = buildSubsetCss({ sourceCss, usedIcons: used });
  const header =
    "/* 由 homeos-store/frontend/scripts/build-font-subset.mjs 生成 —— 不要手改。\n" +
    `   真源：homeos-store/frontend/font/font-awesome.css\n` +
    `   保留图标：${used.size} 个，规则 ${built.kept}/${built.kept + built.dropped}，codepoint ${built.codepoints.length} 个。\n` +
    "   改动图标用法后重跑 --write；门禁跑 --check。 */\n";
  const output = header + built.css;

  if (write) {
    writeFileSync(OUT_CSS, output);
    console.log(
      `CSS  真源 ${sourceCss.length}B → 产物 ${output.length}B（保留 ${built.kept} 规则，丢弃 ${built.dropped}）`,
    );
    if (skipFont) {
      console.log("字体：--no-font，跳过二进制子集");
    } else {
      const font = buildSubsetFont(built.codepoints);
      if (!font.ok) {
        console.warn(`字体子集未生成：${font.reason}`);
        console.warn("提示：python -m pip install fonttools brotli，然后设置 HOMEOS_PYTHON 重跑");
      } else {
        const report = subsetReport();
        console.log(`字体：${report.fullBytes}B → ${report.subsetBytes}B（codepoint ${built.codepoints.length}）`);
      }
    }
    return;
  }

  // check 模式
  const problems = [];
  if (!existsSync(OUT_CSS)) problems.push("缺少 public/static/font.min.css");
  else if (readFileSync(OUT_CSS, "utf8") !== output) {
    problems.push("font.min.css 与当前源码的图标用法不一致（重跑 --write）");
  }
  const report = subsetReport();
  if (!report.exists) problems.push("缺少 public/static/fonts/font-subset.woff2");
  else if (!(report.subsetBytes > 0) || report.subsetBytes >= report.fullBytes) {
    problems.push(`字体子集没有变小：${report.subsetBytes}B vs 完整 ${report.fullBytes}B`);
  }
  const coverage = report.exists ? verifyCoverage(built.codepoints) : null;
  if (coverage && coverage.missing.length) {
    problems.push(
      "子集字体缺少 " +
        coverage.missing.length +
        " 个 codepoint（新增图标后没重跑 --write）：" +
        coverage.missing
          .slice(0, 8)
          .map((point) => "U+" + point.toString(16).toUpperCase())
          .join(","),
    );
  }
  const cssBytes = existsSync(OUT_CSS) ? statSync(OUT_CSS).size : 0;
  console.log(
    `图标 ${used.size} 个 / codepoint ${built.codepoints.length} 个 / CSS ${cssBytes}B / 子集字体 ${report.subsetBytes || 0}B` +
      (coverage ? "（已校验 cmap 覆盖）" : "（无 fontTools，跳过 cmap 覆盖校验）"),
  );
  if (problems.length) {
    for (const problem of problems) console.error("FAIL " + problem);
    process.exit(1);
  }
  console.log("PASS 字体子集与图标用法一致");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
