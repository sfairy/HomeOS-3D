/**
 * Distribute the canonical scene design system (design/scene/) into the build
 * contexts that consume it.
 *
 * Usage:
 *   node tools/sync_scene_assets.mjs            # write the copies
 *   node tools/sync_scene_assets.mjs --dry-run  # report what would change
 *   node tools/sync_scene_assets.mjs --check    # exit 1 on drift (no writes)
 *
 * Why copies instead of a shared directory: the app image and the store image
 * are independent Docker build contexts (`Dockerfile` COPYs only `frontend/`
 * and only `store/`). A file outside those roots simply is not in the image, so
 * each context has to carry its own copy.
 *
 * The activate service is the third target. It lives *outside* this repo, as a
 * sibling directory (`../HomeOS-Activate`), because it is its own build context
 * and its own deployable; `HOMEOS_ACTIVATE_DIR` overrides the location for
 * machines that keep it elsewhere. That target is `optional`: on a machine or
 * CI runner that only checked out HomeOS-3D there is nothing to sync, so its
 * files are skipped rather than reported as missing. When the directory *is*
 * present, drift fails the check like any other target — a guard that silently
 * skips a consumer it can see is worse than no guard.
 *
 * It is also the only target that wants the fixed-ratio viewport shell: the app
 * entry pages and the store are full-viewport and adaptive, so shipping a script
 * that resizes them onto a 1366x1024 canvas would be worse than useless.
 *
 * Why one canonical source: hand-maintained copies of a 1500-line animated
 * stylesheet drift within a week. `tools/check_scene_sync.mjs` runs in the
 * guard suite and fails the build when a copy stops matching its source.
 *
 * The generated copies are marked by a header comment; edit design/scene/ and
 * re-run this script, never the copies.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "design", "scene");

/** 兄弟项目根：HomeOS-Activate 与 HomeOS-3D 同级，不在本仓库内。 */
const SIBLING_ROOT = path.resolve(ROOT, "..");
export const ACTIVATE_ROOT = process.env.HOMEOS_ACTIVATE_DIR
  ? path.resolve(process.env.HOMEOS_ACTIVATE_DIR)
  : path.join(SIBLING_ROOT, "HomeOS-Activate");

/** Stylesheets + the font files they reference, shared by all targets. */
export const STYLE_FILES = ["scene.css", "page.css", "panel.css", "fonts.css"];
export const FONT_DIR = "fonts";
/** Only meaningful for fixed-ratio canvases; see `viewportShell` on each target. */
export const VIEWPORT_SHELL_FILES = ["viewport-shell.css", "viewport-shell.js"];

/**
 * 与样式表同源、但会被 JS import 的模块。
 *
 * `appearance.js` 是站点配色的唯一实现（预设 / 派生 / 令牌展开），前端的设置界面
 * 直接 import 它 —— 所以它必须和 CSS 一样按构建上下文分发，而不是只留在 design/ 里：
 * 主应用镜像是 `COPY frontend`、商店镜像是 `COPY store`，design/ 根本不在任何镜像内。
 */
export const SHARED_SCRIPTS = ["appearance.js"];

/**
 * Where each build context wants the files.
 *
 * - `base`        root the two paths below are relative to. In-repo targets use
 *                 this repo; Activate uses its sibling directory.
 * - `staticDir`   receives the stylesheets, `viewport-shell.js` and `fonts/`.
 * - `partial`     receives `scene.html` (the server-side fragment each backend
 *                 injects into its own page templates).
 * - `optional`    skip the whole target when `base` does not exist.
 * - `viewportShell: false` targets skip the fixed-ratio scaling shell.
 */
export const TARGETS = [
  {
    name: "app",
    base: ROOT,
    staticDir: "frontend/static/auth/scene",
    partial: "frontend/static/auth/scene/scene.html",
    viewportShell: false,
  },
  {
    name: "store",
    base: ROOT,
    staticDir: "store/static/scene",
    partial: "store/templates/_scene.html",
    viewportShell: false,
  },
  {
    name: "activate",
    base: ACTIVATE_ROOT,
    staticDir: "src/ui/scene",
    partial: "src/ui/scene/scene.html",
    viewportShell: true,
    optional: true,
  },
];

