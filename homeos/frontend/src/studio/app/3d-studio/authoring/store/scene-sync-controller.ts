/**
 * C4 —— 场景同步控制器（轮询 / 实时推送）。
 *
 * 设计约束（对应重构目标）：
 * 1. **决策是纯函数**：`decideSceneSync` 只吃「运行时场景快照 + 远端场景 + 本地脏标记 +
 *    页面状态」，不发起请求、不改文档、不写历史；便于覆盖所有分支。
 * 2. **只读运行时快照，不碰保存版本线**：轮询路径绝不读取/推进 `loadedRevision`，
 *    也不从远端载荷里取 revision —— 避让「轮询推进了保存版本、导致 CAS 失败」的竞态。
 * 3. **非全量只更新运行时**：楼层内容变化 → 只替换该楼层 scene（保留本地视图设置）；
 *    仅灯光/楼层名变化 → 只同步 `baseLighting` 与楼层名；不重建场景、不弹确认。
 * 4. **全量先 flush**：本地脏时先 `flush()` 保存，保存成功才重建；保存冲突则**不覆盖**
 *    本地（outcome=conflict，交给 save-store 的 409 三出口），保存失败则本轮搁置。
 * 5. embedded 预览舞台不参与同步；页面挂起时延后。
 */

import { sceneUpdatePlan } from "../../../bridge/scene/scene-update";
import { syncModelRemarks } from "../../../shared/model-remarks";

/** 与 scene-update.ts 保持一致：这些键属于「视图/会话」状态，不参与同步比较。 */
const VIEW_SETTING_KEYS = [
  "planViewRotation",
  "cameraView",
  "cameraTopRotation",
  "cameraMode",
  "cameraFocalLength",
  "fixedCameraView",
  "livePreviewEnabled",
  "backgroundVisible",
  "snapEnabled",
  "snapEndpoints",
  "snapIntersections",
  "snapSegments",
  "snapOrthogonal",
  "snapAngles",
  "snapGrid",
  "snapTolerance",
  "previewPanelRatio",
  "detailsPanelWidthRatio",
];

type FloorNameChange = { floorId: string; from: string; to: string };

type SceneSyncDecision =
  | { kind: "ignored"; reason: "embedded" | "no-visual-change" }
  | { kind: "deferred"; reason: "page-suspended" }
  | { kind: "metadata-only"; floorNameChanges: FloorNameChange[] }
  | { kind: "lighting-only"; lighting: boolean; floorNameChanges: FloorNameChange[] }
  | { kind: "merge-floors"; floorIds: string[]; lighting: boolean; floorNameChanges: FloorNameChange[] }
  | { kind: "full-reload" }
  | { kind: "flush-then-reload" }
  | { kind: "conflict"; reason: "local-dirty" };

export type SceneSyncOutcome =
  | { kind: "ignored"; reason: "embedded" | "no-visual-change" }
  /**
   * `reload-unavailable`：需要全量重建但没人实现 `replaceScene`。
   *
   * 以前 studio-app 注入的是空实现 `replaceScene: () => {}`，全量变更会被吞掉却仍上报
   * `full-reload` —— 调用方按「已重建」继续走，界面停在旧场景上且没有任何线索。现在把这条
   * 分支显式化，让「没实现」可被观测。
   */
  | { kind: "deferred"; reason: "page-suspended" | "reload-unavailable" }
  | { kind: "metadata-only"; floorNameChanges: FloorNameChange[] }
  | { kind: "lighting-only"; lighting: boolean; floorNameChanges: FloorNameChange[] }
  | { kind: "merge-floors"; floorIds: string[]; lighting: boolean; floorNameChanges: FloorNameChange[] }
  | { kind: "full-reload"; afterFlush: boolean }
  | { kind: "conflict"; reason: "local-dirty" }
  | { kind: "stalled"; reason: "flush-failed" };

interface SceneSyncInput {
  /** 运行时场景快照（含视图设置），不是保存文档。 */
  runtimeScene: any;
  remoteScene: any;
  isDirty: boolean;
  isEmbedded: boolean;
  isPageSuspended: boolean;
}

/** 预算「楼层集合」的 id 顺序，用于稳定比较。 */
function floorIdsOf(scene: any): string[] {
  return Array.isArray(scene?.floors) ? scene.floors.map((floor: any) => String(floor?.id ?? "")) : [];
}

