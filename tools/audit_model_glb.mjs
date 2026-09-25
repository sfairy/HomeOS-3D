/**
 * 3D 模型的 GLB 内容审计（开发工具，**不进 CI**）。
 *
 * 为什么需要它：`models/` 下的 GLB 曾经有两条来源不同、契约也不同的产线 ——
 *
 *   - **流水线产物**（`tools/models/model-specs.mjs` 里登记的那批，由 `generate-models.mjs`
 *     导出）：几何里烘进了变换、包围盒逐值等于规格 `size`、材质名一律 `material-<槽位号>`。
 *   - **外部既有资产**（别人按自己的工具链导出后放进来的）：材质名走的是另一套**同样被运行侧
 *     支持**的子串约定（`cushion` / `foliage` / `-soft` / `-light` / `-dark`），尺寸也各自为政。
 *
 * 2026-09 起注册表里的模型**已全部迁进流水线**，第二条产线不再有存量；但两套契约在运行侧
 * 都还留着分支，所以这份审计照样按两套判据跑 —— 第二条只在有人又放回外部资产时才有内容。
 *
 * 两者都会踩到同一个静默失效点：`loaders/studio-external-models.js` 的落地阶段按
 * `scale = 物件尺寸 / scaleBasis` 分轴缩放，**只认 `scaleBasis` 这一个数**。于是
 *
 *   - `scaleBasis` 与磁盘文件不一致时，成品被拉扁或拔高 —— 浏览器里只表现为「看着有点歪」，零报错；
 *   - 没声明 `scaleBasis` 时退回 `modelEntry.size`（装载时 `Box3.setFromObject` 的**实测值**），
 *     反而永远贴着物件尺寸，所以「声明错了」比「不声明」更糟。
 *
 * 它做两件事，第一件是**真值校验**（应当是绿的），第二件是**债务度量**（用来定优先级）：
 *
 *   1. 流水线产物：逐件核对包围盒 / 底面 `y = 0` / 占地居中 / 材质名 `material-<槽位号>` /
 *      lite 是否真的比完整版轻。这一件与 `check_invariants.mjs` 的第 19 条同源 ——
 *      护栏负责在 CI 里挡住回归，这里负责给人看细节。
 *
 *   2. 外部既有资产：度量「可见尺寸（= 文件包围盒）」与「声明占地（= `scaleBasis`，也是平面图
 *      画占地框用的那个数）」的偏差。**这一节 2026-09 已清零**：注册表里的模型全部迁进了流水线，
 *      于是这一节不再有明细，只作为「有人又塞回一件自有产线的资产」时的探测器留着 ——
 *      历史上它量到过 69 个里 44 个占地方向偏差 >5%（`tv_standard` 深 72%、`plant` 深 50%、
 *      `shower` 宽 49%）。修它要先决定方向 —— 改 `scaleBasis` 会把物件拉到声明尺寸、
 *      重新生成会换掉现有外观 —— 属于产品决策，所以刻意不设成护栏，只在这里列明细。
 *
 * ## 什么不算问题
 *
 *   - **底面不在 `y = 0`**：壁挂 / 吊装件（壁柜、壁挂电视、窗帘、壁灯、小便器、淋浴）的原点
 *     本来就不在底面，它们靠 `elevation` 摆位。自动贴地（`groundAlign`）那条路现已无物件使用：
 *     唯一用过它的 `sofa` 已改成流水线产物（底面本就精确落在 y=0），
 *     所以下面不再有「自动贴地」这一类。
 *   - **材质名不是 `material-<槽位号>`**：外部既有资产走上面那套子串约定。
 *     按流水线判据判就是纯误报。
 *
 * 判不准的一律放过 —— 这条底线与 `check_invariants.mjs` 一致。
 *
 * ## 用法
 *
 *   node tools/audit_model_glb.mjs           只读报告；仅流水线产物有问题时置退出码 1
 *   node tools/audit_model_glb.mjs --all     债务明细全量列出（默认只列偏差最大的 20 条）
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = file => path.relative(ROOT, file);
const MODELS_DIR = path.join(ROOT, "frontend", "static", "3d-studio", "models");
const EXTERNAL_MODELS_JS = path.join(
  ROOT,
  "frontend",
  "static",
  "3d-studio",
  "loaders",
  "studio-external-models.js"
);

/** 注册表条目：`类型: defineHomeItemModel("子目录", "文件基名", {`。与护栏用的是同一条。 */
const MODEL_ENTRY_RE =
  /^[ \t]*([a-z_0-9]+):\s*define(?:Home|Appliance)ItemModel\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,/gm;
