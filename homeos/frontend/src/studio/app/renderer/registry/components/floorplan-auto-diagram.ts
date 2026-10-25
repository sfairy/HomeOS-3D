/**
 * 2D 面板渲染器 · `floorplan-auto-diagram` 家族。
 *
 * 从 register-all.ts 拆出：该文件原先是一个 1,898 行的巨型装配函数，
 * 每次改一个控件都要在整份文件里定位；按 registry 家族拆开后每个文件只放
 * 自己那一族的 DOM 构建逻辑，装配函数只负责按顺序调用。
 */
import { clampNumberWithFallback, normalizeCssColor, applyTextOutline, resolveMdiIconUrl, appendSvgElement } from "../_shared";
import { lightStatisticsSummary } from "../../controls/light-statistics-runtime";
import { resolveAssetSource } from "../asset-state";
import { isCoverAuthoredActive } from "../cover-climate-state";
import { isEntityStateActive } from "../entity-state-active";
import { componentContentUnitsPx } from "../content-units";
import type { RenderPropertyBag, ComponentControllerHooks } from "./types";

export function registerFloorplanAutoDiagramComponent(registerComponent: (type: any, def: any) => void) {
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
          clampNumberWithFallback(iconButtonProperties.buttonOpacity, 0, 1, 0.92) * 100 + "%",
        ),
        iconButtonElement.style.setProperty(
          "--effect-frame-color",
          normalizeCssColor(iconButtonProperties.frameColor, "#dcebf2"),
        ),
        iconButtonElement.style.setProperty(
          "--effect-frame-width",
          clampNumberWithFallback(iconButtonProperties.frameWidth, 0, 20, 1.5) + "px",
        ),
        iconButtonElement.style.setProperty(
          "--effect-frame-opacity",
          clampNumberWithFallback(iconButtonProperties.frameOpacity, 0, 1, 0.72) * 100 + "%",
        ),
        iconButtonElement.style.setProperty(
          "--effect-radius",
          clampNumberWithFallback(iconButtonProperties.radius, 0, 50, 50) + "%",
        ),
        iconButtonElement.style.setProperty(
          "--effect-glow-color",
          normalizeCssColor(iconButtonProperties.glowColor, "#43c8f0"),
        ));
      const glowIntensityScale = clampNumberWithFallback(
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
          (iconElement.style.width = clampNumberWithFallback(iconButtonProperties.iconSize, 1, 100, 44) + "%"),
          (iconElement.style.height = clampNumberWithFallback(iconButtonProperties.iconSize, 1, 100, 44) + "%"),
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
            clampNumberWithFallback(titleButtonProperties.frameWidth, 0, 12, 1.5) + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-frame-offset-x",
            clampNumberWithFallback(titleButtonProperties.frameOffsetX, -100, 100, 0) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-frame-offset-y",
            clampNumberWithFallback(titleButtonProperties.frameOffsetY, -100, 100, 0) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-main-size",
            clampNumberWithFallback(titleButtonProperties.mainSize, 8, 200, 34) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-size",
            clampNumberWithFallback(titleButtonProperties.secondarySize, 6, 100, 12) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-main-spacing",
            clampNumberWithFallback(titleButtonProperties.mainSpacing, -20, 100, 1) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-spacing",
            clampNumberWithFallback(titleButtonProperties.secondarySpacing, -20, 100, 2) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-line-gap",
            clampNumberWithFallback(titleButtonProperties.secondaryLineGap, 0, 100, 2) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-main-left",
            clampNumberWithFallback(titleButtonProperties.mainTextLeft, -100, 200, 5.5) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-main-top",
            clampNumberWithFallback(titleButtonProperties.mainTextTop, -100, 200, 45) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-left",
            clampNumberWithFallback(titleButtonProperties.secondaryTextLeft, -100, 200, 54) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-secondary-top",
            clampNumberWithFallback(titleButtonProperties.secondaryTextTop, -100, 200, 43) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-icon-size",
            clampNumberWithFallback(titleButtonProperties.iconSize, 1, 100, 30) * titleUnitHeight + "px",
          ),
          titleButtonElement.style.setProperty(
            "--title-icon-left",
            clampNumberWithFallback(titleButtonProperties.iconLeft, -100, 200, 50) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-icon-top",
            clampNumberWithFallback(titleButtonProperties.iconTop, -100, 200, 45) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-marker-left",
            clampNumberWithFallback(titleButtonProperties.markerLeft, -100, 200, 1.8) + "%",
          ),
          titleButtonElement.style.setProperty(
            "--title-marker-top",
            clampNumberWithFallback(titleButtonProperties.markerTop, -100, 200, 84) + "%",
          ),
          titleButtonProperties.frameVisible !== false || isHiddenContentClickable)
        ) {
          const frameSizeRatio = clampNumberWithFallback(titleButtonProperties.frameSize, 10, 300, 100) / 100,
            frameHeight = titleButtonHeightPx * 0.45 * frameSizeRatio,
            frameOffsetXPx =
              (titleButtonWidthPx * clampNumberWithFallback(titleButtonProperties.frameOffsetX, -100, 100, 0)) /
              100,
            frameOffsetYPx =
              (titleButtonHeightPx * clampNumberWithFallback(titleButtonProperties.frameOffsetY, -100, 100, 0)) /
              100,
            frameHalfSpacing =
              (titleButtonWidthPx * clampNumberWithFallback(titleButtonProperties.frameSpacing, 0, 300, 100)) /
              200,
            frameCenterX = titleButtonWidthPx / 2 + frameOffsetXPx,
            frameCenterY = titleButtonHeightPx / 2 + frameOffsetYPx,
            frameTopEdge = frameCenterY - frameHeight / 2,
            frameBottomEdge = frameCenterY + frameHeight / 2,
            frameCornerInset = titleButtonHeightPx * 0.12,
            frameHalfWidth = clampNumberWithFallback(titleButtonProperties.frameWidth, 0, 12, 1.5) / 2,
            frameLeftEdge = frameCenterX - frameHalfSpacing + frameHalfWidth,
            frameRightEdge = frameCenterX + frameHalfSpacing - frameHalfWidth,
            bracketsSvgElement = appendSvgElement(titleButtonElement, "svg", {
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
            "stroke-width": clampNumberWithFallback(titleButtonProperties.frameWidth, 0, 12, 1.5),
            "stroke-opacity": 1,
            "stroke-linecap": "butt",
            "stroke-linejoin": "miter",
            "vector-effect": "non-scaling-stroke",
          };
          (appendSvgElement(bracketsSvgElement, "path", {
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
            appendSvgElement(bracketsSvgElement, "path", {
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
              clampNumberWithFallback(titleButtonProperties.mainSize, 8, 200, 34),
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
              clampNumberWithFallback(titleButtonProperties.secondarySize, 6, 100, 12),
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
              clampNumberWithFallback(titleButtonProperties.markerSize, 2, 60, 10) * titleUnitHeight + "px",
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
            clampNumberWithFallback(lightStatisticsProperties.iconSize, 1, 100, 42) * statisticsUnitHeight + "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-title-size",
            clampNumberWithFallback(lightStatisticsProperties.titleSize, 8, 200, 32) * statisticsUnitHeight +
              "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-title-spacing",
            clampNumberWithFallback(lightStatisticsProperties.titleSpacing, -20, 100, 1.2) *
              statisticsUnitHeight +
              "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-count-size",
            clampNumberWithFallback(lightStatisticsProperties.countSize, 8, 200, 34) * statisticsUnitHeight +
              "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-count-spacing",
            clampNumberWithFallback(lightStatisticsProperties.countSpacing, -20, 100, 0) * statisticsUnitHeight +
              "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-icon-gap",
            clampNumberWithFallback(lightStatisticsProperties.iconGap, 0, 40, 4.5) * statisticsUnitWidth + "px",
          ),
          statisticsElement.style.setProperty(
            "--light-statistics-count-gap",
            clampNumberWithFallback(lightStatisticsProperties.countGap, 0, 40, 4.5) * statisticsUnitWidth + "px",
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
              clampNumberWithFallback(lightStatisticsProperties.titleSize, 8, 200, 32),
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
              clampNumberWithFallback(lightStatisticsProperties.countSize, 8, 200, 34),
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
}
