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
const templatesDir = path.join(frontendOutDir, "templates");

const SPA_ENTRY = "index.html";

//: 构建走挂载前缀；dev 仍在根路径提供（8806 下 `/store-static` 被代理给后端）。
const BUILD_BASE = "/store-static/";
const DEV_BASE = "/";

function htmlInputs(): Record<string, string> {
  const full = path.join(storeRoot, SPA_ENTRY);
  return fs.existsSync(full) ? { index: full } : {};
}

function classicIifePlugin(): Plugin {
  return {
    name: "homeos-store-classic-iife",
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

/** 把 Vite 产出的 index.html 收敛到 templates/（挂载根之外）。 */
function flattenTemplatesPlugin(): Plugin {
  return {
    name: "homeos-store-flatten-templates",
    closeBundle() {
      const from = path.join(buildOutDir, "index.html");
      if (!fs.existsSync(from)) {
        const listing = fs.existsSync(buildOutDir) ? fs.readdirSync(buildOutDir).join(", ") : "(outDir 不存在)";
        throw new Error(`SPA 入口缺失：${from}（outDir 内容: ${listing}）`);
      }
      fs.mkdirSync(templatesDir, { recursive: true });
      //: base 已经是挂载前缀，产物里的资源引用无需再改写，直接搬走即可。
      fs.copyFileSync(from, path.join(templatesDir, "index.html"));
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
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    // 模板里的资源一律写运行时绝对路径（/store-static/...），不参与打包解析。
    plugins: [vue({ template: { transformAssetUrls: false } }), flattenTemplatesPlugin(), classicIifePlugin()],
  };
});
