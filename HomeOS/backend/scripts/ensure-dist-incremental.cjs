/**
 * Nest 的 watch + 增量编译在 tsbuildinfo 过期时，可能只重编改动的入口文件，
 * 而不补发新增依赖。本脚本检测 dist 中缺失的本地 require，并清理增量缓存，
 * 使下次编译为完整编译。
 *
 * 当 dist 为空或缺失时（例如 `bun run clean:local` 之后）同样清理缓存，
 * 否则 TypeScript 增量编译可能判定“已是最新”从而几乎不输出任何文件。
 *
 * 若清理缓存后 `main.js` 仍然缺失，则执行一次性的 `nest build`，
 * 以便 `nest start --watch` 有入口可执行（避免 `Module not found .../dist/backend/main`）。
 *
 * 删除残留的 `foo.js`（它会遮蔽 `foo/index.js` 目录，因为 Node/Bun 会优先解析文件），
 * 这通常发生在源文件被拆分为目录之后。
 *
 * 删除旧版（未启用 stripLeadingPaths）遗留的 `dist/backend/src/`。
 * 当该文件存在时，Nest `start` 会优先选择 `outDir/sourceRoot/main.js`，
 * 因此残留的嵌套树会遮蔽扁平的 `dist/backend/main.js`，并因依赖缺失而失败。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const DIST_ROOT = path.resolve(__dirname, '../../dist/backend');
const MAIN_JS = path.join(DIST_ROOT, 'main.js');
const LEGACY_SRC_DIR = path.join(DIST_ROOT, 'src');
const BUILD_INFO = path.resolve(__dirname, '../.nest-build/tsconfig.tsbuildinfo');
const REQUIRE_RE = /require\("(\.[^"]+)"\)/g;

function walkJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function resolveLocalRequire(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  // Prisma 生成物只拷贝 .ts，Bun 直接加载；勿只认 .js，否则会误判 dist 缺依赖。
  const candidates = [
    `${base}.js`,
    path.join(base, 'index.js'),
    `${base}.ts`,
    path.join(base, 'index.ts'),
    base,
  ];
  return candidates.some((p) => fs.existsSync(p));
}

function localRequiresMissingInDist() {
  for (const file of walkJsFiles(DIST_ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    REQUIRE_RE.lastIndex = 0;
    let match;
    while ((match = REQUIRE_RE.exec(src))) {
      if (!resolveLocalRequire(file, match[1])) return true;
    }
  }
  return false;
}

/** 优先保留目录 barrel，而非增量编译残留的同级 .js 文件。 */
function removeJsShadowingDirectories() {
  let removed = 0;
  for (const file of walkJsFiles(DIST_ROOT)) {
    const base = file.slice(0, -3); // 去掉 .js 后缀
    const dirIndex = path.join(base, 'index.js');
    if (!fs.existsSync(dirIndex)) continue;
    fs.rmSync(file, { force: true });
    removed += 1;
    console.warn(
      `[ensure-dist-incremental] removed shadowing ${path.relative(DIST_ROOT, file)} (prefer ${path.relative(DIST_ROOT, dirIndex)})`,
    );
  }
  return removed;
}

/**
 * nest-cli 启用了 stripLeadingPaths → 扁平的 dist/backend/*.js。
 * 若 outDir/src/main.js 存在，Nest start 仍会优先选择它，因此删除该遗留目录树。
 */
function removeLegacyNestedSrcDist() {
  if (!fs.existsSync(LEGACY_SRC_DIR)) return false;
  fs.rmSync(LEGACY_SRC_DIR, { recursive: true, force: true });
  console.warn(
    '[ensure-dist-incremental] removed legacy dist/backend/src (Nest would prefer it over flat main.js)',
  );
  return true;
}

function clearBuildInfo(reason) {
  if (!fs.existsSync(BUILD_INFO)) return false;
  fs.rmSync(BUILD_INFO, { force: true });
  console.warn(`[ensure-dist-incremental] cleared stale tsbuildinfo (${reason})`);
  return true;
}

/** 当 watch 可能执行不完整或缺失的 dist 时，进行一次性的完整编译。 */
function nestBuildOnce(reason) {
  clearBuildInfo(reason);
  console.warn(`[ensure-dist-incremental] ${reason}, running nest build…`);
  const result = spawnSync('bunx', ['nest', 'build'], {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (result.status !== 0 || !fs.existsSync(MAIN_JS)) {
    console.error(
      '[ensure-dist-incremental] nest build failed to produce dist/backend/main.js; aborting start:dev',
    );
    process.exit(result.status || 1);
  }
  const emit = spawnSync(process.execPath, [path.join(__dirname, 'emit-prisma-generated.cjs')], {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (emit.status !== 0) {
    console.error('[ensure-dist-incremental] emit-prisma-generated failed; aborting start:dev');
    process.exit(emit.status || 1);
  }
  if (localRequiresMissingInDist()) {
    console.error(
      '[ensure-dist-incremental] nest build finished but local requires are still missing in dist',
    );
    process.exit(1);
  }
}

const removedLegacySrc = removeLegacyNestedSrcDist();
const shadowed = removeJsShadowingDirectories();
const jsFiles = walkJsFiles(DIST_ROOT);
const missingMain = !fs.existsSync(MAIN_JS);
const missingDeps = jsFiles.length > 0 && localRequiresMissingInDist();

if (jsFiles.length === 0) {
  nestBuildOnce('empty or missing dist');
} else if (missingMain) {
  nestBuildOnce('missing main.js entry');
} else if (missingDeps) {
  // 仅清 tsbuildinfo 不够：SWC watch 可能只重编改动文件，不会补发遗漏的依赖
  nestBuildOnce('missing dist dependencies');
} else if (shadowed > 0) {
  clearBuildInfo('removed js files shadowing directories');
} else if (removedLegacySrc) {
  clearBuildInfo('removed legacy nested src dist');
}
