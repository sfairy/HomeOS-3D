/** 墙段跨度在**平面上的四角足迹**（含首尾可选外扩），供墙带 / 踢脚等按跨度取面。
 *
 * 从 `../studio/studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯函数。
 * `worldFromWallPoint` 由调用方注入 —— 单体内的世界坐标换算牵着相机与楼层状态，不跟着搬。
 */
import type { WallSpanPadding } from "../authoring/types/studio-app-types";

export function buildWallSpanFootprint(
  wallSegment: any,
  wallSpan: any,
  _unusedWallSpanArg: any,
  worldFromWallPoint: any,
  wallSpanPadding: WallSpanPadding = {},
) {
  const wallSpanStartPoint = worldFromWallPoint(wallSegment.start),
    wallSpanEndPoint = worldFromWallPoint(wallSegment.end),
    wallSpanDeltaX = wallSpanEndPoint.x - wallSpanStartPoint.x,
    wallSpanDeltaZ = wallSpanEndPoint.z - wallSpanStartPoint.z,
    hypot5 = Math.hypot(wallSpanDeltaX, wallSpanDeltaZ);
  if (hypot5 <= 1e-7) return null;
  const wallSpanDirection = {
      x: wallSpanDeltaX / hypot5,
      y: wallSpanDeltaZ / hypot5,
    },
    wallSpanNormal = {
      x: -wallSpanDirection.y,
      y: wallSpanDirection.x,
    },
    wallHalfThickness = wallSegment.thickness / 2,
    start3 =
      wallSpan.start <= 0.000001
        ? wallSpan.start - Math.max(Number(wallSpanPadding.start) || 0, 0)
        : wallSpan.start,
    end2 =
      wallSpan.end >= hypot5 - 0.000001
        ? wallSpan.end + Math.max(Number(wallSpanPadding.end) || 0, 0)
        : wallSpan.end,
    wallSpanInnerStart = {
      x: wallSpanStartPoint.x + wallSpanDirection.x * start3,
      y: wallSpanStartPoint.z + wallSpanDirection.y * start3,
    },
    wallSpanInnerEnd = {
      x: wallSpanStartPoint.x + wallSpanDirection.x * end2,
      y: wallSpanStartPoint.z + wallSpanDirection.y * end2,
    };
  return [
    {
      x: wallSpanInnerStart.x + wallSpanNormal.x * wallHalfThickness,
      y: wallSpanInnerStart.y + wallSpanNormal.y * wallHalfThickness,
    },
    {
      x: wallSpanInnerStart.x - wallSpanNormal.x * wallHalfThickness,
      y: wallSpanInnerStart.y - wallSpanNormal.y * wallHalfThickness,
    },
    {
      x: wallSpanInnerEnd.x - wallSpanNormal.x * wallHalfThickness,
      y: wallSpanInnerEnd.y - wallSpanNormal.y * wallHalfThickness,
    },
    {
      x: wallSpanInnerEnd.x + wallSpanNormal.x * wallHalfThickness,
      y: wallSpanInnerEnd.y + wallSpanNormal.y * wallHalfThickness,
    },
  ];
}
