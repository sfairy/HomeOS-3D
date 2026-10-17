/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";
// 与主应用共用的构建助手（经典 IIFE 打包、静音日志、SPA 外壳断言）见 ops/vite/build-helpers.ts。
import {
  SPA_ENTRY,
  assertSpaShellPresent,
  bundleClassicIife,
  quietLogger,
} from "../../ops/vite/build-helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storeRoot = __dirname;
const projectRoot = path.resolve(storeRoot, "..");
//: 工作区根：构建产物统一收敛到 <repoRoot>/dist/homeos-store/，与源码树彻底分离。
const repoRoot = path.resolve(projectRoot, "..");
const frontendOutDir = path.join(repoRoot, "dist", "homeos-store", "frontend");
//: 商店走 StaticFiles 把 `/store-static` 挂到 `frontend/static`。
//: Vite 的 base 会拼在产物文件名之前，所以构建产物必须直接落在挂载根这一层：
//: `base: "/store-static/"` + `assets/...` => `/store-static/assets/...`。
//: 否则 `import()` 的 chunk 能用（相对入口解析），但 `__vite__mapDeps` 生成的
//: modulepreload 提示会落在 `/static/assets/...`，撞上 SPA catch-all 拿到 HTML。
const buildOutDir = path.join(frontendOutDir, "static");

//: 构建走挂载前缀；dev 仍在根路径提供（8806 下 `/store-static` 被代理给后端）。
const BUILD_BASE = "/store-static/";
const DEV_BASE = "/";

function htmlInputs(): Record<string, string> {
  const full = path.join(storeRoot, SPA_ENTRY);
  return fs.existsSync(full) ? { index: full } : {};
}

const storeSrc = path.join(storeRoot, "src");

//: 单个构建内已占用的 chunk 名，buildStart 清空。
const usedChunkNames = new Set<string>();

/** 共享 chunk 输出名：优先取源文件相对 ``src`` 的路径。
 *
 * 商店存在同名不同源的模块（``features/admin/views/ProductsView.vue`` 与
 * ``features/storefront/views/ProductsView.vue``），以及 Vite 会自加后缀去重的 ``useApi``，
 * 只取 basename 时产物会退化成 ``ProductsView-<hash>.js`` 两份、
 * ``useApi-<hash>-<hash>.js`` 双哈希。带路径后成为 ``features/admin/views/ProductsView-<hash>.js``
 * 与 ``features/storefront/views/ProductsView-<hash>.js``，名与源一一对应。
 */
function chunkBaseName(chunk: {
  name?: string;
  facadeModuleId?: string | null;
  moduleIds?: string[];
}): string {
  const candidates = [chunk.facadeModuleId || "", ...(chunk.moduleIds || [])];
  for (const raw of candidates) {
    if (!raw) continue;
    const id = raw.split("?")[0];
    const rel = path
      .relative(storeSrc, id)
      .replace(/\\/g, "/")
      .replace(/\.(ts|vue|js|mjs)$/i, "");
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel;
  }
  //: 兜底 chunk（无 facade、来源在 node_modules/virtual）Vite 会把「去重哈希」直接写进 name
  //: （例：``useApi-CUWMwLLw``），此时再拼 ``-[hash]`` 就成了双哈希。剥掉这层后缀，
  //: 由输出模板统一补唯一哈希。
  const raw = (chunk.name || "chunk").replace(/[\\/]/g, "-");
  return raw.replace(/-[A-Za-z0-9_-]{8}$/, "") || raw;
}

function uniqueChunkBaseName(chunk: {
  name?: string;
  facadeModuleId?: string | null;
  moduleIds?: string[];
}): string {
  const base = chunkBaseName(chunk);
  if (!usedChunkNames.has(base)) {
    usedChunkNames.add(base);
    return base;
  }
  let index = 2;
  while (usedChunkNames.has(`${base}-${index}`)) index += 1;
  const name = `${base}-${index}`;
  usedChunkNames.add(name);
  return name;
}

