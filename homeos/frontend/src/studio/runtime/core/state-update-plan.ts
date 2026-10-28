import { DEVICE_PROFILE_TABLE } from "../device/device-profiles";

/** 标签配置里允许单独打补丁的字段（上游 0.8.1 `state-update-plan.js` 的 `O` 集合）。 */
const LABEL_PATCH_FIELDS = new Set([
  "label",
  "size",
  "icon",
  "iconSize",
  "fontSize",
  "hitSize",
  "x",
  "y",
  "height",
  "positionMode",
  "fixedX",
  "fixedY",
  "opacity",
  "columns",
  "showMetricNames",
  "cardWidth",
  "cardFontSize",
  "cardOpacity",
  "backgroundOpacity",
  "labelHidden",
  "iconHidden",
  "buttonHidden",
  "hiddenClickable",
  "labelMode",
]);

/** 胎压子字段：`tirePressure` 是唯一允许整组下发的嵌套对象。 */
const TIRE_PRESSURE_FIELDS = new Set(["fontSize", "opacity", "mode"]);

const ENVIRONMENT_COLLECTIONS = [
  "airConditioners",
  "fans",
  "exhaustFans",
  "airPurifiers",
  "waterHeaters",
  "airers",
  "curtains",
  "curtainGroups",
  "temperatureHumidity",
];

const SECURITY_COLLECTIONS = ["cameras", "locks", "alarms"];

/** 补丁允许落在哪些集合上。集合名来自 `devices/<collection>` 与通用设备档案。 */
const LABEL_COLLECTIONS = new Set([
  "lights",
  ...ENVIRONMENT_COLLECTIONS.map((collection) => "environment." + collection),
  ...SECURITY_COLLECTIONS.map((collection) => "security." + collection),
  ...["nas", "speakers", "televisions", "vacuums"].map((collection) => "devices." + collection),
  ...Object.values(DEVICE_PROFILE_TABLE).map(
    (deviceProfile) => "devices." + (deviceProfile as { collection?: string }).collection,
  ),
]);

export type LabelConfigPath = Array<string | number>;

export interface LabelConfigChange {
  path: LabelConfigPath;
  value?: unknown;
  remove?: true;
}

export interface LabelConfigPatch {
  collection: LabelConfigPath;
  index: number;
  id: string;
  floorId?: string;
  changes: LabelConfigChange[];
}

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * 补丁是否影响某个舞台条目（上游 `runtime.js` 里 `affects` 的等价实现）。
 *
 * 三处细节别改坏：
 * - `floorId` 为空表示「所有楼层都受影响」（全局标签配置）；
 * - 复合 id（`cover:xxx` / `vacuum:xxx`）按后缀匹配，因为补丁里存的是集合内的裸 id；
 * - 补丁条目没有 `id` 时视为影响全部，宁可多刷一次标签也不要漏刷。
 */
export function labelPatchAffects(
  patches: ReadonlyArray<{ id?: string; floorId?: string }>,
  markerItem: { id?: string; floorId?: string } | null | undefined,
) {
  if (!markerItem) return false;
  return patches.some(
    (patchedEntry) =>
      (!patchedEntry.floorId || patchedEntry.floorId === markerItem.floorId) &&
      (!patchedEntry.id ||
        patchedEntry.id === markerItem.id ||
        (!!markerItem.id && String(markerItem.id).endsWith(":" + patchedEntry.id))),
  );
}

function isLabelCollection(path: LabelConfigPath) {
  return (
    LABEL_COLLECTIONS.has(path.join(".")) ||
    (path.length === 4 &&
      path[0] === "devices" &&
      path[1] === "vacuums" &&
      Number.isInteger(path[2]) &&
      path[3] === "shortcuts")
  );
}

function isLabelPath(path: LabelConfigPath) {
  return (
    (path.length === 1 && LABEL_PATCH_FIELDS.has(String(path[0]))) ||
    (path.length === 2 &&
      path[0] === "tirePressure" &&
      TIRE_PRESSURE_FIELDS.has(String(path[1])))
  );
}

function combinedKeys(left: object, right: object) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])];
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;

/** 按 `collection` 路径下钻；数组下标既可能是数字也可能是字符串。 */
function descendPath(value: unknown, segment: string | number): unknown {
  if (Array.isArray(value)) return value[Number(segment)];
  const record = asRecord(value);
  return record ? record[segment] : undefined;
}

