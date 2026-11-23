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
 * - `build`：需要前端产物的检查（构建 + 结构断言 + 体积预算 + chunk 初始化顺序）；
 * - `infra`：shell / workflow / compose / Caddyfile / Cython 兼容性。
 *
 * 两层分类：**组**回答「在哪个 job 跑」，**标签**回答「这是什么检查」。
 * static 的 50+ 条如果只按组看就是一张平铺的长清单；`TAG_GROUPS` 把它们收成
 * types / lint / contract / ratchet / invariant / business 六类，`--tag` 可整类跑，
 * `--list` 也按类打印。新增 static 检查必须登记标签，否则启动即报错 ——
 * 分类过期比没有分类更糟。
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
 * node ops/gates.mjs --tag ratchet          # 只跑某一类检查
 * node ops/gates.mjs --step check:energy    # 只跑名字匹配的步骤（子串）
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
    { name: 'typecheck', ...bun('run', 'typecheck'), serial: true },
    // 单一 Biome 配置覆盖主应用 / 商店 / shared / ops。三个子包各自的 `lint:ci`
    // 已退化成委托到这里（见各 package.json），不再有「一处加规则、另一处静默少一条」。
    // 走 `biome ci` 而不是 `biome check`：CI 形态语义明确（只读、格式化差异即失败），
    // 避免将来有人给门禁那条命令顺手加上 `--write` 把「检查」变成「改代码」。
    { name: 'lint:biome', ...bun('run', 'format:check') },
    // CSS 语法仍走 esbuild（与构建同一引擎）：Biome 的 CSS 解析器不认识 Tailwind 的
    // `@import` / `@config` 顺序，也不认 Vue 的 `:deep()`，用它判定会与真实产物脱节。
    // 三个子包共用一条命令（根脚本按 frontend → store → shared 依次跑）：
    // 它们用的是同一个脚本，拆成三个门禁步骤只会让清单变长、失败时多两段重复日志。
    { name: 'check:css-syntax', ...bun('run', 'check:css-syntax') },
    // Biome 没有 no-restricted-syntax 的等价物，这两条规范约束用脚本承接。
    { name: 'check:restricted-syntax', ...bun('run', 'check:restricted-syntax') },
    // 画布断点守卫：壳层宽度断点必须是 @container hos-canvas，不能再回落到读窗口宽度的 @media
    // （缩放开启后二者不是一回事，回落即「缩放后顶栏文字消失 / 操作区被裁」）。
    { name: 'check:canvas-breakpoints', ...bun('run', 'check:canvas-breakpoints') },
    // 分辨率审计：5 档设计基准 × 15 档真实终端，验证画布两轴铺满、不变形、不错档。
    { name: 'audit:scaling', ...bun('run', 'audit:scaling') },
    { name: 'lint:py', ...bun('run', 'lint:py') },
    { name: 'typecheck:node', ...bun('run', 'typecheck:node') },
    // 工具链版本一致性：Bun（packageManager）、Python（镜像解释器）、基础镜像摘要
    // 这三条版本线各有两处以上副本，漂移不报错、只会在换机或发版时才暴露。
    { name: 'check:toolchain', ...bun('run', 'check:toolchain') },
    // 环境变量对账：`.env.example` 里不能再留着没人读的键（历史上有整段失效的
    // `APP_HA_*` / `STORE_WECHAT_*`，读模板等于读一份假契约）。
    { name: 'check:env-inventory', ...bun('run', 'check:env-inventory') },
    { name: 'check:scene', ...bun('run', 'check:scene') },
    { name: 'check:any', ...bun('run', 'check:any') },
    // 别名 / 模块级可变状态棘轮：三个巨型编排文件之所以拆不动，很大原因是 `xxx2`
    // 别名（命名冲突）、`xxxImpl` 转发层与模块级 let。只许下降，拆分阶段逐块压低。
    { name: 'check:aliases', ...bun('run', 'check:aliases') },
    { name: 'check:frontend-complexity', ...bun('run', 'check:frontend-complexity') },
    // 性能棘轮：deep:true 监听 / transition:all / 匿名 pagehide / 热路径 JSON.stringify
    // 只许降不许增。这四类写法都不会让任何编译或类型检查失败，只会让交互变卡、内存变高。
    { name: 'check:perf-ratchet', ...bun('run', 'check:perf-ratchet') },
    // 重复代码棘轮：jscpd 精确克隆（≥10 行且 ≥50 token）对比基线，涨了即失败。
    // 近似重复（相似度阈值）不进门禁 —— 主观阈值卡 CI 只会催生「改得更不像」的动机。
    { name: 'check:duplicates', ...bun('run', 'check:duplicates') },
    // 代码量棘轮：有效代码行（去空行/整行注释）与有效字符数只允许持平或下降。
    { name: 'check:code-size', ...bun('run', 'check:code-size') },
    // CSS 重复声明体：可证明安全的那部分必须已经合并完（见 ops/scripts/merge-css-duplicates.mjs）。
    { name: 'check:css-duplicates', ...bun('run', 'check:css-duplicates') },
    // 令牌可解析性：`var(--x)` 必须能追到声明处，否则该属性静默失效（浏览器不报错）。
    { name: 'check:css-tokens', ...bun('run', 'check:css-tokens') },
    // `domElement` 与「建元素 + 设类名 + 设文本」的等价性证明（假 document 逐字段比对）。
    { name: 'check:dom-factory', ...bun('run', 'check:dom-factory') },
    // 平面多边形布尔内核的数学不变量（空集恒等 / 幂等 / 面积守恒 / 洞语义 / 点归属）。
    // 「模型门禁」看的是 GLB 文件，「这条」看的是户型绘制用的并集/差集内核，两者互不覆盖。
    { name: 'check:plan-geometry', ...bun('run', 'check:plan-geometry') },
    // 毫米标尺与拖动吸附的几何不变量（OBB 四角 / 墙厚表面 / 往返一致 / freedom / previous）。
    { name: 'check:studio-placement', ...bun('run', 'check:studio-placement') },
    // 3D 视口编辑 / 标尺的**语义**不变量（目标优先的离地吸附 / 量化基准 / 竖直容差 / 指纹 / 取景保持）。
    { name: 'check:studio-gesture', ...bun('run', 'check:studio-gesture') },
    // 窗型「删扇撤销 / 墙体合并朝向」不变量（只加回消失的窗扇、朝反向才翻转）。
    { name: 'check:studio-window-undo', ...bun('run', 'check:studio-window-undo') },
    // 存草稿兼容层：老草稿经归一化载入、编辑后整份写回，漏挑一个字段就是静默丢数据。
    { name: 'check:scene-payload', ...bun('run', 'check:scene-payload') },
    { name: 'check:styles', ...bun('run', 'check:styles') },
    { name: 'check:silent-except', ...bun('run', 'check:silent-except') },
    // 错误契约：禁止新增「detail 是中文文案的 HTTPException」—— 这类响应没有稳定
    // apiErrorCode，前端只能拿文案当契约（改一句话就改一次接口语义）。
    { name: 'check:error-contract', ...bun('run', 'check:error-contract') },
    // 后台任务：裸 asyncio.create_task 的异常只在循环关闭时报一条无上下文的日志，
    // 且停机不等待。新代码必须走 background_tasks.spawn，存量只许下降。
    { name: 'check:background-tasks', ...bun('run', 'check:background-tasks') },
    // 配置唯一入口是 Settings；直读 os.getenv 会让配置无法注入、两处兜底值不一致
    // （实测数据目录指标量的是 cwd）。白名单 + 只许下降，每条必须写明理由。
    { name: 'check:env-access', ...bun('run', 'check:env-access') },
    { name: 'check:async-db', ...bun('run', 'check:async-db') },
    { name: 'check:python-lock', ...bun('run', 'check:python-lock') },
    { name: 'check:image-imports', ...bun('run', 'check:image-imports') },
    // `except A, B:`（PEP 758）在 Cython 3.3.0 里会被解析成 `except A as B:`：编译**通过**
    // 但只捕获 A，check:cython 看不见。这条静态守卫在本地就能拦住（ruff format 会主动改成
    // 无括号形式，所以守卫必须比 check:cython 更早、更便宜）。
    { name: 'check:pep758-except', ...bun('run', 'check:pep758-except') },
    // 六个结构性棘轮：WS 鉴权、商店路由契约、API 契约覆盖率、文件规模、Python 复杂度、新增文件格式。
    { name: 'check:ws-auth', ...bun('run', 'check:ws-auth') },
    { name: 'check:store-routes', ...bun('run', 'check:store-routes') },
    { name: 'check:api-contract', ...bun('run', 'check:api-contract') },
    // 响应模型基类：`StrictModel` 是给请求体的（extra="forbid"）。误用到 response_model
    // 上时，服务层多返回一个键就会在序列化阶段 500 —— 类型检查与路由基线都看不见。
    { name: 'check:response-models', ...bun('run', 'check:response-models') },
    // 接口覆盖：后端实时路由 vs 两个前端的调用点。孤儿接口必须登记在
    // frontend-coverage-baseline.json 才能过门禁，避免「后端有、前端没人调」继续堆积。
    { name: 'check:frontend-coverage', ...bun('run', 'check:frontend-coverage') },
    // 「域 → 控制类型」契约表在 Python（后端校验命令）与 TS（播放器渲染面板）各有一份。
    // 两端不一致时「面板能显示、命令发不出去」，类型检查看不见这种跨语言漂移，只能靠这条对齐检查。
    { name: 'check:extra-types', ...bun('run', 'check:extra-types') },
    // 设备 kind → 渲染形态的换算表在 Python（分类结论）与 TS（3D 面板同步读）各有一份。
    // 两端漂移时「面板画错形态、语音选的却是另一种设备」，类型检查看不见跨语言差异。
    { name: 'check:device-kinds', ...bun('run', 'check:device-kinds') },
    // 设备形态推断从前端搬到后端（rule-v2）后，必须证明「既有结论没变」：
    // 语料里逐条记录旧启发式的结论，任何一条变化都要求复核。
    { name: 'check:device-kinds-regression', ...bun('run', 'check:device-kinds-regression') },
    // 单元测试：stdlib unittest 覆盖后端授权状态推算 / 错误契约 / 受管后台任务 /
    // 棘轮骨架；bun test 覆盖 TS 侧契约表（设备 kind 换算、占位符推断）。
    // 两类用例同在 ops/checks/unittests/：同一个目录便于「改契约就想到改测试」。
    { name: 'check:unit-tests', ...bun('run', 'check:unit-tests') },
    { name: 'check:backend-unit-tests', ...bun('run', 'check:backend-unit-tests') },
    { name: 'check:file-size', ...bun('run', 'check:file-size') },
    // 巨型文件的**扇出**：行数只看「长不长」，这里看「为什么拆不动」——
    // stage.ts 有 7 个 deps 函数共 920 个依赖条目，是三个巨型文件里耦合最重的，
    // 而单看行数/Impl 数完全看不出来。拆分进度按这个指标衡量。
    { name: 'check:giant-files', ...bun('run', 'check:giant-files') },
    { name: 'check:complexity', ...bun('run', 'check:complexity') },
    // 业务规则自检（19 个 `*_selftest.py`）：设备画像 / 备份 / 事件日志 / 用水与用能 /
    // 电价与逐小时聚合 / 昼夜节律 / 日出日落 / 安防进入延时 / 设备倒计时 / 通知静音 /
    // 公开配置 / 商店入口 / UI 素材 / 设备时序 / 来源判定 / 命令出口。
    // 守的都是「不报错但会静默错」的语义（重复写事件日志、漏结算一条时序、静音掉
    // 生命安全告警），编译与类型检查都看不见。
    //
    // 合并成一条步骤只改**执行方式**：一个解释器里串完 19 个模块，省掉 19 次 Python
    // 启动与重复导入；断言一条不少，失败仍按模块名定位。单项调试仍用原脚本
    // （`bun run check:circadian` 等，package.json 里都保留着）。
    { name: 'check:selftests', ...bun('run', 'check:selftests') },
    // 画布基准：超宽屏（21:9 / 32:9）换 16:9 系基准后，画布仍必须铺满视口且不变形。
    { name: 'check:canvas-layout', ...bun('run', 'check:canvas-layout') },
    // 状态发布游标：舞台 `onPatch` 原地写状态表，必须靠版本号判断变化 ——
    // 退回对象引用比较会把单实体 `state_changed` 全部吞掉（画面不更新且不报错）。
    { name: 'check:state-revision', ...bun('run', 'check:state-revision') },
    // UI 溢出棘轮：裸 `1fr` 网格与非白名单 `overflow-x:auto` 只许降不许增
    // （设置页是 overflow-x:hidden，长串撑破列宽时内容会被静默裁掉）。
    { name: 'check:ui-overflow', ...bun('run', 'check:ui-overflow') },
    { name: 'check:python-format', ...bun('run', 'check:python-format') },
    // 以下四条原属 test 组：它们只读源码、不跑用例，测试移除后并入 static，避免门禁丢项。
    { name: 'check:studio-split', ...bun('run', 'check:studio-split') },
    // `studio/runtime/**` 同时被主 bundle 与 `vite.runtime.config.ts` 的逐文件产物消费。
    // 导出面一改，主 bundle 类型检查照样通过，舞台产物只在运行时炸 —— 用契约快照拦住。
    { name: 'check:runtime-contract', ...bun('run', 'check:runtime-contract') },
    { name: 'check:frontend-deps', ...bun('run', 'check:frontend-deps') },
    { name: 'check:backend-deps', ...bun('run', 'check:backend-deps') },
    // 导入真实路由注册表，需要后端运行期依赖（CI static job 为此装 requirements.txt）。
    { name: 'check:routes', ...bun('run', 'check:routes') },
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
        const dist = path.join(REPO_ROOT, 'dist')
        if (existsSync(dist)) rmSync(dist, { recursive: true, force: true })
        console.log('  已清空 dist/')
        return 0
      },
    },
    {
      name: 'build_frontend_verify',
      cmd: 'bash',
      args: ['ops/ci/build_frontend_verify.sh'],
    },
    // 体积预算棘轮已移除：入口 chunk / runtime 数随功能迭代自然漂移，
    // 构建组只守下面三条（chunk 初始化顺序、字体子集、静态 CSS 是否真被压过）。
    { name: 'check:chunk-init', ...bun('run', 'check:chunk-init') },
    { name: 'check:font-subset', ...bun('run', 'check:font-subset') },
    // `public/static` 的 CSS 靠 `minify-static-css` 压（Vite 只压 `assets/` 下打包过的样式）。
    // 这条路只在 `build:frontend` 链条里跑：裸 `vite build` 会静默产出 124KB / 5694 行的
    // `studio.css`，页面照常工作、没有任何报错，只有这一条能把「产物没压过」变成红灯。
    { name: 'check:minified-css', ...bun('run', 'check:minified-css') },
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
}

