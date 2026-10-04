#!/usr/bin/env bun
/**
 * HomeOS 本地开发启动器 —— package.json 的 `bun run dev` / `bun run dev:backend` 入口。
 *
 * 默认同时拉起：
 *   - 主应用 / 商店后端（uvicorn --reload 与 STORE_RELOAD，改 Python 即热重载）
 *   - Vite HMR（8805 / 8806，改前端资源即热更）
 *
 * 用法：
 *   bun run dev                 # 一键 dev
 *   bun run dev -- --lan        # 绑 0.0.0.0，打印局域网地址
 *   bun run dev -- --backend-only
 *   bun run dev -- --debug      # 热重载照旧，另开 debugpy 端口给 IDE attach
 *   bun ops/dev.mjs --prepare   # 只装 Python 环境
 *
 * 设计要点：
 *   - `package.json` 是唯一入口，本脚本只做「起进程 + 环境编排」，不承担构建 / 部署。
 *   - 授权公钥是**动态**的：商店首次启动随机生成密钥对，主应用启动自检会无条件
 *     核对 transport 公钥的 sha256（backend/src/license/trust.py），所以必须现算
 *     指纹再注入。这一步交给 `python -m ops.license_keys dev-env`（单行 JSON）。
 *   - dist 被 git 忽略，换分支 / 回滚后会留下「自洽但过时」的产物，因此预检不只看
 *     产物在不在，还按 mtime 判断它是否落后于 frontend/{pages,src}。
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const HOMEOS_3D = path.join(ROOT, "homeos-3d");
const HOMEOS_STORE = path.join(ROOT, "homeos-store");
const APP_BACKEND = path.join(HOMEOS_3D, "backend");
const STORE_BACKEND = path.join(HOMEOS_STORE, "backend");
const DIST_ROOT = path.join(ROOT, "dist");
const APP_FRONTEND = path.join(DIST_ROOT, "homeos-3d", "frontend");
const STORE_FRONTEND = path.join(DIST_ROOT, "homeos-store", "frontend");
const APP_SOURCE = path.join(APP_BACKEND, "src");

const IS_WINDOWS = process.platform === "win32";

const APP_PORT = "8801";
const STORE_PORT = "8802";
const VITE_3D_PORT = "8805";
const VITE_STORE_PORT = "8806";
const DEBUG_APP_PORT = "8811";
const DEBUG_STORE_PORT = "8812";
const BACKEND_PORTS = [
  [APP_PORT, "主应用 API"],
  [STORE_PORT, "授权商店 API"],
];
const FRONTEND_PORTS = [
  [VITE_3D_PORT, "主应用 Vite"],
  [VITE_STORE_PORT, "授权商店 Vite"],
];
const DEBUG_PORTS = [
  [DEBUG_APP_PORT, "主应用调试器"],
  [DEBUG_STORE_PORT, "授权商店调试器"],
];
const HOST = "127.0.0.1";
const LAN_HOST = "0.0.0.0";
const LOOPBACK_BIND_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

const LAN_FLAG = "--lan";
const BACKEND_ONLY_FLAG = "--backend-only";
const DEBUG_FLAG = "--debug";
const PREPARE_FLAG = "--prepare";
const KNOWN_FLAGS = new Set([LAN_FLAG, BACKEND_ONLY_FLAG, DEBUG_FLAG, PREPARE_FLAG]);

const VENV_DIR = path.join(ROOT, ".venv-store");
const VENV_PYTHON = IS_WINDOWS
  ? path.join(VENV_DIR, "Scripts", "python.exe")
  : path.join(VENV_DIR, "bin", "python");
const CLIENT_KEYS_DIR = path.join(ROOT, "keys");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Bun 自身的可执行文件：用它跑 vite / bun install，避免再依赖 PATH 里的 bun。 */
const BUN_BIN = process.execPath;

