/**
 * Frontend stylesheet hygiene: duplication and dead weight that no bundler and
 * no linter would catch here.
 *
 * `check_structure_refs.mjs` answers "does every reference resolve". This script
 * answers the follow-up question — "is every rule still needed, and is it
 * written once" — which is what a 33k-line hand-written CSS tree needs when
 * there is no build step to shake it out.
 *
 * Usage:
 *   node tools/check_frontend_hygiene.mjs            # report only, exit 0
 *   node tools/check_frontend_hygiene.mjs --strict   # exit 1 on dead / duplicate
 *   node tools/check_frontend_hygiene.mjs --json     # machine-readable report
 *
 * Checks:
 *   1. Dead class selectors — a class defined in a stylesheet that no
 *      html/js/mjs/py/svg/json source ever names. CSS is deliberately NOT part
 *      of the corpus: a class defined twice and used nowhere is still dead.
 *      Composition prefixes (`"hb-custom-popup-module--" + type`, `${x}`) are
 *      collected first and exempt anything they can produce.
 *   2. Duplicate `@keyframes` names — the later declaration silently wins.
 *   3. Selectors defined in two stylesheets that one page loads, where the
 *      declarations differ — the later file wins per property, so the earlier
 *      one is either a deliberate second skin (annotate it) or an accident.
 *   4. Hex literals that are byte-identical to a `:root` token value, i.e. a
 *      `var()` waiting to happen.
 *   5. `z-index` inventory — there is no scale today, so every new top layer
 *      has to guess. Informational.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ACTIVATE_ROOT } from "./sync_scene_assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = path.join(ROOT, "frontend");
const BACKEND = path.join(ROOT, "backend");
const STORE = path.join(ROOT, "store");
const STORE_STATIC = path.join(STORE, "static");
/** Canonical source of the scene design system; the copies below are generated. */
const SCENE_SOURCE = path.join(ROOT, "design", "scene");

/**
 * HomeOS-Activate's own source: a third build context, and a *sibling* directory
 * rather than a vendored one.
 *
 * Resolved through `sync_scene_assets.mjs` instead of `path.join(ROOT, ...)`
 * because the two tools must agree on where that project lives. They did not:
 * this file used to point inside the repo, where nothing exists, so
 * `walkFiles()` hit ENOENT, swallowed it, and contributed an empty corpus. Every
 * class that only the activate page names then read as dead — 32 false positives
 * (`.hos-hub*`, `.hos-datepicker*`, `.hos-modal*`), which is exactly the set of
 * components the design system exists to share.
 *
 * Optional on purpose, and skipped the same way `sync_scene_assets.mjs` skips it:
 * a CI runner that checked out only HomeOS-3D has no activate source to read, and
 * a guard that fails on a project it cannot see is a guard people disable.
 */
const ACTIVATE_SRC = path.join(ACTIVATE_ROOT, "src");
const HAS_ACTIVATE_SRC = fs.existsSync(ACTIVATE_SRC);

/**
 * Directories holding *generated* copies of `design/scene`.
 *
 * The app image, the store image and the activate image are three independent
 * Docker build contexts, so each carries its own copy of these stylesheets
 * (`tools/sync_scene_assets.mjs` writes them, `tools/check_scene_sync.mjs`
 * proves they are byte-identical to the canonical).
 *
 * They are excluded from `loadStylesheets()` because re-reading them reports the
 * same classes and the same `@keyframes` two or three times over, and
 * `checkKeyframes` treats an identical second definition as a problem — the
 * copies would manufacture 41 phantom duplicates. The canonical is scanned
 * instead, and each copy is aliased onto it (see `aliasGeneratedSceneCopies`)
 * so page load-order analysis still sees the stylesheet the page links.
 */
const GENERATED_SCENE_COPY_DIRS = [
  path.join(FRONTEND, "static", "auth", "scene"),
  path.join(STORE_STATIC, "scene")
];

const SKIP_DIR_NAMES = new Set([
  "vendor",
  "node_modules",
  "__pycache__",
  "data",
  ".venv",
  ".venv-store",
  ".git"
]);

function shouldSkipDir(name) {
  return SKIP_DIR_NAMES.has(name) || name.startsWith(".venv");
}

function* walkFiles(dir, extensions) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      yield* walkFiles(full, extensions);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!extensions.has(path.extname(entry.name))) continue;
    yield full;
  }
}

function relFromRoot(file) {
  return path.relative(ROOT, file);
}