const DEFAULT_GROUPS = ['static', 'model']

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
 *   ratchet    只许降不许增的计数基线（存量债只能还、不能欠）
 *   invariant  纯逻辑/几何/状态机的数学不变量（给定输入断言输出）
 *   business   业务规则自检（语义正确性：该告警的告警、该静默的静默）
 */
const TAG_GROUPS = {
  types: ['typecheck', 'typecheck:node'],
  lint: ['lint:biome', 'check:css-syntax', 'check:restricted-syntax', 'lint:py', 'check:python-format'],
  contract: [
    'check:toolchain',
    'check:env-inventory',
    'check:ws-auth',
    'check:store-routes',
    'check:api-contract',
    'check:response-models',
    'check:frontend-coverage',
    'check:extra-types',
    'check:device-kinds',
    'check:device-kinds-regression',
    'check:runtime-contract',
    'check:frontend-deps',
    'check:backend-deps',
    'check:routes',
  ],
  ratchet: [
    'check:any',
    'check:aliases',
    'check:frontend-complexity',
    'check:perf-ratchet',
    'check:duplicates',
    'check:code-size',
    'check:css-duplicates',
    'check:file-size',
    'check:giant-files',
    'check:complexity',
    'check:silent-except',
    'check:error-contract',
    'check:background-tasks',
    'check:env-access',
    'check:ui-overflow',
    'check:styles',
  ],
  invariant: [
    'check:canvas-breakpoints',
    'audit:scaling',
    'check:scene',
    'check:css-tokens',
    'check:dom-factory',
    'check:plan-geometry',
    'check:studio-placement',
    'check:studio-gesture',
    'check:studio-window-undo',
    'check:scene-payload',
    'check:canvas-layout',
    'check:state-revision',
    'check:studio-split',
    'check:async-db',
    'check:python-lock',
    'check:image-imports',
    'check:pep758-except',
  ],
  business: ['check:unit-tests', 'check:backend-unit-tests', 'check:selftests'],
}

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
  const options = { groups: [], tags: [], steps: [], jobs: null, all: false, list: false, failFast: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--list') options.list = true
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
    const name = step.name.toLowerCase()
    if (!options.steps.some((needle) => name.includes(needle.toLowerCase()))) return false
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
  node ops/gates.mjs [--group|--only <组>[,<组>] ...] [--all] [--fail-fast] [--list]
                     [--tag <类>[,<类>]] [--step <名字子串>[,<名字子串>]] [--jobs <n|auto>] [--serial]

组：${Object.keys(GATE_GROUPS).join(' / ')}
默认组：${DEFAULT_GROUPS.join(' + ')}
标签（仅 static）：${Object.keys(TAG_GROUPS).join(' / ')}
并行：默认 auto（最多 4）；build / infra 恒为串行；HOMEOS_GATE_JOBS 可改默认值
上下文：HOMEOS_GATE_CONTEXT=ci 时执行 ciOnly 步骤、缺工具即失败（当前：${CONTEXT}）

示例：
  node ops/gates.mjs --tag ratchet --jobs 1     # 一条一条看棘轮
  node ops/gates.mjs --step energy             # 只跑名字里带 energy 的步骤
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
  printUnregisteredScripts()
  process.exit(0)
}

