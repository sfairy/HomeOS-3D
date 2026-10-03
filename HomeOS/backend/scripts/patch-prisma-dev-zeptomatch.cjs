/**
 * @prisma/dev 7.x 打包的 state.cjs 在顶部使用了 require("zeptomatch")：
 *   var ae=O(require("zeptomatch"),1),C=B("prisma-dev"),ze=(0,se.promisify)(oe.unzip);
 * 但 zeptomatch 2.x 仅支持 ESM（"type":"module"）。Node 会抛出：
 *   require() of ES Module .../zeptomatch/dist/index.js from .../@prisma/dev/dist/state.cjs not supported.
 *
 * 修复策略（两处协同修改）：
 *   (A) 将逗号链式 `var` 语句中失效的 `require("zeptomatch")` 替换为：
 *       一个 null 初始化器 + 一个 `async function _hm_preloadZeptomatch()`
 *       加载器，该加载器会调用 `import("zeptomatch")` 一次，并将结果存回
 *       原模块作用域的 `ae` 绑定中。由于原始 var 链在同一条逗号链上
 *       还有兄弟声明（C、ze），我们用 `;var C=...,ze=...` 关闭第一条
 *       `var` 以保持语法合法。
 *
 *   (B) 在 `async function ce(t,e){try{return (await readdir(...)).reduce(cb,[])}}`
 *       内部，我们在 `try` 体的最开头、`return` 之前插入
 *       `if(e) await _hm_preloadZeptomatch();`。现有的 `.reduce()` 回调
 *       随后会继续同步调用 `ae.default(pattern,name)`——在非 async 的
 *       箭头回调中不使用 await。
 *
 * 幂等补丁（由 MARKER 注释守护），在任何 prisma 命令之前应用。
 *
 * 可安全地从其他脚本 require()：作为模块加载时不会 process.exit
 * （否则会中止父进程，例如 ensure-prisma-client 生成过程中）。
 */
const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(
  __dirname,
  '../../node_modules/@prisma/dev/dist/state.cjs',
);

const MARKER = '/* homeos:prisma-dev-zeptomatch-dynamic-import */';

function finish(code) {
  if (require.main === module) process.exit(code);
  return code;
}

if (!fs.existsSync(TARGET)) {
  console.warn(
    '[patch-prisma-dev-zeptomatch] @prisma/dev state.cjs not found — skipping (only needed for prisma dev commands)',
  );
  finish(0);
  return;
}

let current = fs.readFileSync(TARGET, 'utf8');
if (current.includes(MARKER)) {
  finish(0);
  return;
}

// —————————————————————————————————————————————————————————————————————————
// 步骤 A：替换包含 require() 的逗号链式 `var` 声明。
// 原始：  var <Z>=O(require("zeptomatch"),1),<restChain>;
// 新：    var <Z>=null;MARKER async _hm_preloadZeptomatch(){...};var <restChain>;
// —————————————————————————————————————————————————————————————————————————
const CHAIN_RE = /var ([a-zA-Z_$][\w$]*)=O\(require\("zeptomatch"\),1\),([^;]+);/;
const chainMatch = current.match(CHAIN_RE);
if (!chainMatch) {
  console.warn(
    '[patch-prisma-dev-zeptomatch] could not find top-level comma-chained var zeptomatch require — state.cjs may have changed, skipping',
  );
  finish(0);
  return;
}
const zVarName = chainMatch[1];
const restChain = chainMatch[2];
const loader = [
  `var ${zVarName}=null;${MARKER}`,
  `async function _hm_preloadZeptomatch(){if(!${zVarName}){const m=await import('zeptomatch');${zVarName}={default:m.default}}}`,
  `;var ${restChain};`,
].join('');
current = current.replace(CHAIN_RE, loader);

// —————————————————————————————————————————————————————————————————————————
// 步骤 B：在 ce() 的 try 体开头注入预加载调用。
// 原始 ce() 头部：  async function ce(t,e){try{return(await(0,m.readdir)(t,...)).reduce(...)}
// 新 ce() 头部：    async function ce(t,e){try{if(e) await _hm_preloadZeptomatch();return(...)}
// 这确保在同步 reduce 回调运行之前 `ae` 已被填充。
// 不要使用 /g + .test() 再 .replace()——lastIndex 会跳过唯一匹配。
// —————————————————————————————————————————————————————————————————————————
const CE_HEAD_RE = /async function ce\(t,e\)\{try\{return\(/;
if (!CE_HEAD_RE.test(current)) {
  console.warn(
    '[patch-prisma-dev-zeptomatch] could not find async function ce(t,e){try{return( — state.cjs may have changed, skipping',
  );
  finish(0);
  return;
}
current = current.replace(
  CE_HEAD_RE,
  'async function ce(t,e){try{if(e) await _hm_preloadZeptomatch();return(',
);

fs.writeFileSync(TARGET, current, 'utf8');
console.log(
  '[patch-prisma-dev-zeptomatch] patched @prisma/dev zeptomatch require to use preload-then-sync-access dynamic import()',
);
finish(0);