function classicIifePlugin(): Plugin {
  return {
    name: "homeos-store-classic-iife",
    buildStart() {
      // 每轮构建重置 chunk 名占用，避免 watch 重建沿上一轮。
      usedChunkNames.clear();
    },
    async closeBundle() {
      //: 构建产物根就是挂载根，auth-bootstrap.js 直接落在这里（/store-static/auth-bootstrap.js）。
      await bundleClassicIife({
        entry: path.join(storeRoot, "src/auth-bootstrap.ts"),
        outfile: path.join(buildOutDir, "auth-bootstrap.js"),
      });
    },
  };
}

/** 把 Vite 产出的 SPA 外壳收敛到挂载根之外（``frontend/index.html``）。
 *
 * 与主应用 ``dist/homeos/frontend/index.html`` 布局一致：静态挂载根是 ``frontend/static``，
 * 外壳必须留在挂载根之外，否则会作为 ``/store-static/index.html`` 被一并伺服。
 */
function placeShellPlugin(): Plugin {
  return {
    name: "homeos-store-place-shell",
    closeBundle() {
      // 外壳缺失 = 产物不完整（空目录 / 被中途清空），交给共用助手报出 outDir 实际内容。
      assertSpaShellPresent(
        buildOutDir,
        "商店构建没有产出外壳：通常是 htmlInputs() 没找到 frontend/index.html。",
      );
      const from = path.join(buildOutDir, SPA_ENTRY);
      fs.mkdirSync(frontendOutDir, { recursive: true });
      //: base 已经是挂载前缀，产物里的资源引用无需再改写，直接搬走即可。
      fs.copyFileSync(from, path.join(frontendOutDir, SPA_ENTRY));
      fs.unlinkSync(from);
      const nested = path.join(buildOutDir, "pages");
      if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true, force: true });
    },
  };
}

/* ------------------------------------------------------------------ *
 * 开发代理：后端启动竞态降噪
 * ------------------------------------------------------------------ */

/** 开发代理 / WebSocket 断连时的可忽略错误码（后端重启、刷新、启动竞态均属正常）。 */
const BENIGN_PROXY_ERROR_CODES = new Set(["ECONNABORTED", "ECONNRESET", "ECONNREFUSED"]);

function isBenignProxyError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return !!code && BENIGN_PROXY_ERROR_CODES.has(code);
}

/** 良性代理失败节流日志：启动竞态时最多每 15s 打一条，避免刷屏。 */
let lastBenignProxyLogAt = 0;
function logBenignProxyOnce(err: unknown): void {
  const now = Date.now();
  if (now - lastBenignProxyLogAt < 15_000) return;
  lastBenignProxyLogAt = now;
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  console.warn(`[vite] 授权商店后端暂未就绪，请稍后刷新${code ? `（${code}）` : ""}`);
}

/** 后端未就绪时回 503 JSON，避免浏览器看到含糊的 502。 */
function respondBackendUnavailable(res: unknown): void {
  const r = res as {
    headersSent?: boolean;
    writableEnded?: boolean;
    writeHead?: (code: number, headers: Record<string, string>) => void;
    end?: (body: string) => void;
  } | null;
  if (!r || r.headersSent || r.writableEnded) return;
  if (typeof r.writeHead !== "function" || typeof r.end !== "function") return;
  try {
    r.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    r.end(
      JSON.stringify({
        statusCode: 503,
        message: "授权商店后端暂未就绪，请先运行 bun run dev:backend，稍后刷新",
      }),
    );
  } catch {
    /* 响应可能已关闭 */
  }
}

/** 各代理入口共享：良性断连不刷屏，并给出可读的 503（Vite 自带的 502 仅在响应未结束时才写）。 */
const proxyErrorHandling = {
  configure: (proxy: any) => {
    proxy.on("error", (err: any, _req: unknown, res: unknown) => {
      if (isBenignProxyError(err)) {
        logBenignProxyOnce(err);
        respondBackendUnavailable(res);
        return;
      }
      console.warn("[vite proxy error]", err?.message || err);
      respondBackendUnavailable(res);
    });
    proxy.on("proxyReqWs", (_proxyReq: unknown, _req: unknown, socket: NodeJS.EventEmitter) => {
      socket.on("error", (err: NodeJS.ErrnoException) => {
        if (isBenignProxyError(err)) return;
        console.warn("[vite ws proxy socket error]", err?.message || err);
      });
    });
  },
};

