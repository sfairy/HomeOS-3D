/**
 * studio-app.ts 的纯工具函数集合。
 *
 * 从 studio-app.ts 闭包内提取的不引用任何闭包变量的工具函数。
 * 这些函数仅依赖自身参数与全局 API（globalThis.crypto / Date / Math）。
 */

/** 判断是否为转盘圆桌。 */
export function isTurntableRoundTable(roundTableItem: any) {
  return (
    roundTableItem?.type === "rounddiningtableturntable" ||
    roundTableItem?.roundTableTurntable === true
  );
}

/** 楼层序号 → 中文名（一层 / 二层 / ...，超出预设时用数字 + "层"）。 */
export function floorDisplayName(floorIndex: any) {
  return (
    ["一层", "二层", "三层", "四层", "五层", "六层", "七层", "八层", "九层", "十层"][floorIndex] ||
    floorIndex + 1 + "层"
  );
}

/** 生成带随机后缀的唯一 ID（优先用 crypto.randomUUID）。 */
export function generateId(idPrefix: any) {
  const randomIdSuffix =
    globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return idPrefix + "-" + randomIdSuffix;
}

/** 拼接 "前缀:后缀" 形式的复合键。 */
export function composeKey(keyPrefix: any, keySuffix: any) {
  return keyPrefix + ":" + keySuffix;
}

/** 拼接楼层-项目复合键（无楼层时用 "floor" 兜底）。 */
export function composeItemKey(keyFloorId: any, keyGroupId: any) {
  return (keyFloorId || "floor") + ":" + keyGroupId;
}

/** 石材板色号 → 面板上的中文名（空串 = 不是石材板）。 */
export function materialSlabLabel(slabFlavor: any) {
  return (
    ({ marble: "大理石", "marble-dark": "黑金大理石" } as any)[slabFlavor] || ""
  );
}
