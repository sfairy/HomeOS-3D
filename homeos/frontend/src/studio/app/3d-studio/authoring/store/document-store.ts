/**
 * C3 —— 文档 / 版本状态（document store）。
 *
 * 背景：studio 的保存是**整份文档** PUT（`studio_drafts` 单例，revision CAS），
 * 但“哪里脏了”必须按 `DocumentPatch`（add / remove / update / move，覆盖所有楼层）记录，
 * 这样才能接历史栈（C5）、才能在 409 时判断本地/远端是否真的同一份内容。
 *
 * 两条版本线必须分开：
 * - `loadedRevision`：服务端 `studio_drafts.revision`，只由 GET / PUT 成功推进；
 * - `runtimeSceneRevision`：本地累计改动计数，只由 markDirty 推进，保存成功归零；
 *   interaction3d 运行时快照轮询（C4）**只能**读它，不能改写它。
 */

export interface StudioDraftPayload {
  revision: number;
  scene: any;
  updatedAt?: string | null;
}

export type FloorSceneField = string;

interface FloorScenePatch {
  floorId: string;
  field?: FloorSceneField;
}

interface AddItemsPatch extends FloorScenePatch {
  kind: "add";
  entries: Array<{ item: any; index: number }>;
}

interface RemoveItemsPatch extends FloorScenePatch {
  kind: "remove";
  entries: Array<{ item: any; index: number }>;
}

interface UpdateItemsPatch extends FloorScenePatch {
  kind: "update";
  changes: Array<{ itemId: string; before: any; after: any }>;
}

interface MoveItemsPatch extends FloorScenePatch {
  kind: "move";
  moves: Array<{ itemId: string; before: any; after: any }>;
}

/** 整字段替换（顺序变化、无 id 元素、settings 等对象字段的兜底）：数组就地 splice 保留元素对象引用。 */
interface ReplaceFieldPatch extends FloorScenePatch {
  kind: "replace";
  field: FloorSceneField;
  before: any;
  after: any;
}

/** 一次用户操作（多选删除、拖拽+属性变化、跨楼层改动）聚合成一个历史事务。 */
interface BatchPatch {
  kind: "batch";
  patches: DocumentPatch[];
}

export type DocumentPatch =
  | AddItemsPatch
  | RemoveItemsPatch
  | UpdateItemsPatch
  | MoveItemsPatch
  | ReplaceFieldPatch
  | BatchPatch;

/** 文档里属于“版本/时间戳”的易变键：签名必须忽略它们，否则每次保存都像内容变了。 */
const VOLATILE_DOCUMENT_KEYS: ReadonlySet<string> = new Set([
  "revision",
  "updatedAt",
  "savedAt",
  "syncKey",
  "serverRevision",
  "interactionConfirmation",
]);

/** 32 位 FNV-1a；用两路不同种子散列降低碰撞概率。 */
function fnv1a32Hex(input: string, seed = 0x811c9dc5): string {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * 稳定序列化：对象键排序、按 JSON 语义归一化（NaN/Infinity -> null、函数/undefined 丢弃），
 * 并跳过 `VOLATILE_DOCUMENT_KEYS`。同一份文档无论键顺序如何都得到同一字符串。
 */
export function stableDocumentString(
  document: any,
  omittedKeys: ReadonlySet<string> = VOLATILE_DOCUMENT_KEYS,
): string {
  const normalized =
    document === undefined ? null : JSON.parse(JSON.stringify(document));
  const walk = (node: any): string => {
    if (node === null) return "null";
    if (Array.isArray(node)) return "[" + node.map((entry) => walk(entry)).join(",") + "]";
    switch (typeof node) {
      case "string":
      case "number":
      case "boolean":
        return JSON.stringify(node);
      case "object": {
        const keys = Object.keys(node)
          .filter((key) => !omittedKeys.has(key))
          .sort();
        return (
          "{" +
          keys
            .map((key) => JSON.stringify(key) + ":" + walk(node[key]))
            .join(",") +
          "}"
        );
      }
      default:
        return "null";
    }
  };
  return walk(normalized);
}

/** 文档内容签名：忽略版本/时间戳字段；用于 local === remote 判定与 no-op 脏标记识别。 */
export function documentSignature(document: any): string {
  const serialized = stableDocumentString(document);
  return (
    "doc1:" +
    serialized.length.toString(36) +
    ":" +
    fnv1a32Hex(serialized) +
    ":" +
    fnv1a32Hex(serialized, 0x9e3779b9)
  );
}

function findFloorRecord(document: any, floorId: string): any | null {
  const floorList = document?.floors;
  if (!Array.isArray(floorList)) return null;
  return floorList.find((floor: any) => floor?.id === floorId) ?? null;
}

export function patchSceneField(patch: FloorScenePatch): FloorSceneField {
  return typeof patch.field === "string" && patch.field ? patch.field : "items";
}

/** 楼层 scene 的某个数组字段；字段不存在或不是数组返回 null。 */
function floorSceneFieldList(
  document: any,
  floorId: string,
  field: FloorSceneField = "items",
): any[] | null {
  const fieldValue = findFloorRecord(document, floorId)?.scene?.[field];
  return Array.isArray(fieldValue) ? fieldValue : null;
}

export function canApplyDocumentPatch(document: any, patch: DocumentPatch): boolean {
  if (!patch || typeof patch !== "object") return false;
  if (patch.kind === "batch") {
    if (!Array.isArray(patch.patches) || patch.patches.length === 0) return false;
    return patch.patches.every((entry) => canApplyDocumentPatch(document, entry));
  }
  if (patch.kind === "replace") {
    const floorRecord = findFloorRecord(document, patch.floorId);
    if (!floorRecord || !floorRecord.scene) return false;
    if (!patchSceneField(patch)) return false;
    return patch.before !== undefined && patch.after !== undefined;
  }
  const itemList = floorSceneFieldList(document, patch.floorId, patchSceneField(patch));
  if (!itemList) return false;
  const existingIds = new Set(itemList.map((item: any) => item?.id));
  switch (patch.kind) {
    case "add":
      return patch.entries.every(
        (entry) => !!entry && typeof entry.item === "object" && entry.item !== null,
      );
    case "remove":
      return patch.entries.every((entry) => existingIds.has(entry?.item?.id));
    case "update":
      return patch.changes.every((change) => existingIds.has(change.itemId));
    case "move":
      return patch.moves.every((move) => existingIds.has(move.itemId));
    default:
      return false;
  }
}

/** 就地覆盖字段、保留对象引用（three 场景/选中集持的是同一个物件对象）。 */
function replaceItemInPlace(target: any, replacement: any): void {
  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(replacement, key)) delete target[key];
  }
  Object.assign(target, replacement);
}

