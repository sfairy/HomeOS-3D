/**
 * Nest SWC 不会稳定地把 gitignore 的 src/generated 打进 dist，
 * 运行时就会报 Cannot find module '../../generated/prisma/client'。
 * 只拷贝、不编译：Prisma 生成的 internal/class.ts 很大，SWC（尤其 QEMU arm64）容易把构建打挂。
 * 生产用 Bun，可直接加载 .ts。
 *
 * 必须删掉 dist 里 SWC 编出来的 generated/*.js：Bun/Node 的 require 优先 .js，
 * 旧编译产物会盖住新 .ts，表现为 prisma.runtimeKv / childModeRuntime 等为 undefined。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../src/generated');
const DEST = path.resolve(__dirname, '../../dist/backend/generated');
const CLIENT_TS = path.join(SRC, 'prisma/client.ts');
const CLIENT_JS = path.join(SRC, 'prisma/client.js');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function removeCompiledJs(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      n += removeCompiledJs(full);
      continue;
    }
    if (/\.js(\.map)?$/.test(ent.name)) {
      fs.rmSync(full, { force: true });
      n += 1;
    }
  }
  return n;
}

if (!fs.existsSync(CLIENT_TS) && !fs.existsSync(CLIENT_JS)) {
  console.error('[emit-prisma-generated] missing src/generated/prisma/client (run ensure-prisma-client first)');
  process.exit(1);
}

copyDir(SRC, DEST);
const removed = removeCompiledJs(DEST);

const outJs = path.join(DEST, 'prisma/client.js');
const outTs = path.join(DEST, 'prisma/client.ts');
if (!fs.existsSync(outJs) && !fs.existsSync(outTs)) {
  console.error('[emit-prisma-generated] dist/backend/generated/prisma/client missing after copy');
  process.exit(1);
}
console.log(
  `[emit-prisma-generated] copied → dist/backend/generated` +
    (removed ? ` (removed ${removed} compiled js)` : ''),
);