function diffFloorNames(runtimeScene: any, remoteScene: any): FloorNameChange[] {
  const localById = new Map<string, any>();
  for (const floor of runtimeScene?.floors ?? []) localById.set(String(floor?.id ?? ""), floor);
  const changes: FloorNameChange[] = [];
  for (const remoteFloor of remoteScene?.floors ?? []) {
    const floorId = String(remoteFloor?.id ?? "");
    const localFloor = localById.get(floorId);
    if (!localFloor) continue;
    const from = typeof localFloor.name === "string" ? localFloor.name : "";
    const floorName = typeof remoteFloor.name === "string" ? remoteFloor.name : "";
    if (from !== floorName) changes.push({ floorId, from, to: floorName });
  }
  return changes;
}

/** 场景楼层数组（保持对象引用，供就地回填）。 */
function sceneFloorRecords(scene: unknown): Record<string, unknown>[] {
  const floors = (scene as { floors?: unknown } | null | undefined)?.floors;
  if (!Array.isArray(floors)) return [];
  return floors.filter(
    (floor): floor is Record<string, unknown> => !!floor && typeof floor === "object",
  );
}

/** 模型备注指纹：`集合/id → remark`，只用于判断「备注是不是别人改过」。 */
function floorRemarkFingerprint(scene: unknown): string {
  const floorScene = (scene ?? {}) as Record<string, unknown>,
    entries: Array<[string, string, string]> = [];
  for (const collectionKey of ["items", "doors"]) {
    const collection = floorScene[collectionKey];
    if (!Array.isArray(collection)) continue;
    for (const entry of collection)
      entries.push([
        collectionKey,
        String((entry as Record<string, unknown> | null)?.id ?? ""),
        String((entry as Record<string, unknown> | null)?.remark ?? ""),
      ]);
  }
  return JSON.stringify(entries);
}

/**
 * 备注变化**不会**进 `sceneUpdatePlan`（`withoutModelRemarks` 把它们剔掉了），
 * 否则改个备注就要重建整个楼层。但「只改备注」的远端变更仍然要落到本地，
 * 否则配置弹窗里看到的是旧备注 —— 这里单独认出来，走 metadata-only。
 */
function hasFloorRemarkChanges(runtimeScene: unknown, remoteScene: unknown): boolean {
  const localById = new Map<string, Record<string, unknown>>();
  for (const floor of sceneFloorRecords(runtimeScene)) localById.set(String(floor.id ?? ""), floor);
  for (const remoteFloor of sceneFloorRecords(remoteScene)) {
    const localFloor = localById.get(String(remoteFloor.id ?? ""));
    if (!localFloor) continue;
    if (floorRemarkFingerprint(localFloor.scene) !== floorRemarkFingerprint(remoteFloor.scene))
      return true;
  }
  return false;
}

/**
 * 纯决策：给定输入返回本轮同步动作。
 * 顺序敏感：embedded → 挂起 → 无视觉变化 → 全量 → 楼层合并 → 仅灯光 → 仅楼层名。
 */
function decideSceneSync(input: SceneSyncInput): SceneSyncDecision {
  if (input.isEmbedded) return { kind: "ignored", reason: "embedded" };
  if (input.isPageSuspended) return { kind: "deferred", reason: "page-suspended" };
  const plan = sceneUpdatePlan(input.runtimeScene, input.remoteScene);
  const floorNameChanges = diffFloorNames(input.runtimeScene, input.remoteScene);
  const hasChanges =
    plan.visual || floorNameChanges.length > 0 || hasFloorRemarkChanges(input.runtimeScene, input.remoteScene);
  if (!hasChanges) return { kind: "ignored", reason: "no-visual-change" };
  if (plan.full) return input.isDirty ? { kind: "flush-then-reload" } : { kind: "full-reload" };
  if (plan.floors.length > 0) {
    return { kind: "merge-floors", floorIds: [...plan.floors], lighting: plan.lighting, floorNameChanges };
  }
  if (plan.lighting) return { kind: "lighting-only", lighting: true, floorNameChanges };
  return { kind: "metadata-only", floorNameChanges };
}


