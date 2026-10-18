import { describe, expect, it } from "bun:test";
import {
  StudioSceneSyncController,
  applyBaseLighting,
  applyFloorNames,
  decideSceneSync,
  diffFloorNames,
  mergeFloors,
} from "./scene-sync-controller";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function createScene(): any {
  return {
    background: "#f5f5f5",
    baseLighting: { intensity: 1, color: "#ffffff", ambient: 0.4 },
    floors: [
      {
        id: "floor-a",
        name: "一层",
        elevation: 0,
        offsetX: 0,
        scene: {
          items: [
            { id: "item-1", type: "sofa", position: { x: 0, y: 0, z: 0 }, rotation: 0 },
            { id: "item-2", type: "table", position: { x: 1, y: 0, z: 0 }, rotation: 0 },
          ],
          settings: { cameraMode: "perspective", snapEnabled: true, snapGrid: 10 },
        },
      },
      {
        id: "floor-b",
        name: "二层",
        elevation: 3,
        offsetX: 0,
        scene: { items: [{ id: "item-b1", type: "bed", position: { x: 0, y: 0, z: 0 }, rotation: 0 }] },
      },
    ],
  };
}

function createDeps(overrides: any = {}) {
  const runtimeScene = createScene();
  const state = {
    dirty: false,
    embedded: false,
    suspended: false,
    flushResult: "saved" as "saved" | "conflict" | "failed",
    flushCalls: 0,
    replaced: [] as any[],
    outcomes: [] as any[],
    loadedRevisionReads: 0,
  };
  const store = {
    get loadedRevision() {
      state.loadedRevisionReads += 1;
      return 7;
    },
    isDirty: () => state.dirty,
  };
  const deps = {
    getRuntimeScene: () => runtimeScene,
    isDirty: () => store.isDirty(),
    flush: async () => {
      state.flushCalls += 1;
      return state.flushResult;
    },
    replaceScene: (scene: any) => state.replaced.push(scene),
    isEmbedded: () => state.embedded,
    isPageSuspended: () => state.suspended,
    onOutcome: (outcome: any) => state.outcomes.push(outcome),
    ...overrides,
  };
  return { runtimeScene, store, state, deps: deps as any };
}

describe("decideSceneSync", () => {
  it("embedded 预览舞台 → ignored embedded，不访问脏标记", () => {
    const { deps, state } = createDeps({ isEmbedded: () => true });
    expect(decideSceneSync({
      runtimeScene: createScene(),
      remoteScene: createScene(),
      isDirty: true,
      isEmbedded: true,
      isPageSuspended: false,
    })).toEqual({ kind: "ignored", reason: "embedded" });
    expect(deps.isDirty()).toBe(false);
    expect(state.flushCalls).toBe(0);
  });

  it("页面挂起 → deferred page-suspended", () => {
    expect(decideSceneSync({
      runtimeScene: createScene(),
      remoteScene: clone(createScene()),
      isDirty: true,
      isEmbedded: false,
      isPageSuspended: true,
    })).toEqual({ kind: "deferred", reason: "page-suspended" });
  });

  it("只有视图设置变化（sceneUpdatePlan 忽略的键）→ ignored no-visual-change", () => {
    const runtime = createScene();
    const remote = clone(runtime);
    remote.floors[0].scene.settings.cameraMode = "top";
    remote.floors[0].scene.settings.snapGrid = 1;
    expect(decideSceneSync({ runtimeScene: runtime, remoteScene: remote, isDirty: false, isEmbedded: false, isPageSuspended: false }))
      .toEqual({ kind: "ignored", reason: "no-visual-change" });
  });

  it("仅楼层改名 → metadata-only", () => {
    const runtime = createScene();
    const remote = clone(runtime);
    remote.floors[1].name = "二层主卧";
    const decision = decideSceneSync({ runtimeScene: runtime, remoteScene: remote, isDirty: false, isEmbedded: false, isPageSuspended: false });
    expect(decision).toEqual({
      kind: "metadata-only",
      floorNameChanges: [{ floorId: "floor-b", from: "二层", to: "二层主卧" }],
    });
  });

  it("仅灯光变化 → lighting-only；脏也不 flush（不改文档）", () => {
    const runtime = createScene();
    const remote = clone(runtime);
    remote.baseLighting = { intensity: 2, color: "#ffccaa", ambient: 0.1 };
    expect(decideSceneSync({ runtimeScene: runtime, remoteScene: remote, isDirty: true, isEmbedded: false, isPageSuspended: false }))
      .toEqual({ kind: "lighting-only", lighting: true, floorNameChanges: [] });
  });

  it("楼层内容变化（非全量）→ merge-floors", () => {
    const runtime = createScene();
    const remote = clone(runtime);
    remote.floors[0].scene.items.push({ id: "item-3", type: "lamp", position: { x: 2, y: 0, z: 0 }, rotation: 0 });
    expect(decideSceneSync({ runtimeScene: runtime, remoteScene: remote, isDirty: true, isEmbedded: false, isPageSuspended: false }))
      .toEqual({ kind: "merge-floors", floorIds: ["floor-a"], lighting: false, floorNameChanges: [] });
  });

  it("全量变化：干净 → full-reload，脏 → flush-then-reload", () => {
    const runtime = createScene();
    const remote = clone(runtime);
    remote.floors.push({ id: "floor-c", name: "三层", elevation: 6, offsetX: 0, scene: { items: [] } });
    expect(decideSceneSync({ runtimeScene: runtime, remoteScene: remote, isDirty: false, isEmbedded: false, isPageSuspended: false }))
      .toEqual({ kind: "full-reload" });
    expect(decideSceneSync({ runtimeScene: runtime, remoteScene: remote, isDirty: true, isEmbedded: false, isPageSuspended: false }))
      .toEqual({ kind: "flush-then-reload" });
  });
});

