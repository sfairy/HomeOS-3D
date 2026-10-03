/**
 * 在 Windows 上，prisma generate 可能会生成只写了一半的客户端（models.ts 存在，
 * 但 models/*.ts 缺失）。随后 Nest/SWC 会因为找不到 models/User.ts 而报 ENOENT。
 *
 * 当客户端已经完整且比 schema.prisma 新时，跳过 generate ——
 * 每次执行 start:dev 都重写生成文件会冲击 Nest SWC 的 watch，并可能
 * 因为 taskkill "process not found" 而导致 Windows 重载崩溃。
 *
 * FORCE_PRISMA_GENERATE=1 用于强制重新生成。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const OUT = path.join(BACKEND_ROOT, 'src', 'generated', 'prisma');
const MODELS_DIR = path.join(OUT, 'models');
const MODELS_BARREL = path.join(OUT, 'models.ts');
const INPUTS = [
  path.join(BACKEND_ROOT, 'prisma', 'schema.prisma'),
  path.join(BACKEND_ROOT, 'prisma.config.ts'),
].filter((p) => fs.existsSync(p));
const MARKERS = [
  path.join(OUT, 'client.ts'),
  MODELS_BARREL,
  path.join(MODELS_DIR, 'User.ts'),
  path.join(MODELS_DIR, 'SystemConfig.ts'),
  path.join(MODELS_DIR, 'EventLog.ts'),
];

const MODEL_EXPORT_RE = /export\s+type\s+\*\s+from\s+['"]\.\/models\/([^'"]+)['"]/g;

function listedModelFiles() {
  if (!fs.existsSync(MODELS_DIR)) return [];
  return fs
    .readdirSync(MODELS_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => name.slice(0, -3));
}

function barrelModelNames() {
  if (!fs.existsSync(MODELS_BARREL)) return [];
  const text = fs.readFileSync(MODELS_BARREL, 'utf8');
  const names = [];
  for (const match of text.matchAll(MODEL_EXPORT_RE)) {
    names.push(match[1]);
  }
  return names;
}

function isComplete() {
  if (!MARKERS.every((p) => fs.existsSync(p))) return false;

  const onDisk = listedModelFiles();
  if (onDisk.length < 10) return false;

  const fromBarrel = barrelModelNames();
  if (fromBarrel.length < 10) return false;

  const diskSet = new Set(onDisk);
  // 每个 barrel 导出都必须有对应的 models/*.ts 文件
  if (!fromBarrel.every((name) => diskSet.has(name))) return false;

  // 写了一半的目录树通常会留下孤立文件或数量严重不匹配
  if (Math.abs(onDisk.length - fromBarrel.length) > 2) return false;

  return true;
}

function schemaNewerThanClient() {
  if (!INPUTS.length) return true;
  const newestInput = Math.max(...INPUTS.map((p) => fs.statSync(p).mtimeMs));
  return MARKERS.some((p) => {
    try {
      return newestInput > fs.statSync(p).mtimeMs;
    } catch {
      return true;
    }
  });
}

function needsGenerate() {
  if (process.env.FORCE_PRISMA_GENERATE === '1') return true;
  if (!isComplete()) return true;
  return schemaNewerThanClient();
}

function clearOut() {
  if (!fs.existsSync(OUT)) return;
  fs.rmSync(OUT, { recursive: true, force: true });
  console.warn('[ensure-prisma-client] cleared incomplete src/generated/prisma');
}

function generate() {
  // 在任何 prisma 子命令启动之前，将 @prisma/dev 的 require("zeptomatch")
  // 改为动态 import —— zeptomatch 仅支持 ESM，在 CJS 中会报错。
  require('./patch-prisma-dev-zeptomatch.cjs');
  const env = { ...process.env };
  if (!String(env.DATABASE_URL || '').trim()) {
    env.DATABASE_URL = 'postgresql://prisma:prisma@prisma-generate.invalid:5432/prisma';
  }
  let prismaCli;
  try {
    prismaCli = require.resolve('prisma/build/index.js', { paths: [BACKEND_ROOT, path.join(BACKEND_ROOT, '..')] });
  } catch {
    prismaCli = null;
  }
  const result = prismaCli
    ? spawnSync(process.execPath, [prismaCli, 'generate'], {
        cwd: BACKEND_ROOT,
        stdio: 'inherit',
        env,
      })
    : spawnSync('bunx prisma generate', {
        cwd: BACKEND_ROOT,
        stdio: 'inherit',
        shell: true,
        env,
      });
  return result.status ?? 1;
}

if (!needsGenerate()) {
  console.log('[ensure-prisma-client] prisma client up to date, skip generate');
  process.exit(0);
}

if (!isComplete()) {
  clearOut();
}

let status = generate();
if (status !== 0 || !isComplete()) {
  console.warn('[ensure-prisma-client] generate incomplete or failed, retrying…');
  clearOut();
  status = generate();
}

if (status !== 0 || !isComplete()) {
  console.error(
    '[ensure-prisma-client] failed to produce a complete Prisma client (models barrel / models/*.ts mismatch)',
  );
  process.exit(status || 1);
}
