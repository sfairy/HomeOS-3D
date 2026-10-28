/**
 * GLB 结构比对：判断一个模型在版本之间到底「变了什么」。
 *
 * 为什么不能直接比字节：上游每次发版都会把模型重新导出，顶点/索引顺序、浮点末位、
 * JSON 里的 generator 字段都会变；654 个模型里 578 个字节不同，但其中 570 个只是
 * 重烘焙 —— 真正有语义变化（材质槽被删/加）的只有个位数。按字节比会得到 578 条噪音，
 * 按结构比才能把「掉槽」这种会破坏本项目材质契约的改动单独拎出来。
 *
 * GLB 结构：12 字节头（magic/version/length）+ 若干 chunk（length/type/data），
 * 第一个 chunk 一定是 JSON，后面可能有 BIN。这里只读 JSON 与 BIN 长度，不碰几何数据。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const GLB_MAGIC = 0x46546c67; // "glTF"

/** 解析 GLB 头与 chunk，返回 JSON 文档和 bin 长度。 */
export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path}: 不是 GLB 文件`);
  let offset = 12;
  let json = null;
  let binLength = 0;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8")); // "JSON"
    else if (type === 0x004e4942) binLength = length; // "BIN\0"
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error(`${path}: 缺少 JSON chunk`);
  return { json, binLength, bytes: buf.length };
}

/** 材质槽标识：优先用材质名，没有名字就退回索引，保证两版可比。 */
function materialSlots(json) {
  return (json.materials ?? []).map((m, i) => m.name ?? `#${i}`);
}

function nodeTransforms(json) {
  return (json.nodes ?? []).map((n) => ({
    name: n.name ?? "",
    t: n.translation ?? null,
    r: n.rotation ?? null,
    s: n.scale ?? null,
    mesh: n.mesh ?? null,
  }));
}

/** 结构指纹：材质集合 + accessor 计数 + 节点变换，用于快速判「结构是否一致」。 */
function structuralFingerprint(json) {
  const payload = JSON.stringify({
    materials: materialSlots(json),
    accessors: (json.accessors ?? []).length,
    meshes: (json.meshes ?? []).length,
    primitives: (json.meshes ?? []).reduce((n, m) => n + (m.primitives?.length ?? 0), 0),
    nodes: nodeTransforms(json),
    images: (json.images ?? []).length,
    animations: (json.animations ?? []).length,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * 比对两个 GLB。
 * @returns {{ kind: "identical"|"rebake"|"slot-drop"|"slot-add"|"structure", details: object }}
 */
export function diffGlb(leftPath, rightPath) {
  const a = readGlb(leftPath);
  const b = readGlb(rightPath);
  const aBytes = readFileSync(leftPath);
  const bBytes = readFileSync(rightPath);

  if (aBytes.equals(bBytes)) return { kind: "identical", details: {} };

  const slotA = materialSlots(a.json);
  const slotB = materialSlots(b.json);
  const removed = slotA.filter((s) => !slotB.includes(s));
  const added = slotB.filter((s) => !slotA.includes(s));
  const fpA = structuralFingerprint(a.json);
  const fpB = structuralFingerprint(b.json);

  const details = {
    slotsBefore: slotA.length,
    slotsAfter: slotB.length,
    removed,
    added,
    accessorsBefore: (a.json.accessors ?? []).length,
    accessorsAfter: (b.json.accessors ?? []).length,
    binBefore: a.binLength,
    binAfter: b.binLength,
    fingerprintSame: fpA === fpB,
  };

  if (removed.length > 0 && added.length === 0) return { kind: "slot-drop", details };
  if (added.length > 0 && removed.length === 0) return { kind: "slot-add", details };
  if (fpA === fpB) return { kind: "rebake", details };
  return { kind: "structure", details };
}

/** 递归列出目录下的 .glb（返回相对路径 → 绝对路径的映射）。 */
export function listGlb(dir, base = dir, out = new Map()) {
  for (const name of readdirSync(dir)) {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) listGlb(full, base, out);
    else if (name.endsWith(".glb")) out.set(full.slice(base.length + 1), full);
  }
  return out;
}
