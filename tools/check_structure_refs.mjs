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
 *   9. every served module carries a cache stamp, and there is exactly one stamp.
 *  10. file paths named inside comments still resolve.
 *  11. Reports dangling `backend.app` / `backend/app` literals (informational;
 *      time-stamped records under docs/ are excluded).
 *  12. backend/config.py still resolves the repo root from its own location.
 *  13. every repo-relative path named by the Dockerfile still exists.
 *  14. the LICENSE_RESTRICTED literal is compared in exactly one module,
 *      `frontend/static/utils/api-request.js` — see
 *      checkLicenseRestrictionSingleSource for why that has to be pinned.
 *  15. pointer capture (`setPointerCapture` / `releasePointerCapture`) is only
 *      called inside `frontend/static/utils/pointer-capture.js` — see
 *      checkPointerCaptureSingleSource.
 *  16. the anonymous static whitelist is closed under imports: every module an
 *      unauthenticated page can reach must itself be whitelisted — see
 *      checkAnonymousStaticClosure.
 *
 * Exits 1 when any check fails, except 11, which only reports.
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
      // A stylesheet's URLs resolve against its own **directory**, so the
      // basename is dropped before appending the specifier. Keeping it would
      // turn `fonts.css` + `./fonts/x.woff2` into `fonts.css/fonts/x.woff2`,
      // i.e. a 404 the browser never asked for. The `..`-heavy case the mounts
      // were originally modelled on (`font.min.css` + `../fonts/x`) is
      // unaffected: `..` pops the same segment either way.
      const relDir = rel.slice(0, rel.lastIndexOf("/") + 1);
      const source = readScannable(file, new Set([".css"]));
      for (const match of source.matchAll(CSS_URL_RE)) {
        const spec = match[1];
        if (spec.startsWith("/")) continue;
        checked += 1;
        const urlPath = normalizeUrlPath(`${mount.prefix}${relDir}${spec}`);
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
 * Check 9: static-asset cache stamps (the W18 invariant, rebuilt).
 *
 * `/static/renderer|editor|bridge|utils/**` are **not** served `no-store` — only
 * the pages, `/api/v1/`, `/static/display/display.js|css` and
 * `/static/3d-studio/` are — so the `?v=` query is the only thing that
 * invalidates them in a browser. A missing stamp fails silently in two ways: the
 * module sticks in cache across deploys, and when a sibling reaches the same
 * module *with* a stamp the browser treats the two specifiers as different
 * modules and keeps two instances with two copies of module state. That is the
 * documented「两份控件注册表 / 控件找不到类型」failure.
 *
 * Three places are checked, plus uniqueness:
 *   - module imports, resolved the same way the browser would;
 *   - `<script src>` / `<link href>` in HTML;
 *   - non-minified `/store-static/…` references in the store templates.
 *
 * `vendor` is exempt because its version lives in the path, and `*.min.js` /
 * `*.min.css` are exempt as elsewhere in this file. `new URL(…, import.meta.url)`
 * needs no stamp either: that is the `file://` branch, where a query string
 * would make the path unresolvable.
 */
const STAMP_IMPORT_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
const STAMP_HTML_RE = /<(?:script|link)\b[^>]*?(?:src|href)="(\/static\/[^"]+)"/gi;
const STORE_STATIC_STAMP_RE = /\/store-static\/[A-Za-z0-9_@./-]+\.(?:js|mjs|css)(?:\?v=[0-9]{14})?/g;
const STAMP_CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;
const STAMP_VALUE_RE = /\?v=([0-9]{14})/;

/** The file a specifier would load, or null when it is out of scope. */
function stampedTarget(spec, importer) {
  const clean = spec.split("?")[0].split("#")[0];
  if (clean.includes("${") || clean.includes("/vendor/")) return null;
  if (clean.startsWith(".")) return path.resolve(path.dirname(importer), clean);
  if (clean.startsWith("/static/")) return path.join(FRONTEND, clean.slice(1));
  if (clean.startsWith("/api/v1/modules/interaction3d/")) {
    return path.join(MODULES_DIR, clean.replace("/api/v1/modules/interaction3d/", ""));
  }
  return null;
}

/**
 * The file a CSS `@import` would load, or null when it is out of scope.
 *
 * `@import` accepts bare relative URLs (`"controls.css"`), which `stampedTarget`
 * deliberately rejects because a bare specifier in JS means a package import.
 * CSS has no packages, so here everything that is not an absolute URL resolves
 * against the importing stylesheet.
 */
