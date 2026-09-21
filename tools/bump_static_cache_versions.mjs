/**
 * Unify hardcoded static-asset `?v=` cache-busting query strings to a single
 * local timestamp: YYMMDDHHMM (e.g. 2609151037).
 *
 * 年份只留后两位、秒不参与：这枚戳只用来「让浏览器认成新 URL」，不需要可读的绝对时间，
 * 10 位比 14 位好在 URL 短一半且一眼看得出来是两个数字块（日期 / 时分）。
 *
 * Usage:
 *   node tools/bump_static_cache_versions.mjs
 *   node tools/bump_static_cache_versions.mjs --version=2609151037
 *   node tools/bump_static_cache_versions.mjs --dry-run
 *
 * Does not touch dynamic versions (assets.py mtime hex, store product images,
 * ui-pack semver, RENDER_CACHE_VERSION, ?hb= / ?_= request busts).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TEXT_EXTENSIONS = new Set([".js", ".html", ".css", ".webmanifest", ".py"]);

const SCAN_ROOTS = [
  path.join(ROOT, "frontend"),
  path.join(ROOT, "store", "templates"),
  // store/static 必须和 templates 一起扫：商店是独立构建上下文，`store/static/*.js`
  // 之间的相对 import 也带 `?v=`。曾经漏掉这一片，于是 `store/static/palette.js` 一直
  // 停在旧戳上（当时负责比对的护栏也漏了同一片，两边一起沉默，直到那侧补上才暴露）。
  // **本清单即全站戳的唯一来源**：漏一个目录，那里的 `?v=` 会在改动后停在旧戳上，
  // 而没有任何自动检查会发现 —— 这正是本工具存在的理由。
  path.join(ROOT, "store", "static")
];

const EXTRA_FILES = [
  path.join(ROOT, "store", "api", "pages.py"),
  path.join(ROOT, "store", "api", "alipay.py"),
  path.join(ROOT, "backend", "modules", "interaction3d", "api.py")
];

const SKIP_DIR_NAMES = new Set([
  "vendor",
  "node_modules",
  ".venv",
  ".venv-store",
  ".extracted"
]);

/** Literal `?v=…` until quote / whitespace / ) / ` */
const QUERY_V_RE = /\?v=[^"'`\s)]+/g;

/** Model version constants concatenated into `?v=` URLs */
const MODEL_VERSION_CONST_RE =
  /\b(HOME_LITE_MODEL_VERSION|APPLIANCE_LITE_MODEL_VERSION)\s*=\s*"[^"]*"/g;

/**
 * Second arg to defineHomeItemModel is a fallback version string used as
 * `?v=` + homeFallbackVersion (no `?v=` literal in source).
 */
const DEFINE_HOME_FALLBACK_RE =
  /(defineHomeItemModel\(\s*"[^"]*"\s*,\s*)"[^"]*"/g;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function localTimestamp(date = new Date()) {
  return (
    // getFullYear() % 100 会把 2000 年算成 0，这里用 pad2 补成 "00" 即可；
    // 负年份（公元前）不在本工具的取值范围内。
    pad2(date.getFullYear() % 100) +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) +
    pad2(date.getHours()) +
    pad2(date.getMinutes())
  );
}

function parseArgs(argv) {
  let version = null;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length).trim();
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node tools/bump_static_cache_versions.mjs [--version=YYMMDDHHMM] [--dry-run]`);
      process.exit(0);
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
  if (version !== null && !/^\d{10}$/.test(version)) {
    console.error(`--version must be 10 digits (YYMMDDHHMM), got: ${version}`);
    process.exit(1);
  }
  return { version: version || localTimestamp(), dryRun };
}

function shouldSkipDir(name) {
  return SKIP_DIR_NAMES.has(name) || name.startsWith(".venv");
}

function* walkFiles(dir) {
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
      // Never walk into frontend/static/vendor
      if (entry.name === "vendor" && dir.endsWith(`${path.sep}static`)) continue;
      yield* walkFiles(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
    yield full;
  }
}

function collectTargets() {
  const files = new Set();
  for (const root of SCAN_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of walkFiles(root)) {
      files.add(file);
    }
  }
  for (const file of EXTRA_FILES) {
    if (fs.existsSync(file)) files.add(file);
  }
  return [...files].sort();
}

function rewriteContent(source, stamp) {
  let replacements = 0;
  let next = source;

  next = next.replace(QUERY_V_RE, (match) => {
    // Skip f-string / template dynamic placeholders like ?v={version}
    if (match.includes("{") || match.includes("}")) {
      return match;
    }
    const replacement = `?v=${stamp}`;
    if (match !== replacement) replacements += 1;
    return replacement;
  });

  next = next.replace(MODEL_VERSION_CONST_RE, (_match, name) => {
    replacements += 1;
    return `${name} = "${stamp}"`;
  });

  next = next.replace(DEFINE_HOME_FALLBACK_RE, (match, prefix) => {
    const replacement = `${prefix}"${stamp}"`;
    if (match !== replacement) replacements += 1;
    return replacement;
  });

  return { next, replacements };
}

function main() {
  const { version: stamp, dryRun } = parseArgs(process.argv.slice(2));
  const targets = collectTargets();
  let filesChanged = 0;
  let totalReplacements = 0;

  for (const file of targets) {
    const source = fs.readFileSync(file, "utf8");
    const { next, replacements } = rewriteContent(source, stamp);
    if (replacements === 0 || next === source) continue;
    filesChanged += 1;
    totalReplacements += replacements;
    const rel = path.relative(ROOT, file);
    if (dryRun) {
      console.log(`[dry-run] ${rel}: ${replacements} replacement(s)`);
    } else {
      fs.writeFileSync(file, next, "utf8");
      console.log(`${rel}: ${replacements} replacement(s)`);
    }
  }

  console.log(
    `${dryRun ? "Dry-run: would update" : "Updated"} ${filesChanged} file(s), ` +
      `${totalReplacements} replacement(s), version=${stamp}`
  );
}

main();
