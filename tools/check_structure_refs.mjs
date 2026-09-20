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
 *   5. `/api/v1/modules/interaction3d/<path>` asset URLs hit a runtime module.
 *   6. `/store-static/<path>` references hit a file under store/static.
 *   7. Relative `url(...)` references in CSS resolve next to the stylesheet.
 *   8. literal `frontend_dir / …` chains in the backend resolve on disk.
 *   9. Reports dangling `backend.app` / `backend/app` literals (informational;
 *      time-stamped records under docs/ are excluded).
 *  10. backend/config.py still resolves the repo root from its own location.
 *  11. every repo-relative path named by the Dockerfile still exists.
 *
 * Exits 1 when any of the first eight checks fail.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const FRONTEND = path.join(ROOT, "frontend");
const STATIC = path.join(FRONTEND, "static");
const MAIN_PY = path.join(ROOT, "backend", "main.py");
const MODULES_API_PY = path.join(ROOT, "backend", "modules", "interaction3d", "api.py");
const MODULES_DIR = path.join(FRONTEND, "modules", "runtime");
const STORE = path.join(ROOT, "store");
const STORE_STATIC = path.join(STORE, "static");

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

function* walkFiles(dir, extensions = SCAN_EXTENSIONS) {
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
function readScannable(file, extensions = SCAN_EXTENSIONS) {
  const ext = path.extname(file);
  let source = fs.readFileSync(file, "utf8");
  if (ext === ".py") {
    // Only drop whole-line `#` comments; embedded HTML lives in f-strings.
    source = source
      .split("\n")
      .map((line) => (/^\s*#/.test(line) ? "" : line))
      .join("\n");
  }
  return stripComments(source, ext);
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
 * frontend/modules/runtime. Its keys are paths relative to that directory and
 * nested by functional domain, so the two sets must match exactly in both
 * directions (a missing key only shows up as a browser 404).
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
  for (const match of block.matchAll(/['"]([A-Za-z0-9_@./-]+\.(?:js|css|html))['"]/g)) {
    listed.add(match[1]);
  }
  const onDisk = new Set(
    [...walkFiles(MODULES_DIR)].map((file) =>
      path.relative(MODULES_DIR, file).split(path.sep).join("/")
    )
  );

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
 * Check 5: `/api/v1/modules/interaction3d/<path>` asset URLs must hit a file
 * under frontend/modules/runtime.
 *
 * Runtime modules are served by a single `{filename:path}` route whose keys are
 * nested by functional domain, so a stale URL (e.g. a sibling that moved into a
 * subpackage) only surfaces as a browser 404. `stage.html` is a rendered page
 * rather than a file, so only `.js` / `.css` URLs are treated as assets.
 */
const INTERACTION3D_ASSET_RE =
  /(?<![\w/])\/api\/v1\/modules\/interaction3d\/([A-Za-z0-9_@./-]+\.(?:js|css))/g;

function checkInteraction3dAssetUrls(problems) {
  let checked = 0;
  const scan = (root, extensions) => {
    for (const file of walkFiles(root, extensions)) {
      const source = readScannable(file, extensions);
      for (const match of source.matchAll(INTERACTION3D_ASSET_RE)) {
        const relative = stripQuery(match[1]);
        checked += 1;
        if (!exists(path.join(MODULES_DIR, relative))) {
          problems.push(
            `${relFromRoot(file)}: interaction3d asset URL not found -> ${relative}`
          );
        }
      }
    }
  };
  scan(FRONTEND, SCAN_EXTENSIONS);
  // api.py injects the stage stylesheet URL itself, so it counts as a caller.
  if (fs.existsSync(MODULES_API_PY)) {
    scan(path.dirname(MODULES_API_PY), new Set([".py"]));
  }
  return checked;
}

/**
 * Check 6: `/store-static/<path>` references must hit a file under store/static.
 * The store service mounts that directory itself, so the same argument as check
 * 1 applies — a moved asset is only visible as a broken page.
 */
const STORE_STATIC_REF_RE =
  /(?<![\w-])\/store-static\/([A-Za-z0-9_@./-]+\.(?:js|mjs|css|html|svg|png|jpg|jpeg|ico|webmanifest|mp3|woff2|ttf|json))/g;

function checkStoreStaticRefs(problems) {
  if (!fs.existsSync(STORE_STATIC)) {
    problems.push("store/static missing; cannot verify /store-static references");
    return 0;
  }
  let checked = 0;
  const extensions = new Set([...SCAN_EXTENSIONS, ".py"]);
  for (const file of walkFiles(STORE, extensions)) {
    // Runtime data (SQLite, uploaded product images) is not source.
    if (/^(data|keys|__pycache__)\//.test(path.relative(STORE, file))) continue;
    const source = readScannable(file, extensions);
    for (const match of source.matchAll(STORE_STATIC_REF_RE)) {
      const relative = stripQuery(match[1]);
      checked += 1;
      if (!exists(path.join(STORE_STATIC, relative))) {
        problems.push(`${relFromRoot(file)}: /store-static reference not found -> ${relative}`);
      }
    }
  }
  return checked;
}

/**
 * Check 7: relative `url(...)` references inside CSS.
 *
 * Every other check keys off an absolute URL, so a stylesheet that reaches an
 * asset by relative path is invisible to them. `store/static/font.min.css` is
 * exactly that case: it pulls the icon font with `url(../fonts/font.woff2)`.
 *
 * Resolution follows the **URL** space, not the directory the file happens to
 * live in, because the store aliases directories onto different URL roots:
 * `/store-static/font.min.css` + `../fonts/x` becomes `/fonts/x`, and
 * `store/app.py` mounts `/fonts` from `store/static/fonts`. Modelling this also
 * pins the aliases themselves — if `/fonts` ever stops being mounted, the font
 * URL escapes every known mount and this check says so instead of quietly
 * passing.
 *
 * Only specs carrying a real asset extension are checked, which skips
 * `url(#filter)`, `url(data:…)`, `url(https://…)` and absolute `/…` paths
 * (the latter are already covered by checks 1 and 6).
 */
const CSS_URL_RE =
  /url\(\s*(?:["']?)((?:\.{0,2}\/)*[A-Za-z0-9_@-][A-Za-z0-9_@./-]*\.(?:woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|ico|webp|avif|cur|mp3|wav|ogg))(?:\?[^)"']*)?(?:["']?)\s*\)/g;

/** URL root -> directory on disk. Order matters: longest prefix first. */
function cssMounts() {
  return [
    { prefix: "/store-static/", dir: STORE_STATIC },
    { prefix: "/static/", dir: STATIC },
    { prefix: "/fonts/", dir: path.join(STORE_STATIC, "fonts") }
  ];
}

/** Resolve `..`/`.` segments in a URL path, keeping it absolute. */
function normalizeUrlPath(urlPath) {
  const parts = [];
  for (const segment of urlPath.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return `/${parts.join("/")}`;
}

function checkCssRelativeUrls(problems) {
  let checked = 0;
  const mounts = cssMounts();
  for (const mount of mounts) {
    if (!fs.existsSync(mount.dir)) continue;
    for (const file of walkFiles(mount.dir, new Set([".css"]))) {
      const rel = path.relative(mount.dir, file).split(path.sep).join("/");
      const source = readScannable(file, new Set([".css"]));
      for (const match of source.matchAll(CSS_URL_RE)) {
        const spec = match[1];
        if (spec.startsWith("/")) continue;
        checked += 1;
        const urlPath = normalizeUrlPath(`${mount.prefix}${rel}/${spec}`);
        const target = mounts.find((candidate) => urlPath.startsWith(candidate.prefix));
        if (!target) {
          problems.push(
            `${relFromRoot(file)}: CSS url() escapes every mount -> ${spec} (resolves to ${urlPath})`
          );
          continue;
        }
        const onDisk = path.join(target.dir, urlPath.slice(target.prefix.length));
        if (!exists(onDisk)) {
          problems.push(`${relFromRoot(file)}: CSS url() not found -> ${urlPath}`);
        }
      }
    }
  }
  return checked;
}

/**
 * Check 8: literal `frontend_dir / …` chains in the backend resolve on disk.
 *
 * Several backend paths are built in Python rather than listed in
 * `public_static_files`, so nothing else would notice if the target moved:
 * the `/static` mount itself, the two apple-touch-icon routes that reach into
 * `static/assets`, and the MDI icon root under `static/vendor/mdi`.
 *
 * Only the **literal prefix** is verified. A chain that continues with a
 * variable (`/ version` for the MDI release folder) is checked up to the last
 * literal segment, which is where a structural move would show up anyway.
 */
const FRONTEND_DIR_CHAIN_RE = /frontend_dir((?:\s*\/\s*(['"])([^'"]+)\2)+)/g;

function checkFrontendDirChains(problems) {
  let checked = 0;
  for (const file of walkFiles(ROOT, new Set([".py"]))) {
    const rel = path.relative(ROOT, file);
    if (!rel.startsWith(`backend${path.sep}`)) continue;
    const source = readScannable(file, new Set([".py"]));
    for (const match of source.matchAll(FRONTEND_DIR_CHAIN_RE)) {
      const segments = [...match[1].matchAll(/(['"])([^'"]+)\1/g)].map((part) => part[2]);
      if (segments.length === 0) continue;
      checked += 1;
      const target = path.join(FRONTEND, ...segments);
      if (!fs.existsSync(target)) {
        problems.push(
          `${rel}: frontend_dir chain not found -> frontend/${segments.join("/")}`
        );
      }
    }
  }
  return checked;
}

/**
 * Check 9 (informational): `backend.app` / `backend/app` literals. During the
 * de-`app` refactor these must all flip; this only lists them so the batch can
 * be closed out deliberately rather than by a blind search-and-replace.
 *
 * Time-stamped records under docs/audits and docs/releases describe the tree as
 * it was, so they are excluded — rewriting history there would be wrong.
 */
const HISTORICAL_DIRS = ["docs/audits", "docs/releases"];

function reportBackendAppLiterals() {
  const skipDirs = new Set(["node_modules", ".git", ".venv", ".venv-store", "__pycache__", "源代码", "vendor"]);
  const hits = [];
  const walk = (dir) => {
    const relDir = path.relative(ROOT, dir).split(path.sep).join("/");
    if (HISTORICAL_DIRS.some((prefix) => relDir === prefix || relDir.startsWith(`${prefix}/`))) {
      return;
    }
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
      const full = path.join(dir, entry.name);
      if (full === SELF) continue;
      if (!/\.(js|mjs|css|html|py|md|ini|yml|yaml|json|toml)$/i.test(entry.name)) continue;
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
    interaction3dAssetUrls: checkInteraction3dAssetUrls(problems),
    storeStaticRefs: checkStoreStaticRefs(problems),
    cssRelativeUrls: checkCssRelativeUrls(problems),
    frontendDirChains: checkFrontendDirChains(problems),
    dockerfilePaths: checkDockerfilePaths(problems)
  };
  checkBackendRootDepth(problems);

  const backendAppLiterals = reportBackendAppLiterals();

  console.log(
    `checked: ${counts.staticRefs} /static refs, ` +
      `${counts.relativeImports} relative imports, ` +
      `${counts.publicStaticFiles} public_static_files entries, ` +
      `${counts.interaction3dWhitelist} interaction3d whitelist entries, ` +
      `${counts.interaction3dAssetUrls} interaction3d asset URLs, ` +
      `${counts.storeStaticRefs} /store-static refs, ` +
      `${counts.cssRelativeUrls} CSS url() refs, ` +
      `${counts.frontendDirChains} frontend_dir chains, ` +
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
