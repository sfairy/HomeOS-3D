import { describe, expect, it } from "bun:test";
import {
  createStudioDraftRepository,
  draftErrorDetail,
  normalizeDraftPayload,
  STUDIO3D_INTERACTION_CONFIRMATION,
  STUDIO3D_REVISION_CONFLICT,
} from "./studio-draft-repository";

/** 最小 Response 桩：只实现适配器用到的 status / ok / text。 */
function response(status: number, body?: any) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as any;
}

function recordingFetch(reply: (init: any) => any) {
  const calls: Array<{ url: string; init: any; body: any }> = [];
  const fetchImpl = (async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), init, body });
    return reply(init);
  }) as any;
  return { fetchImpl, calls };
}

describe("StudioDraftRepository —— 传输层", () => {
  it("GET 归一化 revision / scene / updatedAt", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      response(200, { revision: 7, scene: { floors: [] }, updatedAt: "2026-10-18T10:00:00" }),
    );
    const repo = createStudioDraftRepository({ fetchImpl });
    const result = await repo.load();
    expect(result).toEqual({
      ok: true,
      payload: { revision: 7, scene: { floors: [] }, updatedAt: "2026-10-18T10:00:00" },
    });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.cache).toBe("no-store");
    expect(calls[0].init.credentials).toBe("same-origin");
  });

  it("GET 空场景（204 / revision 0 + scene null）不被误判为失败", async () => {
    const empty = createStudioDraftRepository({ fetchImpl: recordingFetch(() => response(204)).fetchImpl });
    expect(await empty.load()).toEqual({ ok: true, payload: { revision: 0, scene: null } });
    const nullScene = createStudioDraftRepository({
      fetchImpl: recordingFetch(() => response(200, { revision: 0, scene: null, updatedAt: null })).fetchImpl,
    });
    expect(await nullScene.load()).toEqual({ ok: true, payload: { revision: 0, scene: null, updatedAt: null } });
  });

  it("409 保留结构化 detail（currentRevision 供冲突框使用）", async () => {
    const detail = {
      code: STUDIO3D_REVISION_CONFLICT,
      message: "草稿已被其他页面修改。",
      currentRevision: 12,
    };
    const repo = createStudioDraftRepository({
      fetchImpl: recordingFetch(() => response(409, { detail })).fetchImpl,
    });
    const result: any = await repo.put({ revision: 5, scene: { floors: [] } });
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ status: 409, detail, message: "草稿已被其他页面修改。" });
    expect(draftErrorDetail({ detail }).currentRevision).toBe(12);
  });

  it("428 保留交互确认 token 与 impacts/projects", async () => {
    const detail = {
      code: STUDIO3D_INTERACTION_CONFIRMATION,
      token: "abc123",
      message: "需要确认删除交互配置。",
      impacts: [{ projectId: 1 }],
      projects: [1],
    };
    const repo = createStudioDraftRepository({
      fetchImpl: recordingFetch(() => response(428, { detail })).fetchImpl,
    });
    const result: any = await repo.put({ revision: 3, scene: { floors: [] } });
    expect(result.error.status).toBe(428);
    expect(result.error.detail.token).toBe("abc123");
    expect(result.error.detail.impacts).toHaveLength(1);
  });

  it("PUT 请求体：revision + scene，未确认时不带 interactionConfirmation，确认后带上", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      response(200, { revision: 4, scene: { floors: [{ id: "floor-1" }] }, updatedAt: "t" }),
    );
    const repo = createStudioDraftRepository({ fetchImpl });
    const scene = { floors: [{ id: "floor-1" }] };
    await repo.put({ revision: 3, scene });
    expect(calls[0].body).toEqual({ revision: 3, scene });
    await repo.put({ revision: 4, scene, interactionConfirmation: "tok" });
    expect(calls[1].body).toEqual({ revision: 4, scene, interactionConfirmation: "tok" });
    expect(calls[1].init.headers["Content-Type"]).toBe("application/json");
  });

  it("CSRF 头通过注入的 provider 合并（默认走 withCsrf）", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      response(200, { revision: 1, scene: {} }),
    );
    const repo = createStudioDraftRepository({
      fetchImpl,
      csrfHeaders: (method) => ({ "X-CSRF-Token": "csrf-" + method }),
    });
    await repo.put({ revision: 0, scene: {} });
    expect(calls[0].init.headers["X-CSRF-Token"]).toBe("csrf-PUT");
  });

  it("网络异常 / 超时归一化为无 status 的可重试错误", async () => {
    const failing = createStudioDraftRepository({
      fetchImpl: (async () => {
        throw new TypeError("Failed to fetch");
      }) as any,
    });
    const network: any = await failing.load();
    expect(network.ok).toBe(false);
    expect(network.error.status).toBeUndefined();
    expect(network.error.message).toContain("Failed to fetch");

    const aborting = createStudioDraftRepository({
      fetchImpl: (async () => {
        const error: any = new Error("The operation was aborted.");
        error.name = "AbortError";
        throw error;
      }) as any,
      timeoutMs: 10,
    });
    const timeout: any = await aborting.put({ revision: 0, scene: {} });
    expect(timeout.error.status).toBeUndefined();
    expect(timeout.error.message).toContain("超时");
  });

  it("200 但响应非 JSON / 缺 revision 视为传输错误而非成功", async () => {
    const nonJson = createStudioDraftRepository({
      fetchImpl: (async () => ({ status: 200, ok: true, text: async () => "<html>oops</html>" })) as any,
    });
    const first: any = await nonJson.load();
    expect(first.ok).toBe(false);
    expect(first.error.status).toBeUndefined();

    const missingRevision = createStudioDraftRepository({
      fetchImpl: recordingFetch(() => response(200, { scene: {} })).fetchImpl,
    });
    const second: any = await missingRevision.load();
    expect(second.ok).toBe(false);
    expect(second.error.status).toBeUndefined();
  });

  it("beacon 用 keepalive PUT 尽力而为，不抛异常", async () => {
    const { fetchImpl, calls } = recordingFetch(() => response(200, { revision: 2, scene: {} }));
    const repo = createStudioDraftRepository({ fetchImpl });
    expect(repo.beacon!({ revision: 1, scene: { a: 1 } })).toBe(true);
    expect(calls[0].init.keepalive).toBe(true);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].body).toEqual({ revision: 1, scene: { a: 1 } });

    const broken = createStudioDraftRepository({
      fetchImpl: (() => {
        throw new Error("no keepalive");
      }) as any,
    });
    expect(broken.beacon!({ revision: 1, scene: {} })).toBe(false);
  });
});