/**
 * `--list` 末尾列出「package.json 里有、但不属于任何组」的 check 脚本。
 *
 * 这些是手动入口（mutation / golden / licenses 之类），不阻断 CI，但也很容易被误以为
 * 「门禁已经在跑」。把它们显式列出来，免得下次再有人从 README 的命令表里推断覆盖率。
 */
function printUnregisteredScripts() {
  const registered = new Set()
  for (const steps of Object.values(GATE_GROUPS)) {
    for (const step of steps) {
      const runIndex = step.args?.indexOf('run') ?? -1
      if (runIndex >= 0 && step.args[runIndex + 1] && !step.args[runIndex + 1].startsWith('-')) {
        registered.add(step.args[runIndex + 1])
      }
    }
  }
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
  // 单个 `*_selftest.py` 的脚本是 `check:selftests` 的调试入口（批量步骤里已经在跑），
  // 列出来只会让人以为 19 条自检没进门禁 —— 按「命令里引用了 selftest 脚本」排除。
  const manual = Object.keys(pkg.scripts ?? {}).filter(
    (name) => name.startsWith('check:') && !registered.has(name) && !/_selftest\.py/.test(pkg.scripts[name] ?? ''),
  )
  if (manual.length === 0) return
  console.log(`\n未登记为门禁（手动运行）：${manual.length} 条`)
  for (const name of manual) console.log(`  - ${name}  =>  ${pkg.scripts[name]}`)
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
