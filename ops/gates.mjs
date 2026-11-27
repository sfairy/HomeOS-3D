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
 * - `static`：不依赖构建产物的静态检查（类型、lint、ruff、结构规则、棘轮、依赖 DAG 与路由基线）；
 * - `model`：3D 模型库的只读审计（几何 / 槽位 / 材质 / 资产 / 目录与命名索引）；
 * - `build`：需要前端产物的检查（构建 + 结构断言 + chunk 初始化顺序 + 静态产物处理）；
 * - `infra`：shell / workflow / compose / Caddyfile / Cython 兼容性。
 *
 * 两层分类：**组**回答「在哪个 job 跑」，**标签**回答「这是什么检查」。
 * `TAG_GROUPS` 把 static 收成 types / lint / contract / ratchet / invariant / business 六类，
 * `--tag` 可整类跑，`--list` 也按类打印。新增 static 检查必须登记标签，否则启动即报错 ——
 * 分类过期比没有分类更糟。
 *
 * 批量入口与 `covers`
 * -------------------
 * 同一批文件被多条检查反复扫描时（前端 10 条、后端 10 条、路由 5 条），门禁里只登记一个
 * 批量入口（`check:frontend` 等），被合并的原脚本名写进 `covers`：
 *
 * - `--step` 仍能按原脚本名子串命中（`--step offline` → `check:frontend`）；
 * - `--list --json` 输出 `covers`，供「合并前后覆盖对照」机器比对；
 * - 单项调试仍走原脚本（`bun run check:offline-counting`），合并只改执行方式，不改判定口径。
 *
 * 三类跳过都必须**显式打印**，不允许静默成功：
 * - 缺工具（shellcheck / actionlint / docker）：本机给安装提示并 SKIP，CI 里直接 FAIL；
 * - `ciOnly` 步骤（需要 CI 才能装上的东西，如 Cython）：本机 SKIP 并说明理由；
 * - 脚本自己退出 3：约定为「环境不具备，本机跳过」（如没装 caddy）。
 *
 * 用法
 * ----
 * ```bash
 * bun run gate                    # static + model（默认）
 * bun run gate:model              # 只跑一组
 * node ops/gates.mjs --all        # 含 build + infra
 * node ops/gates.mjs --group static,model
 * node ops/gates.mjs --list       # 打印清单，不执行
 * node ops/gates.mjs --list --json # 机器可读（含 covers，用于覆盖对照）
 * node ops/gates.mjs --tag ratchet          # 只跑某一类检查
 * node ops/gates.mjs --step duplicates      # 只跑名字匹配的步骤（含批量入口的 covers）
 * node ops/gates.mjs --jobs 8               # 并行度（默认 4；build/infra 恒为串行）
 * node ops/gates.mjs --fail-fast
 * HOMEOS_GATE_CONTEXT=ci bun run gate:infra   # CI 上下文：ciOnly 步骤参与、缺工具即失败
 * ```
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const CONTEXT = process.env.HOMEOS_GATE_CONTEXT === 'ci' ? 'ci' : 'local'
const IS_CI = CONTEXT === 'ci'

/**
 * 「可选：内置 Caddy 入口」段的临时产物。路径显式传给 op/ci/compose_public.py 的 --out，
 * 后面两个 docker 步骤读同一个文件 —— 三处各写一个字面量就会有一处漂移（Windows 上还没有
 * /tmp）。用 os.tmpdir() 与 Python 侧 tempfile.gettempdir() 同源。
 */
const COMPOSE_PUBLIC_PATH = path.join(os.tmpdir(), 'compose-public.yml')

