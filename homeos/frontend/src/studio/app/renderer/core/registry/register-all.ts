import { createVacuumMapImageLoader } from "../vacuum-map-state";
import { bindSceneMode } from "../scene-mode";
import { renderPercentageBarControl } from "./percentage-bar";
import { EntityRequestPolicy } from "../panel-caches";
import { randomUuid } from "../../../utils/random-id";
import {
  climateDefaultIcon,
  climateEffectMode,
  climateIsPoweredOn,
  climateModeLabel,
  climatePresentationMode,
  normalizeClimateCapabilities,
  resolveClimateDeviceType,
} from "../../controls/climate";
import { entityPowerIsOn } from "../entity-power";
import { lightRealtimeCapabilities } from "../../controls/light-runtime";
import {
  EventLogWallBuffer,
  buildEventLogFingerprint,
  createEventLogEntry,
  eventLogWallEntityName,
  isEventLogWallDomain,
  resolveEntityStateChangeMessage,
  resolveStateSnapshot,
} from "../../controls/event-log-runtime";
import {
  clampNumber,
  normalizeCssColor,
  applyTextOutline,
  resolveMdiIconUrl,
  isActiveStateText,
  createSvgElement,
  resolveStatePayload,
  buildHistorySeries,
  formatTimestamp,
  createHoverLineChart,
} from "./_shared";
import {
  cameraRadiusRatio,
  appendCameraFrame,
  mountCameraSnapshot,
  mountCameraMedia,
} from "./camera-media";
import {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport,
  lightStatisticsSummary,
} from "../../controls/light-statistics-runtime";
import {
  formatLineChartValue,
  formatNumericValue,
  lineChartGeometry,
} from "../../controls/line-chart-runtime";
import {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix,
} from "../../controls/door-window-runtime";
import {
  meteoconUrl,
  resolvedThresholds,
  smoothChartPath,
  thresholdColor,
  weatherVisual,
} from "../../controls/weather-chart-runtime";
import {
  formatLocalDate,
  formatLocalTime,
  formatLunarDate,
} from "../../controls/date-time-runtime";
import {
  formatPresenceDuration,
  presenceAnimationPhase,
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp,
} from "../../controls/presence-runtime";
import { renderLineChartDetails } from "./line-chart-details";
import { staticAssetImageSource, resolveAssetSource } from "./asset-state";
import {
  coverComponentIsDream,
  formatClimateStateLabel,
  formatEntityState,
  iconButtonEffectLightVisualAwaiting,
  iconButtonEffectLightVisualState,
  isClimatePoweredOn,
  isCoverAuthoredActive,
  isCoverComponentActive,
  isEntityComponentActive,
  resolveEntityIcon,
  vacuumMapImageSource,
} from "./cover-climate-state";
import { renderAirConditionerAirflowLayer } from "./airflow";
import { renderIconButtonEffectLayer } from "./icon-button-effect-layer";
import { renderEventLogWall } from "./event-log-wall";
import { buttonComponentRenderers } from "./button-renderers";
import { isEntityStateActive } from "./entity-state-active";
import {
  createDoorWindowSensorView,
  createWaterLeakSensorView,
  createSmokeSensorView,
  createNaturalGasSensorView,
} from "./sensor-views";
import { componentContentUnitsPx } from "./content-units";
import { navigationComponentRenderer } from "./navigation-button";

type RenderPropertyBag = any;
type ComponentControllerHooks = {
  syncFloorplanAutoDiagramState?: () => void;
  hbSyncVacuumMap?: () => void;
  syncLineChartState?: (...stateArgs: any[]) => any;
  cleanupLineChartHover?: () => void;
  pushEvent?: (...eventArgs: any[]) => any;
};

