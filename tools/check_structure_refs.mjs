/**
 * Verify that every static-asset reference in the repo still resolves to a file
 * on disk, and that the backend's hardcoded path lists agree with reality.
 *
 * This is the guard rail for directory-structure refactors: the frontend has no
 * bundler, so a moved file only breaks at runtime (a 404 in the browser) and the
 * backend pins the same paths in several literal sets.
 *
 * Usage:
 *   node tools/check_structure_refs.mjs
 *
 * Checks:
 *   1. `/static/...` references in frontend/ (html/js/css/webmanifest) exist.
 *   2. Relative ESM imports in frontend/ (./x, ../x) exist.
 *   3. backend public_static_files entries exist under frontend/static.
 *   4. interaction3d resource whitelist matches frontend/modules/runtime.
 *   5. Reports dangling `backend.app` / `backend/app` literals (informational).
 *
 * Exits 1 when any of the first four checks fail.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = path.join(ROOT, "frontend");
const STATIC = path.join(FRONTEND, "static");
const MAIN_PY = path.join(ROOT, "backend", "main.py");
const MODULES_API_PY = path.join(ROOT, "backend", "modules", "interaction3d", "api.py");
const MODULES_DIR = path.join(FRONTEND, "modules", "runtime");

const SKIP_DIR_NAMES = new Set([
  "vendor",
  "node_modules",
  "__pycache__",
  ".venv",
  ".venv-store",
  ".extracted"
]);

/** Text files that can carry a static reference. */
const SCAN_EXTENSIONS = new Set([".html", ".js", ".mjs", ".css", ".webmanifest"]);

/**
 * `/static/<something>.<ext>` — the extension anchor skips dynamic
 * concatenations, and the lookbehind keeps `store/static/x.svg` or
 * `frontend/static/x.js` (which merely end in `/static/...`) from matching.
 */
const STATIC_REF_RE =
  /(?<![\w/])\/static\/[A-Za-z0-9_@./-]+\.(?:js|mjs|css|html|svg|png|jpg|jpeg|ico|webmanifest|mp3|woff2|ttf|json|glb|gltf|bin|ktx2|webp|wasm|seq|das)/g;

/** Relative ESM import/export specifier with a static path. */
const RELATIVE_IMPORT_RE =
  /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;

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
      yield* walkFiles(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SCAN_EXTENSIONS.has(path.extname(entry.name))) continue;
    yield full;
  }
}

