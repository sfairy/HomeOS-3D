/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  itemPlanFootprint,
  pillarIsLying,
  stripIsStanding,
  tracePillarPlanPath
} from "./studio-plan-geometry.js";
import { state } from "./studio-state.js";
import {
  isRegionLightingEnabled,
  isSelected,
  isStageViewerMode
} from "./studio-architecture.js";
import {
  LIGHT_ITEM_TYPES,
  ROUND_FOOTPRINT_ITEM_TYPES,
  ROUND_TABLE_TURNTABLE_ITEM_TYPES,
  STAIR_ITEM_TYPES,
  isRoundTableTurntableItem
} from "./studio-item-types.js";
import {
  finite,
  kelvinToRgbHex
} from "../loaders/studio-normalization.js";
import {
  adaptiveDeviceLightBudget,
  adaptiveLightRenderCost,
  clamp,
  planLabelProjectionMetrics
} from "../plan/geometry.js";
import { drawTrackedText } from "../plan/studio-plan-drawing.js";
import {
  createCurtainTrack,
  curtainPanelRanges,
  normalizeCurtainTrack
} from "../loaders/studio-curtain-track.js";
import { normalizePillarShape } from "./studio-scene-normalize.js";
import { ROUND_PLAN_RING_RATIOS_BY_TYPE } from "./studio-config-tables.js";
import { paletteColor } from "../../utils/colors.js";

/**
 * document.querySelector 的简写别名，只用于页面里必然存在的固定节点；动态列表项
 * @returns {Element|null} 未命中返回 null，调用方需自行判空。
 */
export const selectElement = (selector: any) => document.querySelector(selector);

export const STUDIO_ACCENT_FALLBACK = "#ffc46a";

export const STUDIO_ACCENT_BRIGHT_FALLBACK = "#ffd9a0";

/** 选中物 / 当前阶段 / 标定参考点。 */
export const PLAN_ACCENT = () => paletteColor("--accent", STUDIO_ACCENT_FALLBACK);

/** 选中物的高亮变体（预览中的窗、悬停项）。 */
export const PLAN_ACCENT_BRIGHT = () => paletteColor("--accent-bright", STUDIO_ACCENT_BRIGHT_FALLBACK);

export const STUDIO_LABEL_FALLBACK = "#f1f7fb";

export const STUDIO_HANDLE_FALLBACK = "#141a20";

export const PLAN_LABEL = () => paletteColor("--hos-tool-ink", STUDIO_LABEL_FALLBACK);

/** 选中框的角点手柄与旋转手柄的**填充**（外描边走 PLAN_ACCENT 的琥珀）。原来是 #111820。 */
export const PLAN_HANDLE = () => paletteColor("--hos-tool-surface", STUDIO_HANDLE_FALLBACK);

export const planCanvasElement = selectElement("#plan-canvas");

export const lightCacheCanvasElement = selectElement("#preview-light-cache");

export const planContext = planCanvasElement.getContext("2d");

/**
 * 取当前正在编辑的楼层记录。导出期间以 exportRenderState.selectedFloorId 为准：
 */
export function getCurrentFloor() {
  const selectedFloorId = state.exportRenderState?.selectedFloorId || state.activeFloorId;
  return (
    state.studioDocument?.floors.find((matchingFloor: any) => matchingFloor.id === selectedFloorId) ||
    state.studioDocument?.floors[0] ||
    null
  );
}

/**
 * 查某个灯具所属的灯组（当前楼层）。
 */
export function lightGroupForItem(lookupItem: any) {
  return (
    state.activeScene.lightGroups?.find((matchedGroup: any) => matchedGroup.id === lookupItem?.lightGroupId) ||
    state.activeScene.lightGroups?.[0] ||
    null
  );
}

/**
 * 在指定场景里查灯具所属的灯组。与 lightGroupForItem 的差别只在「查哪个场景」：
 */
export function lightGroupForItemInScene(sceneItem: any, targetScene = state.activeScene) {
  return (
    targetScene?.lightGroups?.find((sceneGroup: any) => sceneGroup.id === sceneItem?.lightGroupId) ||
    targetScene?.lightGroups?.[0] ||
    null
  );
}

export function isLightEnabled(checkedItem: any) {
  if (state.forcedVisibleLightIds !== null) {
    return state.forcedVisibleLightIds.has(checkedItem.id);
  } else if (lightGroupForItem(checkedItem)?.enabled === false) {
    return false;
  } else {
    return state.exportRenderState || state.isPreservingLightCache || !isAdaptiveLightCacheEnabled();
  }
}

/**
 * 拼接「楼层 + 灯组」复合键，用于跨层的灯组定位与缓存键。
 */
export function floorGroupKey(keyFloorId: any, keyGroupId: any) {
  return keyFloorId + ":" + keyGroupId;
}

/**
 * 拼接「楼层 + 物件」复合键，供跨层选中集合、强制点亮集合与光照缓存键使用。楼层 id
 */
export function floorItemKey(itemFloorId: any, itemId: any) {
  return (itemFloorId || "floor") + ":" + itemId;
}

/**
 * 灯组的作用域键：单层预览只用灯组 ID，整层堆叠才带楼层前缀。这样单层模式的灯组开关
 */
export function lightGroupScopeKey(scopeFloorId: any, scopeGroupId: any) {
  if (currentPreviewFloorMode() === "all") {
    return floorGroupKey(scopeFloorId, scopeGroupId);
  } else {
    return scopeGroupId;
  }
}

/**
 * 收集预览范围内所有灯具，附带所属楼层、灯组与两种作用域键；一次遍历产出灯光计算、
 */
export function collectPreviewLights() {
  return (
    currentPreviewFloorMode() === "all"
      ? state.studioDocument?.floors || []
      : [getCurrentFloor()].filter(Boolean)
  ).flatMap((previewedFloor: any) =>
    previewedFloor.scene.items
      .filter((lightCandidate: any) => LIGHT_ITEM_TYPES.has(lightCandidate.type))
      .map((lightItem: any) => {
        const lightGroup = lightGroupForItemInScene(lightItem, previewedFloor.scene);
        return {
          floor: previewedFloor,
          item: lightItem,
          group: lightGroup,
          itemKey: floorItemKey(previewedFloor.id, lightItem.id),
          groupKey: lightGroupScopeKey(previewedFloor.id, lightGroup?.id || "__ungrouped")
        };
      })
  );
}

export function currentPixelsPerMeter() {
  return state.activeScene.calibration?.pixelsPerMeter || 0;
}

/**
 * 平面坐标 → 画布坐标：先缩放再平移（此处不做视图旋转）。旋转拆到 rotateScreenPoint
 */
export function planToScreen(planCoordinates: any) {
  return {
    x: planCoordinates.x * state.viewTransform.zoom + state.viewTransform.offsetX,
    y: planCoordinates.y * state.viewTransform.zoom + state.viewTransform.offsetY
  };
}