function cssImportTarget(spec, importer) {
  const clean = spec.split("?")[0].split("#")[0];
  if (clean.includes("${")) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return null;
  if (clean.includes("/vendor/")) return null;
  if (clean.startsWith("/static/")) return path.join(FRONTEND, clean.slice(1));
  return path.resolve(path.dirname(importer), clean);
}

function checkStaticCacheStamps(problems) {
  let checked = 0;
  const stamps = new Map();
  const note = (stamp, where) => {
    if (!stamps.has(stamp)) stamps.set(stamp, where);
  };

  for (const file of walkFiles(FRONTEND, new Set([".js", ".mjs"]))) {
    if (path.basename(file).endsWith(".min.js")) continue;
    const source = readScannable(file, new Set([".js"]));
    for (const match of source.matchAll(STAMP_IMPORT_RE)) {
      const spec = match[1];
      const target = stampedTarget(spec, file);
      if (!target || !exists(target)) continue;
      checked += 1;
      const found = spec.match(STAMP_VALUE_RE);
      if (found) note(found[1], relFromRoot(file));
      else problems.push(`${relFromRoot(file)}: import has no cache stamp -> ${spec}`);
    }
  }

  for (const file of walkFiles(FRONTEND, new Set([".html"]))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(STAMP_HTML_RE)) {
      const url = match[1];
      if (url.startsWith("/static/vendor/")) continue;
      checked += 1;
      const found = url.match(STAMP_VALUE_RE);
      if (found) note(found[1], relFromRoot(file));
      else problems.push(`${relFromRoot(file)}: HTML asset has no cache stamp -> ${url}`);
    }
  }

  for (const file of walkFiles(FRONTEND, new Set([".css"]))) {
    if (file.endsWith(".min.css")) continue;
    const source = readScannable(file, new Set([".css"]));
    for (const match of source.matchAll(STAMP_CSS_IMPORT_RE)) {
      const spec = match[1];
      const target = cssImportTarget(spec, file);
      if (!target || !exists(target)) continue;
      checked += 1;
      const found = spec.match(STAMP_VALUE_RE);
      if (found) note(found[1], relFromRoot(file));
      else problems.push(`${relFromRoot(file)}: CSS @import has no cache stamp -> ${spec}`);
    }
  }

  // store/static 下的 JS 必须单独扫：商店是**独立的构建上下文**（`store/app.py` 只挂
  // `/store-static` 与 `/fonts`，没有 `/static`），而上面那两轮只走 FRONTEND。空档的代价是
  // 一整片区域完全不设防 —— 而且「戳必须唯一」这条判定**见过**的戳里当然只有一个，
  // 于是 `store/static/palette.js` 带着一枚陈旧戳也照样全绿（它指向的 scene/appearance.js
  // 早已随设计源更新，浏览器却按旧戳当另一个模块缓存）。
  // **本检查的覆盖范围必须与 tools/bump_static_cache_versions.mjs 的 SCAN_ROOTS 一致**：
  // 只测不改 → 刷新工具永远修不好；只改不测 → 错配没人发现。
  const storeStatic = path.join(STORE, "static");
  if (fs.existsSync(storeStatic)) {
    for (const file of walkFiles(storeStatic, new Set([".js", ".mjs"]))) {
      if (path.basename(file).endsWith(".min.js")) continue;
      const source = readScannable(file, new Set([".js"]));
      for (const match of source.matchAll(STAMP_IMPORT_RE)) {
        const spec = match[1];
        const target = stampedTarget(spec, file);
        if (!target || !exists(target)) continue;
        checked += 1;
        const found = spec.match(STAMP_VALUE_RE);
        if (found) note(found[1], relFromRoot(file));
        else problems.push(`${relFromRoot(file)}: import has no cache stamp -> ${spec}`);
      }
    }
    for (const file of walkFiles(storeStatic, new Set([".css"]))) {
      if (file.endsWith(".min.css")) continue;
      const source = readScannable(file, new Set([".css"]));
      for (const match of source.matchAll(STAMP_CSS_IMPORT_RE)) {
        const spec = match[1];
        const target = cssImportTarget(spec, file);
        if (!target || !exists(target)) continue;
        checked += 1;
        const found = spec.match(STAMP_VALUE_RE);
        if (found) note(found[1], relFromRoot(file));
        else problems.push(`${relFromRoot(file)}: CSS @import has no cache stamp -> ${spec}`);
      }
    }
  }

  const storeTemplates = path.join(STORE, "templates");
  if (fs.existsSync(storeTemplates)) {
    for (const file of walkFiles(storeTemplates, new Set([".html"]))) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(STORE_STATIC_STAMP_RE)) {
        const url = match[0];
        if (/\.min\.(?:js|css)$/.test(url)) continue;
        checked += 1;
        const found = url.match(STAMP_VALUE_RE);
        if (found) note(found[1], relFromRoot(file));
        else problems.push(`${relFromRoot(file)}: store asset has no cache stamp -> ${url}`);
      }
    }
  }

  if (stamps.size > 1) {
    const detail = [...stamps].map(([stamp, where]) => `${stamp} (${where})`).join(", ");
    problems.push(`cache stamp is not unique — the whole repo must share one: ${detail}`);
  }
  return checked;
}

