/**
 * C2 —— 保存状态机（自动保存 / 失败重试 / 409 冲突 / 428 交互确认 / 退出与 pagehide）。
 *
 * 设计要点：
 * 1. 状态机集中在 store：status、连续失败次数、退避时间、冲突/确认待决状态、在途 PUT、
 *    自动保存防抖与最大延迟都在这里，宿主只负责调用 markDirty() 和读 getState()。
 * 2. 版本线来自 document-store（C3）：flushNow() 一律使用 loadedRevision，成功后 applySaved()
 *    推进；runtimeSceneRevision 由 C3 自己维护，本模块不碰。
 * 3. 纯函数可测：错误分类 classifySaveError、退避 backoffDelay、防抖 computeAutosaveDelay
 *    都是纯函数；传输（GET/PUT/sendBeacon）与定时器由宿主注入。
 * 4. local === remote 不静默跳过：内容与服务器相同时仍然发一次 PUT 以推进 revision，
 *    只有服务器 ACK 之后才算保存成功（isNoopDirty 只用于展示“无实质改动”）。
 * 5. 409 三出口：载入服务器版本 / 覆盖服务器（用 currentRevision）/ 导出本地副本；
 *    在用户选择前不自动重试，也不让退出静默丢改动。
 * 6. 428 交互确认：把 token 存下，用户确认后带 token 重试；未确认前 status=blocked。
 * 7. pagehide：sendBeacon 尽力而为，不做乐观推进 revision（下次 GET 为准）。
 */

import type { StudioDocumentState, StudioDraftPayload, StudioDocumentStore } from "./document-store";

const AUTOSAVE_DEBOUNCE_MS = 3000;
const AUTOSAVE_MAX_DELAY_MS = 15000;
const SAVE_RETRY_BASE_MS = 2000;
const SAVE_RETRY_MAX_MS = 30000;
const SAVE_RETRY_EXPONENT_CAP = 4;

type SaveStatus =
  | "idle"
  | "loading"
  | "blocked-readonly"
  | "saved"
  | "dirty"
  | "saving"
  | "retrying"
  | "offline"
  | "conflict"
  | "blocked"
  | "failed";

export interface SaveRequestError {
  /** HTTP 状态码；网络错误时缺省。 */
  status?: number;
  /** 后端返回的 detail（409/428 携带结构化字段）。 */
  detail?: any;
  message?: string;
}

type SaveErrorCategory =
  | "conflict"
  | "confirmation"
  | "payload-too-large"
  | "auth"
  | "invalid"
  | "retryable";

function classifySaveError(error: SaveRequestError): SaveErrorCategory {
  const status = error.status;
  if (status === 409) return "conflict";
  if (status === 428) return "confirmation";
  if (status === 413) return "payload-too-large";
  if (status === 401 || status === 403) return "auth";
  if (status === 422) return "invalid";
  if (status === undefined || status === 408 || status === 425 || status === 429 || status >= 500) {
    return "retryable";
  }
  return "invalid";
}

function isRetryableSaveError(error: SaveRequestError): boolean {
  return classifySaveError(error) === "retryable";
}

/** 退避：2s → 4s → 8s → 16s → 30s（cap），与旧实现的 min(30000, 2000*2**(n-1)) 一致。 */
function backoffDelay(attempt: number): number {
  const normalized = Math.max(1, Math.trunc(attempt));
  return Math.min(
    SAVE_RETRY_MAX_MS,
    SAVE_RETRY_BASE_MS * 2 ** Math.min(normalized - 1, SAVE_RETRY_EXPONENT_CAP),
  );
}

/**
 * 自动保存延迟：防抖 3s，但首个改动后最多等 15s 必须发一次。
 * firstDirtyAt === null 表示当前没有待保存改动。
 */