/** 应用补丁（就地修改文档）；先 canApply 校验，失败不落任何修改。 */
export function applyDocumentPatch(document: any, patch: DocumentPatch): boolean {
  if (!canApplyDocumentPatch(document, patch)) return false;
  if (patch.kind === "batch") {
    // 事务语义：先整体 canApply（上面），再逐个应用；历史补丁按“每个 id/字段只出现一次”生成，不会互相踩踏。
    for (const entry of patch.patches) {
      if (!applyDocumentPatch(document, entry)) return false;
    }
    return true;
  }
  if (patch.kind === "replace") {
    const floorRecord = findFloorRecord(document, patch.floorId);
    if (!floorRecord || !floorRecord.scene) return false;
    const field = patchSceneField(patch);
    const currentValue = floorRecord.scene[field];
    if (Array.isArray(currentValue) && Array.isArray(patch.after)) {
      currentValue.length = 0;
      currentValue.push(...patch.after);
      return true;
    }
    if (
      currentValue &&
      typeof currentValue === "object" &&
      !Array.isArray(currentValue) &&
      patch.after &&
      typeof patch.after === "object" &&
      !Array.isArray(patch.after)
    ) {
      replaceItemInPlace(currentValue, patch.after);
      return true;
    }
    floorRecord.scene[field] = patch.after;
    return true;
  }
  const itemList = floorSceneFieldList(document, patch.floorId, patchSceneField(patch)) as any[];
  if (!itemList) return false;
  if (patch.kind === "add") {
    const orderedEntries = [...patch.entries].sort((left, right) => left.index - right.index);
    for (const entry of orderedEntries) {
      const requestedIndex = Math.trunc(Number(entry.index) || 0);
      const insertIndex = Math.max(0, Math.min(itemList.length, requestedIndex));
      itemList.splice(insertIndex, 0, entry.item);
    }
    return true;
  }
  if (patch.kind === "remove") {
    const removedIds = new Set(patch.entries.map((entry) => entry?.item?.id));
    for (let itemIndex = itemList.length - 1; itemIndex >= 0; itemIndex -= 1) {
      if (removedIds.has(itemList[itemIndex]?.id)) itemList.splice(itemIndex, 1);
    }
    return true;
  }
  const changes = patch.kind === "update" ? patch.changes : patch.moves;
  for (const change of changes) {
    const item = itemList.find((candidate: any) => candidate?.id === change.itemId);
    if (!item) return false;
    replaceItemInPlace(item, change.after);
  }
  return true;
}

/** 逆补丁：历史栈回退/重做使用的精确反向操作（add <-> remove，update/move/replace 交换 before/after，batch 逆序取逆）。 */
export function invertDocumentPatch(patch: DocumentPatch): DocumentPatch {
  const carryFloorScene = (source: FloorScenePatch): FloorScenePatch =>
    typeof source.field === "string"
      ? { floorId: source.floorId, field: source.field }
      : { floorId: source.floorId };
  switch (patch.kind) {
    case "add":
      return {
        kind: "remove",
        ...carryFloorScene(patch),
        entries: patch.entries.map((entry) => ({ item: entry.item, index: entry.index })),
      };
    case "remove":
      return {
        kind: "add",
        ...carryFloorScene(patch),
        entries: patch.entries.map((entry) => ({ item: entry.item, index: entry.index })),
      };
    case "update":
      return {
        kind: "update",
        ...carryFloorScene(patch),
        changes: patch.changes.map((change) => ({
          itemId: change.itemId,
          before: change.after,
          after: change.before,
        })),
      };
    case "move":
      return {
        kind: "move",
        ...carryFloorScene(patch),
        moves: patch.moves.map((move) => ({
          itemId: move.itemId,
          before: move.after,
          after: move.before,
        })),
      };
    case "replace":
      return {
        kind: "replace",
        ...carryFloorScene(patch),
        field: patchSceneField(patch),
        before: patch.after,
        after: patch.before,
      };
    case "batch":
      return {
        kind: "batch",
        patches: [...patch.patches].reverse().map((entry) => invertDocumentPatch(entry)),
      };
    default:
      return patch;
  }
}