/** `bun run <script>`：门禁命令一律走 package.json，避免编排器里长出第二份实现。 */
const bun = (...args) => ({ cmd: 'bun', args })

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
    // ---- types -------------------------------------------------------
    { name: 'typecheck', ...bun('run', 'typecheck'), serial: true },
    { name: 'typecheck:node', ...bun('run', 'typecheck:node') },
    // ---- lint --------------------------------------------------------
    // 单一 Biome 配置覆盖主应用 / 商店 / shared / ops。走 `biome ci` 而不是 `biome check`：
    // CI 形态语义明确（只读、格式化差异即失败），避免有人顺手加 `--write` 把「检查」变「改代码」。
    { name: 'lint:biome', ...bun('run', 'format:check') },
    // CSS 语法仍走 esbuild（与构建同一引擎）：Biome 的 CSS 解析器不认识 Tailwind 的
    // `@import` / `@config` 顺序，也不认 Vue 的 `:deep()`，用它判定会与真实产物脱节。
    { name: 'check:css-syntax', ...bun('run', 'check:css-syntax') },
    // CSS 路径真源一致性：spa_static 预载 / page-assets 挂载 / index.html / public-static.seed
    // 四处人工同步、零校验，改一处漏一处只会表现为「首屏变慢」或「登录页丢样式」。
    { name: 'check:css-manifests', ...bun('run', 'check:css-manifests') },
    // ruff check + 新增 .py 的 ruff format 校验：同一个解释器、同一条规则来源，
    // 拆成两步只会在失败时跑两遍解释器。
    { name: 'lint:py', ...bun('run', 'lint:py'), covers: ['check:python-format'] },
    // ---- contract ----------------------------------------------------
    // 版本三条线（Bun / 基础镜像 / Python）各有两处以上副本，漂移不报错、只在换机或发版时暴露。
    { name: 'check:toolchain', ...bun('run', 'check:toolchain') },
    // 环境变量契约：模板里不许有没人读的键（inventory）+ `os.getenv` 只许出现在白名单叶子
    // （access）。同一主题，两条脚本各自守一个方向。
    { name: 'check:env', ...bun('run', 'check:env'), covers: ['check:env-inventory', 'check:env-access'] },
    // 路由 / 契约五合一：一次后端导入（routes / store-routes / ws-auth / api-contract /
    // frontend-coverage）。覆盖检查复用前两条算出的路由表缓存。
    {
      name: 'check:contracts',
      ...bun('run', 'check:contracts'),
      covers: ['check:routes', 'check:store-routes', 'check:ws-auth', 'check:api-contract', 'check:frontend-coverage'],
    },
    // 分层依赖方向：前端 `check_frontend_deps` + 后端 `check_backend_deps`，同一主题两端各一道。
    { name: 'check:deps', ...bun('run', 'check:deps'), covers: ['check:frontend-deps', 'check:backend-deps'] },
    // `studio/runtime/**` 同时被主 bundle 与逐文件产物消费；导出面一改，主 bundle 类型检查
    // 照样通过，舞台只在运行时炸 —— 用契约快照拦住。
    { name: 'check:runtime-contract', ...bun('run', 'check:runtime-contract') },
    // ---- ratchet -----------------------------------------------------
    // 前端两条守卫（离线计数口径 / 受限写法）。合并的意义是**共享一次遍历与一份 AST**。
    // 计数类与外观类已全部删除：别名计数、性能反模式计数、命名形态、重复代码、覆盖率、
    // 视觉 / a11y / Vitals 基线都把「代码长什么样」固化成了数字门槛，与「行数不作判据」同源。
    {
      name: 'check:frontend',
      ...bun('run', 'check:frontend'),
      covers: ['check:offline-counting', 'check:restricted-syntax'],
    },
    // 后端静态检查。合并的意义是共享一份 `ast.parse` 缓存：此前每条都把 694 个 .py
    // 重新解析一遍（合计约 25s），现在一个解释器跑完约 5s。
    {
      name: 'check:backend',
      ...bun('run', 'check:backend'),
      covers: [
        'check:silent-except',
        'check:error-contract',
        'check:background-tasks',
        'check:env-access',
        // 两条合并脚本：guards = async 同步 DB / PEP 758 / 响应模型；parity = 设备 kind 两表 +
        // 域控制类型表 + 迁移回归。原六条单项脚本已删除，判定逻辑与口径不变。
        'check:guards',
        'check:parity',
      ],
    },
    // ---- invariant ---------------------------------------------------
    // 3D / 画布八条纯逻辑断言（几何内核 / 放置吸附 / 视口手势 / 窗型撤销 / 场景归一化 /
    // 状态游标 / 画布基准 / 分辨率审计）。
    {
      name: 'check:studio-invariants',
      ...bun('run', 'check:studio-invariants'),
      covers: [
        'check:plan-geometry',
        'check:studio-placement',
        'check:studio-gesture',
        'check:studio-window-undo',
        'check:scene-payload',
        'check:state-revision',
        'check:canvas-layout',
        'audit:scaling',
      ],
    },
    // 入户场景静态资源：真源在 packages/shared/scene/static，两个前端只是 `sync:scene` 的产物。
    { name: 'check:scene', ...bun('run', 'check:scene') },
    // 运行期 Python 依赖锁：与 requirements.txt 指纹漂移时，镜像里装的包与代码假设不一致。
    { name: 'check:python-lock', ...bun('run', 'check:python-lock') },
    // 镜像包的导入门禁：源码里的绝对 `src.` 导入在镜像里不存在。
    { name: 'check:image-imports', ...bun('run', 'check:image-imports') },
    // ---- business ----------------------------------------------------
    // 三类断言：bun test 契约单测 + stdlib unittest + 19 个业务规则自检。三段都跑完再汇总。
    {
      name: 'check:tests',
      ...bun('run', 'check:tests'),
      covers: ['check:unit-tests', 'check:backend-unit-tests', 'check:selftests'],
    },
  ],
  model: [
    // 资产 / 几何 / 槽位 / 材质四条只读审计（各自产出报告，不写基线）。
    {
      name: 'check:model-assets',
      ...bun('run', 'check:model-assets'),
      covers: ['check:assets', 'check:geometry', 'check:slots', 'check:materials'],
    },
    // 目录分区与中文名索引：新增/移动模型后这两处必须同步。
    {
      name: 'check:model-index',
      ...bun('run', 'check:model-index'),
      covers: ['check:models-layout', 'check:model-names'],
    },
  ],
  build: [
    {
      name: 'clean dist',
      // 干净检出的状态必须能复现：本地残留的 dist/ 是「本地绿、CI 红」的经典来源
      // （2026-10-10 的构建锁 ENOENT 就是被它兜住的）。
      fn: () => {
        const dist = path.join(REPO_ROOT, 'dist')
        // 先确认没人在服务 dist：`bun run dev` 的后端直接把 dist 当静态根，
        // 在它运行时清空 = 把线上正在用的产物删掉 20~32 秒（watch-build 重建期间）。
        // 现象是浏览器里一堆 `Failed to load resource: 503`、`/stage.html` 回
        // 「前端产物尚未就绪」，但后端本身是健康的 —— 排查方向会被带偏。
        const dev = devServerServing()
        if (dev.serving && process.env.HOMEOS_GATE_FORCE_CLEAN !== '1') {
          console.error(`  拒绝清空 dist/：${dev.reason}`)
          console.error('  `bun run gate:build` 会先删 dist 再重建；dev 正在服务它时这会中断前端 20~32 秒。')
          console.error('  做法：先停掉 `bun run dev` 再跑构建门禁（CI 上不存在这个问题）。')
          console.error('  确需在 dev 运行时清空：HOMEOS_GATE_FORCE_CLEAN=1 bun run gate:build')
          return 1
        }
        if (existsSync(dist)) rmSync(dist, { recursive: true, force: true })
        console.log(dev.serving ? '  已清空 dist/（HOMEOS_GATE_FORCE_CLEAN=1 强制）' : '  已清空 dist/')
        return 0
      },
    },
    {
      name: 'build_frontend_verify',
      cmd: 'bash',
      args: ['ops/ci/build_frontend_verify.sh'],
    },
    { name: 'check:chunk-init', ...bun('run', 'check:chunk-init') },
    { name: 'check:font-subset', ...bun('run', 'check:font-subset') },
    // 内置字体（assets-default/fonts）：catalog 的 size/sha256 必须与实际文件一致。
    // 换了文件名却忘了回写 catalog 会让浏览器按旧 `?v=` 一直拿旧缓存，症状是「字体没更新」。
    { name: 'check:default-fonts', ...bun('run', 'check:default-fonts') },
    // `public/static` 的 CSS 靠 `minify-static-css` 压、`.br`/`.gz` 靠 `precompress-static` 生成
    // （Vite 只压 `assets/` 下打包过的样式）。裸 `vite build` 会静默产出未压缩的 `studio.css`
    // 且不生成 sidecar，页面照常工作、没有报错，只有这两条能把「产物没处理过」变成红灯。
    {
      name: 'check:dist-assets',
      ...bun('run', 'check:dist-assets'),
      covers: ['check:minified-css', 'check:precompress'],
    },
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
      // 两份交付 compose 的解析：同一件事分两个步骤只会让清单更长，失败时多一段重复日志。
      name: 'compose config',
      covers: ['compose config (docker-compose.yml)', 'compose config (docker-compose.app.yml)'],
      fn: () => {
        for (const file of ['docker-compose.yml', 'docker-compose.app.yml']) {
          const result = spawnSync('docker', ['compose', '-f', file, 'config', '-q'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
          })
          if (result.status !== 0) {
            console.error(result.stderr || `docker compose -f ${file} config 失败`)
            return result.status ?? 1
          }
        }
        return 0
      },
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
        const result = spawnSync('docker', ['compose', '-f', COMPOSE_PUBLIC_PATH, 'config', '--services'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: { ...process.env, ACME_EMAIL: 'ops@example.com' },
        })
        if (result.status !== 0) {
          console.error(result.stderr || 'docker compose config --services 失败')
          return result.status ?? 1
        }
        const services = result.stdout.split('\n').map((line) => line.trim())
        if (!services.includes('caddy-public')) {
          console.error('caddy-public 不在 services 下 —— 取消注释时缩进掉了（被顶成顶层键）。')
          return 1
        }
        console.log(`  services: ${services.join(', ')}`)
        return 0
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
  /**
   * 浏览器级端到端冒烟（`check:e2e`）。
   *
   * 为什么不并进 static：它需要「本地 dev 服务器 + 一个开了调试端口的浏览器」，
   * 在干净的 CI runner 上必然缺失。因此单独成组，**不进默认组**：
   *   node ops/gates.mjs --group ux
   * 缺环境时脚本以退出码 3 结束，这里按 SKIP 处理（不是通过，也不算失败）。
   *
   * 视觉回归 / 可访问性 / Web Vitals / HTTP 微基准已删除：它们是像素或数字基线，
   * 每次界面调整都要重录，维护成本高于发现问题的价值，与「不设数字门槛」同一条原则。
   */
  ux: [{ name: 'check:e2e', ...bun('run', 'check:e2e'), skipExitCodes: [3] }],
}

