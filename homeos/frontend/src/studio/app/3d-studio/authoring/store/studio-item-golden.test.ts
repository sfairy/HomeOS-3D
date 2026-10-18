
import { describe, expect, it, mock } from "bun:test";

/* 3D item golden 快照测试（C0）。
 *
 * 生产 item 构建器（items/studio-*.ts）静态 import 的是站点运行时路径
 * "/static/vendor/three/0.186.1/*"，bun 里不可解析。这里先把真实 three
 * （仓库根 node_modules/three）按同一组模块名 mock 进去，再动态 import
 * 生产构建器，因此测的是真实几何，而不是替身实现。
 */

const threeUrl = new URL(
  "../../../../../../../../node_modules/three/build/three.module.js",
  import.meta.url,
);
const three: any = await import(threeUrl.href);
const { RoundedBoxGeometry } = await import(
  new URL(
    "../../../../../../../../node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js",
    import.meta.url,
  ).href
);
const { mergeGeometries } = await import(
  new URL(
    "../../../../../../../../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js",
    import.meta.url,
  ).href
);

mock.module("three", () => three);
mock.module("/static/vendor/three/0.186.1/three.module.min.js", () => three);
mock.module("/static/vendor/three/0.186.1/RoundedBoxGeometry.js", () => ({ RoundedBoxGeometry }));

const { addBoxMesh, addFurnitureAssembly } = await import("../items/studio-mesh-primitives");
const { createFanModel } = await import("../items/studio-fan");
const { createAirerModel } = await import("../items/studio-airer");

const THEME = {
  appliance: 0xcfd6dd,
  applianceSoft: 0xe3e8ee,
  applianceDark: 0x95a0ab,
  warmWood: 0xc99a63,
  wood: 0xb07d4b,
  woodDark: 0x8a5f36,
  woodLight: 0xd9b07f,
  furnitureDark: 0x6f7377,
};