export function drawPlanItem(itemToDraw: any) {
  const itemCenterScreen = planToScreen(itemToDraw);
  const planFootprint = itemPlanFootprint(itemToDraw);
  const itemWidthPx = planFootprint.width * currentPixelsPerMeter() * state.viewTransform.zoom;
  const itemDepthPx = planFootprint.depth * currentPixelsPerMeter() * state.viewTransform.zoom;
  const isItemSelected = isSelected("item", itemToDraw.id);
  planContext.save();
  planContext.translate(itemCenterScreen.x, itemCenterScreen.y);
  planContext.rotate((itemToDraw.rotation * Math.PI) / 180);
  planContext.fillStyle = itemToDraw.color + "c7";
  planContext.strokeStyle = isItemSelected ? PLAN_ACCENT() : "rgba(234, 240, 244, .72)";
  planContext.lineWidth = isItemSelected ? 2 : 1;
  if (itemToDraw.type === "flooropening") {
    planContext.fillStyle = "rgba(9, 17, 25, .55)";
    planContext.fillRect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
    planContext.setLineDash([6, 4]);
    planContext.strokeRect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
    planContext.setLineDash([]);
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx / 2, -itemDepthPx / 2);
    planContext.lineTo(itemWidthPx / 2, itemDepthPx / 2);
    planContext.moveTo(itemWidthPx / 2, -itemDepthPx / 2);
    planContext.lineTo(-itemWidthPx / 2, itemDepthPx / 2);
    planContext.stroke();
    planContext.fillStyle = PLAN_ACCENT_BRIGHT();
    planContext.font = "12px sans-serif";
    planContext.textAlign = "center";
    planContext.fillText("楼板洞口", 0, 4);
  } else if (LIGHT_ITEM_TYPES.has(itemToDraw.type)) {
    const lightDiscRadiusPx = Math.max(
      Math.min(itemWidthPx, itemDepthPx) * 0.44,
      itemToDraw.type === "downlight" ? 10 : 8
    );
    const lightColorHex =
      "#" + kelvinToRgbHex(itemToDraw.lightTemperature).toString(16).padStart(6, "0");
    const isLightOn = isLightEnabled(itemToDraw);
    planContext.fillStyle = isLightOn ? lightColorHex : "#68737d";
    planContext.strokeStyle = isLightOn ? "rgba(255, 221, 163, .88)" : "rgba(196, 207, 216, .48)";
    planContext.lineWidth = 1.2;
    if (itemToDraw.type === "striplight" && stripIsStanding(itemToDraw)) {
      // 立起后，平面能画的只剩它占的那块地（厚度 × 发光宽度），发光长度改为沿房间向上延伸、
      planContext.beginPath();
      planContext.rect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
      planContext.fill();
      planContext.stroke();
      planContext.strokeStyle = isItemSelected
        ? "rgba(255, 193, 116, .95)"
        : "rgba(25, 34, 43, .5)";
      planContext.lineWidth = 1;
      const standingStripInset = Math.min(itemWidthPx, itemDepthPx) * 0.3;
      planContext.beginPath();
      planContext.rect(
        -itemWidthPx / 2 + standingStripInset,
        -itemDepthPx / 2 + standingStripInset,
        Math.max(itemWidthPx - standingStripInset * 2, 0.6),
        Math.max(itemDepthPx - standingStripInset * 2, 0.6)
      );
      planContext.stroke();
    } else if (itemToDraw.type === "striplight") {
      planContext.beginPath();
      const stripCornerRadiusPx = Math.min(7, itemDepthPx * 0.42);
      planContext.roundRect(
        -itemWidthPx / 2,
        -itemDepthPx * 0.34,
        itemWidthPx,
        itemDepthPx * 0.68,
        stripCornerRadiusPx
      );
      planContext.fill();
      planContext.stroke();
      planContext.strokeStyle = isLightOn ? "rgba(255, 238, 195, .95)" : "rgba(196, 207, 216, .42)";
      planContext.lineWidth = Math.max(2, itemDepthPx * 0.12);
      planContext.beginPath();
      planContext.moveTo(-itemWidthPx * 0.42, 0);
      planContext.lineTo(itemWidthPx * 0.42, 0);
      planContext.stroke();
    } else if (itemToDraw.type === "ceilinglight") {
      const ceilingDiscSizePx = Math.max(Math.min(itemWidthPx, itemDepthPx) * 0.82, 16);
      planContext.beginPath();
      planContext.rect(
        -ceilingDiscSizePx / 2,
        -ceilingDiscSizePx / 2,
        ceilingDiscSizePx,
        ceilingDiscSizePx
      );
      planContext.fill();
      planContext.stroke();
      const ceilingInnerSizePx = ceilingDiscSizePx * 0.58;
      planContext.strokeRect(
        -ceilingInnerSizePx / 2,
        -ceilingInnerSizePx / 2,
        ceilingInnerSizePx,
        ceilingInnerSizePx
      );
    } else {
      planContext.beginPath();
      planContext.arc(0, 0, lightDiscRadiusPx, 0, Math.PI * 2);
      planContext.fill();
      planContext.stroke();
      planContext.beginPath();
      planContext.arc(0, 0, lightDiscRadiusPx * 0.5, 0, Math.PI * 2);
      planContext.stroke();
      for (let spokeIndex = 0; spokeIndex < 4; spokeIndex += 1) {
        const spokeAngleRad = (spokeIndex * Math.PI) / 2;
        planContext.beginPath();
        planContext.moveTo(
          Math.cos(spokeAngleRad) * lightDiscRadiusPx * 0.68,
          Math.sin(spokeAngleRad) * lightDiscRadiusPx * 0.68
        );
        planContext.lineTo(
          Math.cos(spokeAngleRad) * lightDiscRadiusPx * 1.12,
          Math.sin(spokeAngleRad) * lightDiscRadiusPx * 1.12
        );
        planContext.stroke();
      }
    }
  } else if (itemToDraw.type === "planlabel") {
    const labelMetrics = planLabelProjectionMetrics(
      itemWidthPx,
      itemDepthPx,
      itemToDraw.lineLength
    );
    planContext.fillStyle = PLAN_LABEL();
    const labelTitleFontSizePx = labelMetrics.titleFontSize;
    planContext.font = "700 " + labelTitleFontSizePx + "px sans-serif";
    drawTrackedText(
      planContext,
      itemToDraw.title || "家庭总览",
      labelMetrics.titleStartX,
      labelMetrics.titleY,
      labelTitleFontSizePx * clamp(finite(itemToDraw.titleSpacing, 1.05), 0, 1.8),
      labelMetrics.titleMaxWidth
    );
    const labelIconX = labelMetrics.iconX;
    const labelIconY = labelMetrics.iconY;
    const labelIconSizePx = labelMetrics.iconSize;
    planContext.fillStyle = PLAN_LABEL();
    planContext.beginPath();
    planContext.moveTo(labelIconX, labelIconY - labelIconSizePx * 0.58);
    planContext.lineTo(labelIconX + labelIconSizePx * 0.56, labelIconY - labelIconSizePx * 0.02);
    planContext.lineTo(labelIconX + labelIconSizePx * 0.38, labelIconY - labelIconSizePx * 0.02);
    planContext.lineTo(labelIconX + labelIconSizePx * 0.38, labelIconY + labelIconSizePx * 0.5);
    planContext.lineTo(labelIconX - labelIconSizePx * 0.38, labelIconY + labelIconSizePx * 0.5);
    planContext.lineTo(labelIconX - labelIconSizePx * 0.38, labelIconY - labelIconSizePx * 0.02);
    planContext.lineTo(labelIconX - labelIconSizePx * 0.56, labelIconY - labelIconSizePx * 0.02);
    planContext.lineTo(labelIconX, labelIconY - labelIconSizePx * 0.52);
    planContext.closePath();
    planContext.fill();
    planContext.fillStyle = PLAN_LABEL();
    planContext.textAlign = "left";
    const labelSubtitleFontSizePx = labelMetrics.subtitleFontSize;
    planContext.font = "400 " + labelSubtitleFontSizePx + 'px "Arial Narrow", Arial, sans-serif';
    drawTrackedText(
      planContext,
      itemToDraw.subtitle || "HOME PLAN",
      labelMetrics.subtitleStartX,
      labelMetrics.subtitleY,
      labelSubtitleFontSizePx * clamp(finite(itemToDraw.subtitleSpacing, 0.08), 0, 0.6),
      labelMetrics.subtitleMaxWidth
    );
    planContext.strokeStyle = "rgba(146, 155, 170, .72)";
    planContext.lineWidth = labelMetrics.baselineLineWidth;
    const labelBaselineY = labelMetrics.baselineY;
    const labelBaselineStartX = labelMetrics.baselineStartX;
    const labelBaselineEndX = labelBaselineStartX + labelMetrics.baselineLength;
    planContext.beginPath();
    planContext.moveTo(labelBaselineStartX, labelBaselineY);
    planContext.lineTo(labelBaselineEndX, labelBaselineY);
    planContext.moveTo(labelBaselineStartX, labelBaselineY - labelMetrics.baselineCapHalfHeight);
    planContext.lineTo(labelBaselineStartX, labelBaselineY + labelMetrics.baselineCapHalfHeight);
    planContext.moveTo(labelBaselineEndX, labelBaselineY - labelMetrics.baselineCapHalfHeight);
    planContext.lineTo(labelBaselineEndX, labelBaselineY + labelMetrics.baselineCapHalfHeight);
    planContext.stroke();
  } else if (itemToDraw.type === "mural") {
    const muralPlanThicknessPx = Math.max(itemDepthPx, 3);
    planContext.beginPath();
    planContext.rect(
      -itemWidthPx / 2,
      -muralPlanThicknessPx / 2,
      itemWidthPx,
      muralPlanThicknessPx
    );
    planContext.fill();
    planContext.stroke();
    planContext.strokeStyle = isItemSelected ? "rgba(255, 193, 116, .95)" : "rgba(25, 34, 43, .5)";
    planContext.lineWidth = 1;
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.42, -muralPlanThicknessPx * 0.16);
    planContext.lineTo(-itemWidthPx * 0.08, muralPlanThicknessPx * 0.16);
    planContext.moveTo(itemWidthPx * 0.04, -muralPlanThicknessPx * 0.16);
    planContext.lineTo(itemWidthPx * 0.4, muralPlanThicknessPx * 0.16);
    planContext.stroke();
  } else if (itemToDraw.type === "featurewall") {
    const featureWallThicknessPx = Math.max(itemDepthPx, 3);
    planContext.beginPath();
    planContext.rect(
      -itemWidthPx / 2,
      -featureWallThicknessPx / 2,
      itemWidthPx,
      featureWallThicknessPx
    );
    planContext.fill();
    planContext.stroke();
    planContext.strokeStyle = isItemSelected ? "rgba(255, 193, 116, .95)" : "rgba(25, 34, 43, .5)";
    planContext.lineWidth = 1;
    for (let slatTick = 0; slatTick < 6; slatTick += 1) {
      const slatTickX = -itemWidthPx * 0.4 + (itemWidthPx * 0.8 * slatTick) / 5;
      planContext.beginPath();
      planContext.moveTo(slatTickX, -featureWallThicknessPx * 0.24);
      planContext.lineTo(slatTickX, featureWallThicknessPx * 0.24);
      planContext.stroke();
    }
  } else if (itemToDraw.type === "smallcar") {
    const carCornerRadiusPx = Math.min(itemWidthPx * 0.22, itemDepthPx * 0.08);
    if (itemToDraw.chargingEnabled === true) {
      planContext.save();
      planContext.scale(itemWidthPx * 0.76, itemDepthPx * 0.62);
      const chargeGlowGradient = planContext.createRadialGradient(0, 0, 0, 0, 0, 1);
      chargeGlowGradient.addColorStop(0, "rgba(79, 239, 183, .32)");
      chargeGlowGradient.addColorStop(0.48, "rgba(79, 239, 183, .17)");
      chargeGlowGradient.addColorStop(1, "rgba(79, 239, 183, 0)");
      planContext.fillStyle = chargeGlowGradient;
      planContext.beginPath();
      planContext.arc(0, 0, 1, 0, Math.PI * 2);
      planContext.fill();
      planContext.restore();
      planContext.fillStyle = "rgba(79, 239, 183, .24)";
      const chargeDotSpacingPx = Math.max(9, Math.min(itemWidthPx, itemDepthPx) * 0.07);
      for (
        let chargeDotX = -itemWidthPx * 0.62;
        chargeDotX <= itemWidthPx * 0.62;
        chargeDotX += chargeDotSpacingPx
      ) {
        for (
          let chargeDotY = -itemDepthPx * 0.54;
          chargeDotY <= itemDepthPx * 0.54;
          chargeDotY += chargeDotSpacingPx
        ) {
          const chargeDotDistance = Math.hypot(
            chargeDotX / (itemWidthPx * 0.62),
            chargeDotY / (itemDepthPx * 0.54)
          );
          if (!(chargeDotDistance >= 1)) {
            planContext.globalAlpha = (1 - chargeDotDistance) * 0.72;
            planContext.beginPath();
            planContext.arc(
              chargeDotX,
              chargeDotY,
              Math.max(0.7, chargeDotSpacingPx * 0.1),
              0,
              Math.PI * 2
            );
            planContext.fill();
          }
        }
      }
      planContext.globalAlpha = 1;
      planContext.fillStyle = itemToDraw.color + "c7";
    }
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.48,
      -itemDepthPx * 0.49,
      itemWidthPx * 0.96,
      itemDepthPx * 0.98,
      carCornerRadiusPx
    );
    planContext.fill();
    planContext.stroke();
    // 座舱：比例沿用自建车那套（座舱 0.85 × 0.459 的整车、中心略偏后）—— 整车那头 2.19 × 5.01
    planContext.fillStyle = "rgba(38, 48, 57, .72)";
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.425,
      -itemDepthPx * 0.299,
      itemWidthPx * 0.85,
      itemDepthPx * 0.459,
      carCornerRadiusPx * 0.7
    );
    planContext.fill();
    // 四个车轮：轮胎中心 x = ±0.95（= 车宽的 0.434）、轴距 ±1.55（= 车长的 0.309），
    for (const carBodyOffsetX of [-0.434, 0.434]) {
      for (const carBodyOffsetY of [-0.309, 0.309]) {
        planContext.fillRect(
          carBodyOffsetX * itemWidthPx - itemWidthPx * 0.0365,
          carBodyOffsetY * itemDepthPx - itemDepthPx * 0.068,
          itemWidthPx * 0.073,
          itemDepthPx * 0.136
        );
      }
    }
    if (itemToDraw.chargingEnabled === true) {
      planContext.fillStyle = "#7dffd0";
      planContext.beginPath();
      planContext.moveTo(itemWidthPx * 0.028, -itemDepthPx * 0.095);
      planContext.lineTo(-itemWidthPx * 0.058, itemDepthPx * 0.008);
      planContext.lineTo(itemWidthPx * 0.006, itemDepthPx * 0.008);
      planContext.lineTo(-itemWidthPx * 0.028, itemDepthPx * 0.095);
      planContext.lineTo(itemWidthPx * 0.07, -itemDepthPx * 0.02);
      planContext.lineTo(itemWidthPx * 0.008, -itemDepthPx * 0.02);
      planContext.closePath();
      planContext.fill();
    }
  } else if (itemToDraw.type === "elevator") {
    // 电梯：井道框 + 轿厢内框 + 前侧两扇轿门。原先没有这一支，符号落进兜底的圆角矩形 ——
    planContext.beginPath();
    planContext.rect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
    planContext.fill();
    planContext.stroke();
    const elevatorCarHalfWidthPx = itemWidthPx * (0.65 / 1.4);
    // 轿厢内框：后壁内面 z = −0.71 到门面 z = 0.71，即深度的 0.934、居中。
    const elevatorCarInnerHalfDepthPx = itemDepthPx * (0.71 / 1.52);
    planContext.strokeRect(
      -elevatorCarHalfWidthPx,
      -elevatorCarInnerHalfDepthPx,
      elevatorCarHalfWidthPx * 2,
      elevatorCarInnerHalfDepthPx * 2
    );
    // 轿门：门面（平面 +y = 模型 +z，与楼梯那支的上行箭头同一套朝向）上那两扇，
    planContext.lineWidth = Math.max(1.5, itemWidthPx * 0.035);
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.0035, elevatorCarInnerHalfDepthPx);
    planContext.lineTo(-itemWidthPx * (0.645 / 1.4), elevatorCarInnerHalfDepthPx);
    planContext.moveTo(itemWidthPx * 0.0035, elevatorCarInnerHalfDepthPx);
    planContext.lineTo(itemWidthPx * (0.645 / 1.4), elevatorCarInnerHalfDepthPx);
    planContext.stroke();
    planContext.lineWidth = 1;
  } else if (
    itemToDraw.type === "curtain" &&
    normalizeCurtainTrack(itemToDraw).curtainForm === "roller"
  ) {
    // 卷帘：一整片帘布 + 一条卷管，没有轨道、没有左右两片，也不画褶皱线。
    planContext.strokeStyle = isItemSelected ? PLAN_ACCENT() : "rgba(234, 240, 244, .72)";
    planContext.lineWidth = isItemSelected ? 2 : 1.5;
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.5, 0);
    planContext.lineTo(itemWidthPx * 0.5, 0);
    planContext.stroke();
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.5,
      -itemDepthPx * 0.42,
      itemWidthPx,
      itemDepthPx * 0.84,
      Math.min(itemDepthPx * 0.32, itemWidthPx * 0.06)
    );
    planContext.fill();
    planContext.stroke();
  } else if (itemToDraw.type === "curtain" && itemToDraw.curtainTrack) {
    const curtainTrack = createCurtainTrack(itemToDraw);
    const planPixelsPerUnit = itemWidthPx / itemToDraw.width;
    /**
     * 沿轨道把 [segmentStart, segmentEnd]（单位米）采成折线并描边。采样密度取
     */
    const drawTrackSegment = (segmentStart: any, segmentEnd: any, segmentWidthPx: any, segmentStrokeColor: any) => {
      planContext.beginPath();
      planContext.lineWidth = segmentWidthPx;
      planContext.strokeStyle = segmentStrokeColor;
      const segmentSampleCount = Math.max(16, Math.ceil((segmentEnd - segmentStart) * 30));
      for (
        let segmentSampleIndex = 0;
        segmentSampleIndex <= segmentSampleCount;
        segmentSampleIndex++
      ) {
        const segmentSamplePoint = curtainTrack.sample(
          segmentStart + ((segmentEnd - segmentStart) * segmentSampleIndex) / segmentSampleCount
        );
        if (segmentSampleIndex) {
          planContext.lineTo(
            segmentSamplePoint.x * planPixelsPerUnit,
            segmentSamplePoint.z * planPixelsPerUnit
          );
        } else {
          planContext.moveTo(
            segmentSamplePoint.x * planPixelsPerUnit,
            segmentSamplePoint.z * planPixelsPerUnit
          );
        }
      }
      planContext.stroke();
    };
    drawTrackSegment(
      0,
      curtainTrack.length,
      isItemSelected ? 2 : 1.5,
      isItemSelected ? PLAN_ACCENT() : "#b6c0ca"
    );
    for (const curtainPanel of curtainPanelRanges(
      curtainTrack,
      curtainTrack.curtainPreview,
      itemToDraw.curtainPosition || "split"
    )) {
      if (curtainPanel.visible) {
        drawTrackSegment(
          curtainPanel.start,
          curtainPanel.end,
          Math.max(3, planPixelsPerUnit * 0.09),
          itemToDraw.color
        );
      }
    }
  } else if (itemToDraw.type === "curtain") {
    const curtainPositionMode = ["left", "right", "split"].includes(itemToDraw.curtainPosition)
      ? itemToDraw.curtainPosition
      : "split";
    /**
     * 画一片帘布：圆角矩形本体 + 4 条等分褶皱线。褶皱线把帘布分成 5 份，这是平面上区分
     */
    const drawCurtainPanel = (panelStartX: any, panelWidthPx: any) => {
      planContext.beginPath();
      planContext.roundRect(
        panelStartX,
        -itemDepthPx * 0.46,
        panelWidthPx,
        itemDepthPx * 0.92,
        Math.min(itemDepthPx * 0.32, panelWidthPx * 0.18)
      );
      planContext.fill();
      planContext.stroke();
      planContext.strokeStyle = "rgba(25, 34, 43, .48)";
      planContext.lineWidth = 1;
      for (let foldIndex = 1; foldIndex < 5; foldIndex += 1) {
        const foldX = panelStartX + (panelWidthPx * foldIndex) / 5;
        planContext.beginPath();
        planContext.moveTo(foldX, -itemDepthPx * 0.34);
        planContext.lineTo(foldX, itemDepthPx * 0.34);
        planContext.stroke();
      }
    };
    planContext.strokeStyle = isItemSelected ? PLAN_ACCENT() : "rgba(234, 240, 244, .72)";
    planContext.lineWidth = isItemSelected ? 2 : 1.5;
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.5, 0);
    planContext.lineTo(itemWidthPx * 0.5, 0);
    planContext.stroke();
    if (curtainPositionMode === "left") {
      drawCurtainPanel(-itemWidthPx * 0.5, itemWidthPx * 0.24);
    } else if (curtainPositionMode === "right") {
      drawCurtainPanel(itemWidthPx * 0.26, itemWidthPx * 0.24);
    } else {
      drawCurtainPanel(-itemWidthPx * 0.5, itemWidthPx * 0.16);
      drawCurtainPanel(itemWidthPx * 0.34, itemWidthPx * 0.16);
    }
  } else if (itemToDraw.type === "pillar") {
    if (pillarIsLying(itemToDraw)) {
      // 躺倒时，平面画的是柱子占的地面范围（宽 × 长）而不是截面；
      planContext.beginPath();
      planContext.rect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
      planContext.fill();
      planContext.stroke();
      planContext.strokeStyle = isItemSelected
        ? "rgba(255, 193, 116, .95)"
        : "rgba(25, 34, 43, .5)";
      planContext.lineWidth = 1;
      const lyingPillarInset = Math.min(itemWidthPx, itemDepthPx) * 0.18;
      planContext.beginPath();
      planContext.rect(
        -itemWidthPx / 2 + lyingPillarInset,
        -itemDepthPx / 2 + lyingPillarInset,
        itemWidthPx - lyingPillarInset * 2,
        itemDepthPx - lyingPillarInset * 2
      );
      planContext.stroke();
    } else {
      const pillarShape = normalizePillarShape(itemToDraw.pillarShape);
      tracePillarPlanPath(planContext, pillarShape, itemWidthPx, itemDepthPx);
      planContext.fill();
      planContext.stroke();
      planContext.strokeStyle = isItemSelected
        ? "rgba(255, 193, 116, .95)"
        : "rgba(25, 34, 43, .5)";
      planContext.lineWidth = 1;
      tracePillarPlanPath(planContext, pillarShape, itemWidthPx * 0.72, itemDepthPx * 0.72);
      planContext.stroke();
    }
  } else if (itemToDraw.type === "bar") {
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx / 2,
      -itemDepthPx / 2,
      itemWidthPx,
      itemDepthPx,
      Math.min(5, itemDepthPx * 0.16)
    );
    planContext.fill();
    planContext.stroke();
    // 柜体前缘：吧台柜靠后（z 从 −0.325 到 −0.03），前面那 0.295 是留给吧凳的容腿空间。
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.45, -itemDepthPx * 0.046);
    planContext.lineTo(itemWidthPx * 0.45, -itemDepthPx * 0.046);
    planContext.stroke();
    // 三张吧凳：座面 0.3（= 0.46 进深）坐在容腿空间里，凳心 x = ±0.7 / 0、z = +0.13。
    for (const barStoolOffset of [-0.318, 0, 0.318]) {
      planContext.beginPath();
      planContext.arc(
        itemWidthPx * barStoolOffset,
        itemDepthPx * 0.2,
        Math.max(2, itemDepthPx * 0.23),
        0,
        Math.PI * 2
      );
      planContext.stroke();
    }
  } else if (itemToDraw.type === "table") {
    // 餐桌组合：一张台面 + 六张椅子。原先这一支不存在，符号直接落进兜底的圆角矩形，
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.3125,
      -itemDepthPx * 0.25,
      itemWidthPx * 0.625,
      itemDepthPx * 0.5,
      Math.min(itemWidthPx, itemDepthPx) * 0.03
    );
    planContext.fill();
    planContext.stroke();
    // 六张椅子：两侧各两张、两端各一张 —— 占地 2.4 × 1.8 的外沿就是它们撑出来的。
    for (const [tableChairOffsetX, tableChairOffsetY] of [
      [-0.175, 0.378],
      [0.175, 0.378],
      [-0.175, -0.378],
      [0.175, -0.378],
      [0.408, 0],
      [-0.408, 0]
    ]) {
      planContext.beginPath();
      planContext.roundRect(
        itemWidthPx * tableChairOffsetX - itemWidthPx * 0.0915,
        itemDepthPx * tableChairOffsetY - itemDepthPx * 0.122,
        itemWidthPx * 0.183,
        itemDepthPx * 0.244,
        Math.min(itemWidthPx, itemDepthPx) * 0.025
      );
      planContext.fill();
      planContext.stroke();
    }
  } else if (
    ["kitchenbase", "kitchensink", "kitchencooktop"].includes(itemToDraw.type)
  ) {
    // 厨房地柜三件：平面符号就是那条柜体线加一件「台面上的东西」——
    planContext.beginPath();
    planContext.rect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
    planContext.fill();
    planContext.stroke();
    if (itemToDraw.type === "kitchensink") {
      // 台下盆：盆口 0.56 × 0.34 落在 1.2 × 0.6 的台面里，就是那个内圈开孔。
      planContext.strokeRect(
        -itemWidthPx * 0.233,
        -itemDepthPx * 0.283,
        itemWidthPx * 0.467,
        itemDepthPx * 0.567
      );
    } else if (itemToDraw.type === "kitchencooktop") {
      // 四个灶眼：灶心 x = ±0.165 / z = ±0.115，圈半径 0.075。
      for (const cooktopBurnerOffsetX of [-0.1375, 0.1375]) {
        for (const cooktopBurnerOffsetY of [-0.19, 0.19]) {
          planContext.beginPath();
          planContext.arc(
            itemWidthPx * cooktopBurnerOffsetX,
            itemDepthPx * cooktopBurnerOffsetY,
            Math.max(1.5, itemWidthPx * 0.0625),
            0,
            Math.PI * 2
          );
          planContext.stroke();
        }
      }
    }
  } else if (itemToDraw.type === "aquarium") {
    planContext.fillStyle = "rgba(92, 174, 202, .25)";
    planContext.strokeStyle = isItemSelected ? PLAN_ACCENT() : "rgba(178, 225, 238, .9)";
    planContext.beginPath();
    planContext.rect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
    planContext.fill();
    planContext.stroke();
    // 内圈 = 缸体（上下口框外沿 1.46 × 0.51），外圈 = 底柜台面（1.5 × 0.55），两圈之比直接
    const aquariumTankWidthRatio = 1.46 / 1.5;
    const aquariumTankDepthRatio = 0.51 / 0.55;
    planContext.strokeRect(
      (-aquariumTankWidthRatio / 2) * itemWidthPx,
      (-aquariumTankDepthRatio / 2) * itemDepthPx,
      aquariumTankWidthRatio * itemWidthPx,
      aquariumTankDepthRatio * itemDepthPx
    );
    for (const fishOffset of [-0.25, 0.18]) {
      planContext.beginPath();
      planContext.arc(
        itemWidthPx * fishOffset,
        itemDepthPx * (fishOffset > 0 ? 0.08 : -0.06),
        Math.max(2, itemDepthPx * 0.08),
        0,
        Math.PI * 2
      );
      planContext.stroke();
    }
  } else if (itemToDraw.type === "coffeetable") {
    // 组合茶几：两块叠合错位的石材 —— 下方是通体黑石座，上方是向左悬挑的白石板。
    const coffeeTableBaseLengthRatio = 1.72 / 1.9;
    const coffeeTableBaseOffsetRatio = 0.09 / 1.9;
    const coffeeTableTopLengthRatio = 1.0 / 1.9;
    const coffeeTableTopOffsetRatio = -0.45 / 1.9;
    const coffeeTableTopDepthRatio = 0.85 / 1.05;
    const coffeeTableCornerRadiusPx = Math.min(itemWidthPx, itemDepthPx) * 0.02;
    // 先画石座（它在下面、也是外轮廓那一件），再画石板压上去；两层同一枚填充色带透明度，
    planContext.beginPath();
    planContext.roundRect(
      (-coffeeTableBaseLengthRatio / 2 + coffeeTableBaseOffsetRatio) * itemWidthPx,
      -itemDepthPx / 2,
      coffeeTableBaseLengthRatio * itemWidthPx,
      itemDepthPx,
      coffeeTableCornerRadiusPx
    );
    planContext.fill();
    planContext.stroke();
    planContext.beginPath();
    planContext.roundRect(
      (-coffeeTableTopLengthRatio / 2 + coffeeTableTopOffsetRatio) * itemWidthPx,
      (-coffeeTableTopDepthRatio / 2) * itemDepthPx,
      coffeeTableTopLengthRatio * itemWidthPx,
      coffeeTableTopDepthRatio * itemDepthPx,
      coffeeTableCornerRadiusPx
    );
    planContext.fill();
    planContext.stroke();
  } else if (ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(itemToDraw.type)) {
    planContext.beginPath();
    planContext.ellipse(0, 0, itemWidthPx * 0.32, itemDepthPx * 0.32, 0, 0, Math.PI * 2);
    planContext.fill();
    planContext.stroke();
    for (const [turntableKnobX, turntableKnobY] of [
      [-0.38, 0],
      [0.38, 0],
      [0, -0.38],
      [0, 0.38]
    ]) {
      planContext.beginPath();
      planContext.roundRect(
        itemWidthPx * turntableKnobX - itemWidthPx * 0.085,
        itemDepthPx * turntableKnobY - itemDepthPx * 0.095,
        itemWidthPx * 0.17,
        itemDepthPx * 0.19,
        Math.min(itemWidthPx, itemDepthPx) * 0.035
      );
      planContext.fill();
      planContext.stroke();
    }
    if (isRoundTableTurntableItem(itemToDraw)) {
      planContext.beginPath();
      planContext.ellipse(0, 0, itemWidthPx * 0.18, itemDepthPx * 0.18, 0, 0, Math.PI * 2);
      planContext.fill();
      planContext.stroke();
    }
  } else if (itemToDraw.type === "squarecoffeetable") {
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.47,
      -itemDepthPx * 0.47,
      itemWidthPx * 0.94,
      itemDepthPx * 0.94,
      Math.min(itemWidthPx, itemDepthPx) * 0.08
    );
    planContext.fill();
    planContext.stroke();
    planContext.strokeRect(
      -itemWidthPx * 0.33,
      -itemDepthPx * 0.38,
      itemWidthPx * 0.66,
      itemDepthPx * 0.76
    );
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.11, -itemDepthPx * 0.38);
    planContext.lineTo(-itemWidthPx * 0.11, itemDepthPx * 0.38);
    planContext.moveTo(itemWidthPx * 0.11, -itemDepthPx * 0.38);
    planContext.lineTo(itemWidthPx * 0.11, itemDepthPx * 0.38);
    planContext.stroke();
    planContext.fillStyle = "rgba(25, 34, 43, .58)";
    // 四条方腿在四角：x = ±0.66 / 1.4、z = ±0.32 / 0.7（原先取 ±0.39 / ±0.34，
    for (const screwOffsetX of [-0.47, 0.47]) {
      for (const screwOffsetY of [-0.45, 0.45]) {
        planContext.beginPath();
        planContext.arc(
          itemWidthPx * screwOffsetX,
          itemDepthPx * screwOffsetY,
          Math.max(1.5, Math.min(itemWidthPx, itemDepthPx) * 0.045),
          0,
          Math.PI * 2
        );
        planContext.fill();
      }
    }
  } else if (itemToDraw.type === "piano") {
    const pianoPlanShape = {
      start: [1, 1],
      path: [
        { lineTo: [-1, 1] },
        { lineTo: [-0.972, 0.72] },
        { curveTo: [[-0.944, 0.3], [-0.806, 0.12]] },
        { curveTo: [[-0.722, 0.02], [-0.42, 0]] },
        { curveTo: [[-0.14, 0.03], [0.06, 0.16]] },
        { curveTo: [[0.44, 0.34], [0.64, 0.6]] },
        { curveTo: [[0.86, 0.8], [1, 0.94]] },
        { lineTo: [1, 1] }
      ]
    };
    const pianoPlanPoint = ([u, v]: any) => [
      u * 0.96 * (itemWidthPx / 2),
      (v * 1.29 - 0.74) * (itemDepthPx / 1.5)
    ];
    const pianoPlanStart = pianoPlanPoint(pianoPlanShape.start);
    planContext.beginPath();
    planContext.moveTo(pianoPlanStart[0], pianoPlanStart[1]);
    for (const pianoPlanSegment of pianoPlanShape.path) {
      if (pianoPlanSegment.lineTo) {
        const [segmentX, segmentY] = pianoPlanPoint(pianoPlanSegment.lineTo);
        planContext.lineTo(segmentX, segmentY);
      } else {
        const [controlPoint, endPoint] = pianoPlanSegment.curveTo;
        const [controlX, controlY] = pianoPlanPoint(controlPoint);
        const [endX, endY] = pianoPlanPoint(endPoint);
        planContext.quadraticCurveTo(controlX, controlY, endX, endY);
      }
    }
    planContext.closePath();
    planContext.fill();
    planContext.stroke();
    // 键盘条：琴身前方那 20cm 的实体（键床 + 键侧木），0.55 → 0.75 —— 整件最宽的一段。
    planContext.beginPath();
    planContext.rect(
      -itemWidthPx / 2,
      (0.55 * (itemDepthPx / 1.5)),
      itemWidthPx,
      0.2 * (itemDepthPx / 1.5)
    );
    planContext.fill();
    planContext.stroke();
  } else if (itemToDraw.type === "floorlamp") {
    const floorLampLeftX = -itemWidthPx * 0.34;
    const floorLampRightX = itemWidthPx * 0.31;
    const floorLampLeftRadiusPx = Math.min(itemDepthPx * 0.34, itemWidthPx * 0.13);
    const floorLampRightRadiusPx = Math.min(itemDepthPx * 0.46, itemWidthPx * 0.14);
    planContext.lineCap = "round";
    planContext.lineWidth = isItemSelected ? 2.4 : 1.5;
    planContext.beginPath();
    planContext.moveTo(floorLampLeftX, 0);
    planContext.lineTo(floorLampRightX, 0);
    planContext.stroke();
    planContext.beginPath();
    planContext.arc(floorLampLeftX, 0, floorLampLeftRadiusPx, 0, Math.PI * 2);
    planContext.fill();
    planContext.stroke();
    planContext.beginPath();
    planContext.arc(floorLampRightX, 0, floorLampRightRadiusPx, 0, Math.PI * 2);
    planContext.fill();
    planContext.stroke();
  } else if (itemToDraw.type === "toilet") {
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.42, -itemDepthPx * 0.42);
    planContext.lineTo(itemWidthPx * 0.42, -itemDepthPx * 0.42);
    planContext.bezierCurveTo(
      itemWidthPx * 0.48,
      -itemDepthPx * 0.08,
      itemWidthPx * 0.48,
      itemDepthPx * 0.28,
      0,
      itemDepthPx * 0.48
    );
    planContext.bezierCurveTo(
      -itemWidthPx * 0.48,
      itemDepthPx * 0.28,
      -itemWidthPx * 0.48,
      -itemDepthPx * 0.08,
      -itemWidthPx * 0.42,
      -itemDepthPx * 0.42
    );
    planContext.closePath();
    planContext.fill();
    planContext.stroke();
  } else if (itemToDraw.type === "squattoilet") {
    // 蹲便器俯视：外面一圈是便槽边沿，中间那道圆角矩形是**槽口**（宽 0.33m / 进深 0.43m，
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx / 2,
      -itemDepthPx / 2,
      itemWidthPx,
      itemDepthPx,
      Math.min(itemWidthPx, itemDepthPx) * 0.12
    );
    planContext.fill();
    planContext.stroke();
    const squatToiletBowlWidthRatio = 0.33 / 0.45;
    const squatToiletBowlDepthRatio = 0.43 / 0.65;
    const squatToiletBowlCenterRatio = 0.05 / 0.65;
    planContext.beginPath();
    planContext.roundRect(
      (-squatToiletBowlWidthRatio / 2) * itemWidthPx,
      (-squatToiletBowlDepthRatio / 2 + squatToiletBowlCenterRatio) * itemDepthPx,
      squatToiletBowlWidthRatio * itemWidthPx,
      squatToiletBowlDepthRatio * itemDepthPx,
      Math.min(itemWidthPx, itemDepthPx) * 0.08
    );
    planContext.stroke();
  } else if (itemToDraw.type === "urinal") {
    // 小便斗俯视：外框就是壳体（0.38 × 0.34 全都用上），里面那块圆角矩形是**腔口**
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx / 2,
      -itemDepthPx / 2,
      itemWidthPx,
      itemDepthPx,
      Math.min(itemWidthPx, itemDepthPx) * 0.147
    );
    planContext.fill();
    planContext.stroke();
    const urinalCavityWidthRatio = 0.28 / 0.38;
    const urinalCavityFrontRatio = 0.10 / 0.34;
    planContext.beginPath();
    planContext.roundRect(
      (-urinalCavityWidthRatio / 2) * itemWidthPx,
      -itemDepthPx / 2,
      urinalCavityWidthRatio * itemWidthPx,
      (urinalCavityFrontRatio + 0.5) * itemDepthPx,
      Math.min(itemWidthPx, itemDepthPx) * 0.1
    );
    planContext.stroke();
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.42, urinalCavityFrontRatio * itemDepthPx);
    planContext.lineTo(itemWidthPx * 0.42, urinalCavityFrontRatio * itemDepthPx);
    planContext.stroke();
    // 顶部进水帽的落点（0.065m 直径，压在靠墙那侧）。
    planContext.beginPath();
    planContext.arc(
      0,
      -itemDepthPx * 0.265,
      Math.max(1.5, Math.min(itemWidthPx, itemDepthPx) * 0.09),
      0,
      Math.PI * 2
    );
    planContext.stroke();
  } else if (itemToDraw.type === "bathtub") {
    // 浴缸俯视：外框是缸壁外沿（1.70 × 0.78，四角与规格同半径），里面那圈是**缸口内沿**
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.48,
      -itemDepthPx * 0.45,
      itemWidthPx * 0.96,
      itemDepthPx * 0.9,
      Math.min(itemWidthPx, itemDepthPx) * 0.36
    );
    planContext.fill();
    planContext.stroke();
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.45,
      -itemDepthPx * 0.397,
      itemWidthPx * 0.9,
      itemDepthPx * 0.794,
      Math.min(itemWidthPx, itemDepthPx) * 0.24
    );
    planContext.stroke();
  } else if (itemToDraw.type === "basin") {
    // 台盆柜俯视：整件就是石材台面（0.90 × 0.50），台面上一个台上盆 + 盆后一支龙头。
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx / 2,
      -itemDepthPx / 2,
      itemWidthPx,
      itemDepthPx,
      Math.min(itemWidthPx, itemDepthPx) * 0.05
    );
    planContext.fill();
    planContext.stroke();
    // 台上盆：Ø0.37m 的圆 —— 宽里占 0.411、深里占 0.74，两个方向比例不同，用椭圆。
    planContext.beginPath();
    planContext.ellipse(0, 0, itemWidthPx * 0.205, itemDepthPx * 0.37, 0, 0, Math.PI * 2);
    planContext.stroke();
    // 龙头立柱落在靠墙那侧（缸后 0.155m）。
    planContext.beginPath();
    planContext.arc(
      0,
      -itemDepthPx * 0.31,
      Math.max(1.5, Math.min(itemWidthPx, itemDepthPx) * 0.045),
      0,
      Math.PI * 2
    );
    planContext.stroke();
  } else if (itemToDraw.type === "walllamp") {
    planContext.beginPath();
    planContext.arc(0, 0, Math.min(itemWidthPx, itemDepthPx) * 0.36, 0, Math.PI * 2);
    planContext.fill();
    planContext.stroke();
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.42, itemDepthPx * 0.38);
    planContext.lineTo(itemWidthPx * 0.42, itemDepthPx * 0.38);
    planContext.stroke();
  } else if (itemToDraw.type === "glasspartition") {
    // 玻璃隔断俯视：中间那片半透明是玻璃（1.20 × 0.012，实际只有一条缝），两端 0.05m 宽的
    planContext.fillStyle = "rgba(169, 197, 211, .2)";
    planContext.strokeStyle = isItemSelected ? PLAN_ACCENT() : "rgba(183, 218, 231, .82)";
    planContext.beginPath();
    planContext.rect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
    planContext.fill();
    planContext.stroke();
    planContext.fillStyle = "rgba(120, 132, 141, .5)";
    planContext.fillRect(itemWidthPx * 0.4583, -itemDepthPx / 2, itemWidthPx * 0.0417, itemDepthPx);
    planContext.fillRect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx * 0.0417, itemDepthPx);
    // 竖向拉手（整件里唯一凸出玻璃面的东西，位置上必须留个记号）。
    planContext.beginPath();
    planContext.arc(
      itemWidthPx * 0.35,
      itemDepthPx * 0.25,
      Math.max(1.5, Math.min(itemWidthPx, itemDepthPx) * 0.3),
      0,
      Math.PI * 2
    );
    planContext.stroke();
  } else if (itemToDraw.type === "shower") {
    // 淋浴房俯视：外框是 0.90 × 0.90 的底盘，内圈是底盘的内凹面，靠墙（-y）那侧有立柱落点，
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx / 2,
      -itemDepthPx / 2,
      itemWidthPx,
      itemDepthPx,
      Math.min(itemWidthPx, itemDepthPx) * 0.033
    );
    planContext.fill();
    planContext.stroke();
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.411,
      -itemDepthPx * 0.411,
      itemWidthPx * 0.822,
      itemDepthPx * 0.822,
      Math.min(itemWidthPx, itemDepthPx) * 0.044
    );
    planContext.stroke();
    planContext.strokeRect(
      -itemWidthPx * 0.078,
      -itemDepthPx * 0.367,
      itemWidthPx * 0.156,
      itemDepthPx * 0.156
    );
    planContext.beginPath();
    planContext.arc(
      0,
      -itemDepthPx * 0.467,
      Math.max(1.5, Math.min(itemWidthPx, itemDepthPx) * 0.024),
      0,
      Math.PI * 2
    );
    planContext.stroke();
  } else if (itemToDraw.type === "storagewaterheater") {
    planContext.beginPath();
    planContext.ellipse(0, 0, itemWidthPx * 0.46, itemDepthPx * 0.44, 0, 0, Math.PI * 2);
    planContext.fill();
    planContext.stroke();
    planContext.fillStyle = "rgba(47, 58, 69, .82)";
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.2,
      -itemDepthPx * 0.28,
      itemWidthPx * 0.4,
      itemDepthPx * 0.22,
      Math.min(itemWidthPx, itemDepthPx) * 0.08
    );
    planContext.fill();
    planContext.strokeStyle = "rgba(25, 34, 43, .5)";
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.3, itemDepthPx * 0.36);
    planContext.lineTo(-itemWidthPx * 0.3, itemDepthPx * 0.52);
    planContext.moveTo(itemWidthPx * 0.3, itemDepthPx * 0.36);
    planContext.lineTo(itemWidthPx * 0.3, itemDepthPx * 0.52);
    planContext.stroke();
  } else if (itemToDraw.type === "gaswaterheater") {
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.46,
      -itemDepthPx * 0.46,
      itemWidthPx * 0.92,
      itemDepthPx * 0.92,
      Math.min(itemWidthPx, itemDepthPx) * 0.1
    );
    planContext.fill();
    planContext.stroke();
    planContext.fillStyle = "rgba(47, 58, 69, .82)";
    planContext.fillRect(
      -itemWidthPx * 0.22,
      -itemDepthPx * 0.26,
      itemWidthPx * 0.44,
      itemDepthPx * 0.17
    );
    planContext.strokeStyle = "rgba(25, 34, 43, .5)";
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.24, itemDepthPx * 0.44);
    planContext.lineTo(-itemWidthPx * 0.24, itemDepthPx * 0.58);
    planContext.moveTo(0, itemDepthPx * 0.44);
    planContext.lineTo(0, itemDepthPx * 0.58);
    planContext.moveTo(itemWidthPx * 0.24, itemDepthPx * 0.44);
    planContext.lineTo(itemWidthPx * 0.24, itemDepthPx * 0.58);
    planContext.stroke();
  } else if (itemToDraw.type === "pipelinewaterpurifier") {
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.46,
      -itemDepthPx * 0.46,
      itemWidthPx * 0.92,
      itemDepthPx * 0.92,
      Math.min(itemWidthPx, itemDepthPx) * 0.08
    );
    planContext.fill();
    planContext.stroke();
    planContext.fillStyle = "rgba(31, 39, 45, .9)";
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx * 0.4,
      -itemDepthPx * 0.35,
      itemWidthPx * 0.8,
      itemDepthPx * 0.28,
      Math.min(itemWidthPx, itemDepthPx) * 0.05
    );
    planContext.fill();
    planContext.strokeStyle = "rgba(231, 235, 236, .74)";
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.12, -itemDepthPx * 0.18);
    planContext.lineTo(itemWidthPx * 0.12, -itemDepthPx * 0.18);
    planContext.stroke();
    planContext.fillStyle = "rgba(47, 58, 69, .7)";
    for (const purifierDotOffset of [-0.2, 0.2]) {
      planContext.beginPath();
      planContext.arc(
        itemWidthPx * purifierDotOffset,
        itemDepthPx * 0.18,
        Math.max(1.5, Math.min(itemWidthPx, itemDepthPx) * 0.055),
        0,
        Math.PI * 2
      );
      planContext.fill();
    }
    planContext.strokeStyle = "rgba(25, 34, 43, .5)";
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.26, itemDepthPx * 0.36);
    planContext.lineTo(-itemWidthPx * 0.26, itemDepthPx * 0.5);
    planContext.moveTo(itemWidthPx * 0.26, itemDepthPx * 0.36);
    planContext.lineTo(itemWidthPx * 0.26, itemDepthPx * 0.5);
    planContext.stroke();
  } else if (itemToDraw.type === "tea_bar_machine") {
    planContext.beginPath();
    planContext.rect(
      -itemWidthPx * 0.46,
      -itemDepthPx * 0.46,
      itemWidthPx * 0.92,
      itemDepthPx * 0.92
    );
    planContext.fill();
    planContext.stroke();
    planContext.fillStyle = "rgba(38, 44, 47, .86)";
    planContext.fillRect(
      -itemWidthPx * 0.38,
      -itemDepthPx * 0.36,
      itemWidthPx * 0.76,
      itemDepthPx * 0.2
    );
    planContext.strokeStyle = "rgba(25, 34, 43, .5)";
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.46, itemDepthPx * 0.08);
    planContext.lineTo(itemWidthPx * 0.46, itemDepthPx * 0.08);
    planContext.moveTo(-itemWidthPx * 0.46, itemDepthPx * 0.3);
    planContext.lineTo(itemWidthPx * 0.46, itemDepthPx * 0.3);
    planContext.stroke();
  } else if (["dishwasher", "steamoven", "microwave"].includes(itemToDraw.type)) {
    planContext.beginPath();
    planContext.rect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
    planContext.fill();
    planContext.stroke();
  } else if (itemToDraw.type === "ricecooker") {
    planContext.beginPath();
    planContext.ellipse(0, 0, itemWidthPx * 0.46, itemDepthPx * 0.46, 0, 0, Math.PI * 2);
    planContext.fill();
    planContext.stroke();
  } else if (ROUND_FOOTPRINT_ITEM_TYPES.has(itemToDraw.type)) {
    // 圆形占地的物件（落地扇 / 圆凳 / 圆茶几 / 圆桶类家电……）画圆而不是兜底的圆角矩形。
    planContext.beginPath();
    planContext.ellipse(0, 0, itemWidthPx / 2, itemDepthPx / 2, 0, 0, Math.PI * 2);
    planContext.fill();
    planContext.stroke();
  } else if (itemToDraw.type === "kitchenisland") {
    const islandBlockRatio = 0.8 / 2.4;
    const islandTableDepthRatio = 0.72 / 0.8;
    const islandLegThicknessRatio = 0.03 / 2.4;
    const islandLegDepthRatio = 0.6 / 0.8;
    const islandLegCenterRatio = 0.02 / 2.4;
    const islandBlockWidthPx = itemWidthPx * islandBlockRatio;
    // 高台：实心一块，贴 +x 端、进深占满（台面四周各出柜体 5cm，俯视就是占地那一圈边缘）。
    planContext.beginPath();
    planContext.roundRect(
      itemWidthPx / 2 - islandBlockWidthPx,
      -itemDepthPx / 2,
      islandBlockWidthPx,
      itemDepthPx,
      Math.min(6, islandBlockWidthPx / 5, itemDepthPx / 5)
    );
    planContext.fill();
    planContext.stroke();
    // 伸缩餐台：只描边。它是一块 0.75m 高的板，俯视没有「体」可填 —— 填了就又回到那个
    planContext.strokeRect(
      -itemWidthPx / 2,
      (-itemDepthPx * islandTableDepthRatio) / 2,
      itemWidthPx - islandBlockWidthPx,
      itemDepthPx * islandTableDepthRatio
    );
    // 板式支腿：外端那条真正落地的东西（窄板一块）。不画它，1.6m 的悬挑在平面上没有支撑点，
    planContext.fillRect(
      -itemWidthPx / 2 +
        itemWidthPx * islandLegCenterRatio -
        (itemWidthPx * islandLegThicknessRatio) / 2,
      (-itemDepthPx * islandLegDepthRatio) / 2,
      itemWidthPx * islandLegThicknessRatio,
      itemDepthPx * islandLegDepthRatio
    );
  } else {
    planContext.beginPath();
    planContext.roundRect(
      -itemWidthPx / 2,
      -itemDepthPx / 2,
      itemWidthPx,
      itemDepthPx,
      Math.min(6, itemWidthPx / 5, itemDepthPx / 5)
    );
    planContext.fill();
    planContext.stroke();
  }
  planContext.strokeStyle = "rgba(17, 24, 31, .5)";
  planContext.lineWidth = 1;
  if (ROUND_FOOTPRINT_ITEM_TYPES.has(itemToDraw.type)) {
    for (const ringRatio of (ROUND_PLAN_RING_RATIOS_BY_TYPE as any)[itemToDraw.type] ?? []) {
      planContext.beginPath();
      planContext.ellipse(
        0,
        0,
        (itemWidthPx * ringRatio) / 2,
        (itemDepthPx * ringRatio) / 2,
        0,
        0,
        Math.PI * 2
      );
      planContext.stroke();
    }
  } else if (itemToDraw.type === "piano") {
    // 钢琴这一层画两处：黑键带 + 三条琴腿（脚轮位置）。坐标全部按 3D 规格的米制值换算：
    const pianoDepthScale = itemDepthPx / 1.5;
    const pianoKeyBedTopPx = 0.55 * pianoDepthScale;
    const pianoKeyBedHeightPx = 0.2 * pianoDepthScale;
    // 黑键：88 键的标准布局是 7 组「2 + 3」共 35 个黑键，投影到平面上是一条断续的窄带 ——
    planContext.fillStyle = "rgba(17, 24, 31, .55)";
    planContext.fillRect(
      -itemWidthPx * 0.384,
      pianoKeyBedTopPx + pianoKeyBedHeightPx * 0.08,
      itemWidthPx * 0.768,
      pianoKeyBedHeightPx * 0.45
    );
    // 琴腿：低音侧前腿、高音侧前腿（都在键盘侧 z=0.6）、尾端一条（z=-0.18，约在琴身 43% 处）。
    planContext.fillStyle = "rgba(17, 24, 31, .35)";
    const pianoLegRadiusPx = Math.min(itemWidthPx, itemDepthPx) * 0.03;
    const pianoLegPoints = [
      [-0.384 * itemWidthPx, 0.6 * pianoDepthScale],
      [0.384 * itemWidthPx, 0.6 * pianoDepthScale],
      [-0.0128 * itemWidthPx, -0.18 * pianoDepthScale]
    ];
    for (const [pianoLegX, pianoLegY] of pianoLegPoints) {
      planContext.beginPath();
      planContext.arc(pianoLegX, pianoLegY, pianoLegRadiusPx, 0, Math.PI * 2);
      planContext.fill();
    }
  } else if (itemToDraw.type === "coffeetable") {
    // 组合茶几在这一层只画**石板的收边**：沿白石板内侧退一圈的细线，表示石板有厚度、不是一张纸。
    const coffeeTableTopLengthRatio = 1.0 / 1.9;
    const coffeeTableTopOffsetRatio = -0.45 / 1.9;
    const coffeeTableTopDepthRatio = 0.85 / 1.05;
    const coffeeTableEdgeInsetPx = Math.min(itemWidthPx, itemDepthPx) * 0.035;
    planContext.strokeRect(
      (-coffeeTableTopLengthRatio / 2 + coffeeTableTopOffsetRatio) * itemWidthPx + coffeeTableEdgeInsetPx,
      (-coffeeTableTopDepthRatio / 2) * itemDepthPx + coffeeTableEdgeInsetPx,
      coffeeTableTopLengthRatio * itemWidthPx - coffeeTableEdgeInsetPx * 2,
      coffeeTableTopDepthRatio * itemDepthPx - coffeeTableEdgeInsetPx * 2
    );
  } else if (itemToDraw.type === "bed") {
    planContext.strokeRect(
      -itemWidthPx * 0.4,
      -itemDepthPx * 0.4,
      itemWidthPx * 0.8,
      itemDepthPx * 0.23
    );
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx / 2, -itemDepthPx * 0.12);
    planContext.lineTo(itemWidthPx / 2, -itemDepthPx * 0.12);
    planContext.stroke();
  } else if (itemToDraw.type === "sofa") {
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx / 2, -itemDepthPx * 0.27);
    planContext.lineTo(itemWidthPx / 2, -itemDepthPx * 0.27);
    planContext.stroke();
    planContext.strokeRect(
      -itemWidthPx * 0.42,
      -itemDepthPx * 0.12,
      itemWidthPx * 0.84,
      itemDepthPx * 0.43
    );
  } else if (itemToDraw.type === "table") {
    // 桌面轮廓：1.5 × 0.9 的台面落在 2.4 × 1.8 的占地里（外沿那一圈是椅子）。
    planContext.strokeRect(
      -itemWidthPx * 0.3125,
      -itemDepthPx * 0.25,
      itemWidthPx * 0.625,
      itemDepthPx * 0.5
    );
    for (const tableLegOffsetX of [-0.283, 0.283]) {
      for (const tableLegOffsetY of [-0.211, 0.211]) {
        planContext.beginPath();
        planContext.arc(
          itemWidthPx * tableLegOffsetX,
          itemDepthPx * tableLegOffsetY,
          Math.max(1.5, Math.min(itemWidthPx, itemDepthPx) * 0.045),
          0,
          Math.PI * 2
        );
        planContext.stroke();
      }
    }
  } else if (
    ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(itemToDraw.type) &&
    isRoundTableTurntableItem(itemToDraw)
  ) {
    planContext.beginPath();
    planContext.arc(0, 0, Math.min(itemWidthPx, itemDepthPx) * 0.17, 0, Math.PI * 2);
    planContext.stroke();
  } else if (itemToDraw.type === "fridge") {
    if (itemToDraw.fridgeStyle === "double") {
      // 左右双开门：俯视读「两扇竖门的中缝」。中缝从正面（+y 为物件正面，与鞋柜同一约定）
      for (const fridgeSeamSign of [-1, 1]) {
        planContext.beginPath();
        planContext.moveTo(fridgeSeamSign * itemWidthPx * 0.02, itemDepthPx * 0.5);
        planContext.lineTo(fridgeSeamSign * itemWidthPx * 0.02, itemDepthPx * 0.05);
        planContext.stroke();
      }
    } else {
      planContext.beginPath();
      planContext.moveTo(-itemWidthPx / 2, -itemDepthPx * 0.12);
      planContext.lineTo(itemWidthPx / 2, -itemDepthPx * 0.12);
      planContext.stroke();
    }
  } else if (itemToDraw.type === "freezer") {
    // 顶开式冰柜：俯视最可读的信息是「顶盖分缝」——沿正面往内约 18% 进深画一条横线，
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.46, itemDepthPx * 0.3);
    planContext.lineTo(itemWidthPx * 0.46, itemDepthPx * 0.3);
    planContext.stroke();
    planContext.beginPath();
    planContext.arc(
      itemWidthPx * 0.34,
      itemDepthPx * 0.06,
      Math.min(itemWidthPx, itemDepthPx) * 0.07,
      0,
      Math.PI * 2
    );
    planContext.stroke();
  } else if (itemToDraw.type === "storagewaterheater") {
    planContext.beginPath();
    planContext.arc(0, 0, Math.min(itemWidthPx, itemDepthPx) * 0.26, 0, Math.PI * 2);
    planContext.stroke();
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.29, itemDepthPx * 0.36);
    planContext.lineTo(itemWidthPx * 0.29, itemDepthPx * 0.36);
    planContext.stroke();
  } else if (itemToDraw.type === "gaswaterheater") {
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.36, -itemDepthPx * 0.08);
    planContext.lineTo(itemWidthPx * 0.36, -itemDepthPx * 0.08);
    planContext.stroke();
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.3, itemDepthPx * 0.36);
    planContext.lineTo(itemWidthPx * 0.3, itemDepthPx * 0.36);
    planContext.stroke();
  } else if (itemToDraw.type === "pipelinewaterpurifier") {
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.3, itemDepthPx * 0.34);
    planContext.lineTo(itemWidthPx * 0.3, itemDepthPx * 0.34);
    planContext.stroke();
    planContext.beginPath();
    planContext.arc(
      itemWidthPx * 0.02,
      itemDepthPx * 0.16,
      Math.min(itemWidthPx, itemDepthPx) * 0.08,
      0,
      Math.PI * 2
    );
    planContext.stroke();
  } else if (itemToDraw.type === "shoecabinet") {
    // 中竖板 + 两列柜门的中缝：俯视把占地分成「左列换鞋凳 / 敞开鞋格」与「右列柜门」两段，
    const shoecabinetSeamRatio = 0.455 / 1.8;
    const shoecabinetSeamInsetPx = itemDepthPx * 0.45;
    planContext.beginPath();
    planContext.moveTo(0, -itemDepthPx / 2);
    planContext.lineTo(0, itemDepthPx / 2);
    for (const shoecabinetSeamSign of [-1, 1]) {
      planContext.moveTo(shoecabinetSeamSign * shoecabinetSeamRatio * itemWidthPx, itemDepthPx / 2);
      planContext.lineTo(
        shoecabinetSeamSign * shoecabinetSeamRatio * itemWidthPx,
        itemDepthPx / 2 - shoecabinetSeamInsetPx
      );
    }
    planContext.stroke();
  } else if (itemToDraw.type === "tea_bar_machine") {
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.38, -itemDepthPx * 0.02);
    planContext.lineTo(itemWidthPx * 0.38, -itemDepthPx * 0.02);
    planContext.moveTo(-itemWidthPx * 0.42, itemDepthPx * 0.2);
    planContext.lineTo(itemWidthPx * 0.42, itemDepthPx * 0.2);
    planContext.stroke();
  } else if (itemToDraw.type === "squattoilet") {
    // 槽底的排水篦子（0.14 × 0.10，压在靠墙那侧）—— 链 1 已经画出槽口，这里只补这一块。
    planContext.strokeRect(
      -itemWidthPx * 0.156,
      -itemDepthPx * 0.231,
      itemWidthPx * 0.311,
      itemDepthPx * 0.154
    );
  } else if (itemToDraw.type === "basin") {
    // 台面下柜体的前脸：双门的门缝（在正中）与两只拉手落点。俯视看不到门，但按既有符号的
    planContext.beginPath();
    planContext.moveTo(0, itemDepthPx * 0.4);
    planContext.lineTo(0, itemDepthPx * 0.5);
    planContext.stroke();
    for (const basinHandleSign of [-1, 1]) {
      planContext.beginPath();
      planContext.arc(
        basinHandleSign * itemWidthPx * 0.056,
        itemDepthPx * 0.44,
        Math.max(1.5, Math.min(itemWidthPx, itemDepthPx) * 0.05),
        0,
        Math.PI * 2
      );
      planContext.stroke();
    }
  } else if (["dishwasher", "steamoven", "microwave"].includes(itemToDraw.type)) {
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.42, itemDepthPx * 0.3);
    planContext.lineTo(itemWidthPx * 0.42, itemDepthPx * 0.3);
    planContext.stroke();
  } else if (itemToDraw.type === "glasspartition") {
    planContext.strokeStyle = "rgba(183, 218, 231, .72)";
    planContext.beginPath();
    planContext.moveTo(-itemWidthPx * 0.46, 0);
    planContext.lineTo(itemWidthPx * 0.46, 0);
    planContext.stroke();
  } else if (itemToDraw.type === "ricecooker") {
    planContext.beginPath();
    planContext.arc(
      0,
      -itemDepthPx * 0.04,
      Math.min(itemWidthPx, itemDepthPx) * 0.28,
      0,
      Math.PI * 2
    );
    planContext.stroke();
  } else if (itemToDraw.type === "tv") {
    if (itemToDraw.tvMountStyle === "mobile") {
      planContext.fillStyle = "rgba(46, 53, 61, .88)";
      planContext.fillRect(
        -itemWidthPx * 0.36,
        -itemDepthPx * 0.4,
        itemWidthPx * 0.72,
        itemDepthPx * 0.8
      );
      planContext.strokeRect(
        -itemWidthPx * 0.08,
        -itemDepthPx * 0.42,
        itemWidthPx * 0.16,
        itemDepthPx * 0.84
      );
    } else if (itemToDraw.tvMountStyle === "tabletop") {
      planContext.strokeRect(
        -itemWidthPx * 0.3,
        -itemDepthPx * 0.34,
        itemWidthPx * 0.6,
        itemDepthPx * 0.68
      );
    }
    planContext.fillStyle =
      itemToDraw.screenEnabled === false ? "rgba(8, 12, 15, .8)" : "rgba(48, 113, 153, .86)";
    planContext.fillRect(
      -itemWidthPx * 0.44,
      -itemDepthPx * 0.28,
      itemWidthPx * 0.88,
      itemDepthPx * 0.56
    );
    if (itemToDraw.screenEnabled !== false) {
      planContext.fillStyle = "rgba(255, 159, 54, .92)";
      planContext.fillRect(
        -itemWidthPx * 0.37,
        -itemDepthPx * 0.18,
        itemWidthPx * 0.05,
        itemDepthPx * 0.36
      );
    }
  } else if (itemToDraw.type === "plant") {
    const plantCanopyRadiusPx = Math.min(itemWidthPx, itemDepthPx) * 0.46;
    const plantSaucerRadiusPx = Math.min(itemWidthPx, itemDepthPx) * (0.38 / 0.75);
    planContext.beginPath();
    planContext.arc(0, 0, plantCanopyRadiusPx, 0, Math.PI * 2);
    planContext.stroke();
    planContext.beginPath();
    planContext.arc(0, 0, plantSaucerRadiusPx, 0, Math.PI * 2);
    planContext.stroke();
  } else if (STAIR_ITEM_TYPES.has(itemToDraw.type)) {
    if (itemToDraw.type === "stairs" || itemToDraw.type === "floatingstairs") {
      for (let stairTreadIndex = 1; stairTreadIndex < 10; stairTreadIndex += 1) {
        const stairTreadY = -itemDepthPx / 2 + (itemDepthPx * stairTreadIndex) / 10;
        planContext.beginPath();
        planContext.moveTo(-itemWidthPx / 2, stairTreadY);
        planContext.lineTo(itemWidthPx / 2, stairTreadY);
        planContext.stroke();
      }
      planContext.beginPath();
      planContext.moveTo(0, itemDepthPx * 0.34);
      planContext.lineTo(0, -itemDepthPx * 0.3);
      planContext.lineTo(-Math.min(itemWidthPx, itemDepthPx) * 0.08, -itemDepthPx * 0.2);
      planContext.moveTo(0, -itemDepthPx * 0.3);
      planContext.lineTo(Math.min(itemWidthPx, itemDepthPx) * 0.08, -itemDepthPx * 0.2);
      planContext.stroke();
    } else {
      // 钢 / 玻璃楼梯是 **U 形双跑**（见 model-specs.mjs 的 uStairLayout）：两跑并行、
      const stairFlightWidth = itemToDraw.type === "steelstairs" ? 0.9 : 1.225;
      const stairLandingDepth = 0.5;
      const stairRiserCount = 10;
      // 米 → 像素的换算率：本函数的像素尺寸来自 planFootprint（不是 itemToDraw.width），
      const stairPlanScaleX = itemWidthPx / planFootprint.width;
      const stairPlanScaleZ = itemDepthPx / planFootprint.depth;
      const stairFlightWidthPx = stairFlightWidth * stairPlanScaleX;
      const stairGapPx = itemWidthPx - stairFlightWidthPx * 2;
      const stairLandingDepthPx = stairLandingDepth * stairPlanScaleZ;
      const stairRunPx = itemDepthPx - stairLandingDepthPx;
      const stairTreadDepthPx = stairRunPx / stairRiserCount;
      const stairLandingFrontY = -itemDepthPx / 2 + stairLandingDepthPx;
      // 两跑的横向分界与平台前沿：这三条线是「这是双跑楼梯」在平面上唯一的读法。
      for (const stairGapSign of [-1, 1]) {
        planContext.beginPath();
        planContext.moveTo((stairGapSign * stairGapPx) / 2, -itemDepthPx / 2);
        planContext.lineTo((stairGapSign * stairGapPx) / 2, itemDepthPx / 2);
        planContext.stroke();
      }
      planContext.beginPath();
      planContext.moveTo(-itemWidthPx / 2, stairLandingFrontY);
      planContext.lineTo(itemWidthPx / 2, stairLandingFrontY);
      planContext.stroke();
      for (const stairFlightSign of [-1, 1]) {
        const stairFlightCenterX =
          stairFlightSign * (stairGapPx / 2 + stairFlightWidthPx / 2);
        for (let stairTreadIndex = 1; stairTreadIndex < stairRiserCount; stairTreadIndex += 1) {
          // 第一跑从 +z（画布下方）往平台升，第二跑从平台往 +z 升 —— 踏面线的起点因此相反。
          const stairTreadY =
            stairFlightSign < 0
              ? itemDepthPx / 2 - stairTreadDepthPx * stairTreadIndex
              : stairLandingFrontY + stairTreadDepthPx * stairTreadIndex;
          planContext.beginPath();
          planContext.moveTo(stairFlightCenterX - stairFlightWidthPx / 2, stairTreadY);
          planContext.lineTo(stairFlightCenterX + stairFlightWidthPx / 2, stairTreadY);
          planContext.stroke();
        }
      }
      // 上行箭头：沿第一跑指向平台，折到第二跑，再指回 +z 端（终点在第二跑的顶端）。
      const stairArrowSize = Math.min(itemWidthPx, itemDepthPx) * 0.08;
      const stairFirstFlightX = -(stairGapPx / 2 + stairFlightWidthPx / 2);
      const stairSecondFlightX = stairGapPx / 2 + stairFlightWidthPx / 2;
      planContext.beginPath();
      planContext.moveTo(stairFirstFlightX, itemDepthPx / 2 - stairTreadDepthPx * 0.4);
      planContext.lineTo(stairFirstFlightX, stairLandingFrontY + stairLandingDepthPx * 0.5);
      planContext.lineTo(stairSecondFlightX, stairLandingFrontY + stairLandingDepthPx * 0.5);
      planContext.lineTo(stairSecondFlightX, itemDepthPx / 2 - stairArrowSize);
      planContext.lineTo(stairSecondFlightX - stairArrowSize * 0.5, itemDepthPx / 2 - stairArrowSize * 1.7);
      planContext.moveTo(stairSecondFlightX, itemDepthPx / 2 - stairArrowSize);
      planContext.lineTo(stairSecondFlightX + stairArrowSize * 0.5, itemDepthPx / 2 - stairArrowSize * 1.7);
      planContext.stroke();
    }
  }
  if (isItemSelected) {
    // 选中框：与其余选中态同一枚令牌，不再写死「旧橙的 90%」。
    planContext.strokeStyle = PLAN_ACCENT();
    planContext.lineWidth = 1;
    planContext.setLineDash([5, 3]);
    planContext.strokeRect(-itemWidthPx / 2, -itemDepthPx / 2, itemWidthPx, itemDepthPx);
    planContext.setLineDash([]);
    const selectionHandleSizePx = 7;
    planContext.fillStyle = PLAN_HANDLE();
    for (const [selectionHandleX, selectionHandleY] of [
      [-itemWidthPx / 2, -itemDepthPx / 2],
      [itemWidthPx / 2, -itemDepthPx / 2],
      [itemWidthPx / 2, itemDepthPx / 2],
      [-itemWidthPx / 2, itemDepthPx / 2]
    ]) {
      planContext.fillRect(
        selectionHandleX - selectionHandleSizePx / 2,
        selectionHandleY - selectionHandleSizePx / 2,
        selectionHandleSizePx,
        selectionHandleSizePx
      );
      planContext.strokeRect(
        selectionHandleX - selectionHandleSizePx / 2,
        selectionHandleY - selectionHandleSizePx / 2,
        selectionHandleSizePx,
        selectionHandleSizePx
      );
    }
    const rotationHandleTipY = -itemDepthPx / 2 - 17;
    planContext.strokeStyle = PLAN_ACCENT();
    planContext.beginPath();
    planContext.moveTo(0, -itemDepthPx / 2);
    planContext.lineTo(0, rotationHandleTipY + 4);
    planContext.stroke();
    planContext.fillStyle = PLAN_HANDLE();
    planContext.beginPath();
    planContext.arc(0, rotationHandleTipY, 4, 0, Math.PI * 2);
    planContext.fill();
    planContext.stroke();
  }
  planContext.restore();
}

