/**
 * @file 修复 NestJS CLI 在 ESM-only 项目（本环境 bun 运行 nest CLI，Node v26 默认识别 *.js 用 ESM loader）
 * 中加载 tree-kill.js（CJS 书写的 CommonJS 模块）的命名导出缺失问题。
 *
 * 根因：
 *   node_modules/@nestjs/cli/actions/start.action.js（ESM）
 *     import { treeKillSync as killProcessSync } from '../lib/utils/tree-kill.js';
 *   node_modules/@nestjs/cli/lib/compiler/swc/swc-compiler.js（ESM）
 *     import { treeKillSync } from '../../utils/tree-kill.js';
 *   但 ../lib/utils/tree-kill.js 是 CJS（首行 "use strict"; Object.defineProperty(exports,"__esModule",{value:true}); exports.treeKillSync = ... ）。
 *   在严格 ESM loader + bun 的 interop 下，CJS 的命名导出不一定会被 "synthetic named export" 识别，
 *   导致 SyntaxError: The requested module '../lib/utils/tree-kill.js' does not provide an export named 'treeKillSync'。
 *   build（swc-compiler 走 swc build，编译结束 kill swc 子进程）与 start（watch 重启 kill tsc）都会命中。
 *
 * 策略：对 swc-compiler.js 与 start.action.js 两处命名 import，用动态 import + 读默认/命名空间替代：
 *   import { treeKillSync } from '../../utils/tree-kill.js'
 *   →
 *   const { treeKillSync } = (await import('../../utils/tree-kill.js'))?.default || await import('../../utils/tree-kill.js');
 *   （同时兼容 CJS 被 ESM 转译为 default: ModuleNamespace 与 直接提供 treeKillSync 命名两种 interop 模式）
 *   由于两文件中的 treeKillSync 消费位置均在 async function handle / run 内部，顶部改为动态 import 无需再用顶层 await。
 *
 * Idempotent：目标函数替换后有标记 /* homeos:esm-tree-kill-interop * / ，重复运行直接 exit 0；仅改两行 import。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../node_modules/@nestjs/cli');
const START_ACTION = path.join(ROOT, 'actions/start.action.js');
const SWC_COMPILER = path.join(ROOT, 'lib/compiler/swc/swc-compiler.js');
const TREE_KILL = path.join(ROOT, 'lib/utils/tree-kill.js');
const MARKER = '/* homeos:esm-tree-kill-interop */';

const DONE_MARK_START = `async function ${MARKER} _interop_treeKillSync_src(src) {
  const mod = await import(src);
  const ns = (mod && mod.default) || mod;
  return { treeKillSync: ns && ns.treeKillSync };
}`;

/**
 * 把文件里的 `import { treeKillSync [as X] } from '<REL>';`
 * 改成两行 const 声明 + 顶部 async helper 注入 + 使用处 await _interop_treeKillSync_src('<REL>') 取 treeKillSync。
 * 若文件已经有 MARKER 就跳过。
 *
 * 若 import 中含有 as alias，就把 alias 名用 const { treeKillSync: alias } = 解构赋值承接。
 */
function patchFile(filePath, importRegex, buildUseBlockStart, replacementDeclarePrefix, useFnNameAlias) {
  if (!fs.existsSync(filePath)) {
    console.warn('[patch-nestjs-cli-esm-tree-kill-export] skip (not found):', filePath);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(MARKER)) return;

  // Step 1: 顶部 import 替换为 const 延迟加载（await 内联在调用点，也可改成变量 = promise。由于 treeKillSync 是简单函数，
  // 我们用「首次使用 await import」模式 — 但如果原文件的使用点是同步上下文（非 async），就改为 promise 链式不现实。
  // 更简单的兼容：把 import 改为 `const _tkmod = await import(...); const treeKillSync = _tkmod.treeKillSync ?? _tkmod.default?.treeKillSync;`
  // 但如果是 top-level 就不行；好在 start.action.js 的 handle() 是 async，swc-compiler.js 的 run()/watch() 也都是 async。
  // 所以改法：保留顶层注释，然后在 import 位置直接用 // @ts-ignore + import()? 不行，ESM 必须 top level import.
  // —— 所以最终采用「把 tree-kill.js 改为 ESM 模块」的更简法：把 TREE_KILL 文件内容改为命名导出 export function treeKillSync()。
  //   同时加一个 package.json 邻接 side-effect 说明。但 tree-kill.d.ts 已经是 ESM d.ts；直接把 tree-kill.js 改成 ESM 最稳。
}

