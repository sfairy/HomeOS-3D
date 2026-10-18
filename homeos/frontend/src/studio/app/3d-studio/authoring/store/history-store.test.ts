import { describe, expect, it } from "bun:test";
import {
  DEFAULT_HISTORY_MAX_ENTRIES,
  StudioHistoryStore,
  estimateHistoryEntryBytes,
  utf8ByteLength,
} from "./history-store";
import { applyDocumentPatch, invertDocumentPatch } from "./document-store";
import type { DocumentPatch } from "./document-store";

function createDocument() {
  return {
    schemaVersion: 8,
    floors: [
      {
        id: "floor-a",
        scene: {
          items: [
            { id: "item-1", type: "sofa", position: { x: 0, y: 0, z: 0 }, rotation: 0 },
            { id: "item-2", type: "table", position: { x: 1, y: 0, z: 0 }, rotation: 0 },
            { id: "item-3", type: "lamp", position: { x: 2, y: 0, z: 0 }, rotation: 0 },
          ],
        },
      },
    ],
  };
}

function createStore(document: any, options: Record<string, unknown> = {}) {
  return new StudioHistoryStore({
    apply: (patch: DocumentPatch) => applyDocumentPatch(document, patch),
    ...options,
  });
}

const movePatch = (itemId: string, fromX: number, toX: number): DocumentPatch => ({
  kind: "move",
  floorId: "floor-a",
  moves: [{ itemId, before: { id: itemId, position: { x: fromX } }, after: { id: itemId, position: { x: toX } } }],
});

describe("utf8ByteLength / estimateHistoryEntryBytes", () => {
  it("按码点计算 UTF-8 字节数（中文 3 字节、emoji 4 字节）", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("沙发")).toBe(6);
    expect(utf8ByteLength("🛋")).toBe(4);
  });

  it("条目字节数包含 patch + inverse", () => {
    const entry = { patch: movePatch("item-1", 0, 3), inverse: invertDocumentPatch(movePatch("item-1", 0, 3)), label: "移动", at: 1 };
    const expected =
      utf8ByteLength(JSON.stringify(entry.patch)) + utf8ByteLength(JSON.stringify(entry.inverse));
    expect(estimateHistoryEntryBytes(entry)).toBe(expected);
  });
});

describe("StudioHistoryStore 基本撤销/重做", () => {
  it("undo 应用 inverse，redo 重新应用 patch", () => {
    const document = createDocument();
    const store = createStore(document);
    const patch = movePatch("item-1", 0, 5);
    applyDocumentPatch(document, patch);
    store.record(patch, "拖动沙发");
    expect(store.undoDepth).toBe(1);
    expect(store.redoDepth).toBe(0);

    const undone = store.undo();
    expect(undone.ok).toBe(true);
    expect(document.floors[0].scene.items[0].position.x).toBe(0);
    expect(store.undoDepth).toBe(0);
    expect(store.redoDepth).toBe(1);

    const redone = store.redo();
    expect(redone.ok).toBe(true);
    expect(document.floors[0].scene.items[0].position.x).toBe(5);
    expect(store.undoDepth).toBe(1);
    expect(store.redoDepth).toBe(0);
  });

  it("空栈 undo/redo 返回 empty 而不是抛错", () => {
    const store = createStore(createDocument());
    expect(store.undo()).toMatchObject({ ok: false, reason: "empty" });
    expect(store.redo()).toMatchObject({ ok: false, reason: "empty" });
  });

  it("新操作清空 redo 栈与 redo 字节数", () => {
    const document = createDocument();
    const store = createStore(document);
    const first = movePatch("item-1", 0, 1);
    applyDocumentPatch(document, first);
    store.record(first, "第一次移动");
    store.undo();
    expect(store.redoDepth).toBe(1);
    expect(store.byteSizes.redo).toBeGreaterThan(0);

    const second = movePatch("item-2", 1, 2);
    applyDocumentPatch(document, second);
    store.record(second, "第二次移动");
    expect(store.redoDepth).toBe(0);
    expect(store.byteSizes.redo).toBe(0);
    expect(store.undoDepth).toBe(1);
  });
});

