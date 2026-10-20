import {
  itemDimensionPolicy as itemDimensionPolicy2,
  moveStepMeters as moveStepMeters2,
  snapEditDelta as snapEditDelta2,
} from "../../studio-edit-metrics";




import {
  anchorGate as anchorGate2,
  isCourtyardGate as isCourtyardGate2,
} from "../../../plan/courtyard-drawing";




import {
  fanDimensions as fanDimensions2,
} from "../../items/studio-fan";










import {
  normalizeCurtainTrack as normalizeCurtainTrack2,
  curtainFootprintDepth as curtainFootprintDepth2,
} from "../../../loaders/studio-curtain-track";








import {
  clampWindowT as clampWindowT2,
  distance as distance2,
  itemRotationFromPointers as itemRotationFromPointers2,
  projectPointToSegment as projectPointToSegment2,
  resizeRotatedItemFromCorner as resizeRotatedItemFromCorner2,
} from "../../../plan/geometry";










import {
  finite as finite2,
  itemMinimumHeight as itemMinimumHeight2,
  itemMinimumFootprint as itemMinimumFootprint2,
} from "../../../loaders/studio-normalization";
import {
  itemFromPlanFootprintResize as itemFromPlanFootprintResize2,
  itemWithPlanFootprint as itemWithPlanFootprint2,
} from "../../items/studio-item-posture";

















import type { StudioAppContext } from "../studio-app-context";

export interface HandlePointerUpDeps { appCtx: StudioAppContext; drawMarqueeOverlay: any; eventToLocalPoint: any; getPixelsPerMeter: any; getSelectedObject: any; isSnapEnabled: any; refreshStudioView: any; renderPlanScene: any; screenToPlan: any; screenToPlanPoint: any; toggleSnapSetting: any; }