/** 包围盒容差：1.5mm。生成器的规格校验是 1mm，这里多留 0.5mm 给导出往返的浮点误差。 */
const SIZE_TOLERANCE_METERS = 0.0015;
/** 债务度量里「值得看一眼」的门槛：占地方向相对偏差 5%。 */
const FOOTPRINT_DEBT_RATIO = 0.05;
const PRINT_ALL = process.argv.includes("--all");

/**
 * 读一个 GLB 的包围盒与材质名。只用 Node 内置能力解析容器（magic / chunk / JSON），
 * 不引 three —— 判据本身只需要 POSITION 访问器的 min/max。
 */
function readGlbSummary(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 12 || buffer.readUInt32LE(0) !== 0x46546c67) {
    return { error: "magic 不是 glTF（不是 GLB 文件）" };
  }
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    return { error: `头部声明 ${declaredLength} 字节、实际 ${buffer.length} 字节（文件被截断）` };
  }
  let offset = 12;
  let json = null;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    if (chunkType === 0x4e4f534a) {
      try {
        json = JSON.parse(buffer.subarray(offset + 8, offset + 8 + chunkLength).toString("utf8"));
      } catch (error) {
        return { error: `JSON chunk 解析失败：${error.message}` };
      }
    }
    offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
  }
  if (!json) {
    return { error: "缺 JSON chunk" };
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION];
      if (!accessor) {
        return { error: "网格缺 POSITION 访问器" };
      }
      vertices += accessor.count;
      if (accessor.min && accessor.max) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], accessor.min[axis]);
          max[axis] = Math.max(max[axis], accessor.max[axis]);
        }
      }
    }
  }
  if (!Number.isFinite(min[0])) {
    return { error: "所有 POSITION 访问器都没有 min/max，取不到包围盒" };
  }
  return { min, max, vertices, materials: (json.materials || []).map(material => material.name) };
}

/** 注册表里的全部条目，连同各条自己的选项块（`scaleBasis` / `preserveOrigin` 都在里面）。 */
function readRegistryEntries() {
  const text = fs.readFileSync(EXTERNAL_MODELS_JS, "utf8");
  MODEL_ENTRY_RE.lastIndex = 0;
  const entries = [];
  let match;
  while ((match = MODEL_ENTRY_RE.exec(text))) {
    entries.push({ itemType: match[1], modelDir: match[2], fileKey: match[3], index: match.index });
  }
  return entries.map((entry, index) => {
    const blockEnd = index + 1 < entries.length ? entries[index + 1].index : text.length;
    const block = text.slice(entry.index, blockEnd);
    const basisMatch = /scaleBasis:\s*\[([^\]]+)\]/.exec(block);
    const basis = basisMatch
      ? basisMatch[1].split(",").map(value => Number(value.trim()))
      : null;
    return {
      ...entry,
      basis: basis && basis.length === 3 && basis.every(Number.isFinite) ? basis : null,
      groundAlign: /groundAlign:\s*true/.test(block),
      preserveOrigin: /preserveOrigin:\s*true/.test(block)
    };
  });
}