function stripQuery(specifier) {
  const cut = specifier.search(/[?#]/);
  return cut === -1 ? specifier : specifier.slice(0, cut);
}

function relFromRoot(file) {
  return path.relative(ROOT, file);
}

function exists(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

/**
 * Drop comments before scanning. Comments routinely mention sibling paths
 * (`store/static/api-error.js`) and commented-out imports, neither of which is
 * a live reference.
 *
 * `//` is only treated as a line comment when not preceded by `:` so that
 * `https://…` inside a string survives.
 */
function stripComments(source, ext) {
  let next = source.replace(/\/\*[\s\S]*?\*\//g, "");
  if (ext === ".html" || ext === ".webmanifest") {
    next = next.replace(/<!--[\s\S]*?-->/g, "");
  }
  if (ext !== ".css" && ext !== ".html" && ext !== ".webmanifest") {
    next = next.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  }
  return next;
}

/** Read a scannable file with its comments removed. */
function readScannable(file) {
  return stripComments(fs.readFileSync(file, "utf8"), path.extname(file));
}

/** Check 1: all `/static/...` literals resolve under frontend/static. */
function checkStaticRefs(problems) {
  let checked = 0;
  for (const file of walkFiles(FRONTEND)) {
    const source = readScannable(file);
    for (const match of source.matchAll(STATIC_REF_RE)) {
      const specifier = stripQuery(match[0]);
      checked += 1;
      const target = path.join(FRONTEND, specifier.replace(/^\/static\//, "static/"));
      if (!exists(target)) {
        problems.push(`${relFromRoot(file)}: /static reference not found -> ${specifier}`);
      }
    }
  }
  return checked;
}

/** Check 2: relative ESM specifiers resolve next to the importing file. */
function checkRelativeImports(problems) {
  let checked = 0;
  for (const file of walkFiles(FRONTEND)) {
    const source = readScannable(file);
    for (const match of source.matchAll(RELATIVE_IMPORT_RE)) {
      const specifier = stripQuery(match[1]);
      checked += 1;
      const target = path.resolve(path.dirname(file), specifier);
      if (!exists(target)) {
        problems.push(`${relFromRoot(file)}: relative import not found -> ${match[1]}`);
      }
    }
  }
  return checked;
}

/**
 * Check 3: `public_static_files` in backend main.py must list paths that exist.
 *
 * The set is only worth checking once we are past the marker comment; scanning
 * the whole file would also pick up unrelated strings.
 */
function checkPublicStaticFiles(problems) {
  if (!fs.existsSync(MAIN_PY)) {
    problems.push(`${relFromRoot(MAIN_PY)}: missing, cannot verify public_static_files`);
    return 0;
  }
  const source = fs.readFileSync(MAIN_PY, "utf8");
  const start = source.indexOf("public_static_files = {");
  const end = source.indexOf("\n    def ", start);
  if (start === -1 || end === -1) {
    problems.push(`${relFromRoot(MAIN_PY)}: public_static_files block not found`);
    return 0;
  }
  const block = source.slice(start, end);
  let checked = 0;
  for (const match of block.matchAll(/['"](\/static\/[^'"]+)['"]/g)) {
    checked += 1;
    const target = path.join(FRONTEND, match[1].replace(/^\/static\//, "static/"));
    if (!exists(target)) {
      problems.push(`${relFromRoot(MAIN_PY)}: public_static_files entry missing on disk -> ${match[1]}`);
    }
  }
  return checked;
}

/**
 * Check 4: the interaction3d whitelist doubles as the file listing of
 * frontend/modules/runtime, and the route has no sub-segments, so the
 * two sets must match exactly in both directions.
 */
function checkInteraction3dWhitelist(problems) {
  if (!fs.existsSync(MODULES_API_PY) || !fs.existsSync(MODULES_DIR)) {
    problems.push("interaction3d api.py or resource dir missing; cannot verify whitelist");
    return 0;
  }
  const source = fs.readFileSync(MODULES_API_PY, "utf8");
  const start = source.indexOf("media_types = {");
  const end = source.indexOf("if filename not in media_types:", start);
  if (start === -1 || end === -1) {
    problems.push(`${relFromRoot(MODULES_API_PY)}: media_types block not found`);
    return 0;
  }
  const block = source.slice(start, end);
  const listed = new Set();
  for (const match of block.matchAll(/['"]([A-Za-z0-9_@.-]+\.(?:js|css|html))['"]/g)) {
    listed.add(match[1]);
  }
  const onDisk = new Set(fs.readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name));

  for (const name of onDisk) {
    if (!listed.has(name)) {
      problems.push(`frontend/modules/runtime/${name}: on disk but not in whitelist (will 404)`);
    }
  }
  for (const name of listed) {
    if (!onDisk.has(name)) {
      problems.push(`${relFromRoot(MODULES_API_PY)}: whitelist entry has no file -> ${name}`);
    }
  }
  return listed.size;
}

/**
 * Check 5 (informational): `backend.app` / `backend/app` literals. During the
 * de-`app` refactor these must all flip; this only lists them so the batch can
 * be closed out deliberately rather than by a blind search-and-replace.
 */
function reportBackendAppLiterals() {
  const skipDirs = new Set(["node_modules", ".git", ".venv", ".venv-store", "__pycache__", "源代码", "vendor"]);
  const hits = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name) || entry.name.startsWith(".venv")) continue;
        walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(js|mjs|css|html|py|md|ini|yml|yaml|json|toml)$/i.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (/backend[./]app/.test(line)) {
          hits.push(`${relFromRoot(full)}:${index + 1}`);
        }
      });
    }
  };
  walk(ROOT);
  return hits;
}

/**
 * Check 6: the backend must resolve the repo root from its own location, and
 * must still be importable under the module path the launchers use.
 */
function checkBackendRootDepth(problems) {
  const configPy = path.join(ROOT, "backend", "config.py");
  if (!fs.existsSync(configPy)) {
    problems.push("backend/config.py missing; cannot verify repo-root resolution");
    return;
  }
  const source = fs.readFileSync(configPy, "utf8");
  const match = source.match(/PROJECT_ROOT\s*=\s*Path\(__file__\)\.resolve\(\)\.parents\[(\d+)\]/);
  if (!match) {
    problems.push("backend/config.py: PROJECT_ROOT pattern not recognised");
    return;
  }
  const depth = Number(match[1]);
  // `Path.parents[0]` is the file's own directory, so `parents[N]` is N + 1
  // levels up from the file.
  const resolved = path.resolve(
    path.join(ROOT, "backend", "config.py"),
    ...Array(depth + 1).fill("..")
  );
  if (resolved !== ROOT) {
    problems.push(
      `backend/config.py: parents[${depth}] resolves to ${resolved}, expected ${ROOT}`
    );
  }
}

/**
 * Check 7: the Dockerfile asserts on concrete paths at build time, so a moved
 * file turns into a build failure rather than a silent 404. Verify every
 * repo-relative path it mentions still exists.
 */
function checkDockerfilePaths(problems) {
  const dockerfile = path.join(ROOT, "Dockerfile");
  if (!fs.existsSync(dockerfile)) {
    problems.push("Dockerfile missing; cannot verify build-time path assertions");
    return 0;
  }
  const source = fs.readFileSync(dockerfile, "utf8");
  const seen = new Set();
  let checked = 0;
  for (const match of source.matchAll(
    /(?<![\w/.-])((?:frontend|backend|store|migrations|docker|tools|deploy|keys|image)\/[A-Za-z0-9_.@/-]+)/g
  )) {
    const rel = match[1];
    if (seen.has(rel)) continue;
    seen.add(rel);
    checked += 1;
    if (!fs.existsSync(path.join(ROOT, rel))) {
      problems.push(`Dockerfile: referenced path does not exist -> ${rel}`);
    }
  }
  return checked;
}

function main() {
  const problems = [];
  const counts = {
    staticRefs: checkStaticRefs(problems),
    relativeImports: checkRelativeImports(problems),
    publicStaticFiles: checkPublicStaticFiles(problems),
    interaction3dWhitelist: checkInteraction3dWhitelist(problems),
    dockerfilePaths: checkDockerfilePaths(problems)
  };
  checkBackendRootDepth(problems);

  const backendAppLiterals = reportBackendAppLiterals();

  console.log(
    `checked: ${counts.staticRefs} /static refs, ` +
      `${counts.relativeImports} relative imports, ` +
      `${counts.publicStaticFiles} public_static_files entries, ` +
      `${counts.interaction3dWhitelist} interaction3d whitelist entries, ` +
      `${counts.dockerfilePaths} Dockerfile paths`
  );

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
  } else {
    console.log("OK: all static references resolve and path lists match the tree.");
  }

  if (backendAppLiterals.length > 0) {
    console.log(`\nnote: ${backendAppLiterals.length} occurrence(s) of a "backend.app" / "backend/app" literal remain:`);
    for (const hit of backendAppLiterals.slice(0, 60)) console.log(`  - ${hit}`);
    if (backendAppLiterals.length > 60) {
      console.log(`  ... and ${backendAppLiterals.length - 60} more`);
    }
  }

  process.exit(problems.length > 0 ? 1 : 0);
}

main();