/** 该 target 这次要不要参与同步（可选 target 的目录不存在就跳过）。 */
export function isTargetActive(target) {
  if (!target.optional) return true;
  return fs.existsSync(target.base);
}

/** 跳过同步的 target 名，供 --dry-run / --check 打印，避免「静默少做一件事」。 */
export function inactiveTargets() {
  return TARGETS.filter((t) => !isTargetActive(t)).map((t) => t.name);
}

/** Every (source, destination) pair the sync owns. */
export function planFiles() {
  const pairs = [];
  for (const target of TARGETS) {
    if (!isTargetActive(target)) continue;
    for (const file of STYLE_FILES) {
      pairs.push({
        from: path.join(SOURCE, file),
        to: path.join(target.base, target.staticDir, file),
      });
    }
    for (const file of SHARED_SCRIPTS) {
      pairs.push({
        from: path.join(SOURCE, file),
        to: path.join(target.base, target.staticDir, file),
      });
    }
    if (target.viewportShell) {
      for (const file of VIEWPORT_SHELL_FILES) {
        pairs.push({
          from: path.join(SOURCE, file),
          to: path.join(target.base, target.staticDir, file),
        });
      }
    }
    pairs.push({
      from: path.join(SOURCE, "scene.html"),
      to: path.join(target.base, target.partial),
    });
    const fontsSource = path.join(SOURCE, FONT_DIR);
    for (const font of fs.readdirSync(fontsSource).sort()) {
      pairs.push({
        from: path.join(fontsSource, font),
        to: path.join(target.base, target.staticDir, FONT_DIR, font),
      });
    }
  }
  return pairs;
}

/** 相对本仓库显示；仓库外的兄弟项目显示成 `../HomeOS-Activate/...`。 */
export function rel(file) {
  return path.relative(ROOT, file);
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

/** @returns {{copied: string[], unchanged: string[], missingSource: string[]}} */
export function sync({ dryRun = false } = {}) {
  const copied = [];
  const unchanged = [];
  const missingSource = [];

  for (const { from, to } of planFiles()) {
    const source = readIfExists(from);
    if (source === null) {
      missingSource.push(rel(from));
      continue;
    }
    if (readIfExists(to)?.equals(source)) {
      unchanged.push(rel(to));
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, source);
    }
    copied.push(rel(to));
  }

  return { copied, unchanged, missingSource };
}

/* ------------------------------------------------------------------- main */

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = new Set(process.argv.slice(2));
  const check = argv.has("--check");
  const dryRun = argv.has("--dry-run");

  if (!fs.existsSync(SOURCE)) {
    console.error(`scene source missing: ${rel(SOURCE)}`);
    process.exit(1);
  }

  const { copied, unchanged, missingSource } = sync({ dryRun: dryRun || check });

  if (missingSource.length) {
    console.error("canonical files missing:");
    for (const file of missingSource) console.error(`  ${file}`);
    process.exit(1);
  }

  if (check) {
    if (copied.length) {
      console.error(`${copied.length} scene copy/copies out of sync with design/scene:`);
      for (const file of copied) console.error(`  ${file}`);
      console.error("\nrun: node tools/sync_scene_assets.mjs");
      process.exit(1);
    }
    console.log(`scene copies in sync (${unchanged.length} files)`);
    printSkipped();
    process.exit(0);
  }

  const verb = dryRun ? "would update" : "updated";
  console.log(`scene sync: ${verb} ${copied.length}, unchanged ${unchanged.length}`);
  for (const file of copied) console.log(`  ${verb}: ${file}`);
  printSkipped();
}

function printSkipped() {
  for (const name of inactiveTargets()) {
    console.log(`  skipped: ${name} (target directory not present on this machine)`);
  }
}
