/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuildBuild } from "esbuild";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";
import { quietLogger } from "./vite-quiet-logger.js";

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

const SPA_ENTRY = "index.html";

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
 * 商店存在同名不同源的模块（``views/admin/ProductsView.vue`` 与
 * ``views/store/ProductsView.vue``），以及 Vite 会自加后缀去重的 ``useApi``，
 * 只取 basename 时产物会退化成 ``ProductsView-<hash>.js`` 两份、
 * ``useApi-<hash>-<hash>.js`` 双哈希。带路径后成为 ``views/admin/ProductsView-<hash>.js``
 * 与 ``views/store/ProductsView-<hash>.js``，名与源一一对应。
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
      const entry = path.join(storeRoot, "src/auth-bootstrap.ts");
      if (!fs.existsSync(entry)) return;
      //: 构建产物根就是挂载根，auth-bootstrap.js 直接落在这里（/store-static/auth-bootstrap.js）。
      const outfile = path.join(buildOutDir, "auth-bootstrap.js");
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
      const from = path.join(buildOutDir, SPA_ENTRY);
      if (!fs.existsSync(from)) {
        const listing = fs.existsSync(buildOutDir) ? fs.readdirSync(buildOutDir).join(", ") : "(outDir 不存在)";
        throw new Error(`SPA 入口缺失：${from}（outDir 内容: ${listing}）`);
      }
      fs.mkdirSync(frontendOutDir, { recursive: true });
      //: base 已经是挂载前缀，产物里的资源引用无需再改写，直接搬走即可。
      fs.copyFileSync(from, path.join(frontendOutDir, SPA_ENTRY));
      fs.unlinkSync(from);
      const nested = path.join(buildOutDir, "pages");
      if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ command }) => {
  const isBuild = command === "build";
  return {
    root: storeRoot,
    base: isBuild ? BUILD_BASE : DEV_BASE,
    // 依赖预打包缓存统一落在工作区根 node_modules/.vite/homeos-store，避免项目内再长出 node_modules。
    cacheDir: path.join(repoRoot, "node_modules", ".vite", "homeos-store"),
    customLogger: quietLogger(),
    // 构建时 outDir 就是挂载根：public 的 `static/` 子层要剥掉，否则会多出一层 static。
    publicDir: isBuild ? path.join(storeRoot, "public", "static") : path.join(storeRoot, "public"),
    resolve: {
      alias: {
        "@store": path.join(storeRoot, "src"),
      },
    },
    server: {
      port: 8806,
      strictPort: true,
      proxy: {
        "/store/v1": { target: "http://127.0.0.1:8802", changeOrigin: true },
        "/store-admin/v1": { target: "http://127.0.0.1:8802", changeOrigin: true },
        "/store-appearance.css": { target: "http://127.0.0.1:8802", changeOrigin: true },
        "/v2": { target: "http://127.0.0.1:8802", changeOrigin: true },
        "/store-static": { target: "http://127.0.0.1:8802", changeOrigin: true },
        "/healthz": { target: "http://127.0.0.1:8802", changeOrigin: true },
        "/fonts": { target: "http://127.0.0.1:8802", changeOrigin: true },
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
