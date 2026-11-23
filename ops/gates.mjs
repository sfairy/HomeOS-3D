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
 * node ops/gates.mjs --fail-fast
 * HOMEOS_GATE_CONTEXT=ci bun run gate:infra   # CI 上下文：ciOnly 步骤参与、缺工具即失败
 * ```
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
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
    { name: 'typecheck', ...bun('run', 'typecheck') },
    // 单一 Biome 配置覆盖主应用 / 商店 / shared / ops。三个子包各自的 `lint:ci`
    // 已退化成委托到这里（见各 package.json），不再有「一处加规则、另一处静默少一条」。
    // 走 `biome ci` 而不是 `biome check`：CI 形态语义明确（只读、格式化差异即失败），
    // 避免将来有人给门禁那条命令顺手加上 `--write` 把「检查」变成「改代码」。
    { name: 'lint:biome', ...bun('run', 'format:check') },
    // CSS 语法仍走 esbuild（与构建同一引擎）：Biome 的 CSS 解析器不认识 Tailwind 的
    // `@import` / `@config` 顺序，也不认 Vue 的 `:deep()`，用它判定会与真实产物脱节。
    { name: 'check:css-syntax', ...bun('run', '--cwd', 'homeos/frontend', 'check:css') },
    { name: 'check:css-syntax-store', ...bun('run', '--cwd', 'homeos-store', 'check:css') },
    { name: 'check:css-syntax-shared', ...bun('run', '--cwd', 'packages/shared', 'check:css') },
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
    // 接口覆盖：后端实时路由 vs 两个前端的调用点。孤儿接口必须登记在
    // frontend-coverage-baseline.json 才能过门禁，避免「后端有、前端没人调」继续堆积。
    { name: 'check:frontend-coverage', ...bun('run', 'check:frontend-coverage') },
    // 「域 → 控制类型」契约表在 Python（后端校验命令）与 TS（播放器渲染面板）各有一份。
    // 两端不一致时「面板能显示、命令发不出去」，类型检查看不见这种跨语言漂移，只能靠这条对齐检查。
    { name: 'check:extra-types', ...bun('run', 'check:extra-types') },
    { name: 'check:file-size', ...bun('run', 'check:file-size') },
    { name: 'check:complexity', ...bun('run', 'check:complexity') },
    // 设备画像的纯逻辑自检（分类 / 别名 / 确认与审计 / 温控校验 / 快路径消歧）。
    // 没有 pytest 依赖：直接跑脚本，失败即非零退出。
    { name: 'check:device-profile', ...bun('run', 'check:device-profile') },
    // 备份域自检：排除项语义、超限报错可用性、迁移快照按字节预算清理。
    // 「备份把上一批备份装进去」这类回归不会让任何编译失败，只会在夜里静默失败。
    { name: 'check:backup', ...bun('run', 'check:backup') },
    // 事件日志写入路径：能耗副作用失败时事件日志**不得**重复写入（11-18→11-21 的
    // 1200 万行重复就是这条路径漏了隔离）。顺带钉住批内去重与清空世代。
    { name: 'check:event-log', ...bun('run', 'check:event-log') },
    // 业务监测：这 5 组曾经是「配置里有开关、后端没有发布端」，自检钉住
    // 「配置关闭不触发 / 冷却内不重复 / 读不到数据不乱报」三类边界。
    { name: 'check:water-monitor', ...bun('run', 'check:water-monitor') },
    { name: 'check:energy-guard', ...bun('run', 'check:energy-guard') },
    { name: 'check:iaq-monitor', ...bun('run', 'check:iaq-monitor') },
    // 电价计费是「数字正确性」：给定分时电价与固定输入，逐项核对峰/谷/平金额。
    { name: 'check:energy-cost', ...bun('run', 'check:energy-cost') },
    // 小时聚合与精确峰谷计价：日粒度估算会系统偏低，这里钉死逐小时算式。
    { name: 'check:energy-hourly', ...bun('run', 'check:energy-hourly') },
    // 昼夜节律的硬约束：绝不开灯、只动配置里点名的灯、默认不改亮度。
    { name: 'check:circadian', ...bun('run', 'check:circadian') },
    // 日出/日落触发：读不到太阳时间必须跳过（不能退回 06:00 / 18:00 的猜测）。
    { name: 'check:sun-trigger', ...bun('run', 'check:sun-trigger') },
    // 安防进入延时：撤防要能取消、到点必须真告警、人体传感器不延迟。
    { name: 'check:entry-delay', ...bun('run', 'check:entry-delay') },
    // 设备倒计时：落库续算（停机期间到期要补发）+ 覆盖而非叠加。
    { name: 'check:device-timer', ...bun('run', 'check:device-timer') },
    // 通知静音：danger / 生命安全永不静音，前缀只按同族匹配。
    { name: 'check:notif-mute', ...bun('run', 'check:notif-mute') },
    // 免鉴权的公开配置不得下发凭据（voice.ttsApiKey / ttsApiBase 曾整体 deepcopy 出去）。
    { name: 'check:public-config', ...bun('run', 'check:public-config') },
    // 商店入口（注册 / 激活 / 商店链接）不得落到内网地址：声明 STORE_BASE_URL 时声明优先，
    // 只有没声明才允许「同机 + IP → <同一 IP>:8802」的离线推断。
    { name: 'check:store-links', ...bun('run', 'check:store-links') },
    // UI 素材（背景图）服务：两层合并优先级、删除随包素材只写隐藏标记、SVG 消毒、
    // 图标目录退役改名。这些都是「不报错但会静默失效」的语义，编译与类型检查都看不见。
    { name: 'check:ui-assets', ...bun('run', 'check:ui-assets') },
    // 设备时序：批内连续变化必须结算上一条（autoflush=False 下漏 flush 会留下
    // 永远「仍在持续」的行）、数值节流不得吞掉真实突变、区域归因失败要计数。
    { name: 'check:timeline', ...bun('run', 'check:timeline') },
    // 来源判定：CORS 只认显式白名单、同源写拒绝同站不同端口、WS 必须带来源。
    { name: 'check:security', ...bun('run', 'check:security') },
    // 命令出口：HA 断连时幂等控制命令入队、同实体只留最后意图、重连补发。
    { name: 'check:command-proxy', ...bun('run', 'check:command-proxy') },
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
 * 参数
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const options = { groups: [], all: false, list: false, failFast: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--list') options.list = true
    else if (arg === '--all') options.all = true
    else if (arg === '--fail-fast') options.failFast = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--group' || arg === '-g' || arg === '--only' || arg === '-o') {
      const value = argv[i + 1]
      if (!value) fail(`${arg} 需要一个值`)
      options.groups.push(
        ...value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      )
      i += 1
    } else if (arg.startsWith('--group=')) {
      options.groups.push(
        ...arg
          .slice('--group='.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      )
    } else if (arg.startsWith('--only=')) {
      options.groups.push(
        ...arg
          .slice('--only='.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      )
    } else {
      fail(`未知参数：${arg}`)
    }
  }
  return options
}

function fail(message) {
  console.error(`gates: ${message}`)
  process.exit(2)
}

function printHelp() {
  console.log(`门禁编排器（分组见文件头注释）

