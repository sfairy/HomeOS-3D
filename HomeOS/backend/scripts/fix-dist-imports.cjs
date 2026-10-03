/**
 * Nest 的 tsconfig-paths 编译钩子可能会在 dist 中保留 `@generated/prisma`，
 * 因为 Bun 在构建时会解析该别名。需将其改写为相对路径，以供生产运行时使用。
 */
const fs = require('fs');
const path = require('path');

const DIST_ROOT = path.resolve(__dirname, '../../dist/backend');
const GENERATED_ROOT = path.join(DIST_ROOT, 'generated/prisma');
const ALIAS_RE = /@generated\/prisma(?:\/[^'"]+)?/g;

function resolveAlias(fromFile, alias) {
  const subpath = alias === '@generated/prisma' ? 'client' : alias.slice('@generated/prisma/'.length);
  const target = path.join(GENERATED_ROOT, subpath);
  let rel = path.relative(path.dirname(fromFile), target).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function fixFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('@generated/prisma')) return false;

  const next = src.replace(ALIAS_RE, (alias) => resolveAlias(file, alias));
  if (next === src) return false;

  fs.writeFileSync(file, next);
  return true;
}

function walk(dir) {
  let count = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) count += walk(p);
    else if (ent.isFile() && ent.name.endsWith('.js') && fixFile(p)) count++;
  }
  return count;
}

if (!fs.existsSync(DIST_ROOT)) {
  console.warn('[fix-dist-imports] skip: dist/backend not found');
  process.exit(0);
}

const rewritten = walk(DIST_ROOT);
if (rewritten > 0) {
  console.log(`[fix-dist-imports] rewrote @generated/prisma in ${rewritten} file(s)`);
}