/**
 * Check 9 covers CSS `@import` too: a stylesheet pulled in by another one needs
 * the same stamp as everything else. `@import` is the one import form the
 * browser resolves at parse time, so a missing stamp there is exactly as stale
 * as a missing stamp on a `<link>` — and, being CSS, it was the form nothing
 * checked until `presence-editor.css` shipped one without a stamp.
 *
 * Check 10: file paths named inside comments still resolve.
 *
 * The docstrings here are load-bearing — they name the file that owns a piece of
 * knowledge ("能力解析与文案统一来自 static/renderer/controls/climate.js") — so a
 * name that no longer resolves is worse than no name: it sends the next reader,
 * or the next grep, to a file that is not there. Two rounds of directory
 * refactoring left ~38 of them behind.
 *
 * Only mentions whose basename still exists **somewhere** are reported, which is
 * what keeps deliberate history out of the results: prose like「原先有 9 份各写各的」
 * names files that were deleted on purpose, and once a basename is gone from the
 * tree it can never be flagged.
 *
 * The test is「greppable」rather than「resolvable from a fixed root」: a mention passes
 * when some real path equals it or ends with `/` + it at a segment boundary.
 * That is the property that matters to a reader — you can paste the mention into
 * a search and land on the file — and it is deliberately tolerant of abbreviated
 * prefixes (`interaction3d/config.py` for `backend/modules/interaction3d/config.py`).
 * A stricter root-based rule flagged exactly those abbreviations, while a
 * moved-file mention like `renderer/renderer.js` still fails, because the real
 * path is `renderer/core/renderer.js` and no longer contains it.
 *
 * Exclusions, all of which fell out of the real false positives:
 *   - a leading `/` or `.` drops served URLs (`/store-static/x.css`),
 *     `api/v1/...` and bare relative specifiers (`./x.js`, `../plan/x.js`);
 *   - only the code roots are scanned (frontend/, store/, backend/, migrations/,
 *     docker/); markdown, docs/, deploy/, tools/ and data/ are not, so tree
 *     diagrams and examples cannot be mistaken for references.
 *
 * The trailing `(?![\w])` matters: without it `data/appearance.json` matched as
 * `data/appearance.js` (the `.js` alternative hitting the prefix of `.json`),
 * and every mention of that settings file was reported as a moved `.js` module.
 */
const COMMENT_PATH_RE =
  /(?<![\w/@.-])([A-Za-z0-9_@-]+(?:\/[A-Za-z0-9_@.-]+)+\.(?:js|mjs|css|py|html))(?![\w])/g;
const COMMENT_SCAN_EXTENSIONS = new Set([".js", ".mjs", ".py", ".css", ".html"]);
/** Code roots whose comments are checked; docs/ and markdown are excluded. */
const COMMENT_SCAN_ROOTS = [
  FRONTEND,
  STORE,
  path.join(ROOT, "backend"),
  path.join(ROOT, "migrations"),
  path.join(ROOT, "docker"),
  // `design/` is the canonical source the other roots' copies are generated
  // from, and every generated copy names it in its header (so the next reader
  // does not edit a file that gets overwritten). Scanning it is also what makes
  // those mentions resolve: the name only counts as greppable when a real path
  // under a scanned root equals it.
  path.join(ROOT, "design")
];

/**
 * Length-preserving comment mask. The offsets of `source` must stay valid so a
 * regex match can be tested for "is this position inside a comment?" — the
 * existing `stripComments` deletes text and cannot answer that.
 */