function resolveSystemPython() {
  const candidates = process.env.HOMEOS_DEV_PYTHON
    ? [process.env.HOMEOS_DEV_PYTHON]
    : IS_WINDOWS
      ? ["python", "py"]
      : ["python3", "python"];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "import sys; print(sys.version_info[0])"], {
      stdio: "ignore",
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error("未找到 Python 3.12+；请安装，或用 HOMEOS_DEV_PYTHON 指定解释器路径。");
}

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`命令失败（退出码 ${result.status}）：${command} ${args.join(" ")}`);
  }
  return result;
}

function installRequirements() {
  runSync(VENV_PYTHON, [
    "-m",
    "pip",
    "install",
    "-r",
    path.join(APP_BACKEND, "src", "requirements.txt"),
    "-r",
    path.join(STORE_BACKEND, "src", "requirements.txt"),
  ]);
}

/** venv 目录在、依赖却可能是空的：编辑器 / `python -m venv` 会建出裸环境。 */
function venvDependenciesReady() {
  const probe = spawnSync(VENV_PYTHON, ["-c", "import uvicorn, watchfiles"], {
    stdio: "ignore",
  });
  return !probe.error && probe.status === 0;
}

/** 返回用于启动两个服务的 Python 解释器。 */
function ensureVenv() {
  if (fs.existsSync(VENV_PYTHON)) {
    if (venvDependenciesReady()) return VENV_PYTHON;
    console.log("共享 venv 缺少依赖，正在补装…");
    installRequirements();
    return VENV_PYTHON;
  }
  runSync(resolveSystemPython(), ["-m", "venv", VENV_DIR]);
  installRequirements();
  return VENV_PYTHON;
}

/**
 * `--debug` 用：确保共享 venv 里装了 debugpy。
 *
 * 故意不写进 requirements.txt —— 它只服务本地调试：线上镜像由 uvicorn 直接起服务，
 * 代码里没有任何 `import debugpy`，塞进去只是白多一个包和一份 SBOM 升级面。
 */
function ensureDebugpy(python) {
  const probe = spawnSync(python, ["-c", "import debugpy"], { stdio: "ignore" });
  if (!probe.error && probe.status === 0) return;
  console.log("--debug 需要 debugpy，正在装入共享 venv…");
  runSync(python, ["-m", "pip", "install", "debugpy"]);
}

/**
 * 确保本地授权密钥存在并镜像公钥，返回主应用需要的环境变量覆盖项。
 *
 * 走 `python -m ops.license_keys dev-env`：它是本仓库公钥同步的唯一实现，指纹现算，
 * 不在这里重复一份逻辑。
 */
function ensureLicenseKeys(python) {
  const result = spawnSync(python, ["-m", "ops.license_keys", "dev-env"], {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`生成 / 同步授权公钥失败（退出码 ${result.status}）。`);
  }
  const line = (result.stdout ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .pop();
  if (!line) throw new Error("授权公钥同步没有返回 JSON。");
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`授权公钥同步返回的不是 JSON：${line}`);
  }
}

/* ------------------------------------------------------------------ *
 * dist 产物新鲜度预检
 * ------------------------------------------------------------------ */

/** `root` 下最新的文件修改时间（纳秒 BigInt）；目录不存在时回 0。 */
function newestMtimeNs(root) {
  let newest = 0n;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      let stat;
      try {
        stat = fs.statSync(full, { bigint: true });
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.mtimeNs > newest) newest = stat.mtimeNs;
    }
  }
  return newest;
}

/**
 * 构建产物 `marker` 是否不早于 `sources` 里的最新一次改动。
 *
 * `dist` 被 git 忽略：换分支 / 回滚源码之后它会整套留在原地，而只检查产物存在判断不出
 * 「产物比源码旧」。这种半新半旧的 dist 最坏的地方是它往往**自洽** —— 页面对着它自己
 * 那批 chunk，浏览器照常加载，于是没人发现它属于上一个提交，直到后端按新源码的约定去
 * 读它就 500 / 401。`marker` 取该次构建最后写盘的那个产物，源码侧按 mtime 反查。
 */
