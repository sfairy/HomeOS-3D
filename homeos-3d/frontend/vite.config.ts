/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuildBuild } from "esbuild";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";
import { quietLogger } from "./vite-quiet-logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = __dirname;
const projectRoot = path.resolve(frontendRoot, "..");
//: 工作区根：构建产物统一收敛到 <repoRoot>/dist/homeos-3d/，与源码树彻底分离。
const repoRoot = path.resolve(projectRoot, "..");
const outDir = path.join(repoRoot, "dist", "homeos-3d", "frontend");

/** SPA 唯一入口。 */
const SPA_ENTRY = "index.html";

/** 仅用于构建时清理陈旧产物的 HTML 名，不再参与输入。 */
const LEGACY_HTML_NAMES = [
  "3d-studio.html",
  "display.html",
  "login.html",
  "setup.html",
  "pair.html",
  "license.html",
  "license-recovery.html",
];

function htmlInputs(): Record<string, string> {
  const full = path.join(frontendRoot, SPA_ENTRY);
  return fs.existsSync(full) ? { index: full } : {};
}

/**
 * 零依赖经典 IIFE 入口（不能打成 ESM）。
 * 这些脚本在 HTML 里以不带 type="module" 的 <script> 加载，或作为 Worker 以字面量
 * URL 加载，因此必须输出到固定路径、且文件名可预测。
 */
const classicEntries: Record<string, string> = {
  "logging/client-log": path.join(frontendRoot, "src/app/logging/client-log.ts"),
  "display/display-boot": path.join(frontendRoot, "src/app/display/display-boot.ts"),
  "display/display-startup": path.join(frontendRoot, "src/app/display/display-startup.ts"),
  "auth/pairing-entry": path.join(frontendRoot, "src/app/auth/pairing-entry.ts"),
  "auth/scene/scene-depth": path.join(frontendRoot, "src/app/auth/scene/scene-depth.ts"),
  // 后端 EmbedSessionMiddleware 把所有 /embed/<token>/ 页面里以不带 type="module" 的
  // <script src="{root}/static/embed-runtime.js"> 注入 <head>（见 backend/src/embedding.py），
  // 因此它必须固定输出到 /static/embed-runtime.js，不能进 assets/ 带哈希目录。
  "embed-runtime": path.join(frontendRoot, "src/app/embed/embed-runtime.ts"),
  // studio-app 以字面量 URL 经 new Worker 加载（见 src/app/3d-studio/studio/studio-app.ts）。
  "3d-studio/export/draco-decoder-worker": path.join(
    frontendRoot,
    "src/app/3d-studio/export/draco-decoder-worker.ts"
  ),
};

// three 锁定 0.186.0，与随包分发的 static/vendor/three/0.186.0 保持一致。
const THREE_VENDOR = "/static/vendor/three/0.186.0/three.module.min.js";

function isRuntimeExternal(id: string): boolean {
  return (
    id === "three" ||
    id === THREE_VENDOR ||
    id.startsWith("/api/") ||
    id.startsWith("/static/vendor/") ||
    id.includes("/api/v1/modules/interaction3d/")
  );
}

function vendorResolvePlugin(): Plugin {
  return {
    name: "homeos-vendor-resolve",
    resolveId(id) {
      if (id === "three") return { id: THREE_VENDOR, external: true };
      if (id.startsWith("/static/vendor/")) return { id, external: true };
      return null;
    },
  };
}

/**
 * dev server 专用：`/api/**` 是后端下发的运行时资源（3D 交互模块的 runtime.js /
 * config-editor.js 等），不是本地文件。
 *
 * 构建侧由 `build.rollupOptions.external` / `worker.rollupOptions.external` 的
 * `isRuntimeExternal` 处理，但这两个选项 dev 不读，于是 vite 的 import-analysis 会把
 * `/api/v1/modules/interaction3d/...` 当成待解析的本地模块，报
 * 「Failed to resolve import ... Does the file exist?」。
 *
 * 这里在 dev 里把同样的前缀标成 external，URL 原样保留，再由下面的 server.proxy
 * 转发给 8801 的后端。构建行为保持不变（只在 serve 生效）。
 */