const DEFAULT_GROUPS = ['static', 'model']

/**
 * 「是否有人在服务 dist」的判定。
 *
 * 两个信号，按可靠性排序：
 *
 * 1. **运行时标记** `.dev-server.json`（由 `ops/dev.mjs` 写入，退出时删除）。里面带 pid，
 *    因此 Ctrl-C 或 SIGKILL 留下的陈旧标记不会让构建门禁永久拒绝执行 —— 进程不在了就忽略。
 * 2. **端口探测**：标记不存在但 `8801/8805` 有响应时，说明 dev 很可能是**在本改动之前**
 *    启动的（那时还不写标记）。此时同样拒绝，避免「第一次就踩坑」。
 *
 * 容器里的后端也会响应 8801，但容器用的是**镜像内自己的 dist**，清空宿主 dist 不影响它 ——
 * 代价只是本机会多拒绝一次，而误删的代价是前端中断 20~32 秒。宁可多拦。
 *
 * @returns {{serving: boolean, reason: string}}
 */
function devServerServing() {
  const marker = path.join(REPO_ROOT, '.dev-server.json')
  if (existsSync(marker)) {
    try {
      const payload = JSON.parse(readFileSyncText(marker))
      const pid = Number(payload?.pid)
      if (Number.isInteger(pid) && pid > 0 && processAlive(pid)) {
        return {
          serving: true,
          reason: `\`bun run dev\`（pid ${pid}，启动于 ${payload?.startedAt ?? '未知'}）正在服务 dist/`,
        }
      }
    } catch {
      // 标记损坏：当作不存在，继续走端口探测。
    }
  }
  for (const [port, label] of [
    [8801, '主应用 API'],
    [8805, '主应用 Vite'],
  ]) {
    if (portResponding(port)) {
      return { serving: true, reason: `${label}（127.0.0.1:${port}）有响应，dist/ 可能正被服务` }
    }
  }
  return { serving: false, reason: '' }
}

