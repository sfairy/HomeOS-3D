#!/usr/bin/env node
/**
 * 门禁编排器：把「哪些检查算门禁、按什么顺序跑」收敛成一份可执行清单。
 *
 * 为什么需要它
 * ------------
 * 此前门禁有三份互相不知情的描述：
 *   1. `.github/workflows/checks.yml` 的 job 步骤（唯一真正阻断的地方）；
 *   2. `package.json` 里 30+ 个 `check:*` / `test:*`（大多从未被任何地方调用）；
 *   3. README 里的一张命令表（与上面两份都不同步）。
 * 结果是同一件事三种说法：CI 里跑的那条本地复现不了（解释器不同），本地能跑的那条 CI
 * 不跑（没人接线），README 写的那条可能指向已删除的文件。
 *
 * 现在：下面这份 GROUPS 是**唯一**清单，CI 的每个 job 对应一个组（`bun run gate:<组>`），
 * 本地跑 `bun run gate` 得到同一批检查、同一条命令、同一个顺序。
 *
 * 分组口径
 * --------
 * - `static`：不依赖构建产物的静态检查（类型、lint、ruff、结构规则、棘轮）；
 * - `test`：单元测试与架构门禁用例（含依赖 DAG、路由基线）；
 * - `model`：3D 模型库的只读审计（几何 / 槽位 / 材质 / 资产 / 目录与命名索引）；
 * - `build`：需要前端产物的检查（构建 + 结构断言 + 体积预算 + chunk 初始化顺序）；
 * - `infra`：shell / workflow / compose / Caddyfile / Cython 兼容性。
 *
 * 三类跳过都必须**显式打印**，不允许静默成功：
 * - 缺工具（shellcheck / actionlint / docker）：本机给安装提示并 SKIP，CI 里直接 FAIL；
 * - `ciOnly` 步骤（需要 CI 才能装上的东西，如 Cython）：本机 SKIP 并说明理由；
 * - 脚本自己退出 3：约定为「环境不具备，本机跳过」（如没装 caddy）。
 *
 * 用法
 * ----
 * ```bash
 * bun run gate                    # static + test + model（默认）
 * bun run gate:model              # 只跑一组
 * node ops/gates.mjs --all        # 含 build + infra
 * node ops/gates.mjs --group static,test
 * node ops/gates.mjs --list       # 打印清单，不执行
 * node ops/gates.mjs --fail-fast
 * HOMEOS_GATE_CONTEXT=ci bun run gate:infra   # CI 上下文：ciOnly 步骤参与、缺工具即失败
 * ```
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CONTEXT = process.env.HOMEOS_GATE_CONTEXT === 'ci' ? 'ci' : 'local';
const IS_CI = CONTEXT === 'ci';

/**
 * 「可选：内置 Caddy 入口」段的临时产物。路径显式传给 op/ci/compose_public.py 的 --out，
 * 后面两个 docker 步骤读同一个文件 —— 三处各写一个字面量就会有一处漂移（Windows 上还没有
 * /tmp）。用 os.tmpdir() 与 Python 侧 tempfile.gettempdir() 同源。
 */
const COMPOSE_PUBLIC_PATH = path.join(os.tmpdir(), 'compose-public.yml');

/** `bun run <script>`：门禁命令一律走 package.json，避免编排器里长出第二份实现。 */
const bun = (...args) => ({ cmd: 'bun', args });

/**
 * 门禁清单。
 *
 * 顺序即执行顺序：快而确定的放在前面，几十秒能给出结论的先出结论，构建类最后。
 * 每一项：
 *   name    展示名（与 package.json 脚本同名时直接写脚本名）
 *   ...     由 bun() / cmd / fn 构造的一条执行描述
 *   tools   需要的可执行文件；缺了按上下文 SKIP（local）或 FAIL（ci）
 *   hint    缺工具时打印的安装提示
 *   ciOnly  只在 CI 上下文执行（本机 SKIP 并说明）
 */
