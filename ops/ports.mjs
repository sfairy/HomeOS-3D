/**
 * 开发/源码态端口唯一真源（`ops/dev.mjs` 与各 vite / 启动器 / compose 共用一份）。
 *
 * 为什么要有这个文件：同一组端口此前散在四处各写一遍 —— 启动器（`ops/dev.mjs`）、
 * 两个 vite 配置（HMR 端口 + 后端代理目标）、运行镜像里的 Python 启动器
 * （`ops/docker/start_app.py` / `start_store.py` / `proxy.py`）、以及 compose / deploy 里的
 * `${VAR:-默认值}`。改一处漏一处只会在本机「前端连不上后端」或部署后「反代指向空气」时才暴露。
 *
 * 表里每个端口都标了**归属**：
 * - `dev`   —— 源码态（`bun run dev`）用，宿主回环；
 * - `proxy` —— 镜像内置 Caddy 反代监听，容器内固定，宿主发布端口由 compose 变量覆盖；
 * - `debug` —— 仅 `--debug` 时给 IDE attach。
 *
 * 容器内固定端口（8801/8802 与反代 8803/8804）与 compose 的默认值必须与下表一致。
 */

/** 端口表：键为语义名，值为 `{ port, bind, project, role }`。 */
export const PORTS = {
  /** 主应用 API（uvicorn），源码态与容器内一致。 */
  appApi: { port: 8801, project: 'homeos', role: 'dev', description: '主应用 API' },
  /** 授权商店 API，源码态与容器内一致。 */
  storeApi: { port: 8802, project: 'homeos-store', role: 'dev', description: '授权商店 API' },
  /** 主应用镜像内置反代（Caddy → 127.0.0.1:8801）。 */
  appProxy: { port: 8803, project: 'homeos', role: 'proxy', description: '主应用内置反代' },
  /** 商店镜像内置反代（Caddy → 127.0.0.1:8802）。 */
  storeProxy: { port: 8804, project: 'homeos-store', role: 'proxy', description: '授权商店内置反代' },
  /** 源码态主应用 Vite（HMR）。 */
  viteApp: { port: 8805, project: 'homeos', role: 'dev', description: '主应用 Vite' },
  /** 源码态商店 Vite（HMR）。 */
  viteStore: { port: 8806, project: 'homeos-store', role: 'dev', description: '授权商店 Vite' },
  /** 调试器端口（仅 `--debug`；与 uvicorn 端口错开，IDE attach 用）。 */
  debugApp: { port: 8811, project: 'homeos', role: 'debug', description: '主应用调试器' },
  debugStore: { port: 8812, project: 'homeos-store', role: 'debug', description: '授权商店调试器' },
};

/** 取端口号（写 `PORTS.appApi.port` 太啰嗦时用）。 */
export function port(name) {
  const entry = PORTS[name];
  if (!entry) throw new Error(`未登记的端口名：${name}`);
  return entry.port;
}

/** 按**键名**列出 `[端口, 说明]`（启动器要的三组清单，刻意显式而非按描述文本筛）。 */
export function portListOf(names) {
  return names
    .map((name) => {
      const entry = PORTS[name];
      if (!entry) throw new Error(`未登记的端口名：${name}`);
      return [String(entry.port), entry.description];
    })
    .sort((a, b) => Number(a[0]) - Number(b[0]));
}

/** 启动器预检/打印用的三组清单（缺一个都要显式改这里，而不是靠描述文本匹配）。 */
export const BACKEND_PORT_LIST = portListOf(['appApi', 'storeApi']);
export const FRONTEND_PORT_LIST = portListOf(['viteApp', 'viteStore']);
export const DEBUG_PORT_LIST = portListOf(['debugApp', 'debugStore']);

/**
 * 轮询等待某端口进入监听态。
 *
 * 为什么不用固定 `sleep(N)`：服务真正就绪的时间取决于依赖安装、迁移、reload 守护启动，
 * 固定时长只能「猜」——猜短了后续步骤偶发失败（且难复现），猜长了每次启动都白等。
 * 这里改成 100ms 步进的探测 + 超时兜底，超时返回 `false` 由调用方决定报错还是降级。
 *
 * @param {number} portNumber
 * @param {{ timeoutMs?: number, intervalMs?: number, host?: string, shouldStop?: () => boolean }} [options]
 *   `shouldStop` 返回真时立即放弃（用于 Ctrl-C 中途退出，不必把超时等满）。
 * @returns {Promise<boolean>} 超时前进入监听态返回 `true`
 */
export async function waitForPort(portNumber, options = {}) {
  const { timeoutMs = 15_000, intervalMs = 100, host = '127.0.0.1', shouldStop } = options;
  const net = await import('node:net');
  const deadline = Date.now() + timeoutMs;
  const probe = () =>
    new Promise((resolve) => {
      const socket = net.connect({ host, port: Number(portNumber) });
      const finish = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(Math.max(intervalMs, 200));
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });

  for (;;) {
    if (await probe()) return true;
    if (shouldStop?.()) return false;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
