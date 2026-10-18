import { describe, expect, it } from "bun:test";
import { StudioDocumentStore } from "./document-store";
import type { DocumentPatch, StudioDraftPayload } from "./document-store";
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_DELAY_MS,
  SAVE_RETRY_BASE_MS,
  SAVE_RETRY_MAX_MS,
  StudioSaveStore,
  backoffDelay,
  classifySaveError,
  computeAutosaveDelay,
  describeSaveState,
} from "./save-store";
import type { SaveRequestError, SaveStoreDeps, SaveTransport } from "./save-store";

function createDocument() {
  return {
    schemaVersion: 8,
    floors: [
      {
        id: "floor-a",
        name: "一层",
        scene: { items: [{ id: "item-1", type: "sofa", position: { x: 0, y: 0, z: 0 }, rotation: 0 }] },
      },
    ],
  };
}

async function flushMicrotasks() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function createClock(start = 1000) {
  const items = new Map<number, { fn: () => void; at: number }>();
  let nextId = 1;
  let current = start;
  const timers = {
    setTimeout: (fn: () => void, delayMs: number) => {
      const handle = nextId;
      nextId += 1;
      items.set(handle, { fn, at: current + Math.max(0, delayMs) });
      return handle;
    },
    clearTimeout: (handle: number) => {
      items.delete(handle);
    },
  };
  return {
    timers,
    now: () => current,
    pendingTimerCount: () => items.size,
    setNow: (value: number) => {
      current = value;
    },
    async advance(ms: number) {
      const target = current + ms;
      for (;;) {
        let dueHandle = -1;
        let dueAt = Number.POSITIVE_INFINITY;
        for (const [handle, timer] of items) {
          if (timer.at <= target && timer.at < dueAt) {
            dueHandle = handle;
            dueAt = timer.at;
          }
        }
        if (dueHandle < 0) break;
        const due = items.get(dueHandle)!;
        items.delete(dueHandle);
        current = Math.max(current, due.at);
        due.fn();
        await flushMicrotasks();
      }
      current = target;
      await flushMicrotasks();
    },
  };
}

function createTransport(server: { revision: number; scene: any }) {
  const requests = { puts: [] as any[], loads: 0, beacons: [] as any[] };
  const respond: {
    put: (request: any) => any;
    load: () => any;
  } = {
    put: (request: any) => {
      server.revision = request.revision + 1;
      server.scene = request.scene;
      return { ok: true, payload: { revision: server.revision, scene: request.scene } };
    },
    load: () => ({ ok: true, payload: { revision: server.revision, scene: server.scene } }),
  };
  const transport: SaveTransport = {
    load: async () => {
      requests.loads += 1;
      return respond.load();
    },
    put: async (request) => {
      requests.puts.push(request);
      return respond.put(request);
    },
    beacon: (request) => {
      requests.beacons.push(request);
      return true;
    },
  };
  return { transport, requests, respond, server };
}

const errorOf = (status?: number, detail?: any): SaveRequestError => ({ status, detail });

function createHarness(overrides: Partial<SaveStoreDeps> = {}) {
  const server: { revision: number; scene: any } = { revision: 0, scene: createDocument() };
  const documentStore = new StudioDocumentStore();
  const clock = createClock();
  const { transport, requests, respond } = createTransport(server);
  const stateChanges: any[] = [];
  const store = new StudioSaveStore({
    documentStore,
    transport,
    timers: clock.timers,
    now: clock.now,
    onStateChange: (state) => stateChanges.push(state),
    ...overrides,
  });
  const markDirtyPatch: DocumentPatch = {
    kind: "add",
    floorId: "floor-a",
    entries: [{ item: { id: "item-2", type: "table" }, index: 1 }],
  };
  const markDirty = () => {
    documentStore.markDirty(markDirtyPatch);
    store.markDirty();
  };
  const markNoopDirty = () => {
    documentStore.markDirty({
      kind: "update",
      floorId: "floor-a",
      changes: [{ itemId: "item-1", before: { id: "item-1" }, after: { id: "item-1" } }],
    });
    store.markDirty();
  };
  return {
    server,
    documentStore,
    clock,
    transport,
    requests,
    respond,
    store,
    stateChanges,
    markDirty,
    markNoopDirty,
  };
}