/**
 * 最简稳健修复：直接改造 tree-kill.js（把 CJS 改为同语义 ESM），让两个 import 方直接读命名导出 treeKillSync。
 * 这样 start.action.js / swc-compiler.js 两处都无需改（避免与 import 处的其他命名共用一行产生 AST 冲突）。
 */
function patchTreeKillToEsm() {
  if (!fs.existsSync(TREE_KILL)) {
    console.error('[patch-nestjs-cli-esm-tree-kill-export] FATAL: tree-kill.js not found at', TREE_KILL);
    process.exit(1);
  }
  const orig = fs.readFileSync(TREE_KILL, 'utf8');
  if (orig.startsWith('// homeos:esm-reexport') || orig.includes('export function treeKillSync')) {
    // 已经是 ESM 形态，跳过
    return;
  }
  // 把 CJS 版（含我们先前 patch-nestjs-tree-kill 注入的 Windows 处理）直接等价转写成 ESM：
  // - const child_process_1 = require('child_process') → import { execSync, spawnSync } from 'child_process';
  // - exports.treeKillSync = treeKillSync → export { treeKillSync };
  // - 所有 child_process_1.execSync → execSync；child_process_1.spawnSync → spawnSync；
  // - 保持 /* homeos:tree-kill-win32-esrch */ 标记不丢失。
  const out = `// homeos:esm-reexport（由 backend/scripts/patch-nestjs-cli-esm-tree-kill-export.cjs 生成，幂等）
// 原文件为 CommonJS：@nestjs/cli/lib/utils/tree-kill.js（原内含 CJS exports.treeKillSync）。
// HomeOS 运行环境：bun + ESM loader 对 CJS synthetic named export 不稳定，显式转写为 ESM 命名导出，
// 确保 start.action.js 与 swc-compiler.js 两处 import { treeKillSync } from '...' 稳定命中。
import { execSync, spawnSync } from 'child_process';

/** @type {(pid: number, signal?: string | number) => void} */
export function treeKillSync(pid, signal) {
    if (process.platform === 'win32') {
        /* homeos:tree-kill-win32-esrch */
        try {
            execSync('taskkill /pid ' + pid + ' /T /F', { stdio: 'ignore' });
        } catch (err) {
            const status = err && typeof err.status === 'number' ? err.status : null;
            const detail = String((err && (err.stderr || err.message)) || err);
            if (status !== 128 && !/not found/i.test(detail)) throw err;
        }
        return;
    }
    const childs = getAllChilds(pid);
    childs.forEach(function (cpid) { killPid(cpid, signal); });
    killPid(pid, signal);
}

function getAllPid() {
    const result = spawnSync('ps', ['-A', '-o', 'pid,ppid'], { encoding: 'utf8', stdio: 'pipe' });
    if (result.error || !result.stdout) return [];
    const rows = String(result.stdout || '').trim().split('\\n').slice(1);
    return rows
        .map(function (row) {
            const parts = row.match(/\\s*(\\d+)\\s*(\\d+)/);
            return parts ? { pid: Number(parts[1]), ppid: Number(parts[2]) } : null;
        })
        .filter(function (x) { return x != null; });
}

function getAllChilds(pid) {
    const allpid = getAllPid();
    const ppidHash = {};
    allpid.forEach(function (item) {
        ppidHash[item.ppid] = ppidHash[item.ppid] || [];
        ppidHash[item.ppid].push(item.pid);
    });
    const result = [];
    (function find(cur) {
        const kids = ppidHash[cur] || [];
        kids.forEach(function (k) { result.push(k); find(k); });
    })(pid);
    return result;
}

function killPid(pid, signal) {
    try { process.kill(pid, signal); }
    catch (err) { if (err.code !== 'ESRCH') throw err; }
}

/* homeos:esm-tree-kill-interop */
`;
  fs.writeFileSync(TREE_KILL, out, 'utf8');
  console.log('[patch-nestjs-cli-esm-tree-kill-export] tree-kill.js rewritten to ESM (synthetic named export stable)');
}

patchTreeKillToEsm();
