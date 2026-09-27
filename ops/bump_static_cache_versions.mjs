/**
 * 把硬编码的静态资源 `?v=` 统一成同一个本地时间戳 YYMMDDHHMM。
 *
 * Usage:
 *   node ops/bump_static_cache_versions.mjs
 *   node ops/bump_static_cache_versions.mjs --version=2609151037
 *   node ops/bump_static_cache_versions.mjs --dry-run
 *
 * 不改动态版本（mtime hex、商品图、ui-pack semver、RENDER_CACHE_VERSION、?hb= / ?_=）。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const join = (...segments) => path.join(ROOT, ...segments);

const TEXT_EXTENSIONS = new Set([".js", ".html", ".css", ".webmanifest", ".py"]);

/** 全站 `?v=` 字面量扫描根；漏目录 = 那边永远停在旧戳。 */
const SCAN_ROOTS = [
  join("frontend"),
  join("apps", "store", "templates"),
  join("apps", "store", "static"),
  join("design")
];

/** 曾写过 / 可能再写回字面量戳的 Python 渲染入口，一并扫。 */
const EXTRA_FILES = [
  join("apps", "store", "api", "pages.py"),
  join("apps", "store", "api", "alipay.py"),
  join("apps", "server", "modules", "interaction3d", "api.py")
];

const SKIP_DIR_NAMES = new Set([
  "vendor",
  "node_modules",
  ".venv",
  ".venv-store",
  ".extracted"
]);

const QUERY_V_RE = /\?v=[^"'`\s)]+/g;
const MODEL_VERSION_CONST_RE =
  /\b(HOME_LITE_MODEL_VERSION|APPLIANCE_LITE_MODEL_VERSION)\s*=\s*"[^"]*"/g;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function localTimestamp(date = new Date()) {
  return (
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
      console.log(
        "Usage: node ops/bump_static_cache_versions.mjs [--version=YYMMDDHHMM] [--dry-run]"
      );
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

  next = next.replace(QUERY_V_RE, match => {
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