/** 读文本（只在判定标记时用一次，不值得为它再加一个具名导入的别名）。 */
function readFileSyncText(file) {
  return readFileSync(file, 'utf8')
}

/** 进程是否还活着：`kill(pid, 0)` 只做存在性检查，不发信号。 */
function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** 端口是否有 HTTP 响应（300ms 超时：本机回环，不该慢）。 */
function portResponding(port) {
  const probe = spawnSync('curl', ['-s', '-o', '/dev/null', '-m', '1', `http://127.0.0.1:${port}/`], {
    stdio: 'ignore',
  })
  return probe.status === 0
}

/* ------------------------------------------------------------------ *
 * 分类（标签）
 * ------------------------------------------------------------------ */

/**
 * static 组的「这是什么检查」分类，供 `--tag` 过滤与 `--list` 展示。
 *
 * 只分一层：**组**是执行单元（一个 CI job），**标签**是理解单元（一类退化）。
 * 这份表同时是完备性约束：static 里每条步骤必须恰好归入一类，表里也不许出现
 * 清单里没有的名字 —— 两边任一漂移，启动时直接报错，避免分类慢慢过期成摆设。
 *
 * 取值含义：
 *   types      编译/类型（改一处类型错误全链路可见）
 *   lint       格式与语法（Biome / ruff / CSS 语法 / 受限写法）
 *   contract   跨端或跨文件的契约对齐（两端各有一份表、接口有无调用方）
 *   ratchet    只许降不许增的**语义**基线（调用约定 / 离线计数口径），不守外观与风格
 *   invariant  纯逻辑/几何/状态机的数学不变量（给定输入断言输出）
 *   business   业务规则自检（语义正确性：该告警的告警、该静默的静默）
 */
const TAG_GROUPS = {
  types: ['typecheck', 'typecheck:node'],
  lint: ['lint:biome', 'check:css-syntax', 'check:css-manifests', 'lint:py'],
  contract: ['check:toolchain', 'check:env', 'check:contracts', 'check:deps', 'check:runtime-contract'],
  ratchet: ['check:frontend', 'check:backend'],
  invariant: ['check:studio-invariants', 'check:scene', 'check:python-lock', 'check:image-imports'],
  business: ['check:tests'],
}

/**
 * 手动入口清单（**显式登记**，不再从 package.json 推断）。
 *
 * 为什么改成显式：推断版只能看出「命令里有没有被 gates 引用」，合并成批量入口后，
 * 被合并的脚本仍在 `covers` 里，推断会漏判；而真正的「手动工具」又只能靠名字猜。
 * 这份清单是给人看的：这些命令**不阻断 CI**，别误以为门禁已经在跑。
 */