export function createLabelConfigPatch(
  previousDocument: unknown,
  nextDocument: unknown,
): LabelConfigPatch[] | null {
  const previousRecord = asRecord(previousDocument),
    nextRecord = asRecord(nextDocument);
  if (!previousRecord || !nextRecord) return null;
  const { properties: previousProperties, ...previousRest } = previousRecord,
    { properties: nextProperties, ...nextRest } = nextRecord;
  // 除了 `properties` 以外任何字段变了都不走补丁：那些字段会改变场景结构。
  if (!sameJson(previousRest, nextRest)) return null;
  const patches: LabelConfigPatch[] = [];

  /** 在「某一层的数组」里比对；只有标签集合的数组才允许逐项下补丁。 */
  function withinLevel(
    previousLevel: unknown,
    nextLevel: unknown,
    levelPath: LabelConfigPath = [],
  ): boolean {
    if (sameJson(previousLevel, nextLevel)) return true;
    if (Array.isArray(previousLevel) || Array.isArray(nextLevel)) {
      if (
        !isLabelCollection(levelPath) ||
        !Array.isArray(previousLevel) ||
        !Array.isArray(nextLevel) ||
        previousLevel.length !== nextLevel.length
      )
        return false;
      return previousLevel.every((previousEntryValue, entryIndex) => {
        const previousEntry = asRecord(previousEntryValue),
          nextEntry = asRecord(nextLevel[entryIndex]);
        if (
          !previousEntry ||
          typeof previousEntry.id !== "string" ||
          !previousEntry.id ||
          previousEntry.id !== nextEntry?.id
        )
          return false;
        const changes: LabelConfigChange[] = [];
        /** 在「单个条目」里比对；可打补丁的路径记录成 change，其余必须是相等。 */
        function withinEntry(
          previousValue: unknown,
          nextValue: unknown,
          entryPath: LabelConfigPath = [],
        ): boolean {
          if (sameJson(previousValue, nextValue)) return true;
          if (
            entryPath.length === 1 &&
            entryPath[0] === "shortcuts" &&
            levelPath.join(".") === "devices.vacuums"
          )
            return withinLevel(previousValue, nextValue, [...levelPath, entryIndex, "shortcuts"]);
          if (isLabelPath(entryPath)) {
            changes.push(
              nextValue === undefined
                ? { path: entryPath, remove: true }
                : { path: entryPath, value: structuredClone(nextValue) },
            );
            return true;
          }
          if (entryPath.length === 0 || (entryPath.length === 1 && entryPath[0] === "tirePressure")) {
            const previousNested = asRecord(previousValue),
              nextNested = asRecord(nextValue);
            if (!previousNested || !nextNested) return false;
            return combinedKeys(previousNested, nextNested).every((entryKey) =>
              withinEntry(previousNested[entryKey], nextNested[entryKey], [...entryPath, entryKey]),
            );
          }
          return false;
        }
        if (!withinEntry(previousEntry, nextEntry)) return false;
        changes.length &&
          patches.push({
            collection: levelPath,
            index: entryIndex,
            id: previousEntry.id as string,
            floorId: previousEntry.floorId as string | undefined,
            changes,
          });
        return true;
      });
    }
    const previousNested = asRecord(previousLevel),
      nextNested = asRecord(nextLevel);
    if (!previousNested || !nextNested || levelPath.length > 1) return false;
    return combinedKeys(previousNested, nextNested).every((levelKey) =>
      withinLevel(previousNested[levelKey], nextNested[levelKey], [...levelPath, levelKey]),
    );
  }

  return withinLevel(previousProperties, nextProperties) && patches.length ? patches : null;
}

/** 把补丁应用回文档；路径或条目校验不过时返回 `null`（调用方应退回整份配置）。
 *
 * 注意：入参是**配置的 `properties` 主体**（上游 stage.js 的 `structuredClone(properties)`），
 * 而 `createLabelConfigPatch` 吃的是带 `properties` 的整份配置 —— 两者不是同一个层级。
 */