export function installRegistryComponents(registerComponent: (type: any, def: any) => void) {
  registerComponent("image", {
    render(imageComponent: any) {
      const imageProperties = imageComponent.properties || {},
        imageSourceUrl = staticAssetImageSource(imageProperties.assetId);
      if (!imageSourceUrl) {
        const missingImageNoticeElement = document.createElement("div");
        return (
          (missingImageNoticeElement.className = "hb-unknown-component"),
          (missingImageNoticeElement.textContent = "尚未选择图片"),
          missingImageNoticeElement
        );
      }
      const imageElement = document.createElement("img");
      return (
        (imageElement.className = "hb-image-component"),
        (imageElement.src = imageSourceUrl),
        (imageElement.alt = imageProperties.alt || imageProperties.label || "图片"),
        (imageElement.draggable = false),
        (imageElement.style.objectFit = "contain"),
        (imageElement.style.opacity = String(
          Math.max(0, Math.min(1, Number(imageProperties.opacity ?? 1))),
        )),
        imageElement
      );
    },
  });
  registerComponent("floorplan-auto-diagram", {
    render(diagramComponent: any, diagramRenderEnvironment: RenderPropertyBag = {}) {
      const diagramProperties = diagramComponent.properties || {},
        diagramContainerElement: HTMLDivElement & ComponentControllerHooks = document.createElement("div");
      if (
        ((diagramContainerElement.className = "hb-floorplan-auto-diagram"),
        diagramContainerElement.setAttribute(
          "aria-label",
          diagramProperties.label || diagramProperties.instanceName || "户型图自动导图",
        ),
        diagramRenderEnvironment.editable &&
          diagramProperties.previewReady === true &&
          (diagramProperties.generated !== true || diagramProperties.previewing === true))
      ) {
        const previewFrameElement = document.createElement("iframe");
        ((previewFrameElement.className =
          "hb-floorplan-auto-diagram-preview is-" +
          (diagramProperties.interactionMode === "view" ? "view" : "position") +
          "-mode"),
          (previewFrameElement.title = "3D户型图构图预览"));
        const dashboardCanvas = diagramRenderEnvironment.document?.canvas || {},
          componentPosition = diagramComponent.position || {},
          exportFolderName = diagramProperties.exportFolder || "自动导图-" + diagramComponent.id,
          previewSearchParams = new URLSearchParams({
            "auto-diagram-component": diagramComponent.id,
            "auto-diagram-embed": "1",
            "dashboard-width": String(Number(dashboardCanvas.width || 2778)),
            "dashboard-height": String(Number(dashboardCanvas.height || 1940)),
            "component-width": String(
              Math.max(1, Math.round(Number(componentPosition.width || 100))),
            ),
            "component-height": String(
              Math.max(1, Math.round(Number(componentPosition.height || 100))),
            ),
            "export-folder": exportFolderName,
          });
        (diagramProperties.floorSelection &&
          previewSearchParams.set("floor-selection", String(diagramProperties.floorSelection)),
          (previewFrameElement.src = "/3d-studio?" + previewSearchParams),
          previewFrameElement.setAttribute("allow", "fullscreen"),
          diagramContainerElement.append(previewFrameElement));
        const loadingElement = document.createElement("div");
        ((loadingElement.className = "hb-floorplan-auto-diagram-loading"),
          (loadingElement.innerHTML = '<i aria-hidden="true"></i><strong>正在加载3D户型…</strong>'),
          diagramContainerElement.append(loadingElement));
        const previewHintElement = document.createElement("div");
        return (
          (previewHintElement.className = "hb-floorplan-auto-diagram-preview-hint"),
          (previewHintElement.textContent =
            diagramProperties.interactionMode === "view"
              ? "拖动旋转 · 右键平移 · 滚轮缩放"
              : "拖动控件调整位置，右下角调整大小"),
          diagramContainerElement.append(previewHintElement),
          diagramContainerElement
        );
      }
      const baseImageElement = document.createElement("img");
      ((baseImageElement.className = "hb-floorplan-auto-diagram-base"),
        (baseImageElement.alt = "户型图"),
        (baseImageElement.draggable = false));
      const baseImageUrl = resolveAssetSource(
        diagramProperties.baseAssetId || diagramProperties.floorPlanAssetId || "",
      );
      (baseImageUrl
        ? (baseImageElement.src = baseImageUrl)
        : ((baseImageElement.className += " is-empty"), (baseImageElement.alt = "")),
        diagramContainerElement.append(baseImageElement));
      const lightLayerEntries: any = [],
        layerStates: any[] = [],
        syncDiagramState = () => {
          for (const lightLayerEntry of lightLayerEntries) {
            const isLayerActive = isEntityStateActive(
              lightLayerEntry.entityId,
              diagramRenderEnvironment,
            );
            (lightLayerEntry.image.classList.toggle(
              "is-active",
              isLayerActive || diagramRenderEnvironment.editable,
            ),
              lightLayerEntry.button.classList.toggle("is-active", isLayerActive),
              lightLayerEntry.button.setAttribute("aria-pressed", String(isLayerActive)));
          }
        },
        lightLayers = Array.isArray(diagramProperties.lightLayers)
          ? diagramProperties.lightLayers
          : [];
      for (const lightLayer of lightLayers) {
        const layerImageElement = document.createElement("img");
        ((layerImageElement.className = "hb-floorplan-auto-diagram-layer"),
          (layerImageElement.alt = ""),
          (layerImageElement.draggable = false));
        const layerImageUrl = resolveAssetSource(lightLayer.assetId || "");
        layerImageUrl && (layerImageElement.src = layerImageUrl);
        const lightGroupBinding = diagramComponent.bindings?.["lightGroup:" + lightLayer.id] || {},
          lightGroupEntityId = String(lightGroupBinding.entityId || lightLayer.entityId || ""),
          lightGroupButtonElement = document.createElement("button");
        ((lightGroupButtonElement.type = "button"),
          (lightGroupButtonElement.className = "hb-floorplan-auto-diagram-button"),
          (lightGroupButtonElement.textContent = lightLayer.name || lightLayer.note || "灯组"),
          lightLayer.note && (lightGroupButtonElement.title = lightLayer.note),
          lightGroupButtonElement.addEventListener("click", async (clickEvent) => {
            if (
              (clickEvent.preventDefault(),
              clickEvent.stopPropagation(),
              !(
                !lightGroupEntityId ||
                diagramRenderEnvironment.editable ||
                typeof diagramRenderEnvironment.callEntityService != "function"
              ))
            ) {
              lightGroupButtonElement.disabled = true;
              try {
                await diagramRenderEnvironment.callEntityService(
                  "homeassistant",
                  "toggle",
                  lightGroupEntityId,
                );
              } catch (toggleServiceError: any) {
                diagramRenderEnvironment.onError?.(toggleServiceError);
              } finally {
                lightGroupButtonElement.disabled = false;
              }
            }
          }),
          diagramContainerElement.append(layerImageElement, lightGroupButtonElement));
        const layerStateEntry = {
          image: layerImageElement,
          button: lightGroupButtonElement,
          entityId: lightGroupEntityId,
        };
        (lightLayerEntries.push(layerStateEntry),
          layerStates.push(lightGroupButtonElement),
          lightGroupEntityId &&
            typeof diagramRenderEnvironment.registerRuntimeStateHandler == "function" &&
            diagramRenderEnvironment.registerRuntimeStateHandler(
              lightGroupEntityId,
              syncDiagramState,
            ));
      }
      if (!baseImageUrl) {
        const emptyStateElement = document.createElement("div");
        ((emptyStateElement.className = "hb-floorplan-auto-diagram-empty"),
          (emptyStateElement.textContent = "请先完成户型和灯组，再生成导图"),
          diagramContainerElement.append(emptyStateElement));
      }
      return (
        (diagramContainerElement.syncFloorplanAutoDiagramState = syncDiagramState),
        syncDiagramState(),
        diagramContainerElement
      );
    },
  });
  (registerComponent("icon-button-effect", {
    render(iconButtonComponent: any, iconButtonRenderEnvironment: any) {
      const iconButtonProperties = iconButtonComponent.properties || {},
        isIconButtonActive = isCoverAuthoredActive(iconButtonComponent, iconButtonRenderEnvironment),
        shouldShowIcon =
          iconButtonRenderEnvironment?.isIconVisible?.(iconButtonComponent.id) !== false,
        iconButtonElement = document.createElement("div");
      ((iconButtonElement.className =
        "hb-icon-button-effect" + (isIconButtonActive ? " active" : "")),
        (iconButtonElement.hidden = iconButtonProperties.buttonVisible === false),
        (iconButtonElement.style.opacity = shouldShowIcon ? "1" : "0"),
        (iconButtonElement.style.transition = "opacity .24s ease"),
        iconButtonElement.style.setProperty(
          "--effect-button-color",
          normalizeCssColor(
            isIconButtonActive
              ? iconButtonProperties.buttonOnColor
              : iconButtonProperties.buttonOffColor,
            isIconButtonActive ? "#1f91b8" : "#17242d",
          ),
        ),
        iconButtonElement.style.setProperty(
          "--effect-button-opacity",
          clampNumber(iconButtonProperties.buttonOpacity, 0, 1, 0.92) * 100 + "%",
        ),
        iconButtonElement.style.setProperty(
          "--effect-frame-color",
          normalizeCssColor(iconButtonProperties.frameColor, "#dcebf2"),
        ),
        iconButtonElement.style.setProperty(
          "--effect-frame-width",
          clampNumber(iconButtonProperties.frameWidth, 0, 20, 1.5) + "px",
        ),
        iconButtonElement.style.setProperty(
          "--effect-frame-opacity",
          clampNumber(iconButtonProperties.frameOpacity, 0, 1, 0.72) * 100 + "%",
        ),
        iconButtonElement.style.setProperty(
          "--effect-radius",
          clampNumber(iconButtonProperties.radius, 0, 50, 50) + "%",
        ),
        iconButtonElement.style.setProperty(
          "--effect-glow-color",
          normalizeCssColor(iconButtonProperties.glowColor, "#43c8f0"),
        ));
      const glowIntensityScale = clampNumber(
        isIconButtonActive
          ? iconButtonProperties.glowOnStrength
          : iconButtonProperties.glowOffStrength,
        0,
        3,
        isIconButtonActive ? 1 : 0,
      );
      (iconButtonElement.style.setProperty("--effect-glow-size", 18 * glowIntensityScale + "px"),
        iconButtonElement.style.setProperty(
          "--effect-glow-inset-size",
          13 * glowIntensityScale + "px",
        ),
        iconButtonElement.style.setProperty(
          "--effect-glow-opacity",
          Math.min(100, glowIntensityScale * 38) + "%",
        ),
        iconButtonElement.style.setProperty(
          "--effect-glow-inset-opacity",
          Math.min(100, glowIntensityScale * 30) + "%",
        ));
      const iconMaskUrl = resolveMdiIconUrl(iconButtonProperties.icon || "mdi:lightbulb-outline");
      if (iconMaskUrl) {
        const iconElement = document.createElement("i");
        ((iconElement.className = "hb-icon-button-effect-icon"),
          (iconElement.style.transition = "opacity .24s ease"),
          (iconElement.style.opacity = shouldShowIcon ? "1" : "0"),
          (iconElement.style.backgroundColor = normalizeCssColor(
            isIconButtonActive ? iconButtonProperties.iconOnColor : iconButtonProperties.iconOffColor,
            isIconButtonActive ? "#ffffff" : "#9aa5ad",
          )),
          (iconElement.style.width = clampNumber(iconButtonProperties.iconSize, 1, 100, 44) + "%"),
          (iconElement.style.height = clampNumber(iconButtonProperties.iconSize, 1, 100, 44) + "%"),
          iconElement.style.setProperty("mask-image", 'url("' + iconMaskUrl + '")'),
          iconElement.style.setProperty("-webkit-mask-image", 'url("' + iconMaskUrl + '")'),
          iconButtonElement.append(iconElement));
      }
      return iconButtonElement;
    },
  }),
    registerComponent("title-button", {
      render(titleButtonComponent: any, titleButtonRenderEnvironment: any) {
        const titleButtonProperties = titleButtonComponent.properties || {},
          isHiddenContentClickable = titleButtonProperties.hiddenContentClickable === true,
          titleButtonWidthPx = Math.max(20, Number(titleButtonComponent.position?.width || 500)),
          titleButtonHeightPx = Math.max(20, Number(titleButtonComponent.position?.height || 122)),
          { height: titleUnitHeight } = componentContentUnitsPx(
            titleButtonComponent,
            titleButtonRenderEnvironment,
          ),
          titleButtonElement = document.createElement("div");
        if (
          ((titleButtonElement.className = "hb-title-button"),
          titleButtonElement.style.setProperty(
            "--title-frame-color",
            normalizeCssColor(titleButtonProperties.frameColor, "#60636a"),
          ),
          titleButtonElement.style.setProperty(
            "--title-frame-width",
            clampNumber(titleButtonProperties.frameWidth, 0, 12, 1.5) + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-frame-offset-x",
            clampNumber(titleButtonProperties.frameOffsetX, -100, 100, 0) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-frame-offset-y",
            clampNumber(titleButtonProperties.frameOffsetY, -100, 100, 0) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-main-size",
            clampNumber(titleButtonProperties.mainSize, 8, 200, 34) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-size",
            clampNumber(titleButtonProperties.secondarySize, 6, 100, 12) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-main-spacing",
            clampNumber(titleButtonProperties.mainSpacing, -20, 100, 1) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-spacing",
            clampNumber(titleButtonProperties.secondarySpacing, -20, 100, 2) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-line-gap",
            clampNumber(titleButtonProperties.secondaryLineGap, 0, 100, 2) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-main-left",
            clampNumber(titleButtonProperties.mainTextLeft, -100, 200, 5.5) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-main-top",
            clampNumber(titleButtonProperties.mainTextTop, -100, 200, 45) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-left",
            clampNumber(titleButtonProperties.secondaryTextLeft, -100, 200, 54) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-top",
            clampNumber(titleButtonProperties.secondaryTextTop, -100, 200, 43) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-icon-size",
            clampNumber(titleButtonProperties.iconSize, 1, 100, 30) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-icon-left",
            clampNumber(titleButtonProperties.iconLeft, -100, 200, 50) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-icon-top",
            clampNumber(titleButtonProperties.iconTop, -100, 200, 45) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-marker-left",
            clampNumber(titleButtonProperties.markerLeft, -100, 200, 1.8) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-marker-top",
            clampNumber(titleButtonProperties.markerTop, -100, 200, 84) + "%",
          ),
          titleButtonProperties.frameVisible !== false || isHiddenContentClickable)
        ) {
          const frameSizeRatio = clampNumber(titleButtonProperties.frameSize, 10, 300, 100) / 100,
            frameHeight = titleButtonHeightPx * 0.45 * frameSizeRatio,
            frameOffsetXPx =
              (titleButtonWidthPx * clampNumber(titleButtonProperties.frameOffsetX, -100, 100, 0)) /
              100,
            frameOffsetYPx =
              (titleButtonHeightPx * clampNumber(titleButtonProperties.frameOffsetY, -100, 100, 0)) /
              100,
            frameHalfSpacing =
              (titleButtonWidthPx * clampNumber(titleButtonProperties.frameSpacing, 0, 300, 100)) /
              200,
            frameCenterX = titleButtonWidthPx / 2 + frameOffsetXPx,
            frameCenterY = titleButtonHeightPx / 2 + frameOffsetYPx,
            frameTopEdge = frameCenterY - frameHeight / 2,
            frameBottomEdge = frameCenterY + frameHeight / 2,
            frameCornerInset = titleButtonHeightPx * 0.12,
            frameHalfWidth = clampNumber(titleButtonProperties.frameWidth, 0, 12, 1.5) / 2,
            frameLeftEdge = frameCenterX - frameHalfSpacing + frameHalfWidth,
            frameRightEdge = frameCenterX + frameHalfSpacing - frameHalfWidth,
            bracketsSvgElement = createSvgElement(titleButtonElement, "svg", {
              viewBox: "0 0 " + titleButtonWidthPx + " " + titleButtonHeightPx,
              preserveAspectRatio: "none",
              "aria-hidden": "true",
            });
          (bracketsSvgElement.setAttribute("class", "hb-title-button-brackets"),
            titleButtonProperties.frameVisible === false &&
              (bracketsSvgElement.style.visibility = "hidden"));
          const bracketPathAttributes = {
            fill: "none",
            stroke: normalizeCssColor(titleButtonProperties.frameColor, "#60636a"),
            "stroke-width": clampNumber(titleButtonProperties.frameWidth, 0, 12, 1.5),
            "stroke-opacity": 1,
            "stroke-linecap": "butt",
            "stroke-linejoin": "miter",
            "vector-effect": "non-scaling-stroke",
          };
          (createSvgElement(bracketsSvgElement, "path", {
            ...bracketPathAttributes,
            d:
              "M " +
              (frameLeftEdge + frameCornerInset) +
              " " +
              frameTopEdge +
              " H " +
              frameLeftEdge +
              " V " +
              frameBottomEdge +
              " H " +
              (frameLeftEdge + frameCornerInset),
          }),
            createSvgElement(bracketsSvgElement, "path", {
              ...bracketPathAttributes,
              d:
                "M " +
                (frameRightEdge - frameCornerInset) +
                " " +
                frameTopEdge +
                " H " +
                frameRightEdge +
                " V " +
                frameBottomEdge +
                " H " +
                (frameRightEdge - frameCornerInset),
            }));
        }
        if (titleButtonProperties.mainTextVisible !== false || isHiddenContentClickable) {
          const mainTextElement = document.createElement("strong");
          ((mainTextElement.className = "hb-title-button-main"),
            (mainTextElement.textContent = String(titleButtonProperties.mainText || "客厅")),
            (mainTextElement.style.color = normalizeCssColor(
              titleButtonProperties.mainColor,
              "#b9bbc0",
            )),
            titleButtonProperties.mainTextVisible === false &&
              (mainTextElement.style.visibility = "hidden"),
            applyTextOutline(
              mainTextElement,
              titleButtonProperties.mainWeight,
              clampNumber(titleButtonProperties.mainSize, 8, 200, 34),
            ),
            titleButtonElement.append(mainTextElement));
        }
        if (titleButtonProperties.secondaryTextVisible !== false || isHiddenContentClickable) {
          const secondaryTextElement = document.createElement("small");
          ((secondaryTextElement.className = "hb-title-button-secondary"),
            String(titleButtonProperties.secondaryText || "LIVING ROOM\nLIGHTING")
              .split(/\r?\n/)
              .slice(0, 2)
              .forEach((secondaryLineText) => {
                const secondaryLineElement = document.createElement("span");
                ((secondaryLineElement.textContent = secondaryLineText),
                  secondaryTextElement.append(secondaryLineElement));
              }),
            (secondaryTextElement.style.color = normalizeCssColor(
              titleButtonProperties.secondaryColor,
              "#70737b",
            )),
            titleButtonProperties.secondaryTextVisible === false &&
              (secondaryTextElement.style.visibility = "hidden"),
            applyTextOutline(
              secondaryTextElement,
              titleButtonProperties.secondaryWeight,
              clampNumber(titleButtonProperties.secondarySize, 6, 100, 12),
            ),
            titleButtonElement.append(secondaryTextElement));
        }
        if (titleButtonProperties.iconVisible !== false || isHiddenContentClickable) {
          const titleIconUrl = resolveMdiIconUrl(titleButtonProperties.icon || "");
          if (titleIconUrl) {
            const titleIconElement = document.createElement("i");
            ((titleIconElement.className = "hb-title-button-icon"),
              titleButtonProperties.iconVisible === false &&
                (titleIconElement.style.visibility = "hidden"),
              (titleIconElement.style.backgroundColor = normalizeCssColor(
                titleButtonProperties.iconColor,
                "#b9bbc0",
              )),
              titleIconElement.style.setProperty("mask-image", 'url("' + titleIconUrl + '")'),
              titleIconElement.style.setProperty("-webkit-mask-image", 'url("' + titleIconUrl + '")'),
              titleButtonElement.append(titleIconElement));
          }
        }
        if (titleButtonProperties.markerVisible !== false || isHiddenContentClickable) {
          const markerIconElement = document.createElement("i");
          ((markerIconElement.className = "hb-title-button-marker"),
            titleButtonProperties.markerVisible === false &&
              (markerIconElement.style.visibility = "hidden"),
            (markerIconElement.style.color = normalizeCssColor(
              titleButtonProperties.markerColor,
              "#f2a20d",
            )),
            (markerIconElement.style.borderTopColor = normalizeCssColor(
              titleButtonProperties.markerColor,
              "#f2a20d",
            )),
            markerIconElement.style.setProperty(
              "--title-marker-size",
              clampNumber(titleButtonProperties.markerSize, 2, 60, 10) * titleUnitHeight + "px",
            ),
            titleButtonElement.append(markerIconElement));
        }
        return titleButtonElement;
      },
    }),
    registerComponent("light-statistics", {
      render(lightStatisticsComponent: any, lightStatisticsRenderEnvironment: any) {
        const lightStatisticsProperties = lightStatisticsComponent.properties || {},
          lightStatisticsTotals = lightStatisticsSummary(
            lightStatisticsProperties.entityIds,
            lightStatisticsRenderEnvironment.states,
            lightStatisticsRenderEnvironment.entityMetadata,
          ),
          { width: statisticsUnitWidth, height: statisticsUnitHeight } = componentContentUnitsPx(
            lightStatisticsComponent,
            lightStatisticsRenderEnvironment,
          ),
          statisticsElement = document.createElement("div");
        ((statisticsElement.className = "hb-light-statistics"),
          statisticsElement.classList.toggle("active", lightStatisticsTotals.on > 0),
          (statisticsElement.dataset.total = String(lightStatisticsTotals.total)),
          (statisticsElement.dataset.on = String(lightStatisticsTotals.on)),
          (statisticsElement.dataset.off = String(lightStatisticsTotals.off)),
          (statisticsElement.dataset.abnormal = String(lightStatisticsTotals.abnormal)),
          statisticsElement.style.setProperty(
            "--light-statistics-icon-size",
            clampNumber(lightStatisticsProperties.iconSize, 1, 100, 42) * statisticsUnitHeight + "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-title-size",
            clampNumber(lightStatisticsProperties.titleSize, 8, 200, 32) * statisticsUnitHeight +
              "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-title-spacing",
            clampNumber(lightStatisticsProperties.titleSpacing, -20, 100, 1.2) *
              statisticsUnitHeight +
              "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-count-size",
            clampNumber(lightStatisticsProperties.countSize, 8, 200, 34) * statisticsUnitHeight +
              "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-count-spacing",
            clampNumber(lightStatisticsProperties.countSpacing, -20, 100, 0) * statisticsUnitHeight +
              "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-icon-gap",
            clampNumber(lightStatisticsProperties.iconGap, 0, 40, 4.5) * statisticsUnitWidth + "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-count-gap",
            clampNumber(lightStatisticsProperties.countGap, 0, 40, 4.5) * statisticsUnitWidth + "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-icon-color",
            normalizeCssColor(lightStatisticsProperties.iconColor, "#8b9298"),
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-icon-active-color",
            normalizeCssColor(lightStatisticsProperties.iconActiveColor, "#f2a20d"),
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-title-color",
            normalizeCssColor(lightStatisticsProperties.titleColor, "#b9bbc0"),
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-count-color",
            normalizeCssColor(lightStatisticsProperties.countColor, "#b9bbc0"),
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-count-active-color",
            normalizeCssColor(lightStatisticsProperties.countActiveColor, "#f2a20d"),
          ));
        const iconAssetId = Object.prototype.hasOwnProperty.call(lightStatisticsProperties, "icon")
            ? String(lightStatisticsProperties.icon || "")
            : "mdi:lightbulb-group-outline",
          statisticsIconUrl = resolveMdiIconUrl(iconAssetId),
          hasStatisticsIcon = lightStatisticsProperties.iconVisible !== false && !!statisticsIconUrl,
          isTitleVisible = lightStatisticsProperties.titleVisible !== false,
          isCountVisible = lightStatisticsProperties.countVisible !== false;
        if (
          (statisticsElement.classList.toggle("has-icon", hasStatisticsIcon),
          statisticsElement.classList.toggle("has-title", isTitleVisible),
          statisticsElement.classList.toggle("has-count", isCountVisible),
          hasStatisticsIcon)
        ) {
          const statisticsIconElement = document.createElement("i");
          ((statisticsIconElement.className = "hb-light-statistics-icon"),
            statisticsIconElement.style.setProperty("mask-image", 'url("' + statisticsIconUrl + '")'),
            statisticsIconElement.style.setProperty(
              "-webkit-mask-image",
              'url("' + statisticsIconUrl + '")',
            ),
            statisticsElement.append(statisticsIconElement));
        }
        if (isTitleVisible) {
          const statisticsTitleElement = document.createElement("strong");
          ((statisticsTitleElement.className = "hb-light-statistics-title"),
            (statisticsTitleElement.textContent = String(lightStatisticsProperties.title || "数量")),
            applyTextOutline(
              statisticsTitleElement,
              lightStatisticsProperties.titleWeight,
              clampNumber(lightStatisticsProperties.titleSize, 8, 200, 32),
            ),
            statisticsElement.append(statisticsTitleElement));
        }
        if (isCountVisible) {
          const statisticsCountElement = document.createElement("span");
          statisticsCountElement.className = "hb-light-statistics-count";
          const activeCountElement = document.createElement("b");
          if (
            ((activeCountElement.textContent = lightStatisticsTotals.total
              ? String(lightStatisticsTotals.on)
              : "--"),
            applyTextOutline(
              activeCountElement,
              lightStatisticsProperties.countWeight,
              clampNumber(lightStatisticsProperties.countSize, 8, 200, 34),
            ),
            statisticsCountElement.append(activeCountElement),
            lightStatisticsTotals.total)
          ) {
            const totalCountElement = document.createElement("em");
            ((totalCountElement.textContent = " / " + lightStatisticsTotals.total),
              statisticsCountElement.append(totalCountElement));
          }
          statisticsElement.append(statisticsCountElement);
        }
        return statisticsElement;
      },
    }));
  registerComponent("event-log-wall", {
    render: renderEventLogWall,
  });
  (registerComponent("icon-button", buttonComponentRenderers),
    registerComponent("device-button", buttonComponentRenderers));
  (registerComponent("presence-sensor", {
    render(sensorViewComponent: any, sensorViewRenderEnvironment: any) {
      const sensorProperties = sensorViewComponent.properties || {},
        sensorEntityId = sensorViewComponent.bindings?.entity?.entityId || "",
        sensorEntityState = sensorViewRenderEnvironment.states?.get(sensorEntityId),
        presenceMotionConfig = presenceMotionEventConfig(
          sensorEntityId,
          sensorEntityState,
          sensorViewRenderEnvironment.entityMetadata,
          sensorViewRenderEnvironment.states,
          sensorProperties,
        ),
        presencePresentation = presenceSensorPresentation(
          sensorEntityState,
          sensorViewRenderEnvironment.editable ? sensorViewRenderEnvironment.previewState : "auto",
          presenceMotionConfig,
        );
      if (sensorProperties.sensorKind === "door-window")
        return createDoorWindowSensorView(
          sensorViewComponent,
          sensorProperties,
          presencePresentation,
          sensorViewRenderEnvironment,
        );
      if (sensorProperties.sensorKind === "water-leak")
        return createWaterLeakSensorView(sensorProperties, presencePresentation);
      if (sensorProperties.sensorKind === "smoke")
        return createSmokeSensorView(sensorProperties, presencePresentation);
      if (sensorProperties.sensorKind === "natural-gas")
        return createNaturalGasSensorView(sensorProperties, presencePresentation);
      const occupiedAccentColor = normalizeCssColor(
          sensorProperties.iconOnColor || sensorProperties.occupiedColor,
          "#ffffff",
        ),
        clearAccentColor = normalizeCssColor(
          sensorProperties.iconColor || sensorProperties.clearColor,
          "#758189",
        ),
        contentUnits = componentContentUnitsPx(sensorViewComponent, sensorViewRenderEnvironment),
        presenceSensorElement = document.createElement("div");
      ((presenceSensorElement.className = "hb-presence-sensor is-" + presencePresentation.key),
        presenceSensorElement.classList.toggle(
          "is-halo-hidden",
          sensorProperties.haloVisible === false,
        ),
        presenceSensorElement.classList.toggle(
          "is-person-hidden",
          sensorProperties.personVisible === false,
        ),
        (presenceSensorElement.dataset.presenceState = presencePresentation.key),
        presenceSensorElement.style.setProperty("--hb-presence-occupied", occupiedAccentColor),
        presenceSensorElement.style.setProperty("--hb-presence-clear", clearAccentColor));
      const animationStrength = clampNumber(sensorProperties.animationStrength, 0, 1, 0.72),
        haloScale = clampNumber(sensorProperties.haloScale, 0.2, 3, 1),
        haloScaleX = clampNumber(sensorProperties.haloScaleX, 0.2, 3, haloScale),
        haloScaleY = clampNumber(sensorProperties.haloScaleY, 0.2, 3, haloScale),
        haloRotation = clampNumber(sensorProperties.haloRotation, -360, 360, 0),
        haloOpacity = clampNumber(sensorProperties.haloOpacity, 0, 1, 1),
        personScale = clampNumber(sensorProperties.personScale, 0.2, 3, 1),
        personRotation = clampNumber(sensorProperties.personRotation, -360, 360, 0),
        personOpacity = clampNumber(sensorProperties.personOpacity, 0, 1, 1),
        orbitDuration = clampNumber(sensorProperties.orbitDuration, 2, 60, 8);
      presenceSensorElement.style.setProperty("--hb-presence-motion", String(animationStrength));
      const waveDurationSeconds = Number((3.2 - animationStrength * 0.8).toFixed(2));
      if (
        (presenceSensorElement.style.setProperty(
          "--hb-presence-wave-duration",
          waveDurationSeconds + "s",
        ),
        presenceSensorElement.style.setProperty("--hb-presence-halo-scale-x", String(haloScaleX)),
        presenceSensorElement.style.setProperty("--hb-presence-halo-scale-y", String(haloScaleY)),
        presenceSensorElement.style.setProperty("--hb-presence-halo-rotation", haloRotation + "deg"),
        presenceSensorElement.style.setProperty("--hb-presence-halo-opacity", String(haloOpacity)),
        presenceSensorElement.style.setProperty("--hb-presence-person-scale", String(personScale)),
        presenceSensorElement.style.setProperty(
          "--hb-presence-person-rotation",
          personRotation + "deg",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-person-opacity",
          String(personOpacity),
        ),
        presenceSensorElement.style.setProperty("--hb-presence-orbit-duration", orbitDuration + "s"),
        presencePresentation.key === "occupied")
      ) {
        const animationPhase = presenceAnimationPhase(sensorEntityState, {
          orbit: orbitDuration,
          wave: waveDurationSeconds,
        });
        (presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-delay",
          animationPhase.orbitDelay,
        ),
          presenceSensorElement.style.setProperty(
            "--hb-presence-wave-delay",
            animationPhase.waveDelay,
          ),
          presenceSensorElement.style.setProperty(
            "--hb-presence-floor-delay",
            animationPhase.floorDelay,
          ),
          presenceSensorElement.style.setProperty(
            "--hb-presence-step-delay",
            animationPhase.stepDelay,
          ));
      }
      const orbitOffsetX = 32 * haloScaleX * contentUnits.width,
        orbitOffsetY = 13 * haloScaleY * contentUnits.height;
      (presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-x",
        orbitOffsetX.toFixed(4) + "px",
      ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-negative",
          (-orbitOffsetX).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y",
          orbitOffsetY.toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-negative",
          (-orbitOffsetY).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-diagonal",
          (orbitOffsetX * 0.707).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-diagonal-negative",
          (-orbitOffsetX * 0.707).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-diagonal",
          (orbitOffsetY * 0.707).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-diagonal-negative",
          (-orbitOffsetY * 0.707).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-shallow",
          (orbitOffsetX * 0.382683).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-shallow-negative",
          (-orbitOffsetX * 0.382683).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-steep",
          (orbitOffsetX * 0.92388).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-steep-negative",
          (-orbitOffsetX * 0.92388).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-shallow",
          (orbitOffsetY * 0.382683).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-shallow-negative",
          (-orbitOffsetY * 0.382683).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-steep",
          (orbitOffsetY * 0.92388).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-steep-negative",
          (-orbitOffsetY * 0.92388).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-person-width",
          22 * contentUnits.width + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-person-height",
          62 * contentUnits.height + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-copy-gap",
          7 * contentUnits.height + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-copy-main-size",
          20 * contentUnits.height + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-copy-secondary-size",
          10 * contentUnits.height + "px",
        ),
        presenceSensorElement.setAttribute("role", "img"),
        presenceSensorElement.setAttribute(
          "aria-label",
          "人在传感器：" + presencePresentation.label,
        ));
      const presenceVisualElement = document.createElement("div");
      presenceVisualElement.className = "hb-presence-sensor-visual";
      const presenceHaloElement = document.createElement("span");
      presenceHaloElement.className = "hb-presence-sensor-halo";
      const presenceSpaceElement = document.createElement("span");
      presenceSpaceElement.className = "hb-presence-sensor-space";
      for (let spaceDotIndex = 0; spaceDotIndex < 3; spaceDotIndex += 1)
        presenceSpaceElement.append(document.createElement("i"));
      const presencePersonElement = document.createElement("span");
      presencePersonElement.className = "hb-presence-sensor-person";
      const personHeadElement = document.createElement("i"),
        personTorsoElement = document.createElement("b"),
        personLeftArmElement = document.createElement("span");
      personLeftArmElement.className = "arm left";
      const personRightArmElement = document.createElement("span");
      personRightArmElement.className = "arm right";
      const personLeftLegElement = document.createElement("span");
      personLeftLegElement.className = "leg left";
      const personRightLegElement = document.createElement("span");
      ((personRightLegElement.className = "leg right"),
        presencePersonElement.append(
          personHeadElement,
          personTorsoElement,
          personLeftArmElement,
          personRightArmElement,
          personLeftLegElement,
          personRightLegElement,
        ));
      const presenceFloorElement = document.createElement("span");
      ((presenceFloorElement.className = "hb-presence-sensor-floor"),
        presenceHaloElement.append(presenceSpaceElement, presenceFloorElement));
      const presenceOrbitElement = document.createElement("span");
      presenceOrbitElement.className = "hb-presence-sensor-orbit";
      const presenceTravelerElement = document.createElement("span");
      if (
        ((presenceTravelerElement.className = "hb-presence-sensor-traveler"),
        presenceTravelerElement.append(presencePersonElement),
        presenceOrbitElement.append(presenceTravelerElement),
        presenceVisualElement.append(presenceHaloElement, presenceOrbitElement),
        presenceSensorElement.append(presenceVisualElement),
        !sensorViewRenderEnvironment.editable &&
          presenceMotionConfig.motionEvent &&
          presencePresentation.key === "occupied")
      ) {
        const stateTimestamp = presenceStateTimestamp(sensorEntityState),
          motionTimeoutRemainingMs = Number.isFinite(stateTimestamp)
            ? presenceMotionConfig.motionTimeoutSeconds * 1000 - (Date.now() - stateTimestamp!)
            : 0;
        if (motionTimeoutRemainingMs > 0) {
          const motionTimeoutHandle = window.setTimeout(
            () => sensorViewRenderEnvironment.invalidate?.(),
            motionTimeoutRemainingMs + 80,
          );
          sensorViewRenderEnvironment.cleanup(() => window.clearTimeout(motionTimeoutHandle));
        }
      }
      return presenceSensorElement;
    },
  }),
    registerComponent("air-conditioner", {
      render(airConditionerComponent: any, airConditionerRenderEnvironment: any) {
        const airConditionerProperties = airConditionerComponent.properties || {},
          airConditionerEntityId = airConditionerComponent.bindings?.entity?.entityId || "",
          airConditionerEntityState = resolveStatePayload(
            airConditionerRenderEnvironment.states?.get(airConditionerEntityId),
          ),
          airConditionerDeviceType = resolveClimateDeviceType(
            airConditionerComponent,
            airConditionerEntityState,
            airConditionerEntityId,
          ),
          isClimatePowered = isClimatePoweredOn(
            airConditionerComponent,
            airConditionerRenderEnvironment,
          ),
          { height: contentUnitHeight } = componentContentUnitsPx(
            airConditionerComponent,
            airConditionerRenderEnvironment,
          ),
          airConditionerElement = document.createElement("div");
        ((airConditionerElement.className =
          "hb-air-conditioner" + (isClimatePowered ? " active" : "")),
          airConditionerElement.style.setProperty(
            "--climate-icon-left",
            clampNumber(airConditionerProperties.iconLeft, -100, 200, 20) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-icon-top",
            clampNumber(airConditionerProperties.iconTop, -100, 200, 50) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-main-left",
            clampNumber(airConditionerProperties.mainTextLeft, -100, 200, 39) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-main-top",
            clampNumber(airConditionerProperties.mainTextTop, -100, 200, 40) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-secondary-left",
            clampNumber(airConditionerProperties.secondaryTextLeft, -100, 200, 39) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-secondary-top",
            clampNumber(airConditionerProperties.secondaryTextTop, -100, 200, 67) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-badge-color",
            normalizeCssColor(airConditionerProperties.badgeColor, "#5b5e66"),
          ),
          airConditionerElement.style.setProperty(
            "--climate-badge-opacity",
            clampNumber(airConditionerProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%",
          ));
        const airConditionerIconColor = normalizeCssColor(
          isClimatePowered
            ? airConditionerProperties.iconOnColor
            : airConditionerProperties.iconOffColor,
          isClimatePowered ? "#73c8ff" : "#9aa5ad",
        );
        (airConditionerElement.style.setProperty("--climate-icon-color", airConditionerIconColor),
          airConditionerElement.style.setProperty(
            "--climate-icon-glow-size",
            7 * contentUnitHeight + "px",
          ));
        const badgeSizePx = clampNumber(airConditionerProperties.badgeSize, 1, 100, 28),
          symbolSizePx = clampNumber(airConditionerProperties.symbolSize, 1, 100, 14);
        if (airConditionerProperties.iconVisible !== false) {
          const iconBadgeElement = document.createElement("span");
          ((iconBadgeElement.className = "hb-air-conditioner-icon-badge"),
            (iconBadgeElement.style.width = badgeSizePx * contentUnitHeight + "px"),
            (iconBadgeElement.style.height = badgeSizePx * contentUnitHeight + "px"));
          const configuredIconName = String(airConditionerProperties.icon || ""),
            resolvedIconName =
              airConditionerDeviceType === "bath-heater" &&
              (!configuredIconName || configuredIconName === "mdi:air-conditioner")
                ? climateDefaultIcon(airConditionerDeviceType)
                : configuredIconName || climateDefaultIcon(airConditionerDeviceType),
            resolvedIconUrl = resolveMdiIconUrl(resolvedIconName);
          if (resolvedIconUrl) {
            const airConditionerIconElement = document.createElement("i");
            airConditionerIconElement.className = "hb-air-conditioner-icon";
            const iconScalePercent = clampNumber((symbolSizePx / badgeSizePx) * 100, 1, 100, 50);
            ((airConditionerIconElement.style.width = iconScalePercent + "%"),
              (airConditionerIconElement.style.height = iconScalePercent + "%"),
              (airConditionerIconElement.style.backgroundColor = airConditionerIconColor),
              airConditionerIconElement.style.setProperty(
                "mask-image",
                'url("' + resolvedIconUrl + '")',
              ),
              airConditionerIconElement.style.setProperty(
                "-webkit-mask-image",
                'url("' + resolvedIconUrl + '")',
              ),
              iconBadgeElement.append(airConditionerIconElement));
          }
          airConditionerElement.append(iconBadgeElement);
        }
        const airConditionerTextElement = document.createElement("span");
        airConditionerTextElement.className = "hb-air-conditioner-text";
        const mainTextSizePx = clampNumber(airConditionerProperties.mainSize, 6, 120, 21),
          airConditionerMainTextElement = document.createElement("strong");
        ((airConditionerMainTextElement.textContent =
          String(airConditionerProperties.mainText || "").trim() ||
          String(
            airConditionerEntityState?.attributes?.friendly_name ||
              airConditionerEntityId ||
              (airConditionerDeviceType === "bath-heater" ? "未选择浴霸实体" : "未选择空调实体"),
          )),
          (airConditionerMainTextElement.style.color = normalizeCssColor(
            airConditionerProperties.mainColor,
            "#c7c8cb",
          )),
          (airConditionerMainTextElement.style.fontSize = mainTextSizePx * contentUnitHeight + "px"),
          (airConditionerMainTextElement.style.letterSpacing =
            clampNumber(airConditionerProperties.mainSpacing, -20, 100, 0.5) * contentUnitHeight +
            "px"),
          applyTextOutline(
            airConditionerMainTextElement,
            airConditionerProperties.mainWeight,
            mainTextSizePx,
          ));
        const secondaryTextSizePx = clampNumber(airConditionerProperties.secondarySize, 5, 80, 12),
          airConditionerSecondaryTextElement = document.createElement("small");
        return (
          (airConditionerSecondaryTextElement.textContent = airConditionerEntityId
            ? formatClimateStateLabel(airConditionerComponent, airConditionerRenderEnvironment)
            : "未选择实体"),
          (airConditionerSecondaryTextElement.style.color = normalizeCssColor(
            airConditionerProperties.secondaryColor,
            "#75777d",
          )),
          (airConditionerSecondaryTextElement.style.fontSize =
            secondaryTextSizePx * contentUnitHeight + "px"),
          (airConditionerSecondaryTextElement.style.letterSpacing =
            clampNumber(airConditionerProperties.secondarySpacing, -20, 100, 0.3) *
              contentUnitHeight +
            "px"),
          applyTextOutline(
            airConditionerSecondaryTextElement,
            airConditionerProperties.secondaryWeight,
            secondaryTextSizePx,
          ),
          airConditionerProperties.mainTextVisible !== false &&
            airConditionerTextElement.append(airConditionerMainTextElement),
          airConditionerProperties.secondaryTextVisible !== false &&
            airConditionerTextElement.append(airConditionerSecondaryTextElement),
          airConditionerTextElement.childElementCount &&
            airConditionerElement.append(airConditionerTextElement),
          airConditionerElement
        );
      },
    }));
  (registerComponent("camera", {
    render(cameraComponent: any, cameraRenderEnvironment: any) {
      const cameraProperties = cameraComponent.properties || {},
        boundCameraEntityId = cameraComponent.bindings?.entity?.entityId || "",
        cameraComponentElement = document.createElement("div");
      cameraComponentElement.className = "hb-camera-component";
      const cameraWidth = Math.max(1, Number(cameraComponent.position?.width || 320)),
        cameraHeight = Math.max(1, Number(cameraComponent.position?.height || 180)),
        cameraComponentScale = Math.max(
          0.01,
          Number(cameraRenderEnvironment.document?.canvas?.componentScale || 1),
        ),
        cornerRadiusPx =
          (Math.min(cameraWidth, cameraHeight) * cameraRadiusRatio(cameraProperties.radius)) /
          cameraComponentScale;
      if (
        ((cameraComponentElement.style.borderRadius = cornerRadiusPx + "px"),
        cameraRenderEnvironment.editable)
      ) {
        const editableCameraPlaceholderElement = document.createElement("div");
        ((editableCameraPlaceholderElement.className = "hb-camera-placeholder"),
          (editableCameraPlaceholderElement.textContent =
            cameraProperties.mediaVisible === false ? "摄像头画面已隐藏" : "编辑模式不加载实时画面"),
          cameraComponentElement.append(editableCameraPlaceholderElement));
      } else {
        if (cameraRenderEnvironment.liveMedia !== false && cameraProperties.mediaVisible !== false) {
          const runtimeCameraPlaceholderElement = document.createElement("div");
          runtimeCameraPlaceholderElement.className = "hb-camera-placeholder";
          const isSnapshotMode = cameraProperties.displayMode === "snapshot";
          if (
            ((runtimeCameraPlaceholderElement.textContent = boundCameraEntityId
              ? isSnapshotMode
                ? "正在载入摄像头快照"
                : "正在载入摄像头实时预览"
              : "未选择摄像头实体"),
            cameraComponentElement.append(runtimeCameraPlaceholderElement),
            boundCameraEntityId)
          ) {
            const cameraMountOptions = {
              container: cameraComponentElement,
              entityId: boundCameraEntityId,
              label:
                resolveStatePayload(cameraRenderEnvironment.states?.get(boundCameraEntityId))
                  ?.attributes?.friendly_name || boundCameraEntityId,
              objectFit: cameraProperties.fit === "contain" ? "contain" : "fill",
              placeholder: runtimeCameraPlaceholderElement,
              cleanup: (onComponentCleanup: any) => cameraRenderEnvironment.cleanup(onComponentCleanup),
            };
            isSnapshotMode
              ? mountCameraSnapshot({
                  ...cameraMountOptions,
                  refreshInterval: cameraProperties.refreshInterval,
                })
              : mountCameraMedia(cameraMountOptions);
          }
        }
      }
      return (
        appendCameraFrame(
          cameraComponentElement,
          cameraComponent,
          cameraProperties,
          cameraRenderEnvironment.renderNamespace,
        ),
        cameraComponentElement
      );
    },
  }),
    registerComponent("vacuum-map", {
      render(vacuumMapComponent: any, vacuumMapRenderEnvironment: any) {
        const vacuumMapProperties = vacuumMapComponent.properties || {},
          vacuumMapBoundEntityId = vacuumMapComponent.bindings?.entity?.entityId || "",
          vacuumMapComponentElement = document.createElement("div");
        if (
          ((vacuumMapComponentElement.className = "hb-vacuum-map-component"),
          (vacuumMapComponentElement.style.opacity = String(
            clampNumber(vacuumMapProperties.opacity, 0, 1, 0.5),
          )),
          vacuumMapComponentElement.setAttribute(
            "aria-label",
            vacuumMapProperties.label || "扫地机器人实时地图",
          ),
          !vacuumMapBoundEntityId)
        ) {
          if (vacuumMapRenderEnvironment.editable) {
            const missingEntityPlaceholderElement = document.createElement("span");
            ((missingEntityPlaceholderElement.className = "hb-vacuum-map-placeholder"),
              (missingEntityPlaceholderElement.textContent = "请选择实时地图实体"),
              vacuumMapComponentElement.append(missingEntityPlaceholderElement));
          }
          return vacuumMapComponentElement;
        }
        let vacuumMapImageElement: HTMLImageElement & ComponentControllerHooks = document.createElement("img");
        ((vacuumMapImageElement.className = "hb-vacuum-map-image"),
          (vacuumMapImageElement.alt =
            vacuumMapProperties.label ||
            resolveStatePayload(vacuumMapRenderEnvironment.states?.get(vacuumMapBoundEntityId))
              ?.attributes?.friendly_name ||
            vacuumMapBoundEntityId),
          (vacuumMapImageElement.draggable = false));
        const unavailableMapPlaceholderElement = document.createElement("span");
        ((unavailableMapPlaceholderElement.className = "hb-vacuum-map-placeholder"),
          (unavailableMapPlaceholderElement.textContent = "实时地图暂时不可用"),
          (unavailableMapPlaceholderElement.hidden = true),
          (vacuumMapImageElement.hidden = true),
          vacuumMapComponentElement.append(vacuumMapImageElement, unavailableMapPlaceholderElement));
        const vacuumMapImageLoader = createVacuumMapImageLoader({
            entityId: vacuumMapBoundEntityId,
            getState: () => vacuumMapRenderEnvironment.states?.get(vacuumMapBoundEntityId),
            isActive: () =>
              vacuumMapRenderEnvironment.liveMedia !== false &&
              document.visibilityState !== "hidden" &&
              vacuumMapImageElement.dataset.vacuumMapSuspended !== "true",
            onFrame(mapFramePayload: any) {
              ((mapFramePayload.className = vacuumMapImageElement.className),
                (mapFramePayload.alt = vacuumMapImageElement.alt),
                (mapFramePayload.draggable = false),
                (mapFramePayload.hbSyncVacuumMap = syncVacuumMapImage),
                vacuumMapImageElement.replaceWith(mapFramePayload),
                (vacuumMapImageElement = mapFramePayload),
                (vacuumMapImageElement.hidden = false),
                (unavailableMapPlaceholderElement.hidden = true));
            },
            onUnavailable() {
              ((vacuumMapImageElement.hidden = true),
                vacuumMapImageElement.removeAttribute("src"),
                (unavailableMapPlaceholderElement.hidden = !vacuumMapRenderEnvironment.editable));
            },
          }),
          syncVacuumMapImage = () => vacuumMapImageLoader.sync();
        vacuumMapImageElement.hbSyncVacuumMap = syncVacuumMapImage;
        const handleMapVisibilityChange = () => syncVacuumMapImage();
        return (
          document.addEventListener("visibilitychange", handleMapVisibilityChange),
          vacuumMapRenderEnvironment.liveMedia !== false && syncVacuumMapImage(),
          vacuumMapRenderEnvironment.cleanup(() => {
            (document.removeEventListener("visibilitychange", handleMapVisibilityChange),
              delete vacuumMapImageElement.hbSyncVacuumMap,
              vacuumMapImageLoader.dispose());
          }),
          vacuumMapComponentElement
        );
      },
    }),
    registerComponent("time", {
      render(timeComponent: any, timeRenderEnvironment: any) {
        const timeProperties = timeComponent.properties || {},
          timeFontSize = clampNumber(timeProperties.fontSize, 12, 500, 96),
          timeComponentElement = document.createElement("time");
        ((timeComponentElement.className = "hb-time-component"),
          (timeComponentElement.style.color = normalizeCssColor(timeProperties.color, "#248eb2")),
          (timeComponentElement.style.fontSize = timeFontSize + "px"),
          (timeComponentElement.style.letterSpacing =
            clampNumber(timeProperties.letterSpacing, -20, 100, 2.2) + "px"),
          (timeComponentElement.style.opacity = String(
            clampNumber(timeProperties.opacity, 0, 1, 1),
          )));
        const timeValueElement = document.createElement("span");
        ((timeValueElement.className = "hb-time-value"),
          applyTextOutline(timeValueElement, timeProperties.fontWeight, timeFontSize));
        const timePeriodElement = document.createElement("small");
        ((timePeriodElement.className = "hb-time-period"),
          applyTextOutline(timePeriodElement, timeProperties.fontWeight, timeFontSize * 0.5),
          timeComponentElement.append(timeValueElement, timePeriodElement));
        const updateClockDisplay = () => {
          const currentDate = new Date(),
            formattedTime = formatLocalTime(timeProperties, currentDate);
          ((timeComponentElement.dateTime = currentDate.toISOString()),
            (timeValueElement.textContent = formattedTime.value),
            (timePeriodElement.textContent = formattedTime.suffix),
            (timePeriodElement.hidden = !formattedTime.suffix));
        };
        updateClockDisplay();
        const clockTimerId = window.setInterval(
          updateClockDisplay,
          timeProperties.showSeconds === true ? 250 : 1000,
        );
        return (
          timeRenderEnvironment.cleanup(() => window.clearInterval(clockTimerId)),
          timeComponentElement
        );
      },
    }),
    registerComponent("date", {
      render(dateComponent: any, dateRenderEnvironment: any) {
        const dateProperties = dateComponent.properties || {},
          dateComponentElement = document.createElement("div");
        ((dateComponentElement.className = "hb-date-component"),
          (dateComponentElement.style.opacity = String(clampNumber(dateProperties.opacity, 0, 1, 1))),
          (dateComponentElement.style.gap = clampNumber(dateProperties.lineGap, 0, 200, 8) + "px"));
        const datePrimaryElement = document.createElement("strong");
        ((datePrimaryElement.className = "hb-date-primary"),
          (datePrimaryElement.style.color = normalizeCssColor(
            dateProperties.primaryColor,
            "#8d9296",
          )));
        const primaryFontSize = clampNumber(dateProperties.primarySize, 12, 500, 36);
        ((datePrimaryElement.style.fontSize = primaryFontSize + "px"),
          applyTextOutline(datePrimaryElement, dateProperties.primaryWeight, primaryFontSize),
          (datePrimaryElement.style.letterSpacing =
            clampNumber(dateProperties.primarySpacing, -20, 100, 1) + "px"),
          dateComponentElement.append(datePrimaryElement));
        let lunarElement: any = null;
        if (dateProperties.showLunar === true) {
          ((lunarElement = document.createElement("small")),
            (lunarElement.className = "hb-date-lunar"),
            (lunarElement.style.color = normalizeCssColor(dateProperties.lunarColor, "#7f878c")));
          const lunarFontSize = clampNumber(dateProperties.lunarSize, 10, 500, 24);
          ((lunarElement.style.fontSize = lunarFontSize + "px"),
            applyTextOutline(lunarElement, dateProperties.lunarWeight, lunarFontSize),
            (lunarElement.style.letterSpacing =
              clampNumber(dateProperties.lunarSpacing, -20, 100, 1) + "px"),
            dateComponentElement.append(lunarElement));
        }
        const updateDateDisplay = () => {
          const nowDate = new Date();
          ((datePrimaryElement.textContent = formatLocalDate(dateProperties, nowDate)),
            lunarElement && (lunarElement.textContent = formatLunarDate(nowDate)));
        };
        updateDateDisplay();
        const dateTimerId = window.setInterval(updateDateDisplay, 30000);
        return (
          dateRenderEnvironment.cleanup(() => window.clearInterval(dateTimerId)),
          dateComponentElement
        );
      },
    }),
    registerComponent("weather", {
      render(weatherComponent: any, weatherRenderEnvironment: any) {
        const weatherProperties = weatherComponent.properties || {},
          weatherEntityId = weatherComponent.bindings?.entity?.entityId || "",
          sunEntityId = weatherComponent.bindings?.sun?.entityId || "sun.sun",
          weatherEntityState = weatherRenderEnvironment.states.get(weatherEntityId),
          sunEntityState = weatherRenderEnvironment.states.get(sunEntityId)?.state || "",
          weatherAttributes = weatherEntityState?.attributes || {},
          [weatherIconSlug, weatherConditionLabel] = weatherVisual(
            weatherEntityState?.state,
            sunEntityState,
          ),
          weatherComponentElement = document.createElement("div");
        if (
          ((weatherComponentElement.className = "hb-weather-component"),
          (weatherComponentElement.style.gap =
            clampNumber(weatherProperties.iconGap, 0, 300, 22) + "px"),
          (weatherComponentElement.style.opacity = String(
            clampNumber(weatherProperties.opacity, 0, 1, 1),
          )),
          weatherProperties.iconVisible !== false)
        ) {
          const weatherIconElement = document.createElement("img");
          ((weatherIconElement.className = "hb-weather-icon"),
            (weatherIconElement.src = meteoconUrl(weatherIconSlug)),
            (weatherIconElement.alt = weatherConditionLabel),
            (weatherIconElement.draggable = false),
            (weatherIconElement.style.width =
              clampNumber(weatherProperties.iconSize, 12, 500, 64) + "px"),
            (weatherIconElement.style.height =
              clampNumber(weatherProperties.iconSize, 12, 500, 64) + "px"),
            weatherComponentElement.append(weatherIconElement));
        }
        const weatherContentElement = document.createElement("span");
        if (
          ((weatherContentElement.className = "hb-weather-content"),
          (weatherContentElement.style.gap =
            clampNumber(weatherProperties.lineGap, 0, 200, 7) + "px"),
          weatherProperties.temperatureVisible !== false)
        ) {
          const temperatureElement = document.createElement("strong"),
            temperatureValue = Number(weatherAttributes.temperature),
            temperatureUnit = String(
              weatherAttributes.temperature_unit || weatherAttributes.unit_of_measurement || "°C",
            );
          ((temperatureElement.textContent = Number.isFinite(temperatureValue)
            ? "" + temperatureValue + temperatureUnit
            : "--" + temperatureUnit),
            (temperatureElement.style.color = normalizeCssColor(
              weatherProperties.temperatureColor,
              "#aeb3b7",
            )));
          const temperatureFontSize = clampNumber(weatherProperties.temperatureSize, 12, 500, 32);
          ((temperatureElement.style.fontSize = temperatureFontSize + "px"),
            applyTextOutline(
              temperatureElement,
              weatherProperties.temperatureWeight,
              temperatureFontSize,
            ),
            (temperatureElement.style.letterSpacing =
              clampNumber(weatherProperties.temperatureSpacing, -20, 100, 1) + "px"),
            weatherContentElement.append(temperatureElement));
        }
        if (
          weatherProperties.conditionVisible !== false ||
          weatherProperties.humidityVisible !== false
        ) {
          const weatherDetailElement = document.createElement("small"),
            weatherDetailParts: any[] = [];
          weatherProperties.conditionVisible !== false &&
            weatherDetailParts.push(weatherConditionLabel);
          const humidityValue = Number(weatherAttributes.humidity);
          (weatherProperties.humidityVisible !== false &&
            weatherDetailParts.push(
              Number.isFinite(humidityValue) ? "湿度 " + humidityValue + "%" : "湿度 --",
            ),
            (weatherDetailElement.textContent = weatherDetailParts.join(" · ")),
            (weatherDetailElement.style.color = normalizeCssColor(
              weatherProperties.secondaryColor,
              "#8d9296",
            )));
          const weatherDetailFontSize = clampNumber(weatherProperties.secondarySize, 10, 500, 18);
          ((weatherDetailElement.style.fontSize = weatherDetailFontSize + "px"),
            applyTextOutline(
              weatherDetailElement,
              weatherProperties.secondaryWeight,
              weatherDetailFontSize,
            ),
            (weatherDetailElement.style.letterSpacing =
              clampNumber(weatherProperties.secondarySpacing, -20, 100, 1) + "px"),
            weatherContentElement.append(weatherDetailElement));
        }
        return (
          weatherContentElement.childElementCount &&
            weatherComponentElement.append(weatherContentElement),
          weatherComponentElement
        );
      },
    }),
    registerComponent("line-chart", {
      render(lineChartComponent: any, lineChartRenderEnvironment: any) {
        const lineChartProperties = lineChartComponent.properties || {},
          lineChartEntityId = lineChartComponent.bindings?.entity?.entityId || "",
          lineChartEntityState = lineChartRenderEnvironment.states.get(lineChartEntityId),
          lineChartUnit = String(lineChartEntityState?.attributes?.unit_of_measurement || ""),
          lineChartStateValue = Number.parseFloat(lineChartEntityState?.state),
          historySeries = buildHistorySeries(
            lineChartRenderEnvironment,
            lineChartEntityId,
            lineChartStateValue,
            lineChartProperties.hours,
          ),
          resolvedThresholdList = resolvedThresholds(
            lineChartProperties.thresholds,
            historySeries,
            lineChartProperties.thresholdMode,
          ),
          lineChartComponentElement: HTMLDivElement & ComponentControllerHooks = document.createElement("div");
        ((lineChartComponentElement.className = "hb-line-chart-component"),
          (lineChartComponentElement.style.borderRadius =
            clampNumber(lineChartProperties.cornerRadius, 0, 50, 10) + "%"));
        const lineChartValueElement = document.createElement("span");
        ((lineChartValueElement.className = "hb-line-chart-value"),
          (lineChartValueElement.hidden = lineChartProperties.valueVisible === false),
          (lineChartValueElement.style.color = normalizeCssColor(
            lineChartProperties.valueColor,
            "#dce1e5",
          )),
          (lineChartValueElement.style.fontSize =
            Math.max(
              10,
              (Number(lineChartComponent.position?.height || 300) *
                0.12 *
                clampNumber(lineChartProperties.valueScale, 10, 500, 100)) /
                100,
            ) + "px"),
          (lineChartValueElement.style.left =
            95 + clampNumber(lineChartProperties.valueOffsetX, -100, 100, 0) + "%"),
          (lineChartValueElement.style.top =
            8 + clampNumber(lineChartProperties.valueOffsetY, -100, 100, 0) + "%"));
        const stateValueElement = document.createElement("strong");
        stateValueElement.textContent = formatLineChartValue(
          lineChartStateValue,
          lineChartProperties.statePrecision,
        );
        const stateUnitElement = document.createElement("small");
        ((stateUnitElement.textContent = lineChartUnit),
          lineChartValueElement.append(stateValueElement, stateUnitElement),
          lineChartComponentElement.append(lineChartValueElement),
          (lineChartComponentElement.syncLineChartState = (syncedEntityState) => {
            const syncedStateValue = Number.parseFloat(syncedEntityState?.state);
            ((stateValueElement.textContent = formatLineChartValue(
              syncedStateValue,
              lineChartProperties.statePrecision,
            )),
              (stateUnitElement.textContent = String(
                syncedEntityState?.attributes?.unit_of_measurement || "",
              )),
              lineChartComponentElement.style.setProperty(
                "--hb-chart-current-color",
                Number.isFinite(syncedStateValue)
                  ? thresholdColor(resolvedThresholdList, syncedStateValue)
                  : "#68cc3e",
              ));
          }));
        const lineChartSvgElement = createSvgElement(lineChartComponentElement, "svg", {
          viewBox: "0 0 100 70",
          preserveAspectRatio: "none",
          "aria-hidden": "true",
        });
        if ((lineChartSvgElement.classList.add("hb-line-chart-graph"), historySeries.length)) {
          const chartGeometry = lineChartGeometry(historySeries),
            {
              minimum: minimumValue,
              maximum: maximumValue,
              span: valueSpan,
              points: chartPoints,
            } = chartGeometry,
            chartPathDefinition = smoothChartPath(chartPoints),
            lineChartGradientId =
              (lineChartRenderEnvironment.renderNamespace || "renderer") +
              "-chart-" +
              String(lineChartComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
            chartDefsElement = createSvgElement(lineChartSvgElement, "defs"),
            gradientElement = createSvgElement(chartDefsElement, "linearGradient", {
              id: lineChartGradientId + "-line",
              gradientUnits: "userSpaceOnUse",
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 70,
            }),
            thresholdEntries = resolvedThresholdList.length
              ? resolvedThresholdList
              : [
                  {
                    value: minimumValue,
                    color: "#68cc3e",
                  },
                ];
          for (const thresholdEntry of [...thresholdEntries].sort(
            (leftThreshold, rightThreshold) => rightThreshold.value - leftThreshold.value,
          ))
            createSvgElement(gradientElement, "stop", {
              offset:
                clampNumber(((maximumValue - thresholdEntry.value) / valueSpan) * 100, 0, 100, 0) +
                "%",
              "stop-color": thresholdEntry.color,
            });
          if (
            (createSvgElement(lineChartSvgElement, "path", {
              d: chartPathDefinition + " L100 70 L0 70 Z",
              fill: "url(#" + lineChartGradientId + "-line)",
              opacity: 0.18,
            }),
            createSvgElement(lineChartSvgElement, "path", {
              d: chartPathDefinition,
              fill: "none",
              stroke: "url(#" + lineChartGradientId + "-line)",
              "stroke-width": 1.6,
              "vector-effect": "non-scaling-stroke",
            }),
            !lineChartRenderEnvironment.editable)
          ) {
            const hoverLayerElement = document.createElement("span");
            ((hoverLayerElement.className = "hb-line-chart-hover-layer"),
              lineChartComponentElement.append(hoverLayerElement));
            const chartHoverOverlayElement = createHoverLineChart(
              hoverLayerElement,
              lineChartComponentElement,
              chartGeometry,
              lineChartUnit,
              (chartPoint: any) => ({
                x: chartPoint.x,
                y: (chartPoint.y / 70) * 100,
              }),
              lineChartProperties.statePrecision,
            );
            lineChartRenderEnvironment.cleanup?.(chartHoverOverlayElement);
          }
        } else lineChartComponentElement.classList.add("history-loading");
        return (
          lineChartComponentElement.style.setProperty(
            "--hb-chart-current-color",
            Number.isFinite(lineChartStateValue)
              ? thresholdColor(resolvedThresholdList, lineChartStateValue)
              : "#68cc3e",
          ),
          lineChartComponentElement
        );
      },
    }));
  registerComponent("panel-frame", {
    render(panelFrameComponent: any, panelFrameRenderEnvironment: any) {
      const panelFrameProperties = panelFrameComponent.properties || {},
        panelFrameWidth = Math.max(20, Number(panelFrameComponent.position?.width || 528)),
        panelFrameHeight = Math.max(20, Number(panelFrameComponent.position?.height || 300)),
        edgeStrokeWidth = clampNumber(panelFrameProperties.edgeWidth, 0, 20, 0.9),
        edgeInset = Math.max(0.5, edgeStrokeWidth / 2 + 0.5),
        innerFrameWidth = Math.max(1, panelFrameWidth - edgeInset * 2),
        innerFrameHeight = Math.max(1, panelFrameHeight - edgeInset * 2),
        panelCornerRadius =
          Math.min(innerFrameWidth, innerFrameHeight) *
          clampNumber(panelFrameProperties.radius, 0, 0.5, 0.195),
        edgeOpacity = clampNumber(panelFrameProperties.edgeOpacity, 0, 1, 1),
        panelGlowStrength = clampNumber(panelFrameProperties.glowStrength, 0, 5, 0.5),
        panelGlowSize = clampNumber(panelFrameProperties.glowSize, 0, 3, 1.5),
        panelGlowRadius = Math.min(innerFrameWidth, innerFrameHeight) * 0.22 * panelGlowSize,
        panelGlowBlur = Math.min(innerFrameWidth, innerFrameHeight) * 0.06 * panelGlowSize,
        edgeStrokeColor = normalizeCssColor(panelFrameProperties.edgeColor, "#d4d4d4"),
        panelGlowColor = normalizeCssColor(panelFrameProperties.glowColor, "#ffffff"),
        panelFrameId =
          (panelFrameRenderEnvironment.renderNamespace || "renderer") +
          "-frame-" +
          String(panelFrameComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
        panelFrameElement = document.createElement("div");
      panelFrameElement.className = "hb-panel-frame-component";
      const panelFrameSvgElement = createSvgElement(panelFrameElement, "svg", {
          viewBox: "0 0 " + panelFrameWidth + " " + panelFrameHeight,
          preserveAspectRatio: "none",
          "aria-hidden": "true",
        }),
        panelFrameDefsElement = createSvgElement(panelFrameSvgElement, "defs"),
        panelGlowGradientElement = createSvgElement(panelFrameDefsElement, "linearGradient", {
          id: panelFrameId + "-glass",
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
        });
      (createSvgElement(panelGlowGradientElement, "stop", {
        offset: 0,
        "stop-color": panelGlowColor,
        "stop-opacity": Math.min(0.35, 0.035 * panelGlowStrength),
      }),
        createSvgElement(panelGlowGradientElement, "stop", {
          offset: 0.52,
          "stop-color": panelGlowColor,
          "stop-opacity": Math.min(0.12, 0.01 * panelGlowStrength),
        }),
        createSvgElement(panelGlowGradientElement, "stop", {
          offset: 1,
          "stop-color": panelGlowColor,
          "stop-opacity": Math.min(0.25, 0.025 * panelGlowStrength),
        }));
      const panelEdgeGradientElement = createSvgElement(panelFrameDefsElement, "linearGradient", {
        id: panelFrameId + "-edge",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: panelFrameHeight / 2,
        x2: panelFrameWidth,
        y2: panelFrameHeight / 2,
        gradientTransform:
          "rotate(" +
          clampNumber(panelFrameProperties.edgeAngle, 0, 360, 45) +
          " " +
          panelFrameWidth / 2 +
          " " +
          panelFrameHeight / 2 +
          ")",
      });
      for (const [panelStopOffset, panelStopOpacity] of [
        [0, 0.96],
        [0.22, 0.72],
        [0.52, 0.3],
        [0.78, 0.66],
        [1, 0.42],
      ])
        createSvgElement(panelEdgeGradientElement, "stop", {
          offset: panelStopOffset,
          "stop-color": edgeStrokeColor,
          "stop-opacity": panelStopOpacity * edgeOpacity,
        });
      const panelGlassGradientElement = createSvgElement(panelFrameDefsElement, "linearGradient", {
        id: panelFrameId + "-glow",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: panelFrameHeight / 2,
        x2: panelFrameWidth,
        y2: panelFrameHeight / 2,
        gradientTransform:
          "rotate(" +
          clampNumber(panelFrameProperties.glowAngle, 0, 360, 242) +
          " " +
          panelFrameWidth / 2 +
          " " +
          panelFrameHeight / 2 +
          ")",
      });
      for (const [panelGlassStopOffset, panelGlassStopOpacity] of [
        [0, 0.32],
        [0.42, 0.09],
        [0.72, 0.05],
        [1, 0.22],
      ])
        createSvgElement(panelGlassGradientElement, "stop", {
          offset: panelGlassStopOffset,
          "stop-color": panelGlowColor,
          "stop-opacity": Math.min(1, panelGlassStopOpacity * panelGlowStrength),
        });
      const panelClipPathElement = createSvgElement(panelFrameDefsElement, "clipPath", {
        id: panelFrameId + "-clip",
      });
      createSvgElement(panelClipPathElement, "rect", {
        x: edgeInset,
        y: edgeInset,
        width: innerFrameWidth,
        height: innerFrameHeight,
        rx: panelCornerRadius,
      });
      const panelGlowFilterElement = createSvgElement(panelFrameDefsElement, "filter", {
        id: panelFrameId + "-blur",
        x: "-35%",
        y: "-55%",
        width: "170%",
        height: "210%",
      });
      if (
        (createSvgElement(panelGlowFilterElement, "feGaussianBlur", {
          stdDeviation: panelGlowBlur,
        }),
        panelFrameProperties.glowVisible !== false)
      ) {
        const panelEdgeGroupElement = createSvgElement(panelFrameSvgElement, "g", {
          "clip-path": "url(#" + panelFrameId + "-clip)",
        });
        (createSvgElement(panelEdgeGroupElement, "rect", {
          x: edgeInset,
          y: edgeInset,
          width: innerFrameWidth,
          height: innerFrameHeight,
          rx: panelCornerRadius,
          fill: "url(#" + panelFrameId + "-glass)",
        }),
          panelGlowRadius > 0 &&
            panelGlowStrength > 0 &&
            createSvgElement(panelEdgeGroupElement, "rect", {
              x: edgeInset,
              y: edgeInset,
              width: innerFrameWidth,
              height: innerFrameHeight,
              rx: panelCornerRadius,
              fill: "none",
              stroke: "url(#" + panelFrameId + "-glow)",
              "stroke-width": panelGlowRadius,
              filter: "url(#" + panelFrameId + "-blur)",
            }));
      }
      panelFrameProperties.edgeVisible !== false &&
        createSvgElement(panelFrameSvgElement, "rect", {
          x: edgeInset,
          y: edgeInset,
          width: innerFrameWidth,
          height: innerFrameHeight,
          rx: panelCornerRadius,
          fill: "none",
          stroke: "url(#" + panelFrameId + "-edge)",
          "stroke-width": edgeStrokeWidth,
        });
      const textLeftPercent = clampNumber(panelFrameProperties.textLeft, -100, 200, 5.2),
        textTopPercent = clampNumber(panelFrameProperties.textTop, -100, 200, 28),
        mainTextX =
          (panelFrameWidth *
            clampNumber(panelFrameProperties.mainTextLeft, -100, 200, textLeftPercent)) /
          100,
        mainTextY =
          (panelFrameHeight *
            clampNumber(
              panelFrameProperties.mainTextTop,
              -100,
              200,
              textTopPercent -
                (clampNumber(panelFrameProperties.lineGap, 0, 500, 24) / panelFrameHeight) * 100,
            )) /
          100,
        secondaryTextX =
          (panelFrameWidth *
            clampNumber(panelFrameProperties.secondaryTextLeft, -100, 200, textLeftPercent)) /
          100,
        secondaryTextY =
          (panelFrameHeight *
            clampNumber(panelFrameProperties.secondaryTextTop, -100, 200, textTopPercent)) /
          100,
        mainTextOpacity = clampNumber(panelFrameProperties.mainOpacity, 0, 1, 0.72),
        secondaryTextOpacity = clampNumber(panelFrameProperties.secondaryOpacity, 0, 1, 0.36);
      if (panelFrameProperties.mainTextVisible !== false) {
        const panelMainTextElement = createSvgElement(panelFrameSvgElement, "text", {
            x: mainTextX,
            y: mainTextY,
            "text-anchor": "start",
            fill: normalizeCssColor(panelFrameProperties.mainColor, "#ffffff"),
            "fill-opacity": mainTextOpacity,
            "font-family": "PingFang SC,Noto Sans SC,Microsoft YaHei,sans-serif",
            "font-size": clampNumber(panelFrameProperties.mainSize, 8, 500, 30),
            "font-weight": 300,
            "letter-spacing": clampNumber(panelFrameProperties.mainSpacing, -20, 100, 2),
          }),
          mainTextWeight = clampNumber(panelFrameProperties.mainWeight, 0, 3, 0);
        (mainTextWeight > 0 &&
          Object.entries({
            stroke: normalizeCssColor(panelFrameProperties.mainColor, "#ffffff"),
            "stroke-opacity": mainTextOpacity,
            "stroke-width": mainTextWeight,
            "paint-order": "stroke fill",
          }).forEach(([attributeName, attributeValue]) =>
            panelMainTextElement.setAttribute(attributeName, attributeValue),
          ),
          (panelMainTextElement.textContent = String(panelFrameProperties.mainText || "")));
      }
      if (panelFrameProperties.secondaryTextVisible !== false) {
        const panelSecondaryTextElement = createSvgElement(panelFrameSvgElement, "text", {
            x: secondaryTextX,
            y: secondaryTextY,
            "text-anchor": "start",
            fill: normalizeCssColor(panelFrameProperties.secondaryColor, "#ffffff"),
            "fill-opacity": secondaryTextOpacity,
            "font-family": "Helvetica Neue,Arial,sans-serif",
            "font-size": clampNumber(panelFrameProperties.secondarySize, 6, 500, 15),
            "font-weight": 300,
            "letter-spacing": clampNumber(panelFrameProperties.secondarySpacing, -20, 100, 2.1),
          }),
          secondaryTextWeight = clampNumber(panelFrameProperties.secondaryWeight, 0, 3, 0);
        (secondaryTextWeight > 0 &&
          Object.entries({
            stroke: normalizeCssColor(panelFrameProperties.secondaryColor, "#ffffff"),
            "stroke-opacity": secondaryTextOpacity,
            "stroke-width": secondaryTextWeight,
            "paint-order": "stroke fill",
          }).forEach(([secondaryAttributeName, secondaryAttributeValue]) =>
            panelSecondaryTextElement.setAttribute(secondaryAttributeName, secondaryAttributeValue),
          ),
          (panelSecondaryTextElement.textContent = String(panelFrameProperties.secondaryText || "")));
      }
      return panelFrameElement;
    },
  });
  (registerComponent("navigation-button", {
    render: navigationComponentRenderer,
  }),
    registerComponent("scene-mode", {
      render(sceneModeComponent: any, sceneModeRenderEnvironment: any) {
        const sceneModeElement = document.createElement("button");
        ((sceneModeElement.type = "button"),
          (sceneModeElement.className = "hb-scene-mode"),
          sceneModeElement.setAttribute(
            "aria-label",
            sceneModeComponent.properties?.mainText || "情景模式",
          ));
        const navigationButtonViewElement = navigationComponentRenderer(
          {
            ...sceneModeComponent,
            actions: {} as Record<string, any>,
            bindings: {} as Record<string, any>,
            properties: {
              ...sceneModeComponent.properties,
              targetPage: "",
              frameVisible: false,
              glowVisible: false,
            },
          },
          {
            ...sceneModeRenderEnvironment,
            editable: true,
            previewState: "off",
          },
        );
        return (
          sceneModeElement.append(navigationButtonViewElement),
          bindSceneMode(
            sceneModeElement,
            navigationButtonViewElement,
            sceneModeComponent,
            sceneModeRenderEnvironment,
          ),
          sceneModeElement
        );
      },
    }),
    registerComponent("percentage-bar", {
      render: renderPercentageBarControl,
    }));
}