function runtimeUrlExternalPlugin(): Plugin {
  return {
    name: "homeos-runtime-url-external",
    apply: "serve",
    resolveId(id) {
      if (id.startsWith("/api/")) return { id, external: true };
      return null;
    },
  };
}

/**
 * dev server 专用：把 `/static/vendor/**` 登记为静态资产（构建期不受影响）。
 *
 * 这些文件的实体在 `public/` 里（构建时原样拷进 dist），但源码是以根绝对 URL 把它
 * 当「运行时资源」import 的，并不是要打进 bundle 的模块。问题在于
 * `vite:import-analysis` 会在**所有插件的 resolveId 之前**先做一次 checkPublicFile
 * 判定，命中就抛「Cannot import non-asset file … which is inside /public」，于是
 * `vendorResolvePlugin` 里的 external 分支根本没机会执行 —— 表现为 dev 下 three、
 * qrcode 等模块整片 500（不在 public/ 的 meshoptimizer 则正常）。
 *
 * 走 `config` 钩子而不是顶层写死 `assetsInclude`，是为了配合 `apply: "serve"` 只在
 * dev 生效：构建期这些 id 由 `isRuntimeExternal` 外置，行为一字不变。
 */
function runtimeVendorAssetPlugin(): Plugin {
  return {
    name: "homeos-runtime-vendor-assets",
    apply: "serve",
    config() {
      return { assetsInclude: [/^\/static\/vendor\//] };
    },
  };
}

function classicIifePlugin(): Plugin {
  return {
    name: "homeos-classic-iife",
    async closeBundle() {
      for (const [name, entry] of Object.entries(classicEntries)) {
        if (!fs.existsSync(entry)) continue;
        const outfile = path.join(outDir, "static", `${name}.js`);
        fs.mkdirSync(path.dirname(outfile), { recursive: true });
        await esbuildBuild({
          entryPoints: [entry],
          outfile,
          bundle: true,
          format: "iife",
          platform: "browser",
          target: "es2022",
          minify: true,
          logLevel: "silent",
        });
      }
    },
  };
}

/**
 * 只清理主应用自己拥有的产物，保留 `dist/modules/`。
 *
 * `dist/` 是主应用与 runtime 两次构建共用的目录：
 *   - 主应用：`vite.config.ts` → `dist/static/**`、`dist/index.html`、`dist/public-static.json`
 *   - runtime：`vite.runtime.config.ts` → `dist/modules/runtime/**`（后端按 manifest.json 下发）
 *
 * 而 runtime 的 outDir 嵌套在主应用 outDir 之内。若沿用 Vite 默认的
 * `emptyOutDir: true`，主应用每次构建都会把整个 `dist/` 清空，连带删掉
 * `dist/modules/runtime` —— 后端清单读不到就不再放行任何模块，浏览器里表现为
 * `/api/v1/modules/interaction3d/core/runtime.js` 等整条 import 链 404。
 * 所以把 `emptyOutDir` 关掉，改由本插件在构建最早期只删主应用产物；
 * `dist/modules` 交给 runtime 自己的构建清理。
 *
 * 注意不能用 `buildStart`/`closeBundle`：publicDir 拷贝也发生在构建早期，
 * 放在 `buildStart` 之后会把刚拷贝进 `dist/static` 的公共资源再删一遍。
 * `configResolved` 早于所有构建钩子，顺序才安全。
 */
function cleanAppOutputPlugin(): Plugin {
  return {
    name: "homeos-clean-app-output",
    apply: "build",
    configResolved(config) {
      if (config.command !== "build") return;
      for (const name of [
        "static",
        "pages",
        "public-static.json",
        SPA_ENTRY,
        ...LEGACY_HTML_NAMES,
      ]) {
        // macOS 上并发写入（同时开着的 dev server / 上一次构建）会让递归删除偶发
        // ENOTEMPTY，所以带重试；不重试的话一次抖动就整条构建失败。
        fs.rmSync(path.join(outDir, name), {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 50,
        });
      }
    },
  };
}

function publicStaticManifestPlugin(): Plugin {
  // 生成 /static 匿名白名单（dist/public-static.json）。
  //
  // 必须排在所有产物写入插件之后：它要按「产物是否真的存在」筛种子条目，
  // 而 classicIifePlugin 的 closeBundle 在它之前写入 /static/logging/client-log.js
  // 这类 IIFE 包。曾经把它挂在 flatten 插件里，结果筛的时候 IIFE 还没落盘，
  // 白名单被误删条目 —— 未登录页的 client-log.js 直接 403。closeBundle 按插件
  // 数组顺序串行执行，所以本插件必须放在数组最后一位。
  return {
    name: "homeos-public-static-manifest",
    closeBundle() {
      updatePublicStaticManifest();
    },
  };
}

function updatePublicStaticManifest() {
  const seedPath = path.join(frontendRoot, "public-static.seed.json");
  const manifestPath = path.join(outDir, "public-static.json");
  let payload: {
    _comment?: unknown;
    files: Array<string | { path: string; why?: string }>;
    alwaysRevalidate?: Array<string | { path: string; why?: string }>;
  };
  const seed = fs.existsSync(seedPath) ? seedPath : manifestPath;
  if (!fs.existsSync(seed)) return;
  try {
    payload = JSON.parse(fs.readFileSync(seed, "utf8"));
  } catch {
    return;
  }
  const discovered = new Set<string>();
  // SPA 入口是匿名路由唯一会下发的 HTML：它引用的 `/static/**`（入口 chunk、其
  // modulepreload 依赖、外壳样式、经典启动脚本）就是未登录也必须可加载的全集。
  // 认证后视图是懒加载 chunk，不出现在这里，因此继续受 premium_asset 保护。
  const htmlPath = path.join(outDir, SPA_ENTRY);
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, "utf8");
    for (const match of html.matchAll(/(?:src|href)=["'](\/static\/[^"']+)["']/g)) {
      discovered.add(match[1].replace(/\?v=[^"']+$/i, ""));
    }
  }
  for (const stable of [
    "/static/logging/client-log.js",
    "/static/display/display-boot.js",
    "/static/display/display-startup.js",
    "/static/auth/pairing-entry.js",
    "/static/auth/scene/scene-depth.js",
    // 认证页样式表由 App.vue 在运行时插入 <head>，不在 SPA 入口里，需显式登记。
    "/static/auth/scene/fonts.css",
    "/static/auth/scene/page.css",
    "/static/auth/scene/scene.css",
    "/static/auth/scene/panel.css",
    "/static/appearance.css",
  ]) {
    discovered.add(stable);
  }
  const kept: Array<{ path: string; why: string }> = [];
  const seen = new Set<string>();
  const pruned: string[] = [];
  for (const item of payload.files || []) {
    const p = typeof item === "string" ? item : item.path;
    if (!p?.startsWith("/static/")) continue;
    if (seen.has(p)) continue;
    // 种子清单记的是逻辑路径，入口产物打包后会带内容哈希（如
    // /static/assets/index-<hash>.js）或按域归到子目录，因此这里按产物实际
    // 存在与否筛一遍，只保留真正落盘的路径。
    // 不筛的代价是有害的：清单里留着不存在的条目，G6 对账就再也发现不了
    // 「新增公开页资源忘了登记」——因为噪声条目让门禁永远不干净。
    if (!fs.existsSync(path.join(outDir, p.replace(/^\//, "")))) {
      pruned.push(p);
      seen.add(p);
      continue;
    }
    seen.add(p);
    kept.push({
      path: p,
      why: typeof item === "object" && item.why ? item.why : "",
    });
  }
  for (const p of [...discovered].sort()) {
    if (seen.has(p)) continue;
    seen.add(p);
    kept.push({
      path: p,
      why: "SPA 入口引用的匿名静态资源，必须匿名可加载。",
    });
  }
  payload.files = kept;
  // 记录被筛掉的种子条目，方便核对「是不是真有资源漏了」而不是被静默吞掉。
  (payload as Record<string, unknown>)._prunedStaleSeed = pruned.sort();
  if (pruned.length > 0) {
    // 正常构建不应筛掉任何条目。一旦出现（尤其是 /static/logging/client-log.js
    // 这类确定会产出的路径），说明本插件被排到了产物写入插件之前 ——
    // 白名单会少条目、未登录页白屏，所以必须出声。
    console.warn(`[homeos] 匿名白名单筛掉 ${pruned.length} 条不存在的种子条目：\n  ${pruned.join("\n  ")}`);
  }
  const revalidate = new Set<string>();
  for (const p of discovered) {
    if (p.endsWith(".js") || p.endsWith(".css")) revalidate.add(p);
  }
  payload.alwaysRevalidate = [...revalidate].sort().map((p) => ({
    path: p,
    why: "入口页构建产物，内容变化即换 URL/必须回源。",
  }));
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

export default defineConfig({
  root: frontendRoot,
  base: "/",
  // 依赖预打包缓存统一落在工作区根 node_modules/.vite/homeos-3d。
  // 不显式指定的话，Vite 按最近的 package.json 落到 <项目>/node_modules/.vite，
  // 会把「已合并到根」的项目内 node_modules 又长出来（见根 bunfig.toml 的 hoisted 说明）。
  cacheDir: path.join(repoRoot, "node_modules", ".vite", "homeos-3d"),
  customLogger: quietLogger(),
  publicDir: path.join(frontendRoot, "public"),
  resolve: {
    alias: {
      "@app": path.join(frontendRoot, "src/app"),
      "@runtime": path.join(frontendRoot, "src/runtime"),
      three: THREE_VENDOR,
    },
  },
  server: {
    port: 8805,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8801", changeOrigin: true },
      "/static": { target: "http://127.0.0.1:8801", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8801", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:8801", ws: true },
    },
  },
  build: {
    outDir,
    // 不能清空整个 outDir：dist/modules/runtime 是 runtime 构建的产物，
    // 见 cleanAppOutputPlugin 的说明。主应用产物由该插件按名删除。
    emptyOutDir: false,
    sourcemap: false,
    cssCodeSplit: true,
    // 3D 工作室 / 主编辑器入口体量大，属预期；避免每次构建刷 500kB 警告。
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: htmlInputs(),
      external: isRuntimeExternal,
      output: {
        entryFileNames: "static/assets/[name]-[hash].js",
        chunkFileNames: "static/assets/[name]-[hash].js",
        assetFileNames: "static/assets/[name]-[hash][extname]",
        paths: (id) => id,
      },
    },
  },
  // Worker 子构建是独立的 rollup 调用，不会继承 build.rollupOptions.external：
  // 必须显式再声明一次，否则 `/static/vendor/**` 会被 tsconfig paths 的编译期 shim 接走
  // （shim 只有 declare，没有运行时出口，直接构建失败）。
  worker: {
    format: "es",
    rollupOptions: {
      external: isRuntimeExternal,
      output: {
        // Worker 也要落在 /static/ 下：后端只对 /static/** 放行匿名加载。
        entryFileNames: "static/assets/[name]-[hash].js",
        chunkFileNames: "static/assets/[name]-[hash].js",
        assetFileNames: "static/assets/[name]-[hash][extname]",
      },
    },
  },
  plugins: [
    cleanAppOutputPlugin(),
    vendorResolvePlugin(),
    runtimeUrlExternalPlugin(),
    runtimeVendorAssetPlugin(),
    classicIifePlugin(),
    // 最后一位：closeBundle 按数组顺序串行，清单必须在所有产物写完后才生成。
    publicStaticManifestPlugin(),
    // Vue SFC：关闭资源 URL 改写 —— 模板里的 /static/** 是运行时绝对路径，不是待打包模块。
    vue({ template: { transformAssetUrls: false } }),
  ],
});