export function handlePointerUp(deps: HandlePointerUpDeps, pointerUpEvent: any) {
  const { appCtx, drawMarqueeOverlay, eventToLocalPoint, getPixelsPerMeter, getSelectedObject, isSnapEnabled, refreshStudioView, renderPlanScene, screenToPlan, screenToPlanPoint, toggleSnapSetting } = deps;

  const ya2 = eventToLocalPoint(pointerUpEvent),
    pr4 = screenToPlan(ya2);
  if (appCtx.marqueeBox?.pointerId === pointerUpEvent.pointerId) {
    if (appCtx.marqueeBox.type === "draw-flooropening") {
      ((appCtx.marqueeBox.current = pointerUpEvent.shiftKey
        ? (() => {
            const cornerDeltaX = pr4.x - appCtx.marqueeBox.start.x,
              cornerDeltaY = pr4.y - appCtx.marqueeBox.start.y,
              cornerDragMagnitude = Math.max(Math.abs(cornerDeltaX), Math.abs(cornerDeltaY));
            return {
              x: appCtx.marqueeBox.start.x + Math.sign(cornerDeltaX || 1) * cornerDragMagnitude,
              y: appCtx.marqueeBox.start.y + Math.sign(cornerDeltaY || 1) * cornerDragMagnitude,
            };
          })()
        : pr4),
        refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "marquee") {
      ((appCtx.marqueeBox.current = pr4),
        (appCtx.marqueeBox.moved = distance2(appCtx.marqueeBox.start, pr4) * appCtx.planView.zoom >= 4),
        drawMarqueeOverlay() ? renderPlanScene() : refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "pan") {
      const nl4 = screenToPlanPoint(ya2);
      ((appCtx.planView.offsetX = appCtx.marqueeBox.offsetX + nl4.x - appCtx.marqueeBox.screen.x),
        (appCtx.planView.offsetY = appCtx.marqueeBox.offsetY + nl4.y - appCtx.marqueeBox.screen.y));
      const handleDeltaX = ya2.x - appCtx.marqueeBox.visibleScreen.x,
        handleDeltaY = ya2.y - appCtx.marqueeBox.visibleScreen.y;
      drawMarqueeOverlay({
        offsetX: handleDeltaX,
        offsetY: handleDeltaY,
      }) || refreshStudioView();
      return;
    }
    if (appCtx.marqueeBox.type === "move-items") {
      if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.start) * appCtx.planView.zoom < 3) return;
      const moveThreshold =
          getPixelsPerMeter() *
          moveStepMeters2({ altKey: pointerUpEvent.altKey && !appCtx.marqueeBox.copied }),
        shouldSnapMove = isSnapEnabled() && appCtx.studioState.settings.snapGrid !== false;
      let dragOffsetX = pr4.x - appCtx.marqueeBox.start.x,
        dragOffsetY = pr4.y - appCtx.marqueeBox.start.y;
      pointerUpEvent.shiftKey &&
        (Math.abs(dragOffsetX) >= Math.abs(dragOffsetY) ? (dragOffsetY = 0) : (dragOffsetX = 0));
      // 0.7.8：吸附对「位移」取整，而非对绝对坐标取整；Alt 时步进降到 1cm。
      shouldSnapMove &&
        ((dragOffsetX = snapEditDelta2(dragOffsetX, moveThreshold)),
        (dragOffsetY = snapEditDelta2(dragOffsetY, moveThreshold)));
      const itemsByItemId = new Map(
        appCtx.studioState.items.map((handlePointerUpItemEntry) => [
          handlePointerUpItemEntry.id,
          handlePointerUpItemEntry,
        ]),
      );
      for (const originalItemSnapshot of appCtx.marqueeBox.originals) {
        const currentItemEntry = itemsByItemId.get(originalItemSnapshot.id);
        currentItemEntry &&
          ((currentItemEntry.x = originalItemSnapshot.x + dragOffsetX),
          (currentItemEntry.y = originalItemSnapshot.y + dragOffsetY));
      }
      if (appCtx.marqueeBox.originals.length === 1) {
        const firstOriginalItem = itemsByItemId.get(appCtx.marqueeBox.originals[0].id);
        isCourtyardGate2(firstOriginalItem) &&
          anchorGate2(
            firstOriginalItem,
            appCtx.studioState.items,
            getPixelsPerMeter(),
            24 / appCtx.planView.zoom,
          );
      }
      ((appCtx.marqueeBox.moved = appCtx.marqueeBox.originals.some((movedOriginalItem: any) => {
        const movedItemEntry = itemsByItemId.get(movedOriginalItem.id);
        return (
          movedItemEntry &&
          (Math.abs(movedItemEntry.x - movedOriginalItem.x) > 0.000001 ||
            Math.abs(movedItemEntry.y - movedOriginalItem.y) > 0.000001)
        );
      })),
        refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "resize-item") {
      if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.handle) * appCtx.planView.zoom < 3) return;
      const at7 = getSelectedObject();
      if (!at7) return;
      const itemHeightMeters = Math.max(finite2(appCtx.marqueeBox.originalItem.height, 0.05), 0.001),
        resizeItemPolicy = itemDimensionPolicy2(appCtx.marqueeBox.originalItem.type),
        // 风扇的宽/深步进跟随扇叶比例（0.7.8 的 0.434/0.324 × 5cm）。
        resizeWidthStep =
          appCtx.marqueeBox.originalItem.type === "fan" ? 0.434 * 0.05 : resizeItemPolicy.widthStep,
        resizeDepthStep =
          appCtx.marqueeBox.originalItem.type === "fan" ? 0.324 * 0.05 : resizeItemPolicy.depthStep,
        resizeSnapSteps =
          isSnapEnabled() && appCtx.studioState.settings.snapGrid !== false
            ? {
                widthStep: pointerUpEvent.altKey
                  ? Math.min(0.001, resizeWidthStep)
                  : resizeWidthStep,
                depthStep: pointerUpEvent.altKey
                  ? Math.min(0.001, resizeDepthStep)
                  : resizeDepthStep,
              }
            : {},
        resizeSourceItem = itemWithPlanFootprint2(appCtx.marqueeBox.originalItem),
        itemMinimumFootprint = itemMinimumFootprint2(appCtx.marqueeBox.originalItem.type),
        itemResizeLimits =
          at7.type === "fan"
            ? {
                minimum: 0.6 / fanDimensions2(appCtx.marqueeBox.originalItem).fanScale,
                maximum: 1.6 / fanDimensions2(appCtx.marqueeBox.originalItem).fanScale,
              }
            : pointerUpEvent.shiftKey
              ? {
                  minimum: Math.max(
                    itemMinimumFootprint / Math.max(resizeSourceItem.width, itemMinimumFootprint),
                    itemMinimumFootprint / Math.max(resizeSourceItem.depth, itemMinimumFootprint),
                    itemMinimumHeight2(appCtx.marqueeBox.originalItem.type) / itemHeightMeters,
                  ),
                  maximum: Math.min(
                    8 / Math.max(resizeSourceItem.width, itemMinimumFootprint),
                    8 / Math.max(resizeSourceItem.depth, itemMinimumFootprint),
                    6 / itemHeightMeters,
                  ),
                }
              : undefined,
        resizedItemResult = resizeRotatedItemFromCorner2(
          resizeSourceItem,
          appCtx.marqueeBox.handle,
          appCtx.marqueeBox.anchor,
          pr4,
          getPixelsPerMeter() || 1,
          pointerUpEvent.shiftKey || at7.type === "fan",
          {
            ...itemResizeLimits,
            minimumDimension: itemMinimumFootprint,
            ...resizeSnapSteps,
          },
        );
      if (
        (Object.assign(at7, itemFromPlanFootprintResize2(appCtx.marqueeBox.originalItem, resizedItemResult)),
        at7.type === "fan" &&
          Object.assign(
            at7,
            fanDimensions2({
              ...appCtx.marqueeBox.originalItem,
              fanScale: resizedItemResult.width / 0.434,
            }),
          ),
        at7.type === "curtain" && normalizeCurtainTrack2(at7).curtainTrack !== "straight")
      ) {
        const originalItem = appCtx.marqueeBox.originalItem,
          normalizedCurtainConfig = normalizeCurtainTrack2(originalItem),
          curtainDepthRatio =
            Math.max(0.2, at7.depth - 0.18) / Math.max(0.2, originalItem.depth - 0.18);
        (Object.assign(
          at7,
          normalizeCurtainTrack2({
            ...at7,
            curtainLeftLength: normalizedCurtainConfig.curtainLeftLength * curtainDepthRatio,
            curtainRightLength: normalizedCurtainConfig.curtainRightLength * curtainDepthRatio,
          }),
        ),
          (at7.depth = curtainFootprintDepth2(at7)));
      }
      ((appCtx.marqueeBox.moved =
        Math.abs(at7.x - appCtx.marqueeBox.originalItem.x) > 0.000001 ||
        Math.abs(at7.y - appCtx.marqueeBox.originalItem.y) > 0.000001 ||
        Math.abs(at7.width - appCtx.marqueeBox.originalItem.width) > 0.000001 ||
        Math.abs(at7.depth - appCtx.marqueeBox.originalItem.depth) > 0.000001 ||
        Math.abs(at7.height - appCtx.marqueeBox.originalItem.height) > 0.000001),
        refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "rotate-item") {
      if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.startPointer) * appCtx.planView.zoom < 3) return;
      const at8 = getSelectedObject();
      if (!at8) return;
      ((at8.rotation = itemRotationFromPointers2(
        appCtx.marqueeBox.originalItem.rotation,
        appCtx.marqueeBox.center,
        appCtx.marqueeBox.startPointer,
        pr4,
        pointerUpEvent.shiftKey ? 15 : 0,
      )),
        (appCtx.marqueeBox.moved = Math.abs(at8.rotation - appCtx.marqueeBox.originalItem.rotation) > 0.000001),
        refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "move-opening") {
      if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.start) * appCtx.planView.zoom < 3) return;
      const at9 = getSelectedObject(),
        itemWallRecord = appCtx.studioState.walls.find((itemWall) => itemWall.id === at9?.wallId);
      if (!at9 || !itemWallRecord) return;
      at9.t = clampWindowT2(
        itemWallRecord,
        {
          ...at9,
          t: projectPointToSegment2(pr4, itemWallRecord.start, itemWallRecord.end).t,
        },
        getPixelsPerMeter(),
      );
      const beforeItemRecord = appCtx.marqueeBox.before?.[appCtx.selectedItem?.kind + "s"]?.find?.(
        (beforeItem: any) => beforeItem.id === at9.id,
      );
      ((appCtx.marqueeBox.moved = !beforeItemRecord || Math.abs(at9.t - beforeItemRecord.t) > 0.000001),
        refreshStudioView());
      return;
    }
  }
  (toggleSnapSetting(pointerUpEvent),
    (appCtx.alignmentState || ["scale", "wall", "window", "door", "railing"].includes(appCtx.activeToolName)) &&
      refreshStudioView());

}