describe("纯函数：错误分类 / 退避 / 防抖", () => {
  it("409 / 428 / 413 / 401 / 403 / 422 各有专类，其余 5xx 与网络错误可重试", () => {
    expect(classifySaveError(errorOf(409))).toBe("conflict");
    expect(classifySaveError(errorOf(428))).toBe("confirmation");
    expect(classifySaveError(errorOf(413))).toBe("payload-too-large");
    expect(classifySaveError(errorOf(401))).toBe("auth");
    expect(classifySaveError(errorOf(403))).toBe("auth");
    expect(classifySaveError(errorOf(422))).toBe("invalid");
    expect(classifySaveError(errorOf(408))).toBe("retryable");
    expect(classifySaveError(errorOf(425))).toBe("retryable");
    expect(classifySaveError(errorOf(429))).toBe("retryable");
    expect(classifySaveError(errorOf(500))).toBe("retryable");
    expect(classifySaveError(errorOf(503))).toBe("retryable");
    expect(classifySaveError(errorOf(undefined))).toBe("retryable");
    expect(classifySaveError(errorOf(418))).toBe("invalid");
  });

  it("退避 2s→4s→8s→16s→30s→30s", () => {
    expect(backoffDelay(1)).toBe(2000);
    expect(backoffDelay(2)).toBe(4000);
    expect(backoffDelay(3)).toBe(8000);
    expect(backoffDelay(4)).toBe(16000);
    expect(backoffDelay(5)).toBe(30000);
    expect(backoffDelay(9)).toBe(30000);
    expect(backoffDelay(0)).toBe(SAVE_RETRY_BASE_MS);
    expect(backoffDelay(9)).toBeLessThanOrEqual(SAVE_RETRY_MAX_MS);
  });

  it("自动保存延迟：防抖 3s，首个改动后最多 15s", () => {
    expect(computeAutosaveDelay(1000, 1000)).toBe(AUTOSAVE_DEBOUNCE_MS);
    expect(computeAutosaveDelay(14000, 1000)).toBe(2000);
    expect(computeAutosaveDelay(15999, 1000)).toBe(1);
    expect(computeAutosaveDelay(16000, 1000)).toBe(0);
    expect(computeAutosaveDelay(17000, 1000)).toBe(0);
    expect(computeAutosaveDelay(1000, null)).toBe(AUTOSAVE_DEBOUNCE_MS);
    expect(AUTOSAVE_MAX_DELAY_MS).toBe(15000);
  });
});

describe("StudioSaveStore.load", () => {
  it("载入成功 → status=saved，采纳 revision 与文档", async () => {
    const harness = createHarness();
    harness.server.revision = 4;
    const result = await harness.store.load();
    expect(result).toEqual({ ok: true, revision: 4 });
    expect(harness.store.getState().status).toBe("saved");
    expect(harness.documentStore.getLoadedRevision()).toBe(4);
    expect(harness.documentStore.isDirty()).toBe(false);
    expect(harness.store.hasUnsavedChanges()).toBe(false);
  });

  it("空草稿（revision=0 / scene=null）也能载入", async () => {
    const harness = createHarness();
    harness.server.revision = 0;
    harness.server.scene = null;
    expect(await harness.store.load()).toEqual({ ok: true, revision: 0 });
    expect(harness.documentStore.getDocument()).toBeNull();
  });

  it("载入 5xx → blocked-readonly（可重试），flush 被拒", async () => {
    const harness = createHarness();
    harness.respond.load = () => ({ ok: false, error: errorOf(503) });
    const result = await harness.store.load();
    expect(result.ok).toBe(false);
    expect(harness.store.getState().status).toBe("blocked-readonly");
    expect(await harness.store.flushNow()).toEqual({ ok: false, reason: "blocked" });

    harness.respond.load = () => ({ ok: true, payload: { revision: 3, scene: createDocument() } });
    expect((await harness.store.load()).ok).toBe(true);
    expect(harness.store.getState().status).toBe("saved");
  });

  it("载入 401 → blocked-readonly（不可重试）", async () => {
    const harness = createHarness();
    harness.respond.load = () => ({ ok: false, error: errorOf(401) });
    expect((await harness.store.load()) as any).toMatchObject({ ok: false, reason: "fatal" });
    expect(harness.store.getState().status).toBe("blocked-readonly");
  });
});

