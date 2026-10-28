/**
 * javascript-obfuscator 产物的静态还原。
 *
 * 上游前端（HA Bridge）用 javascript-obfuscator 打包：标识符全换成 `_0x…`，
 * 字符串常量塞进一个数组函数，再由 `_0x148b(0x96)` 这样的解码器按下标取回。
 * 它不是「不可读」，而是「读起来成本极高」—— 对一次版本比对来说，成本主要花在
 * 把 `_0x2a68b0(0x134)` 一条条查回 `'stopPropagation'` 上。
 *
 * 本模块做四件事，全部是纯静态：
 * 1. 从文件里抠出「数组函数 + 旋转 IIFE + 解码器」这三段引导代码；
 * 2. 在 `node:vm` 里跑这三段（只有它们，没有业务代码），拿到解码器函数；
 * 3. 把 `解码器别名(0xNN)` 全部内联成字面量，并把 `obj['name']` 收敛成 `obj.name`；
 * 4. `_0x…` 标识符按首次出现顺序改名为 `v1/v2…`，0x 数值转十进制，最后交给 js-beautify。
 *
 * 为什么用 vm 而不是自己实现旋转：旋转 IIFE 里是一段肉眼难验的算式
 * （`-parseInt(..)/1*(-parseInt(..)/2)+…`），自己重写一遍就等于引入第二个实现，
 * 一旦两边不一致，后面所有「差异」都是假的。让原始引导代码自己跑，才是唯一可信的。
 * 传给 vm 的上下文只含 `Math`/`parseInt` 这类纯函数，超时 2s，不碰网络与文件。
 */
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { js: beautifyJs } = require("js-beautify");

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** 找出以 `open`（`{` 或 `(`）开头、与之配平的结束下标；跳过字符串与注释。 */
function matchBracket(src, openIndex) {
  const open = src[openIndex];
  const close = open === "{" ? "}" : open === "(" ? ")" : "]";
  let depth = 0;
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < src.length) {
        if (src[i] === "\\") i += 2;
        else if (src[i] === quote) break;
        else i += 1;
      }
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      // 深度变负说明前面扫到了正则字面量里的括号（本工具不解析正则），
      // 立刻放弃，避免一路扫到文件尾 —— 那是 O(n²) 的来源。
      if (depth < 0) return -1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 抠出 `function <name>(){ const x=[...]; ... }` 整段（含函数体）。 */
function findFunctionBody(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return null;
  const brace = src.indexOf("{", at);
  if (brace < 0) return null;
  const end = matchBracket(src, brace);
  return end < 0 ? null : src.slice(at, end + 1);
}


/**
 * 还原一个文件的三段引导代码并在 vm 里求值。
 * @returns {{ decoderName: string, aliases: Set<string>, decode: (n: number) => string|undefined }}
 */