/* ------------------------------------------------------------------ parsing */

/** Length-preserving comment blanking: CSS offsets stay valid for line lookup. */
function blankComments(source) {
  const chars = source.split("");
  let i = 0;
  while (i < source.length) {
    if (source[i] === "/" && source[i + 1] === "*") {
      let j = i + 2;
      while (j < source.length && !(source[j] === "*" && source[j + 1] === "/")) j += 1;
      const end = Math.min(j + 2, source.length);
      for (let k = i; k < end; k += 1) {
        if (chars[k] !== "\n") chars[k] = " ";
      }
      i = end;
      continue;
    }
    i += 1;
  }
  return chars.join("");
}

/** Position -> 1-based line number, via binary search over newline offsets. */
function makeLineLookup(source) {
  const newlines = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") newlines.push(i);
  }
  return (pos) => {
    let lo = 0;
    let hi = newlines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (newlines[mid] < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

/**
 * Flat block list. Every `{` opens a frame and the text since the last `;`/`{`/`}`
 * is its prelude, so both rules and at-rules land in the same shape:
 *   { prelude, body, line, parentPreludes }
 * Quoted strings are skipped so `content: "{"` cannot desync the walk.
 */
function parseCss(source) {
  const blocks = [];
  const stack = [];
  let buffer = "";
  let bufferLine = 1;
  let line = 1;
  let quote = null;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      buffer += ch;
      if (ch === "\\") {
        buffer += source[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      if (ch === "\n") line += 1;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      if (!buffer) bufferLine = line;
      buffer += ch;
      i += 1;
      continue;
    }
    if (ch === "\n") {
      line += 1;
      buffer += ch;
      i += 1;
      continue;
    }
    if (ch === "{") {
      const prelude = buffer.trim();
      stack.push({ prelude, line: bufferLine, bodyStart: i + 1, parents: stack.map((f) => f.prelude) });
      buffer = "";
      bufferLine = line;
      i += 1;
      continue;
    }
    if (ch === "}") {
      const frame = stack.pop();
      if (frame) {
        blocks.push({
          prelude: frame.prelude,
          body: source.slice(frame.bodyStart, i),
          bodyStart: frame.bodyStart,
          line: frame.line,
          parents: frame.parents
        });
      }
      buffer = "";
      bufferLine = line;
      i += 1;
      continue;
    }
    if (ch === ";") {
      buffer = "";
      bufferLine = line;
      i += 1;
      continue;
    }
    if (!buffer.trim() && !/\s/.test(ch)) bufferLine = line;
    buffer += ch;
    i += 1;
  }

  return { blocks, lineOf: makeLineLookup(source) };
}

/**
 * Declarations of a leaf rule body, each with its offset inside the body so the
 * caller can turn it into a line number. Returns [] when the body nests blocks.
 */
function leafDeclarations(body) {
  if (body.includes("{")) return [];
  const raw = [];
  let depth = 0;
  let quote = null;
  let buffer = "";
  let start = 0;
  const flush = () => {
    if (buffer.trim()) raw.push({ text: buffer, offset: start });
    buffer = "";
  };
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      buffer += ch;
      if (ch === "\\") {
        buffer += body[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      if (!buffer.trim()) start = i;
      quote = ch;
      buffer += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === ";" && depth === 0) {
      flush();
      start = i + 1;
      continue;
    }
    if (!buffer.trim() && !/\s/.test(ch)) start = i;
    buffer += ch;
  }
  flush();
  return raw
    .map((entry) => {
      const cut = entry.text.indexOf(":");
      if (cut === -1) return null;
      return { prop: entry.text.slice(0, cut).trim(), value: entry.text.slice(cut + 1).trim(), offset: entry.offset };
    })
    .filter(Boolean);
}

const CLASS_TOKEN_RE = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;

function classesInSelector(prelude) {
  const found = [];
  for (const match of prelude.matchAll(CLASS_TOKEN_RE)) found.push(match[1]);
  return found;
}

/** Rule blocks only: not at-rules, not keyframe steps, not declaration bodies. */
function isSelectorRule(prelude) {
  if (!prelude) return false;
  if (prelude.startsWith("@")) return false;
  if (/^[-+0-9.%\s]+$/.test(prelude)) return false;
  return prelude.includes(".") || prelude.includes("#") || prelude.includes(":") || prelude.includes("*");
}

/* ------------------------------------------------------------------ loading */

const CSS_EXTENSIONS = new Set([".css"]);
const CORPUS_EXTENSIONS = new Set([".html", ".js", ".mjs", ".py", ".svg", ".json", ".webmanifest"]);

function isHandWrittenCss(file) {
  return !path.basename(file).endsWith(".min.css");
}

function isGeneratedSceneCopy(file) {
  return GENERATED_SCENE_COPY_DIRS.some((dir) => file.startsWith(`${dir}${path.sep}`));
}

function loadStylesheets() {
  const sheets = [];
  const seen = new Set();
  // `design/scene` is scanned in place of its copies; see GENERATED_SCENE_COPY_DIRS.
  for (const root of [FRONTEND, STORE_STATIC, SCENE_SOURCE]) {
    if (!fs.existsSync(root)) continue;
    for (const file of walkFiles(root, CSS_EXTENSIONS)) {
      if (!isHandWrittenCss(file)) continue;
      if (isGeneratedSceneCopy(file)) continue;
      if (seen.has(file)) continue;
      seen.add(file);
      sheets.push(readSheet(file));
    }
  }
  return sheets;
}

/**
 * Point each generated copy at the canonical sheet it duplicates, so
 * `loadOrderForPage` can follow a page's `<link>` into real declarations.
 * Without this the entry pages would silently drop out of the cross-file
 * shadowing report — the one check that would notice a leftover `setup.css`.
 */
function aliasGeneratedSceneCopies(sheets, sheetByFile) {
  const canonicalByBase = new Map(
    sheets
      .filter((sheet) => sheet.file.startsWith(`${SCENE_SOURCE}${path.sep}`))
      .map((sheet) => [path.basename(sheet.file), sheet])
  );
  for (const dir of GENERATED_SCENE_COPY_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of walkFiles(dir, CSS_EXTENSIONS)) {
      const canonical = canonicalByBase.get(path.basename(file));
      if (canonical) sheetByFile.set(file, canonical);
    }
  }
}

function readSheet(file) {
  const raw = fs.readFileSync(file, "utf8");
  const source = blankComments(raw);
  const { blocks, lineOf } = parseCss(source);
  return { file, source, blocks, lineOf };
}

function loadCorpus() {
  const roots = [
    FRONTEND,
    BACKEND,
    STORE,
    // The canonical scene markup and its consumers live outside the three
    // runtime roots. Without them every class only the activate page or the
    // canonical fragment names reads as dead — the design system exists
    // precisely to be named from all three contexts.
    SCENE_SOURCE,
    ACTIVATE_SRC
  ];
  const texts = [];
  for (const root of roots) {
    // A root that does not exist yields nothing from `walkFiles()`, which is the
    // right behaviour for the optional activate checkout — but it must not be
    // silent, or the corpus quietly shrinks and the dead-class check starts
    // reporting live classes. One line saying which root was skipped keeps a
    // moved project from looking like a cleanup opportunity.
    if (!fs.existsSync(root)) {
      console.log(`corpus root skipped (not present): ${relFromRoot(root)}`);
      continue;
    }
    for (const file of walkFiles(root, CORPUS_EXTENSIONS)) {
      if (path.extname(file) === ".min.js") continue;
      try {
        texts.push(fs.readFileSync(file, "utf8"));
      } catch {
        /* unreadable binary-ish file: not a source of class names */
      }
    }
  }
  return texts.join("\n");
}

/**
 * Prefixes that a template or concatenation can complete into a class name.
 *
 * Two shapes produce them, and both hide the prefix mid-literal:
 *   `"hb-corner-marker hb-corner-" + position`   (several classes, tail extends)
 *   `` `...class="pill pill--${tone}"` ``        (template hole)
 * so the whole literal is captured and only its trailing `word-` stem is kept.
 */
function collectCompositionPrefixes(corpus) {
  const prefixes = new Set(["is-", "has-"]);
  const addTrailingStem = (literal) => {
    const match = /([A-Za-z][A-Za-z0-9_-]*-)$/.exec(literal);
    if (match) prefixes.add(match[1]);
  };
  for (const match of corpus.matchAll(/["'`]([^"'`\n]{1,120})["'`]\s*\+/g)) addTrailingStem(match[1]);
  // Lazy, so a template with several holes yields the prefix before the FIRST
  // one (`<span class="pill pill--${tone}">${x}` must give `pill--`, not the
  // whole head up to the second hole, which no longer ends in a hyphen).
  for (const match of corpus.matchAll(/`([^`\n]{1,120}?)\$\{/g)) addTrailingStem(match[1]);
  return prefixes;
}

/* ------------------------------------------------------------------- checks */

function checkDeadClasses(sheets, corpus, prefixes) {
  const tokens = new Set(corpus.match(/[A-Za-z0-9_-]+/g) || []);
  const dead = [];
  const seen = new Set();
  for (const sheet of sheets) {
    for (const block of sheet.blocks) {
      if (!isSelectorRule(block.prelude)) continue;
      for (const name of classesInSelector(block.prelude)) {
        if (tokens.has(name)) continue;
        if ([...prefixes].some((prefix) => prefix && name.startsWith(prefix))) continue;
        const key = `${sheet.file}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dead.push({ file: relFromRoot(sheet.file), line: block.line, name });
      }
    }
  }
  return dead.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function checkKeyframes(sheets) {
  const byName = new Map();
  for (const sheet of sheets) {
    for (const block of sheet.blocks) {
      const match = block.prelude.match(/^@(?:-webkit-)?keyframes\s+([A-Za-z0-9_-]+)/);
      if (!match) continue;
      const name = match[1];
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({
        file: relFromRoot(sheet.file),
        line: block.line,
        // Whitespace-insensitive, so formatting differences do not read as a conflict.
        shape: block.body.replace(/\s+/g, " ").trim()
      });
    }
  }
  return [...byName.entries()]
    .filter(([, sites]) => sites.length > 1)
    .map(([name, sites]) => ({
      name,
      kind: new Set(sites.map((s) => s.shape)).size === 1 ? "redundant" : "conflicting",
      sites
    }));
}

/**
 * `:root` token values that are plain colors, keyed by lowercase hex.
 *
 * Deliberately per stylesheet, not global: `--accent` lives in app.css, and
 * display.html loads renderer.css *without* app.css, so "the token exists
 * somewhere in the repo" is not the same as "the token is in scope here".
 * Same-file is the only scope this script can prove, so it is the only one it
 * reports — cross-sheet reuse would need the page's full load order.
 */
function rootTokensOf(sheet) {
  const byHex = new Map();
  for (const block of sheet.blocks) {
    if (!block.prelude.includes(":root")) continue;
    for (const decl of leafDeclarations(block.body)) {
      if (!decl.prop.startsWith("--")) continue;
      const hex = decl.value.trim().match(/^#([0-9a-fA-F]{6})$/);
      if (!hex) continue;
      const key = `#${hex[1].toLowerCase()}`;
      if (!byHex.has(key)) byHex.set(key, { token: decl.prop, file: relFromRoot(sheet.file) });
    }
  }
  return byHex;
}

/**
 * Hex literals in a declaration value, flagged when they sit in a `var()`
 * fallback slot (`var(--line, #303840)`).
 *
 * A fallback is intentional: the token is only defined on pages that load the
 * palette stylesheet, and the stage/display pages do not. Rewriting those to
 * `var(--line)` would drop the colour on exactly those pages.
 */
function classifyHexes(value) {
  const out = [];
  const stack = [];
  let i = 0;
  while (i < value.length) {
    if (value.startsWith("var(", i)) {
      stack.push(false);
      i += 4;
      continue;
    }
    const ch = value[i];
    if (ch === "(") {
      stack.push(false);
      i += 1;
      continue;
    }
    if (ch === ")") {
      stack.pop();
      i += 1;
      continue;
    }
    if (ch === "," && stack.length) {
      stack[stack.length - 1] = true;
      i += 1;
      continue;
    }
    if (ch === "#") {
      const match = /^#[0-9a-fA-F]{6}\b/.exec(value.slice(i));
      if (match) {
        out.push({ hex: match[0], index: i, isFallback: stack.some(Boolean) });
        i += match[0].length;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

function checkTokenHexLiterals(sheets) {
  const hits = [];
  for (const sheet of sheets) {
    const tokensByHex = rootTokensOf(sheet);
    if (tokensByHex.size === 0) continue;
    for (const block of sheet.blocks) {
      const isRootBlock = block.prelude.includes(":root");
      for (const decl of leafDeclarations(block.body)) {
        if (isRootBlock && decl.prop.startsWith("--")) continue;
        for (const entry of classifyHexes(decl.value)) {
          if (entry.isFallback) continue;
          const found = tokensByHex.get(entry.hex.toLowerCase());
          if (!found) continue;
          hits.push({
            file: relFromRoot(sheet.file),
            line: sheet.lineOf(block.bodyStart + decl.offset),
            literal: entry.hex,
            token: found.token,
            rule: block.prelude
          });
        }
      }
    }
  }
  return hits;
}

function checkZIndex(sheets) {
  const entries = [];
  for (const sheet of sheets) {
    for (const block of sheet.blocks) {
      for (const decl of leafDeclarations(block.body)) {
        if (decl.prop !== "z-index") continue;
        entries.push({ file: relFromRoot(sheet.file), value: decl.value, rule: block.prelude });
      }
    }
  }
  const values = new Map();
  for (const entry of entries) values.set(entry.value, (values.get(entry.value) || 0) + 1);
  return { entries, values };
}

/** Strip `?v=` / `#fragment` and resolve a stylesheet URL to a disk path. */
function resolveStylesheetUrl(url, importerFile) {
  const clean = url.split("?")[0].split("#")[0];
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return null;
  if (clean.startsWith("/static/")) return path.join(FRONTEND, clean.slice(1));
  if (clean.startsWith("/store-static/")) return path.join(STORE_STATIC, clean.replace("/store-static/", ""));
  if (clean.startsWith(".")) return path.resolve(path.dirname(importerFile), clean);
  return path.resolve(path.dirname(importerFile), clean);
}

/** Stylesheets a file `@import`s, in order. */
function importsOf(sheet) {
  const imports = [];
  for (const block of sheet.blocks) {
    const match = block.prelude.match(/^@import\s+(?:url\(\s*)?["']([^"']+)["']/);
    if (!match) continue;
    const target = resolveStylesheetUrl(match[1], sheet.file);
    if (target) imports.push(target);
  }
  return imports;
}

/** A page's load order: `<link>` order, each expanded for `@import` in place. */
function loadOrderForPage(htmlFile, sheetByFile) {
  const html = fs.readFileSync(htmlFile, "utf8");
  const order = [];
  for (const match of html.matchAll(/<link\b[^>]*href="([^"]+\.css[^"]*)"/gi)) {
    const target = resolveStylesheetUrl(match[1], htmlFile);
    if (target) order.push({ file: target, via: "link" });
  }
  const expanded = [];
  const visit = (file, stack) => {
    const sheet = sheetByFile.get(file);
    if (!sheet || stack.includes(file)) return;
    expanded.push(file);
    for (const next of importsOf(sheet)) visit(next, [...stack, file]);
  };
  for (const entry of order) visit(entry.file, []);
  return expanded;
}

/**
 * Dynamic sheets: modules injected at runtime by JS (stage.css, dialog skins).
 * They land after every `<link>`, so they are appended to each page's order —
 * flagged `via: "dynamic"` so the pair is read as "worth checking", not "broken".
 */
function dynamicallyLoadedSheets(sheetByFile) {
  const corpusJs = [];
  for (const file of walkFiles(FRONTEND, new Set([".js", ".mjs"]))) {
    if (file.includes(`${path.sep}vendor${path.sep}`)) continue;
    if (path.basename(file).endsWith(".min.js")) continue;
    corpusJs.push(fs.readFileSync(file, "utf8"));
  }
  const found = new Set();
  for (const text of corpusJs) {
    for (const match of text.matchAll(/(\/(?:api\/v1\/modules\/interaction3d|static)\/[A-Za-z0-9_@./-]+\.css)\?v=/g)) {
      const url = match[1];
      const target = url.startsWith("/api/v1/modules/interaction3d/")
        ? path.join(FRONTEND, "modules", "runtime", url.replace("/api/v1/modules/interaction3d/", ""))
        : path.join(FRONTEND, url.slice(1));
      if (sheetByFile.has(target)) found.add(target);
    }
  }
  return [...found];
}

function checkCrossFileShadowing(sheetByFile) {
  const problems = [];
  const htmlFiles = [...walkFiles(FRONTEND, new Set([".html"]))];
  const dynamic = dynamicallyLoadedSheets(sheetByFile);

  for (const htmlFile of htmlFiles) {
    const order = loadOrderForPage(htmlFile, sheetByFile);
    for (const extra of dynamic) {
      if (!order.includes(extra)) order.push(extra);
    }
    for (let a = 0; a < order.length; a += 1) {
      for (let b = a + 1; b < order.length; b += 1) {
        const earlier = sheetByFile.get(order[a]);
        const later = sheetByFile.get(order[b]);
        if (!earlier || !later) continue;
        const earlierMap = selectorDeclarations(earlier);
        const laterMap = selectorDeclarations(later);
        for (const [selector, earlierDecls] of earlierMap) {
          const laterDecls = laterMap.get(selector);
          if (!laterDecls) continue;
          const overridden = [...laterDecls.keys()].filter(
            (prop) => earlierDecls.has(prop) && earlierDecls.get(prop) !== laterDecls.get(prop)
          );
          if (overridden.length === 0) continue;
          problems.push({
            page: relFromRoot(htmlFile),
            selector,
            earlier: relFromRoot(earlier.file),
            later: relFromRoot(later.file),
            properties: overridden.sort()
          });
        }
      }
    }
  }
  return problems;
}

const declarationCache = new WeakMap();

function selectorDeclarations(sheet) {
  if (declarationCache.has(sheet)) return declarationCache.get(sheet);
  const map = new Map();
  for (const block of sheet.blocks) {
    if (!isSelectorRule(block.prelude)) continue;
    const decls = leafDeclarations(block.body);
    if (decls.length === 0) continue;
    if (!map.has(block.prelude)) map.set(block.prelude, new Map());
    for (const decl of decls) map.get(block.prelude).set(decl.prop, decl.value);
  }
  declarationCache.set(sheet, map);
  return map;
}

/* -------------------------------------------------------------------- report */

function printSection(title, count, lines, limit = 80) {
  console.log(`\n### ${title} (${count})`);
  if (count === 0) {
    console.log("  none");
    return;
  }
  for (const line of lines.slice(0, limit)) console.log(`  ${line}`);
  if (lines.length > limit) console.log(`  ... and ${lines.length - limit} more`);
}

function main() {
  const argv = process.argv.slice(2);
  const strict = argv.includes("--strict");
  const asJson = argv.includes("--json");

  const sheets = loadStylesheets();
  const sheetByFile = new Map(sheets.map((sheet) => [sheet.file, sheet]));
  aliasGeneratedSceneCopies(sheets, sheetByFile);
  const corpus = loadCorpus();
  const prefixes = collectCompositionPrefixes(corpus);

  const dead = checkDeadClasses(sheets, corpus, prefixes);
  const keyframes = checkKeyframes(sheets);
  const tokenHex = checkTokenHexLiterals(sheets);
  const zIndex = checkZIndex(sheets);

  if (asJson) {
    console.log(
      JSON.stringify(
        { deadClasses: dead, duplicateKeyframes: keyframes, tokenHexLiterals: tokenHex, zIndex: zIndex.entries },
        null,
        2
      )
    );
    return;
  }

  console.log(`scanned ${sheets.length} hand-written stylesheets`);
  const prefixList = [...prefixes].sort();
  console.log(
    `composition prefixes exempted: ${prefixList.length}` +
      (prefixList.length ? ` (${prefixList.slice(0, 12).join(", ")}, ...)` : "")
  );

  printSection(
    "dead class selectors",
    dead.length,
    dead.map((item) => `${item.file}:${item.line}  .${item.name}`)
  );

  printSection(
    "duplicate @keyframes",
    keyframes.length,
    keyframes.map(
      (item) =>
        `[${item.kind}] ${item.name} -> ${item.sites.map((s) => `${s.file}:${s.line}`).join("  ")}`
    )
  );

  printSection(
    "hex literals identical to a :root token",
    tokenHex.length,
    tokenHex.map((item) => `${item.file}  ${item.literal} -> var(${item.token})   [${item.rule}]`)
  );

  const byValue = [...zIndex.values.entries()].sort((a, b) => b[1] - a[1]);
  printSection(
    "z-index literals (informational)",
    zIndex.entries.length,
    [
      `distinct values: ${byValue.length}`,
      ...byValue.slice(0, 40).map(([value, count]) => `${value} x${count}`)
    ],
    45
  );

  const shadowLines = [];
  for (const item of checkCrossFileShadowing(sheetByFile)) {
    shadowLines.push(
      `${item.later} overrides ${item.earlier} on ${item.page}\n      ${item.selector}  [${item.properties.join(", ")}]`
    );
  }
  printSection("cross-file selector shadowing (informational)", shadowLines.length, shadowLines);

  const failures = dead.length + keyframes.length + tokenHex.length;
  if (failures > 0) {
    console.log(`\n${failures} item(s) need attention (dead classes / duplicate keyframes / token hex literals).`);
  } else {
    console.log("\nOK: no dead classes, no duplicate keyframes, no token-identical hex literals.");
  }

  if (strict && failures > 0) process.exitCode = 1;
}

main();