describe("StudioSaveStore 自动保存与重试", () => {
  it("markDirty → 3s 防抖后 PUT；成功后 status=saved 且推进 revision", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.markDirty();
    expect(harness.store.getState().status).toBe("dirty");
    expect(harness.clock.pendingTimerCount()).toBe(1);

    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(harness.requests.puts).toHaveLength(0);

    await harness.clock.advance(1);
    expect(harness.requests.puts).toHaveLength(1);
    expect(harness.requests.puts[0].revision).toBe(0);
    expect(harness.store.getState().status).toBe("saved");
    expect(harness.documentStore.getLoadedRevision()).toBe(1);
    expect(harness.documentStore.isDirty()).toBe(false);
  });

  it("local === remote（no-op 脏标记）仍然发 PUT，不静默跳过", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.markNoopDirty();
    expect(harness.documentStore.isNoopDirty()).toBe(true);
    expect(harness.store.getState().status).toBe("dirty");
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(harness.requests.puts).toHaveLength(1);
    expect(harness.store.getState().status).toBe("saved");
    expect(harness.documentStore.getLoadedRevision()).toBe(1);
  });

  it("5xx 失败 → retrying + 退避定时器；到点后重试成功", async () => {
    const harness = createHarness();
    await harness.store.load();
    let failuresLeft = 1;
    const successPut = harness.respond.put;
    harness.respond.put = (request: any) => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        return { ok: false, error: errorOf(503) };
      }
      return successPut(request);
    };
    harness.markDirty();
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(harness.requests.puts).toHaveLength(1);
    const retryState = harness.store.getState();
    expect(retryState.status).toBe("retrying");
    expect(retryState.attempt).toBe(1);
    expect(retryState.nextRetryAt).toBe(harness.clock.now() + 2000);

    await harness.clock.advance(1999);
    expect(harness.requests.puts).toHaveLength(1);
    await harness.clock.advance(1);
    expect(harness.requests.puts).toHaveLength(2);
    expect(harness.store.getState().status).toBe("saved");
    expect(harness.store.getState().attempt).toBe(0);
  });

  it("连续失败退避 2s/4s/8s 并记录 attempt", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.respond.put = () => ({ ok: false, error: errorOf(500) });
    harness.markDirty();
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(harness.requests.puts).toHaveLength(1);
    await harness.clock.advance(2000);
    expect(harness.requests.puts).toHaveLength(2);
    await harness.clock.advance(4000);
    expect(harness.requests.puts).toHaveLength(3);
    expect(harness.store.getState().attempt).toBe(3);
  });

  it("413 / 422 / 401 / 403 → failed 终态，不再自动重试", async () => {
    for (const status of [413, 422, 401, 403]) {
      const harness = createHarness();
      await harness.store.load();
      harness.respond.put = () => ({ ok: false, error: errorOf(status) });
      harness.markDirty();
      await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
      expect(harness.requests.puts).toHaveLength(1);
      expect(harness.store.getState().status).toBe("failed");
      const result = await harness.store.flushNow();
      expect(result.ok).toBe(false);
      expect((result as any).reason).toBe("fatal");
      await harness.clock.advance(60000);
      expect(harness.requests.puts).toHaveLength(1);
      expect(harness.clock.pendingTimerCount()).toBe(0);
    }
  });

  it("在途 PUT 去重：并发 flushNow 只发一次请求", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.markDirty();
    const first = harness.store.flushNow();
    const second = harness.store.flushNow();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    expect(harness.requests.puts).toHaveLength(1);
  });

  it("clean 时 flushNow 不发请求", async () => {
    const harness = createHarness();
    await harness.store.load();
    expect(await harness.store.flushNow()).toEqual({ ok: true, reason: "clean", revision: 0 });
    expect(harness.requests.puts).toHaveLength(0);
  });
});

