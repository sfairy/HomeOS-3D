/**
 * C5 支撑——把“两份文档之间的差异”翻译成 DocumentPatch（跨楼层）。
 *
 * 历史记录采用惰性策略：编辑前只埋一份楼层 scene 快照，真正调用 markDocumentDirty 时
 * 才用本模块 diff 出补丁并入栈。好处：
 * - 只是选中/取消选中、没有内容变化时 diff 为空，不产生历史；
 * - 一次用户操作（多选删除、拖拽 + 属性变化）自然聚合成一个 batch 事务；
 * - 撤销/重做只需要 applyDocumentPatch(inverse)，不再整层 structuredClone 回填。
 *
 * 数组字段按 id 做 add/remove/update/move；顺序变化、无 id 元素才退化成整字段 replace。
 * settings 等纯视图字段（相机、吸附、预览偏好）不参与 diff —— 相机/选择不入历史栈。
 */

import {
  patchSceneField,
  stableDocumentString,
  type DocumentPatch,
  type FloorSceneField,
} from "./document-store";

/** 明确不参与历史 diff 的楼层 scene 字段：编辑器视图偏好，不属于文档内容。 */
const SKIP_SCENE_FIELDS: ReadonlySet<string> = new Set(["settings", "id"]);

/** 只影响位置/旋转/缩放的键：这类变化记成 move（语义更准，回退/重做行为一致）。 */
const TRANSFORM_KEYS: ReadonlySet<string> = new Set([
  "x",
  "y",
  "z",
  "position",
  "transform",
  "rotation",
  "rotationY",
  "rotationDeg",
  "rotationX",
  "rotationZ",
  "scale",
  "scaleX",
  "scaleY",
  "scaleZ",
  "width",
  "depth",
  "height",
  "thickness",
  "elevation",
]);

const compareKey = (value: any): string => {
  try {
    return stableDocumentString(value);
  } catch {
    return String(value);
  }
};

const isPlainObject = (value: any): boolean =>
  !!value && typeof value === "object" && !Array.isArray(value);

const idOf = (value: any): string | null =>
  isPlainObject(value) && typeof value.id === "string" && value.id ? value.id : null;

const onlyTransformChanged = (beforeValue: any, afterValue: any): boolean => {
  if (!isPlainObject(beforeValue) || !isPlainObject(afterValue)) return false;
  const keys = new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)]);
  for (const key of keys) {
    if (TRANSFORM_KEYS.has(key)) continue;
    if (compareKey(beforeValue[key]) !== compareKey(afterValue[key])) return false;
  }
  return true;
};

/**
 * 单个数组字段的补丁：
 * - 全量 replace（顺序变化 / 存在无 id 元素 / id 重复）—— 一个 patch 覆盖该字段全部差异；
 * - 否则拆 remove / add / update / move，应用时顺序无关（remove 按 id、add 按 index、update/move 按 id）。
 */
export function diffSceneArrayField(
  floorId: string,
  field: FloorSceneField,
  beforeList: any,
  afterList: any,
): DocumentPatch[] {
  const before = Array.isArray(beforeList) ? beforeList : [];
  const after = Array.isArray(afterList) ? afterList : [];
  if (compareKey(before) === compareKey(after)) return [];

  const beforeIds = before.map(idOf);
  const afterIds = after.map(idOf);
  const idsUsable =
    beforeIds.every((id: string | null) => id !== null) &&
    afterIds.every((id: string | null) => id !== null) &&
    new Set(beforeIds).size === beforeIds.length &&
    new Set(afterIds).size === afterIds.length;

  if (!idsUsable) {
    return [{ kind: "replace", floorId, field, before, after }];
  }

  const afterIdSet = new Set(afterIds as string[]);
  const beforeIdSet = new Set(beforeIds as string[]);
  const commonOrderBefore = (beforeIds as string[]).filter((id) => afterIdSet.has(id));
  const commonOrderAfter = (afterIds as string[]).filter((id) => beforeIdSet.has(id));
  if (commonOrderBefore.join("\u0000") !== commonOrderAfter.join("\u0000")) {
    return [{ kind: "replace", floorId, field, before, after }];
  }

  const beforeById = new Map<string, { item: any; index: number }>();
  before.forEach((item: any, index: number) => beforeById.set(beforeIds[index] as string, { item, index }));
  const afterById = new Map<string, { item: any; index: number }>();
  after.forEach((item: any, index: number) => afterById.set(afterIds[index] as string, { item, index }));

  const removed: Array<{ item: any; index: number }> = [];
  for (const [id, record] of beforeById) {
    if (!afterIdSet.has(id)) removed.push({ item: record.item, index: record.index });
  }
  const added: Array<{ item: any; index: number }> = [];
  for (const [id, record] of afterById) {
    if (!beforeIdSet.has(id)) added.push({ item: record.item, index: record.index });
  }
  const changes: Array<{ itemId: string; before: any; after: any }> = [];
  const moves: Array<{ itemId: string; before: any; after: any }> = [];
  for (const [id, beforeRecord] of beforeById) {
    const afterRecord = afterById.get(id);
    if (!afterRecord) continue;
    if (compareKey(beforeRecord.item) === compareKey(afterRecord.item)) continue;
    if (onlyTransformChanged(beforeRecord.item, afterRecord.item)) {
      moves.push({ itemId: id, before: beforeRecord.item, after: afterRecord.item });
    } else {
      changes.push({ itemId: id, before: beforeRecord.item, after: afterRecord.item });
    }
  }

  const patches: DocumentPatch[] = [];
  if (removed.length) patches.push({ kind: "remove", floorId, field, entries: removed });
  if (added.length) patches.push({ kind: "add", floorId, field, entries: added });
  if (changes.length) patches.push({ kind: "update", floorId, field, changes });
  if (moves.length) patches.push({ kind: "move", floorId, field, moves });
  return patches;
}