const MANUAL_SCRIPTS = [
  'check:studio-parity', // 人工 A/B：要 Chrome + 两个服务，见 ops/scripts/studio-visual-parity.mjs
  'soak', // 长跑泄漏观测：需要浏览器长连接稳定，见 ops/checks/perf/soak.mjs
]

/** 把标签挂到步骤上，并校验「每个 static 步骤恰好一类」。 */
function attachTags() {
  const tagOf = new Map()
  for (const [tag, names] of Object.entries(TAG_GROUPS)) {
    for (const name of names) {
      if (tagOf.has(name)) fail(`步骤 \`${name}\` 被登记在多个标签下（${tagOf.get(name)} / ${tag}）`)
      tagOf.set(name, tag)
    }
  }
  const staticSteps = GATE_GROUPS.static
  const known = new Set(staticSteps.map((item) => item.name))
  for (const name of tagOf.keys()) {
    if (!known.has(name)) fail(`TAG_GROUPS 里的 \`${name}\` 不在 static 清单中（改名后忘了同步）`)
  }
  for (const step of staticSteps) {
    const tag = tagOf.get(step.name)
    if (!tag) fail(`static 步骤 \`${step.name}\` 没有标签：请在 TAG_GROUPS 里归入一类`)
    step.tag = tag
  }
}

attachTags()

/* ------------------------------------------------------------------ *
 * 参数
 * ------------------------------------------------------------------ */

/** 逗号分隔的参数值 → 去空数组（`--tag a,b` 与重复 `--tag a --tag b` 等价）。 */
function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseArgs(argv) {
  const options = {
    groups: [],
    tags: [],
    steps: [],
    jobs: null,
    all: false,
    list: false,
    json: false,
    failFast: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--list') options.list = true
    else if (arg === '--json') options.json = true
    else if (arg === '--all') options.all = true
    else if (arg === '--fail-fast') options.failFast = true
    else if (arg === '--serial') options.jobs = 1
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--group' || arg === '-g' || arg === '--only' || arg === '-o') {
      const value = argv[i + 1]
      if (!value) fail(`${arg} 需要一个值`)
      options.groups.push(...splitList(value))
      i += 1
    } else if (arg.startsWith('--group=')) {
      options.groups.push(...splitList(arg.slice('--group='.length)))
    } else if (arg.startsWith('--only=')) {
      options.groups.push(...splitList(arg.slice('--only='.length)))
    } else if (arg === '--tag' || arg === '-t') {
      const value = argv[i + 1]
      if (!value) fail(`${arg} 需要一个值`)
      options.tags.push(...splitList(value))
      i += 1
    } else if (arg.startsWith('--tag=')) {
      options.tags.push(...splitList(arg.slice('--tag='.length)))
    } else if (arg === '--step' || arg === '-s') {
      const value = argv[i + 1]
      if (!value) fail(`${arg} 需要一个值`)
      options.steps.push(...splitList(value))
      i += 1
    } else if (arg.startsWith('--step=')) {
      options.steps.push(...splitList(arg.slice('--step='.length)))
    } else if (arg === '--jobs' || arg === '-j') {
      if (argv[i + 1] === undefined) fail(`${arg} 需要一个值`)
      options.jobs = parseJobs(argv[i + 1])
      i += 1
    } else if (arg.startsWith('--jobs=')) {
      options.jobs = parseJobs(arg.slice('--jobs='.length))
    } else {
      fail(`未知参数：${arg}`)
    }
  }
  return options
}

/**
 * `--tag` / `--step` 过滤。
 *
 * `--step` 是**子串**匹配（`--step energy` 一次挑出 energy-* 这一类），
 * `--tag` 只对起了标签的组有效；未登记标签的组在有 `--tag` 时整体跳过。
 */
function matchesFilters(step, group) {
  if (options.tags.length) {
    if (!step.tag) return false
    if (!options.tags.includes(step.tag)) return false
  }
  if (options.steps.length) {
    // 批量步骤（check:frontend 等）还接受被合并的原脚本名：`--step offline` 仍能命中
    // `check:frontend`，否则合并之后连「只复跑失败的那一条」都做不到。
    const haystack = [step.name, ...(step.covers ?? [])].map((item) => item.toLowerCase())
    if (!options.steps.some((needle) => haystack.some((item) => item.includes(needle.toLowerCase())))) return false
  }
  return true
}

function fail(message) {
  console.error(`gates: ${message}`)
  process.exit(2)
}

function printHelp() {
  console.log(`门禁编排器（分组见文件头注释）

用法：
  node ops/gates.mjs [--group|--only <组>[,<组>] ...] [--all] [--fail-fast] [--list [--json]]
                     [--tag <类>[,<类>]] [--step <名字子串>[,<名字子串>]] [--jobs <n|auto>] [--serial]

组：${Object.keys(GATE_GROUPS).join(' / ')}
默认组：${DEFAULT_GROUPS.join(' + ')}
标签（仅 static）：${Object.keys(TAG_GROUPS).join(' / ')}
并行：默认 auto（最多 4）；build / infra 恒为串行；HOMEOS_GATE_JOBS 可改默认值
上下文：HOMEOS_GATE_CONTEXT=ci 时执行 ciOnly 步骤、缺工具即失败（当前：${CONTEXT}）

示例：
  node ops/gates.mjs --tag ratchet --jobs 1     # 一条一条看棘轮
  node ops/gates.mjs --step offline           # 命中 check:frontend（批量入口按 covers 匹配）
  bun run gate:fast                            # 日常快检：types + lint（其余留给 pre-push / CI）
`)
}

