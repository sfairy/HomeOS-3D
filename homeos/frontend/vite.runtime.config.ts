/**
 * 3D Studio 运行时模块构建（并入 homeos 后独立成一条构建）。
 *
 * 整个 `src/studio/runtime/**` 都是入口：这些模块经后端
 * `/api/v1/modules/interaction3d/<相对路径>.js` 按需下发，因此每条 `.ts` 都作为一个
 * entry 产出到 `dist/frontend/modules/runtime/<相对路径>.js`，同时生成
 * `manifest.json` 作为后端放行白名单（见 backend/src/modules/interaction3d/api.py 的
 * get_resource）。
 *
 * 与主应用构建共用 `homeos/frontend/vite-studio.ts` 的外置契约（three / /api/** /
 * /static/vendor/**），保证运行期 import 解析一致。
 */
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { quietLogger } from "../../ops/vite/build-helpers.js";
import { THREE_VENDOR, frontendRoot, isRuntimeExternal, studioRoot } from "./vite-studio.ts";

const runtimeSrc = path.join(studioRoot, "runtime");
// 前端产物统一收敛到工作区根 ``dist/homeos/frontend``（与 homeos-store 同位），
// 由 ops/build.py / Dockerfile 统一打包，源码树里不留构建产物。
const finalOutDir = path.resolve(frontendRoot, "../../dist/homeos/frontend/modules/runtime");
// 非 watch 构建先写到旁路目录，再原子替换，避免 emptyOutDir 窗口内 config-editor / chunks 404。
const isWatchBuild = process.argv.includes("--watch");
const outDir = isWatchBuild ? finalOutDir : `${finalOutDir}.building`;

/**
 * 运行时模块：整个 src/studio/runtime/** 都是入口，按需经
 * /api/v1/modules/interaction3d/* 单独下发。
 */
function discoverRuntimeEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  const stack = [runtimeSrc];
  while (stack.length) {
    const dir = stack.pop()!;
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
      const rel = path.relative(runtimeSrc, full).replace(/\\/g, "/");
      entries[rel.replace(/\.ts$/i, "")] = full;
    }
  }
  return entries;
}

function walkCss(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".css")) out.push(full);
    }
  }
  return out;
}

/**
 * 共享 chunk 的输出名：按源文件相对 studio 根的路径命名，而非 basename。
 *
 * 运行期模块的公开 URL 是稳定契约（runtime 目录下每个 .ts 都是一个 entry，后端
 * manifest 放行），因此 `runtime/editor/` 这类弃用兼容 shim、`app/bridge/` 这类纯
 * re-export 门面都会与真正的实现各成一个 chunk。只取 basename 时，
 * `editor/light-range-editor` 与 `config-ui/light-range-editor` 会产出两个同名不同
 * 哈希的 `light-range-editor-*.js`，看着像重复、排障时无法区分。带路径后成为
 * `chunks/runtime/editor/light-range-editor-<hash>.js` 与
 * `chunks/runtime/config-ui/light-range-editor-<hash>.js`，仍遵守「公开路径不改」的约束。
 */
function chunkBaseName(chunk: {
  name?: string;
  facadeModuleId?: string | null;
  moduleIds?: string[];
}): string {
  const candidates = [chunk.facadeModuleId || "", ...(chunk.moduleIds || [])];
  for (const id of candidates) {
    if (!id || !id.startsWith(studioRoot)) continue;
    const rel = path
      .relative(studioRoot, id)
      .replace(/\\/g, "/")
      .replace(/\.(ts|js|mjs)$/i, "");
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel;
  }
  return (chunk.name || "chunk").replace(/[\\/]/g, "-");
}

//: 单个构建内已占用的 chunk 名；buildStart 清空。用于给「同名不同源」的 chunk 兜底加序号，
//: 保证产物里不再出现两个同名 `xxx-<hash>.js`（兼容 shim 与实现各成一个 chunk 时会发生）。
const usedChunkNames = new Set<string>();

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

/**
 * 生成 dist/frontend/modules/runtime/manifest.json：后端 get_resource 按这份清单放行。
 */