function buildCoversSources(marker, ...sources) {
  let builtAt;
  try {
    builtAt = fs.statSync(marker, { bigint: true }).mtimeNs;
  } catch {
    return false;
  }
  return sources.every((root) => newestMtimeNs(root) <= builtAt);
}

function hasJsAssets(directory) {
  try {
    return fs.readdirSync(directory).some((name) => name.endsWith(".js"));
  } catch {
    return false;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * 匿名静态资源白名单是否覆盖了 `frontend/public` 里真实存在的种子条目。
 *
 * 只看 `assets/*.js` 存在是不够的：一次中途失败的构建（Vite 清空 outDir 时抛 ENOTEMPTY）
 * 会留下「构建产物在、public 的拷贝没铺」的半成品 dist。此时 dist/public-static.json 里
 * 图标与 manifest 会被 vite 插件按「产物不存在」整批筛掉，未登录页请求 favicon /
 * webmanifest 就变成 401/403。这里按种子清单反查一遍。
 */
function anonymousWhitelistComplete() {
  const seed = readJson(path.join(HOMEOS_3D, "frontend", "public-static.seed.json"));
  const manifest = readJson(path.join(APP_FRONTEND, "public-static.json"));
  if (!seed || !manifest) return false;

  const generated = new Set();
  for (const entry of manifest.files ?? []) {
    const candidate = typeof entry === "string" ? entry : entry?.path;
    if (typeof candidate === "string") generated.add(candidate);
  }

  const publicRoot = path.join(HOMEOS_3D, "frontend", "public");
  for (const item of seed.files ?? []) {
    const candidate = typeof item === "string" ? item : item?.path;
    if (typeof candidate !== "string" || !candidate.startsWith("/static/")) continue;
    if (!fs.existsSync(path.join(publicRoot, candidate.replace(/^\//, "")))) continue;
    if (!generated.has(candidate)) return false;
  }
  return true;
}

/** 商店前端产物是否覆盖了 `frontend/src` 的最新改动。 */
function storeFrontendBuildCurrent() {
  return buildCoversSources(
    path.join(STORE_FRONTEND, "templates", "index.html"),
    path.join(HOMEOS_STORE, "frontend", "src"),
  );
}

/**
 * 主应用前端产物是否覆盖了 `frontend/{index.html,src,public}` 的最新改动。
 *
 * `frontend/public/**` 必须一起比：SPA 外壳样式（`public/static/spa-shell.css`）和各页
 * 既有 CSS 都在 public 下，dev 下 `/static/**` 是后端从 dist 下发的，只看 index.html/src
 * 的话改了 public 里的 CSS 不会触发重建，浏览器一直拿旧副本。
 */
function appFrontendBuildCurrent() {
  return buildCoversSources(
    path.join(APP_FRONTEND, "public-static.json"),
    path.join(HOMEOS_3D, "frontend", "index.html"),
    path.join(HOMEOS_3D, "frontend", "src"),
    path.join(HOMEOS_3D, "frontend", "public"),
  );
}

/**
 * 前端构建产物缺失、或落后于 `frontend/{index.html,src,public}` 时，跑一次
 * `bun run build:vite`（开发用，不混淆）。
 */
function ensureFrontendBuild() {
  const ready =
    hasJsAssets(path.join(APP_FRONTEND, "static", "assets")) &&
    fs.existsSync(path.join(APP_FRONTEND, "modules", "runtime", "manifest.json")) &&
    anonymousWhitelistComplete() &&
    hasJsAssets(path.join(STORE_FRONTEND, "static", "assets")) &&
    appFrontendBuildCurrent() &&
    storeFrontendBuildCurrent();
  if (ready) return;

  console.log("前端构建产物缺失或落后于源码，正在执行 bun run build:vite（开发构建，跳过混淆）…");
  runSync(BUN_BIN, ["install"]);
  runSync(BUN_BIN, ["run", "build:vite"]);
}

/* ------------------------------------------------------------------ *
 * 端口预检 / 局域网地址 / .env
 * ------------------------------------------------------------------ */

/** 探测本机回环地址上 `port` 是否已有服务在监听。 */
function isPortListening(port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    const socket = net.connect({ host: "127.0.0.1", port: Number(port) });
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/** 启动前预检服务端口；已被占用时立刻中止，不拉起任何子进程。 */
async function ensurePortsAvailable({ frontend, debug }) {
  const ports = [...BACKEND_PORTS];
  if (frontend) ports.push(...FRONTEND_PORTS);
  if (debug) ports.push(...DEBUG_PORTS);

  const results = await Promise.all(
    ports.map(async ([port, name]) => [port, name, await isPortListening(port)]),
  );
  const occupied = results.filter(([, , listening]) => listening);
  if (occupied.length === 0) return;

  console.log("⚠ 检测到服务端口已被占用，本次启动已中止（未拉起任何进程）：");
  for (const [port, name] of occupied) console.log(`  - ${port}（${name}）已有服务在监听`);
  console.log("  最常见的原因是上一份 ops/dev.mjs 还没退出，或已在另一个终端里运行 Vite。");
  console.log("  请先停掉已有实例再启动：关闭它所在的终端，或执行 `pkill -f ops/dev.mjs`。");
  process.exit(1);
}

/**
 * 探出本机对外的局域网 IPv4 地址；拿不到时返回空串。
 *
 * 不能用 UDP `connect()` 后读 `socket.address()`：Node/Bun 的 dgram 不做 Python
 * `getsockname()` 那种按路由选口的行为，未显式 bind 时会回 `0.0.0.0`（打印出来的
 * 局域网地址就成了不可用的 `http://0.0.0.0:8801/`）。改为枚举网卡，优先常见内网段。
 */
function primaryLanAddress() {
  const candidates = [];
  let interfaces;
  try {
    interfaces = os.networkInterfaces();
  } catch {
    // 某些沙箱 / 受限环境里 getifaddrs 会直接报错，退化为「没探到」即可，
    // 不能让一次地址探测把已经拉起服务给带崩。
    return "";
  }
  for (const entries of Object.values(interfaces ?? {})) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" && entry.family !== 4) continue;
      if (entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      candidates.push(entry.address);
    }
  }
  const isPrivate = (address) =>
    address.startsWith("192.168.") ||
    address.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address);
  return candidates.find(isPrivate) ?? candidates[0] ?? "";
}

/** 极简 `.env` 加载：真实环境变量优先，与商店 src/core/env.py 的口径一致。 */
function loadDotenv() {
  const file = path.join(ROOT, ".env");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split("\n")) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trim();
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(index + 1).trim();
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    } else {
      value = value.split(" #", 1)[0].trim();
    }
    process.env[key] = value;
  }
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

function viteDevCommand(configRel, host) {
  const command = [BUN_BIN, "vite", "--config", configRel];
  if (!LOOPBACK_BIND_HOSTS.has(host)) command.push("--host", host);
  return command;
}

/**
 * 把真正的启动命令包进 debugpy 的监听模式（IDE 随后 attach 到这个端口）。
 *
 * 这里是「断点」与「热重载」能同时成立的关键：debugpy 的 `--listen` 默认带
 * `subProcess=True`，它会 patch `multiprocessing` / `subprocess`；而两个后端的重载子进程
 * 正是从这两处拉起来的，所以它们会自动连回同一个调试会话 —— 改完代码重载出来的新进程
 * 照样能命中断点。这也是**不能**把 `--reload` 摘掉的原因。
 *
 * `-Xfrozen_modules=off` 是 Python 3.11+ 的必需项：解释器默认用冻结的 stdlib 模块，
 * debugpy 会因此漏掉断点。
 *
 * 末尾的 `-m` 是 debugpy **自己的**参数（`debugpy -m <module>`），剩余参数会原样透传给
 * 该模块。不能再把解释器整体拼进命令里：那会拼成
 * `python -m debugpy --listen 8811 python -m uvicorn ...`，debugpy 会把那个 `python`
 * 当成脚本路径去 compile，直接报 `SyntaxError: source code string cannot contain null bytes`。
 */
function debugpyPrefix(python, debugPort) {
  return [python, "-Xfrozen_modules=off", "-m", "debugpy", "--listen", debugPort, "-m"];
}

function parseOptions(arguments_) {
  const unknown = arguments_.filter((item) => !KNOWN_FLAGS.has(item));
  if (unknown.length > 0) {
    console.log(`⚠ 忽略了无法识别的参数：${unknown.join(" ")}`);
    console.log(`  本脚本只认 ${[...KNOWN_FLAGS].sort().join(" / ")}。`);
  }
  return {
    host: arguments_.includes(LAN_FLAG) ? LAN_HOST : HOST,
    backendOnly: arguments_.includes(BACKEND_ONLY_FLAG),
    debug: arguments_.includes(DEBUG_FLAG),
  };
}

function spawnChild(command, environment, cwd) {
  return spawn(command[0], command.slice(1), {
    cwd,
    env: environment,
    stdio: "inherit",
  });
}

function childAlive(child) {
  return child.exitCode === null && child.signalCode === null;
}

function terminate(child) {
  if (!childAlive(child)) return;
  if (IS_WINDOWS) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

async function shutdown(children) {
  for (const child of children) terminate(child);
  const deadline = Date.now() + 5000;
  for (const child of children) {
    while (childAlive(child) && Date.now() < deadline) await sleep(100);
    if (!childAlive(child)) continue;
    try {
      child.kill("SIGKILL");
    } catch {
      /* 进程已退出 */
    }
  }
}

async function main() {
  const arguments_ = process.argv.slice(2);

  if (arguments_.includes(PREPARE_FLAG)) {
    console.log(`Python 环境就绪：${ensureVenv()}`);
    return 0;
  }

  const options = parseOptions(arguments_);
  await ensurePortsAvailable({ frontend: !options.backendOnly, debug: options.debug });
  const python = ensureVenv();
  if (options.debug) ensureDebugpy(python);
  ensureFrontendBuild();

  const licenseOverrides = ensureLicenseKeys(python);
  loadDotenv();

  // 子进程环境：剔除 PYTHONHOME 与代理，避免宿主环境干扰后端 / HA 连接。
  const baseEnvironment = { ...process.env };
  delete baseEnvironment.PYTHONHOME;
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "SOCKS_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "socks_proxy",
    "NO_PROXY",
    "no_proxy",
  ]) {
    delete baseEnvironment[key];
  }

  const appEnvironment = {
    ...baseEnvironment,
    APP_DATA_DIR: path.join(HOMEOS_3D, "data"),
    HOMEOS_FRONTEND_DIR: APP_FRONTEND,
    PYTHONPATH: HOMEOS_3D,
    ...licenseOverrides,
  };

  const storeEnvironment = {
    ...baseEnvironment,
    STORE_DATA_DIR: path.join(HOMEOS_STORE, "data"),
    STORE_LICENSE_KEYS_DIR: path.join(HOMEOS_STORE, "keys", "local"),
    STORE_HOST: options.host,
    STORE_PORT,
    PYTHONPATH: STORE_BACKEND,
    STORE_RELOAD: process.env.STORE_RELOAD ?? "1",
    STORE_MAIL_MODE: process.env.STORE_MAIL_MODE ?? "log",
  };

  const baseStoreCommand = [python, "-m", "src.run"];
  const baseAppCommand = [
    python,
    "-m",
    "uvicorn",
    "backend.src.main:app",
    "--host",
    options.host,
    "--port",
    APP_PORT,
    "--reload",
    "--reload-dir",
    APP_SOURCE,
    // 开发期日志降噪：丢掉重载器的「检测到改动，正在重载」提示。
    // 它走 uvicorn.error 且级别就是 WARNING，`--log-level` 压不掉（除非连带把
    // uvicorn.access 设成 ERROR、一起丢掉请求日志与启动信息），所以改用一份只过滤
    // 这一条的 log config。商店侧等价逻辑在 backend/src/run.py 里就地安装。
    "--log-config",
    path.join(HERE, "dev_logging.json"),
  ];
  // 调试前缀顶替基础命令的 `python -m` 头（slice(2)），变成
  // `python -m debugpy --listen PORT -m <module> ...`，后面的模块参数原样保留。
  const withDebugger = (command, debugPort) =>
    options.debug ? [...debugpyPrefix(python, debugPort), ...command.slice(2)] : command;
  const storeCommand = withDebugger(baseStoreCommand, DEBUG_STORE_PORT);
  const appCommand = withDebugger(baseAppCommand, DEBUG_APP_PORT);

  console.log(`HomeOS 本地启动（${options.debug ? "debug" : options.backendOnly ? "backend-only" : "dev"}）`);

  const children = [
    spawnChild(storeCommand, storeEnvironment, HOMEOS_STORE),
    spawnChild(appCommand, appEnvironment, HOMEOS_3D),
  ];

  if (!options.backendOnly) {
    const frontendEnvironment = { ...baseEnvironment };
    children.push(
      spawnChild(viteDevCommand("frontend/vite.config.ts", options.host), frontendEnvironment, HOMEOS_3D),
      spawnChild(viteDevCommand("frontend/vite.config.ts", options.host), frontendEnvironment, HOMEOS_STORE),
    );
  }

  let exitCode = 0;
  try {
    let interrupted = false;
    const onSignal = () => {
      interrupted = true;
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    if (!options.backendOnly) {
      console.log(`前端 HMR  主应用   http://${HOST}:${VITE_3D_PORT}/`);
      console.log(`          授权商店 http://${HOST}:${VITE_STORE_PORT}/`);
    }
    console.log(`后端 API  主应用   http://${HOST}:${APP_PORT}/setup`);
    console.log(`          授权商店 http://${HOST}:${STORE_PORT}/`);
    if (options.debug) {
      console.log(`调试器    主应用   ${DEBUG_APP_PORT}（IDE attach，热重载保留）`);
      console.log(`          授权商店 ${DEBUG_STORE_PORT}（IDE attach，热重载保留）`);
    }
    if (!options.backendOnly) {
      console.log("改页面走 HMR 地址。改 runtime 另开：bun run --cwd homeos-3d dev:runtime");
    }
    if (!LOOPBACK_BIND_HOSTS.has(options.host)) {
      const lanAddress = primaryLanAddress();
      console.log("");
      console.log(`已绑定 ${options.host}，同网段设备用下面的地址访问（Host 与 Origin 会随之校验，无需额外配置）：`);
      if (lanAddress) {
        if (!options.backendOnly) {
          console.log(`局域网 HMR  主应用   http://${lanAddress}:${VITE_3D_PORT}/`);
          console.log(`            授权商店 http://${lanAddress}:${VITE_STORE_PORT}/`);
        }
        console.log(`局域网 API  主应用   http://${lanAddress}:${APP_PORT}/`);
        console.log(`            授权商店 http://${lanAddress}:${STORE_PORT}/`);
      } else {
        const ports = options.backendOnly
          ? `${APP_PORT}/${STORE_PORT}`
          : `${APP_PORT}/${STORE_PORT}/${VITE_3D_PORT}/${VITE_STORE_PORT}`;
        console.log(`  （没探到局域网地址，请自行查看本机 IP；端口 ${ports}）`);
      }
      console.log("  支付渠道需要真实凭据（支付宝沙箱见 homeos-store/backend/src/README.md）；未配置时下单会 503。");
    }

    for (const child of children) {
      child.on("exit", (code, signal) => {
        if (signal) return;
        if (typeof code === "number" && code !== 0) exitCode = code;
      });
    }

    while (!interrupted && children.every(childAlive)) {
      await sleep(400);
    }
    return exitCode;
  } finally {
    // 无论正常退出、Ctrl-C 还是中途抛错（例如探测网卡失败），都不能留下孤儿后端。
    await shutdown(children);
  }
}

main().then(
  (code) => process.exit(code ?? 0),
  (error) => {
    console.error(`⚠ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  },
);
