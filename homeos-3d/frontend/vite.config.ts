/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuildBuild } from "esbuild";
import { defineConfig, type Plugin } from "vite";
import { quietLogger } from "./vite-quiet-logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = __dirname;
const projectRoot = path.resolve(frontendRoot, "..");
const pagesDir = path.join(frontendRoot, "pages");
const outDir = path.join(projectRoot, "dist");

const htmlPages = [
  "index.html",
  "3d-studio.html",
  "display.html",
  "login.html",
  "setup.html",
  "pair.html",
  "license.html",
  "license-recovery.html",
];

/** 未登录 / 未激活时也必须能匿名加载的公开页（用于推导必须走匿名白名单的构建产物）。 */
const PUBLIC_HTML = new Set([
  "login.html",
  "setup.html",
  "pair.html",
  "license.html",
  "license-recovery.html",
  "display.html",
]);

function htmlInputs(): Record<string, string> {
  const input: Record<string, string> = {};
  for (const name of htmlPages) {
    const full = path.join(pagesDir, name);
    if (fs.existsSync(full)) input[name.replace(/\.html$/, "")] = full;
  }
  return input;
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

// three 锁定 0.186.0，与 0.6.7/frontend/static/vendor/three/0.186.0 一致。
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

function flattenPagesHtmlPlugin(): Plugin {
  return {
    name: "homeos-flatten-pages-html",
    closeBundle() {
      const nested = path.join(outDir, "pages");
      if (!fs.existsSync(nested)) return;
      for (const name of htmlPages) {
        const from = path.join(nested, name);
        if (fs.existsSync(from)) {
          fs.renameSync(from, path.join(outDir, name));
        }
      }
      try {
        fs.rmdirSync(nested);
      } catch {
        /* keep if not empty */
      }
    },
  };
}

/**
 * 只清理主应用自己拥有的产物，保留 `dist/modules/`。
 *
 * `dist/` 是主应用与 runtime 两次构建共用的目录：
 *   - 主应用：`vite.config.ts` → `dist/static/**`、`dist/*.html`、`dist/public-static.json`
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
      for (const name of ["static", "pages", "public-static.json", ...htmlPages]) {
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
  for (const name of PUBLIC_HTML) {
    const htmlPath = path.join(outDir, name);
    if (!fs.existsSync(htmlPath)) continue;
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
    // 种子清单是从 0.6.7 的匿名白名单翻译过来的，里面记的是「打包前」的扁平文件名
    // （/static/login.js 之类）。打包后它们变成了 /static/assets/login-<hash>.js 或被
    // 归到子目录，因此这里按产物实际存在与否筛一遍。
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
      why: "Vite 构建产物：公开页 HTML 直接引用，必须匿名可加载。",
    });
  }
  payload.files = kept;
  // 记录被筛掉的种子条目，方便核对「是不是真有资源漏了」而不是被静默吞掉。
  (payload as Record<string, unknown>)._prunedStaleSeed = pruned.sort();
  if (pruned.length > 0) {
    // 正常构建会筛掉那些「打包前的扁平文件名」（已换成 /static/assets/xxx-<hash>.js）。
    // 若这里出现 /static/logging/client-log.js 这类新路径，说明本插件被排到了产物写入
    // 插件之前 —— 白名单会少条目、未登录页白屏，所以必须出声。
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
    flattenPagesHtmlPlugin(),
    classicIifePlugin(),
    // 最后一位：closeBundle 按数组顺序串行，清单必须在所有产物写完后才生成。
    publicStaticManifestPlugin(),
  ],
});