//: Vite 自带的代理错误处理器始终经 `logger.error` 打印，故良性断连必须在这一层过滤掉。
const baseLogger = quietLogger();
const customLogger: typeof baseLogger = {
  ...baseLogger,
  error(msg, options) {
    const text = String(msg);
    const err = (options as { error?: unknown } | undefined)?.error;
    const benignProxy =
      (text.includes("http proxy error") ||
        text.includes("ws proxy error") ||
        text.includes("ws proxy socket error")) &&
      (isBenignProxyError(err) || /ECONNREFUSED|ECONNRESET|ECONNABORTED/.test(text));
    if (benignProxy) {
      logBenignProxyOnce(err ?? text);
      return;
    }
    baseLogger.error(msg, options);
  },
};

export default defineConfig(({ command }) => {
  const isBuild = command === "build";
  return {
    root: storeRoot,
    base: isBuild ? BUILD_BASE : DEV_BASE,
    // 依赖预打包缓存统一落在工作区根 node_modules/.vite/homeos-store，避免项目内再长出 node_modules。
    cacheDir: path.join(repoRoot, "node_modules", ".vite", "homeos-store"),
    //: 代理错误处理见 proxyErrorHandling：良性断连节流并在 logger 层过滤，避免启动竞态刷屏。
    customLogger,
    // 构建时 outDir 就是挂载根：public 的 `static/` 子层要剥掉，否则会多出一层 static。
    publicDir: isBuild ? path.join(storeRoot, "public", "static") : path.join(storeRoot, "public"),
    resolve: {
      alias: {
        "@store": path.join(storeRoot, "src"),
        //: 共享包（<repoRoot>/packages/shared）**刻意不加 alias**：本店只从它的子路径
        //: （`@homeos/shared/components/*.vue` / `.../scene/*` / `.../utils/*`）取件，而 Vite 的
        //: 字符串 alias 是前缀匹配 —— 加一条 `"@homeos/shared": <abs>/src/index.ts` 会把子路径
        //: 也吞掉，构建静默不落盘（只在 closeBundle 报「SPA 入口缺失」）。子路径走包自己的
        //: `exports`，经工作区软链直指源码，不需要先 build 共享包。
      },
    },
    server: {
      //: 共享包在 frontend/ 之外：dev 需要显式放行，否则 /@fs/ 取共享源码直接被拒。
      fs: {
        allow: [path.join(repoRoot, "packages", "shared"), projectRoot],
      },
      //: 不写 host 时 Vite 默认 `localhost`，macOS 上会解析成 ::1 只绑 IPv6：
      //: 于是 dev.mjs 打印的 http://127.0.0.1:8806 连不上、ops/ports.mjs 的 IPv4 就绪探测
      //: 也永远超时（误报「20 秒内未进入监听态」）。显式绑回环 IPv4；`bun run dev --lan`
      //: 由 dev.mjs 传 `--host 0.0.0.0` 覆盖，不受影响。
      host: "127.0.0.1",
      port: 8806,
      strictPort: true,
      proxy: {
        "/store/v1": { target: "http://127.0.0.1:8802", changeOrigin: true, ...proxyErrorHandling },
        "/store-admin/v1": { target: "http://127.0.0.1:8802", changeOrigin: true, ...proxyErrorHandling },
        "/store-appearance.css": { target: "http://127.0.0.1:8802", changeOrigin: true, ...proxyErrorHandling },
        "/v2": { target: "http://127.0.0.1:8802", changeOrigin: true, ...proxyErrorHandling },
        "/store-static": { target: "http://127.0.0.1:8802", changeOrigin: true, ...proxyErrorHandling },
        "/healthz": { target: "http://127.0.0.1:8802", changeOrigin: true, ...proxyErrorHandling },
        "/fonts": { target: "http://127.0.0.1:8802", changeOrigin: true, ...proxyErrorHandling },
      },
    },
    build: {
      outDir: buildOutDir,
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        input: htmlInputs(),
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: (chunk) => `assets/${uniqueChunkBaseName(chunk)}-[hash].js`,
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    // 模板里的资源一律写运行时绝对路径（/store-static/...），不参与打包解析。
    plugins: [vue({ template: { transformAssetUrls: false } }), placeShellPlugin(), classicIifePlugin()],
  };
});
