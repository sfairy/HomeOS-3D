/**
 * 槽位角色表推导 / 核对工具（对照 `homeos-3d 0.6.5`）。
 *
 * 背景：新 GLB 把 0.6.5 的多节点模型重新导出成了**单个 mesh 的多个图元**，
 * 图元顺序与 0.6.5 的槽位顺序不一致（washer / dryer / desk / shelf 等）。
 * 只按「0.6.5 的顺序」填 `MODEL_SLOT_ROLES` 会整体错位，得靠几何重新对位。
 *
 * 做法：把两侧图元都归一化到各自整机包围盒（尺寸按最长边归一、中心按逐轴边界归一），
 * 用 **全局一对一贪心指派** 求最小代价配对（避免逐图元独立取最近邻导致的两个图元抢同一个旧件），
 * 再输出「现表 vs 几何推导」的差异清单。代价 = 尺寸偏差 + 中心偏差（顶点数不可比，不参与）。
 *
 * 用法：
 *   bun tools/derive_model_slot_roles.ts            # 只列差异
 *   bun tools/derive_model_slot_roles.ts --all       # 列出全部配对
 *   bun tools/derive_model_slot_roles.ts --json      # 输出机器可读结果
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { MODEL_SLOT_ROLES } from "../frontend/src/app/3d-studio/materials/studio-model-material-roles";

const PROJECT_ROOT = join(import.meta.dir, "..");
const MODELS_DIR = join(PROJECT_ROOT, "frontend/public/static/3d-studio/models");
const REFERENCE_DIR = join(PROJECT_ROOT, "../homeos-3d 0.6.5/frontend/public/static/3d-studio/models");

const showAll = process.argv.includes("--all");
const asJson = process.argv.includes("--json");
const DIMS_TOLERANCE = Number(
  process.argv.find((a) => a.startsWith("--dims="))?.slice(7) ?? 0.12,
);
const CENTER_TOLERANCE = Number(
  process.argv.find((a) => a.startsWith("--center="))?.slice(9) ?? 0.14,
);

const NAME_ALIASES: Record<string, string> = {
  bunkbed: "bunk-bed",
  chestdrawer: "drawer-chest",
  armchair: "sofa-single",
  computertable: "desk",
  booktower: "shelf",
};

/** 资产名自带角色的模型（`<type>-furniture-role` 等）由素材决定角色，本表不权威，跳过。 */
const NAMED_ROLE_EXTERNAL = /-(?:furniture|detail|aquatic|tea|garden|decor)-[a-z0-9]/;

type Part = {
  index: number;
  name: string;
  count: number;
  /** 相对整机最长边的三边尺寸（降序，消除导出朝向差异）。 */
  dims: [number, number, number];
  /** 相对整机逐轴包围盒的中心坐标。 */
  center: [number, number, number];
  role?: string | null;
};

function readGlbJson(path: string): any {
  const buf = readFileSync(path);
  let offset = 12;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    offset += 8;
    if (type === 0x4e4f534a) return JSON.parse(buf.subarray(offset, offset + length).toString("utf8"));
    offset += length;
  }
  throw new Error(`no JSON chunk: ${path}`);
}

function collectGlbs(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name.endsWith(".glb") && !entry.name.includes("-lite")) {
        const key = basename(entry.name, ".glb");
        if (!found.has(key)) found.set(key, full);
      }
    }
  };
  walk(dir);
  return found;
}