export function applyLabelConfigPatch(document: unknown, patches: unknown): unknown | null {
  const documentRecord = asRecord(document);
  if (!documentRecord || !Array.isArray(patches) || !patches.length) return null;
  const patchedDocument = structuredClone(documentRecord);
  for (const patch of patches as LabelConfigPatch[]) {
    if (
      !Array.isArray(patch.collection) ||
      !isLabelCollection(patch.collection) ||
      patch.collection.some((segment) =>
        ["__proto__", "prototype", "constructor"].includes(String(segment)),
      )
    )
      return null;
    const collection = patch.collection.reduce<unknown>(
        (currentValue, segment) => descendPath(currentValue, segment),
        patchedDocument,
      ),
      targetEntry = Array.isArray(collection) ? asRecord(collection[patch.index]) : null;
    if (
      !Number.isInteger(patch.index) ||
      !targetEntry ||
      targetEntry.id !== patch.id ||
      targetEntry.floorId !== patch.floorId ||
      !Array.isArray(patch.changes)
    )
      return null;
    for (const change of patch.changes) {
      if (!Array.isArray(change.path) || !isLabelPath(change.path)) return null;
      const changeTarget =
        change.path.length === 1 ? targetEntry : asRecord(targetEntry.tirePressure);
      if (!changeTarget) return null;
      const leafKey = change.path.at(-1) as string | number;
      change.remove === true
        ? delete changeTarget[leafKey]
        : (changeTarget[leafKey] = structuredClone(change.value));
    }
  }
  return patchedDocument;
}

function boundEntityIds(
  candidate: any,
  collectedIdSet = new Set(),
  visitedObjectSet = new Set(),
) {
  if (typeof candidate == "string")
    /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/i.test(candidate) && collectedIdSet.add(candidate);
  else {
    if (candidate && typeof candidate == "object" && !visitedObjectSet.has(candidate)) {
      visitedObjectSet.add(candidate);
      for (const [entryKey, entryValue] of Object.entries(candidate))
        (boundEntityIds(entryKey, collectedIdSet, visitedObjectSet),
          boundEntityIds(entryValue, collectedIdSet, visitedObjectSet));
    }
  }
  return collectedIdSet;
}
export function createStateUpdatePlan(component: any, update: any) {
  return !update || typeof update != "object" || Array.isArray(update)
    ? null
    : buildStateUpdatePlan(bindLightingAndEnvironmentSets(component), update);
}
export function createStateUpdatePlanner() {
  let cachedComponent: any,
    cachedBindings: any;
  return {
    plan(component: any, update: any) {
      return !update || typeof update != "object" || Array.isArray(update)
        ? null
        : ((!cachedBindings || cachedComponent !== component) &&
            ((cachedComponent = component),
            (cachedBindings = bindLightingAndEnvironmentSets(component))),
          buildStateUpdatePlan(cachedBindings, update));
    },
    invalidate() {
      cachedComponent = cachedBindings = undefined;
    },
  };
}
function buildStateUpdatePlan(boundBindings: any, update: any) {
  if (!update || typeof update != "object" || Array.isArray(update)) return null;
  const changedKeySet = new Set(Object.keys(update)),
    { lighting: lightIdSet, environment: environmentIdSet } = boundBindings;
  if (
    [...changedKeySet].some(
      (entityId) => !lightIdSet.has(entityId) && !environmentIdSet.has(entityId),
    )
  )
    return null;
  const hasChangedEntry = (idSet: any) =>
    [...idSet].some((candidateId) => changedKeySet.has(candidateId));
  return {
    changed: changedKeySet,
    lightOnlyIds: [...changedKeySet].filter(
      (lightId) => lightIdSet.has(lightId) && !environmentIdSet.has(lightId),
    ),
    get lighting() {
      return hasChangedEntry(lightIdSet);
    },
    get environment() {
      return hasChangedEntry(environmentIdSet);
    },
    affects(incomingUpdate: any) {
      const updateIdSet = boundEntityIds(incomingUpdate);
      return !updateIdSet.size || hasChangedEntry(updateIdSet);
    },
  };
}
function bindLightingAndEnvironmentSets(component: any) {
  const { lights: lightIds = [], ...componentRest } = component || {};
  return {
    lighting: boundEntityIds(lightIds),
    environment: boundEntityIds(componentRest),
  };
}
export function lightBindingsForUpdate(lights: any, plan: any) {
  if (!plan) return lights;
  const lightKey = (light: any) => JSON.stringify([light.floorId, light.groupId]),
    matchingKeySet = new Set(
      lights.filter((matchedLight: any) => plan.affects(matchedLight)).map(lightKey),
    );
  return lights.filter((listedLight: any) => matchingKeySet.has(lightKey(listedLight)));
}