describe("applyBaseLighting / applyFloorNames / mergeFloors", () => {
  it("applyBaseLighting 就地替换引用", () => {
    const runtime = createScene();
    const next: any = { intensity: 3 };
    expect(applyBaseLighting(runtime, { baseLighting: next })).toBe(true);
    expect(runtime.baseLighting).toBe(next);
  });

  it("applyFloorNames 只改有变化的楼层名", () => {
    const runtime = createScene();
    expect(applyFloorNames(runtime, [{ floorId: "floor-b", from: "二层", to: "主卧层" }])).toBe(1);
    expect(runtime.floors[1].name).toBe("主卧层");
    expect(runtime.floors[0].name).toBe("一层");
    expect(applyFloorNames(runtime, [])).toBe(0);
  });

  it("mergeFloors 只替换指定楼层 scene，保留本地视图设置", () => {
    const runtime = createScene();
    const remote = clone(runtime);
    remote.floors[0].scene.items = [];
    remote.floors[0].scene.settings = { cameraMode: "top", snapEnabled: false, snapGrid: 1 };
    const replaced = mergeFloors(runtime, remote, ["floor-a"]);
    expect(replaced).toEqual(["floor-a"]);
    expect(runtime.floors[0].scene.items).toEqual([]);
    expect(runtime.floors[0].scene.settings.cameraMode).toBe("perspective");
    expect(runtime.floors[0].scene.settings.snapGrid).toBe(10);
    expect(runtime.floors[0].scene.settings.snapEnabled).toBe(true);
    expect(runtime.floors[1].scene.items).toHaveLength(1);
    expect(mergeFloors(runtime, remote, ["floor-zzz"])).toEqual([]);
  });

  it("diffFloorNames 返回改名列表", () => {
    const runtime = createScene();
    const remote = clone(runtime);
    remote.floors[0].name = "客厅层";
    expect(diffFloorNames(runtime, remote)).toEqual([{ floorId: "floor-a", from: "一层", to: "客厅层" }]);
  });
});

