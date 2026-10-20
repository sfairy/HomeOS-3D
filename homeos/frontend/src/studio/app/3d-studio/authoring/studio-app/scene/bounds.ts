import { segmentIntersection as segmentIntersection2 } from "../../../plan/geometry";

export function isPointInBounds(pointRef: any, boundsRef: any) {
  return (
    pointRef.x >= boundsRef.minX &&
    pointRef.x <= boundsRef.maxX &&
    pointRef.y >= boundsRef.minY &&
    pointRef.y <= boundsRef.maxY
  );
}

export function boundsIntersectSegment(segStart: any, segEnd: any, boundsRect: any) {
  if (isPointInBounds(segStart, boundsRect) || isPointInBounds(segEnd, boundsRect)) return true;
  const boundsCorners = [
    {
      x: boundsRect.minX,
      y: boundsRect.minY,
    },
    {
      x: boundsRect.maxX,
      y: boundsRect.minY,
    },
    {
      x: boundsRect.maxX,
      y: boundsRect.maxY,
    },
    {
      x: boundsRect.minX,
      y: boundsRect.maxY,
    },
  ];
  for (let edgeIndex = 0; edgeIndex < boundsCorners.length; edgeIndex += 1)
    if (
      segmentIntersection2(
        segStart,
        segEnd,
        boundsCorners[edgeIndex],
        boundsCorners[(edgeIndex + 1) % boundsCorners.length],
      )
    )
      return true;
  return false;
}