/** 一个楼层 scene 的完整补丁集合（含数组字段与 background/name 等非视图字段）。 */
export function diffFloorScenePatches(
  floorId: string,
  beforeScene: any,
  afterScene: any,
): DocumentPatch[] {
  const patches: DocumentPatch[] = [];
  const before = isPlainObject(beforeScene) ? beforeScene : {};
  const after = isPlainObject(afterScene) ? afterScene : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (SKIP_SCENE_FIELDS.has(key)) continue;
    const beforeValue = before[key];
    const afterValue = after[key];
    const bothArrays = Array.isArray(beforeValue) || Array.isArray(afterValue);
    if (bothArrays) {
      patches.push(...diffSceneArrayField(floorId, key, beforeValue, afterValue));
      continue;
    }
    if (compareKey(beforeValue) === compareKey(afterValue)) continue;
    patches.push({ kind: "replace", floorId, field: key, before: beforeValue, after: afterValue });
  }
  return patches;
}

const floorList = (document: any): any[] => (Array.isArray(document?.floors) ? document.floors : []);

/**
 * 文档级 diff：按 floorId 对齐两侧楼层，比较该楼层 scene。
 * 返回 null 表示无内容差异（不产生历史）。多个补丁包成一个 batch（一次撤销 = 一次用户操作）。
 */
export function diffDocumentPatches(beforeDocument: any, afterDocument: any): DocumentPatch | null {
  const beforeFloors = new Map<string, any>();
  for (const floor of floorList(beforeDocument)) {
    if (floor && typeof floor.id === "string") beforeFloors.set(floor.id, floor);
  }
  const afterFloors = new Map<string, any>();
  for (const floor of floorList(afterDocument)) {
    if (floor && typeof floor.id === "string") afterFloors.set(floor.id, floor);
  }
  const floorIds = new Set([...beforeFloors.keys(), ...afterFloors.keys()]);
  const patches: DocumentPatch[] = [];
  for (const floorId of floorIds) {
    const beforeFloor = beforeFloors.get(floorId);
    const afterFloor = afterFloors.get(floorId);
    if (!beforeFloor || !afterFloor) continue; // 楼层增删不在本轮历史范围内
    patches.push(...diffFloorScenePatches(floorId, beforeFloor.scene, afterFloor.scene));
  }
  if (patches.length === 0) return null;
  if (patches.length === 1) return patches[0];
  return { kind: "batch", patches };
}

/** 历史条目标签（host 只用来做提示，不参与逻辑）。 */
export function describeDocumentPatch(patch: DocumentPatch): string {
  const count = patch.kind === "batch" ? patch.patches.length : 1;
  if (patch.kind === "add") return "添加 " + count + " 项";
  if (patch.kind === "remove") return "删除 " + count + " 项";
  if (patch.kind === "move") return "移动 " + count + " 项";
  if (patch.kind === "replace") return "修改 " + String(patchSceneField(patch));
  if (patch.kind === "batch") return "编辑（" + count + " 处）";
  return "编辑 " + count + " 项";
}