describe("StudioSaveStore 409 冲突三出口", () => {
  it("409 → status=conflict + currentRevision，不自动重试", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.respond.put = () => ({
      ok: false,
      error: errorOf(409, { code: "STUDIO3D_REVISION_CONFLICT", currentRevision: 7 }),
    });
    harness.markDirty();
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    const state = harness.store.getState();
    expect(state.status).toBe("conflict");
    expect(state.pendingConflict?.currentRevision).toBe(7);
    expect(harness.store.hasPendingDialog()).toBe(true);
    await harness.clock.advance(60000);
    expect(harness.requests.puts).toHaveLength(1);
  });

  it("出口二：用 currentRevision 覆盖远端", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.respond.put = () => ({ ok: false, error: errorOf(409, { currentRevision: 7 }) });
    harness.markDirty();
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(harness.store.getState().status).toBe("conflict");

    const successPut = createTransport(harness.server).respond.put;
    harness.respond.put = (request: any) => successPut(request);
    const result = await harness.store.resolveConflictOverwrite();
    expect(result.ok).toBe(true);
    expect(harness.requests.puts).toHaveLength(2);
    expect(harness.requests.puts[1].revision).toBe(7);
    expect(harness.store.getState().status).toBe("saved");
    expect(harness.documentStore.getLoadedRevision()).toBe(8);
  });

  it("出口一：放弃本地，载入服务器版本", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.respond.put = () => ({ ok: false, error: errorOf(409, { currentRevision: 9 }) });
    harness.markDirty();
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    harness.server.revision = 9;
    harness.server.scene = { schemaVersion: 8, floors: [] };
    const result = await harness.store.resolveConflictLoadRemote();
    expect(result).toEqual({ ok: true, revision: 9 });
    expect(harness.documentStore.getLoadedRevision()).toBe(9);
    expect(harness.documentStore.getDocument().floors).toEqual([]);
    expect(harness.store.getState().pendingConflict).toBeNull();
    expect(harness.store.getState().status).toBe("saved");
  });

  it("出口三：导出本地副本，冲突状态保留", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.respond.put = () => ({ ok: false, error: errorOf(409, { currentRevision: 5 }) });
    harness.markDirty();
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    const exported: any[] = [];
    const storeWithExport = new StudioSaveStore({
      documentStore: harness.documentStore,
      transport: harness.transport,
      timers: harness.clock.timers,
      now: harness.clock.now,
      exportLocalCopy: (scene) => {
        exported.push(scene);
      },
    });
    // 重新制造冲突（新 store 独立，先载入再触发 409）
    await storeWithExport.load();
    harness.documentStore.markDirty({ kind: "add", floorId: "floor-a", entries: [{ item: { id: "x" }, index: 0 }] });
    storeWithExport.markDirty();
    harness.respond.put = () => ({ ok: false, error: errorOf(409, { currentRevision: 5 }) });
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(storeWithExport.getState().status).toBe("conflict");
    expect(await storeWithExport.exportLocalCopy()).toEqual({ ok: true });
    expect(exported).toHaveLength(1);
    expect(exported[0].floors).toHaveLength(1);
    expect(storeWithExport.getState().status).toBe("conflict");
  });

  it("没有导出实现时返回 export-unavailable", async () => {
    const harness = createHarness();
    expect(await harness.store.exportLocalCopy()).toEqual({ ok: false, reason: "export-unavailable" });
  });
});

describe("StudioSaveStore 428 交互确认", () => {
  it("428 → blocked + token；确认后带 token 重试成功", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.respond.put = () => ({
      ok: false,
      error: errorOf(428, {
        code: "STUDIO3D_INTERACTION_CONFIRMATION",
        token: "tok-123",
        message: "将删除交互配置",
        impacts: { scenes: 2 },
        projects: ["p1"],
      }),
    });
    harness.markDirty();
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    const state = harness.store.getState();
    expect(state.status).toBe("blocked");
    expect(state.pendingConfirmation).toMatchObject({ token: "tok-123", message: "将删除交互配置" });
    expect(harness.store.hasPendingDialog()).toBe(true);
    await harness.clock.advance(60000);
    expect(harness.requests.puts).toHaveLength(1);

    const successPut = createTransport(harness.server).respond.put;
    harness.respond.put = (request: any) => successPut(request);
    const result = await harness.store.confirmInteraction();
    expect(result.ok).toBe(true);
    expect(harness.requests.puts).toHaveLength(2);
    expect(harness.requests.puts[1].interactionConfirmation).toBe("tok-123");
    expect(harness.store.getState().status).toBe("saved");
  });

  it("确认时没有 token → 返回 confirmation-required 且不发请求", async () => {
    const harness = createHarness();
    await harness.store.load();
    const result = await harness.store.confirmInteraction();
    expect(result).toEqual({ ok: false, reason: "confirmation-required", token: "" });
    expect(harness.requests.puts).toHaveLength(0);
  });

  it("取消确认 → 回到 dirty，保留本地改动", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.respond.put = () => ({ ok: false, error: errorOf(428, { token: "tok-1" }) });
    harness.markDirty();
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    harness.store.cancelConfirmation();
    const state = harness.store.getState();
    expect(state.pendingConfirmation).toBeNull();
    expect(state.status).toBe("dirty");
    expect(harness.documentStore.isDirty()).toBe(true);
    expect(harness.store.hasUnsavedChanges()).toBe(true);
  });
});