function manifestPlugin(): Plugin {
  return {
    name: "homeos-runtime-manifest",
    closeBundle() {
      const files: string[] = [];
      const stack = [outDir];
      while (stack.length) {
        const dir = stack.pop()!;
        if (!fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(full);
            continue;
          }
          if (!entry.isFile() || entry.name === "manifest.json") continue;
          const ext = path.extname(entry.name);
          if (ext !== ".js" && ext !== ".css") continue;
          files.push(path.relative(outDir, full).replace(/\\/g, "/"));
        }
      }
      for (const cssAbs of walkCss(runtimeSrc)) {
        const cssRel = path.relative(runtimeSrc, cssAbs).replace(/\\/g, "/");
        const to = path.join(outDir, cssRel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(cssAbs, to);
        if (!files.includes(cssRel)) files.push(cssRel);
      }
      files.sort();
      // capability / mediaTypes 以「线上目录」旧清单为准（旁路构建时 outDir 是 .building）。
      const previousManifest = path.join(finalOutDir, "manifest.json");
      const manifestPath = path.join(outDir, "manifest.json");
      let capability = ["editor", "module.3d_interaction"];
      let mediaTypes: Record<string, string> = {
        ".js": "text/javascript",
        ".css": "text/css",
      };
      for (const candidate of [previousManifest, manifestPath]) {
        if (!fs.existsSync(candidate)) continue;
        try {
          const prev = JSON.parse(fs.readFileSync(candidate, "utf8"));
          if (Array.isArray(prev.capability)) capability = prev.capability;
          if (prev.mediaTypes && typeof prev.mediaTypes === "object") mediaTypes = prev.mediaTypes;
          break;
        } catch {
          /* 默认值 */
        }
      }
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            _comment: [
              "Generated by frontend/vite.runtime.config.ts — do not hand-edit files list.",
              "backend/src/modules/interaction3d/api.py get_resource reads this whitelist.",
            ],
            capability,
            mediaTypes,
            files,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      if (!isWatchBuild && outDir !== finalOutDir) {
        const swapDir = `${finalOutDir}.prev`;
        fs.rmSync(swapDir, { recursive: true, force: true });
        if (fs.existsSync(finalOutDir)) fs.renameSync(finalOutDir, swapDir);
        fs.renameSync(outDir, finalOutDir);
        fs.rmSync(swapDir, { recursive: true, force: true });
      }
    },
  };
}

const entries = discoverRuntimeEntries();

export default defineConfig({
  root: frontendRoot,
  // 独立子缓存目录：runtime 的 build/watch 与主应用 dev server 可能同时跑，分开避免抢占缓存。
  // 落在工作区根 node_modules/.vite，避免在 homeos/frontend 下再长出 node_modules。
  cacheDir: path.join(path.resolve(frontendRoot, "../.."), "node_modules", ".vite", "homeos-runtime"),
  customLogger: quietLogger(),
  publicDir: false,
  resolve: {
    alias: {
      "@app": path.join(studioRoot, "app"),
      "@runtime": path.join(studioRoot, "runtime"),
      three: THREE_VENDOR,
    },
  },
  build: {
    outDir,
    // watch：不清空，避免正在被引用的 hash chunk 被删。
    // 非 watch：清空旁路 `.building` 目录（线上 runtime 目录由 closeBundle 原子替换）。
    emptyOutDir: !isWatchBuild,
    reportCompressedSize: false,
    sourcemap: false,
    minify: true,
    // 模块经 /api/v1/modules/interaction3d/* 下发；默认 base=/ 会把 modulepreload 写成
    // /assets/*.js，浏览器会打到主站根路径 404。关掉 preload 后只走相对 import。
    modulePreload: false,
    /**
     * 默认阈值 500 kB 会刷 `panel-renderer` 这条 530 kB 的告警：它是运行时模块
     * （`/api/v1/modules/interaction3d/*` 按需下发）里给所有面板共用的渲染器，
     * 只有真正打开面板时才拉，且已按源码路径切成 chunks/，再拆只会增加往返次数。
     * 与主应用（1200）/ 商店（800）保持同一口径，别让一条已知无害的告警常驻。
     */
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: entries,
      external: isRuntimeExternal,
      preserveEntrySignatures: "strict",
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: (chunk) => `chunks/${uniqueChunkBaseName(chunk)}-[hash].js`,
        assetFileNames: "[name][extname]",
        paths: (id) => (id === "three" ? THREE_VENDOR : id),
      },
    },
  },
  plugins: [
    {
      name: "homeos-runtime-external",
      buildStart() {
        // 每个构建重新计数，watch 重建时不会沿用上一轮的名字占用。
        usedChunkNames.clear();
      },
      resolveId(id) {
        if (id === "three") return { id: THREE_VENDOR, external: true };
        if (isRuntimeExternal(id)) return { id, external: true };
        return null;
      },
    },
    manifestPlugin(),
  ],
});