interface StudioDocumentStoreOptions {
  signature?: (document: any) => string;
}

interface StudioDocumentState {
  document: any | null;
  loadedRevision: number;
  runtimeSceneRevision: number;
  loadedSignature: string;
  dirty: boolean;
  dirtyPatchCount: number;
}

type ApplyRemoteDocumentResult =
  | { applied: true; revision: number }
  | { applied: false; reason: "local-dirty" };

export class StudioDocumentStore {
  private documentValue: any = null;
  private loadedRevisionValue = 0;
  private runtimeSceneRevisionValue = 0;
  private loadedSignatureValue = "";
  private dirtyPatches: DocumentPatch[] = [];
  private readonly signature: (document: any) => string;

  constructor(options: StudioDocumentStoreOptions = {}) {
    this.signature = options.signature ?? documentSignature;
  }

  getState(): StudioDocumentState {
    return {
      document: this.documentValue,
      loadedRevision: this.loadedRevisionValue,
      runtimeSceneRevision: this.runtimeSceneRevisionValue,
      loadedSignature: this.loadedSignatureValue,
      dirty: this.isDirty(),
      dirtyPatchCount: this.dirtyPatches.length,
    };
  }

  getDocument(): any | null {
    return this.documentValue;
  }

  getLoadedRevision(): number {
    return this.loadedRevisionValue;
  }

  getRuntimeSceneRevision(): number {
    return this.runtimeSceneRevisionValue;
  }

  /** GET / PUT 成功：采纳文档与服务端版本，清空脏标记（`runtimeSceneRevision` 归 0）。 */
  applyLoaded(payload: StudioDraftPayload, runtimeSceneRevision = 0): void {
    const revision = Math.max(0, Math.trunc(Number(payload?.revision) || 0));
    this.documentValue = payload?.scene ?? null;
    this.loadedRevisionValue = revision;
    this.runtimeSceneRevisionValue = Math.max(0, Math.trunc(runtimeSceneRevision) || 0);
    this.loadedSignatureValue = this.signature(this.documentValue);
    this.dirtyPatches = [];
  }

  /** PUT 成功（语义同 applyLoaded，命名让调用点表达保存成功）。 */
  applySaved(payload: StudioDraftPayload): void {
    this.applyLoaded(payload, 0);
  }

  /**
   * interaction3d 全量推送 / 远端替换：本地有未保存改动时**拒绝覆盖**（交给 C4 判冲突），
   * 干净时才采纳远端文档。
   */
  applyRemote(payload: StudioDraftPayload): ApplyRemoteDocumentResult {
    if (this.isDirty()) return { applied: false, reason: "local-dirty" };
    this.applyLoaded(payload, 0);
    return { applied: true, revision: this.loadedRevisionValue };
  }

  /** 本地一次改动（一次用户操作可能聚合成一个 DocumentPatch）。 */
  markDirty(patch: DocumentPatch): void {
    this.dirtyPatches.push(patch);
    this.runtimeSceneRevisionValue += 1;
  }

  /**
   * 整文档脏标记（宿主 `markDocumentDirty()` 用）：不生成补丁，只推进 `runtimeSceneRevision`，
   * 让 `isDirty()` 为真。保存成功后由 `applySaved` / `applyLoaded` 归零。
   */
  markWholeDocumentDirty(): void {
    this.runtimeSceneRevisionValue += 1;
  }

  isDirty(): boolean {
    return this.dirtyPatches.length > 0 || this.runtimeSceneRevisionValue > 0;
  }

  /** 内容级 no-op 脏标记：内容与最近载入/保存一致，但已产生脏标记（不得静默跳过保存）。 */
  isNoopDirty(): boolean {
    return this.isDirty() && this.signature(this.documentValue) === this.loadedSignatureValue;
  }

  matchesRemoteDocument(remoteDocument: any): boolean {
    return this.signature(this.documentValue) === this.signature(remoteDocument);
  }

  getDirtyPatches(): readonly DocumentPatch[] {
    return this.dirtyPatches;
  }

  setRuntimeSceneRevision(revision: number): void {
    this.runtimeSceneRevisionValue = Math.max(0, Math.trunc(Number(revision) || 0));
  }

  clear(): void {
    this.documentValue = null;
    this.loadedRevisionValue = 0;
    this.runtimeSceneRevisionValue = 0;
    this.loadedSignatureValue = "";
    this.dirtyPatches = [];
  }
}