describe("StudioSaveStore 退出 / pagehide / 离线 / 挂起", () => {
  it("requestExit 脏时保存成功并返回 saved", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.markDirty();
    harness.clock.setNow(2000);
    const result = await harness.store.requestExit();
    expect(result).toEqual({ ok: true, reason: "saved", revision: 1 });
    expect(harness.requests.puts).toHaveLength(1);
  });

  it("requestExit 遇到可重试失败会立刻再试一次（不等退避）", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.markDirty();
    let first = true;
    const successPut = createTransport(harness.server).respond.put;
    harness.respond.put = (request: any) => {
      if (first) {
        first = false;
        return { ok: false, error: errorOf(503) };
      }
      return successPut(request);
    };
    const result = await harness.store.requestExit();
    expect(result.ok).toBe(true);
    expect(harness.requests.puts).toHaveLength(2);
    expect(harness.store.getState().status).toBe("saved");
  });

  it("requestExit 冲突时返回 conflict，不丢改动", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.markDirty();
    harness.respond.put = () => ({ ok: false, error: errorOf(409, { currentRevision: 3 }) });
    const result = await harness.store.requestExit();
    expect(result).toEqual({ ok: false, reason: "conflict", currentRevision: 3 });
    expect(harness.documentStore.isDirty()).toBe(true);
    expect(harness.store.hasUnsavedChanges()).toBe(true);
  });

  it("pagehide：脏时发 beacon（revision + scene），干净时不发", async () => {
    const harness = createHarness();
    await harness.store.load();
    expect(harness.store.flushOnPageHide()).toEqual({ sent: false });
    harness.markDirty();
    expect(harness.store.flushOnPageHide()).toEqual({ sent: true });
    expect(harness.requests.beacons).toHaveLength(1);
    expect(harness.requests.beacons[0].revision).toBe(0);
    expect(harness.requests.beacons[0].scene).toBe(harness.documentStore.getDocument());
    expect(harness.documentStore.getLoadedRevision()).toBe(0);
  });

  it("离线：状态 offline，flush 拒绝；恢复在线后重新调度", async () => {
    const harness = createHarness({ isOnline: () => true });
    await harness.store.load();
    harness.markDirty();
    harness.store.setOnline(false);
    expect(harness.store.getState().status).toBe("offline");
    expect(await harness.store.flushNow()).toEqual({ ok: false, reason: "offline" });
    harness.clock.setNow(5000);
    harness.store.setOnline(true);
    expect(harness.store.getState().status).toBe("dirty");
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(harness.requests.puts).toHaveLength(1);
  });

  it("embedded / 挂起：不调度、flush 返回 deferred", async () => {
    const harness = createHarness({ isEmbedded: () => true });
    await harness.store.load();
    harness.markDirty();
    expect(harness.store.getState().status).toBe("dirty");
    expect(harness.clock.pendingTimerCount()).toBe(0);
    expect(await harness.store.flushNow()).toEqual({ ok: false, reason: "deferred" });
    expect(harness.requests.puts).toHaveLength(0);

    const suspended = createHarness({ isPageSuspended: () => true });
    await suspended.store.load();
    suspended.markDirty();
    expect(suspended.clock.pendingTimerCount()).toBe(0);
    expect(await suspended.store.flushNow()).toEqual({ ok: false, reason: "deferred" });
  });

  it("撤销回原状（doc store 不再脏）→ markDirty 清掉待保存状态", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.markDirty();
    harness.documentStore.clear();
    harness.documentStore.applyLoaded({ revision: 0, scene: createDocument() });
    harness.store.markDirty();
    expect(harness.store.getState().status).toBe("saved");
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(harness.requests.puts).toHaveLength(0);
  });
});