function commentMask(source, ext) {
  const chars = source.split("");
  const blank = (from, to) => {
    for (let i = from; i < to && i < chars.length; i += 1) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
  };

  if (ext !== ".py") {
    let index = 0;
    while (index < source.length) {
      const start = source.indexOf("/*", index);
      if (start === -1) break;
      const end = source.indexOf("*/", start + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(start, stop);
      index = stop;
    }
  }
  if (ext === ".html" || ext === ".webmanifest") {
    let index = 0;
    while (index < source.length) {
      const start = source.indexOf("<!--", index);
      if (start === -1) break;
      const end = source.indexOf("-->", start + 4);
      const stop = end === -1 ? source.length : end + 3;
      blank(start, stop);
      index = stop;
    }
  }
  if (ext === ".py") {
    // docstrings carry as much prose as `#` comments do, so both count
    for (const quote of ['"""', "'''"]) {
      let index = 0;
      while (index < source.length) {
        const start = source.indexOf(quote, index);
        if (start === -1) break;
        const end = source.indexOf(quote, start + 3);
        const stop = end === -1 ? source.length : end + 3;
        blank(start, stop);
        index = stop;
      }
    }
  }

  // line comments, located on the already-blanked text so a `//` that sits inside
  // a block comment cannot be counted twice
  const masked = chars.join("");
  let offset = 0;
  for (const line of masked.split("\n")) {
    let at = -1;
    if (ext === ".py") {
      if (/^\s*#/.test(line)) at = line.indexOf("#");
    } else if (ext !== ".css" && ext !== ".html" && ext !== ".webmanifest") {
      for (let i = 0; i + 1 < line.length; i += 1) {
        if (line[i] === "/" && line[i + 1] === "/" && (i === 0 || line[i - 1] !== ":")) {
          at = i;
          break;
        }
      }
    }
    if (at !== -1) blank(offset + at, offset + line.length);
    offset += line.length + 1;
  }

  return chars;
}

function checkCommentPaths(problems) {
  let checked = 0;
  const scanRoots = COMMENT_SCAN_ROOTS;

  /** basename -> repo-relative paths, so a mention can be tested for greppability */
  const realPaths = new Map();
  for (const root of scanRoots) {
    for (const file of walkFiles(root, COMMENT_SCAN_EXTENSIONS)) {
      const base = path.basename(file);
      if (!realPaths.has(base)) realPaths.set(base, []);
      realPaths.get(base).push(relFromRoot(file));
    }
  }

  for (const root of scanRoots) {
    for (const file of walkFiles(root, COMMENT_SCAN_EXTENSIONS)) {
      const source = fs.readFileSync(file, "utf8");
      const chars = commentMask(source, path.extname(file));
      for (const match of source.matchAll(COMMENT_PATH_RE)) {
        const mention = match[1];
        const start = match.index;
        // the whole mention must sit in comment text
        let inComment = true;
        for (let i = start; i < start + mention.length; i += 1) {
          if (chars[i] !== " ") {
            inComment = false;
            break;
          }
        }
        if (!inComment) continue;
        const candidates = realPaths.get(path.basename(mention));
        if (!candidates) continue;
        checked += 1;
        const greppable = candidates.some(
          (candidate) => candidate === mention || candidate.endsWith(`/${mention}`)
        );
        if (!greppable) {
          problems.push(`${relFromRoot(file)}: comment names a moved file -> ${mention}`);
        }
      }
    }
  }
  return checked;
}

/**
 * Check 11 (informational): `backend.app` / `backend/app` literals. During the
 * de-`app` refactor these must all flip; this only lists them so the batch can
 * be closed out deliberately rather than by a blind search-and-replace.
 *
 * All of `docs/` is excluded: it holds only time-stamped records
 * (`AUDIT-<date>.md`, `RELEASE-<version>.md`) that describe the tree as it was,
 * so rewriting history there would be wrong. The files used to live in
 * `docs/audits/` and `docs/releases/`; excluding the whole directory keeps this
 * exclusion from needing an update every time the layout shifts.
 */
const HISTORICAL_DIRS = ["docs"];

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
  const source = fs
    .readFileSync(dockerfile, "utf8")
    // 顶部解析指令（`# syntax=` / `# escape=` / `# check=`）指向的是外部构建镜像或
    // 构建器开关，不是仓库里的文件 —— 例如 `# syntax=docker/dockerfile:1` 里的
    // `docker/dockerfile` 会被下面的正则当成相对路径，报出一条永远修不掉的假阳性。
    // 先剔掉这些行再扫，注释里的真实路径（`COPY docker/...` 之类）照旧保留。
    .replace(/^#\s*(?:syntax|escape|check)\s*=.*$/gm, "");
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

/**
 * Check 14: the license-restriction literal has exactly one owner.
 *
 * `LICENSE_RESTRICTED` is how the backend gate (`backend/core/dependencies.py`
 * — licensed_user / licensed_viewer — and `backend/api/assets.py`) says "this
 * license may not do that". Every request entry point used to compare that
 * literal for itself — five of them — and answer by sending the user somewhere
 * the problem can be solved. A second code from the backend, or a split into
 * per-capability codes, would then be honoured only by whichever entry points
 * someone remembered to edit, and the rest would surface it as an ordinary
 * business error. Nothing breaks in that state, which is what makes it nasty:
 * the page keeps working while nobody is pointed at the page that fixes it.
 *
 * The comparison now lives in `frontend/static/utils/api-request.js`. Comments
 * are stripped before matching, so naming the code in prose stays free —
 * otherwise this guard would punish exactly the documentation that explains
 * why it exists.
 */
function checkLicenseRestrictionSingleSource(problems) {
  const owner = path.join("frontend", "static", "utils", "api-request.js");
  const ownerFile = path.join(ROOT, owner);
  const ownerRel = owner.split(path.sep).join("/");
  if (!fs.existsSync(ownerFile)) {
    problems.push(`${ownerRel} missing; the license-restriction literal has no owner`);
    return 0;
  }
  if (!readScannable(ownerFile).includes('"LICENSE_RESTRICTED"')) {
    problems.push(`${ownerRel} no longer defines the LICENSE_RESTRICTED literal`);
  }
  let scanned = 0;
  for (const file of walkFiles(FRONTEND)) {
    if (file === ownerFile) continue;
    scanned += 1;
    if (!/["'`]LICENSE_RESTRICTED["'`]/.test(readScannable(file))) continue;
    problems.push(
      `${relFromRoot(file)} compares the LICENSE_RESTRICTED literal itself; ` +
        `call apiAuthChallenge from ${ownerRel} instead`
    );
  }
  return scanned;
}

/**
 * Check 15: pointer capture has exactly one implementation.
 *
 * `setPointerCapture` / `releasePointerCapture` throw for situations that are
 * entirely expected — the pointer is already gone, the element was just pulled
 * out of the document, or the capture was already released (pointerup happens
 * after pointercancel / lostpointercapture often enough that a second release
 * is normal). The tree used to answer that in three different ways: a bare call,
 * an empty `try { … } catch {}`, or a `?.` optional call. Each site then left
 * the reader to work out which failure was being tolerated, and the empty
 * catches said nothing at all — the guard looked deliberate and explained
 * nothing. Two of those three forms also disagree about what happens when the
 * call really fails: bare rethrows, `?.` only covers a missing method.
 *
 * The single owner is `frontend/static/utils/pointer-capture.js`, which states
 * the tolerated failures once. Comments are stripped before matching, so the
 * prose above (and the mentions that survive in unrelated files) stays free.
 * Scope is the frontend tree: `store/static` is a separate app with its own
 * asset root and cannot import from `/static/utils/`.
 */
function checkPointerCaptureSingleSource(problems) {
  const owner = path.join("frontend", "static", "utils", "pointer-capture.js");
  const ownerFile = path.join(ROOT, owner);
  const ownerRel = owner.split(path.sep).join("/");
  if (!fs.existsSync(ownerFile)) {
    problems.push(`${ownerRel} missing; pointer capture has no owner`);
    return 0;
  }
  const ownerSource = readScannable(ownerFile);
  for (const name of ["capturePointer", "releasePointer"]) {
    if (!ownerSource.includes(`export function ${name}(`)) {
      problems.push(`${ownerRel} no longer exports ${name}()`);
    }
  }
  const directCallRe = /\.(?:set|release)PointerCapture\s*\??\.?\s*\(/;
  let scanned = 0;
  for (const file of walkFiles(FRONTEND)) {
    if (file === ownerFile) continue;
    scanned += 1;
    if (!directCallRe.test(readScannable(file))) continue;
    problems.push(
      `${relFromRoot(file)} calls setPointerCapture/releasePointerCapture itself; ` +
        `call capturePointer/releasePointer from ${ownerRel} instead`
    );
  }
  return scanned;
}

/**
 * Check 16: the anonymous whitelist is closed under imports.
 *
 * `public_static_files` in backend/main.py decides which `/static/...` files
 * anyone may fetch: everything else there is 401 until the browser is
 * authorised. The pages that need it most are the ones nobody has logged in
 * for yet — /setup, /login, /pair, /license and the recovery page — and those
 * pages are the ones whose own module graph has to survive that gate.
 *
 * An ESM graph does not half-load: one 401 on a transitively imported module
 * and none of the page's script runs. There is nothing on screen to suggest
 * why, either — the page keeps its HTML and CSS and simply never becomes
 * interactive. That is why the set is written by hand with a comment urging
 * "新增匿名页依赖的 utils 务必同步这里": the cost of forgetting is a blank
 * page only unauthenticated users can see, which is the least-exercised path
 * there is. This check walks the graph instead of trusting the note.
 *
 * The search starts from every whitelisted `.js` (and `.css`, which can pull
 * in fonts and images) and follows imports and `/static/...` literals. Anything
 * it reaches that the whitelist does not name is reported.
 */
function checkAnonymousStaticClosure(problems) {
  const source = fs.readFileSync(MAIN_PY, "utf8");
  const start = source.indexOf("public_static_files = {");
  const end = source.indexOf("\n    def ", start);
  if (start === -1 || end === -1) {
    problems.push(`${relFromRoot(MAIN_PY)}: public_static_files block not found`);
    return 0;
  }
  const allowed = new Set(
    [...source.slice(start, end).matchAll(/['"](\/static\/[^'"]+)['"]/g)].map(hit =>
      stripQuery(hit[1])
    )
  );
  const urlOf = file => "/" + path.relative(FRONTEND, file).split(path.sep).join("/");
  const queue = [...allowed].filter(url => url.endsWith(".js") || url.endsWith(".css"));
  const seen = new Set();
  let checked = 0;
  while (queue.length > 0) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const file = path.join(FRONTEND, url.replace(/^\/static\//, "static/"));
    if (!exists(file)) continue; // Check 3 reports a whitelist entry with no file.
    checked += 1;
    const text = readScannable(file);
    const reached = [];
    if (path.extname(file) === ".css") {
      for (const match of text.matchAll(CSS_URL_RE)) {
        const specifier = stripQuery(match[1]);
        if (specifier.startsWith("/")) {
          reached.push(path.join(FRONTEND, specifier.replace(/^\//, "")));
        } else if (!/^[a-z]+:/i.test(specifier)) {
          reached.push(path.resolve(path.dirname(file), specifier));
        }
      }
    } else {
      for (const match of text.matchAll(RELATIVE_IMPORT_RE)) {
        reached.push(path.resolve(path.dirname(file), stripQuery(match[1])));
      }
    }
    for (const match of text.matchAll(STATIC_REF_RE)) {
      reached.push(path.join(FRONTEND, stripQuery(match[0]).replace(/^\/static\//, "static/")));
    }
    for (const target of reached) {
      if (!exists(target)) continue; // Check 1 / Check 2 report dangling references.
      const targetUrl = urlOf(target);
      if (allowed.has(targetUrl)) {
        queue.push(targetUrl);
        continue;
      }
      problems.push(
        `${relFromRoot(file)} reaches ${targetUrl}, which is not in public_static_files; ` +
          `an anonymous page loads this graph, so a 401 on that file leaves the page blank`
      );
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
    cacheStamps: checkStaticCacheStamps(problems),
    commentPaths: checkCommentPaths(problems),
    dockerfilePaths: checkDockerfilePaths(problems),
    licenseRestriction: checkLicenseRestrictionSingleSource(problems),
    pointerCapture: checkPointerCaptureSingleSource(problems),
    anonymousClosure: checkAnonymousStaticClosure(problems)
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
      `${counts.cacheStamps} cache stamps, ` +
      `${counts.commentPaths} comment paths, ` +
      `${counts.dockerfilePaths} Dockerfile paths, ` +
      `${counts.licenseRestriction} files scanned for the license-restriction literal, ` +
      `${counts.pointerCapture} files scanned for direct pointer capture, ` +
      `${counts.anonymousClosure} anonymous-graph files scanned`
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
