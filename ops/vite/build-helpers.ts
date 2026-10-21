/**
 * 两个前端构建（`homeos/frontend` 与 `homeos-store/frontend`）共用的构建助手（P5 抽取）。
 *
 * 为什么落在 `ops/` 而不是 `packages/shared`：后者是**产品**代码（浏览器侧，经 subpath
 * exports 由两个应用各自编译），而这里是构建期 Node 侧工具；混进产品包会让浏览器构建图
 * 平白多出 vite / esbuild 的依赖关系。`ops/` 本来就承载跨项目的构建工具
 * （`run-vue-tsc.mjs`、`docker/obfuscate_javascript.mjs`），沿用同一处。
 *
 * 只收**实测确有的重复**（各自原本都有两份，其中 logger 是逐字节相同、只差一条注释）：
 *
 *   1. `quietLogger()`              —— 压掉「非 module 脚本 / 构建期不存在」等预期告警
 *   2. `bundleClassicIife()`        —— esbuild 打成经典 IIFE 的**唯一**一份参数集
 *   3. `SPA_ENTRY` / `assertSpaShellPresent()` —— 「产物根必须有 index.html」这条硬约束
 *
 * 刻意**没有**抽的东西（都看过，属「看着像、其实不同源」）：
 *
 *   - **产物旁路 + 原子发布**：只有主应用需要（watch-build 与手工构建并发时的 `emptyOutDir`
 *     清空窗口），商店直写 `dist/homeos-store/frontend/static`。把主应用那套搬过去不是去重，
 *     是给商店换一套发布语义。
 *   - **chunk 命名**：主应用要收敛 Rolldown `entriesAware` 拼出的 `A~B~C` 合并名，商店要按
 *     「源文件相对 `src` 的路径」避免同名视图退化成双哈希 —— 两套规则服务的失败模式不同。
 *   - **代理 / 别名 / 插件集**：两边的端口、挂载前缀、可外置资源（three、`/static/vendor/**`）
 *     完全不同，合并只会得到一个满是分支的函数。
 */
import fs from "node:fs";
import path from "node:path";
import { build as esbuildBuild } from "esbuild";
import { createLogger, type Logger } from "vite";

// 依赖归属：本文件 import 的 `esbuild` / `vite` 声明在**仓库根** `package.json`（`ops/` 属根
// workspace）—— 两个应用不必为了共用构建助手各自声明一遍，这与 P3e「vue-tsc 归属移到根」同理。
// 本文件不参与任何应用的 ESLint（两边的 `lint` 只管自己的 `src/**`），类型由根
// `tsconfig.node.json` 的 `typecheck:node` 把关（它从三个 vite 配置沿 import 追到这里）。

/** SPA 唯一入口名：两个应用的产物布局都以它为准（商店还要把它搬出静态挂载根）。 */
export const SPA_ENTRY = "index.html";

/** 压掉「经典 IIFE / 运行时路径」等预期告警，避免刷屏。 */
export function quietLogger(): Logger {
  const logger = createLogger();
  const warn = logger.warn.bind(logger);
  const warnOnce = logger.warnOnce.bind(logger);

  const suppress = (msg: string) =>
    msg.includes('can\'t be bundled without type="module" attribute') ||
    msg.includes("doesn't exist at build time, it will remain unchanged");

  logger.warn = (msg, options) => {
    if (typeof msg === "string" && suppress(msg)) return;
    warn(msg, options);
  };
  logger.warnOnce = (msg, options) => {
    if (typeof msg === "string" && suppress(msg)) return;
    warnOnce(msg, options);
  };
  return logger;
}

/**
 * 用 esbuild 把零依赖入口打成经典 IIFE（`format: "iife"`，HTML 里不带 `type="module"`）。
 *
 * 参数集集中在这里，是因为两个应用各写过一份**逐字段相同**的调用：`target: es2022` /
 * `platform: browser` / `minify` / `logLevel: silent` 只要在其中一处漂移（例如升 target 时
 * 只改了一处），两个镜像里的经典脚本就会在不同浏览器上表现不一致 —— 而这类差异只在设备上
 * 暴露。入口文件不存在时**跳过**（与两边原行为一致）：入口写错导致「不产出、也不报错」的
 * 老事故由 `vite.config.ts` 的 `updatePublicStaticManifest` 兜底 —— 登记清单引用却缺失，
 * 那里会硬失败。
 */
export async function bundleClassicIife(options: {
  entry: string;
  outfile: string;
}): Promise<void> {
  const { entry, outfile } = options;
  if (!fs.existsSync(entry)) return;
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

/**
 * 产物根必须有 `SPA_ENTRY`，否则**硬失败**。
 *
 * 两个应用原本各写了一份等价判断与报错：外壳缺失是「整个站点 404」级别的事故，绝不能只在
 * 日志里说一句。报错里带上 outDir 的实际内容 —— 缺外壳时第一个要回答的问题就是「目录里到底
 * 有没有东西」（空目录 = 构建没跑；有 assets 没 index = 构建被中途清空），不列出来就得重跑
 * 一遍去找。`hint` 由调用方给出各自的下一步动作（重跑哪条命令）。
 */
export function assertSpaShellPresent(outDir: string, hint: string): void {
  const entry = path.join(outDir, SPA_ENTRY);
  if (fs.existsSync(entry)) return;
  const listing = fs.existsSync(outDir) ? fs.readdirSync(outDir).join(", ") : "(outDir 不存在)";
  throw new Error(`SPA 入口缺失：${entry}（outDir 内容: ${listing}）。${hint}`);
}

/**
 * chunk 基名唯一化：同一轮构建内「同基名不同源」的 chunk 依次加 `-2`、`-3`…
 *
 * 只收口**唯一化**这一件事；基名怎么算（Rolldown `entriesAware` 合并名 vs 源文件相对
 * `src` 的路径）仍留在各自配置里 —— 两套规则服务的失败模式不同，合并会变成满是分支的函数。
 *
 * `reset()` 必须在每次构建开始时调用（watch 重建要丢掉上一轮的占用）。
 */
export function createChunkNameAllocator() {
  const usedNames = new Set<string>();
  return {
    reset() {
      usedNames.clear();
    },
    unique(baseName: string): string {
      if (!usedNames.has(baseName)) {
        usedNames.add(baseName);
        return baseName;
      }
      let index = 2;
      while (usedNames.has(`${baseName}-${index}`)) index += 1;
      const name = `${baseName}-${index}`;
      usedNames.add(name);
      return name;
    },
  };
}
