/**
 * 平面图「按物品绘制」（`drawDoor` 门符号 / `drawCourtyardArea` 庭院区与部件）：
 * 把 item 的平面表示画到 `planCanvasRenderer` 上，含门口预览、庭院面材质与部件配色。
 *
 * 从 studio-app.ts 单体切出（P4，第二刀）。与门配色同族的私有助手（`doorPlanColor` /
 * `doorPlanPartMaterial` / `planColorLuminance` / `PLAN_DOOR_*`）随切片一起搬入，
 * 使本域自持；其余 15 个句柄经 `StudioPlanItemDrawingDeps` 显式传入。
 */

import type { PlanEditPreviewFlags } from "../authoring/types/studio-app-types";
import { clamp as clamp2, distance as distance2, planLabelProjectionMetrics as planLabelProjectionMetrics2, slidingDoorPanelCenters as slidingDoorPanelCenters2 } from "./geometry";
import { courtyardPlanColor as courtyardPlanColor2, isCourtyardPlanItem as isCourtyardPlanItem2 } from "./courtyard-plan";
import { createCurtainTrack as createCurtainTrack2, curtainPanelRanges as curtainPanelRanges2 } from "../loaders/studio-curtain-track";
import { doorMaterialPartRolesForType, doorPlanMaterialRoleFor } from "../materials/studio-model-material-roles";
import { drawTrackedText as drawTrackedText2 } from "./studio-plan-drawing";
import { finite as finite2, isCourtyardDrawing as isCourtyardDrawing2, kelvinToRgbHex as kelvinToRgbHex2 } from "../loaders/studio-normalization";
import { isTurntableRoundTable } from "../authoring/ui/studio-app-helpers";
import { itemPlanFootprint as itemPlanFootprint2, normalizePillarShape as normalizePillarShape2, pillarIsLying as pillarIsLying2, stripIsStanding as stripIsStanding2, tracePillarPlanPath as tracePillarPlanPath2 } from "../authoring/items/studio-item-posture";
import { itemTypeCatalog, lampItemTypeSet, roundTableTypeSet, stairItemTypeSet } from "../authoring/items/item-catalog";
import { normalizePlanLabelColor } from "../authoring/scene/studio-scene-payload";

/**
 * 管线机的两种模型类型共用同一套平面符号（机身轮廓 + 出水口）。
 *
 * 物品类型仍是 `pipelinewaterpurifier`，款式只换模型；这里把变体一并收进来，
 * 是为了让「按模型类型分派」的调用路径也不会退化成通用矩形。
 */
const PIPELINE_DISPENSER_PLAN_TYPES: ReadonlySet<string> = new Set([
  "pipelinewaterpurifier",
  "rectangular-pipeline-dispenser",
]);

/**
 * 平面图物品绘制需要的外部句柄（**全部只读**：实测在切片区间内无一处重新赋值，
 * 且区间内没有 `await`，所以整段绘制是同步的 —— 快照解构与闭包捕获等价）。
 *
 * 三类来源：① 宿主里的平面画布与坐标换算（`planCanvasRenderer` / `planView` /
 * `planToScreen` / `getPixelsPerMeter`）；② 宿主从 `createPlanDrawingTools` 解构出来的
 * 三个画笔别名（宿主全文件 27 / 19 / 17 处在用，不能一起搬）；③ 灯具与铭牌的判据 /
 * 配色（`isLampEnabled` / `planLabelAccentColor`）与门口材质通道
 * （`resolveDoorPartMaterials` / `doorPartDisplayColor`）——后两个同时被宿主 15581 / 15585 行用着。
 */
interface StudioPlanItemDrawingDeps {
  /** 平面画布 2D 上下文（`planCanvasElement.getContext("2d")`）。 */
  planCanvasRenderer: any;
  /** 平面视图状态（缩放 / 偏移 / 楼层）。 */
  planView: any;
  /** 庭院绘制编辑器句柄（门/庭院的拖拽预览由它接管）。 */
  planPainter: any;
  /** 画笔别名：画线段（宿主 1188 行从 `createPlanDrawingTools` 解构）。返回类型未显式声明，故按不透明回调注入。 */
  drawGuideSegment: (...args: any[]) => any;
  /** 画笔别名：画点标记。 */
  drawPointMarker: (...args: any[]) => any;
  /** 画笔别名：画浮动文字标签。 */
  drawLabelText: (...args: any[]) => any;
  /** 平面坐标 → 屏幕坐标。 */
  planToScreen: (planPointInput: any) => any;
  /** 标定比例（像素 / 米）。 */
  getPixelsPerMeter: () => number;
  /** 选中态引用（由选中种类 + id 生成 `userData` 引用）。 */
  createSelectionRef: (selectionKind: any, selectionId: any) => any;
  /** 窗 / 门在所属墙段上的跨度。 */
  wallWindowSpan: (windowRecord: any) => any;
  /** 灯具是否点亮（受楼层灯光覆盖影响）。 */
  isLampEnabled: (lampStateRef: any) => boolean;
  /** 由铭牌颜色派生底线 / 描边的半透明色。 */
  planLabelAccentColor: (candidateColor: any, alpha?: number) => string;
  /** 门口各部件的解析后材质表。 */
  resolveDoorPartMaterials: (doorRecord: any, themePalette: any) => Record<string, any>;
  /** 单个门口部件的显示色（选中态参与换算）。 */
  doorPartDisplayColor: (
    partMaterial: any,
    isSelected: boolean,
    themePalette: any,
  ) => any;
  /** 当前主题的视图设置（门色兜底用）。 */
  backgroundSettings: () => { warmWood?: boolean } & Record<string, any>;
}

/** 平面图门色的最低相对亮度。 */
const PLAN_DOOR_MIN_LUMINANCE = 0.12;

const PLAN_DOOR_MAX_LIFT = 0.6;

function planColorLuminance(red: number, green: number, blue: number): number {
  const linearizeChannel = (channel: number) => {
    const ratio = channel / 255;
    return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linearizeChannel(red) +
    0.7152 * linearizeChannel(green) +
    0.0722 * linearizeChannel(blue)
  );
}

function doorPlanPartMaterial(
  deps: StudioPlanItemDrawingDeps,
  doorRecord: any,
  doorType: string,
  themePalette: any,
) {
  const { resolveDoorPartMaterials, doorPartDisplayColor } = deps;
  const partMaterials = resolveDoorPartMaterials(doorRecord, themePalette),
    planRole = doorPlanMaterialRoleFor(doorType);
  return partMaterials[planRole] ?? partMaterials[doorMaterialPartRolesForType(doorType)[0]];
}

