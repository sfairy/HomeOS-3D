export function nearestMarkerTarget(markers: any, pointerX: any, pointerY: any) {
  let nearestId: any = null,
    bestDistance = Infinity,
    bestTieBreak = Infinity;
  for (const { id: markerId, rect: rect, width: width, height: height } of markers) {
    if (
      pointerX < rect.left ||
      pointerX > rect.right ||
      pointerY < rect.top ||
      pointerY > rect.bottom
    )
      continue;
    const offsetX = Math.abs(pointerX - (rect.left + rect.right) / 2),
      offsetY = Math.abs(pointerY - (rect.top + rect.bottom) / 2),
      edgeDistance = Math.max(0, offsetX - width / 2) ** 2 + Math.max(0, offsetY - height / 2) ** 2,
      centerDistance = offsetX * offsetX + offsetY * offsetY;
    (edgeDistance < bestDistance ||
      (edgeDistance === bestDistance && centerDistance < bestTieBreak)) &&
      ((nearestId = markerId), (bestDistance = edgeDistance), (bestTieBreak = centerDistance));
  }
  return nearestId;
}
export function createMarkerTouch(resolveId: any) {
  let activeTouch: any = null;
  return {
    down(downEvent: any) {
      if (downEvent.pointerType !== "touch") {
        activeTouch = null;
        return;
      }
      if ((activeTouch && !activeTouch.ended) || downEvent.isPrimary === false) {
        activeTouch && (activeTouch.cancelled = true);
        return;
      }
      activeTouch = {
        pointerId: downEvent.pointerId,
        x: downEvent.clientX,
        y: downEvent.clientY,
        id: resolveId(downEvent),
      };
    },
    move(moveEvent: any) {
      activeTouch?.pointerId === moveEvent.pointerId &&
        Math.hypot(moveEvent.clientX - activeTouch.x, moveEvent.clientY - activeTouch.y) >= 8 &&
        (activeTouch.cancelled = true);
    },
    up(upEvent: any) {
      activeTouch?.pointerId === upEvent.pointerId &&
        (Math.hypot(upEvent.clientX - activeTouch.x, upEvent.clientY - activeTouch.y) >= 8 &&
          (activeTouch.cancelled = true),
        (activeTouch.ended = true));
    },
    cancel() {
      activeTouch && ((activeTouch.cancelled = true), (activeTouch.ended = true));
    },
    target(targetEvent: any, fallbackTarget: any) {
      if (targetEvent.detail === 0 || !activeTouch) return fallbackTarget;
      const touchedId = activeTouch.cancelled ? null : activeTouch.id;
      return ((activeTouch = null), touchedId);
    },
  };
}
