/**
 * @swc/cli 0.8.1 在 requireChokidar() 中使用了 require("chokidar")，但
 * chokidar 5.x 仅支持 ESM（"type": "module"）。Node 会抛出：
 *   require() of ES Module .../chokidar/index.js from .../@swc/cli/... not supported.
 *
 * 将失效的 require() 包装替换为真正的 dynamic import() 调用，
 * 这样 `nest start --watch`（通过 @swc/cli 使用 swc）就能正确加载 chokidar。
 *
 * 幂等补丁，在 nest start --watch 之前应用。
 */
const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(
  __dirname,
  '../../node_modules/@swc/cli/lib/swc/sources.js',
);

const MARKER = '/* homeos:swc-chokidar-dynamic-import */';

const OLD_REQUIRE_CHOKIDAR = `async function requireChokidar() {
    try {
        const { default: chokidar } = await Promise.resolve().then(() => __importStar(require("chokidar")));
        return chokidar;
    }
    catch (err) {
        console.error("The optional dependency chokidar is not installed and is required for " +
            "--watch. Chokidar is likely not supported on your platform.");
        throw err;
    }
}`;

const NEW_REQUIRE_CHOKIDAR = `async function requireChokidar() {
    try {
        ${MARKER}
        const mod = await import("chokidar");
        const chokidar = mod.default || mod;
        return chokidar;
    }
    catch (err) {
        console.error("The optional dependency chokidar is not installed and is required for " +
            "--watch. Chokidar is likely not supported on your platform.");
        throw err;
    }
}`;

if (!fs.existsSync(TARGET)) {
  console.warn(
    '[patch-swc-chokidar-import] @swc/cli sources.js not found — skipping (only needed for swc --watch)',
  );
  process.exit(0);
}

const current = fs.readFileSync(TARGET, 'utf8');
if (current.includes(MARKER)) {
  process.exit(0);
}

if (!current.includes(OLD_REQUIRE_CHOKIDAR)) {
  // 尝试更宽松的匹配：按函数名找到该函数并替换其函数体
  const fnStart = current.indexOf('async function requireChokidar()');
  if (fnStart === -1) {
    console.warn(
      '[patch-swc-chokidar-import] could not find requireChokidar() function — sources.js may have changed, skipping',
    );
    process.exit(0);
  }
  // 查找匹配的右大括号
  let depth = 0;
  let fnEnd = -1;
  for (let i = fnStart; i < current.length; i++) {
    const ch = current[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        fnEnd = i + 1;
        break;
      }
    }
  }
  if (fnEnd === -1) {
    console.warn(
      '[patch-swc-chokidar-import] could not find end of requireChokidar() — skipping',
    );
    process.exit(0);
  }
  const before = current.slice(0, fnStart);
  const after = current.slice(fnEnd);
  const patched = before + NEW_REQUIRE_CHOKIDAR + after;
  fs.writeFileSync(TARGET, patched, 'utf8');
  console.log(
    '[patch-swc-chokidar-import] patched @swc/cli requireChokidar() to use dynamic import() (relaxed match)',
  );
  process.exit(0);
}

const patched = current.replace(OLD_REQUIRE_CHOKIDAR, NEW_REQUIRE_CHOKIDAR);
fs.writeFileSync(TARGET, patched, 'utf8');
console.log(
  '[patch-swc-chokidar-import] patched @swc/cli requireChokidar() to use dynamic import()',
);
