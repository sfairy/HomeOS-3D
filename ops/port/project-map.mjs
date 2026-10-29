#!/usr/bin/env node
/**
 * 上游前端文件 ↔ 本项目源文件的对齐表。
 *
 * 上游是 `frontend/static/*.js` 的平铺结构，本项目是 `homeos/frontend/src/studio/**` 的
 * 分层结构，同名不代表同位置（`modules/interaction3d/core/stage.js` 对应
 * `src/studio/runtime/core/stage.ts`）。移植时最容易犯的错是「按目录结构照搬」，
 * 所以先把对齐关系算出来、落成一张表，后面每个移植任务都按这张表找目标文件。
 *
 * 匹配分级：
 *   - mechanical：本项目有同名 `.ts/.tsx/.vue/.css`
 *   - overridden：同名找不到，但 `MAPPING_OVERRIDES` 里登记了改名后的落点
 *   - renamed    ：同名命中多个本地文件（一个上游文件被拆开）
 *   - structural ：`STRUCTURAL_DIFFERENCES` 里登记的架构差异，本项目**刻意**没有对应文件
 *   - missing    ：以上都不是 —— 这才是真正需要解释的缺口
 *
 * 只按 basename 比对会有大量假阴性（`studio-floor-lights.js` 其实早就在
 * `authoring/scene/studio-floor-lights.ts`），所以 overridden 与 structural 两张表是必需的：
 * 它们把「已移植但改名」和「确认不做」从 missing 里摘出去，剩下的 missing 才有审计价值。
 *
 * 用法：node ops/port/project-map.mjs [--version 0.8.2]
 * 产物：docs/port/<version>/project-map.json
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const VERSION = process.argv.includes("--version") ? process.argv[process.argv.indexOf("--version") + 1] : "0.8.2";

const UPSTREAM = join(ROOT, "源代码", VERSION, "frontend");
/** 落点相对这个目录；`src/studio/...` 与 `public/static/...` 都写在这个前缀下。 */
const FRONTEND_ROOT = join(ROOT, "homeos/frontend");
const PROJECT_SRC = join(FRONTEND_ROOT, "src");

/**
 * 改名落点：上游路径 → 本项目文件（相对 `homeos/frontend/`）。
 *
 * 只登记**已经核实存在**的文件；落点不存在会在运行时告警，避免这张表随重构腐烂。
 * 一个上游文件拆成多个时按功能主次排列，第一个视为主落点。
 */
const MAPPING_OVERRIDES = {
  // 3D 创作：0.8.1 新增/重写的模块，本项目按功能域落到 authoring/ 下
  "static/3d-studio/model-remarks.js": ["src/studio/app/shared/model-remarks.ts"],
  "static/3d-studio/studio-context-resources.js": ["src/studio/app/3d-studio/authoring/studio-context-resources.ts"],
  "static/3d-studio/studio-floor-directional-shadow.js": [
    "src/studio/app/3d-studio/authoring/scene/studio-floor-directional-shadow.ts",
  ],
  "static/3d-studio/studio-floor-lights.js": ["src/studio/app/3d-studio/authoring/scene/studio-floor-lights.ts"],
  "static/3d-studio/studio-interaction-geometry.js": [
    "src/studio/app/3d-studio/authoring/scene/studio-interaction-geometry.ts",
  ],
  "static/3d-studio/studio-preview-scope.js": [
    "src/studio/app/3d-studio/authoring/scene/studio-preview-scope.ts",
  ],
  "static/3d-studio/studio-reviewed-shell-data.js": [
    "src/studio/app/3d-studio/authoring/scene/studio-reviewed-shell-data.ts",
  ],
  "static/3d-studio/studio-reviewed-shells.js": [
    "src/studio/app/3d-studio/authoring/scene/studio-reviewed-shells.ts",
  ],
  "static/3d-studio/studio-shadow-copy.js": [
    "src/studio/app/3d-studio/authoring/scene/studio-shadow-copy.ts",
  ],
  "static/3d-studio/studio-shadow-parameters.js": [
    "src/studio/app/3d-studio/authoring/scene/studio-shadow-parameters.ts",
  ],
  // 样式与样式表：静态资源不在 src 下，单独指到 public/static
  "static/3d-studio/studio.css": ["public/static/3d-studio/studio.css"],
  "static/renderer/renderer.css": ["public/static/renderer/renderer.css"],

  // 运行时模块：本项目按域分层，文件名带域前缀
  "static/camera-connection-budget.js": ["src/studio/runtime/camera/camera-budget.ts"],
  "static/camera-mjpeg.js": ["src/studio/runtime/camera/camera-mjpeg.ts"],
  "static/editor-floating-layout.js": ["src/studio/app/shared/util/editor-floating-layout.ts"],
  "static/editor-number-inputs.js": ["src/studio/app/editor/controls/number-stepper.ts"],
  "static/ha-control.js": ["src/studio/app/renderer/panel-seams/runtime-actions.ts"],
  "static/light-statistics-list.js": ["src/studio/app/editor/home/functions/entity-labels.ts"],
  "static/renderer/registry.js": ["src/studio/app/renderer/registry/index.ts"],
  "static/renderer/renderer.js": ["src/studio/app/renderer/panel-renderer.ts"],
  "static/renderer/runtime-caches.js": ["src/studio/app/renderer/panel-caches.ts"],
  "static/renderer/runtime-dialog-motion.js": ["src/studio/app/renderer/panel-dialog-motion.ts"],
  "static/renderer/runtime-document.js": ["src/studio/app/renderer/panel-document.ts"],
  "static/user-image-upload.js": ["src/studio/app/shared/user-image-upload.ts"],
  "static/modules/interaction3d/configuration-feedback.js": [
    "src/studio/runtime/config-ui/configuration-feedback.ts",
  ],
  "static/modules/interaction3d/configuration-picker.js": [
    "src/studio/runtime/config-ui/configuration-picker.ts",
  ],
  "static/modules/interaction3d/configuration-progress.js": [
    "src/studio/runtime/config-ui/configuration-progress.ts",
  ],
  "static/modules/interaction3d/number-display.js": ["src/studio/app/shared/util/ha-number.ts"],
  "static/modules/interaction3d/reported-motion.js": ["src/studio/runtime/core/reported-motion.ts"],
};

