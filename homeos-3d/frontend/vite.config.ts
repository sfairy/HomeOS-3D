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

const classicEntries: Record<string, string> = {
  "logging/client-log": path.join(frontendRoot, "src/app/logging/client-log.ts"),
  "display/display-boot": path.join(frontendRoot, "src/app/display/display-boot.ts"),
  "auth/pairing-entry": path.join(frontendRoot, "src/app/auth/pairing-entry.ts"),
  "auth/scene/scene-depth": path.join(frontendRoot, "src/app/auth/scene/scene-depth.ts"),
  // 零依赖经典 Worker（不能打成 ESM）：studio-app 以字面量 URL 经 new Worker 加载。
  "3d-studio/export/draco-decoder-worker": path.join(
    frontendRoot,
    "src/app/3d-studio/export/draco-decoder-worker.ts"
  ),
};

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
    "/static/auth/pairing-entry.js",
    "/static/auth/scene/scene-depth.js",
  ]) {
    discovered.add(stable);
  }
  const kept: Array<{ path: string; why: string }> = [];
  const seen = new Set<string>();
  for (const item of payload.files || []) {
    const p = typeof item === "string" ? item : item.path;
    if (!p?.startsWith("/static/")) continue;
    if (
      p.endsWith(".js") &&
      !p.includes("/vendor/") &&
      !discovered.has(p) &&
      !p.includes("/assets/icons/")
    ) {
      if (
        p.startsWith("/static/auth/") ||
        p.startsWith("/static/utils/") ||
        p.startsWith("/static/shared/") ||
        p.startsWith("/static/logging/global")
      ) {
        continue;
      }
    }
    if (seen.has(p)) continue;
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
    emptyOutDir: true,
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
  plugins: [vendorResolvePlugin(), flattenPagesHtmlPlugin(), classicIifePlugin()],
});