/* ------------------------------------------------------------------ *
 * 执行
 * ------------------------------------------------------------------ */

/** 工具是否存在：`<tool> --version` 能起来即算（比 which 跨平台更省事）。 */
function commandExists(command) {
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore' })
  return !probe.error
}

/**
 * 步骤的「能不能跑」判定：缺工具 / 仅 CI。
 *
 * 返回 ``null`` 表示可以执行；否则返回该跳过/失败结论。串行与并行共用这一份，
 * 避免两条执行路径对 SKIP 口径产生分叉。
 */
function precheck(step) {
  for (const tool of step.tools ?? []) {
    if (commandExists(tool)) continue
    if (IS_CI) {
      return {
        status: 'fail',
        note: `FAIL 缺少工具 \`${tool}\`（CI 上不允许跳过）${step.hint ? `\n        安装：${step.hint}` : ''}`,
      }
    }
    return {
      status: 'skip',
      note: `SKIP 本机没有 \`${tool}\`${step.hint ? `\n        安装后即可纳入本地门禁：${step.hint}` : ''}`,
    }
  }
  if (step.ciOnly && !IS_CI) {
    return { status: 'skip', note: 'SKIP 仅 CI 执行（本机缺少该步骤所需的环境）' }
  }
  return null
}

/** 解析 ``--jobs`` 的值：``auto`` / ``0`` 表示按 CPU 数，其余必须是正整数。 */
function parseJobs(raw) {
  const text = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (text === '' || text === 'auto' || text === '0') return 0
  const value = Number.parseInt(text, 10)
  if (!Number.isFinite(value) || value < 1) fail(`--jobs 需要一个正整数或 auto：收到 \`${raw}\``)
  return value
}

/** 本组实际并行度：build/infra 有组内先后依赖，恒为 1。 */
function resolveJobs(group) {
  if (group === 'build' || group === 'infra') return 1
  if (options.jobs !== null) return options.jobs === 0 ? defaultJobs() : options.jobs
  const fromEnv = process.env.HOMEOS_GATE_JOBS
  if (fromEnv !== undefined && fromEnv !== '') {
    const parsed = parseJobs(fromEnv)
    return parsed === 0 ? defaultJobs() : parsed
  }
  return defaultJobs()
}

/** 并行默认值：留一个核给系统，最多 4；单核机器退回串行。 */
function defaultJobs() {
  return Math.max(1, Math.min(4, os.cpus().length - 1))
}

/**
 * 执行一个步骤。
 *
 * ``capture=true``（并行模式）时把 stdout/stderr 收进缓冲区、由调用方按整段打印，
 * 否则直接继承终端 —— 多进程同时 inherit 会把不同检查的输出揉成一团。
 */
async function runStep(step, capture) {
  const startedAt = Date.now()
  const elapsed = () => Number(((Date.now() - startedAt) / 1000).toFixed(1))

  const blocked = precheck(step)
  if (blocked) return { ...blocked, seconds: elapsed() }

  if (step.fn) {
    const code = step.fn()
    return { status: code === 0 ? 'pass' : 'fail', seconds: elapsed() }
  }

  if (!capture) {
    const result = spawnSync(step.cmd, step.args, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, ...(step.env ?? {}) },
    })
    return { status: exitStatus(result, step, step.cmd), seconds: elapsed() }
  }

  return await new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(step.env ?? {}) },
    })
    const chunks = []
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => chunks.push(chunk))
    child.on('error', (error) => {
      chunks.push(Buffer.from(`  无法执行 ${step.cmd}：${error.code ?? ''} ${error.message}\n`))
      resolve({ status: 'fail', output: Buffer.concat(chunks).toString('utf8'), seconds: elapsed() })
    })
    child.on('close', (code, signal) => {
      const output = Buffer.concat(chunks).toString('utf8')
      const status =
        code === null ? 'fail' : (step.skipExitCodes ?? []).includes(code) ? 'skip' : code === 0 ? 'pass' : 'fail'
      resolve({ status, output, seconds: elapsed(), signal })
    })
  })
}

/** spawnSync 结果 → 步骤状态（错误码 / 跳过码 / 退出码三种口径）。 */
function exitStatus(result, step, command) {
  if (result.error || result.status === null) {
    const why = result.error ? `${result.error.code ?? ''} ${result.error.message}`.trim() : '被信号中断'
    console.error(`  无法执行 ${command}：${why}`)
    return 'fail'
  }
  if ((step.skipExitCodes ?? []).includes(result.status)) {
    console.log(`  SKIP 退出码 ${result.status}（环境不具备，已在脚本里打印原因）`)
    return 'skip'
  }
  return result.status === 0 ? 'pass' : 'fail'
}

