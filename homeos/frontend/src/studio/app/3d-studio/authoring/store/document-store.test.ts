import { describe, expect, it } from "bun:test";
import {
  StudioDocumentStore,
  applyDocumentPatch,
  canApplyDocumentPatch,
  documentSignature,
  invertDocumentPatch,
  stableDocumentString,
} from "./document-store";
import type { DocumentPatch } from "./document-store";

function createDocumentFixture() {
  return {
    schemaVersion: 8,
    activeFloorId: "floor-a",
    defaultFloorHeight: 3,
    baseLighting: { intensity: 1, color: "#ffffff" },
    floors: [
      {
        id: "floor-a",
        name: "1层",
        elevation: 0,
        scene: {
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
        elevation: 3,
        scene: { items: [{ id: "item-b1", type: "bed", position: { x: 0, y: 0, z: 0 } }] },
      },
    ],
  };
}

describe("documentSignature", () => {
  it("同一文档对象键顺序不同 → 签名一致", () => {
    const left = createDocumentFixture();
    const right = JSON.parse(JSON.stringify(left));
    right.floors[0].scene.items[0] = { rotation: 0, position: { z: 2, y: 0, x: 1 }, type: "sofa", id: "item-1" };
    expect(documentSignature(left)).toBe(documentSignature(right));
  });

  it("易变版本/时间戳字段不参与签名", () => {
    const left = createDocumentFixture();
    const right = createDocumentFixture();
    (right as any).revision = 42;
    (right as any).updatedAt = "2024-05-01T00:00:00Z";
    (right as any).syncKey = "sync-key";
    expect(documentSignature(left)).toBe(documentSignature(right));
  });

  it("内容变化（坐标/数组顺序）→ 签名变化", () => {
    const left = createDocumentFixture();
    const moved = createDocumentFixture();
    moved.floors[0].scene.items[0].position.x = 1.5;
    expect(documentSignature(left)).not.toBe(documentSignature(moved));
    const reordered = createDocumentFixture();
    reordered.floors[0].scene.items.reverse();
    expect(documentSignature(left)).not.toBe(documentSignature(reordered));
  });

  it("stableDocumentString 归一化 NaN/Infinity 与 undefined", () => {
    const serialized = stableDocumentString({ b: [1, NaN, undefined], a: { y: 2, x: Infinity } });
    expect(serialized).toBe('{"a":{"x":null,"y":2},"b":[1,null,null]}');
  });
});

describe("DocumentPatch", () => {
  it("add 补丁按 index 插入，inverse 精确删除", () => {
    const document = createDocumentFixture();
    const patch: DocumentPatch = {
      kind: "add",
      floorId: "floor-a",
      entries: [{ item: { id: "item-new", type: "chair" }, index: 1 }],
    };
    expect(applyDocumentPatch(document, patch)).toBe(true);
    expect(document.floors[0].scene.items.map((item: any) => item.id)).toEqual([
      "item-1",
      "item-new",
      "item-2",
      "item-3",
    ]);
    expect(applyDocumentPatch(document, invertDocumentPatch(patch))).toBe(true);
    expect(document.floors[0].scene.items.map((item: any) => item.id)).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ]);
  });

  it("多选删除聚合成一个 remove 补丁（保留原 index），inverse 恢复顺序", () => {
    const document = createDocumentFixture();
    const removedItems = [document.floors[0].scene.items[0], document.floors[0].scene.items[2]];
    const patch: DocumentPatch = {
      kind: "remove",
      floorId: "floor-a",
      entries: [
        { item: removedItems[0], index: 0 },
        { item: removedItems[1], index: 2 },
      ],
    };
    expect(applyDocumentPatch(document, patch)).toBe(true);
    expect(document.floors[0].scene.items.map((item: any) => item.id)).toEqual(["item-2"]);
    expect(applyDocumentPatch(document, invertDocumentPatch(patch))).toBe(true);
    expect(document.floors[0].scene.items.map((item: any) => item.id)).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ]);
  });

  it("update/move 保留物件对象引用并交换 before/after", () => {
    const document = createDocumentFixture();
    const itemReference = document.floors[0].scene.items[0];
    const patch: DocumentPatch = {
      kind: "move",
      floorId: "floor-a",
      moves: [
        {
          itemId: "item-1",
          before: { id: "item-1", type: "sofa", position: { x: 1, y: 0, z: 2 }, rotation: 0 },
          after: { id: "item-1", type: "sofa", position: { x: 7, y: 0, z: 2 }, rotation: 15 },
        },
      ],
    };
    expect(applyDocumentPatch(document, patch)).toBe(true);
    expect(document.floors[0].scene.items[0]).toBe(itemReference);
    expect(itemReference.position.x).toBe(7);
    expect((itemReference as any).rotation).toBe(15);
    expect(applyDocumentPatch(document, invertDocumentPatch(patch))).toBe(true);
    expect(itemReference.position.x).toBe(1);
    expect((itemReference as any).rotation).toBe(0);
  });

  it("跨楼层补丁走各自 floorId；楼层不存在 / 物件缺失时 canApply=false 且不落修改", () => {
    const document = createDocumentFixture();
    const floorBPatch: DocumentPatch = {
      kind: "update",
      floorId: "floor-b",
      changes: [{ itemId: "item-b1", before: { id: "item-b1" }, after: { id: "item-b1", label: "主卧大床" } }],
    };
    expect(canApplyDocumentPatch(document, floorBPatch)).toBe(true);
    expect(applyDocumentPatch(document, floorBPatch)).toBe(true);
    expect((document.floors[1].scene.items[0] as any).label).toBe("主卧大床");

    const missingFloorPatch: DocumentPatch = { ...floorBPatch, floorId: "floor-missing" };
    expect(canApplyDocumentPatch(document, missingFloorPatch)).toBe(false);
    expect(applyDocumentPatch(document, missingFloorPatch)).toBe(false);
    const missingItemPatch: DocumentPatch = {
      kind: "remove",
      floorId: "floor-a",
      entries: [{ item: { id: "item-missing" }, index: 0 }],
    };
    expect(canApplyDocumentPatch(document, missingItemPatch)).toBe(false);
    expect(document.floors[0].scene.items).toHaveLength(3);
  });
});