/**
 * 收集当前真正生效的灯具（供光照计算与渲染开销估算使用）。只留两条都成立的灯：所在灯光
 */
export function collectActiveLights() {
  return collectPreviewLights()
    .filter(
      ({ item: activeLightItem, group: activeLightGroup }: any) =>
        activeLightGroup?.enabled !== false && finite(activeLightItem.lightBrightness, 0) > 0
    )
    .map(({ item: activeLightEntry }: any) => activeLightEntry);
}

/**
 * 估算当前灯光配置的渲染开销，并给出本机预算。预览像素数优先取渲染画布的真实位图尺寸；画布未建好时
 */
export function measureLightRenderCost() {
  const activeLights = collectActiveLights();
  const costCanvasElement = state.renderer?.domElement;
  const previewPixels =
    costCanvasElement?.width && costCanvasElement?.height
      ? costCanvasElement.width * costCanvasElement.height
      : Math.max(window.innerWidth * window.innerHeight * 0.32, 120000);
  return {
    count: activeLights.length,
    cost: adaptiveLightRenderCost(
      activeLights.map((costLightItem: any) => ({
        type: costLightItem.type,
        angle: costLightItem.lightAngle,
        brightness: costLightItem.lightBrightness,
        enabled: true
      }))
    ),
    budget: adaptiveDeviceLightBudget({
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      previewPixels: previewPixels
    })
  };
}