/**
 * 架构差异：本项目**刻意**没有对应文件，写明理由，审计时不再重复讨论。
 */
const STRUCTURAL_DIFFERENCES = {
  "static/vendor": "vendor 版本不同（本项目 three r186 / hls 1.7.3，由构建产物提供）",
  "static/update-notice.js": "厂商 SaaS：轮询 pay.habridge.cn 显示新版本徽标，本项目不做",
  "static/ui-packs/loader.js": "外部 UI 方案运行时，本项目无 UI 方案体系",
  "static/license-card.js": "授权体系不同，本项目授权页由 Vue 路由实现",
  "static/license-recovery.js": "授权体系不同，本项目授权页由 Vue 路由实现",
  "static/login.js": "静态页由 Vue 路由页替代（src/features/**）",
  "static/setup.js": "静态页由 Vue 路由页替代（src/features/settings/connect/setup-wizard）",
  "static/pair.js": "静态页由 Vue 路由页替代",
  "static/pairing-entry.js": "静态页由 Vue 路由页替代",
  "static/pairing-link.js": "静态页由 Vue 路由页替代",
  "static/display-pairing-qr.js": "显示页由 DisplayView.vue + 后端配对接口实现",
  "static/display-surface.js": "显示页由 DisplayView.vue 实现",
  "static/embed-runtime.js": "嵌入运行时由 embed 页 Vue 入口实现",
  "static/embed-session.js": "嵌入会话由 embed 页 Vue 入口实现",
  "static/3d-studio/approved-models.js": "模型清单由 scripts/models/specs/*.json 生成，不是运行时常量",
  "static/air-conditioner-style.js": "8 个样式包不拆包，改由 style-apply + style-packs 契约测试覆盖",
  "static/camera-style.js": "同上",
  "static/icon-button-effect-style.js": "同上",
  "static/icon-button-style.js": "同上",
  "static/line-chart-style.js": "同上",
  "static/navigation-style.js": "同上",
  "static/panel-frame-style.js": "同上",
  "static/title-button-style.js": "同上",
};

/** 归一化 basename：去掉扩展名与 `-`/`_`，转小写。 */
function normalize(rel) {
  const base = rel.split("/").pop();
  return base.replace(/\.(ts|tsx|vue|js|css|mjs)$/i, "").replace(/[-_]/g, "").toLowerCase();
}

/**
 * 单行分级（导出成纯函数便于测试）。
 *
 * 优先级：同名命中 > 改名落点 > 架构差异 > 待解释。顺序不能换 ——
 * 否则「同名但其实是另一个模块」会被架构差异表吃掉，反而不报缺口。
 */