/** 流水线产物：逐件核对，与护栏第 19 条同源。 */
function auditPipeline(specs) {
  const problems = [];
  const entries = readRegistryEntries();
  const checked = [];
  const slotNamePattern = /^material-(\d+)(?:-[a-z][a-z0-9]*)?$/;
  const axisNames = ["宽", "高", "深"];
  for (const entry of entries) {
    if (!specs[entry.itemType]) {
      continue;
    }
    const relative = `${entry.modelDir}/${entry.fileKey}`;
    const fullPath = path.join(MODELS_DIR, `${relative}.glb`);
    if (!fs.existsSync(fullPath)) {
      continue; // 存在性归 check_invariants.mjs 的模型注册表那条
    }
    const full = readGlbSummary(fullPath);
    if (full.error) {
      problems.push(`${rel(fullPath)}  ${entry.itemType}：读不了 —— ${full.error}`);
      continue;
    }
    checked.push(entry.itemType);
    const slotNumbers = [];
    for (const materialName of full.materials) {
      const slotMatch = slotNamePattern.exec(materialName || "");
      if (slotMatch) {
        slotNumbers.push(Number(slotMatch[1]));
      } else {
        problems.push(
          `${rel(fullPath)}  ${entry.itemType}：材质名「${materialName}」不是 material-<槽位号>`
        );
      }
    }
    if (new Set(slotNumbers).size !== slotNumbers.length) {
      problems.push(`${rel(fullPath)}  ${entry.itemType}：同一槽位出了多块材质（${slotNumbers.join(",")}）`);
    }
    if (entry.basis) {
      const actual = [full.max[0] - full.min[0], full.max[1] - full.min[1], full.max[2] - full.min[2]];
      // 高度按规格里的 `authoredHeight` 判（缺省等于 scaleBasis 的高）：有些物件的几何刻意伸出
      // 声明箱体之外（台盆的镜柜烘在台面以上），声明高度只描述落地柜体。
      const declared = [
        entry.basis[0],
        specs[entry.itemType].authoredHeight ?? entry.basis[1],
        entry.basis[2]
      ];
      for (let axis = 0; axis < 3; axis += 1) {
        const delta = Math.abs(actual[axis] - declared[axis]);
        if (delta > SIZE_TOLERANCE_METERS) {
          problems.push(
            `${rel(fullPath)}  ${entry.itemType}：磁盘${axisNames[axis]} ${actual[axis].toFixed(3)}m、` +
              `声明 ${declared[axis].toFixed(3)}m（差 ${(delta * 1000).toFixed(0)}mm）`
          );
        }
      }
      if (Math.abs(full.min[1]) > SIZE_TOLERANCE_METERS) {
        problems.push(
          `${rel(fullPath)}  ${entry.itemType}：底面 min.y = ${full.min[1].toFixed(3)}m 不在 y=0`
        );
      }
      for (const axis of [0, 2]) {
        const center = (full.min[axis] + full.max[axis]) / 2;
        if (Math.abs(center) > SIZE_TOLERANCE_METERS) {
          problems.push(
            `${rel(fullPath)}  ${entry.itemType}：${axis === 0 ? "x" : "z"} 方向占地中心 ${center.toFixed(3)}m 不在原点`
          );
        }
      }
    }
    const litePath = path.join(MODELS_DIR, `${relative}-lite.glb`);
    if (fs.existsSync(litePath)) {
      const lite = readGlbSummary(litePath);
      if (lite.error) {
        problems.push(`${rel(litePath)}  ${entry.itemType}：lite 读不了 —— ${lite.error}`);
      } else if (lite.vertices >= full.vertices) {
        problems.push(
          `${rel(litePath)}  ${entry.itemType}：lite ${lite.vertices} 顶点未低于完整版 ${full.vertices}`
        );
      }
    }
  }
  return { problems, checked };
}