/** 仅同步灯光：就地替换 baseLighting（保留引用，避免重渲染拿旧对象）。 */
function applyBaseLighting(runtimeScene: any, remoteScene: any): boolean {
  if (!runtimeScene || !remoteScene) return false;
  if (runtimeScene.baseLighting === remoteScene.baseLighting) return false;
  runtimeScene.baseLighting = remoteScene.baseLighting;
  return true;
}

function applyFloorNames(runtimeScene: any, changes: FloorNameChange[]): number {
  if (!runtimeScene || !Array.isArray(runtimeScene.floors) || changes.length === 0) return 0;
  const byId = new Map(changes.map((change) => [change.floorId, change.to]));
  let applied = 0;
  for (const floor of runtimeScene.floors) {
    const nextName = byId.get(String(floor?.id ?? ""));
    if (nextName === undefined || floor.name === nextName) continue;
    floor.name = nextName;
    applied += 1;
  }
  return applied;
}

/**
 * 合并指定楼层：只替换这些楼层的 scene 内容（对象引用保持），并保留本地视图设置。
 * 返回实际替换的楼层 id（远端缺失的楼层会被跳过）。
 */
export function mergeFloors(runtimeScene: any, remoteScene: any, floorIds: readonly string[]): string[] {
  if (!runtimeScene || !remoteScene || !Array.isArray(runtimeScene.floors)) return [];
  const localById = new Map<string, any>();
  for (const floor of runtimeScene.floors) localById.set(String(floor?.id ?? ""), floor);
  const remoteById = new Map<string, any>();
  for (const floor of remoteScene.floors ?? []) remoteById.set(String(floor?.id ?? ""), floor);
  const replaced: string[] = [];
  for (const floorId of floorIds) {
    const localFloor = localById.get(floorId);
    const remoteFloor = remoteById.get(floorId);
    if (!localFloor || !remoteFloor) continue;
    const localSettings = localFloor.scene?.settings;
    const nextScene = { ...remoteFloor.scene };
    if (localSettings && typeof localSettings === "object") {
      // 视图键（相机/吸附/面板宽度）以本地为准：远端不覆盖用户当前视图状态。
      const mergedSettings: Record<string, unknown> = { ...(remoteFloor.scene?.settings ?? {}) };
      for (const key of VIEW_SETTING_KEYS) {
        if (key in localSettings) mergedSettings[key] = localSettings[key];
      }
      nextScene.settings = mergedSettings;
    }
    localFloor.scene = nextScene;
    replaced.push(floorId);
  }
  return replaced;
}

interface SceneSyncDeps {
  /** 运行时场景快照读取器。 */
  getRuntimeScene: () => any;
  /** 来自 document-store 的脏标记（不得读取保存 revision）。 */
  isDirty: () => boolean;
  /** 脏时先推送保存；返回 saved / conflict / failed。 */
  flush: () => Promise<"saved" | "conflict" | "failed">;
  /**
   * 全量重建场景。
   *
   * **可选**：3D 舞台有自己的 adopt 流程（`readSceneUpdate` → `adoptSceneUpdate`），
   * 编辑器侧通常不需要再重建一次。未注入时控制器会返回
   * `{ kind: "deferred", reason: "reload-unavailable" }`，而不是假装重建完成。
   */
  replaceScene?: (remoteScene: any) => void;
  isEmbedded?: () => boolean;
  isPageSuspended?: () => boolean;
  onOutcome?: (outcome: SceneSyncOutcome) => void;
}

export class StudioSceneSyncController {
  private readonly deps: SceneSyncDeps;
  private pendingFlush: Promise<"saved" | "conflict" | "failed"> | null = null;
  private flushInFlight = false;
  private pendingReload: Promise<SceneSyncOutcome> | null = null;

  constructor(deps: SceneSyncDeps) {
    this.deps = deps;
  }

  /** 只做决策，不产生副作用（供轮询前判断/测试）。 */
  decide(remoteScene: any): SceneSyncDecision {
    return decideSceneSync({
      runtimeScene: this.deps.getRuntimeScene(),
      remoteScene,
      isDirty: this.deps.isDirty(),
      isEmbedded: this.deps.isEmbedded?.() ?? false,
      isPageSuspended: this.deps.isPageSuspended?.() ?? false,
    });
  }