function computeAutosaveDelay(now: number, firstDirtyAt: number | null): number {
  if (firstDirtyAt === null) return AUTOSAVE_DEBOUNCE_MS;
  const deadline = firstDirtyAt + AUTOSAVE_MAX_DELAY_MS;
  return Math.max(0, Math.min(AUTOSAVE_DEBOUNCE_MS, deadline - now));
}

export interface SaveTransportPutRequest {
  revision: number;
  scene: any;
  interactionConfirmation?: string;
}

export type SaveTransportResult =
  | { ok: true; payload: StudioDraftPayload }
  | { ok: false; error: SaveRequestError };

export interface SaveTransport {
  /** GET /api/v1/studio3d；空场景返回 revision=0 / scene=null。 */
  load(): Promise<SaveTransportResult>;
  /** PUT /api/v1/studio3d。 */
  put(request: SaveTransportPutRequest): Promise<SaveTransportResult>;
  /** pagehide keepalive（sendBeacon / fetch keepalive）。 */
  beacon?: (request: SaveTransportPutRequest) => boolean;
}

interface SaveStoreTimers {
  setTimeout: (handler: () => void, delayMs: number) => number;
  clearTimeout: (handle: number) => void;
}

interface SaveConflictState {
  /** 冲突时服务器的 revision（来自 409 detail.currentRevision）。 */
  currentRevision: number | null;
  detectedAt: number;
}

interface SaveConfirmationState {
  token: string;
  message: string;
  impacts: any;
  projects: any;
  requestedAt: number;
}

export interface SaveStoreState {
  status: SaveStatus;
  /** 连续可重试失败次数（成功后归零）。 */
  attempt: number;
  /** 下次重试时间戳；非 retrying 时为 null。 */
  nextRetryAt: number | null;
  /** 首次变脏时间（用于 15s 最大延迟）；无待保存改动时 null。 */
  firstDirtyAt: number | null;
  isSaveInFlight: boolean;
  pendingConflict: SaveConflictState | null;
  pendingConfirmation: SaveConfirmationState | null;
  lastError: SaveRequestError | null;
  lastErrorCategory: SaveErrorCategory | null;
  lastSavedAt: number | null;
  /** 覆盖场景下使用的 PUT revision（409 第二出口）。 */
  revisionOverride: number | null;
  /** 已确认的交互 token（428 后由用户确认写入）。 */
  interactionToken: string | null;
  online: boolean;
}

interface SaveStoreDeps {
  documentStore: StudioDocumentStore;
  transport: SaveTransport;
  /**
   * 取当前要保存的场景（宿主传 `getLocalSaveRevision`）。
   * 文档 store 里的 document 只是“最近一次载入/保存”的副本；本地修改是就地发生的，
   * 所以 PUT / beacon 都必须重新取一次宿主快照，不能直接发 documentStore.getDocument()。
   */
  getScene?: () => any;
  timers?: SaveStoreTimers;
  now?: () => number;
  /** 是否处于 embedded 预览舞台（不自动保存）。 */
  isEmbedded?: () => boolean;
  /** 页面是否挂起（隐藏/冻结），暂时不保存。 */
  isPageSuspended?: () => boolean;
  isOnline?: () => boolean;
  /** 导出本地副本（409 第三出口）；未提供时返回 export-unavailable。 */
  exportLocalCopy?: (scene: any) => void | Promise<void>;
  onStateChange?: (state: SaveStoreState) => void;
}

export type FlushResult =
  | { ok: true; reason: "saved" | "clean"; revision: number }
  | { ok: false; reason: "conflict"; currentRevision: number | null }
  | { ok: false; reason: "confirmation-required"; token: string }
  | { ok: false; reason: "fatal"; error: SaveRequestError; category: SaveErrorCategory }
  | { ok: false; reason: "retry-scheduled"; retryAt: number; error: SaveRequestError }
  | { ok: false; reason: "offline" }
  | { ok: false; reason: "deferred" }
  | { ok: false; reason: "blocked" };

type LoadResult =
  | { ok: true; revision: number }
  | { ok: false; reason: "fatal"; error: SaveRequestError }
  | { ok: false; reason: "retryable"; error: SaveRequestError };