/** 按整段打印并行步骤的输出：只在失败 / 跳过时可见，避免 50 条绿色日志淹没失败原因。 */
function printBuffered(outcome) {
  const lines = (outcome.output ?? '').replace(/\s+$/, '').split('\n')
  const shown =
    lines.length > 60 ? [...lines.slice(0, 30), `  ⋯ 省略 ${lines.length - 60} 行 ⋯`, ...lines.slice(-30)] : lines
  for (const line of shown) if (line !== '') console.log(`  │ ${line}`)
}

/**
 * 并发跑一段互不依赖的步骤。
 *
 * 顺序只影响日志，不影响结论：全部跑完再汇总，`--fail-fast` 时不再派发新步骤
 * （已在跑的会跑完 —— 中途杀进程会让失败原因变成「被信号中断」，反而更难查）。
 */
async function runSegment(segment, jobs, progress, results) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(jobs, segment.length) }, async () => {
    while (cursor < segment.length) {
      if (options.failFast && results.some((item) => item.status === 'fail')) return
      const item = segment[cursor]
      cursor += 1
      const outcome = await runStep(item.step, true)
      progress.done += 1
      reportOutcome(outcome, item.step.name, progress)
      results.push({ name: item.step.name, ...outcome })
    }
  })
  await Promise.all(workers)
}

/** 一行结果 + 失败/跳过的输出。串行与并行共用同一套措辞。 */
function reportOutcome(outcome, name, progress) {
  const label = `${String(progress.done).padStart(2, ' ')}/${progress.total}`
  console.log(`[${label}] ${outcome.status.toUpperCase()} ${outcome.seconds.toFixed(1)}s  ${name}`)
  printNote(outcome)
  if (outcome.status !== 'pass' && outcome.output) printBuffered(outcome)
}

/** 跳过原因的附加说明（串行模式下也要打印，否则 SKIP 变成无解释的成功）。 */
function printNote(outcome) {
  if (!outcome.note) return
  for (const line of outcome.note.split('\n')) console.log(`  ${line.trim()}`)
}

async function runGroup(group) {
  const all = GATE_GROUPS[group]
  const steps = all.filter((step) => matchesFilters(step, group))
  if (steps.length === 0) {
    const why = options.tags.length && group !== 'static' ? '（--tag 只对 static 生效）' : '（筛选后无步骤）'
    console.log(`\n=== gate:${group}${why}，跳过 ===`)
    return true
  }
  const jobs = resolveJobs(group)
  // 串行时不写「并行 1」：那是实现细节，不是使用者需要读的信息。
  const parallelNote = jobs > 1 ? `，并行 ${jobs}` : ''
  console.log(
    `\n=== gate:${group}（${steps.length} 项${steps.length !== all.length ? ` / 共 ${all.length}` : ''}${parallelNote}）===`,
  )

  const startedAt = Date.now()
  const progress = { done: 0, total: steps.length }
  const results = []

  if (jobs === 1) {
    for (const step of steps) {
      console.log(`[${progress.done + 1}/${progress.total}] ${step.name}`)
      const outcome = await runStep(step, false)
      progress.done += 1
      // 串行模式已经把输出留在终端上，这里只补结果行。
      console.log(`  ${outcome.status.toUpperCase()} ${outcome.seconds.toFixed(1)}s`)
      printNote(outcome)
      if (outcome.status === 'fail') console.log(`  ↳ 复跑：node ops/gates.mjs --group ${group} --step ${step.name}`)
      results.push({ name: step.name, ...outcome })
      if (outcome.status === 'fail' && options.failFast) {
        console.log('  （--fail-fast：本组剩余步骤跳过）')
        break
      }
    }
  } else {
    // serial 步骤（会写共享产物）单独成段，前后各跑一批并行步骤。
    let index = 0
    while (index < steps.length) {
      const step = steps[index]
      if (step.serial) {
        console.log(`[${progress.done + 1}/${progress.total}] ${step.name}（串行）`)
        const outcome = await runStep(step, false)
        progress.done += 1
        console.log(`  ${outcome.status.toUpperCase()} ${outcome.seconds.toFixed(1)}s`)
        printNote(outcome)
        if (outcome.status === 'fail') console.log(`  ↳ 复跑：node ops/gates.mjs --group ${group} --step ${step.name}`)
        results.push({ name: step.name, ...outcome })
        index += 1
        continue
      }
      const segment = []
      while (index < steps.length && !steps[index].serial) {
        segment.push({ step: steps[index] })
        index += 1
      }
      await runSegment(segment, jobs, progress, results)
    }
  }

  const tally = { pass: 0, fail: 0, skip: 0 }
  for (const item of results) tally[item.status] += 1
  const total = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`--- gate:${group}：${tally.pass} PASS / ${tally.fail} FAIL / ${tally.skip} SKIP（${total}s）`)
  const failures = results.filter((item) => item.status === 'fail')
  if (results.length < steps.length) {
    console.log(`    提前停止：--fail-fast 生效，剩余 ${steps.length - results.length} 项未执行`)
  }
  if (failures.length) {
    console.log(`    失败：${failures.map((item) => item.name).join('、')}`)
    console.log(
      `    复跑失败项：node ops/gates.mjs --group ${group} ${failures.map((item) => `--step ${item.name}`).join(' ')}`,
    )
  }
  const slowest = [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 5)
  if (slowest.length > 1) {
    console.log(`    最慢：${slowest.map((item) => `${item.name} ${item.seconds.toFixed(1)}s`).join('、')}`)
  }
  return tally.fail === 0
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

