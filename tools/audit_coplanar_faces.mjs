/**
 * 共面重叠面检测：找出「两块不同槽位的面落在同一个平面上、而且在平面上有重叠」的地方。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 仓库路径来自 paths.mjs（唯一事实来源）。
import {
  MODELS_DIR,
  STATIC_DIR,
} from "./paths.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const REGISTRY_PATH = path.join(STATIC_DIR,
  "3d-studio",
  "loaders",
  "studio-external-models.js"
);

const args = process.argv.slice(2);
const minAreaArg = args.find(a => a.startsWith("--min-area="));
const MIN_OVERLAP_AREA = minAreaArg ? Number(minAreaArg.split("=")[1]) : 0.00005;
const PLANE_EPSILON = 0.0004;
const PLANE_QUANTUM = 0.0005;
const onlyModel = args.find(a => a.startsWith("--model="))?.split("=")[1] ?? null;
const onlyFile = args.find(a => a.startsWith("--file="))?.split("=")[1] ?? null;
const asJson = args.includes("--json");
const allFaces = args.includes("--all-faces");

/**
 * 运行侧会改成双面渲染的角色。名单来源是 studio-external-models.js 里那两处
 */
const DOUBLE_SIDED_ROLES = new Set(["glass"]);

/** 从 `material-<槽位号>-<角色>` 里取角色；老资产没有角色段，返回空串。 */
function roleOf(materialName) {
  const match = /^material-\d+-([a-z]+)$/.exec(materialName ?? "");
  return match ? match[1] : "";
}

const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENT_READ = {
  5120: (view, offset) => view.getInt8(offset),
  5121: (view, offset) => view.getUint8(offset),
  5122: (view, offset) => view.getInt16(offset, true),
  5123: (view, offset) => view.getUint16(offset, true),
  5125: (view, offset) => view.getUint32(offset, true),
  5126: (view, offset) => view.getFloat32(offset, true)
};

function readAccessor(json, binary, index, componentCount) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? COMPONENT_SIZE[accessor.componentType] * componentCount;
  const reader = COMPONENT_READ[accessor.componentType];
  const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const out = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const row = [];
    for (let c = 0; c < componentCount; c += 1) {
      row.push(reader(dataView, start + i * stride + c * COMPONENT_SIZE[accessor.componentType]));
    }
    out.push(row);
  }
  return out;
}

/** 两个三角形在平面内的重叠面积（Sutherland–Hodgman 裁剪，投影到平面的另两轴）。 */
function overlapArea(triangleA, triangleB, axis) {
  const drop = point => {
    if (axis === 0) return [point[1], point[2]];
    if (axis === 1) return [point[0], point[2]];
    return [point[0], point[1]];
  };
  let subject = triangleA.map(drop);
  const clip = triangleB.map(drop);
  // 保证裁剪多边形方向一致。
  const signedArea = polygon => {
    let sum = 0;
    for (let i = 0; i < polygon.length; i += 1) {
      const [x1, y1] = polygon[i];
      const [x2, y2] = polygon[(i + 1) % polygon.length];
      sum += x1 * y2 - x2 * y1;
    }
    return sum / 2;
  };
  if (signedArea(clip) < 0) clip.reverse();
  for (let i = 0; i < clip.length; i += 1) {
    const [x1, y1] = clip[i];
    const [x2, y2] = clip[(i + 1) % clip.length];
    const inside = point => (x2 - x1) * (point[1] - y1) - (y2 - y1) * (point[0] - x1) >= -1e-12;
    const output = [];
    for (let j = 0; j < subject.length; j += 1) {
      const current = subject[j];
      const previous = subject[(j + subject.length - 1) % subject.length];
      const currentInside = inside(current);
      const previousInside = inside(previous);
      if (currentInside) {
        if (!previousInside) {
          const denominator = (x2 - x1) * (previous[1] - current[1]) - (y2 - y1) * (previous[0] - current[0]);
          if (Math.abs(denominator) > 1e-12) {
            const t =
              ((x2 - x1) * (previous[1] - y1) - (y2 - y1) * (previous[0] - x1)) / denominator;
            output.push([previous[0] + t * (current[0] - previous[0]), previous[1] + t * (current[1] - previous[1])]);
          }
        }
        output.push(current);
      } else if (previousInside) {
        const denominator = (x2 - x1) * (previous[1] - current[1]) - (y2 - y1) * (previous[0] - current[0]);
        if (Math.abs(denominator) > 1e-12) {
          const t = ((x2 - x1) * (previous[1] - y1) - (y2 - y1) * (previous[0] - x1)) / denominator;
          output.push([previous[0] + t * (current[0] - previous[0]), previous[1] + t * (current[1] - previous[1])]);
        }
      }
    }
    subject = output;
    if (subject.length === 0) return 0;
  }
  return Math.abs(signedArea(subject));
}