describe("normalizeDraftPayload", () => {
  it("revision 归一化非负整数（负数 / NaN / 缺省 → 0）", () => {
    expect(normalizeDraftPayload({ revision: -3, scene: {} }).revision).toBe(0);
    expect(normalizeDraftPayload({ revision: "5", scene: {} }).revision).toBe(5);
  });

  it("改回退场景：PUT 响应省略 scene 时用请求场景", () => {
    expect(normalizeDraftPayload({ revision: 2 }, { floors: [] }).scene).toEqual({ floors: [] });
  });
});

/* 端到端接线：真实 save-store + document-store + 本仓储（只桩掉 fetch）。
 * 验证 C2/C3 契约在组合后仍然成立：revision 取 loadedRevision、脏标记清空、
 * 409 冲突框可用 currentRevision 覆盖、428 token 可确认后重试。 */

import { StudioDocumentStore } from "./document-store";
import { StudioSaveStore } from "./save-store";

function floorDocument(label = "sofa") {
  return {
    schemaVersion: 8,
    floors: [{ id: "floor-a", name: "一层", scene: { items: [{ id: "item-1", type: label }] } }],
  };
}

function scriptedFetch(replies: Array<() => any>) {
  const calls: Array<{ url: string; init: any; body: any }> = [];
  const fetchImpl = (async (url: string, init: any) => {
    calls.push({ url: String(url), init, body: init?.body ? JSON.parse(init.body) : undefined });
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    return reply();
  }) as any;
  return { fetchImpl, calls };
}

const staticTimers = { setTimeout: () => 1, clearTimeout: () => {} };

function addItem(documentStore: StudioDocumentStore, id: string) {
  documentStore.getDocument().floors[0].scene.items.push({ id, type: "chair" });
  documentStore.markDirty({
    kind: "add",
    floorId: "floor-a",
    entries: [{ item: { id, type: "chair" }, index: 1 }],
  });
}