const options = parseArgs(process.argv.slice(2))

if (options.help) {
  printHelp()
  process.exit(0)
}

const groups = options.all ? Object.keys(GATE_GROUPS) : options.groups.length ? options.groups : DEFAULT_GROUPS

for (const group of groups) {
  if (!GATE_GROUPS[group]) {
    fail(`未知组：${group}（可选：${Object.keys(GATE_GROUPS).join(' / ')}）`)
  }
}

function stepMarks(step) {
  return [step.ciOnly ? 'CI-only' : '', step.tools?.length ? `需要 ${step.tools.join('/')}` : '']
    .filter(Boolean)
    .join('，')
}

if (options.list) {
  // `--list --json`：供「合并前后覆盖对照」这类机器比对使用（脚本无需解析人类可读表格）。
  if (options.json) {
    const payload = Object.fromEntries(
      Object.entries(GATE_GROUPS).map(([group, steps]) => [
        group,
        steps.map((step) => ({
          name: step.name,
          tag: step.tag ?? null,
          covers: step.covers ?? [],
          tools: step.tools ?? [],
          ciOnly: step.ciOnly === true,
        })),
      ]),
    )
    console.log(JSON.stringify({ context: CONTEXT, groups: payload, manual: MANUAL_SCRIPTS }, null, 2))
    process.exit(0)
  }
  console.log(`上下文：${CONTEXT}`)
  for (const [group, steps] of Object.entries(GATE_GROUPS)) {
    console.log(`\n${group}（${steps.length}）`)
    // static 按标签分组打印：一份 50 条的平铺清单看不出结构，按类读才像目录。
    if (group === 'static') {
      for (const [tag, names] of Object.entries(TAG_GROUPS)) {
        console.log(`  ${tag}（${names.length}）`)
        for (const name of names) {
          const step = steps.find((item) => item.name === name)
          const marks = stepMarks(step)
          console.log(`    - ${name}${marks ? `  [${marks}]` : ''}`)
        }
      }
      continue
    }
    for (const step of steps) {
      const marks = stepMarks(step)
      console.log(`  - ${step.name}${marks ? `  [${marks}]` : ''}`)
    }
  }
  printManualScripts()
  process.exit(0)
}

/** `--list` 末尾打印手动入口：避免「门禁已经在跑」的误解。 */
function printManualScripts() {
  console.log(`\n手动入口（不属于门禁）：${MANUAL_SCRIPTS.length} 条`)
  for (const name of MANUAL_SCRIPTS) console.log(`  - ${name}`)
}

console.log(`gates：上下文=${CONTEXT}，组=${groups.join(' + ')}`)
if (options.tags.length) console.log(`标签过滤：${options.tags.join('、')}`)
if (options.steps.length) console.log(`步骤过滤：${options.steps.join('、')}`)

// 过滤器一条都没命中时必须报错：空结果按「全绿」退出会让人以为检查过了。
if (options.tags.length || options.steps.length) {
  const matched = groups.reduce(
    (count, group) => count + GATE_GROUPS[group].filter((step) => matchesFilters(step, group)).length,
    0,
  )
  if (matched === 0) {
    const hints = [
      options.tags.length ? `标签 ${options.tags.join('、')}` : '',
      options.steps.length ? `步骤 ${options.steps.join('、')}` : '',
    ]
      .filter(Boolean)
      .join(' / ')
    fail(`筛选条件没有命中任何步骤（${hints}）。用 --list 查看可用名称；--tag 只对 static 生效。`)
  }
}

const results = []
for (const group of groups) results.push({ group, ok: await runGroup(group) })

console.log('\n===== 汇总 =====')
for (const { group, ok } of results) console.log(`  ${ok ? 'PASS' : 'FAIL'}  gate:${group}`)

const failed = results.filter((item) => !item.ok)
if (failed.length) {
  console.error(`\n${failed.length} 个组未通过：${failed.map((item) => item.group).join('、')}`)
  process.exit(1)
}
console.log('\n全部门禁通过。')
