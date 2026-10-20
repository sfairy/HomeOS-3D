

























import {
  distance as distance2,
  wallLengthMeters as wallLengthMeters2,
} from "../../../plan/geometry";














import { itemTypeCatalog, lampItemTypeSet } from "../../items/item-catalog";








import { doorTypeCatalog } from "../../scene/studio-scene-payload";









import type { StudioAppContext } from "../studio-app-context";
export interface RefreshStudioViewDeps { activeDoorType: keyof typeof doorTypeCatalog; appCtx: StudioAppContext; computeWallPolygons: any; createSelectionRef: any; drawCourtyardArea: any; drawDoor: any; drawGuideSegment: any; drawLabelText: any; drawPointMarker: any; drawPolygonPath: any; drawRailing: any; drawSelectionRect: any; formatMeasurement: any; gardenGateSnapCandidate: any; getActiveFloor: any; getActiveWalls: any; getPixelsPerMeter: any; planCanvasRenderer: any; planPainter: any; planToScreen: any; renderPlanScene: any; wallWindowSpan: any; worldPointForFloor: any; zoomValueElement: any; }

export function refreshStudioView(deps: RefreshStudioViewDeps, ) {
  const { activeDoorType, appCtx, computeWallPolygons, createSelectionRef, drawCourtyardArea, drawDoor, drawGuideSegment, drawLabelText, drawPointMarker, drawPolygonPath, drawRailing, drawSelectionRect, formatMeasurement, gardenGateSnapCandidate, getActiveFloor, getActiveWalls, getPixelsPerMeter, planCanvasRenderer, planPainter, planToScreen, renderPlanScene, wallWindowSpan, worldPointForFloor, zoomValueElement } = deps;

  const isLightCategory = appCtx.activeLibraryCategory === "light";
  if (
    (planCanvasRenderer.clearRect(0, 0, appCtx.planViewWidth, appCtx.planViewHeight),
    (planCanvasRenderer.fillStyle = "#0d1319"),
    planCanvasRenderer.fillRect(0, 0, appCtx.planViewWidth, appCtx.planViewHeight),
    planCanvasRenderer.save(),
    planCanvasRenderer.translate(appCtx.planViewWidth / 2, appCtx.planViewHeight / 2),
    planCanvasRenderer.rotate((appCtx.planView.rotation * Math.PI) / 180),
    planCanvasRenderer.translate(-appCtx.planViewWidth / 2, -appCtx.planViewHeight / 2),
    appCtx.backgroundImageSource && appCtx.studioState.background && appCtx.studioState.settings.backgroundVisible)
  ) {
    const zr6 = planToScreen({
      x: 0,
      y: 0,
    });
    (planCanvasRenderer.save(),
      (planCanvasRenderer.globalAlpha = isLightCategory ? 0.3 : 0.54),
      planCanvasRenderer.drawImage(
        appCtx.backgroundImageSource,
        zr6.x,
        zr6.y,
        appCtx.studioState.background.width * appCtx.planView.zoom,
        appCtx.studioState.background.height * appCtx.planView.zoom,
      ),
      planCanvasRenderer.restore());
  }
  drawSelectionRect();
  const wallPixelsPerMeter = getPixelsPerMeter() || 100;
  if (appCtx.alignmentState) {
    (planCanvasRenderer.save(), (planCanvasRenderer.globalAlpha = 0.58));
    for (const wallHitRef of getActiveWalls())
      drawGuideSegment(wallHitRef.start, wallHitRef.end, {
        color: "#52cfe0",
        width: Math.max(2, wallHitRef.thickness * wallPixelsPerMeter * appCtx.planView.zoom),
        dash: [7, 5],
        cap: "square",
      });
    if ((planCanvasRenderer.restore(), appCtx.alignmentState.referencePoint)) {
      const ji2 = worldPointForFloor(
        appCtx.alignmentState.referencePoint,
        appCtx.alignmentState.referenceFloor,
        getActiveFloor(),
      );
      (drawPointMarker(ji2, "#ffb14f", 4.5), drawLabelText(ji2, "参照点", "#ffb14f"));
    }
  }
  (planCanvasRenderer.save(), isLightCategory && (planCanvasRenderer.globalAlpha = 0.48));
  for (const courtyardAreaItem of appCtx.studioState.items)
    courtyardAreaItem.type === "courtyard-area" && drawCourtyardArea(courtyardAreaItem);
  for (const hitWallRecord of appCtx.studioState.walls) {
    const ne4 = createSelectionRef("wall", hitWallRecord.id),
      wallLineWidth = Math.max(hitWallRecord.thickness * wallPixelsPerMeter * appCtx.planView.zoom, 4);
    (ne4 &&
      drawGuideSegment(hitWallRecord.start, hitWallRecord.end, {
        color: "rgba(255, 157, 46, .38)",
        width: wallLineWidth + 7,
        cap: "square",
      }),
      drawGuideSegment(hitWallRecord.start, hitWallRecord.end, {
        color: ne4 ? "#f1d7b9" : "#c7d0d7",
        width: wallLineWidth,
        cap: "square",
      }),
      drawGuideSegment(hitWallRecord.start, hitWallRecord.end, {
        color: "rgba(39, 51, 61, .82)",
        width: 1,
      }),
      (appCtx.activeToolName === "wall" || ne4) &&
        (drawPointMarker(hitWallRecord.start, ne4 ? "#ff9d2e" : "#6c7c88", 3.5),
        drawPointMarker(hitWallRecord.end, ne4 ? "#ff9d2e" : "#6c7c88", 3.5)),
      ne4 &&
        appCtx.selectedItems.length <= 1 &&
        drawLabelText(
          {
            x: (hitWallRecord.start.x + hitWallRecord.end.x) / 2,
            y: (hitWallRecord.start.y + hitWallRecord.end.y) / 2,
          },
          wallLengthMeters2(hitWallRecord, wallPixelsPerMeter).toFixed(2) + " m",
          "#ffb14f",
        ));
  }
  for (const windowHitRecord of appCtx.studioState.windows) {
    const xo7 = wallWindowSpan(windowHitRecord);
    if (!xo7) continue;
    const ne5 = createSelectionRef("window", windowHitRecord.id);
    if (
      (drawGuideSegment(xo7.start, xo7.end, {
        color: "rgba(7, 16, 21, .9)",
        width: Math.max(10, xo7.wall.thickness * wallPixelsPerMeter * appCtx.planView.zoom + 5),
        cap: "butt",
      }),
      drawGuideSegment(xo7.start, xo7.end, {
        color: ne5 ? "#ffaf46" : "#43d2e6",
        width: ne5 ? 5 : 3,
        cap: "butt",
      }),
      drawGuideSegment(xo7.start, xo7.end, {
        color: "rgba(224, 250, 255, .9)",
        width: 1,
        cap: "butt",
      }),
      windowHitRecord.hasDivider !== false && windowHitRecord.width > 1.2)
    ) {
      const windowNormalVector = {
          x: -xo7.unit.y,
          y: xo7.unit.x,
        },
        windowFrameOffset = Math.max(
          xo7.wall.thickness * wallPixelsPerMeter * appCtx.planView.zoom * 0.72,
          5 / appCtx.planView.zoom,
        );
      drawGuideSegment(
        {
          x: xo7.center.x - windowNormalVector.x * windowFrameOffset,
          y: xo7.center.y - windowNormalVector.y * windowFrameOffset,
        },
        {
          x: xo7.center.x + windowNormalVector.x * windowFrameOffset,
          y: xo7.center.y + windowNormalVector.y * windowFrameOffset,
        },
        {
          color: ne5 ? "#ffaf46" : "rgba(224, 250, 255, .9)",
          width: 1.5,
          cap: "butt",
        },
      );
    }
    ne5 &&
      appCtx.selectedItems.length <= 1 &&
      drawLabelText(xo7.center, windowHitRecord.width.toFixed(2) + " m", "#43d2e6");
  }
  for (const doorHitRecord of appCtx.studioState.doors) drawDoor(doorHitRecord);
  for (const railingHitRecord of appCtx.studioState.railings) drawRailing(railingHitRecord);
  if (appCtx.marqueeBox?.type === "draw-flooropening") {
    const { start: marqueeMinPoint, current: marqueeMaxPoint } = appCtx.marqueeBox;
    drawCourtyardArea({
      ...itemTypeCatalog.flooropening,
      type: "flooropening",
      id: "opening-preview",
      rotation: 0,
      x: (marqueeMinPoint.x + marqueeMaxPoint.x) / 2,
      y: (marqueeMinPoint.y + marqueeMaxPoint.y) / 2,
      width: Math.abs(marqueeMaxPoint.x - marqueeMinPoint.x) / wallPixelsPerMeter,
      depth: Math.abs(marqueeMaxPoint.y - marqueeMinPoint.y) / wallPixelsPerMeter,
    });
  }
  for (const nonLampItem of appCtx.studioState.items)
    !lampItemTypeSet.has(nonLampItem.type) &&
      nonLampItem.type !== "courtyard-area" &&
      drawCourtyardArea(nonLampItem);
  if (!appCtx.alignmentState) {
    const ty2 = computeWallPolygons(wallPixelsPerMeter);
    for (const openLoop of ty2)
      (drawPolygonPath(openLoop), ty2.length <= 3 && drawLabelText(openLoop, "未闭合", "#ff766e"));
  }
  if ((planCanvasRenderer.restore(), isLightCategory)) {
    for (const litLampItem of appCtx.studioState.items)
      lampItemTypeSet.has(litLampItem.type) && drawCourtyardArea(litLampItem);
  }
  const calibrationReference = appCtx.studioState.calibration?.reference;
  if (
    (calibrationReference &&
      appCtx.activeToolName === "scale" &&
      (drawGuideSegment(calibrationReference.start, calibrationReference.end, {
        color: "rgba(255, 157, 46, .72)",
        width: 2,
        dash: [7, 5],
      }),
      drawPointMarker(calibrationReference.start, "#ff9d2e", 3.5),
      drawPointMarker(calibrationReference.end, "#ff9d2e", 3.5),
      drawLabelText(
        {
          x: (calibrationReference.start.x + calibrationReference.end.x) / 2,
          y: (calibrationReference.start.y + calibrationReference.end.y) / 2,
        },
        calibrationReference.meters.toFixed(2) + " m 参考",
        "#ffad45",
      )),
    appCtx.previewEndPoint &&
      appCtx.hoverPoint &&
      (drawGuideSegment(appCtx.previewEndPoint, appCtx.hoverPoint, {
        color: "#ff9d2e",
        width: 2,
        dash: [7, 5],
      }),
      drawPointMarker(appCtx.previewEndPoint, "#ff9d2e"),
      drawPointMarker(appCtx.hoverPoint, "#ff9d2e")),
    appCtx.segmentStartPoint && appCtx.snapHit)
  ) {
    const eg2 = formatMeasurement(appCtx.snapHit);
    (drawGuideSegment(appCtx.segmentStartPoint, appCtx.snapHit.point, {
      color: "#ff9d2e",
      width: 2,
      dash: [7, 5],
    }),
      drawPointMarker(appCtx.segmentStartPoint, "#ff9d2e"),
      drawPointMarker(
        appCtx.snapHit.point,
        eg2 ? "#76cfa1" : appCtx.snapHit.kind ? "#43d2e6" : "#ff9d2e",
        eg2 ? 5 : 3.5,
      ));
    const segmentLengthMeters = distance2(appCtx.segmentStartPoint, appCtx.snapHit.point) / wallPixelsPerMeter;
    (drawLabelText(
      {
        x: (appCtx.segmentStartPoint.x + appCtx.snapHit.point.x) / 2,
        y: (appCtx.segmentStartPoint.y + appCtx.snapHit.point.y) / 2,
      },
      segmentLengthMeters.toFixed(2) + " m",
      "#ffb04a",
    ),
      eg2 && drawLabelText(appCtx.snapHit.point, "点击闭合空间", "#76cfa1"));
  } else
    appCtx.snapHit?.kind &&
      ["wall", "scale"].includes(appCtx.activeToolName) &&
      (drawPointMarker(appCtx.snapHit.point, "#43d2e6"),
      drawLabelText(appCtx.snapHit.point, appCtx.snapHit.label, "#43d2e6"));
  if (appCtx.activeToolName === "window" && appCtx.windowPlacement) {
    const windowPlacementRecord = {
        wallId: appCtx.windowPlacement.wall.id,
        t: appCtx.windowPlacement.t,
        width: 1.4,
      },
      xo8 = wallWindowSpan(windowPlacementRecord);
    xo8 &&
      drawGuideSegment(xo8.start, xo8.end, {
        color: "rgba(67, 210, 230, .75)",
        width: 5,
        dash: [5, 4],
        cap: "butt",
      });
  }
  if (appCtx.activeToolName === "door" && appCtx.doorPlacement) {
    const solid = doorTypeCatalog[activeDoorType] || doorTypeCatalog.solid;
    drawDoor(
      {
        wallId: appCtx.doorPlacement.wall.id,
        t: appCtx.doorPlacement.t,
        width: solid.width,
        height: solid.height,
        doorType: activeDoorType,
        hinge: "left",
        swing: 1,
      },
      {
        preview: true,
      },
    );
  }
  (appCtx.activeToolName === "railing" &&
    appCtx.railingPlacement &&
    drawRailing(
      {
        wallId: appCtx.railingPlacement.wall.id,
        t: appCtx.railingPlacement.t,
        width: 2,
        height: 1.1,
      },
      {
        preview: true,
      },
    ),
    planCanvasRenderer.restore(),
    renderPlanScene(),
    appCtx.activeToolName === "courtyard-gate" &&
      gardenGateSnapCandidate &&
      (planCanvasRenderer.save(),
      (planCanvasRenderer.globalAlpha = 0.65),
      drawCourtyardArea(gardenGateSnapCandidate),
      planCanvasRenderer.restore(),
      drawPointMarker(gardenGateSnapCandidate, "#43d2e6"),
      drawLabelText(gardenGateSnapCandidate, "点击放置庭院门", "#43d2e6")),
    planPainter?.draw(planCanvasRenderer),
    (zoomValueElement.textContent = Math.round(appCtx.planView.zoom * 100) + "%"));

}