function doorPlanColor(
  deps: StudioPlanItemDrawingDeps,
  doorRecord: any,
  doorType: string,
  isSelected: boolean,
  isPreview: boolean,
): string {
  const { backgroundSettings, doorPartDisplayColor } = deps;
  if (isPreview) return "rgba(255, 189, 110, .76)";
  const fallbackColor = ["solid", "double", "entry", "roller-shutter", "frame-only"].includes(
    doorType,
  )
    ? "#edf2f7"
    : "#bfe9ff";
  const themePalette = backgroundSettings(),
    displayColorValue = doorPartDisplayColor(
      doorPlanPartMaterial(deps, doorRecord, doorType, themePalette),
      isSelected,
      themePalette,
    );
  if (typeof displayColorValue !== "number" || !Number.isFinite(displayColorValue))
    return fallbackColor;
  const sourceChannels = [
      (displayColorValue >> 16) & 255,
      (displayColorValue >> 8) & 255,
      displayColorValue & 255,
    ] as const,
    liftedChannels = (liftRatio: number): [number, number, number] => [
      Math.round(sourceChannels[0] + (255 - sourceChannels[0]) * liftRatio),
      Math.round(sourceChannels[1] + (255 - sourceChannels[1]) * liftRatio),
      Math.round(sourceChannels[2] + (255 - sourceChannels[2]) * liftRatio),
    ];
  let liftRatio = 0;
  while (
    liftRatio < PLAN_DOOR_MAX_LIFT &&
    planColorLuminance(...liftedChannels(liftRatio)) < PLAN_DOOR_MIN_LUMINANCE
  )
    liftRatio += 0.02;
  return (
    "#" +
    liftedChannels(liftRatio)
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function drawDoor(
  deps: StudioPlanItemDrawingDeps,
  doorRecord: any,
  doorView: PlanEditPreviewFlags = {},
) {
  // 解构成本地名后，正文与迁出前一致（唯一改动是内部调用透传 deps）。
  const {
    planCanvasRenderer,
    planView,
    drawGuideSegment,
    getPixelsPerMeter,
    drawLabelText,
    drawPointMarker,
    createSelectionRef,
    planToScreen,
    wallWindowSpan,
  } = deps;
  const xo3 = wallWindowSpan(doorRecord);
  if (!xo3) return;
  const ne2 = createSelectionRef("door", doorRecord.id),
    doorTypeName = doorRecord.doorType || "solid",
    doorColor = doorPlanColor(deps, doorRecord, doorTypeName, ne2, doorView.preview!),
    doorLineWidth = Math.max(
      10,
      xo3.wall.thickness * (getPixelsPerMeter() || 100) * planView.zoom + 5,
    );
  if (
    (drawGuideSegment(xo3.start, xo3.end, {
      color: "rgba(7, 16, 21, .94)",
      width: doorLineWidth,
      cap: "butt",
    }),
    doorTypeName === "frame-only")
  ) {
    const doorNormalVector = {
        x: -xo3.unit.y,
        y: xo3.unit.x,
      },
      doorFrameOffset = Math.max(
        5 / planView.zoom,
        xo3.wall.thickness * (getPixelsPerMeter() || 100) * 0.55,
      );
    for (const doorFrameCenter of [xo3.start, xo3.end])
      drawGuideSegment(
        {
          x: doorFrameCenter.x - doorNormalVector.x * doorFrameOffset,
          y: doorFrameCenter.y - doorNormalVector.y * doorFrameOffset,
        },
        {
          x: doorFrameCenter.x + doorNormalVector.x * doorFrameOffset,
          y: doorFrameCenter.y + doorNormalVector.y * doorFrameOffset,
        },
        {
          color: doorColor,
          width: ne2 ? 4 : 3,
          cap: "butt",
        },
      );
    ne2 && drawLabelText(xo3.center, "仅门框 · " + doorRecord.width.toFixed(2) + " m", "#ffaf46");
    return;
  }
  if (doorTypeName === "sliding-glass") {
    const panelNormalVector = {
        x: -xo3.unit.y,
        y: xo3.unit.x,
      },
      panelOffset = Math.max(
        2.5 / planView.zoom,
        xo3.wall.thickness * (getPixelsPerMeter() || 100) * 0.16,
      ),
      doorSpanLength = distance2(xo3.start, xo3.end),
      hingeDirection = doorRecord.hinge === "right" ? 1 : -1,
      panelCenters = slidingDoorPanelCenters2(doorSpanLength, hingeDirection),
      panelHalfOffset = doorSpanLength * 0.27;
    for (const [doorPanelShift, slideSign] of [
      [panelCenters.fixed, -1],
      [panelCenters.moving, 1],
    ]) {
      const panelCenterPoint = {
          x: xo3.center.x + xo3.unit.x * doorPanelShift,
          y: xo3.center.y + xo3.unit.y * doorPanelShift,
        },
        slideOffsetVector = {
          x: panelNormalVector.x * panelOffset * slideSign,
          y: panelNormalVector.y * panelOffset * slideSign,
        },
        panelStartPoint = {
          x: panelCenterPoint.x - xo3.unit.x * panelHalfOffset + slideOffsetVector.x,
          y: panelCenterPoint.y - xo3.unit.y * panelHalfOffset + slideOffsetVector.y,
        },
        panelEndPoint = {
          x: panelCenterPoint.x + xo3.unit.x * panelHalfOffset + slideOffsetVector.x,
          y: panelCenterPoint.y + xo3.unit.y * panelHalfOffset + slideOffsetVector.y,
        };
      (drawGuideSegment(panelStartPoint, panelEndPoint, {
        color: doorColor,
        width: ne2 ? 4 : 3,
        cap: "butt",
      }),
        drawPointMarker(slideSign < 0 ? panelEndPoint : panelStartPoint, doorColor, 2));
    }
    ne2 &&
      drawLabelText(xo3.center, "玻璃推拉门（常开）· " + doorRecord.width.toFixed(2) + " m", "#ffaf46");
    return;
  }
  if (doorTypeName === "roller-shutter") {
    const normalVector = {
        x: -xo3.unit.y,
        y: xo3.unit.x,
      },
      frameOffset =
        Math.max(2 / planView.zoom, xo3.wall.thickness * (getPixelsPerMeter() || 100) * 0.08) *
        (doorRecord.swing === -1 ? -1 : 1);
    drawGuideSegment(
      {
        x: xo3.start.x + normalVector.x * frameOffset,
        y: xo3.start.y + normalVector.y * frameOffset,
      },
      {
        x: xo3.end.x + normalVector.x * frameOffset,
        y: xo3.end.y + normalVector.y * frameOffset,
      },
      {
        color: doorColor,
        width: ne2 ? 5 : 4,
        cap: "butt",
      },
    );
    const doorSpanForRoller = distance2(xo3.start, xo3.end),
      rollerSlatCount = Math.max(3, Math.min(18, Math.round(doorRecord.width / 0.35)));
    for (let slatIndex = 1; slatIndex < rollerSlatCount; slatIndex += 1) {
      const slatCenterOffset = doorSpanForRoller * (slatIndex / rollerSlatCount - 0.5),
        slatCenterPoint = {
          x: xo3.center.x + xo3.unit.x * slatCenterOffset + normalVector.x * frameOffset,
          y: xo3.center.y + xo3.unit.y * slatCenterOffset + normalVector.y * frameOffset,
        };
      drawGuideSegment(
        {
          x: slatCenterPoint.x - (normalVector.x * 3) / planView.zoom,
          y: slatCenterPoint.y - (normalVector.y * 3) / planView.zoom,
        },
        {
          x: slatCenterPoint.x + (normalVector.x * 3) / planView.zoom,
          y: slatCenterPoint.y + (normalVector.y * 3) / planView.zoom,
        },
        {
          color: "rgba(167, 178, 188, .72)",
          width: 1,
          cap: "butt",
        },
      );
    }
    ne2 && drawLabelText(xo3.center, "卷帘门 · " + doorRecord.width.toFixed(2) + " m", "#ffaf46");
    return;
  }
  if (doorTypeName === "entry") {
    const rollerNormalVector = {
        x: -xo3.unit.y,
        y: xo3.unit.x,
      },
      rollerFrameOffset = Math.max(
        2 / planView.zoom,
        xo3.wall.thickness * (getPixelsPerMeter() || 100) * 0.08,
      );
    (drawGuideSegment(
      {
        x: xo3.start.x + rollerNormalVector.x * rollerFrameOffset,
        y: xo3.start.y + rollerNormalVector.y * rollerFrameOffset,
      },
      {
        x: xo3.end.x + rollerNormalVector.x * rollerFrameOffset,
        y: xo3.end.y + rollerNormalVector.y * rollerFrameOffset,
      },
      {
        color: doorColor,
        width: doorView.preview ? 3 : ne2 ? 5 : 4,
        cap: "butt",
      },
    ),
      drawGuideSegment(
        {
          x: xo3.start.x - rollerNormalVector.x * rollerFrameOffset,
          y: xo3.start.y - rollerNormalVector.y * rollerFrameOffset,
        },
        {
          x: xo3.end.x - rollerNormalVector.x * rollerFrameOffset,
          y: xo3.end.y - rollerNormalVector.y * rollerFrameOffset,
        },
        {
          color: "rgba(167, 178, 188, .72)",
          width: 1,
          cap: "butt",
        },
      ));
    const hingeSign = doorRecord.hinge === "right" ? -1 : 1,


      handleFaceOffset =
        Math.max(
          (xo3.wall.thickness * (getPixelsPerMeter() || 100)) / 2,
          6 / planView.zoom,
        ) * (doorRecord.swing === -1 ? -1 : 1);
    (drawPointMarker(
      {
        x:
          xo3.center.x +
          xo3.unit.x * doorRecord.width * hingeSign * 0.34 +
          rollerNormalVector.x * handleFaceOffset,
        y:
          xo3.center.y +
          xo3.unit.y * doorRecord.width * hingeSign * 0.34 +
          rollerNormalVector.y * handleFaceOffset,
      },
      doorColor,
      ne2 ? 3 : 2,
    ),
      ne2 &&
        drawLabelText(
          xo3.center,
          "入户门（常闭）· " + doorRecord.width.toFixed(2) + " m",
          "#ffaf46",
        ));
    return;
  }
  if (doorTypeName === "double") {
    const swingNormalVector = {
        x: -xo3.unit.y,
        y: xo3.unit.x,
      },
      swingDirection = doorRecord.swing === -1 ? -1 : 1,
      swingRadius = (distance2(xo3.start, xo3.end) / 2) * swingDirection,
      swingStartPoint = {
        x: xo3.start.x + swingNormalVector.x * swingRadius,
        y: xo3.start.y + swingNormalVector.y * swingRadius,
      },
      swingEndPoint = {
        x: xo3.end.x + swingNormalVector.x * swingRadius,
        y: xo3.end.y + swingNormalVector.y * swingRadius,
      };
    (drawGuideSegment(xo3.start, swingStartPoint, {
      color: doorColor,
      width: doorView.preview ? 2 : ne2 ? 4 : 3,
      cap: "butt",
    }),
      drawGuideSegment(xo3.end, swingEndPoint, {
        color: doorColor,
        width: doorView.preview ? 2 : ne2 ? 4 : 3,
        cap: "butt",
      }),
      drawPointMarker(xo3.start, doorColor, ne2 ? 3.5 : 2.5),
      drawPointMarker(xo3.end, doorColor, ne2 ? 3.5 : 2.5),
      ne2 &&
        drawLabelText(xo3.center, "双开门 · " + doorRecord.width.toFixed(2) + " m", "#ffaf46"));
    return;
  }
  const isHingeRight = doorRecord.hinge === "right",
    end = isHingeRight ? xo3.end : xo3.start,
    start2 = isHingeRight ? xo3.start : xo3.end,
    hingeAxisVector = {
      x: start2.x - end.x,
      y: start2.y - end.y,
    },
    swingSign = doorRecord.swing === -1 ? -1 : 1,
    arcStartPoint = {
      x: end.x - hingeAxisVector.y * swingSign,
      y: end.y + hingeAxisVector.x * swingSign,
    };
  if (
    (drawGuideSegment(end, arcStartPoint, {
      color: doorColor,
      width: doorView.preview ? 2 : ne2 ? 4 : 3,
      cap: "butt",
      dash: doorView.preview ? [5, 4] : null!,
    }),
    doorTypeName === "glass")
  ) {
    const arcRadiusVector = {
      x: (xo3.unit.x * 3) / planView.zoom,
      y: (xo3.unit.y * 3) / planView.zoom,
    };
    drawGuideSegment(
      {
        x: end.x + arcRadiusVector.x,
        y: end.y + arcRadiusVector.y,
      },
      {
        x: arcStartPoint.x + arcRadiusVector.x,
        y: arcStartPoint.y + arcRadiusVector.y,
      },
      {
        color: "rgba(183, 229, 247, .58)",
        width: 1,
        cap: "butt",
      },
    );
  }
  const zr2 = planToScreen(end),
    arcScreenRadius = distance2(end, start2) * planView.zoom,
    arcStartAngle = Math.atan2(hingeAxisVector.y, hingeAxisVector.x),
    arcEndAngle = arcStartAngle + (swingSign * Math.PI) / 2;
  (planCanvasRenderer.save(),
    (planCanvasRenderer.strokeStyle = doorColor),
    (planCanvasRenderer.lineWidth = doorView.preview ? 1 : ne2 ? 2 : 1.25),
    doorView.preview && planCanvasRenderer.setLineDash([5, 4]),
    planCanvasRenderer.beginPath(),
    planCanvasRenderer.arc(
      zr2.x,
      zr2.y,
      arcScreenRadius,
      arcStartAngle,
      arcEndAngle,
      swingSign < 0,
    ),
    planCanvasRenderer.stroke(),
    planCanvasRenderer.restore(),
    drawPointMarker(end, doorColor, ne2 ? 3.5 : 2.5),
    ne2 &&
      drawLabelText(
        xo3.center,
        "" + (doorTypeName === "glass" ? "玻璃门 · " : "") + doorRecord.width.toFixed(2) + " m",
        "#ffaf46",
      ));
}

export function drawCourtyardArea(deps: StudioPlanItemDrawingDeps, planItem: any) {
  const {
    planCanvasRenderer,
    planView,
    getPixelsPerMeter,
    createSelectionRef,
    planToScreen,
    planPainter,
    isLampEnabled,
    planLabelAccentColor,
  } = deps;
  if (isCourtyardDrawing2(planItem)) {
    planPainter?.drawItem(planItem, planCanvasRenderer);
    return;
  }
  const zr3 = planToScreen(planItem),
    itemFootprint2 = itemPlanFootprint2(planItem),
    itemPixelWidth = itemFootprint2.width * getPixelsPerMeter() * planView.zoom,
    itemPixelDepth = itemFootprint2.depth * getPixelsPerMeter() * planView.zoom,
    pillarShape = normalizePillarShape2(planItem.pillarShape),
    planPillarInset = Math.min(itemPixelWidth, itemPixelDepth) * 0.18,
    ne3 = createSelectionRef("item", planItem.id);
  (planCanvasRenderer.save(),
    planCanvasRenderer.translate(zr3.x, zr3.y),
    planCanvasRenderer.rotate((planItem.rotation * Math.PI) / 180));
  const color = isCourtyardPlanItem2(planItem)
    ? courtyardPlanColor2(planItem, itemTypeCatalog)
    : planItem.color;
  if (
    ((planCanvasRenderer.fillStyle = color + "c7"),
    (planCanvasRenderer.strokeStyle = ne3 ? "#ff9d2e" : "rgba(234, 240, 244, .72)"),
    (planCanvasRenderer.lineWidth = ne3 ? 2 : 1),
    planItem.type === "flooropening")
  )
    ((planCanvasRenderer.fillStyle = "rgba(9, 17, 25, .55)"),
      planCanvasRenderer.fillRect(
        -itemPixelWidth / 2,
        -itemPixelDepth / 2,
        itemPixelWidth,
        itemPixelDepth,
      ),
      planCanvasRenderer.setLineDash([6, 4]),
      planCanvasRenderer.strokeRect(
        -itemPixelWidth / 2,
        -itemPixelDepth / 2,
        itemPixelWidth,
        itemPixelDepth,
      ),
      planCanvasRenderer.setLineDash([]),
      planCanvasRenderer.beginPath(),
      planCanvasRenderer.moveTo(-itemPixelWidth / 2, -itemPixelDepth / 2),
      planCanvasRenderer.lineTo(itemPixelWidth / 2, itemPixelDepth / 2),
      planCanvasRenderer.moveTo(itemPixelWidth / 2, -itemPixelDepth / 2),
      planCanvasRenderer.lineTo(-itemPixelWidth / 2, itemPixelDepth / 2),
      planCanvasRenderer.stroke(),
      (planCanvasRenderer.fillStyle = "#ffd39c"),
      (planCanvasRenderer.font = "12px sans-serif"),
      (planCanvasRenderer.textAlign = "center"),
      planCanvasRenderer.fillText("楼板洞口", 0, 4));
  else {
    if (lampItemTypeSet.has(planItem.type)) {
      const lampGlyphRadius = Math.max(
          Math.min(itemPixelWidth, itemPixelDepth) * 0.44,
          planItem.type === "downlight" ? 10 : 8,
        ),
        lampColorHex =
          "#" + kelvinToRgbHex2(planItem.lightTemperature).toString(16).padStart(6, "0"),
        eu2 = isLampEnabled(planItem);
      if (
        ((planCanvasRenderer.fillStyle = eu2 ? lampColorHex : "#68737d"),
        (planCanvasRenderer.strokeStyle = eu2
          ? "rgba(255, 221, 163, .88)"
          : "rgba(196, 207, 216, .48)"),
        (planCanvasRenderer.lineWidth = 1.2),
        planItem.type === "striplight" &&
        !stripIsStanding2(planItem))
      ) {
        planCanvasRenderer.beginPath();
        const lampBodyRadius = Math.min(7, itemPixelDepth * 0.42);
        (planCanvasRenderer.roundRect(
          -itemPixelWidth / 2,
          -itemPixelDepth * 0.34,
          itemPixelWidth,
          itemPixelDepth * 0.68,
          lampBodyRadius,
        ),
          planCanvasRenderer.fill(),
          planCanvasRenderer.stroke(),
          (planCanvasRenderer.strokeStyle = eu2
            ? "rgba(255, 238, 195, .95)"
            : "rgba(196, 207, 216, .42)"),
          (planCanvasRenderer.lineWidth = Math.max(2, itemPixelDepth * 0.12)),
          planCanvasRenderer.beginPath(),
          planCanvasRenderer.moveTo(-itemPixelWidth * 0.42, 0),
          planCanvasRenderer.lineTo(itemPixelWidth * 0.42, 0),
          planCanvasRenderer.stroke());
      } else {
        if (planItem.type === "striplight") {

          const standingStripInset = Math.min(itemPixelWidth, itemPixelDepth) * 0.3;
          (planCanvasRenderer.beginPath(),
            planCanvasRenderer.rect(
              -itemPixelWidth / 2,
              -itemPixelDepth / 2,
              itemPixelWidth,
              itemPixelDepth,
            ),
            planCanvasRenderer.fill(),
            planCanvasRenderer.stroke(),
            (planCanvasRenderer.strokeStyle = eu2
              ? "rgba(255, 193, 116, .95)"
              : "rgba(25, 34, 43, .5)"),
            (planCanvasRenderer.lineWidth = 1),
            planCanvasRenderer.beginPath(),
            planCanvasRenderer.rect(
              -itemPixelWidth / 2 + standingStripInset,
              -itemPixelDepth / 2 + standingStripInset,
              Math.max(itemPixelWidth - standingStripInset * 2, 0.6),
              Math.max(itemPixelDepth - standingStripInset * 2, 0.6),
            ),
            planCanvasRenderer.stroke());
        } else if (planItem.type === "ceilinglight") {
          const lampSquareSize = Math.max(Math.min(itemPixelWidth, itemPixelDepth) * 0.82, 16);
          (planCanvasRenderer.beginPath(),
            planCanvasRenderer.rect(
              -lampSquareSize / 2,
              -lampSquareSize / 2,
              lampSquareSize,
              lampSquareSize,
            ),
            planCanvasRenderer.fill(),
            planCanvasRenderer.stroke());
          const lampInnerSize = lampSquareSize * 0.58;
          planCanvasRenderer.strokeRect(
            -lampInnerSize / 2,
            -lampInnerSize / 2,
            lampInnerSize,
            lampInnerSize,
          );
        } else {
          (planCanvasRenderer.beginPath(),
            planCanvasRenderer.arc(0, 0, lampGlyphRadius, 0, Math.PI * 2),
            planCanvasRenderer.fill(),
            planCanvasRenderer.stroke(),
            planCanvasRenderer.beginPath(),
            planCanvasRenderer.arc(0, 0, lampGlyphRadius * 0.5, 0, Math.PI * 2),
            planCanvasRenderer.stroke());
          for (let rayIndex = 0; rayIndex < 4; rayIndex += 1) {
            const rayAngle = (rayIndex * Math.PI) / 2;
            (planCanvasRenderer.beginPath(),
              planCanvasRenderer.moveTo(
                Math.cos(rayAngle) * lampGlyphRadius * 0.68,
                Math.sin(rayAngle) * lampGlyphRadius * 0.68,
              ),
              planCanvasRenderer.lineTo(
                Math.cos(rayAngle) * lampGlyphRadius * 1.12,
                Math.sin(rayAngle) * lampGlyphRadius * 1.12,
              ),
              planCanvasRenderer.stroke());
          }
        }
      }
    } else {
      if (planItem.type === "planlabel") {
        const labelMetrics = planLabelProjectionMetrics2(
          itemPixelWidth,
          itemPixelDepth,
          planItem.lineLength,
        );
        planCanvasRenderer.fillStyle = normalizePlanLabelColor(planItem.labelColor);
        const titleFontSize = labelMetrics.titleFontSize;
        ((planCanvasRenderer.font = "700 " + titleFontSize + "px sans-serif"),
          drawTrackedText2(
            planCanvasRenderer,
            planItem.title || "家庭总览",
            labelMetrics.titleStartX,
            labelMetrics.titleY,
            titleFontSize * clamp2(finite2(planItem.titleSpacing, 1.05), 0, 1.8),
            labelMetrics.titleMaxWidth,
          ));
        const iconX = labelMetrics.iconX,
          iconY = labelMetrics.iconY,
          iconSize = labelMetrics.iconSize;
        ((planCanvasRenderer.fillStyle = normalizePlanLabelColor(planItem.labelColor)),
          planCanvasRenderer.beginPath(),
          planCanvasRenderer.moveTo(iconX, iconY - iconSize * 0.58),
          planCanvasRenderer.lineTo(iconX + iconSize * 0.56, iconY - iconSize * 0.02),
          planCanvasRenderer.lineTo(iconX + iconSize * 0.38, iconY - iconSize * 0.02),
          planCanvasRenderer.lineTo(iconX + iconSize * 0.38, iconY + iconSize * 0.5),
          planCanvasRenderer.lineTo(iconX - iconSize * 0.38, iconY + iconSize * 0.5),
          planCanvasRenderer.lineTo(iconX - iconSize * 0.38, iconY - iconSize * 0.02),
          planCanvasRenderer.lineTo(iconX - iconSize * 0.56, iconY - iconSize * 0.02),
          planCanvasRenderer.lineTo(iconX, iconY - iconSize * 0.52),
          planCanvasRenderer.closePath(),
          planCanvasRenderer.fill(),
          (planCanvasRenderer.fillStyle = normalizePlanLabelColor(planItem.labelColor)),
          (planCanvasRenderer.textAlign = "left"));
        const subtitleFontSize = labelMetrics.subtitleFontSize;
        ((planCanvasRenderer.font =
          "400 " + subtitleFontSize + 'px "Arial Narrow", Arial, sans-serif'),
          drawTrackedText2(
            planCanvasRenderer,
            planItem.subtitle || "HOME PLAN",
            labelMetrics.subtitleStartX,
            labelMetrics.subtitleY,
            subtitleFontSize * clamp2(finite2(planItem.subtitleSpacing, 0.08), 0, 0.6),
            labelMetrics.subtitleMaxWidth,
          ),
          (planCanvasRenderer.strokeStyle = planLabelAccentColor(planItem.labelColor)),
          (planCanvasRenderer.lineWidth = labelMetrics.baselineLineWidth));
        const baselineY = labelMetrics.baselineY,
          baselineStartX = labelMetrics.baselineStartX,
          baselineEndX = baselineStartX + labelMetrics.baselineLength;
        (planCanvasRenderer.beginPath(),
          planCanvasRenderer.moveTo(baselineStartX, baselineY),
          planCanvasRenderer.lineTo(baselineEndX, baselineY),
          planCanvasRenderer.moveTo(baselineStartX, baselineY - labelMetrics.baselineCapHalfHeight),
          planCanvasRenderer.lineTo(baselineStartX, baselineY + labelMetrics.baselineCapHalfHeight),
          planCanvasRenderer.moveTo(baselineEndX, baselineY - labelMetrics.baselineCapHalfHeight),
          planCanvasRenderer.lineTo(baselineEndX, baselineY + labelMetrics.baselineCapHalfHeight),
          planCanvasRenderer.stroke());
      } else {
        if (["smallcar", "suv", "scooter"].includes(planItem.type)) {
          const itemCornerRadius = Math.min(itemPixelWidth * 0.22, itemPixelDepth * 0.08);
          if (planItem.chargingEnabled === true) {
            (planCanvasRenderer.save(),
              planCanvasRenderer.scale(itemPixelWidth * 0.76, itemPixelDepth * 0.62));
            const radialGradient = planCanvasRenderer.createRadialGradient(0, 0, 0, 0, 0, 1);
            (radialGradient.addColorStop(0, "rgba(79, 239, 183, .32)"),
              radialGradient.addColorStop(0.48, "rgba(79, 239, 183, .17)"),
              radialGradient.addColorStop(1, "rgba(79, 239, 183, 0)"),
              (planCanvasRenderer.fillStyle = radialGradient),
              planCanvasRenderer.beginPath(),
              planCanvasRenderer.arc(0, 0, 1, 0, Math.PI * 2),
              planCanvasRenderer.fill(),
              planCanvasRenderer.restore(),
              (planCanvasRenderer.fillStyle = "rgba(79, 239, 183, .24)"));
            const lampDotSpacing = Math.max(9, Math.min(itemPixelWidth, itemPixelDepth) * 0.07);
            for (
              let dotX = -itemPixelWidth * 0.62;
              dotX <= itemPixelWidth * 0.62;
              dotX += lampDotSpacing
            )
              for (
                let dotY = -itemPixelDepth * 0.54;
                dotY <= itemPixelDepth * 0.54;
                dotY += lampDotSpacing
              ) {
                const hypot2 = Math.hypot(
                  dotX / (itemPixelWidth * 0.62),
                  dotY / (itemPixelDepth * 0.54),
                );
                hypot2 >= 1 ||
                  ((planCanvasRenderer.globalAlpha = (1 - hypot2) * 0.72),
                  planCanvasRenderer.beginPath(),
                  planCanvasRenderer.arc(
                    dotX,
                    dotY,
                    Math.max(0.7, lampDotSpacing * 0.1),
                    0,
                    Math.PI * 2,
                  ),
                  planCanvasRenderer.fill());
              }
            ((planCanvasRenderer.globalAlpha = 1),
              (planCanvasRenderer.fillStyle = planItem.color + "c7"));
          }
          (planCanvasRenderer.beginPath(),
            planCanvasRenderer.roundRect(
              -itemPixelWidth * 0.48,
              -itemPixelDepth * 0.49,
              itemPixelWidth * 0.96,
              itemPixelDepth * 0.98,
              itemCornerRadius,
            ),
            planCanvasRenderer.fill(),
            planCanvasRenderer.stroke(),
            (planCanvasRenderer.fillStyle = "rgba(38, 48, 57, .72)"),
            planCanvasRenderer.beginPath(),
            planCanvasRenderer.roundRect(
              -itemPixelWidth * 0.38,
              -itemPixelDepth * 0.2,
              itemPixelWidth * 0.76,
              itemPixelDepth * 0.42,
              itemCornerRadius * 0.7,
            ),
            planCanvasRenderer.fill());
          for (const handleX of [-0.5, 0.5])
            for (const handleY of [-0.3, 0.3])
              planCanvasRenderer.fillRect(
                handleX * itemPixelWidth - itemPixelWidth * 0.045,
                handleY * itemPixelDepth - itemPixelDepth * 0.085,
                itemPixelWidth * 0.09,
                itemPixelDepth * 0.17,
              );
          planItem.chargingEnabled === true &&
            ((planCanvasRenderer.fillStyle = "#7dffd0"),
            planCanvasRenderer.beginPath(),
            planCanvasRenderer.moveTo(itemPixelWidth * 0.028, -itemPixelDepth * 0.095),
            planCanvasRenderer.lineTo(-itemPixelWidth * 0.058, itemPixelDepth * 0.008),
            planCanvasRenderer.lineTo(itemPixelWidth * 0.006, itemPixelDepth * 0.008),
            planCanvasRenderer.lineTo(-itemPixelWidth * 0.028, itemPixelDepth * 0.095),
            planCanvasRenderer.lineTo(itemPixelWidth * 0.07, -itemPixelDepth * 0.02),
            planCanvasRenderer.lineTo(itemPixelWidth * 0.008, -itemPixelDepth * 0.02),
            planCanvasRenderer.closePath(),
            planCanvasRenderer.fill());
        } else {
          if (
            planItem.type === "curtain" &&
            planItem.curtainTrack &&
            planItem.curtainForm !== "roller"
          ) {
            const curtainTrackPath = createCurtainTrack2(planItem),
              curtainPixelScale = itemPixelWidth / planItem.width,
              strokeCurtainSegment = (segmentStartT: any, segmentEndT: any, strokeWidth: any, strokeColor: any) => {
                (planCanvasRenderer.beginPath(),
                  (planCanvasRenderer.lineWidth = strokeWidth),
                  (planCanvasRenderer.strokeStyle = strokeColor));
                const sampleCount = Math.max(16, Math.ceil((segmentEndT - segmentStartT) * 30));
                for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex++) {
                  const sample = curtainTrackPath.sample(
                    segmentStartT + ((segmentEndT - segmentStartT) * sampleIndex) / sampleCount,
                  );
                  sampleIndex
                    ? planCanvasRenderer.lineTo(
                        sample.x * curtainPixelScale,
                        sample.z * curtainPixelScale,
                      )
                    : planCanvasRenderer.moveTo(
                        sample.x * curtainPixelScale,
                        sample.z * curtainPixelScale,
                      );
                }
                planCanvasRenderer.stroke();
              };
            strokeCurtainSegment(
              0,
              curtainTrackPath.length,
              ne3 ? 2 : 1.5,
              ne3 ? "#ff9d2e" : "#b6c0ca",
            );
            for (const trackHandle of curtainPanelRanges2(
              curtainTrackPath,
              curtainTrackPath.curtainPreview,
              planItem.curtainPosition || "split",
            ))
              trackHandle.visible &&
                strokeCurtainSegment(
                  trackHandle.start,
                  trackHandle.end,
                  Math.max(3, 0.09 * curtainPixelScale),
                  planItem.color,
                );
          } else {
            if (planItem.type === "curtain" && planItem.curtainForm === "roller") {
              const curtainOpenRatio =
                Math.max(0, Math.min(100, Number(planItem.curtainPreview) || 0)) / 100;
              ((planCanvasRenderer.fillStyle = ne3 ? "#ff9d2e" : "#b6c0ca"),
                planCanvasRenderer.fillRect(
                  -itemPixelWidth * 0.5,
                  -itemPixelDepth * 0.42,
                  itemPixelWidth,
                  Math.max(itemPixelDepth * 0.08, itemPixelDepth * 0.7 * (1 - curtainOpenRatio)),
                ),
                (planCanvasRenderer.fillStyle = planItem.color),
                planCanvasRenderer.fillRect(
                  -itemPixelWidth * 0.5,
                  -itemPixelDepth * 0.38,
                  itemPixelWidth,
                  Math.max(itemPixelDepth * 0.05, itemPixelDepth * 0.62 * (1 - curtainOpenRatio)),
                ));
            } else {
              if (planItem.type === "curtain") {
                const curtainPosition = ["left", "right", "split"].includes(
                    planItem.curtainPosition,
                  )
                    ? planItem.curtainPosition
                    : "split",
                  drawSlatGroup = (slatX: any, slatWidth: any) => {
                    (planCanvasRenderer.beginPath(),
                      planCanvasRenderer.roundRect(
                        slatX,
                        -itemPixelDepth * 0.46,
                        slatWidth,
                        itemPixelDepth * 0.92,
                        Math.min(itemPixelDepth * 0.32, slatWidth * 0.18),
                      ),
                      planCanvasRenderer.fill(),
                      planCanvasRenderer.stroke(),
                      (planCanvasRenderer.strokeStyle = "rgba(25, 34, 43, .48)"),
                      (planCanvasRenderer.lineWidth = 1));
                    for (let slatLineIndex = 1; slatLineIndex < 5; slatLineIndex += 1) {
                      const slatLineX = slatX + (slatWidth * slatLineIndex) / 5;
                      (planCanvasRenderer.beginPath(),
                        planCanvasRenderer.moveTo(slatLineX, -itemPixelDepth * 0.34),
                        planCanvasRenderer.lineTo(slatLineX, itemPixelDepth * 0.34),
                        planCanvasRenderer.stroke());
                    }
                  };
                ((planCanvasRenderer.strokeStyle = ne3 ? "#ff9d2e" : "rgba(234, 240, 244, .72)"),
                  (planCanvasRenderer.lineWidth = ne3 ? 2 : 1.5),
                  planCanvasRenderer.beginPath(),
                  planCanvasRenderer.moveTo(-itemPixelWidth * 0.5, 0),
                  planCanvasRenderer.lineTo(itemPixelWidth * 0.5, 0),
                  planCanvasRenderer.stroke(),
                  curtainPosition === "left"
                    ? drawSlatGroup(-itemPixelWidth * 0.5, itemPixelWidth * 0.24)
                    : curtainPosition === "right"
                      ? drawSlatGroup(itemPixelWidth * 0.26, itemPixelWidth * 0.24)
                      : (drawSlatGroup(-itemPixelWidth * 0.5, itemPixelWidth * 0.16),
                        drawSlatGroup(itemPixelWidth * 0.34, itemPixelWidth * 0.16)));
              } else {
                if (planItem.type === "pillar")
                  (pillarIsLying2(planItem)
                    ?
                      (planCanvasRenderer.beginPath(),
                      planCanvasRenderer.rect(
                        -itemPixelWidth / 2,
                        -itemPixelDepth / 2,
                        itemPixelWidth,
                        itemPixelDepth,
                      ),
                      planCanvasRenderer.fill(),
                      planCanvasRenderer.stroke(),
                      (planCanvasRenderer.strokeStyle = ne3
                        ? "rgba(255, 193, 116, .95)"
                        : "rgba(25, 34, 43, .5)"),
                      (planCanvasRenderer.lineWidth = 1),
                      planCanvasRenderer.beginPath(),
                      planCanvasRenderer.rect(
                        -itemPixelWidth / 2 + planPillarInset,
                        -itemPixelDepth / 2 + planPillarInset,
                        itemPixelWidth - planPillarInset * 2,
                        itemPixelDepth - planPillarInset * 2,
                      ),
                      planCanvasRenderer.stroke())
                    : (tracePillarPlanPath2(
                        planCanvasRenderer,
                        pillarShape,
                        itemPixelWidth,
                        itemPixelDepth,
                      ),
                      planCanvasRenderer.fill(),
                      planCanvasRenderer.stroke(),
                      (planCanvasRenderer.strokeStyle = ne3
                        ? "rgba(255, 193, 116, .95)"
                        : "rgba(25, 34, 43, .5)"),
                      (planCanvasRenderer.lineWidth = 1),
                      tracePillarPlanPath2(
                        planCanvasRenderer,
                        pillarShape,
                        itemPixelWidth * 0.72,
                        itemPixelDepth * 0.72,
                      ),
                      planCanvasRenderer.stroke()));
                else {
                  if (planItem.type === "bar") {
                    (planCanvasRenderer.beginPath(),
                      planCanvasRenderer.roundRect(
                        -itemPixelWidth / 2,
                        -itemPixelDepth / 2,
                        itemPixelWidth,
                        itemPixelDepth,
                        Math.min(5, itemPixelDepth * 0.16),
                      ),
                      planCanvasRenderer.fill(),
                      planCanvasRenderer.stroke(),
                      planCanvasRenderer.beginPath(),
                      planCanvasRenderer.moveTo(-itemPixelWidth * 0.44, -itemPixelDepth * 0.18),
                      planCanvasRenderer.lineTo(itemPixelWidth * 0.44, -itemPixelDepth * 0.18),
                      planCanvasRenderer.stroke());
                    for (const sideDotOffset of [-0.28, 0, 0.28])
                      (planCanvasRenderer.beginPath(),
                        planCanvasRenderer.arc(
                          itemPixelWidth * sideDotOffset,
                          itemPixelDepth * 0.38,
                          Math.max(2, itemPixelDepth * 0.12),
                          0,
                          Math.PI * 2,
                        ),
                        planCanvasRenderer.stroke());
                  } else {
                    if (planItem.type === "aquarium") {
                      ((planCanvasRenderer.fillStyle = "rgba(92, 174, 202, .25)"),
                        (planCanvasRenderer.strokeStyle = ne3
                          ? "#ff9d2e"
                          : "rgba(178, 225, 238, .9)"),
                        planCanvasRenderer.beginPath(),
                        planCanvasRenderer.rect(
                          -itemPixelWidth / 2,
                          -itemPixelDepth / 2,
                          itemPixelWidth,
                          itemPixelDepth,
                        ),
                        planCanvasRenderer.fill(),
                        planCanvasRenderer.stroke(),
                        planCanvasRenderer.strokeRect(
                          -itemPixelWidth * 0.43,
                          -itemPixelDepth * 0.34,
                          itemPixelWidth * 0.86,
                          itemPixelDepth * 0.68,
                        ));
                      for (const edgeDotOffset of [-0.25, 0.18])
                        (planCanvasRenderer.beginPath(),
                          planCanvasRenderer.arc(
                            itemPixelWidth * edgeDotOffset,
                            itemPixelDepth * (edgeDotOffset > 0 ? 0.08 : -0.06),
                            Math.max(2, itemPixelDepth * 0.08),
                            0,
                            Math.PI * 2,
                          ),
                          planCanvasRenderer.stroke());
                    } else {
                      if (planItem.type === "coffeetable") {


                        const coffeeTableBaseLengthRatio = 1.72 / 1.9,
                          coffeeTableBaseOffsetRatio = 0.09 / 1.9,
                          coffeeTableTopLengthRatio = 1.0 / 1.9,
                          coffeeTableTopOffsetRatio = -0.45 / 1.9,
                          coffeeTableTopDepthRatio = 0.85 / 1.05,
                          coffeeTableCornerRadiusPx = Math.min(itemPixelWidth, itemPixelDepth) * 0.02;

                        (planCanvasRenderer.beginPath(),
                          planCanvasRenderer.roundRect(
                            (-coffeeTableBaseLengthRatio / 2 + coffeeTableBaseOffsetRatio) *
                              itemPixelWidth,
                            -itemPixelDepth / 2,
                            coffeeTableBaseLengthRatio * itemPixelWidth,
                            itemPixelDepth,
                            coffeeTableCornerRadiusPx,
                          ),
                          planCanvasRenderer.fill(),
                          planCanvasRenderer.stroke(),
                          planCanvasRenderer.beginPath(),
                          planCanvasRenderer.roundRect(
                            (-coffeeTableTopLengthRatio / 2 + coffeeTableTopOffsetRatio) *
                              itemPixelWidth,
                            (-coffeeTableTopDepthRatio / 2) * itemPixelDepth,
                            coffeeTableTopLengthRatio * itemPixelWidth,
                            coffeeTableTopDepthRatio * itemPixelDepth,
                            coffeeTableCornerRadiusPx,
                          ),
                          planCanvasRenderer.fill(),
                          planCanvasRenderer.stroke());
                      } else {
                        if (roundTableTypeSet.has(planItem.type)) {
                          (planCanvasRenderer.beginPath(),
                            planCanvasRenderer.ellipse(
                              0,
                              0,
                              itemPixelWidth * 0.32,
                              itemPixelDepth * 0.32,
                              0,
                              0,
                              Math.PI * 2,
                            ),
                            planCanvasRenderer.fill(),
                            planCanvasRenderer.stroke());
                          for (const [handleDotX, handleDotY] of [
                            [-0.38, 0],
                            [0.38, 0],
                            [0, -0.38],
                            [0, 0.38],
                          ])
                            (planCanvasRenderer.beginPath(),
                              planCanvasRenderer.roundRect(
                                itemPixelWidth * handleDotX - itemPixelWidth * 0.085,
                                itemPixelDepth * handleDotY - itemPixelDepth * 0.095,
                                itemPixelWidth * 0.17,
                                itemPixelDepth * 0.19,
                                Math.min(itemPixelWidth, itemPixelDepth) * 0.035,
                              ),
                              planCanvasRenderer.fill(),
                              planCanvasRenderer.stroke());
                          isTurntableRoundTable(planItem) &&
                            (planCanvasRenderer.beginPath(),
                            planCanvasRenderer.ellipse(
                              0,
                              0,
                              itemPixelWidth * 0.27,
                              itemPixelDepth * 0.27,
                              0,
                              0,
                              Math.PI * 2,
                            ),
                            planCanvasRenderer.fill(),
                            planCanvasRenderer.stroke());
                        } else {
                          if (planItem.type === "squarecoffeetable") {
                            (planCanvasRenderer.beginPath(),
                              planCanvasRenderer.roundRect(
                                -itemPixelWidth * 0.47,
                                -itemPixelDepth * 0.47,
                                itemPixelWidth * 0.94,
                                itemPixelDepth * 0.94,
                                Math.min(itemPixelWidth, itemPixelDepth) * 0.08,
                              ),
                              planCanvasRenderer.fill(),
                              planCanvasRenderer.stroke(),
                              planCanvasRenderer.strokeRect(
                                -itemPixelWidth * 0.33,
                                -itemPixelDepth * 0.38,
                                itemPixelWidth * 0.66,
                                itemPixelDepth * 0.76,
                              ),
                              planCanvasRenderer.beginPath(),
                              planCanvasRenderer.moveTo(
                                -itemPixelWidth * 0.08,
                                -itemPixelDepth * 0.38,
                              ),
                              planCanvasRenderer.lineTo(
                                -itemPixelWidth * 0.08,
                                itemPixelDepth * 0.38,
                              ),
                              planCanvasRenderer.moveTo(
                                itemPixelWidth * 0.08,
                                -itemPixelDepth * 0.38,
                              ),
                              planCanvasRenderer.lineTo(
                                itemPixelWidth * 0.08,
                                itemPixelDepth * 0.38,
                              ),
                              planCanvasRenderer.stroke(),
                              (planCanvasRenderer.fillStyle = "rgba(25, 34, 43, .58)"));
                            for (const endpointX of [-0.39, 0.39])
                              for (const endpointY of [-0.34, 0.34])
                                (planCanvasRenderer.beginPath(),
                                  planCanvasRenderer.arc(
                                    itemPixelWidth * endpointX,
                                    itemPixelDepth * endpointY,
                                    Math.max(1.5, Math.min(itemPixelWidth, itemPixelDepth) * 0.045),
                                    0,
                                    Math.PI * 2,
                                  ),
                                  planCanvasRenderer.fill());
                          } else {
                            if (planItem.type === "floorlamp") {
                              const leftCircleX = -itemPixelWidth * 0.34,
                                rightCircleX = itemPixelWidth * 0.31,
                                leftCircleRadius = Math.min(
                                  itemPixelDepth * 0.34,
                                  itemPixelWidth * 0.13,
                                ),
                                rightCircleRadius = Math.min(
                                  itemPixelDepth * 0.46,
                                  itemPixelWidth * 0.14,
                                );
                              ((planCanvasRenderer.lineCap = "round"),
                                (planCanvasRenderer.lineWidth = ne3 ? 2.4 : 1.5),
                                planCanvasRenderer.beginPath(),
                                planCanvasRenderer.moveTo(leftCircleX, 0),
                                planCanvasRenderer.lineTo(rightCircleX, 0),
                                planCanvasRenderer.stroke(),
                                planCanvasRenderer.beginPath(),
                                planCanvasRenderer.arc(
                                  leftCircleX,
                                  0,
                                  leftCircleRadius,
                                  0,
                                  Math.PI * 2,
                                ),
                                planCanvasRenderer.fill(),
                                planCanvasRenderer.stroke(),
                                planCanvasRenderer.beginPath(),
                                planCanvasRenderer.arc(
                                  rightCircleX,
                                  0,
                                  rightCircleRadius,
                                  0,
                                  Math.PI * 2,
                                ),
                                planCanvasRenderer.fill(),
                                planCanvasRenderer.stroke());
                            } else {
                              if (planItem.type === "toilet")
                                (planCanvasRenderer.beginPath(),
                                  planCanvasRenderer.moveTo(
                                    -itemPixelWidth * 0.42,
                                    -itemPixelDepth * 0.42,
                                  ),
                                  planCanvasRenderer.lineTo(
                                    itemPixelWidth * 0.42,
                                    -itemPixelDepth * 0.42,
                                  ),
                                  planCanvasRenderer.bezierCurveTo(
                                    itemPixelWidth * 0.48,
                                    -itemPixelDepth * 0.08,
                                    itemPixelWidth * 0.48,
                                    itemPixelDepth * 0.28,
                                    0,
                                    itemPixelDepth * 0.48,
                                  ),
                                  planCanvasRenderer.bezierCurveTo(
                                    -itemPixelWidth * 0.48,
                                    itemPixelDepth * 0.28,
                                    -itemPixelWidth * 0.48,
                                    -itemPixelDepth * 0.08,
                                    -itemPixelWidth * 0.42,
                                    -itemPixelDepth * 0.42,
                                  ),
                                  planCanvasRenderer.closePath(),
                                  planCanvasRenderer.fill(),
                                  planCanvasRenderer.stroke());
                              else {
                                if (planItem.type === "squattoilet") {
                                  (planCanvasRenderer.beginPath(),
                                    planCanvasRenderer.roundRect(
                                      -itemPixelWidth / 2,
                                      -itemPixelDepth / 2,
                                      itemPixelWidth,
                                      itemPixelDepth,
                                      Math.min(itemPixelWidth, itemPixelDepth) * 0.12,
                                    ),
                                    planCanvasRenderer.fill(),
                                    planCanvasRenderer.stroke(),
                                    planCanvasRenderer.beginPath(),
                                    planCanvasRenderer.ellipse(
                                      0,
                                      itemPixelDepth * 0.04,
                                      itemPixelWidth * 0.18,
                                      itemPixelDepth * 0.31,
                                      0,
                                      0,
                                      Math.PI * 2,
                                    ),
                                    planCanvasRenderer.stroke());
                                  for (const fixtureOffsetX of [-1, 1])
                                    planCanvasRenderer.strokeRect(
                                      fixtureOffsetX * itemPixelWidth * 0.38 -
                                        itemPixelWidth * 0.07,
                                      -itemPixelDepth * 0.25,
                                      itemPixelWidth * 0.14,
                                      itemPixelDepth * 0.5,
                                    );
                                } else {
                                  if (planItem.type === "urinal")
                                    (planCanvasRenderer.beginPath(),
                                      planCanvasRenderer.roundRect(
                                        -itemPixelWidth * 0.38,
                                        -itemPixelDepth * 0.42,
                                        itemPixelWidth * 0.76,
                                        itemPixelDepth * 0.84,
                                        Math.min(itemPixelWidth, itemPixelDepth) * 0.28,
                                      ),
                                      planCanvasRenderer.fill(),
                                      planCanvasRenderer.stroke(),
                                      planCanvasRenderer.beginPath(),
                                      planCanvasRenderer.ellipse(
                                        0,
                                        itemPixelDepth * 0.04,
                                        itemPixelWidth * 0.2,
                                        itemPixelDepth * 0.28,
                                        0,
                                        0,
                                        Math.PI * 2,
                                      ),
                                      planCanvasRenderer.stroke());
                                  else {
                                    if (planItem.type === "bathtub")
                                      (planCanvasRenderer.beginPath(),
                                        planCanvasRenderer.roundRect(
                                          -itemPixelWidth * 0.48,
                                          -itemPixelDepth * 0.45,
                                          itemPixelWidth * 0.96,
                                          itemPixelDepth * 0.9,
                                          Math.min(itemPixelWidth, itemPixelDepth) * 0.36,
                                        ),
                                        planCanvasRenderer.fill(),
                                        planCanvasRenderer.stroke(),
                                        planCanvasRenderer.beginPath(),
                                        planCanvasRenderer.ellipse(
                                          0,
                                          0,
                                          itemPixelWidth * 0.34,
                                          itemPixelDepth * 0.29,
                                          0,
                                          0,
                                          Math.PI * 2,
                                        ),
                                        planCanvasRenderer.stroke());
                                    else {
                                      if (planItem.type === "walllamp")
                                        (planCanvasRenderer.beginPath(),
                                          planCanvasRenderer.arc(
                                            0,
                                            0,
                                            Math.min(itemPixelWidth, itemPixelDepth) * 0.36,
                                            0,
                                            Math.PI * 2,
                                          ),
                                          planCanvasRenderer.fill(),
                                          planCanvasRenderer.stroke(),
                                          planCanvasRenderer.beginPath(),
                                          planCanvasRenderer.moveTo(
                                            -itemPixelWidth * 0.42,
                                            itemPixelDepth * 0.38,
                                          ),
                                          planCanvasRenderer.lineTo(
                                            itemPixelWidth * 0.42,
                                            itemPixelDepth * 0.38,
                                          ),
                                          planCanvasRenderer.stroke());
                                      else {
                                        if (planItem.type === "glasspartition")
                                          ((planCanvasRenderer.fillStyle =
                                            "rgba(169, 197, 211, .2)"),
                                            (planCanvasRenderer.strokeStyle = ne3
                                              ? "#ff9d2e"
                                              : "rgba(183, 218, 231, .82)"),
                                            planCanvasRenderer.beginPath(),
                                            planCanvasRenderer.rect(
                                              -itemPixelWidth / 2,
                                              -itemPixelDepth / 2,
                                              itemPixelWidth,
                                              itemPixelDepth,
                                            ),
                                            planCanvasRenderer.fill(),
                                            planCanvasRenderer.stroke());
                                        else {
                                          if (planItem.type === "storagewaterheater")
                                            (planCanvasRenderer.beginPath(),
                                              planCanvasRenderer.ellipse(
                                                0,
                                                0,
                                                itemPixelWidth * 0.46,
                                                itemPixelDepth * 0.44,
                                                0,
                                                0,
                                                Math.PI * 2,
                                              ),
                                              planCanvasRenderer.fill(),
                                              planCanvasRenderer.stroke(),
                                              (planCanvasRenderer.fillStyle =
                                                "rgba(47, 58, 69, .82)"),
                                              planCanvasRenderer.beginPath(),
                                              planCanvasRenderer.roundRect(
                                                -itemPixelWidth * 0.2,
                                                -itemPixelDepth * 0.28,
                                                itemPixelWidth * 0.4,
                                                itemPixelDepth * 0.22,
                                                Math.min(itemPixelWidth, itemPixelDepth) * 0.08,
                                              ),
                                              planCanvasRenderer.fill(),
                                              (planCanvasRenderer.strokeStyle =
                                                "rgba(25, 34, 43, .5)"),
                                              planCanvasRenderer.beginPath(),
                                              planCanvasRenderer.moveTo(
                                                -itemPixelWidth * 0.3,
                                                itemPixelDepth * 0.36,
                                              ),
                                              planCanvasRenderer.lineTo(
                                                -itemPixelWidth * 0.3,
                                                itemPixelDepth * 0.52,
                                              ),
                                              planCanvasRenderer.moveTo(
                                                itemPixelWidth * 0.3,
                                                itemPixelDepth * 0.36,
                                              ),
                                              planCanvasRenderer.lineTo(
                                                itemPixelWidth * 0.3,
                                                itemPixelDepth * 0.52,
                                              ),
                                              planCanvasRenderer.stroke());
                                          else {
                                            if (planItem.type === "gaswaterheater")
                                              (planCanvasRenderer.beginPath(),
                                                planCanvasRenderer.roundRect(
                                                  -itemPixelWidth * 0.46,
                                                  -itemPixelDepth * 0.46,
                                                  itemPixelWidth * 0.92,
                                                  itemPixelDepth * 0.92,
                                                  Math.min(itemPixelWidth, itemPixelDepth) * 0.1,
                                                ),
                                                planCanvasRenderer.fill(),
                                                planCanvasRenderer.stroke(),
                                                (planCanvasRenderer.fillStyle =
                                                  "rgba(47, 58, 69, .82)"),
                                                planCanvasRenderer.fillRect(
                                                  -itemPixelWidth * 0.22,
                                                  -itemPixelDepth * 0.26,
                                                  itemPixelWidth * 0.44,
                                                  itemPixelDepth * 0.17,
                                                ),
                                                (planCanvasRenderer.strokeStyle =
                                                  "rgba(25, 34, 43, .5)"),
                                                planCanvasRenderer.beginPath(),
                                                planCanvasRenderer.moveTo(
                                                  -itemPixelWidth * 0.24,
                                                  itemPixelDepth * 0.44,
                                                ),
                                                planCanvasRenderer.lineTo(
                                                  -itemPixelWidth * 0.24,
                                                  itemPixelDepth * 0.58,
                                                ),
                                                planCanvasRenderer.moveTo(0, itemPixelDepth * 0.44),
                                                planCanvasRenderer.lineTo(0, itemPixelDepth * 0.58),
                                                planCanvasRenderer.moveTo(
                                                  itemPixelWidth * 0.24,
                                                  itemPixelDepth * 0.44,
                                                ),
                                                planCanvasRenderer.lineTo(
                                                  itemPixelWidth * 0.24,
                                                  itemPixelDepth * 0.58,
                                                ),
                                                planCanvasRenderer.stroke());
                                            else {
                                              if (
                                                PIPELINE_DISPENSER_PLAN_TYPES.has(planItem.type)
                                              ) {
                                                (planCanvasRenderer.beginPath(),
                                                  planCanvasRenderer.roundRect(
                                                    -itemPixelWidth * 0.46,
                                                    -itemPixelDepth * 0.46,
                                                    itemPixelWidth * 0.92,
                                                    itemPixelDepth * 0.92,
                                                    Math.min(itemPixelWidth, itemPixelDepth) * 0.08,
                                                  ),
                                                  planCanvasRenderer.fill(),
                                                  planCanvasRenderer.stroke(),
                                                  (planCanvasRenderer.fillStyle =
                                                    "rgba(31, 39, 45, .9)"),
                                                  planCanvasRenderer.beginPath(),
                                                  planCanvasRenderer.roundRect(
                                                    -itemPixelWidth * 0.4,
                                                    -itemPixelDepth * 0.35,
                                                    itemPixelWidth * 0.8,
                                                    itemPixelDepth * 0.28,
                                                    Math.min(itemPixelWidth, itemPixelDepth) * 0.05,
                                                  ),
                                                  planCanvasRenderer.fill(),
                                                  (planCanvasRenderer.strokeStyle =
                                                    "rgba(231, 235, 236, .74)"),
                                                  planCanvasRenderer.beginPath(),
                                                  planCanvasRenderer.moveTo(
                                                    -itemPixelWidth * 0.12,
                                                    -itemPixelDepth * 0.18,
                                                  ),
                                                  planCanvasRenderer.lineTo(
                                                    itemPixelWidth * 0.12,
                                                    -itemPixelDepth * 0.18,
                                                  ),
                                                  planCanvasRenderer.stroke(),
                                                  (planCanvasRenderer.fillStyle =
                                                    "rgba(47, 58, 69, .7)"));
                                                for (const fixtureScaleX of [-0.2, 0.2])
                                                  (planCanvasRenderer.beginPath(),
                                                    planCanvasRenderer.arc(
                                                      itemPixelWidth * fixtureScaleX,
                                                      itemPixelDepth * 0.18,
                                                      Math.max(
                                                        1.5,
                                                        Math.min(itemPixelWidth, itemPixelDepth) *
                                                          0.055,
                                                      ),
                                                      0,
                                                      Math.PI * 2,
                                                    ),
                                                    planCanvasRenderer.fill());
                                                ((planCanvasRenderer.strokeStyle =
                                                  "rgba(25, 34, 43, .5)"),
                                                  planCanvasRenderer.beginPath(),
                                                  planCanvasRenderer.moveTo(
                                                    -itemPixelWidth * 0.26,
                                                    itemPixelDepth * 0.36,
                                                  ),
                                                  planCanvasRenderer.lineTo(
                                                    -itemPixelWidth * 0.26,
                                                    itemPixelDepth * 0.5,
                                                  ),
                                                  planCanvasRenderer.moveTo(
                                                    itemPixelWidth * 0.26,
                                                    itemPixelDepth * 0.36,
                                                  ),
                                                  planCanvasRenderer.lineTo(
                                                    itemPixelWidth * 0.26,
                                                    itemPixelDepth * 0.5,
                                                  ),
                                                  planCanvasRenderer.stroke());
                                              } else {
                                                if (planItem.type === "tea_bar_machine")
                                                  (planCanvasRenderer.beginPath(),
                                                    planCanvasRenderer.rect(
                                                      -itemPixelWidth * 0.46,
                                                      -itemPixelDepth * 0.46,
                                                      itemPixelWidth * 0.92,
                                                      itemPixelDepth * 0.92,
                                                    ),
                                                    planCanvasRenderer.fill(),
                                                    planCanvasRenderer.stroke(),
                                                    (planCanvasRenderer.fillStyle =
                                                      "rgba(38, 44, 47, .86)"),
                                                    planCanvasRenderer.fillRect(
                                                      -itemPixelWidth * 0.38,
                                                      -itemPixelDepth * 0.36,
                                                      itemPixelWidth * 0.76,
                                                      itemPixelDepth * 0.2,
                                                    ),
                                                    (planCanvasRenderer.strokeStyle =
                                                      "rgba(25, 34, 43, .5)"),
                                                    planCanvasRenderer.beginPath(),
                                                    planCanvasRenderer.moveTo(
                                                      -itemPixelWidth * 0.46,
                                                      itemPixelDepth * 0.08,
                                                    ),
                                                    planCanvasRenderer.lineTo(
                                                      itemPixelWidth * 0.46,
                                                      itemPixelDepth * 0.08,
                                                    ),
                                                    planCanvasRenderer.moveTo(
                                                      -itemPixelWidth * 0.46,
                                                      itemPixelDepth * 0.3,
                                                    ),
                                                    planCanvasRenderer.lineTo(
                                                      itemPixelWidth * 0.46,
                                                      itemPixelDepth * 0.3,
                                                    ),
                                                    planCanvasRenderer.stroke());
                                                else {
                                                  if (
                                                    [
                                                      "dishwasher",
                                                      "steamoven",
                                                      "microwave",
                                                    ].includes(planItem.type)
                                                  )
                                                    (planCanvasRenderer.beginPath(),
                                                      planCanvasRenderer.rect(
                                                        -itemPixelWidth / 2,
                                                        -itemPixelDepth / 2,
                                                        itemPixelWidth,
                                                        itemPixelDepth,
                                                      ),
                                                      planCanvasRenderer.fill(),
                                                      planCanvasRenderer.stroke());
                                                  else {
                                                    if (planItem.type === "ricecooker")
                                                      (planCanvasRenderer.beginPath(),
                                                        planCanvasRenderer.ellipse(
                                                          0,
                                                          0,
                                                          itemPixelWidth * 0.46,
                                                          itemPixelDepth * 0.46,
                                                          0,
                                                          0,
                                                          Math.PI * 2,
                                                        ),
                                                        planCanvasRenderer.fill(),
                                                        planCanvasRenderer.stroke());
                                                    else {
                                                      if (planItem.type === "sofa-l") {
                                                        const chaiseSideSign =
                                                          planItem.sofaChaiseSide === "left"
                                                            ? -1
                                                            : 1;
                                                        (planCanvasRenderer.beginPath(),
                                                          [
                                                            [-0.5, -0.5],
                                                            [0.5, -0.5],
                                                            [0.5, 0.5],
                                                            [0.13, 0.5],
                                                            [0.13, 0.05],
                                                            [-0.5, 0.05],
                                                          ].forEach(
                                                            ([chaiseX, chaiseY], chaiseSide) => {
                                                              chaiseSide
                                                                ? planCanvasRenderer.lineTo(
                                                                    chaiseX *
                                                                      itemPixelWidth *
                                                                      chaiseSideSign,
                                                                    chaiseY * itemPixelDepth,
                                                                  )
                                                                : planCanvasRenderer.moveTo(
                                                                    chaiseX *
                                                                      itemPixelWidth *
                                                                      chaiseSideSign,
                                                                    chaiseY * itemPixelDepth,
                                                                  );
                                                            },
                                                          ),
                                                          planCanvasRenderer.closePath(),
                                                          planCanvasRenderer.fill(),
                                                          planCanvasRenderer.stroke());
                                                      } else
                                                        (planCanvasRenderer.beginPath(),
                                                          planCanvasRenderer.roundRect(
                                                            -itemPixelWidth / 2,
                                                            -itemPixelDepth / 2,
                                                            itemPixelWidth,
                                                            itemPixelDepth,
                                                            Math.min(
                                                              6,
                                                              itemPixelWidth / 5,
                                                              itemPixelDepth / 5,
                                                            ),
                                                          ),
                                                          planCanvasRenderer.fill(),
                                                          planCanvasRenderer.stroke());
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  if (
    ((planCanvasRenderer.strokeStyle = "rgba(17, 24, 31, .5)"),
    (planCanvasRenderer.lineWidth = 1),
    planItem.type === "coffeetable")
  ) {

    const coffeeTableTopLengthRatio = 1.0 / 1.9,
      coffeeTableTopOffsetRatio = -0.45 / 1.9,
      coffeeTableTopDepthRatio = 0.85 / 1.05,
      coffeeTableEdgeInsetPx = Math.min(itemPixelWidth, itemPixelDepth) * 0.035;
    planCanvasRenderer.strokeRect(
      (-coffeeTableTopLengthRatio / 2 + coffeeTableTopOffsetRatio) * itemPixelWidth +
        coffeeTableEdgeInsetPx,
      (-coffeeTableTopDepthRatio / 2) * itemPixelDepth + coffeeTableEdgeInsetPx,
      coffeeTableTopLengthRatio * itemPixelWidth - coffeeTableEdgeInsetPx * 2,
      coffeeTableTopDepthRatio * itemPixelDepth - coffeeTableEdgeInsetPx * 2,
    );
  } else {
    if (planItem.type === "squarecoffeetable")
      planCanvasRenderer.strokeRect(
        -itemPixelWidth * 0.35,
        -itemPixelDepth * 0.35,
        itemPixelWidth * 0.7,
        itemPixelDepth * 0.7,
      );
    else {
      if (planItem.type === "bed")
        (planCanvasRenderer.strokeRect(
          -itemPixelWidth * 0.4,
          -itemPixelDepth * 0.4,
          itemPixelWidth * 0.8,
          itemPixelDepth * 0.23,
        ),
          planCanvasRenderer.beginPath(),
          planCanvasRenderer.moveTo(-itemPixelWidth / 2, -itemPixelDepth * 0.12),
          planCanvasRenderer.lineTo(itemPixelWidth / 2, -itemPixelDepth * 0.12),
          planCanvasRenderer.stroke());
      else {
        if (planItem.type === "sofa" || planItem.type === "sofa-single")
          (planCanvasRenderer.beginPath(),
            planCanvasRenderer.moveTo(-itemPixelWidth / 2, -itemPixelDepth * 0.27),
            planCanvasRenderer.lineTo(itemPixelWidth / 2, -itemPixelDepth * 0.27),
            planCanvasRenderer.stroke(),
            planCanvasRenderer.strokeRect(
              -itemPixelWidth * 0.42,
              -itemPixelDepth * 0.12,
              itemPixelWidth * 0.84,
              itemPixelDepth * 0.43,
            ));
        else {
          if (planItem.type === "table") {
            for (const shapeOffsetX of [-0.38, 0.38])
              for (const shapeOffsetY of [-0.32, 0.32])
                (planCanvasRenderer.beginPath(),
                  planCanvasRenderer.arc(
                    itemPixelWidth * shapeOffsetX,
                    itemPixelDepth * shapeOffsetY,
                    Math.max(1.5, Math.min(itemPixelWidth, itemPixelDepth) * 0.045),
                    0,
                    Math.PI * 2,
                  ),
                  planCanvasRenderer.stroke());
          } else {
            if (roundTableTypeSet.has(planItem.type) && isTurntableRoundTable(planItem))
              (planCanvasRenderer.beginPath(),
                planCanvasRenderer.arc(
                  0,
                  0,
                  Math.min(itemPixelWidth, itemPixelDepth) * 0.17,
                  0,
                  Math.PI * 2,
                ),
                planCanvasRenderer.stroke());
            else {
              if (planItem.type === "fridge")
                (planCanvasRenderer.beginPath(),
                  planCanvasRenderer.moveTo(-itemPixelWidth / 2, -itemPixelDepth * 0.12),
                  planCanvasRenderer.lineTo(itemPixelWidth / 2, -itemPixelDepth * 0.12),
                  planCanvasRenderer.stroke());
              else if (planItem.type === "freezer")
                (planCanvasRenderer.beginPath(),
                  planCanvasRenderer.moveTo(-itemPixelWidth * 0.46, itemPixelDepth * 0.3),
                  planCanvasRenderer.lineTo(itemPixelWidth * 0.46, itemPixelDepth * 0.3),
                  planCanvasRenderer.stroke(),
                  planCanvasRenderer.beginPath(),
                  planCanvasRenderer.arc(
                    itemPixelWidth * 0.34,
                    itemPixelDepth * 0.06,
                    Math.min(itemPixelWidth, itemPixelDepth) * 0.07,
                    0,
                    Math.PI * 2,
                  ),
                  planCanvasRenderer.stroke());
              else {
                if (planItem.type === "storagewaterheater")
                  (planCanvasRenderer.beginPath(),
                    planCanvasRenderer.arc(
                      0,
                      0,
                      Math.min(itemPixelWidth, itemPixelDepth) * 0.26,
                      0,
                      Math.PI * 2,
                    ),
                    planCanvasRenderer.stroke(),
                    planCanvasRenderer.beginPath(),
                    planCanvasRenderer.moveTo(-itemPixelWidth * 0.29, itemPixelDepth * 0.36),
                    planCanvasRenderer.lineTo(itemPixelWidth * 0.29, itemPixelDepth * 0.36),
                    planCanvasRenderer.stroke());
                else {
                  if (planItem.type === "gaswaterheater")
                    (planCanvasRenderer.beginPath(),
                      planCanvasRenderer.moveTo(-itemPixelWidth * 0.36, -itemPixelDepth * 0.08),
                      planCanvasRenderer.lineTo(itemPixelWidth * 0.36, -itemPixelDepth * 0.08),
                      planCanvasRenderer.stroke(),
                      planCanvasRenderer.beginPath(),
                      planCanvasRenderer.moveTo(-itemPixelWidth * 0.3, itemPixelDepth * 0.36),
                      planCanvasRenderer.lineTo(itemPixelWidth * 0.3, itemPixelDepth * 0.36),
                      planCanvasRenderer.stroke());
                  else {
                    if (PIPELINE_DISPENSER_PLAN_TYPES.has(planItem.type))
                      (planCanvasRenderer.beginPath(),
                        planCanvasRenderer.moveTo(-itemPixelWidth * 0.3, itemPixelDepth * 0.34),
                        planCanvasRenderer.lineTo(itemPixelWidth * 0.3, itemPixelDepth * 0.34),
                        planCanvasRenderer.stroke(),
                        planCanvasRenderer.beginPath(),
                        planCanvasRenderer.arc(
                          itemPixelWidth * 0.02,
                          itemPixelDepth * 0.16,
                          Math.min(itemPixelWidth, itemPixelDepth) * 0.08,
                          0,
                          Math.PI * 2,
                        ),
                        planCanvasRenderer.stroke());
                    else {
                      if (planItem.type === "tea_bar_machine")
                        (planCanvasRenderer.beginPath(),
                          planCanvasRenderer.moveTo(-itemPixelWidth * 0.38, -itemPixelDepth * 0.02),
                          planCanvasRenderer.lineTo(itemPixelWidth * 0.38, -itemPixelDepth * 0.02),
                          planCanvasRenderer.moveTo(-itemPixelWidth * 0.42, itemPixelDepth * 0.2),
                          planCanvasRenderer.lineTo(itemPixelWidth * 0.42, itemPixelDepth * 0.2),
                          planCanvasRenderer.stroke());
                      else {
                        if (["dishwasher", "steamoven", "microwave"].includes(planItem.type))
                          (planCanvasRenderer.beginPath(),
                            planCanvasRenderer.moveTo(-itemPixelWidth * 0.42, itemPixelDepth * 0.3),
                            planCanvasRenderer.lineTo(itemPixelWidth * 0.42, itemPixelDepth * 0.3),
                            planCanvasRenderer.stroke());
                        else {
                          if (planItem.type === "glasspartition")
                            ((planCanvasRenderer.strokeStyle = "rgba(183, 218, 231, .72)"),
                              planCanvasRenderer.beginPath(),
                              planCanvasRenderer.moveTo(-itemPixelWidth * 0.46, 0),
                              planCanvasRenderer.lineTo(itemPixelWidth * 0.46, 0),
                              planCanvasRenderer.stroke());
                          else {
                            if (planItem.type === "ricecooker")
                              (planCanvasRenderer.beginPath(),
                                planCanvasRenderer.arc(
                                  0,
                                  -itemPixelDepth * 0.04,
                                  Math.min(itemPixelWidth, itemPixelDepth) * 0.28,
                                  0,
                                  Math.PI * 2,
                                ),
                                planCanvasRenderer.stroke());
                            else {
                              if (planItem.type === "tv")
                                (planItem.tvMountStyle === "mobile"
                                  ? ((planCanvasRenderer.fillStyle = "rgba(46, 53, 61, .88)"),
                                    planCanvasRenderer.fillRect(
                                      -itemPixelWidth * 0.36,
                                      -itemPixelDepth * 0.4,
                                      itemPixelWidth * 0.72,
                                      itemPixelDepth * 0.8,
                                    ),
                                    planCanvasRenderer.strokeRect(
                                      -itemPixelWidth * 0.08,
                                      -itemPixelDepth * 0.42,
                                      itemPixelWidth * 0.16,
                                      itemPixelDepth * 0.84,
                                    ))
                                  : planItem.tvMountStyle === "tabletop" &&
                                    planCanvasRenderer.strokeRect(
                                      -itemPixelWidth * 0.3,
                                      -itemPixelDepth * 0.34,
                                      itemPixelWidth * 0.6,
                                      itemPixelDepth * 0.68,
                                    ),
                                  (planCanvasRenderer.fillStyle =
                                    planItem.screenEnabled === false
                                      ? "rgba(8, 12, 15, .8)"
                                      : "rgba(48, 113, 153, .86)"),
                                  planCanvasRenderer.fillRect(
                                    -itemPixelWidth * 0.44,
                                    -itemPixelDepth * 0.28,
                                    itemPixelWidth * 0.88,
                                    itemPixelDepth * 0.56,
                                  ),
                                  planItem.screenEnabled !== false &&
                                    ((planCanvasRenderer.fillStyle = "rgba(255, 159, 54, .92)"),
                                    planCanvasRenderer.fillRect(
                                      -itemPixelWidth * 0.37,
                                      -itemPixelDepth * 0.18,
                                      itemPixelWidth * 0.05,
                                      itemPixelDepth * 0.36,
                                    )));
                              else {
                                if (planItem.type === "plant")
                                  (planCanvasRenderer.beginPath(),
                                    planCanvasRenderer.arc(
                                      0,
                                      0,
                                      Math.min(itemPixelWidth, itemPixelDepth) * 0.31,
                                      0,
                                      Math.PI * 2,
                                    ),
                                    planCanvasRenderer.stroke());
                                else {
                                  if (stairItemTypeSet.has(planItem.type)) {
                                    for (let stripeIndex = 1; stripeIndex < 10; stripeIndex += 1) {
                                      const stripeY =
                                        -itemPixelDepth / 2 + (itemPixelDepth * stripeIndex) / 10;
                                      (planCanvasRenderer.beginPath(),
                                        planCanvasRenderer.moveTo(-itemPixelWidth / 2, stripeY),
                                        planCanvasRenderer.lineTo(itemPixelWidth / 2, stripeY),
                                        planCanvasRenderer.stroke());
                                    }
                                    (planCanvasRenderer.beginPath(),
                                      planCanvasRenderer.moveTo(0, itemPixelDepth * 0.34),
                                      planCanvasRenderer.lineTo(0, -itemPixelDepth * 0.3),
                                      planCanvasRenderer.lineTo(
                                        -Math.min(itemPixelWidth, itemPixelDepth) * 0.08,
                                        -itemPixelDepth * 0.2,
                                      ),
                                      planCanvasRenderer.moveTo(0, -itemPixelDepth * 0.3),
                                      planCanvasRenderer.lineTo(
                                        Math.min(itemPixelWidth, itemPixelDepth) * 0.08,
                                        -itemPixelDepth * 0.2,
                                      ),
                                      planCanvasRenderer.stroke());
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  if (ne3) {
    ((planCanvasRenderer.strokeStyle = "rgba(255, 157, 46, .9)"),
      (planCanvasRenderer.lineWidth = 1),
      planCanvasRenderer.setLineDash([5, 3]),
      planCanvasRenderer.strokeRect(
        -itemPixelWidth / 2,
        -itemPixelDepth / 2,
        itemPixelWidth,
        itemPixelDepth,
      ),
      planCanvasRenderer.setLineDash([]));
    const markerSize = 7;
    if (
      ((planCanvasRenderer.fillStyle = "#111820"),
      planItem.type !== "smart-socket-86" || Math.min(itemPixelWidth, itemPixelDepth) >= 18)
    ) {
      for (const [markerX, markerY] of [
        [-itemPixelWidth / 2, -itemPixelDepth / 2],
        [itemPixelWidth / 2, -itemPixelDepth / 2],
        [itemPixelWidth / 2, itemPixelDepth / 2],
        [-itemPixelWidth / 2, itemPixelDepth / 2],
      ])
        (planCanvasRenderer.fillRect(
          markerX - markerSize / 2,
          markerY - markerSize / 2,
          markerSize,
          markerSize,
        ),
          planCanvasRenderer.strokeRect(
            markerX - markerSize / 2,
            markerY - markerSize / 2,
            markerSize,
            markerSize,
          ));
    }
    const arrowTipY = -itemPixelDepth / 2 - 17;
    ((planCanvasRenderer.strokeStyle = "#ff9d2e"),
      planCanvasRenderer.beginPath(),
      planCanvasRenderer.moveTo(0, -itemPixelDepth / 2),
      planCanvasRenderer.lineTo(0, arrowTipY + 4),
      planCanvasRenderer.stroke(),
      (planCanvasRenderer.fillStyle = "#111820"),
      planCanvasRenderer.beginPath(),
      planCanvasRenderer.arc(0, arrowTipY, 4, 0, Math.PI * 2),
      planCanvasRenderer.fill(),
      planCanvasRenderer.stroke());
  }
  planCanvasRenderer.restore();
}
