/**
 * 3D Studio 构建契约（并入 homeos 前端后复用）。
 *
 * 从原 `homeos-3d/frontend/vite.config.ts` 迁移而来，保留其关键约束：
 *   1. `three` 不打进 bundle，以根绝对 URL `/static/vendor/three/0.186.0/...` 外置加载；
 *   2. `/static/vendor/**` 与 `/api/**`、`/api/v1/modules/interaction3d/**` 一律外置，
 *      它们是后端下发的运行时资源，不是本地模块；
 *   3. 少量零依赖经典 IIFE 入口（HTML 里非 module 的 <script>、或字面量 URL 的 Worker）
 *      必须输出到固定路径、可预测文件名；
 *   4. `tsconfig` 里的编译期 shim 与运行期外置必须配套，否则 Rollup 会把
 *      `/api/v1/modules/interaction3d/...` 当成待解析的本地模块而失败。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuildBuild } from "esbuild";
import type { Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 前端根目录（homeos/frontend）。 */
export const frontendRoot = __dirname;
/** 构建产物根目录（工作区根 `dist/homeos/frontend`）。 */
export const outDir = path.resolve(__dirname, "../../dist/homeos/frontend");
/** studio 源码根目录（homeos/frontend/src/studio）。 */
export const studioRoot = path.join(__dirname, "src/studio");

// three 锁定 0.186.0，与随包分发的 static/vendor/three/0.186.0 保持一致。
export const THREE_VENDOR = "/static/vendor/three/0.186.0/three.module.min.js";

/** 运行期外置判定：构建与 Worker 子构建都必须使用同一份，行为才一致。 */
export function isRuntimeExternal(id: string): boolean {
  return (
    id === "three" ||
    id === THREE_VENDOR ||
    id.startsWith("/api/") ||
    id.startsWith("/static/vendor/") ||
    id.includes("/api/v1/modules/interaction3d/")
  );
}

/**
 * 零依赖经典 IIFE 入口（不能打成 ESM）。
 * 这些脚本在 HTML 里以不带 type="module" 的 <script> 加载，或作为 Worker 以字面量
 * URL 加载，因此必须输出到固定路径、且文件名可预测。
 */
export const classicEntries: Record<string, string> = {
  "logging/client-log": path.join(studioRoot, "app/logging/client-log.ts"),
  "display/display-boot": path.join(studioRoot, "app/display/display-boot.ts"),
  "display/display-startup": path.join(studioRoot, "app/display/display-startup.ts"),
  "auth/scene/scene-depth": path.join(studioRoot, "app/auth/scene/scene-depth.ts"),
  // studio-app 以字面量 URL 经 new Worker 加载。
  "3d-studio/export/draco-decoder-worker": path.join(
    studioRoot,
    "app/3d-studio/export/draco-decoder-worker.ts",
  ),
};

/**
 * 把 `three` 解析为根绝对 URL 外置；`/static/vendor/**` 同样外置。
 * 构建与 dev 都需要：构建期由 Rollup 外置，dev 期由 vite 直接当 URL。
 */
export function vendorResolvePlugin(): Plugin {
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
 * 构建侧由 `rolldownOptions.external` / `worker.rollupOptions.external` 的
 * `isRuntimeExternal` 处理，但这两个选项 dev 不读，于是 vite 的 import-analysis 会把
 * `/api/v1/modules/interaction3d/...` 当成待解析的本地模块而报错。这里在 dev 里把同样的
 * 前缀标成 external，URL 原样保留，再由 server.proxy 转发给后端。
 */
export function runtimeUrlExternalPlugin(): Plugin {
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
 * dev server 专用：把 `/static/vendor/**` 登记为静态资产。
 *
 * 这些文件的实体在 `public/` 里（构建时原样拷进 dist），但源码是以根绝对 URL 把它当
 * 「运行时资源」import 的。`vite:import-analysis` 会在所有插件的 resolveId 之前先做一次
 * checkPublicFile 判定，命中就抛「Cannot import non-asset file … inside /public」，因此
 * `vendorResolvePlugin` 的外置分支没机会执行。走 `config` 钩子（而非顶层 assetsInclude）
 * 是为了配合 `apply: "serve"` 只在 dev 生效，构建期行为一字不变。
 */
export function runtimeVendorAssetPlugin(): Plugin {
  return {
    name: "homeos-runtime-vendor-assets",
    apply: "serve",
    config() {
      return { assetsInclude: [/^\/static\/vendor\//] };
    },
  };
}

/**
 * 用 esbuild 把零依赖经典入口打成 IIFE，落到固定路径 `/static/<name>.js`。
 * closeBundle 按插件数组顺序串行执行，所以输出顺序可预期。
 *
 * 写出目录取自 ``config.build.outDir``（主应用原子构建时是 ``frontend.building``），
 * 不要写死导出的 ``outDir``，否则会绕过旁路目录、污染线上 dist。
 */
export function classicIifePlugin(): Plugin {
  let resolvedOutDir = outDir;
  return {
    name: "homeos-classic-iife",
    apply: "build",
    configResolved(config) {
      resolvedOutDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      for (const [name, entry] of Object.entries(classicEntries)) {
        if (!fs.existsSync(entry)) continue;
        const outfile = path.join(resolvedOutDir, "static", `${name}.js`);
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
