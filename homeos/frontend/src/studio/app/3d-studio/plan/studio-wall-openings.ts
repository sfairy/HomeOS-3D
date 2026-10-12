/** 把窗 / 门 / 栏杆**重映射到拆段后的墙**：墙先按交点切段，再按 `t` 落到所属段的局部参数。
 *
 * 从 `../studio/studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯函数，依赖全走显式 import。
 */
import { finite } from "../loaders/studio-normalization";
import { generateId } from "../authoring/ui/studio-app-helpers";
import { clamp, clampWindowT, splitWallSegments } from "./geometry";

export function remapOpeningsToWalls(
  wallList: any,
  windowList: any,
  doorList: any,
  windowIndexFallback: any,
  railingList: any[] = [],
) {
  const wallPieces = splitWallSegments(wallList),
    wallPiecesByWallId = new Map(),
    remappedWalls: any[] = [];
  for (const wallPiece of wallPieces) {
    const wallPieceRecord = {
        ...wallPiece.sourceWall,
        id: wallPiece.pieceIndex === 0 ? wallPiece.sourceWall.id : generateId("wall"),
        start: wallPiece.start,
        end: wallPiece.end,
      },
      wallPieceEntry = {
        ...wallPiece,
        wall: wallPieceRecord,
      };
    (wallPiecesByWallId.has(wallPiece.sourceWall.id) ||
      wallPiecesByWallId.set(wallPiece.sourceWall.id, []),
      wallPiecesByWallId.get(wallPiece.sourceWall.id).push(wallPieceEntry),
      remappedWalls.push(wallPieceRecord));
  }
  const snapOpeningToPiece = (openingRecord: any) => {
    const wallPieceList = wallPiecesByWallId.get(openingRecord.wallId);
    if (!wallPieceList?.length) return openingRecord;
    const openingT = clamp(finite(openingRecord.t, 0.5), 0, 1),
      at2 =
        wallPieceList.find(
          (candidatePiece: any) =>
            openingT >= candidatePiece.startT - 1e-7 && openingT <= candidatePiece.endT + 1e-7,
        ) || wallPieceList.at(-1),
      max = Math.max(at2.endT - at2.startT, 1e-7),
      remappedOpening = {
        ...openingRecord,
        wallId: at2.wall.id,
        t: clamp((openingT - at2.startT) / max, 0, 1),
      };
    return (
      (remappedOpening.t = clampWindowT(at2.wall, remappedOpening, windowIndexFallback || 1)),
      remappedOpening
    );
  };
  return {
    walls: remappedWalls,
    windows: windowList.map(snapOpeningToPiece),
    doors: doorList.map(snapOpeningToPiece),
    railings: railingList.map(snapOpeningToPiece),
  };
}