const GATE_GROUPS = {
  static: [
    { name: 'typecheck', ...bun('run', 'typecheck') },
    { name: 'lint:frontend', ...bun('run', '--cwd', 'homeos/frontend', 'lint:ci') },
    { name: 'lint:store-frontend', ...bun('run', '--cwd', 'homeos-store', 'lint:ci') },
    { name: 'lint:shared', ...bun('run', 'lint:shared') },
    { name: 'lint:ops', ...bun('run', 'lint:ops') },
    { name: 'lint:py', ...bun('run', 'lint:py') },
    { name: 'typecheck:node', ...bun('run', 'typecheck:node') },
    { name: 'check:scene', ...bun('run', 'check:scene') },
    { name: 'check:any', ...bun('run', 'check:any') },
    { name: 'check:frontend-complexity', ...bun('run', 'check:frontend-complexity') },
    { name: 'check:silent-except', ...bun('run', 'check:silent-except') },
    { name: 'check:async-db', ...bun('run', 'check:async-db') },
    { name: 'check:python-lock', ...bun('run', 'check:python-lock') },
    { name: 'check:image-imports', ...bun('run', 'check:image-imports') },
    // 四个结构性棘轮：WS 鉴权、商店路由契约、Python 复杂度、新增文件格式。
    { name: 'check:ws-auth', ...bun('run', 'check:ws-auth') },
    { name: 'check:store-routes', ...bun('run', 'check:store-routes') },
    { name: 'check:complexity', ...bun('run', 'check:complexity') },
    { name: 'check:python-format', ...bun('run', 'check:python-format') },
  ],
  test: [
    { name: 'test:frontend', ...bun('run', 'test:frontend') },
    // 同一个目录两套 runner：`bun test` 只认 `*.test.mjs`，Python 侧用例要 unittest 跑。
    // 合在一个脚本里（package.json 的 test:studio），避免「同一目录两条命令」被漏掉一条。
    { name: 'test:studio', ...bun('run', 'test:studio') },
    { name: 'check:studio-split', ...bun('run', 'check:studio-split') },
    { name: 'test:home-mode', ...bun('run', 'test:home-mode') },
    { name: 'test:security', ...bun('run', 'test:security') },
    { name: 'test:shared', ...bun('run', 'test:shared') },
    { name: 'test:store', ...bun('run', 'test:store') },
    // 产品包自身的最小回归：从 0 到 1 的入口，后续新用例按包放进去。
    { name: 'test:homeos-backend', ...bun('run', 'test:homeos-backend') },
    { name: 'test:store-backend', ...bun('run', 'test:store-backend') },
    { name: 'test:auth-nav', ...bun('run', 'test:auth-nav') },
    { name: 'check:frontend-deps', ...bun('run', 'check:frontend-deps') },
    { name: 'check:backend-deps', ...bun('run', 'check:backend-deps') },
    { name: 'test:architecture', ...bun('run', 'test:architecture') },
  ],
  model: [
    { name: 'check:geometry', ...bun('run', 'check:geometry') },
    { name: 'check:slots', ...bun('run', 'check:slots') },
    { name: 'check:slot-roles', ...bun('run', 'check:slot-roles') },
    { name: 'check:materials', ...bun('run', 'check:materials') },
    { name: 'check:assets', ...bun('run', 'check:assets') },
    { name: 'check:models-layout', ...bun('run', 'check:models-layout') },
    { name: 'check:model-names', ...bun('run', 'check:model-names') },
  ],
  build: [
    {
      name: 'clean dist',
      // 干净检出的状态必须能复现：本地残留的 dist/ 是「本地绿、CI 红」的经典来源
      // （2026-10-10 的构建锁 ENOENT 就是被它兜住的）。
      fn: () => {
        const dist = path.join(REPO_ROOT, 'dist');
        if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
        console.log('  已清空 dist/');
        return 0;
      },
    },
    {
      name: 'build_frontend_verify',
      cmd: 'bash',
      args: ['ops/ci/build_frontend_verify.sh'],
    },
    { name: 'check:bundle-budget', ...bun('run', 'check:bundle-budget') },
    { name: 'check:chunk-init', ...bun('run', 'check:chunk-init') },
  ],
  infra: [
    {
      name: 'shellcheck',
      cmd: 'shellcheck',
      args: [
        'ops/deploy/run-backend.sh',
        'ops/ci/build_frontend_verify.sh',
        'ops/ci/caddy_validate.sh',
        'ops/deploy/preflight.sh',
        'ops/perf/harness/run_baseline.sh',
      ],
      tools: ['shellcheck'],
      hint: 'brew install shellcheck（CI 由 lint-infra job 安装）',
    },
    {
      name: 'actionlint',
      cmd: 'actionlint',
      args: ['-color'],
      tools: ['actionlint'],
      hint: 'brew install actionlint（CI 由 lint-infra job 安装）',
    },
    {
      name: 'compose config (docker-compose.yml)',
      cmd: 'docker',
      args: ['compose', '-f', 'docker-compose.yml', 'config', '-q'],
      tools: ['docker'],
      hint: '装 Docker Desktop / colima；CI runner 自带',
    },
    {
      name: 'compose config (docker-compose.app.yml)',
      cmd: 'docker',
      args: ['compose', '-f', 'docker-compose.app.yml', 'config', '-q'],
      tools: ['docker'],
      hint: '装 Docker Desktop / colima；CI runner 自带',
    },
    {
      // 注释态「可选：内置 Caddy 入口」段：只取消注释，正确性交给下一步的 compose 解析。
      // 直接给解释器入口而不是 `bun run compose:public -- --out …`：少一层 `--` 透传，
      // 参数怎么到达脚本一眼可见（对应的人类入口仍是 `bun run compose:public`）。
      name: 'compose public: uncomment',
      cmd: 'node',
      args: ['ops/lib/py.mjs', 'ops/ci/compose_public.py', '--out', COMPOSE_PUBLIC_PATH],
    },
    {
      name: 'compose config (public snippet)',
      cmd: 'docker',
      args: ['compose', '-f', COMPOSE_PUBLIC_PATH, 'config', '-q'],
      // ACME_EMAIL 在该段里是 `${ACME_EMAIL:?…}` 必填占位符（邮箱不能给默认值）：
      // 不注入的话 `compose config` 会在**插值阶段**先失败，掩盖掉真正要验的缩进问题。
      env: { ACME_EMAIL: 'ops@example.com' },
      tools: ['docker'],
      hint: '装 Docker Desktop / colima；CI runner 自带',
    },
    {
      // 光「能解析」不够：还要确认 caddy-public 真的落在 services 下（没被顶成顶层键）。
      name: 'compose public: services',
      fn: () => {
        const result = spawnSync(
          'docker',
          ['compose', '-f', COMPOSE_PUBLIC_PATH, 'config', '--services'],
          {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            env: { ...process.env, ACME_EMAIL: 'ops@example.com' },
          },
        );
        if (result.status !== 0) {
          console.error(result.stderr || 'docker compose config --services 失败');
          return result.status ?? 1;
        }
        const services = result.stdout.split('\n').map((line) => line.trim());
        if (!services.includes('caddy-public')) {
          console.error('caddy-public 不在 services 下 —— 取消注释时缩进掉了（被顶成顶层键）。');
          return 1;
        }
        console.log(`  services: ${services.join(', ')}`);
        return 0;
      },
      tools: ['docker'],
      hint: '装 Docker Desktop / colima；CI runner 自带',
    },
    {
      name: 'caddy validate',
      cmd: 'bash',
      args: ['ops/ci/caddy_validate.sh'],
      skipExitCodes: [3],
    },
    {
      name: 'check:cython',
      ...bun('run', 'check:cython'),
      // Cython 版本由 Dockerfile 的 ARG 决定，CI 的 lint-infra job 会按其版本 pip install；
      // 本机没装时跑不动，而「本机没装」不是密码：声明成 ciOnly 比让人自己装一份更诚实。
      ciOnly: true,
    },
  ],
};