// 同时把 -0 归一成 0：Box3 在对称几何上会产生 -0，JSON/toEqual 会区分。
const round4 = (value: number) => {
  const rounded = Math.round(value * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
};

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const normalizeUserDataValue = (value: any): any => {
  if (typeof value === "number") return round4(value);
  if (typeof value === "string" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return "array:" + value.length;
  if (typeof value === "object") {
    const out: any = {};
    for (const key of Object.keys(value).sort()) out[key] = normalizeUserDataValue(value[key]);
    return out;
  }
  return "function";
};

type ItemSnapshot = {
  children: number;
  meshes: number;
  positions: number;
  triangles: number;
  coordHash: string;
  bounds: number[];
  materialCount: number;
  materialHash: string;
  userDataHash: string;
};

function snapshotItem(root: any): ItemSnapshot {
  const coordinates: number[] = [];
  const materials: any[] = [];
  const userData: any[] = [];
  let children = 0;
  let meshes = 0;
  let positions = 0;
  let triangles = 0;

  const visit = (object: any) => {
    children += 1;
    const normalized = normalizeUserDataValue(object?.userData ?? {});
    userData.push(Object.keys(normalized).length ? normalized : null);
    const geometry = object?.geometry;
    if (geometry && geometry.getAttribute) {
      meshes += 1;
      const position = geometry.getAttribute("position");
      const drawCount = geometry.index ? geometry.index.count : position.count;
      positions += position.count;
      triangles += Math.floor(drawCount / 3);
      for (let index = 0; index < position.count; index += 1) {
        coordinates.push(
          round4(position.getX(index)),
          round4(position.getY(index)),
          round4(position.getZ(index)),
        );
      }
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materialList) {
        materials.push({
          type: material?.type ?? null,
          color: material?.color?.getHexString?.() ?? null,
          emissive: typeof material?.emissive?.getHexString === "function"
            ? material.emissive.getHexString()
            : null,
          map: !!material?.map,
          opacity: material?.opacity ?? null,
          transparent: material?.transparent ?? null,
          roughness: material?.roughness ?? null,
          metalness: material?.metalness ?? null,
        });
      }
    }
    for (const child of object?.children ?? []) visit(child);
  };
  visit(root);

  const bounds = new three.Box3().setFromObject(root);
  return {
    children,
    meshes,
    positions,
    triangles,
    coordHash: fnv1aHex(coordinates.join(",")),
    bounds: [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].map(round4),
    materialCount: materials.length,
    materialHash: fnv1aHex(JSON.stringify(materials)),
    userDataHash: fnv1aHex(JSON.stringify(userData)),
  };
}

const buildFurnitureRoot = () => {
  const root = new three.Group();
  addFurnitureAssembly(root, 1.2, 0.8, 0.6, 0, 0, 0, THEME.furnitureDark, THEME.warmWood);
  return root;
};

const buildFanRoot = () => createFanModel(three, mergeGeometries, { width: 0.434, height: 1.23 }, THEME);
const buildAirerRoot = () =>
  createAirerModel(three, { elevation: 2.7, airerExtension: 1.2, width: 2.24, depth: 0.57 }, THEME);

const GOLDEN = {
  // RoundedBoxGeometry(1, 0.6, 0.5, segments=2)：24 面以内插圆角，300 三角。
  box: {
    children: 1,
    meshes: 1,
    positions: 900,
    triangles: 300,
    coordHash: "d8e4b081",
    bounds: [-0.5, 0, -0.25, 0.5, 0.6, 0.25],
    materialCount: 1,
    materialHash: "372c8aa6",
    userDataHash: "5f74b2a2",
  },
  // rounded: false 走 BoxGeometry：12 三角。
  boxSquare: {
    children: 1,
    meshes: 1,
    positions: 24,
    triangles: 12,
    coordHash: "87680103",
    bounds: [-0.5, 0, -0.25, 0.5, 0.6, 0.25],
    materialCount: 1,
    materialHash: "372c8aa6",
    userDataHash: "5f74b2a2",
  },
  // 柜体拼装：1 组 + 7 个盒体（其中 2 个 non-rounded 侧杆，但是 6 个 mesh 有几何）。
  furniture: {
    children: 8,
    meshes: 6,
    positions: 1896,
    triangles: 648,
    coordHash: "98b16277",
    bounds: [-0.54, 0, -0.348, 0.54, 0.57, 0.344],
    materialCount: 6,
    materialHash: "b15f9c3f",
    userDataHash: "ba140995",
  },
  // 落地扇：尺寸由 options.width/height 推导（fanScale/fanHeight 归一），41 个 mesh。
  fan: {
    children: 45,
    meshes: 41,
    positions: 25507,
    triangles: 21616,
    coordHash: "9f29ccb9",
    bounds: [-0.217, 0.003, -0.162, 0.217, 1.2275, 0.162],
    materialCount: 41,
    materialHash: "70ae88b9",
    userDataHash: "6ff485af",
  },
  // 电动双杆晾衣架：80 个节点，挂点/吊线由 armSegmentCount 推导。
  airer: {
    children: 80,
    meshes: 78,
    positions: 24350,
    triangles: 11720,
    coordHash: "56725ff7",
    bounds: [-1.12, -0.704, -0.284, 1.12, 0.019, 0.284],
    materialCount: 78,
    materialHash: "6e2c6499",
    userDataHash: "58ae1005",
  },
};

describe("3D item golden 快照", () => {
  it("addBoxMesh 默认圆角：几何/包围盒/材质与 golden 一致", () => {
    expect(snapshotItem(addBoxMesh(new three.Group(), 1, 0.6, 0.5, 0, 0.3, 0, 0xb07d4b))).toEqual(GOLDEN.box);
  });

  it("addBoxMesh rounded:false 走 BoxGeometry：12 三角且与圆角版轮廓一致", () => {
    const snapshot = snapshotItem(
      addBoxMesh(new three.Group(), 1, 0.6, 0.5, 0, 0.3, 0, 0xb07d4b, { rounded: false }),
    );
    expect(snapshot).toEqual(GOLDEN.boxSquare);
    expect(snapshot.triangles).toBeLessThan(GOLDEN.box.triangles);
    expect(snapshot.bounds).toEqual(GOLDEN.box.bounds);
  });

  it("addFurnitureAssembly：柜体拼装层级/三角数不变", () => {
    expect(snapshotItem(buildFurnitureRoot())).toEqual(GOLDEN.furniture);
  });

  it("createFanModel：落地扇尺寸归一与 41 个 mesh 不变", () => {
    expect(snapshotItem(buildFanRoot())).toEqual(GOLDEN.fan);
  });

  it("createAirerModel：晾衣架挂点/吊线几何不变", () => {
    expect(snapshotItem(buildAirerRoot())).toEqual(GOLDEN.airer);
  });

  it("同一构建器重复构建结果确定（无全局副作用）", () => {
    expect(snapshotItem(buildFanRoot())).toEqual(snapshotItem(buildFanRoot()));
    expect(snapshotItem(buildAirerRoot())).toEqual(snapshotItem(buildAirerRoot()));
    expect(snapshotItem(buildFurnitureRoot())).toEqual(snapshotItem(buildFurnitureRoot()));
  });

  it("fan / airer 的 rig userData 关键字段仍在（运行期热路径依赖）", () => {
    const fan = buildFanRoot();
    expect(fan.userData.dimensions.width).toBeCloseTo(0.434, 4);
    const fanParts: string[] = [];
    fan.traverse((node: any) => {
      if (node.userData?.fanPart) fanParts.push(node.userData.fanPart);
    });
    expect(fanParts).toEqual(["yaw", "rotor"]);

    const airer = buildAirerRoot();
    expect(airer.userData.airerStyle).toBe("double");
    expect(typeof airer.userData.airerRig?.pose).toBe("function");
    expect(airer.userData.airerRig.preview).toBe(55);
  });
});