function faceNormal(triangle) {
  const [a, b, c] = triangle;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(n[0], n[1], n[2]);
  if (length === 0) return [0, 0, 0];
  return [n[0] / length, n[1] / length, n[2] / length];
}

function collectPlanes(file) {
  const buffer = fs.readFileSync(file);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  const binaryStart = 20 + jsonLength + 8;
  const binary = buffer.subarray(binaryStart);
  const planes = new Map();
  let triangleCount = 0;
  const skipped = [];
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const material = json.materials[primitive.material]?.name ?? "(无材质)";
      // 既有资产里偶有 bufferView 缺失（sparse 访问器或指到外部 .bin）的图元：这种 GLB 本来
      if (json.accessors?.[primitive.attributes?.POSITION]?.bufferView === undefined) {
        skipped.push(`${material}：POSITION 访问器没有 bufferView（sparse / 外部引用）`);
        continue;
      }
      const positions = readAccessor(json, binary, primitive.attributes.POSITION, 3);
      const indices = primitive.indices !== undefined
        ? readAccessor(json, binary, primitive.indices, 1).map(row => row[0])
        : positions.map((_, i) => i);
      for (let i = 0; i < indices.length; i += 3) {
        const triangle = [positions[indices[i]], positions[indices[i + 1]], positions[indices[i + 2]]];
        if (triangle.some(point => !point)) continue;
        triangleCount += 1;
        const normal = faceNormal(triangle);
        for (const axis of [0, 1, 2]) {
          const values = triangle.map(point => point[axis]);
          if (Math.max(...values) - Math.min(...values) > PLANE_EPSILON) continue;
          const bucket = Math.round(values[0] / PLANE_QUANTUM);
          const key = `${axis}:${bucket}`;
          if (!planes.has(key)) planes.set(key, []);
          planes.get(key).push({ material, triangle, coordinate: values[0], facing: Math.sign(normal[axis]) });
        }
      }
    }
  }
  return { planes, triangleCount, skipped };
}

function findOverlaps(file) {
  const { planes, triangleCount, skipped } = collectPlanes(file);
  const results = [];
  for (const [key, list] of planes) {
    const axis = Number(key.split(":")[0]);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (a.material === b.material) continue;
        if (Math.abs(a.coordinate - b.coordinate) > PLANE_EPSILON) continue;
        const area = overlapArea(a.triangle, b.triangle, axis);
        if (area < MIN_OVERLAP_AREA) continue;
        // 同向 = 真会闪；背靠背 = 单面渲染下被背面剔除挡住，只有两侧沾到双面角色时才报。
        const throughGlass =
          DOUBLE_SIDED_ROLES.has(roleOf(a.material)) || DOUBLE_SIDED_ROLES.has(roleOf(b.material));
        const sameFacing = a.facing * b.facing >= 0;
        results.push({
          axis: ["x", "y", "z"][axis],
          coordinate: (a.coordinate + b.coordinate) / 2,
          materials: [a.material, b.material].sort().join(" ↔ "),
          area,
          sameFacing,
          throughGlass
        });
      }
    }
  }
  // 同一对材质在同一平面上往往有很多三角形：按「平面 + 材质对」汇总，只留最大的那块。
  const grouped = new Map();
  for (const row of results) {
    const key = `${row.axis}:${row.coordinate.toFixed(3)}:${row.materials}`;
    const existing = grouped.get(key);
    if (!existing || existing.area < row.area) {
      grouped.set(key, row);
    }
  }
  const rows = [...grouped.values()].sort((a, b) => b.area - a.area);
  const flaggedRows = allFaces ? rows : rows.filter(row => row.sameFacing || row.throughGlass);
  return {
    rows: flaggedRows,
    allRows: rows,
    fixable: rows.filter(row => !row.sameFacing && !row.throughGlass).length,
    triangleCount,
    skipped
  };
}

/** 从注册表读「类型 → 目录 + 文件名」，与运行侧真正会加载的那份清单同源。 */
function registryTargets() {
  const source = fs.readFileSync(REGISTRY_PATH, "utf8");
  return [
    ...source.matchAll(
      /^[ \t]*([a-z_0-9]+):\s*define(?:Home|Appliance)ItemModel\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,/gm
    )
  ].map(match => ({ type: match[1], dir: match[2], fileKey: match[3] }));
}