const DEFAULT_GROUPS = ['static', 'test', 'model'];

/* ------------------------------------------------------------------ *
 * 参数
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const options = { groups: [], all: false, list: false, failFast: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') options.list = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--fail-fast') options.failFast = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--group' || arg === '-g' || arg === '--only' || arg === '-o') {
      const value = argv[i + 1];
      if (!value) fail(`${arg} 需要一个值`);
      options.groups.push(...value.split(',').map((item) => item.trim()).filter(Boolean));
      i += 1;
    } else if (arg.startsWith('--group=')) {
      options.groups.push(...arg.slice('--group='.length).split(',').map((item) => item.trim()).filter(Boolean));
    } else if (arg.startsWith('--only=')) {
      options.groups.push(...arg.slice('--only='.length).split(',').map((item) => item.trim()).filter(Boolean));
    } else {
      fail(`未知参数：${arg}`);
    }
  }
  return options;
}

function fail(message) {
  console.error(`gates: ${message}`);
  process.exit(2);
}

function printHelp() {
  console.log(`门禁编排器（分组见文件头注释）

用法：
  node ops/gates.mjs [--group|--only <组>[,<组>] ...] [--all] [--fail-fast] [--list]

组：${Object.keys(GATE_GROUPS).join(' / ')}
默认组：${DEFAULT_GROUPS.join(' + ')}
上下文：HOMEOS_GATE_CONTEXT=ci 时执行 ciOnly 步骤、缺工具即失败（当前：${CONTEXT}）
`);
}

/* ------------------------------------------------------------------ *
 * 执行
 * ------------------------------------------------------------------ */