  /** 处理一次远端场景；并发调用复用同一个在途 flush。 */
  async handleRemoteScene(remoteScene: any): Promise<SceneSyncOutcome> {
    const outcome = await this.run(this.decide(remoteScene), remoteScene);
    this.deps.onOutcome?.(outcome);
    return outcome;
  }

  private async run(decision: SceneSyncDecision, remoteScene: any): Promise<SceneSyncOutcome> {
    switch (decision.kind) {
      case "ignored":
      case "deferred":
        return decision;
      case "metadata-only":
        this.applyNames(decision.floorNameChanges);
        this.applyRemarks(remoteScene);
        return decision;
      case "lighting-only": {
        const runtimeScene = this.deps.getRuntimeScene();
        const lighting = applyBaseLighting(runtimeScene, remoteScene);
        this.applyNames(decision.floorNameChanges);
        this.applyRemarks(remoteScene);
        return { kind: "lighting-only", lighting, floorNameChanges: decision.floorNameChanges };
      }
      case "merge-floors": {
        const runtimeScene = this.deps.getRuntimeScene();
        const replaced = mergeFloors(runtimeScene, remoteScene, decision.floorIds);
        const lighting = decision.lighting ? applyBaseLighting(runtimeScene, remoteScene) : false;
        this.applyNames(decision.floorNameChanges);
        return {
          kind: "merge-floors",
          floorIds: replaced,
          lighting,
          floorNameChanges: decision.floorNameChanges,
        };
      }
      case "full-reload":
        return this.reloadOnce(remoteScene, false);
      case "flush-then-reload":
        return this.reloadOnce(remoteScene, true);
      case "conflict":
        return decision;
    }
  }

  /**
   * 全量重建；并发轮询复用同一个在途重建（首个请求的远端载荷胜出，后续轮询会再决策）。
   */
  private reloadOnce(remoteScene: any, afterFlush: boolean): Promise<SceneSyncOutcome> {
    // 没有重建实现就别先 flush：保存一次却仍然停在旧场景，等于白推一次版本。
    const replaceScene = this.deps.replaceScene;
    if (!replaceScene) {
      return Promise.resolve<SceneSyncOutcome>({ kind: "deferred", reason: "reload-unavailable" });
    }
    if (this.pendingReload) return this.pendingReload;
    const pending = (async (): Promise<SceneSyncOutcome> => {
      if (afterFlush) {
        const flushResult = await this.flushOnce();
        if (flushResult === "conflict") return { kind: "conflict", reason: "local-dirty" };
        if (flushResult === "failed") return { kind: "stalled", reason: "flush-failed" };
      }
      replaceScene(remoteScene);
      return { kind: "full-reload", afterFlush };
    })().finally(() => {
      this.pendingReload = null;
    });
    this.pendingReload = pending;
    return pending;
  }

  private applyNames(changes: FloorNameChange[]): void {
    if (changes.length === 0) return;
    applyFloorNames(this.deps.getRuntimeScene(), changes);
  }

  /** 备注只在对齐 id 后回填：远端删掉备注要跟着删，不能留着旧的。 */
  private applyRemarks(remoteScene: unknown): void {
    const runtimeScene = this.deps.getRuntimeScene(),
      remoteById = new Map<string, Record<string, unknown>>();
    for (const remoteFloor of sceneFloorRecords(remoteScene))
      remoteById.set(String(remoteFloor.id ?? ""), remoteFloor);
    for (const localFloor of sceneFloorRecords(runtimeScene)) {
      const remoteFloor = remoteById.get(String(localFloor.id ?? ""));
      if (!remoteFloor) continue;
      syncModelRemarks(localFloor.scene, remoteFloor.scene);
    }
  }

  private flushOnce(): Promise<"saved" | "conflict" | "failed"> {
    if (this.pendingFlush) return this.pendingFlush;
    this.flushInFlight = true;
    const pending = this.deps
      .flush()
      .catch((): "failed" => "failed")
      .finally(() => {
        this.flushInFlight = false;
        this.pendingFlush = null;
      });
    this.pendingFlush = pending;
    return pending;
  }

  /** 是否有在途 flush（save-store / 退出流程可据此避免并行 PUT）。 */
  get isFlushing(): boolean {
    return this.flushInFlight;
  }

  /** 场景内部 id 列表（调试/测试用，保持稳定顺序）。 */
  static floorIds(scene: any): string[] {
    return floorIdsOf(scene);
  }
}