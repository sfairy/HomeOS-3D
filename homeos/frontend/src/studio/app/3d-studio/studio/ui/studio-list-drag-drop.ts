/** 列表拖拽落点判定（灯光分组 / 区域列表的 drag 命中）。
 *
 * 从 `../studio-app.ts` 的巨型闭包抽出（P4 拆单体）：纯几何判定 + 落点语义，无闭包捕获、
 * 无外部状态读写。
 */
const isPointOverRect = (pointX: any, pointY: any, targetRect: any, verticalPadding = 2) =>
  !!targetRect &&
  pointX >= targetRect.left &&
  pointX <= targetRect.right &&
  pointY >= targetRect.top - verticalPadding &&
  pointY <= targetRect.bottom + verticalPadding;

const isPointPastRectMiddle = (pointY: any, targetRect: any) =>
  pointY >= (targetRect.top + targetRect.bottom) / 2;

export function resolveListDragDrop(listDragSession: any, pointX: any, pointY: any) {
  const hoveredGroupTarget = listDragSession.dropTargets.find(
    (dropTargetCandidate: any) =>
      dropTargetCandidate.kind === "group" &&
      dropTargetCandidate.id !== listDragSession.id &&
      isPointOverRect(pointX, pointY, dropTargetCandidate.rowRect),
  );
  if (listDragSession.kind === "area") {
    const hoveredAreaTarget = listDragSession.dropTargets.find(
      (dropTargetCandidate: any) =>
        dropTargetCandidate.kind === "area" &&
        dropTargetCandidate.id !== listDragSession.id &&
        isPointOverRect(pointX, pointY, dropTargetCandidate.rowRect),
    );
    return hoveredAreaTarget
      ? {
          kind: "area",
          targetId: hoveredAreaTarget.id,
          insertAfter: isPointPastRectMiddle(pointY, hoveredAreaTarget.rowRect),
        }
      : null;
  }
  if (hoveredGroupTarget)
    return {
      kind: "group",
      anchorGroupId: hoveredGroupTarget.id,
      areaId: hoveredGroupTarget.areaId,
      insertAfter: isPointPastRectMiddle(pointY, hoveredGroupTarget.rowRect),
    };
  const hoveredAreaTarget = listDragSession.dropTargets.find(
    (dropTargetCandidate: any) =>
      dropTargetCandidate.kind === "area" &&
      isPointOverRect(pointX, pointY, dropTargetCandidate.rowRect),
  );
  if (hoveredAreaTarget)
    return { kind: "group", anchorGroupId: null as any, areaId: hoveredAreaTarget.id, insertAfter: false };

  const hoveredAreaBodyTarget = listDragSession.dropTargets.find(
    (dropTargetCandidate: any) =>
      dropTargetCandidate.kind === "area" &&
      !!dropTargetCandidate.sectionRect &&
      pointX >= dropTargetCandidate.sectionRect.left &&
      pointX <= dropTargetCandidate.sectionRect.right &&
      pointY > dropTargetCandidate.rowRect.bottom &&
      pointY <= dropTargetCandidate.sectionRect.bottom,
  );
  if (hoveredAreaBodyTarget)
    return {
      kind: "group",
      anchorGroupId: null as any,
      areaId: hoveredAreaBodyTarget.id,
      insertAfter: false,
    };

  return null;
}