function partsOf(path: string, withRoles: boolean): Part[] {
  const json = readGlbJson(path);
  const nodeRoleByMesh = new Map<number, string>();
  if (withRoles) {
    for (const node of json.nodes ?? []) {
      if (node.mesh === undefined) continue;
      const role = String(node.name ?? "").match(/material-\d+-([a-z][a-z0-9]*)/)?.[1];
      if (role) nodeRoleByMesh.set(node.mesh, role);
    }
  }
  const raw: Omit<Part, "dims" | "center">[] & { box: number[] }[] = [] as any;
  const boxes: number[][] = [];
  (json.meshes ?? []).forEach((mesh: any, meshIndex: number) => {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION];
      if (!accessor?.min || !accessor?.max) continue;
      const materialIndex = primitive.material ?? -1;
      const materialName = String(json.materials?.[materialIndex]?.name ?? "");
      const namedRole = materialName.match(/material-\d+-([a-z][a-z0-9]*)/)?.[1];
      const explicitIndex = Number(materialName.match(/material-(\d+)/)?.[1]);
      boxes.push([...accessor.min, ...accessor.max]);
      raw.push({
        index: Number.isFinite(explicitIndex) ? explicitIndex : materialIndex,
        name: materialName || `prim-${meshIndex}`,
        count: accessor.count ?? 0,
        role: namedRole ?? nodeRoleByMesh.get(meshIndex) ?? null,
      } as any);
    }
  });
  if (!raw.length) return [];
  const min = [0, 1, 2].map((axis) => Math.min(...boxes.map((box) => box[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...boxes.map((box) => box[3 + axis])));
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const middle = [0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2);
  return raw.map((part, position) => {
    const box = boxes[position];
    const dims = [0, 1, 2]
      .map((axis) => Math.abs(box[3 + axis] - box[axis]) / extent)
      .sort((a, b) => b - a) as [number, number, number];
    const center = [0, 1, 2].map(
      (axis) => ((box[axis] + box[3 + axis]) / 2 - middle[axis]) / extent,
    ) as [number, number, number];
    return { ...part, dims, center };
  });
}

const deviation = (a: number[], b: number[]) =>
  Math.max(...a.map((value, axis) => (Math.max(value, b[axis]) > 1e-9 ? Math.abs(value - b[axis]) / Math.max(value, b[axis]) : 0)));

const centerDistance = (a: number[], b: number[]) =>
  Math.max(...a.map((value, axis) => Math.abs(value - b[axis])));

type Pair = { next: Part; previous: Part; dimsDev: number; centerDev: number; cost: number };

/** 全局一对一贪心：代价升序取用，两侧都不再复用。 */
function assign(nextParts: Part[], previousParts: Part[]): Pair[] {
  const candidates: Pair[] = [];
  for (const next of nextParts) {
    for (const previous of previousParts) {
      const dimsDev = deviation(next.dims, previous.dims);
      const centerDev = centerDistance(next.center, previous.center);
      if (dimsDev > DIMS_TOLERANCE || centerDev > CENTER_TOLERANCE) continue;
      candidates.push({ next, previous, dimsDev, centerDev, cost: dimsDev * 1.6 + centerDev });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const usedNext = new Set<Part>();
  const usedPrevious = new Set<Part>();
  const accepted: Pair[] = [];
  for (const candidate of candidates) {
    if (usedNext.has(candidate.next) || usedPrevious.has(candidate.previous)) continue;
    usedNext.add(candidate.next);
    usedPrevious.add(candidate.previous);
    accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.next.index - b.next.index);
}

if (!existsSync(MODELS_DIR) || !existsSync(REFERENCE_DIR)) {
  console.error(`✗ 模型目录缺失：${MODELS_DIR} / ${REFERENCE_DIR}`);
  process.exit(1);
}

const referenceGlbs = collectGlbs(REFERENCE_DIR);
const nextGlbs = collectGlbs(MODELS_DIR);
const report: Record<string, unknown[]> = {};
const lines: string[] = [];
let changedModels = 0;

for (const [key, path] of nextGlbs) {
  const current = MODEL_SLOT_ROLES[key];
  if (!current) continue; // 非「槽位表驱动」的模型不在此工具范围内
  const json = readGlbJson(path);
  const materialNames = (json.materials ?? []).map((material: any) => String(material.name ?? ""));
  if (materialNames.some((name) => NAMED_ROLE_EXTERNAL.test(name))) continue;

  const referenceKey =
    Object.entries(NAME_ALIASES).find(([, value]) => value === key)?.[0] ?? key;
  const referencePath = referenceGlbs.get(referenceKey);
  if (!referencePath) continue;

  const previousParts = partsOf(referencePath, true).filter((part) => part.role);
  const nextParts = partsOf(path, false);
  if (!previousParts.length || !nextParts.length) continue;

  const pairs = assign(nextParts, previousParts);
  const entries = pairs.map((pair) => {
    const slot = pair.next.index;
    const proposed = pair.previous.role!;
    const existing = current[slot] ?? null;
    return {
      slot,
      material: pair.next.name,
      current: existing,
      proposed,
      dimsDev: Number(pair.dimsDev.toFixed(3)),
      centerDev: Number(pair.centerDev.toFixed(3)),
      cost: Number(pair.cost.toFixed(3)),
      nextShape: pair.next.dims.map((value) => value.toFixed(2)).join("×"),
      previousShape: pair.previous.dims.map((value) => value.toFixed(2)).join("×"),
      changed: existing !== proposed,
      confident: pair.dimsDev <= 0.08 && pair.centerDev <= 0.08,
    };
  });
  report[key] = entries;
  const changed = entries.filter((entry) => entry.changed);
  if (!changed.length && !showAll) continue;
  changedModels += changed.length ? 1 : 0;
  lines.push(
    `${key}  (现表 ${current.length} 槽 / 配对 ${entries.length} 个)` +
      (changed.length ? `  ← 建议改判 ${changed.length} 个` : ""),
  );
  for (const entry of entries) {
    if (!entry.changed && !showAll) continue;
    const mark = entry.changed ? (entry.confident ? "✗" : "?") : " ";
    lines.push(
      `  ${mark} #${String(entry.slot).padStart(2)} 现表=${String(entry.current ?? "(空)").padEnd(10)} ` +
        `几何=${entry.proposed.padEnd(10)} dims=${String(entry.dimsDev).padEnd(5)} ` +
        `center=${String(entry.centerDev).padEnd(5)} 新[${entry.nextShape}] 0.6.5[${entry.previousShape}]`,
    );
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("─".repeat(110));
  console.log(
    `几何推导（dims_tol=${DIMS_TOLERANCE} center_tol=${CENTER_TOLERANCE}）：` +
      `${changedModels} 个模型的现表与几何配对不一致`,
  );
  console.log("─".repeat(110));
  for (const line of lines) console.log(line);
}