用法：
  node ops/gates.mjs [--group|--only <组>[,<组>] ...] [--all] [--fail-fast] [--list]

组：${Object.keys(GATE_GROUPS).join(' / ')}
默认组：${DEFAULT_GROUPS.join(' + ')}
上下文：HOMEOS_GATE_CONTEXT=ci 时执行 ciOnly 步骤、缺工具即失败（当前：${CONTEXT}）
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

function runStep(step) {
  const startedAt = Date.now()
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`

  // 1. 缺工具：本机 SKIP（给安装提示），CI FAIL。
  for (const tool of step.tools ?? []) {
    if (commandExists(tool)) continue
    if (IS_CI) {
      console.error(`  FAIL 缺少工具 \`${tool}\`（CI 上不允许跳过）`)
      if (step.hint) console.error(`        安装：${step.hint}`)
      return { status: 'fail', elapsed: elapsed() }
    }
    console.log(`  SKIP 本机没有 \`${tool}\``)
    if (step.hint) console.log(`        安装后即可纳入本地门禁：${step.hint}`)
    return { status: 'skip', elapsed: elapsed() }
  }

  // 2. 只在 CI 执行的步骤（本机缺的是环境，不是能力）。
  if (step.ciOnly && !IS_CI) {
    console.log('  SKIP 仅 CI 执行（本机缺少该步骤所需的环境）')
    return { status: 'skip', elapsed: elapsed() }
  }

  // 3. 进程内步骤（清目录、断言产物内容）。
  if (step.fn) {
    const code = step.fn()
    return { status: code === 0 ? 'pass' : 'fail', elapsed: elapsed() }
  }

  const result = spawnSync(step.cmd, step.args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...(step.env ?? {}) },
  })

  if (result.error || result.status === null) {
    const why = result.error ? `${result.error.code ?? ''} ${result.error.message}`.trim() : '被信号中断'
    console.error(`  无法执行 ${step.cmd}：${why}`)
    return { status: 'fail', elapsed: elapsed() }
  }

  if ((step.skipExitCodes ?? []).includes(result.status)) {
    console.log(`  SKIP 退出码 ${result.status}（环境不具备，已在脚本里打印原因）`)
    return { status: 'skip', elapsed: elapsed() }
  }

  return { status: result.status === 0 ? 'pass' : 'fail', elapsed: elapsed() }
}