export function updateAdaptiveRenderState() {
  if (isStageViewerMode) {
    state.isAdaptiveRenderActive = true;
    state.hasAdaptiveRenderProbe = true;
    return {
      count: 0,
      cost: 0,
      budget: 0
    };
  }
  const renderCost = measureLightRenderCost();
  const wasAdaptiveActive = state.isAdaptiveRenderActive;
  if (state.hasAdaptiveRenderProbe) {
    if (
      state.isAdaptiveRenderActive &&
      renderCost.cost < Math.min(renderCost.budget * 0.68, Math.max(state.adaptiveRenderCost * 0.55, 1))
    ) {
      state.isAdaptiveRenderActive = false;
      state.adaptiveRenderCost = 0;
      state.slowFrameStreak = 0;
    }
  } else {
    state.hasAdaptiveRenderProbe = true;
  }
  if (wasAdaptiveActive && !state.isAdaptiveRenderActive) {
    state.lightCacheRevision += 1;
    state.isLightCacheReady = false;
    state.needsLightCacheRefresh = false;
    setLightCacheVisible(false);
  }
  return renderCost;
}

/**
 * 当前是否应该用「光照缓存」渲染：自适应已激活且画面不在动。分区灯开启时一律返回 false ——
 */
export function isAdaptiveLightCacheEnabled() {
  if (isRegionLightingEnabled) {
    return false;
  } else {
    updateAdaptiveRenderState();
    return (
      state.isAdaptiveRenderActive &&
      !state.isEnvironmentActive &&
      !state.isCurtainMoving &&
      !state.isVacuumMoving &&
      !state.isBackgroundFrameVisible
    );
  }
}

/**
 * 显示 / 隐藏光照缓存图层。舞台模式下缓存图层与实时画布是叠着的两层，显示缓存时必须把
 */
export function setLightCacheVisible(shouldShowLightCache: any) {
  lightCacheCanvasElement.hidden = !shouldShowLightCache;
  if (isStageViewerMode && state.renderer) {
    state.renderer.domElement.style.opacity = shouldShowLightCache ? "0" : "1";
  }
}

/**
 * @returns {string} "all" 叠放全部楼层，"active" 只看当前楼层。
 */
export function currentPreviewFloorMode() {
  if (state.studioDocument?.previewFloorMode === "all" && state.studioDocument.floors.length > 1) {
    return "all";
  } else {
    return "active";
  }
}