const defaultTimers: SaveStoreTimers = {
  setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs) as unknown as number,
  clearTimeout: (handle) => globalThis.clearTimeout(handle as any),
};

function createInitialState(online: boolean): SaveStoreState {
  return {
    status: "idle",
    attempt: 0,
    nextRetryAt: null,
    firstDirtyAt: null,
    isSaveInFlight: false,
    pendingConflict: null,
    pendingConfirmation: null,
    lastError: null,
    lastErrorCategory: null,
    lastSavedAt: null,
    revisionOverride: null,
    interactionToken: null,
    online,
  };
}

function detailOf(error: SaveRequestError): any {
  return error.detail && typeof error.detail === "object" ? error.detail : {};
}

export class StudioSaveStore {
  private readonly deps: SaveStoreDeps;
  private readonly documentStore: StudioDocumentStore;
  private readonly timers: SaveStoreTimers;
  private readonly now: () => number;
  private state: SaveStoreState;
  private autosaveTimer: number | null = null;
  private inFlight: Promise<FlushResult> | null = null;
  private readonly listeners = new Set<(state: SaveStoreState) => void>();

  constructor(deps: SaveStoreDeps) {
    this.deps = deps;
    this.documentStore = deps.documentStore;
    this.timers = deps.timers ?? defaultTimers;
    this.now = deps.now ?? Date.now;
    this.state = createInitialState(deps.isOnline ? deps.isOnline() : true);
  }

  getState(): SaveStoreState {
    return { ...this.state };
  }