export function buildDecoder(src) {
  // 解码器可能定义在文件任意位置（业务代码在前、引导代码在后也很常见），
  // 所以特征「自赋值」必须在全文里找：`function X(a,b){const c=Y();return X=function…}`。
  const decoderMatch = src.match(
    /function (_0x[0-9a-f]+)\(_0x[0-9a-f]+,_0x[0-9a-f]+\)\{const _0x[0-9a-f]+=_0x[0-9a-f]+\(\);return \1=function/,
  );
  if (!decoderMatch) return null;
  const decoderName = decoderMatch[1];

  // 数组函数名：`function _0x…(){const _0x…=[`；旋转 IIFE 的第一个实参就是它。
  const arrayName = findArrayFunctionName(src);
  if (!arrayName) return null;
  const rotation = findRotationAny(src, arrayName);
  if (!rotation) return null;

  const arrayFn = findFunctionBody(src, arrayName);
  const decoderFn = findFunctionBody(src, decoderName);
  if (!arrayFn || !decoderFn) return null;

  const context = vm.createContext({ Math, parseInt, parseFloat, String, Number, Array, Object });
  try {
    new vm.Script(`${arrayFn}\n${decoderFn}\n${rotation}\n`).runInContext(context, { timeout: 2000 });
  } catch {
    return null;
  }
  const fn = context[decoderName];
  if (typeof fn !== "function") return null;

  // 解码器别名是「链式」的：混淆器给每个函数作用域发一个 `const _0x4429e0=_0x54a1aa;`，
  // 而 `_0x54a1aa` 本身又是 `_0x3605` 的别名。只找直接赋值会漏掉绝大多数调用点
  // （studio-app.js 有 606 个不同调用名，直连的只有 1 个），所以这里做传递闭包。
  const pairs = new Map();
  for (const m of src.matchAll(/(_0x[0-9a-f]+)\s*=\s*(_0x[0-9a-f]+)\b/g)) {
    if (!pairs.has(m[1])) pairs.set(m[1], m[2]);
  }
  const aliases = new Set([decoderName]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [alias, source] of pairs) {
      if (aliases.has(alias) || !aliases.has(source)) continue;
      aliases.add(alias);
      changed = true;
    }
  }

  return {
    decoderName,
    aliases,
    decode: (n) => {
      try {
        const value = fn(n);
        return typeof value === "string" ? value : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * 抠出旋转 IIFE：`(function(a,b){…}(ARRAYFN, 0xNN));`
 *
 * 不能再「遍历每个 `(function(` 再逐个配平」—— 混淆文件里 IIFE 很多，一旦某个括号
 * 因为正则字面量配不上就会一路扫到文件尾，整体退化成 O(n²)。改为先定位数组函数名，
 * 再用「(数组名, 0x…」这个唯一的调用点反查它所属的 IIFE 起点。
 */
function findRotationAny(src, arrayName) {
  if (!arrayName) return null;
  const callRe = new RegExp(`\\(\\s*${arrayName}\\s*,\\s*(?:0x[0-9a-f]+|\\d+)\\s*\\)`);
  const call = callRe.exec(src);
  if (!call) return null;
  const start = src.lastIndexOf("(function(", call.index);
  if (start < 0) return null;
  const brace = src.indexOf("{", start);
  if (brace < 0) return null;
  const bodyEnd = matchBracket(src, brace);
  if (bodyEnd < 0) return null;
  const argsOpen = src.indexOf("(", bodyEnd);
  const argsEnd = matchBracket(src, argsOpen);
  if (argsEnd < 0) return null;
  let end = argsEnd + 1;
  if (src[end] === ")") end += 1;
  return src.slice(start, end);
}

/** 数组函数名：`function _0x…(){const _0x…=[`。 */
function findArrayFunctionName(src) {
  return src.match(/function (_0x[0-9a-f]+)\(\)\s*\{\s*const _0x[0-9a-f]+\s*=\s*\[/)?.[1] ?? null;
}

/** 把 `别名(0xNN)` 内联成字符串字面量。只认解码器及其（传递）别名。 */
export function inlineStrings(src, decoder) {
  if (!decoder) return src;
  // 单趟扫描 + Set 查表：别名可能有 600 多个，拼成正则的「或」分支会让单次匹配退化成
  // 上百次前缀比较；这里只匹配形如 `名字(数字)` 的调用，再查表判断是不是解码器。
  return src.replace(
    /(?<![\w$.])(_0x[0-9a-f]+)\s*\(\s*(0x[0-9a-f]+|\d+)\s*\)/g,
    (whole, name, num) => {
      if (!decoder.aliases.has(name)) return whole;
      const value = decoder.decode(Number(num));
      return value === undefined ? whole : JSON.stringify(value);
    },
  );
}

/** `obj['name']` → `obj.name`；只处理合法标识符，其余保留下标形式。 */
function dotNotation(src) {
  // 只做这一个替换。曾试过再补一条「正则字面量 + ['test']」的规则，但那条要先把
  // `/…/` 整段匹配出来，在 800KB 压缩文件里（除法到处都是）会退化成 O(n²) 回溯，
  // 实测单个文件就卡死；代价只是 `/x/['test'](y)` 保持原样，不影响可读性。
  return src.replace(
    /([A-Za-z_$][\w$]*|\]|\))\[\s*\(?(?:"([^"\\]{1,60})"|'([^'\\]{1,60})')\)?\s*\]/g,
    (whole, head, dq, sq) => {
      const name = dq ?? sq;
      return IDENT.test(name) && !/^\d/.test(name) ? `${head}.${name}` : whole;
    },
  );
}

/**
 * 只对「代码段」应用 `fn`，字符串/正则字面量原样保留。
 *
 * 早先用 `split(/(引号)/)` 交替处理，遇到正则字面量里的引号（如 `/["']/`）就会失去
 * 奇偶对齐，之后整段被当成字符串跳过 —— 实测 studio-app.js 有 1.6 万个标识符因此没
 * 被改写。这里改成逐字符扫描：遇到引号进字符串态、遇到「可能是正则起点」的 `/` 就
 * 跳到配平的 `/`，其余累积到缓冲区交给 `fn`。
 */
function mapOutsideLiterals(src, fn) {
  const out = [];
  let buffer = "";
  let i = 0;
  const flush = () => {
    if (buffer) {
      out.push(fn(buffer));
      buffer = "";
    }
  };
  // 正则起点：前一个有意义字符是运算符/括号/逗号等，或位于表达式开头。
  const regexStarters = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      flush();
      const start = i;
      i += 1;
      while (i < src.length) {
        if (src[i] === "\\") i += 2;
        else if (src[i] === ch) {
          i += 1;
          break;
        } else i += 1;
      }
      out.push(src.slice(start, i));
      continue;
    }
    if (ch === "/") {
      const prev = buffer.trimEnd().slice(-1);
      const isRegex = prev === "" || regexStarters.has(prev) || /(?:^|\W)(?:return|typeof|case|in|of)$/.test(buffer.trimEnd());
      if (isRegex && src[i + 1] !== "/" && src[i + 1] !== "*") {
        flush();
        const start = i;
        i += 1;
        let inClass = false;
        while (i < src.length) {
          const c = src[i];
          if (c === "\\") i += 2;
          else if (c === "[") { inClass = true; i += 1; }
          else if (c === "]") { inClass = false; i += 1; }
          else if (c === "/" && !inClass) { i += 1; break; }
          else if (c === "\n") break;
          else i += 1;
        }
        while (i < src.length && /[a-z]/.test(src[i])) i += 1; // flags
        out.push(src.slice(start, i));
        continue;
      }
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return out.join("");
}

/** 按首次出现顺序把 `_0x…` 改名成 `v1/v2…`；字符串与正则内部不动。 */
function normalizeIdentifiers(src) {
  const names = new Map();
  return mapOutsideLiterals(src, (code) =>
    code.replace(/_0x([0-9a-f]+)/g, (whole) => {
      if (!names.has(whole)) names.set(whole, `v${names.size + 1}`);
      return names.get(whole);
    }),
  );
}

/** 非字面量段里的 `0x1a2` 转十进制，读起来更像普通的常量。 */
function decimalizeNumbers(src) {
  return mapOutsideLiterals(src, (code) =>
    code.replace(/(?<![\w$.])0x([0-9a-f]+)\b/g, (_m, hex) => String(Number.parseInt(hex, 16))),
  );
}

/** 去掉三段引导代码本身（解码器与数组函数留着只是噪音），保留业务代码。 */
function stripBootstrap(src, decoder) {
  if (!decoder) return src;
  let out = src;
  for (const name of [decoder.decoderName, ...decoder.aliases]) {
    const body = findFunctionBody(out, name);
    if (body) out = out.replace(body, "");
  }
  // `const _0x3c1093 = _0x148b;` / `const _0xA = _0x148b, _0xB = ...` 这类给解码器起别名的
  // 声明一并去掉（逗号形式很常见，所以按「名字 = 解码器 后跟 , 或 ;」删，再收拾残余）。
  out = out.replace(
    new RegExp(`_0x[0-9a-f]+\\s*=\\s*${decoder.decoderName}\\s*(?=[,;])`, "g"),
    "",
  );
  out = out.replace(/const\s*,\s*/g, "const ").replace(/,(\s*[;}])/g, "$1");
  out = out.replace(/\bconst\s*;+/g, "").replace(/;{2,}/g, ";");
  const arrayName = findArrayFunctionName(out);
  if (arrayName) {
    const body = findFunctionBody(out, arrayName);
    if (body) out = out.replace(body, "");
    const rotation = findRotationAny(out, arrayName);
    if (rotation) out = out.replace(rotation, "");
  }
  return out;
}

/** `import { real as vN }` → 全篇把 `vN` 换回 `real`，读完就不用对照 import 表。 */
function preferImportNames(src) {
  const pairs = [...src.matchAll(/([A-Za-z_$][\w$]*)\s+as\s+(v\d+)\b/g)].map((m) => [m[1], m[2]]);
  if (pairs.length === 0) return src;
  const byLocal = new Map(pairs.map(([orig, local]) => [local, orig]));
  const renamed = mapOutsideLiterals(src, (code) =>
    code.replace(/\bv\d+\b/g, (whole) => byLocal.get(whole) ?? whole),
  );
  return renamed.replace(/\b([A-Za-z_$][\w$]*)\s+as\s+\1\b/g, "$1");
}

/**
 * 完整还原：内联字符串 → 拆引导 → 点号化 → 标识符规范化 → 数字十进制 → 美化。
 * @param {string} src 原始（混淆）源码
 * @param {{beautify?: boolean}} [options]
 */
export function deobfuscate(src, options = {}) {
  const mark = options.profile ? (label, t0) => console.error(`  [deobf] ${label}: ${Date.now() - t0}ms`) : null;
  let t = Date.now();
  const decoder = buildDecoder(src);
  mark?.("buildDecoder", t); t = Date.now();
  let out = inlineStrings(src, decoder);
  mark?.("inlineStrings", t); t = Date.now();
  out = stripBootstrap(out, decoder);
  mark?.("stripBootstrap", t); t = Date.now();
  out = dotNotation(out);
  mark?.("dotNotation", t); t = Date.now();
  out = normalizeIdentifiers(out);
  mark?.("normalizeIdentifiers", t); t = Date.now();
  out = decimalizeNumbers(out);
  mark?.("decimalizeNumbers", t); t = Date.now();
  out = preferImportNames(out);
  mark?.("preferImportNames", t); t = Date.now();
  out = out.replace(/^\s*\n/gm, "").replace(/\n{3,}/g, "\n\n").replace(/^[;,]\s*/g, "");
  if (options.beautify === false) return { code: out, decoder };
  const code = beautifyJs(out, {
    indent_size: 2,
    max_preserve_newlines: 1,
    preserve_newlines: true,
    wrap_line_length: 100,
    space_in_paren: false,
    brace_style: "collapse",
    end_with_newline: true,
  });
  return { code, decoder };
}

/** 判断一个文件是否真的是 javascript-obfuscator 产物（避免把普通脚本也跑一遍）。 */
export function looksObfuscated(src) {
  // 注意：数组函数可能出现在文件**任意位置**（大文件里常被放到末尾），
  // 所以必须扫全文 —— 只看前 4KB 会把 studio-app.js 这类大文件误判成「未混淆」。
  return /function _0x[0-9a-f]+\(\)\s*\{\s*const _0x[0-9a-f]+\s*=\s*\[/.test(src);
}