/** 工具是否存在：`<tool> --version` 能起来即算（比 which 跨平台更省事）。 */
function commandExists(command) {
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return !probe.error;
}

function runStep(step) {
  const startedAt = Date.now();
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  // 1. 缺工具：本机 SKIP（给安装提示），CI FAIL。
  for (const tool of step.tools ?? []) {
    if (commandExists(tool)) continue;
    if (IS_CI) {
      console.error(`  FAIL 缺少工具 \`${tool}\`（CI 上不允许跳过）`);
      if (step.hint) console.error(`        安装：${step.hint}`);
      return { status: 'fail', elapsed: elapsed() };
    }
    console.log(`  SKIP 本机没有 \`${tool}\``);
    if (step.hint) console.log(`        安装后即可纳入本地门禁：${step.hint}`);
    return { status: 'skip', elapsed: elapsed() };
  }

  // 2. 只在 CI 执行的步骤（本机缺的是环境，不是能力）。
  if (step.ciOnly && !IS_CI) {
    console.log('  SKIP 仅 CI 执行（本机缺少该步骤所需的环境）');
    return { status: 'skip', elapsed: elapsed() };
  }

  // 3. 进程内步骤（清目录、断言产物内容）。
  if (step.fn) {
    const code = step.fn();
    return { status: code === 0 ? 'pass' : 'fail', elapsed: elapsed() };
  }

  const result = spawnSync(step.cmd, step.args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...(step.env ?? {}) },
  });

  if (result.error || result.status === null) {
    const why = result.error ? `${result.error.code ?? ''} ${result.error.message}`.trim() : '被信号中断';
    console.error(`  无法执行 ${step.cmd}：${why}`);
    return { status: 'fail', elapsed: elapsed() };
  }

  if ((step.skipExitCodes ?? []).includes(result.status)) {
    console.log(`  SKIP 退出码 ${result.status}（环境不具备，已在脚本里打印原因）`);
    return { status: 'skip', elapsed: elapsed() };
  }

  return { status: result.status === 0 ? 'pass' : 'fail', elapsed: elapsed() };
}

function runGroup(group) {
  const steps = GATE_GROUPS[group];
  console.log(`\n=== gate:${group}（${steps.length} 项）===`);

  const tally = { pass: 0, fail: 0, skip: 0 };
  const failures = [];
  const startedAt = Date.now();

  for (const [index, step] of steps.entries()) {
    console.log(`[${index + 1}/${steps.length}] ${step.name}`);
    const outcome = runStep(step);
    tally[outcome.status] += 1;
    if (outcome.status === 'fail') failures.push(step.name);
    console.log(`  ${outcome.status.toUpperCase()} ${outcome.elapsed}`);

    if (outcome.status === 'fail' && options.failFast) {
      console.log('  （--fail-fast：本组剩余步骤跳过）');
      break;
    }
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `--- gate:${group}：${tally.pass} PASS / ${tally.fail} FAIL / ${tally.skip} SKIP（${total}）`,
  );
  if (failures.length) console.log(`    失败：${failures.join('、')}`);
  return tally.fail === 0;
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const groups = options.all
  ? Object.keys(GATE_GROUPS)
  : options.groups.length
    ? options.groups
    : DEFAULT_GROUPS;

for (const group of groups) {
  if (!GATE_GROUPS[group]) {
    fail(`未知组：${group}（可选：${Object.keys(GATE_GROUPS).join(' / ')}）`);
  }
}

if (options.list) {
  console.log(`上下文：${CONTEXT}`);
  for (const [group, steps] of Object.entries(GATE_GROUPS)) {
    console.log(`\n${group}（${steps.length}）`);
    for (const step of steps) {
      const marks = [step.ciOnly ? 'CI-only' : '', step.tools?.length ? `需要 ${step.tools.join('/')}` : '']
        .filter(Boolean)
        .join('，');
      console.log(`  - ${step.name}${marks ? `  [${marks}]` : ''}`);
    }
  }
  process.exit(0);
}

console.log(`gates：上下文=${CONTEXT}，组=${groups.join(' + ')}`);
const results = groups.map((group) => ({ group, ok: runGroup(group) }));

console.log('\n===== 汇总 =====');
for (const { group, ok } of results) console.log(`  ${ok ? 'PASS' : 'FAIL'}  gate:${group}`);

const failed = results.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} 个组未通过：${failed.map((item) => item.group).join('、')}`);
  process.exit(1);
}
console.log('\n全部门禁通过。');