describe("StudioDraftRepository × StudioSaveStore 接线", () => {
  it("载入 → 改脏 → flush 走 loadedRevision → 二次 flush 干净不发请求", async () => {
    const scene = floorDocument();
    const { fetchImpl, calls } = scriptedFetch([
      () => response(200, { revision: 5, scene, updatedAt: "t" }),
      () => response(200, { revision: 6, scene: floorDocument("chair"), updatedAt: "t" }),
    ]);
    const documentStore2 = new StudioDocumentStore();
    const store2 = new StudioSaveStore({
      documentStore: documentStore2,
      transport: createStudioDraftRepository({ fetchImpl }),
      timers: staticTimers as any,
      now: () => 1000,
    });
    expect(await store2.load()).toEqual({ ok: true, revision: 5 });
    expect(documentStore2.getLoadedRevision()).toBe(5);

    addItem(documentStore2, "item-2");
    store2.markDirty();
    const saved: any = await store2.flushNow();
    expect(saved).toEqual({ ok: true, reason: "saved", revision: 6 });
    expect(calls).toHaveLength(2);
    expect(calls[1].init.method).toBe("PUT");
    expect(calls[1].body.revision).toBe(5);
    expect(calls[1].body.scene.floors[0].scene.items).toHaveLength(2);
    expect(documentStore2.getLoadedRevision()).toBe(6);
    expect(documentStore2.isDirty()).toBe(false);

    expect(await store2.flushNow()).toEqual({ ok: true, reason: "clean", revision: 6 });
    expect(calls).toHaveLength(2);
  });

  it("409 冲突后用 currentRevision 覆盖远端（revisionOverride）", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => response(200, { revision: 5, scene: floorDocument() }),
      () =>
        response(409, {
          detail: { code: STUDIO3D_REVISION_CONFLICT, message: "冲突", currentRevision: 9 },
        }),
      () => response(200, { revision: 10, scene: floorDocument("chair") }),
    ]);
    const documentStore = new StudioDocumentStore();
    const saveStore = new StudioSaveStore({
      documentStore,
      transport: createStudioDraftRepository({ fetchImpl }),
      timers: staticTimers as any,
      now: () => 1000,
    });
    await saveStore.load();
    addItem(documentStore, "item-2");
    saveStore.markDirty();

    const conflict: any = await saveStore.flushNow();
    expect(conflict).toEqual({ ok: false, reason: "conflict", currentRevision: 9 });
    expect(saveStore.getState().pendingConflict?.currentRevision).toBe(9);

    const overwritten: any = await saveStore.resolveConflictOverwrite();
    expect(overwritten).toEqual({ ok: true, reason: "saved", revision: 10 });
    expect(calls[2].body.revision).toBe(9);
  });

  it("428 交互确认：未确认 blocked，带 token 确认后重试成功", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => response(200, { revision: 5, scene: floorDocument() }),
      () =>
        response(428, {
          detail: {
            code: STUDIO3D_INTERACTION_CONFIRMATION,
            token: "tok-1",
            message: "需确认",
            impacts: [],
            projects: [],
          },
        }),
      () => response(200, { revision: 6, scene: floorDocument("chair") }),
    ]);
    const documentStore = new StudioDocumentStore();
    const saveStore = new StudioSaveStore({
      documentStore,
      transport: createStudioDraftRepository({ fetchImpl }),
      timers: staticTimers as any,
      now: () => 1000,
    });
    await saveStore.load();
    addItem(documentStore, "item-2");
    saveStore.markDirty();

    const blocked: any = await saveStore.flushNow();
    expect(blocked).toEqual({ ok: false, reason: "confirmation-required", token: "tok-1" });
    expect(saveStore.getState().status).toBe("blocked");

    const confirmed: any = await saveStore.confirmInteraction();
    expect(confirmed).toEqual({ ok: true, reason: "saved", revision: 6 });
    expect(calls[2].body.interactionConfirmation).toBe("tok-1");
  });

  it("pagehide 走 repository.beacon（keepalive PUT），不改状态机", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => response(200, { revision: 5, scene: floorDocument() }),
      () => response(200, { revision: 6, scene: floorDocument("chair") }),
    ]);
    const documentStore = new StudioDocumentStore();
    const saveStore = new StudioSaveStore({
      documentStore,
      transport: createStudioDraftRepository({ fetchImpl }),
      timers: staticTimers as any,
      now: () => 1000,
    });
    await saveStore.load();
    addItem(documentStore, "item-2");
    saveStore.markDirty();
    expect(saveStore.flushOnPageHide()).toEqual({ sent: true });
    expect(calls[1].init.keepalive).toBe(true);
    expect(calls[1].body.revision).toBe(5);
    expect(documentStore.getLoadedRevision()).toBe(5);
  });
});
