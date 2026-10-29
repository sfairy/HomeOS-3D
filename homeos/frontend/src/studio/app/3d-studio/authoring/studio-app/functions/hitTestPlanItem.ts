





import {
  hitDrawing as hitDrawing2,
  buildingFootprints as buildingFootprints2,
  surfaceExclusions as surfaceExclusions2,
} from "../../../plan/courtyard-drawing";


















import {
  pointInRotatedRectangle as pointInRotatedRectangle2,
  projectPointToSegment as projectPointToSegment2,
} from "../../../plan/geometry";










import {
  isCourtyardDrawing as isCourtyardDrawing2,
} from "../../../loaders/studio-normalization";
import {
  itemWithPlanFootprint as itemWithPlanFootprint2,
} from "../../items/studio-item-posture";

















import type { StudioAppContext } from "../studio-app-context";
export interface HitTestPlanItemDeps { appCtx: StudioAppContext; closedWallLoops: any; getPixelsPerMeter: any; isPlanItemVisible: any; wallWindowSpan: any; }

export function hitTestPlanItem(deps: HitTestPlanItemDeps, planHitPoint: any) {
  const { appCtx, closedWallLoops, getPixelsPerMeter, isPlanItemVisible, wallWindowSpan } = deps;

  const itemPixelsPerMeter = getPixelsPerMeter() || 100,
    isLightCategoryHit = appCtx.activeLibraryCategory === "light";
  for (const hitCandidateItem of [...appCtx.studioState.items].reverse()) {
    if (!isPlanItemVisible(hitCandidateItem) || hitCandidateItem.type === "courtyard-area")
      continue;
    const hitTestRect =
      hitCandidateItem.type === "smart-socket-86"
        ? {
            ...hitCandidateItem,
            width: Math.max(hitCandidateItem.width, 12 / (itemPixelsPerMeter * appCtx.planView.zoom)),
            depth: Math.max(hitCandidateItem.depth, 12 / (itemPixelsPerMeter * appCtx.planView.zoom)),
          }
        : itemWithPlanFootprint2(hitCandidateItem, itemPixelsPerMeter);
    if (
      isCourtyardDrawing2(hitCandidateItem)
        ? hitDrawing2(hitCandidateItem, planHitPoint, itemPixelsPerMeter, 9 / appCtx.planView.zoom)
        : pointInRotatedRectangle2(planHitPoint, hitTestRect, itemPixelsPerMeter)
    )
      return {
        kind: "item",
        id: hitCandidateItem.id,
      };
  }
  if (appCtx.activeLibraryCategory === "courtyard") {
    for (const surfaceCandidate of [...appCtx.studioState.items].reverse())
      if (
        surfaceCandidate.type === "courtyard-area" &&
        hitDrawing2(
          surfaceCandidate,
          planHitPoint,
          itemPixelsPerMeter,
          9 / appCtx.planView.zoom,
          surfaceExclusions2(
            surfaceCandidate,
            appCtx.studioState.items,
            buildingFootprints2(
              appCtx.studioState.walls,
              closedWallLoops(itemPixelsPerMeter),
              itemPixelsPerMeter,
            ),
            itemPixelsPerMeter,
          ),
        )
      )
        return {
          kind: "item",
          id: surfaceCandidate.id,
        };
    return null;
  }
  if (isLightCategoryHit) return null;
  for (const windowSurfaceRecord of [...appCtx.studioState.windows].reverse()) {
    const xo9 = wallWindowSpan(windowSurfaceRecord);
    if (
      xo9 &&
      projectPointToSegment2(planHitPoint, xo9.start, xo9.end).distance <= 10 / appCtx.planView.zoom
    )
      return {
        kind: "window",
        id: windowSurfaceRecord.id,
      };
  }
  for (const doorSurfaceRecord of [...appCtx.studioState.doors].reverse()) {
    const doorSpan = wallWindowSpan(doorSurfaceRecord);
    if (
      doorSpan &&
      projectPointToSegment2(planHitPoint, doorSpan.start, doorSpan.end).distance <=
        12 / appCtx.planView.zoom
    )
      return {
        kind: "door",
        id: doorSurfaceRecord.id,
      };
  }
  for (const railingSurfaceRecord of [...appCtx.studioState.railings].reverse()) {
    const railingSpan = wallWindowSpan(railingSurfaceRecord);
    if (
      railingSpan &&
      projectPointToSegment2(planHitPoint, railingSpan.start, railingSpan.end).distance <=
        12 / appCtx.planView.zoom
    )
      return {
        kind: "railing",
        id: railingSurfaceRecord.id,
      };
  }
  for (const wallSurfaceRecord of [...appCtx.studioState.walls].reverse()) {
    const wallHitPadding = Math.max(
      (wallSurfaceRecord.thickness * itemPixelsPerMeter) / 2,
      8 / appCtx.planView.zoom,
    );
    if (
      projectPointToSegment2(planHitPoint, wallSurfaceRecord.start, wallSurfaceRecord.end)
        .distance <= wallHitPadding
    )
      return {
        kind: "wall",
        id: wallSurfaceRecord.id,
      };
  }
  for (const surfaceExclusionItem of [...appCtx.studioState.items].reverse())
    if (
      surfaceExclusionItem.type === "courtyard-area" &&
      hitDrawing2(
        surfaceExclusionItem,
        planHitPoint,
        itemPixelsPerMeter,
        9 / appCtx.planView.zoom,
        surfaceExclusions2(
          surfaceExclusionItem,
          appCtx.studioState.items,
          buildingFootprints2(
            appCtx.studioState.walls,
            closedWallLoops(itemPixelsPerMeter),
            itemPixelsPerMeter,
          ),
          itemPixelsPerMeter,
        ),
      )
    )
      return {
        kind: "item",
        id: surfaceExclusionItem.id,
      };
  return null;

}
