/**
 * 把 HA 推送的「变更对象」与「状态对象」收成一种；判据用真值而非 `hasOwnProperty`
 */

/** 从 Map 或普通对象里取一项，取不到或值为假值时返回 `null`。 */
export function readFromMapOrRecord(source, key) {
  if (typeof source?.get == "function") {
    return source.get(key) || null;
  } else {
    return (source && typeof source == "object" && source[key]) || null;
  }
}

/** 剥掉变更对象的外壳，取出真正的状态对象。 */
export function resolveStateEntry(stateOrChange, fallback = null) {
  return stateOrChange?.newState || stateOrChange || fallback;
}

/**
 * 把任意值归一成可比对的小写文本：去首尾空白 + 转小写。全仓只此一份 ——
 */
export function normalizedTextOf(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/**
 * 把「状态对象 / 变更对象」归一成小写状态文本。取 `?? ""` 而非 `|| ""`：
 */
export function stateTextOf(stateOrChange) {
  return normalizedTextOf(resolveStateEntry(stateOrChange)?.state);
}

/** 从「实体 ID → 状态 / 变更」容器里取出并剥离成状态对象。 */
export function resolveStateEntryIn(statesByEntityId, entityIdKey) {
  return resolveStateEntry(readFromMapOrRecord(statesByEntityId, entityIdKey));
}