/** 外部既有资产：度量「可见占地」与「声明占地」的偏差。这是债务，不是回归。 */
function auditLegacyDebt(specs) {
  const rows = [];
  for (const entry of readRegistryEntries()) {
    if (specs[entry.itemType] || !entry.basis) {
      continue;
    }
    const fullPath = path.join(MODELS_DIR, entry.modelDir, `${entry.fileKey}.glb`);
    if (!fs.existsSync(fullPath)) {
      continue;
    }
    const full = readGlbSummary(fullPath);
    if (full.error) {
      continue;
    }
    // 占地只看宽(X) / 深(Z)：平面图画的就是这两条，高度不进占地框。
    const widthRatio = Math.abs(full.max[0] - full.min[0] - entry.basis[0]) / entry.basis[0];
    const depthRatio = Math.abs(full.max[2] - full.min[2] - entry.basis[2]) / entry.basis[2];
    rows.push({
      itemType: entry.itemType,
      width: full.max[0] - full.min[0],
      depth: full.max[2] - full.min[2],
      declaredWidth: entry.basis[0],
      declaredDepth: entry.basis[2],
      widthRatio,
      depthRatio,
      worst: Math.max(widthRatio, depthRatio)
    });
  }
  return rows.sort((a, b) => b.worst - a.worst);
}

const { MODEL_SPECS } = await import(path.join(ROOT, "tools", "models", "model-specs.mjs"));

const pipeline = auditPipeline(MODEL_SPECS);
console.log(`\n真值校验 · 流水线产物（${pipeline.checked.length} 个，与 check_invariants.mjs 第 19 条同源）`);
if (pipeline.problems.length === 0) {
  console.log("  [ok] 包围盒 / 底面 / 占地居中 / 槽位命名 / lite 精简率 全部与规格一致");
} else {
  console.log(`  [fail] ${pipeline.problems.length} 处：`);
  for (const problem of pipeline.problems) {
    console.log(`    ${problem}`);
  }
}

const debt = auditLegacyDebt(MODEL_SPECS);
const drifting = debt.filter(row => row.worst > FOOTPRINT_DEBT_RATIO);
console.log(`\n债务度量 · 外部既有资产（${debt.length} 个）`);
if (debt.length === 0) {
  // 0 个时不再打百分比 —— 分母为 0 会打出 NaN%，而那不是「偏差很小」，是「已经没有这一节」。
  console.log("  [ok] 注册表里的模型全部是流水线产物（这一节只在有人塞回自有产线资产时有明细）");
} else {
  console.log(
    `  占地方向（可见尺寸 vs 声明 scaleBasis）偏差 >${FOOTPRINT_DEBT_RATIO * 100}%：` +
      `${drifting.length} 个（${((drifting.length / debt.length) * 100).toFixed(0)}%）`
  );
}
if (drifting.length) {
  const shown = PRINT_ALL ? drifting : drifting.slice(0, 20);
  console.log("\n    类型                可见(宽 × 深)        声明(宽 × 深)        宽偏差  深偏差");
  for (const row of shown) {
    console.log(
      `    ${row.itemType.padEnd(18)} ` +
        `${`${row.width.toFixed(2)} × ${row.depth.toFixed(2)}`.padEnd(20)} ` +
        `${`${row.declaredWidth.toFixed(2)} × ${row.declaredDepth.toFixed(2)}`.padEnd(20)} ` +
        `${(row.widthRatio * 100).toFixed(0).padStart(4)}%  ${(row.depthRatio * 100).toFixed(0).padStart(4)}%`
    );
  }
  if (!PRINT_ALL && drifting.length > shown.length) {
    console.log(`    …另有 ${drifting.length - shown.length} 个，加 --all 看全量`);
  }
  console.log(
    "\n  修它要先决定方向：改 scaleBasis 会把物件拉到声明尺寸（偏差最大的那个是 " +
      `${drifting[0].itemType} ${(drifting[0].worst * 100).toFixed(0)}%，` +
      "按声明尺寸缩放就是把它整体拉伸这么多），重新生成会换掉现有外观 —— 属于产品决策，" +
      "所以刻意不设成护栏。"
  );
}

console.log("");
if (pipeline.problems.length) {
  console.error("流水线产物有问题（这一部分应当是全绿的）。\n");
  process.exit(1);
}
console.log("流水线产物全部通过。\n");
