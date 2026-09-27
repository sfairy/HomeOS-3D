/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuildBuild } from "esbuild";
import { defineConfig, type Plugin } from "vite";
import { quietLogger } from "./vite-quiet-logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storeRoot = __dirname;
const projectRoot = path.resolve(storeRoot, "..");
const pagesDir = path.join(storeRoot, "pages");
const outDir = path.join(projectRoot, "dist");

const pages = ["store.html", "setup.html", "admin.html"] as const;

function htmlInputs(): Record<string, string> {
  const input: Record<string, string> = {};
  for (const name of pages) {
    const full = path.join(pagesDir, name);
    if (fs.existsSync(full)) input[name.replace(/\.html$/, "")] = full;
  }
  return input;
}

function classicIifePlugin(): Plugin {
  return {
    name: "homeos-store-classic-iife",
    async closeBundle() {
      const entry = path.join(storeRoot, "src/auth-bootstrap.ts");
      if (!fs.existsSync(entry)) return;
      const outfile = path.join(outDir, "static", "auth-bootstrap.js");
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

function flattenTemplatesPlugin(): Plugin {
  return {
    name: "homeos-store-flatten-templates",
    closeBundle() {
      const templatesDir = path.join(outDir, "templates");
      fs.mkdirSync(templatesDir, { recursive: true });
      for (const name of pages) {
        const candidates = [
          path.join(outDir, "pages", name),
          path.join(outDir, name),
        ];
        const from = candidates.find((p) => fs.existsSync(p));
        if (!from) continue;
        // Vite emits /static/assets/*；商店挂载前缀是 /store-static。
        let html = fs.readFileSync(from, "utf8");
        html = html.replaceAll("/static/assets/", "/store-static/assets/");
        fs.writeFileSync(path.join(templatesDir, name), html, "utf8");
      }
      const nested = path.join(outDir, "pages");
      if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true, force: true });
      for (const name of pages) {
        const loose = path.join(outDir, name);
        if (fs.existsSync(loose)) fs.unlinkSync(loose);
      }
      // 页面壳注入的场景片段：与 templates 同目录，文件名由后端约定。
      const sceneSources = [
        path.join(storeRoot, "public/static/scene/scene.html"),
        path.join(projectRoot, "../homeos-3d/design/scene/scene.html"),
      ];
      const sceneFrom = sceneSources.find((p) => fs.existsSync(p));
      if (sceneFrom) {
        fs.copyFileSync(sceneFrom, path.join(templatesDir, "_scene.html"));
      }
    },
  };
}

export default defineConfig({
  root: storeRoot,
  base: "/",
  customLogger: quietLogger(),
  publicDir: path.join(storeRoot, "public"),
  resolve: {
    alias: {
      "@store": path.join(storeRoot, "src"),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/v2": { target: "http://127.0.0.1:18082", changeOrigin: true },
      "/store-static": { target: "http://127.0.0.1:18082", changeOrigin: true },
      "/healthz": { target: "http://127.0.0.1:18082", changeOrigin: true },
      "/fonts": { target: "http://127.0.0.1:18082", changeOrigin: true },
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: htmlInputs(),
      output: {
        entryFileNames: "static/assets/[name]-[hash].js",
        chunkFileNames: "static/assets/[name]-[hash].js",
        assetFileNames: "static/assets/[name]-[hash][extname]",
      },
    },
  },
  plugins: [flattenTemplatesPlugin(), classicIifePlugin()],
});