describe("StudioDocumentStore", () => {
  it("两条版本线分离：loadedRevision 只随 GET/PUT 推进，runtimeSceneRevision 随本地改动推进", () => {
    const store = new StudioDocumentStore();
    store.applyLoaded({ revision: 5, scene: createDocumentFixture() });
    expect(store.getLoadedRevision()).toBe(5);
    expect(store.getRuntimeSceneRevision()).toBe(0);
    expect(store.isDirty()).toBe(false);

    store.markDirty({ kind: "add", floorId: "floor-a", entries: [{ item: { id: "x" }, index: 0 }] });
    expect(store.getLoadedRevision()).toBe(5);
    expect(store.getRuntimeSceneRevision()).toBe(1);
    expect(store.isDirty()).toBe(true);
    expect(store.getDirtyPatches()).toHaveLength(1);

    store.applySaved({ revision: 6, scene: store.getDocument() });
    expect(store.getLoadedRevision()).toBe(6);
    expect(store.getRuntimeSceneRevision()).toBe(0);
    expect(store.isDirty()).toBe(false);
    expect(store.getDirtyPatches()).toHaveLength(0);
  });

  it("applyRemote 在本地脏时拒绝覆盖，干净时采纳远端 revision", () => {
    const store = new StudioDocumentStore();
    store.applyLoaded({ revision: 3, scene: createDocumentFixture() });
    store.markDirty({ kind: "add", floorId: "floor-a", entries: [{ item: { id: "x" }, index: 0 }] });
    const refused = store.applyRemote({ revision: 9, scene: { floors: [] } });
    expect(refused).toEqual({ applied: false, reason: "local-dirty" });
    expect(store.getLoadedRevision()).toBe(3);
    expect(store.getDocument().floors).toHaveLength(2);

    store.applySaved({ revision: 4, scene: createDocumentFixture() });
    const applied = store.applyRemote({ revision: 9, scene: { floors: [{ id: "floor-a", scene: { items: [] } }] } });
    expect(applied).toEqual({ applied: true, revision: 9 });
    expect(store.getLoadedRevision()).toBe(9);
  });

  it("内容未变的脏标记（local === remote）仍算脏：isNoopDirty=true，不得静默跳过", () => {
    const store = new StudioDocumentStore();
    store.applyLoaded({ revision: 2, scene: createDocumentFixture() });
    store.markDirty({
      kind: "update",
      floorId: "floor-a",
      changes: [
        { itemId: "item-1", before: { id: "item-1", label: "old" }, after: { id: "item-1", label: "old" } },
      ],
    });
    expect(store.isDirty()).toBe(true);
    expect(store.isNoopDirty()).toBe(true);
    const movePatch = {
      kind: "move" as const,
      floorId: "floor-a",
      moves: [{ itemId: "item-1", before: { id: "item-1", position: { x: 1 } }, after: { id: "item-1", position: { x: 4 } } }],
    };
    expect(applyDocumentPatch(store.getDocument(), movePatch)).toBe(true);
    store.markDirty(movePatch);
    expect(store.isNoopDirty()).toBe(false);
    expect(store.getRuntimeSceneRevision()).toBe(2);
    expect(store.matchesRemoteDocument(createDocumentFixture())).toBe(false);
  });

  it("markWholeDocumentDirty：无补丁也变脏、推进 runtime 版本，applySaved 后归零", () => {
    const store = new StudioDocumentStore();
    store.applyLoaded({ revision: 7, scene: createDocumentFixture() });
    expect(store.isDirty()).toBe(false);

    store.markWholeDocumentDirty();
    store.markWholeDocumentDirty();
    expect(store.isDirty()).toBe(true);
    expect(store.getRuntimeSceneRevision()).toBe(2);
    expect(store.getDirtyPatches()).toHaveLength(0);
    expect(store.getLoadedRevision()).toBe(7);
    // local === remote 也必须是脏的（不得静默跳过保存）。
    expect(store.isNoopDirty()).toBe(true);

    store.applySaved({ revision: 8, scene: createDocumentFixture() });
    expect(store.isDirty()).toBe(false);
    expect(store.getRuntimeSceneRevision()).toBe(0);
    expect(store.getLoadedRevision()).toBe(8);
  });
});

