/**
 * 把 HA 推送的「变更对象」与「状态对象」收成一种；判据用真值而非 `hasOwnProperty`
 * （`newState` 的唯一生产者是渲染器的乐观更新，不存在 `state` 与假值 `newState` 并存的形态）。
 *
 *   | 输入 | resolveStateEntry 结果 |
 *   | --- | --- |
 *   | {newState: X} | X（X 为假值时取变更对象本身） |
 *   | {state:"on"} | 原样返回 |
 *   | null / undefined | 第 2 个参数（默认 null） |
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

/** 从「实体 ID → 状态 / 变更」容器里取出并剥离成状态对象。 */
export function resolveStateEntryIn(statesByEntityId, entityIdKey) {
  return resolveStateEntry(readFromMapOrRecord(statesByEntityId, entityIdKey));
}
