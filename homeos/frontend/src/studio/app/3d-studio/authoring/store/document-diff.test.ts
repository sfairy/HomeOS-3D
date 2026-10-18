import { describe, expect, it } from "bun:test";
import { applyDocumentPatch, documentSignature, invertDocumentPatch } from "./document-store";
import { diffDocumentPatches, diffFloorScenePatches, diffSceneArrayField } from "./document-diff";

function createDocumentFixture() {
  return {
    schemaVersion: 8,
    activeFloorId: "floor-a",
    floors: [
      {
        id: "floor-a",
        name: "1层",
        scene: {
          settings: { backgroundVisible: true, cameraView: { yaw: 0 } },
          items: [
            { id: "item-1", type: "sofa", position: { x: 1, y: 0, z: 2 }, rotation: 0 },
            { id: "item-2", type: "table", position: { x: 2, y: 0, z: 2 }, rotation: 90 },
            { id: "item-3", type: "lamp", position: { x: 3, y: 0, z: 2 }, rotation: 0 },
          ],
          walls: [{ id: "wall-1", start: { x: 0, z: 0 }, end: { x: 4, z: 0 } }],
        },
      },
      {
        id: "floor-b",
        name: "2层",
        scene: {
          settings: { backgroundVisible: true },
          items: [{ id: "item-b1", type: "bed", position: { x: 0, y: 0, z: 0 } }],
        },
      },
    ],
  };
}

describe("diffDocumentPatches", () => {
  it("无内容差异 → null（选中/相机变化不产生历史）", () => {
    const before = createDocumentFixture();
    const after = JSON.parse(JSON.stringify(before));
    after.floors[0].scene.settings.cameraView = { yaw: 45 };
    after.floors[0].scene.settings.backgroundVisible = false;
    expect(diffDocumentPatches(before, after)).toBeNull();
  });

  it("增删改移聚合成一个 batch，应用后与 after 内容一致，inverse 回到 before", () => {
    const before = createDocumentFixture();
    const after = JSON.parse(JSON.stringify(before));
    after.floors[0].scene.items.splice(1, 1);
    after.floors[0].scene.items.push({ id: "item-4", type: "chair", position: { x: 5, y: 0, z: 5 }, rotation: 0 });
    after.floors[0].scene.items[0].position.x = 9;
    after.floors[0].scene.items[2].rotation = 180;
    const patch = diffDocumentPatches(before, after);
    expect(patch).not.toBeNull();
    const working = createDocumentFixture();
    expect(applyDocumentPatch(working, patch as any)).toBe(true);
    expect(documentSignature(working)).toBe(documentSignature(after));
    expect(applyDocumentPatch(working, invertDocumentPatch(patch as any))).toBe(true);
    expect(documentSignature(working)).toBe(documentSignature(before));
  });

  it("顺序变化 → 该字段整字段 replace", () => {
    const before = createDocumentFixture();
    const after = JSON.parse(JSON.stringify(before));
    after.floors[0].scene.items.reverse();
    const patches = diffSceneArrayField("floor-a", "items", before.floors[0].scene.items, after.floors[0].scene.items);
    expect(patches).toHaveLength(1);
    expect(patches[0].kind).toBe("replace");
    const working = createDocumentFixture();
    expect(applyDocumentPatch(working, patches[0])).toBe(true);
    expect(working.floors[0].scene.items.map((item: any) => item.id)).toEqual(["item-3", "item-2", "item-1"]);
  });

  it("无 id 元素 → replace 兜底", () => {
    const patches = diffSceneArrayField("floor-a", "walls", [{ start: { x: 0 } }], [{ start: { x: 1 } }]);
    expect(patches).toHaveLength(1);
    expect(patches[0].kind).toBe("replace");
  });

  it("跨楼层改动 → batch 覆盖各楼层 floorId", () => {
    const before = createDocumentFixture();
    const after = JSON.parse(JSON.stringify(before));
    after.floors[0].scene.items[0].label = "转角沙发";
    after.floors[1].scene.items[0].label = "主卧大床";
    const patch = diffDocumentPatches(before, after);
    expect(patch?.kind).toBe("batch");
    expect((patch as any).patches.map((entry: any) => entry.floorId)).toEqual(["floor-a", "floor-b"]);
    const working = createDocumentFixture();
    expect(applyDocumentPatch(working, patch as any)).toBe(true);
    expect((working.floors[0].scene.items[0] as any).label).toBe("转角沙发");
    expect((working.floors[1].scene.items[0] as any).label).toBe("主卧大床");
  });

  it("background 等对象字段变化 → replace", () => {
    const before = createDocumentFixture();
    (before.floors[0].scene as any).background = { visible: true, opacity: 1 };
    const after = JSON.parse(JSON.stringify(before));
    (after.floors[0].scene as any).background = { visible: false, opacity: 0.4 };
    const patches = diffFloorScenePatches("floor-a", before.floors[0].scene, after.floors[0].scene);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ kind: "replace", floorId: "floor-a", field: "background" });
    const working = JSON.parse(JSON.stringify(before));
    expect(applyDocumentPatch(working, patches[0])).toBe(true);
    expect((working.floors[0].scene as any).background.opacity).toBe(0.4);
  });

  it("只改属性（非位移）→ update，只改位置/旋转 → move", () => {
    const before = createDocumentFixture();
    const after = JSON.parse(JSON.stringify(before));
    after.floors[0].scene.items[0].material = "leather";
    after.floors[0].scene.items[1].position.x = 4;
    const patches = diffDocumentPatches(before, after);
    const flat = patches?.kind === "batch" ? patches.patches : [patches];
    const kinds = flat.map((entry: any) => entry.kind).sort();
    expect(kinds).toEqual(["move", "update"]);
  });
});