const targets = onlyFile
  ? [{ type: path.basename(onlyFile, ".glb"), file: onlyFile }]
  : registryTargets()
      .filter(entry => !onlyModel || entry.type === onlyModel)
      .flatMap(entry =>
        ["", "-lite"].map(variant => ({
          type: entry.type + variant,
          file: path.join(MODELS_DIR, entry.dir, `${entry.fileKey}${variant}.glb`)
        }))
      );

const report = [];
let flagged = 0;
let sameFacingTotal = 0;
let throughGlassTotal = 0;
let harmlessTotal = 0;
for (const target of targets) {
  if (!fs.existsSync(target.file)) continue;
  const { rows, allRows, fixable, triangleCount, skipped } = findOverlaps(target.file);
  for (const row of allRows) {
    if (row.sameFacing) sameFacingTotal += 1;
    else if (row.throughGlass) throughGlassTotal += 1;
    else harmlessTotal += 1;
  }
  report.push({ ...target, rows, allRows, fixable, triangleCount, skipped });
  if (rows.length > 0) flagged += 1;
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        minArea: MIN_OVERLAP_AREA,
        allFaces,
        flagged,
        sameFacingTotal,
        throughGlassTotal,
        harmlessTotal,
        unreadable: report
          .filter(entry => entry.skipped.length > 0)
          .map(entry => ({ file: path.relative(ROOT, entry.file), type: entry.type, skipped: entry.skipped })),
        files: report
          .filter(entry => entry.rows.length > 0)
          .map(entry => ({
            file: path.relative(ROOT, entry.file),
            type: entry.type,
            triangles: entry.triangleCount,
            rows: entry.rows.map(row => ({
              axis: row.axis,
              coordinate: Number(row.coordinate.toFixed(3)),
              materials: row.materials,
              areaCm2: Number((row.area * 10000).toFixed(1)),
              sameFacing: row.sameFacing,
              throughGlass: row.throughGlass
            }))
          }))
      },
      null,
      2
    )
  );
} else {
  for (const entry of report) {
    if (entry.rows.length === 0) continue;
    console.log(
      `\n${path.relative(MODELS_DIR, entry.file)}  ${entry.type}（${entry.triangleCount} 三角）`
    );
    for (const row of entry.rows.slice(0, 8)) {
      // 三种关系分开写：`--all-faces` 会连背靠背一起列出来，若统一写成「玻璃双面」，
      const kind = row.sameFacing ? "同向" : row.throughGlass ? "玻璃双面" : "背靠背";
      console.log(
        `  ${row.axis}=${row.coordinate.toFixed(3)}m  ${row.materials.padEnd(44)} 重叠 ${(row.area * 10000)
          .toFixed(1)
          .padStart(7)}cm²  ${kind}`
      );
    }
    if (entry.rows.length > 8) console.log(`  …另 ${entry.rows.length - 8} 处`);
  }
  console.log(
    allFaces
      ? `\n共 ${flagged} 个文件存在共面重叠（**含背靠背**，--all-faces）：` +
          `同向 ${sameFacingTotal} 处、玻璃双面 ${throughGlassTotal} 处、背靠背 ${harmlessTotal} 处。`
      : `\n共 ${flagged} 个文件存在**会闪的**共面重叠（容差 ${(MIN_OVERLAP_AREA * 10000).toFixed(1)}cm²）：` +
          `同向 ${sameFacingTotal} 处、玻璃双面 ${throughGlassTotal} 处。`
  );
  if (!allFaces) {
    console.log(
      `另有 ${harmlessTotal} 处背靠背贴面（单面渲染下被背面剔除，不闪、未计入）—— 加 --all-faces 可一并列出。`
    );
  }
}
// 读不动的图元（sparse / 外部引用）单独点出来：这些文件本就不该走这条产线，但必须让调用方
const unreadable = report.filter(entry => entry.skipped.length > 0);
if (unreadable.length > 0) {
  const write = asJson
    ? (...line) => console.error(...line)
    : (...line) => console.log(...line);
  write(`\n有 ${unreadable.length} 个文件里的图元读不动（这些件没判，不是没问题）：`);
  for (const entry of unreadable) {
    write(`  ${path.relative(MODELS_DIR, entry.file)}  ${entry.type}`);
    for (const detail of entry.skipped) write(`    ${detail}`);
  }
}