describe("StudioSceneSyncController.handleRemoteScene", () => {
  it("仅灯光变化：同步 baseLighting 与楼层名，不 flush、不重建、不触碰保存 revision", async () => {
    const { runtimeScene, state, deps } = createDeps();
    const controller = new StudioSceneSyncController(deps);
    state.dirty = true;
    const remote = clone(runtimeScene);
    remote.baseLighting = { intensity: 5 };
    remote.floors[0].name = "客厅层";
    const outcome = await controller.handleRemoteScene(remote);
    expect(outcome).toEqual({
      kind: "lighting-only",
      lighting: true,
      floorNameChanges: [{ floorId: "floor-a", from: "一层", to: "客厅层" }],
    });
    expect(runtimeScene.baseLighting).toEqual({ intensity: 5 });
    expect(runtimeScene.floors[0].name).toBe("客厅层");
    expect(state.flushCalls).toBe(0);
    expect(state.replaced).toHaveLength(0);
    expect(state.loadedRevisionReads).toBe(0);
    expect(state.outcomes).toHaveLength(1);
  });

  it("非全量楼层变化：就地合并，保留脏状态（不 flush），不读 loadedRevision", async () => {
    const { runtimeScene, state, deps } = createDeps();
    const controller = new StudioSceneSyncController(deps);
    state.dirty = true;
    const remote = clone(runtimeScene);
    remote.floors[1].scene.items.push({ id: "item-b2", type: "nightstand" });
    const outcome = await controller.handleRemoteScene(remote);
    expect(outcome.kind).toBe("merge-floors");
    expect(runtimeScene.floors[1].scene.items).toHaveLength(2);
    expect(state.flushCalls).toBe(0);
    expect(state.replaced).toHaveLength(0);
    expect(state.loadedRevisionReads).toBe(0);
  });

  it("全量且干净：直接重建，不 flush", async () => {
    const { runtimeScene, state, deps } = createDeps();
    const controller = new StudioSceneSyncController(deps);
    const remote = clone(runtimeScene);
    remote.floors.push({ id: "floor-c", name: "三层", elevation: 6, offsetX: 0, scene: { items: [] } });
    const outcome = await controller.handleRemoteScene(remote);
    expect(outcome).toEqual({ kind: "full-reload", afterFlush: false });
    expect(state.replaced).toEqual([remote]);
    expect(state.flushCalls).toBe(0);
  });

  it("全量且脏：先 flush 再重建（afterFlush=true）", async () => {
    const { runtimeScene, state, deps } = createDeps();
    const controller = new StudioSceneSyncController(deps);
    state.dirty = true;
    const remote = clone(runtimeScene);
    remote.background = "#000000";
    const outcome = await controller.handleRemoteScene(remote);
    expect(outcome).toEqual({ kind: "full-reload", afterFlush: true });
    expect(state.flushCalls).toBe(1);
    expect(state.replaced).toEqual([remote]);
  });

  it("全量且脏、flush 冲突：不覆盖本地，outcome=conflict", async () => {
    const { runtimeScene, state, deps } = createDeps();
    const controller = new StudioSceneSyncController(deps);
    state.dirty = true;
    state.flushResult = "conflict";
    const remote = clone(runtimeScene);
    remote.background = "#000000";
    const outcome = await controller.handleRemoteScene(remote);
    expect(outcome).toEqual({ kind: "conflict", reason: "local-dirty" });
    expect(state.flushCalls).toBe(1);
    expect(state.replaced).toHaveLength(0);
    expect(runtimeScene.background).toBe("#f5f5f5");
  });

  it("全量且脏、flush 失败/抛错：本轮搁置（stalled），不重建", async () => {
    const { runtimeScene, state, deps } = createDeps();
    state.dirty = true;
    state.flushResult = "failed";
    const controller = new StudioSceneSyncController({
      ...deps,
      flush: async () => {
        state.flushCalls += 1;
        return "failed" as const;
      },
    });
    const remote = clone(runtimeScene);
    remote.background = "#000000";
    const outcome = await controller.handleRemoteScene(remote);
    expect(outcome).toEqual({ kind: "stalled", reason: "flush-failed" });
    expect(state.replaced).toHaveLength(0);

    const throwing = new StudioSceneSyncController({
      ...deps,
      flush: async () => {
        throw new Error("network down");
      },
    });
    const thrownOutcome = await throwing.handleRemoteScene(remote);
    expect(thrownOutcome).toEqual({ kind: "stalled", reason: "flush-failed" });
  });

  it("并发轮询复用同一个在途 flush / 重建", async () => {
    const { runtimeScene, state, deps } = createDeps();
    let resolveFlush: (value: "saved") => void = () => {};
    const flushPromise = new Promise<"saved">((resolve) => {
      resolveFlush = resolve;
    });
    const controller = new StudioSceneSyncController({
      ...deps,
      flush: () => {
        state.flushCalls += 1;
        return flushPromise;
      },
    });
    state.dirty = true;
    const remote = clone(runtimeScene);
    remote.background = "#000000";
    const first = controller.handleRemoteScene(remote);
    const second = controller.handleRemoteScene(remote);
    expect(controller.isFlushing).toBe(true);
    resolveFlush("saved");
    const [firstOutcome, secondOutcome] = await Promise.all([first, second]);
    expect(firstOutcome).toEqual({ kind: "full-reload", afterFlush: true });
    expect(secondOutcome).toEqual({ kind: "full-reload", afterFlush: true });
    expect(state.flushCalls).toBe(1);
    expect(state.replaced).toHaveLength(1);
    expect(controller.isFlushing).toBe(false);
  });

  it("embedded / 挂起时完全无副作用", async () => {
    const { state, deps } = createDeps();
    const controller = new StudioSceneSyncController({ ...deps, isEmbedded: () => true });
    const remote = clone(createScene());
    remote.background = "#000000";
    expect(await controller.handleRemoteScene(remote)).toEqual({ kind: "ignored", reason: "embedded" });
    expect(state.flushCalls).toBe(0);
    expect(state.replaced).toHaveLength(0);

    const suspended = new StudioSceneSyncController({ ...deps, isPageSuspended: () => true });
    expect(await suspended.handleRemoteScene(remote)).toEqual({ kind: "deferred", reason: "page-suspended" });
    expect(state.replaced).toHaveLength(0);
    expect(state.loadedRevisionReads).toBe(0);
  });
});