describe("StudioSaveStore 可观测性", () => {
  it("onStateChange / subscribe 收到状态快照，监听器异常不影响保存", async () => {
    const harness = createHarness();
    const subscribed: string[] = [];
    const unsubscribe = harness.store.subscribe((state) => {
      subscribed.push(state.status);
      throw new Error("listener boom");
    });
    await harness.store.load();
    harness.markDirty();
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(harness.store.getState().status).toBe("saved");
    expect(subscribed).toContain("loading");
    expect(subscribed).toContain("dirty");
    expect(subscribed).toContain("saving");
    expect(subscribed).toContain("saved");
    expect(harness.stateChanges.length).toBeGreaterThan(0);
    unsubscribe();
  });

  it("describeSaveState 优先展示冲突/确认", () => {
    const harness = createHarness();
    expect(describeSaveState(harness.store.getState(), harness.documentStore.getState())).toBe("idle");
  });
});
describe("StudioSaveStore 宿主接线（acceptLoaded / 载入失败 / 显式延迟 / 宿主场景快照）", () => {
  it("acceptLoaded：宿主已应用 GET 草稿时置 saved、清定时器与冲突/确认状态", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.markDirty();
    harness.respond.put = () =>
      ({ ok: false, error: { status: 409, detail: { currentRevision: 4 } } }) as any;
    await harness.clock.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(harness.store.getState().status).toBe("conflict");
    expect(harness.store.getState().pendingConflict).not.toBeNull();

    const payload: StudioDraftPayload = {
      revision: 7,
      scene: { schemaVersion: 8, floors: [] },
      updatedAt: "2026-10-18T00:00:00Z",
    };
    harness.store.acceptLoaded(payload);
    const state = harness.store.getState();
    expect(state.status).toBe("saved");
    expect(state.pendingConflict).toBeNull();
    expect(state.pendingConfirmation).toBeNull();
    expect(state.firstDirtyAt).toBeNull();
    expect(state.attempt).toBe(0);
    expect(state.lastSavedAt).toBe(harness.clock.now());
    expect(harness.documentStore.getLoadedRevision()).toBe(7);
    expect(harness.documentStore.isDirty()).toBe(false);
    expect(harness.clock.pendingTimerCount()).toBe(0);
  });

  it("acceptLoaded 不带 payload：只同步状态机，不覆盖文档 store", async () => {
    const harness = createHarness();
    await harness.store.load();
    const loadedBefore = harness.documentStore.getLoadedRevision();
    harness.store.acceptLoaded();
    expect(harness.store.getState().status).toBe("saved");
    expect(harness.documentStore.getLoadedRevision()).toBe(loadedBefore);
  });

  it("markLoadFailed：进入 blocked-readonly，flush 被拒，不再自动保存", async () => {
    const harness = createHarness();
    harness.store.markLoadFailed({ status: 503, message: "boom" });
    const state = harness.store.getState();
    expect(state.status).toBe("blocked-readonly");
    expect(state.lastErrorCategory).toBe("retryable");
    expect(state.isSaveInFlight).toBe(false);
    expect(await harness.store.flushNow()).toEqual({ ok: false, reason: "blocked" });
    expect(harness.requests.puts).toHaveLength(0);
  });

  it("markLoadFailed：401 归类为 auth（不可自动重试）", () => {
    const harness = createHarness();
    harness.store.markLoadFailed({ status: 401 });
    expect(harness.store.getState().lastErrorCategory).toBe("auth");
  });

  it("scheduleAutosave(0)：跳过 3s 防抖，立即保存（供 online 恢复使用）", async () => {
    const harness = createHarness();
    await harness.store.load();
    harness.markDirty();
    harness.store.scheduleAutosave(0);
    await harness.clock.advance(0);
    expect(harness.requests.puts).toHaveLength(1);
    expect(harness.store.getState().status).toBe("saved");
  });

  it("host 场景快照优先：PUT 发的是 getScene() 的当前场景，而不是 document store 的载入副本", async () => {
    const hostScene = { schemaVersion: 8, floors: [{ id: "host-floor", scene: { items: [] } }] };
    const harness = createHarness({ getScene: () => hostScene });
    await harness.store.load();
    const loadedDocumentScene = harness.documentStore.getDocument();
    harness.markDirty();
    await harness.store.flushNow();
    expect(harness.requests.puts).toHaveLength(1);
    expect(harness.requests.puts[0].scene).toBe(hostScene);
    expect(harness.requests.puts[0].scene).not.toBe(loadedDocumentScene);
  });

  it("getScene 返回 null（宿主未载入）时 flush 视为 blocked", async () => {
    const harness = createHarness({ getScene: () => null });
    expect(await harness.store.flushNow()).toEqual({ ok: false, reason: "blocked" });
  });

  it("pagehide beacon 同样使用 getScene() 的宿主快照", async () => {
    const hostScene = { schemaVersion: 8, floors: [{ id: "beacon-floor", scene: { items: [] } }] };
    const harness = createHarness({ getScene: () => hostScene });
    await harness.store.load();
    harness.markDirty();
    const result = harness.store.flushOnPageHide();
    expect(result.sent).toBe(true);
    expect(harness.requests.beacons).toHaveLength(1);
    expect(harness.requests.beacons[0].scene).toBe(hostScene);
  });
});