export function classifyStatus({ hits, overrideTargets, structural }) {
  if (hits.length > 1) return "renamed";
  if (hits.length === 1) return "mechanical";
  if (overrideTargets.length > 0) return "overridden";
  if (structural) return "structural";
  return "missing";
}

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full, base, out);
    } else {
      out.push(relative(base, full));
    }
  }
  return out;
}

/** 架构差异表用前缀匹配：`static/vendor` 命中 `static/vendor/three/...`。 */
function structuralReason(upstream) {
  if (STRUCTURAL_DIFFERENCES[upstream]) return STRUCTURAL_DIFFERENCES[upstream];
  for (const [prefix, reason] of Object.entries(STRUCTURAL_DIFFERENCES)) {
    if (prefix.endsWith("/") ? upstream.startsWith(prefix) : upstream.startsWith(prefix + "/")) return reason;
  }
  return null;
}

function main() {
  const upstreamFiles = walk(UPSTREAM).filter((rel) => /\.(js|css)$/.test(rel));
  const projectFiles = walk(PROJECT_SRC).filter((rel) => /\.(ts|tsx|vue|css)$/.test(rel));

  const projectIndex = new Map();
  for (const rel of projectFiles) {
    const key = normalize(rel);
    if (!projectIndex.has(key)) projectIndex.set(key, []);
    projectIndex.get(key).push(rel);
  }

  // 落点可能不在 src 下（public/static），先校验存在性，避免这张表随重构腐烂。
  const overrideWarnings = [];
  for (const [upstream, targets] of Object.entries(MAPPING_OVERRIDES)) {
    for (const target of targets) {
      if (!existsSync(join(FRONTEND_ROOT, target))) overrideWarnings.push(`${upstream} → ${target}（落点不存在）`);
    }
  }

  const rows = [];
  for (const rel of upstreamFiles.sort()) {
    const key = normalize(rel);
    const hits = projectIndex.get(key) ?? [];
    const overridden = MAPPING_OVERRIDES[rel] ?? [];
    const structural = hits.length === 0 && overridden.length === 0 ? structuralReason(rel) : null;
    let status = "mechanical";
    let project = hits;
    if (hits.length === 0 && overridden.length > 0) {
      status = "overridden";
      project = overridden;
    } else if (hits.length === 0 && structural) {
      status = "structural";
      project = [];
    } else if (hits.length === 0) {
      status = "missing";
    } else if (hits.length > 1) {
      status = "renamed";
    }
    rows.push({
      upstream: rel,
      kind: rel.endsWith(".css") ? "css" : "js",
      project,
      status,
      ...(structural ? { reason: structural } : {}),
    });
  }

  const counts = rows.reduce(
    (acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }),
    {},
  );
  const usedProject = new Set(rows.flatMap((row) => row.project.map((rel) => (rel.startsWith("src/") ? rel.slice(4) : rel))));
  const projectOnly = projectFiles.filter((rel) => !usedProject.has(rel));

  const out = join(ROOT, `docs/port/${VERSION}/project-map.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        version: VERSION,
        summary: {
          upstream: rows.length,
          js: rows.filter((r) => r.kind === "js").length,
          css: rows.filter((r) => r.kind === "css").length,
          ...counts,
          projectFiles: projectFiles.length,
          projectOnly: projectOnly.length,
        },
        rows,
        projectOnly,
      },
      null,
      2,
    ),
  );

  console.log(`[map] 上游 ${rows.length} 个（js ${rows.filter((r) => r.kind === "js").length} / css ${rows.filter((r) => r.kind === "css").length}）`);
  console.log(
    `[map] 机械对齐 ${counts.mechanical ?? 0} / 改名落点 ${counts.overridden ?? 0} / 一拆多 ${counts.renamed ?? 0} / 架构差异 ${counts.structural ?? 0} / 待解释 ${counts.missing ?? 0}`,
  );
  console.log(`[map] 本项目 src 下 ${projectFiles.length} 个文件，其中 ${projectOnly.length} 个没有被任何上游文件命中`);
  for (const warning of overrideWarnings) console.warn(`[map] 警告：${warning}`);
  console.log(`[map] → ${relative(ROOT, out)}`);
  if (counts.missing) {
    console.log(`[map] 待解释（需要审计给结论）：`);
    for (const row of rows.filter((r) => r.status === "missing")) console.log(`       ${row.upstream}`);
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