function runGroup(group) {
  const steps = GATE_GROUPS[group]
  console.log(`\n=== gate:${group}（${steps.length} 项）===`)

  const tally = { pass: 0, fail: 0, skip: 0 }
  const failures = []
  const startedAt = Date.now()

  for (const [index, step] of steps.entries()) {
    console.log(`[${index + 1}/${steps.length}] ${step.name}`)
    const outcome = runStep(step)
    tally[outcome.status] += 1
    if (outcome.status === 'fail') failures.push(step.name)
    console.log(`  ${outcome.status.toUpperCase()} ${outcome.elapsed}`)

    if (outcome.status === 'fail' && options.failFast) {
      console.log('  （--fail-fast：本组剩余步骤跳过）')
      break
    }
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`--- gate:${group}：${tally.pass} PASS / ${tally.fail} FAIL / ${tally.skip} SKIP（${total}）`)
  if (failures.length) console.log(`    失败：${failures.join('、')}`)
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

if (options.list) {
  console.log(`上下文：${CONTEXT}`)
  for (const [group, steps] of Object.entries(GATE_GROUPS)) {
    console.log(`\n${group}（${steps.length}）`)
    for (const step of steps) {
      const marks = [step.ciOnly ? 'CI-only' : '', step.tools?.length ? `需要 ${step.tools.join('/')}` : '']
        .filter(Boolean)
        .join('，')
      console.log(`  - ${step.name}${marks ? `  [${marks}]` : ''}`)
    }
  }
  process.exit(0)
}

console.log(`gates：上下文=${CONTEXT}，组=${groups.join(' + ')}`)
const results = groups.map((group) => ({ group, ok: runGroup(group) }))

console.log('\n===== 汇总 =====')
for (const { group, ok } of results) console.log(`  ${ok ? 'PASS' : 'FAIL'}  gate:${group}`)

const failed = results.filter((item) => !item.ok)
if (failed.length) {
  console.error(`\n${failed.length} 个组未通过：${failed.map((item) => item.group).join('、')}`)
  process.exit(1)
}
console.log('\n全部门禁通过。')