describe("StudioHistoryStore transaction 语义", () => {
  it("多选删除一个补丁 = 一次 undo 全部恢复（保留原顺序）", () => {
    const document = createDocument();
    const store = createStore(document);
    const items = document.floors[0].scene.items;
    const patch: DocumentPatch = {
      kind: "remove",
      floorId: "floor-a",
      entries: [
        { item: items[0], index: 0 },
        { item: items[2], index: 2 },
      ],
    };
    applyDocumentPatch(document, patch);
    store.record(patch, "删除 2 个物件");
    expect(document.floors[0].scene.items.map((item: any) => item.id)).toEqual(["item-2"]);

    store.undo();
    expect(document.floors[0].scene.items.map((item: any) => item.id)).toEqual(["item-1", "item-2", "item-3"]);
    expect(store.undoDepth).toBe(0);
  });

  it("拖拽合并的多物件 move 也是一次 undo", () => {
    const document = createDocument();
    const store = createStore(document);
    const patch: DocumentPatch = {
      kind: "move",
      floorId: "floor-a",
      moves: [
        { itemId: "item-1", before: { id: "item-1", position: { x: 0 } }, after: { id: "item-1", position: { x: 9 } } },
        { itemId: "item-2", before: { id: "item-2", position: { x: 1 } }, after: { id: "item-2", position: { x: 10 } } },
      ],
    };
    applyDocumentPatch(document, patch);
    store.record(patch, "拖动 2 个物件");
    expect(document.floors[0].scene.items[1].position.x).toBe(10);
    store.undo();
    expect(document.floors[0].scene.items[0].position.x).toBe(0);
    expect(document.floors[0].scene.items[1].position.x).toBe(1);
  });

  it("record 时提供显式 inverse 时优先使用（例如合并墙保护需要手写逆操作）", () => {
    const document = createDocument();
    const store = createStore(document);
    const patch = movePatch("item-1", 0, 2);
    const customInverse = movePatch("item-1", 7, 0);
    applyDocumentPatch(document, patch);
    store.record(patch, "移动", customInverse);
    store.undo();
    expect(document.floors[0].scene.items[0].position.x).toBe(0);
    expect(store.peekRedo()?.inverse).toBe(customInverse);
  });
});

describe("StudioHistoryStore 容量上限", () => {
  it("默认 40 条：超过后丢最旧条目", () => {
    const document = createDocument();
    const store = createStore(document);
    expect(DEFAULT_HISTORY_MAX_ENTRIES).toBe(40);
    for (let index = 0; index < 45; index += 1) {
      const patch = movePatch("item-1", index, index + 1);
      applyDocumentPatch(document, patch);
      store.record(patch, `移动 ${index}`);
    }
    expect(store.undoDepth).toBe(40);
    expect(store.peekUndo()?.label).toBe("移动 44");
    for (let index = 0; index < 40; index += 1) store.undo();
    expect(store.undoDepth).toBe(0);
    // 最旧 5 条被丢弃：连续 undo 40 次后仍停在 index 5 的状态。
    expect(document.floors[0].scene.items[0].position.x).toBe(5);
  });

  it("字节上限：超限丢弃最旧条目但至少保留 1 条", () => {
    const document = createDocument();
    const singleEntryBytes = estimateHistoryEntryBytes({
      patch: movePatch("item-1", 0, 1),
      inverse: invertDocumentPatch(movePatch("item-1", 0, 1)),
      label: "x",
      at: 0,
    });
    const store = createStore(document, { maxBytes: singleEntryBytes * 2 + 1, maxEntries: 100 });
    for (let index = 0; index < 6; index += 1) {
      const patch = movePatch("item-1", index, index + 1);
      applyDocumentPatch(document, patch);
      store.record(patch, `移动 ${index}`);
    }
    expect(store.undoDepth).toBeLessThanOrEqual(2);
    expect(store.undoDepth).toBeGreaterThanOrEqual(1);
    expect(store.byteSizes.undo).toBeLessThanOrEqual(singleEntryBytes * 2 + 1);

    const megaStore = createStore(createDocument(), { maxBytes: 1, maxEntries: 100 });
    const patch = movePatch("item-1", 0, 1);
    megaStore.record(patch, "移动");
    expect(megaStore.undoDepth).toBe(1);
  });
});

describe("StudioHistoryStore 预检与失败回滚", () => {
  it("canApply=false 时不出栈、不改文档、返回 not-applicable", () => {
    const document = createDocument();
    const store = createStore(document, { canApply: () => false });
    const patch = movePatch("item-1", 0, 4);
    applyDocumentPatch(document, patch);
    store.record(patch, "移动");
    const result = store.undo();
    expect(result).toMatchObject({ ok: false, reason: "not-applicable" });
    expect(store.undoDepth).toBe(1);
    expect(document.floors[0].scene.items[0].position.x).toBe(4);
  });

  it("出栈后 apply 抛错/返回 false：条目压回原栈并回调 onApplyFailure", () => {
    const document = createDocument();
    const failures: string[] = [];
    let allowApply = true;
    const store = new StudioHistoryStore({
      apply: (patch: DocumentPatch) => {
        if (!allowApply) throw new Error("合并墙上已有新增门窗或栏杆");
        return applyDocumentPatch(document, patch);
      },
      onApplyFailure: (entry) => failures.push(entry.label),
    });
    const patch = movePatch("item-1", 0, 4);
    applyDocumentPatch(document, patch);
    store.record(patch, "移动沙发");
    allowApply = false;
    const result = store.undo();
    expect(result).toMatchObject({ ok: false, reason: "apply-failed" });
    expect(store.undoDepth).toBe(1);
    expect(store.redoDepth).toBe(0);
    expect(failures).toEqual(["移动沙发"]);
  });

  it("clear 清空双栈与字节数", () => {
    const document = createDocument();
    const store = createStore(document);
    const patch = movePatch("item-1", 0, 3);
    applyDocumentPatch(document, patch);
    store.record(patch, "移动");
    store.undo();
    store.clear();
    expect(store.undoDepth).toBe(0);
    expect(store.redoDepth).toBe(0);
    expect(store.byteSizes).toEqual({ undo: 0, redo: 0 });
  });
});
