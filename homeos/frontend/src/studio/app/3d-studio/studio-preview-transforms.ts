/**
 * 预览变换缓存：编辑平面视图时，只有「位置/朝向变了」的家具才需要重算。
 * 先 capture 一次基线，plan 时只产出真正移动过的条目，commit 后把基线推进到新状态。
 * 任何签名（除 x/y/rotation 外的字段）变化都会让整批作废。
 */
export function createPreviewTransformCache() {
  const capturedByRoot = new WeakMap(),
    committedByPlan = new WeakMap(),
    ignoredKeys = new Set(["x", "y", "rotation"]);
  function captureEntry(item: any, isEligible: any, isSelected: any) {
    if (!item || typeof item != "object" || typeof item.id != "string" || !item.id) return null;
    const x = item.x,
      y = item.y,
      rotation = item.rotation ?? 0;
    if (![x, y, rotation].every(Number.isFinite)) return null;
    try {
      const signature = JSON.stringify(
        Object.fromEntries(Object.entries(item).filter(([key]) => !ignoredKeys.has(key))),
      );
      return {
        item: item,
        id: item.id,
        x: x,
        y: y,
        rotation: rotation,
        signature: signature,
        eligible: isEligible(item) === true,
        selected: isSelected(item) === true,
      };
    } catch {
      return null;
    }
  }
  function captureEntries(items: any, isEligible: any, isSelected: any) {
    if (!Array.isArray(items) || typeof isEligible != "function" || typeof isSelected != "function")
      return null;
    const entries: any[] = [],
      seenIds = new Set();
    for (const item of items) {
      const entry = captureEntry(item, isEligible, isSelected);
      if (!entry || seenIds.has(entry.id)) return null;
      (seenIds.add(entry.id), entries.push(entry));
    }
    return entries;
  }
  function capture(root: any, { items, contextKey, isEligible, isSelected, groups }: any) {
    capturedByRoot.delete(root);
    const entries = captureEntries(items, isEligible, isSelected);
    if (!entries) return false;
    const groupByItemId =
      groups instanceof Map
        ? groups
        : new Map((groups || []).map(({ item, group }: any) => [item.id, group]));
    for (const entry of entries) {
      const group = groupByItemId.get(entry.id);
      entry.group = entry.eligible && entry.selected && group?.parent === root ? group : null;
    }
    return (
      capturedByRoot.set(root, {
        contextKey: contextKey,
        entries: entries,
      }),
      true
    );
  }
  function plan(root: any, { items, contextKey, isEligible, isSelected }: any) {
    const captured = capturedByRoot.get(root);
    if (!captured || captured.contextKey !== contextKey) return null;
    const entries = captureEntries(items, isEligible, isSelected);
    if (!entries || entries.length !== captured.entries.length) return null;
    const movedTransforms: any[] = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index],
        previousEntry = captured.entries[index];
      if (
        entry.item !== previousEntry.item ||
        entry.id !== previousEntry.id ||
        entry.signature !== previousEntry.signature ||
        entry.selected !== previousEntry.selected ||
        entry.eligible !== previousEntry.eligible
      )
        return null;
      if (
        ((entry.group = previousEntry.group),
        !(entry.x === previousEntry.x && entry.y === previousEntry.y && entry.rotation === previousEntry.rotation))
      ) {
        if (!entry.eligible || !entry.selected || !entry.group || entry.group.parent !== root)
          return null;
        movedTransforms.push(
          Object.freeze({
            item: entry.item,
            group: entry.group,
            x: entry.x,
            y: entry.y,
            rotation: entry.rotation,
          }),
        );
      }
    }
    return (
      Object.freeze(movedTransforms),
      committedByPlan.set(movedTransforms, {
        root: root,
        previous: captured,
        entries: entries,
      }),
      movedTransforms
    );
  }
  function commit(root: any, plan: any) {
    const planState = committedByPlan.get(plan);
    return !planState || planState.root !== root || capturedByRoot.get(root) !== planState.previous
      ? false
      : (committedByPlan.delete(plan),
        capturedByRoot.set(root, {
          contextKey: planState.previous.contextKey,
          entries: planState.entries,
        }),
        true);
  }
  return {
    capture: capture,
    plan: plan,
    commit: commit,
    clear: (root: any) => capturedByRoot.delete(root),
  };
}