  subscribe(listener: (state: SaveStoreState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  hasUnsavedChanges(): boolean {
    return this.documentStore.isDirty();
  }

  hasPendingDialog(): boolean {
    return this.state.pendingConflict !== null || this.state.pendingConfirmation !== null;
  }

  /** 载入草稿；失败后进入 blocked-readonly（只读、可重试/导出/放弃）。 */
  async load(): Promise<LoadResult> {
    this.cancelTimers();
    this.patch({ status: "loading", lastError: null, lastErrorCategory: null });
    const result = await this.deps.transport.load();
    if (result.ok) {
      const payload = result.payload;
      this.documentStore.applyLoaded(
        { revision: payload.revision, scene: payload.scene },
        this.documentStore.getRuntimeSceneRevision(),
      );
      this.patch({
        status: "saved",
        attempt: 0,
        nextRetryAt: null,
        firstDirtyAt: null,
        lastError: null,
        lastErrorCategory: null,
        lastSavedAt: this.now(),
        pendingConflict: null,
        pendingConfirmation: null,
        revisionOverride: null,
        interactionToken: null,
      });
      return { ok: true, revision: payload.revision };
    }
    const category = classifySaveError(result.error);
    this.patch({
      status: "blocked-readonly",
      lastError: result.error,
      lastErrorCategory: category,
    });
    return { ok: false, reason: category === "retryable" ? "retryable" : "fatal", error: result.error };
  }

  /**
   * 宿主已经用自己的 GET 应用了草稿（boot 载入 / 409「加载服务器版本」/ 只读重试）：
   * 同步状态机为 saved，不重复请求。`payload` 仅供宿主未先行 applyLoaded 时补写文档 store。
   */
  acceptLoaded(payload?: StudioDraftPayload): void {
    if (payload) {
      this.documentStore.applyLoaded({
        revision: payload.revision,
        scene: payload.scene,
      });
    }
    this.cancelTimers();
    this.patch({
      status: "saved",
      attempt: 0,
      nextRetryAt: null,
      firstDirtyAt: null,
      lastError: null,
      lastErrorCategory: null,
      lastSavedAt: this.now(),
      pendingConflict: null,
      pendingConfirmation: null,
      revisionOverride: null,
      interactionToken: null,
    });
  }

  /** 载入失败：进入只读（禁止自动保存），宿主负责横幅 / 重试 / 导出本地副本。 */
  markLoadFailed(error: SaveRequestError): void {
    this.cancelTimers();
    this.patch({
      status: "blocked-readonly",
      isSaveInFlight: false,
      lastError: error,
      lastErrorCategory: classifySaveError(error),
      pendingConflict: null,
      pendingConfirmation: null,
    });
  }

  /** 文档已被就地修改后调用；记录脏标记并调度自动保存。 */
  markDirty(): void {
    if (!this.documentStore.isDirty()) {
      // 文档已追平（例如撤销回原状），清掉待保存状态。
      if (this.state.firstDirtyAt !== null && !this.state.isSaveInFlight) {
        this.cancelAutosaveTimer();
        this.patch({ status: "saved", firstDirtyAt: null, attempt: 0, nextRetryAt: null });
      }
      return;
    }
    const firstDirtyAt = this.state.firstDirtyAt ?? this.now();
    const nextStatus = this.computeDirtyStatus();
    this.patch({ status: nextStatus, firstDirtyAt });
    if (nextStatus === "dirty" || nextStatus === "retrying") this.scheduleAutosave();
  }

  /** 手动调度（取消已有定时器后按防抖/最大延迟重排；`explicitDelayMs` 供宿主立即保存）。 */
  scheduleAutosave(explicitDelayMs?: number): void {
    if (this.isSchedulingBlocked()) return;
    this.cancelAutosaveTimer();
    const delay =
      explicitDelayMs !== undefined
        ? Math.max(0, Math.trunc(explicitDelayMs) || 0)
        : this.state.status === "retrying" && this.state.nextRetryAt !== null
          ? Math.max(0, this.state.nextRetryAt - this.now())
          : computeAutosaveDelay(this.now(), this.state.firstDirtyAt);
    this.autosaveTimer = this.timers.setTimeout(() => {
      this.autosaveTimer = null;
      void this.flushNow();
    }, delay);
  }

  /** 立即保存（自动保存、退出确认、手动保存共用入口，对在途 PUT 去重）。 */
  async flushNow(): Promise<FlushResult> {
    if (this.inFlight) return this.inFlight;
    if (this.deps.isEmbedded?.() || this.deps.isPageSuspended?.()) return { ok: false, reason: "deferred" };
    if (this.sceneForSave() == null || this.state.status === "blocked-readonly") {
      return { ok: false, reason: "blocked" };
    }
    if (this.state.status === "conflict") {
      return { ok: false, reason: "conflict", currentRevision: this.state.pendingConflict?.currentRevision ?? null };
    }
    if (this.state.status === "failed") {
      return {
        ok: false,
        reason: "fatal",
        error: this.state.lastError ?? {},
        category: this.state.lastErrorCategory ?? "invalid",
      };
    }
    if (!this.state.online) {
      this.patch({ status: "offline" });
      return { ok: false, reason: "offline" };
    }
    if (!this.documentStore.isDirty()) {
      this.patch({ status: "saved", firstDirtyAt: null });
      return { ok: true, reason: "clean", revision: this.documentStore.getLoadedRevision() };
    }

    this.cancelTimers();
    const promise = this.performSave();
    this.inFlight = promise;
    try {
      return await promise;
    } finally {
      this.inFlight = null;
    }
  }

  /** 退出流程：等保存结束；冲突/确认未决时返回失败，交由三态对话框处理。 */
  async requestExit(): Promise<FlushResult> {
    const result = await this.flushNow();
    if (result.ok) return result;
    if (result.reason === "retry-scheduled") return this.flushNowAfterResetAttempt();
    return result;
  }

  private async flushNowAfterResetAttempt(): Promise<FlushResult> {
    if (this.inFlight) return this.inFlight;
    this.patch({ status: "dirty", attempt: 0, nextRetryAt: null });
    const promise = this.performSave();
    this.inFlight = promise;
    try {
      return await promise;
    } finally {
      this.inFlight = null;
    }
  }

  /** pagehide：sendBeacon 尽力而为，不推进 revision、不改状态机。 */
  flushOnPageHide(): { sent: boolean } {
    const beacon = this.deps.transport.beacon;
    if (!beacon) return { sent: false };
    if (!this.documentStore.isDirty()) return { sent: false };
    if (this.state.isSaveInFlight || this.inFlight) return { sent: false };
    const revision = this.state.revisionOverride ?? this.documentStore.getLoadedRevision();
    try {
      const sent = beacon({
        revision,
        scene: this.sceneForSave(),
        ...(this.state.interactionToken
          ? { interactionConfirmation: this.state.interactionToken }
          : {}),
      });
      return { sent: sent === true };
    } catch {
      return { sent: false };
    }
  }

  setOnline(online: boolean): void {
    const wasOffline = !this.state.online;
    this.patch({ online });
    if (!online) {
      this.cancelTimers();
      if (this.documentStore.isDirty()) this.patch({ status: "offline" });
      return;
    }
    if (wasOffline && this.documentStore.isDirty()) {
      this.patch({ status: this.computeDirtyStatus() });
      this.scheduleAutosave();
    }
  }

  /** 409 第一出口：放弃本地改动，载入服务器最新版本。 */
  async resolveConflictLoadRemote(): Promise<LoadResult> {
    this.cancelTimers();
    return this.load();
  }

  /** 409 第二出口：用服务器 currentRevision 覆盖远端。 */
  async resolveConflictOverwrite(): Promise<FlushResult> {
    const currentRevision = this.state.pendingConflict?.currentRevision;
    if (typeof currentRevision !== "number") {
      return { ok: false, reason: "conflict", currentRevision: currentRevision ?? null };
    }
    this.patch({
      pendingConflict: null,
      status: "dirty",
      revisionOverride: currentRevision,
      attempt: 0,
      nextRetryAt: null,
    });
    return this.flushNow();
  }

  /** 409 第三出口：导出本地副本（不改变与服务端的冲突状态）。 */
  async exportLocalCopy(): Promise<{ ok: boolean; reason?: "export-unavailable" }> {
    const exporter = this.deps.exportLocalCopy;
    if (!exporter) return { ok: false, reason: "export-unavailable" };
    await exporter(this.documentStore.getDocument());
    return { ok: true };
  }

  /** 428 用户确认删除交互配置后：记下 token 并立即重试。 */
  async confirmInteraction(token?: string): Promise<FlushResult> {
    const confirmation = this.state.pendingConfirmation;
    const nextToken = token ?? confirmation?.token ?? this.state.interactionToken;
    if (!nextToken) return { ok: false, reason: "confirmation-required", token: "" };
    this.patch({
      pendingConfirmation: null,
      interactionToken: nextToken,
      status: "dirty",
      attempt: 0,
      nextRetryAt: null,
    });
    return this.flushNow();
  }

  /** 428 用户取消（保留本地改动，状态回到 dirty，不自动重试）。 */
  cancelConfirmation(): void {
    // 先清掉待决确认再算状态，否则 computeDirtyStatus 仍会看到 blocked。
    this.state.pendingConfirmation = null;
    this.patch({ status: this.computeDirtyStatus() });
  }

  dispose(): void {
    this.cancelTimers();
    this.listeners.clear();
  }

  /** 当前要保存的场景：优先宿主快照（本地修改就地发生），退化为文档 store。 */
  private sceneForSave(): any {
    const scene = this.deps.getScene ? this.deps.getScene() : this.documentStore.getDocument();
    return scene ?? null;
  }

  private async performSave(): Promise<FlushResult> {
    const revision = this.state.revisionOverride ?? this.documentStore.getLoadedRevision();
    const scene = this.sceneForSave();
    const request: SaveTransportPutRequest = {
      revision,
      scene,
      ...(this.state.interactionToken ? { interactionConfirmation: this.state.interactionToken } : {}),
    };
    this.patch({ status: "saving", isSaveInFlight: true, lastError: null, lastErrorCategory: null });
    const result = await this.deps.transport.put(request);
    if (result.ok) {
      const payload = result.payload;
      this.documentStore.applySaved({ revision: payload.revision, scene: payload.scene ?? scene });
      this.patch({
        status: "saved",
        isSaveInFlight: false,
        attempt: 0,
        nextRetryAt: null,
        firstDirtyAt: null,
        lastError: null,
        lastErrorCategory: null,
        lastSavedAt: this.now(),
        revisionOverride: null,
        pendingConflict: null,
        pendingConfirmation: null,
        interactionToken: null,
      });
      return { ok: true, reason: "saved", revision: payload.revision };
    }

    const error = result.error;
    const category = classifySaveError(error);
    this.patch({ isSaveInFlight: false, lastError: error, lastErrorCategory: category });

    if (category === "conflict") {
      const detail = detailOf(error);
      const currentRevision =
        typeof detail.currentRevision === "number" ? detail.currentRevision : null;
      this.cancelTimers();
      this.patch({
        status: "conflict",
        pendingConflict: { currentRevision, detectedAt: this.now() },
        revisionOverride: null,
      });
      return { ok: false, reason: "conflict", currentRevision };
    }

    if (category === "confirmation") {
      const detail = detailOf(error);
      const token = typeof detail.token === "string" ? detail.token : "";
      this.cancelTimers();
      this.patch({
        status: "blocked",
        pendingConfirmation: {
          token,
          message: typeof detail.message === "string" ? detail.message : "",
          impacts: detail.impacts ?? null,
          projects: detail.projects ?? null,
          requestedAt: this.now(),
        },
      });
      return { ok: false, reason: "confirmation-required", token };
    }

    if (category === "retryable") {
      const attempt = this.state.attempt + 1;
      const retryAt = this.now() + backoffDelay(attempt);
      this.patch({
        status: "retrying",
        attempt,
        nextRetryAt: retryAt,
      });
      this.scheduleAutosave();
      return { ok: false, reason: "retry-scheduled", retryAt, error };
    }

    this.cancelTimers();
    this.patch({ status: "failed", revisionOverride: null });
    return { ok: false, reason: "fatal", error, category };
  }

  private computeDirtyStatus(): SaveStatus {
    if (!this.state.online) return "offline";
    if (this.state.pendingConflict) return "conflict";
    if (this.state.pendingConfirmation) return "blocked";
    if (this.state.status === "failed") return "failed";
    if (this.state.status === "blocked-readonly") return "blocked-readonly";
    if (this.state.status === "saving") return "saving";
    if (this.state.attempt > 0) return "retrying";
    return "dirty";
  }

  private isSchedulingBlocked(): boolean {
    if (this.deps.isEmbedded?.() || this.deps.isPageSuspended?.()) return true;
    if (!this.state.online) return true;
    if (!this.documentStore.getDocument()) return true;
    if (this.state.status === "conflict" || this.state.status === "blocked") return true;
    if (this.state.status === "failed" || this.state.status === "blocked-readonly") return true;
    return false;
  }

  private cancelAutosaveTimer(): void {
    if (this.autosaveTimer !== null) {
      this.timers.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  private cancelTimers(): void {
    this.cancelAutosaveTimer();
  }

  private patch(partial: Partial<SaveStoreState>): void {
    this.state = { ...this.state, ...partial };
    const snapshot = this.getState();
    this.deps.onStateChange?.(snapshot);
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // 监听器异常不得影响保存流程。
      }
    }
  }
}

/** 供宿主构建保存状态展示用（避免两处各写一套）。 */
function describeSaveState(state: SaveStoreState, documentState: StudioDocumentState): string {
  if (state.pendingConflict) return "conflict";
  if (state.pendingConfirmation) return "blocked";
  if (documentState.dirty) return state.status === "saving" ? "saving" : state.status;
  return state.status;
}