describe("DocumentPatch 跨类型扩展（C5）", () => {
  it("field 指向 walls：只改墙数组，inverse 精确还原", () => {
    const document = createDocumentFixture();
    const firstFloor: any = document.floors[0];
    const wallReference: any = firstFloor.scene.walls[0];
    const patch: DocumentPatch = {
      kind: "move",
      floorId: "floor-a",
      field: "walls",
      moves: [
        {
          itemId: "wall-1",
          before: { id: "wall-1", start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
          after: { id: "wall-1", start: { x: 0, z: 0 }, end: { x: 6, z: 0 } },
        },
      ],
    };
    expect(applyDocumentPatch(document, patch)).toBe(true);
    expect(firstFloor.scene.walls[0]).toBe(wallReference);
    expect(wallReference.end.x).toBe(6);
    expect(firstFloor.scene.items).toHaveLength(3);
    expect(applyDocumentPatch(document, invertDocumentPatch(patch))).toBe(true);
    expect((wallReference as any).end.x).toBe(4);
  });

  it("replace 数组就地重排：保留元素对象引用", () => {
    const document = createDocumentFixture();
    const items = document.floors[0].scene.items;
    const [first, second, third] = items;
    const patch: DocumentPatch = {
      kind: "replace",
      floorId: "floor-a",
      field: "items",
      before: [first, second, third],
      after: [third, first, second],
    };
    expect(applyDocumentPatch(document, patch)).toBe(true);
    expect(items[0]).toBe(third);
    expect(items[1]).toBe(first);
    expect(items[2]).toBe(second);
    expect(invertDocumentPatch(patch)).toMatchObject({ kind: "replace", field: "items" });
    expect(applyDocumentPatch(document, invertDocumentPatch(patch))).toBe(true);
    expect(items[0]).toBe(first);
  });

  it("replace 对象字段（background）就地覆盖", () => {
    const document = createDocumentFixture();
    (document.floors[0].scene as any).background = { visible: true, opacity: 1 };
    const backgroundReference = (document.floors[0].scene as any).background;
    const patch: DocumentPatch = {
      kind: "replace",
      floorId: "floor-a",
      field: "background",
      before: { visible: true, opacity: 1 },
      after: { visible: false, opacity: 0.5 },
    };
    expect(applyDocumentPatch(document, patch)).toBe(true);
    expect((document.floors[0].scene as any).background).toBe(backgroundReference);
    expect((backgroundReference as any).visible).toBe(false);
    expect((backgroundReference as any).opacity).toBe(0.5);
  });

  it("batch：跨楼层事务一次校验/应用，inverse 逆序还原", () => {
    const document = createDocumentFixture();
    const batch: DocumentPatch = {
      kind: "batch",
      patches: [
        {
          kind: "remove",
          floorId: "floor-a",
          entries: [{ item: { id: "item-2" }, index: 1 }],
        },
        {
          kind: "update",
          floorId: "floor-b",
          changes: [{ itemId: "item-b1", before: { id: "item-b1" }, after: { id: "item-b1", label: "主卧" } }],
        },
        {
          kind: "add",
          floorId: "floor-a",
          entries: [{ item: { id: "item-new", type: "chair" }, index: 0 }],
        },
      ],
    };
    expect(canApplyDocumentPatch(document, batch)).toBe(true);
    expect(applyDocumentPatch(document, batch)).toBe(true);
    expect(document.floors[0].scene.items.map((item: any) => item.id)).toEqual([
      "item-new",
      "item-1",
      "item-3",
    ]);
    expect((document.floors[1].scene.items[0] as any).label).toBe("主卧");
    expect(applyDocumentPatch(document, invertDocumentPatch(batch))).toBe(true);
    expect(document.floors[0].scene.items.map((item: any) => item.id)).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ]);
    expect((document.floors[1].scene.items[0] as any).label).toBeUndefined();
  });

  it("batch 中任一条不可应用 → canApply=false 且整批不落修改", () => {
    const document = createDocumentFixture();
    const batch: DocumentPatch = {
      kind: "batch",
      patches: [
        { kind: "remove", floorId: "floor-a", entries: [{ item: { id: "item-1" }, index: 0 }] },
        { kind: "remove", floorId: "floor-a", entries: [{ item: { id: "item-missing" }, index: 0 }] },
      ],
    };
    expect(canApplyDocumentPatch(document, batch)).toBe(false);
    expect(applyDocumentPatch(document, batch)).toBe(false);
    expect(document.floors[0].scene.items).toHaveLength(3);
  });

  it("空 batch / 结构非法的 batch 不可应用", () => {
    const document = createDocumentFixture();
    expect(canApplyDocumentPatch(document, { kind: "batch", patches: [] })).toBe(false);
    expect(canApplyDocumentPatch(document, { kind: "batch", patches: [null as any] })).toBe(false);
  });
});