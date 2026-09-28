
type AnyObj = Record<string, any>;
/*
 * 组件属性描述符。
 */

import { clone, roundField } from "../editor-utils.js";
import { findComponent } from "../component-tree.js";
import { paletteColor } from "../../utils/colors.js";
import { AIRFLOW_OTHER_COLOR } from "../../utils/airflow-colors.js";

export function createPropertyDescriptors(ctx: any) {

  function getLineChartPropertyValue(lineChartSourceComponent: any, lineChartPropertyKey: any) {
    if (lineChartSourceComponent) {
      if (lineChartPropertyKey === "width" || lineChartPropertyKey === "height") {
        return Number(lineChartSourceComponent.position?.[lineChartPropertyKey] || 100);
      } else if (lineChartPropertyKey === "scale") {
        return Number(lineChartSourceComponent.style?.scale || 1);
      } else if (lineChartPropertyKey === "rotation") {
        return Number(lineChartSourceComponent.position?.rotation || 0);
      } else {
        return (
          lineChartSourceComponent.properties?.[lineChartPropertyKey] ??
          clone(lineChartDefaults[lineChartPropertyKey])
        );
      }
    }
  }

  function collectLineChartChangedProperties(lineChartCollectComponent: any) {
    if (!lineChartCollectComponent || lineChartCollectComponent.type !== "line-chart") {
      return [];
    }
    let lineChartBaselineComponent = ctx.lineChartBaselineByComponentId.get(lineChartCollectComponent.id);
    if (!lineChartBaselineComponent) {
      lineChartBaselineComponent = clone(
        findComponent(ctx.baselineDocument, lineChartCollectComponent.id)?.component ||
          lineChartCollectComponent
      );
      ctx.lineChartBaselineByComponentId.set(lineChartCollectComponent.id, lineChartBaselineComponent);
    }
    return Object.keys(lineChartPropertyDefinitions).filter(
      (lineChartFilterKey: any) =>
        JSON.stringify(getLineChartPropertyValue(lineChartCollectComponent, lineChartFilterKey)) !==
        JSON.stringify(getLineChartPropertyValue(lineChartBaselineComponent, lineChartFilterKey))
    );
  }

  function formatLineChartPropertyValue(
    lineChartFormatKey: any,
    lineChartPropertyValue: any,
    lineChartPropertyDocument: any = ctx.activeProject?.document
  ) {
    if (typeof lineChartPropertyValue == "boolean") {
      if (lineChartPropertyValue) {
        return "显示";
      } else {
        return "隐藏";
      }
    }
    if (lineChartFormatKey === "width" || lineChartFormatKey === "height") {
      const lineChartCanvasExtent = Number(
        lineChartPropertyDocument?.canvas?.[lineChartFormatKey] ||
          (lineChartFormatKey === "width" ? 2778 : 1940)
      );
      return roundField((Number(lineChartPropertyValue || 0) / lineChartCanvasExtent) * 100) + "%";
    }
    if (lineChartFormatKey === "scale") {
      return roundField(Number(lineChartPropertyValue || 0) * 100) + "%";
    } else if (lineChartFormatKey === "rotation") {
      return roundField(Number(lineChartPropertyValue || 0)) + "°";
    } else if (
      ["valueScale", "valueOffsetX", "valueOffsetY", "cornerRadius"].includes(lineChartFormatKey)
    ) {
      return roundField(Number(lineChartPropertyValue || 0)) + "%";
    } else if (lineChartFormatKey === "updateInterval") {
      return roundField(Number(lineChartPropertyValue || 0)) + " 秒";
    } else if (lineChartFormatKey === "hours") {
      return roundField(Number(lineChartPropertyValue || 0)) + " 小时";
    } else if (lineChartFormatKey === "thresholds") {
      return (Array.isArray(lineChartPropertyValue) ? lineChartPropertyValue.length : 0) + " 段配色";
    } else {
      return String(lineChartPropertyValue ?? "");
    }
  }

  function getTitleButtonPropertyValue(titleButtonSourceComponent: any, titleButtonPropertyKey: any) {
    if (titleButtonSourceComponent) {
      if (titleButtonPropertyKey === "width" || titleButtonPropertyKey === "height") {
        return Number(titleButtonSourceComponent.position?.[titleButtonPropertyKey] || 100);
      } else if (titleButtonPropertyKey === "scale") {
        return Number(titleButtonSourceComponent.style?.scale || 1);
      } else if (titleButtonPropertyKey === "rotation") {
        return Number(titleButtonSourceComponent.position?.rotation || 0);
      } else {
        return (
          titleButtonSourceComponent.properties?.[titleButtonPropertyKey] ??
          titleButtonDefaults[titleButtonPropertyKey]
        );
      }
    }
  }

  function collectTitleButtonChangedProperties(titleButtonCollectComponent: any) {
    if (!titleButtonCollectComponent || titleButtonCollectComponent.type !== "title-button") {
      return [];
    }
    const titleButtonBaselineComponent =
      findComponent(ctx.baselineDocument, titleButtonCollectComponent.id)?.component ||
      titleButtonCollectComponent;
    return Object.keys(titleButtonPropertyDefinitions).filter(
      (titleButtonFilterKey: any) =>
        JSON.stringify(
          getTitleButtonPropertyValue(titleButtonCollectComponent, titleButtonFilterKey)
        ) !==
        JSON.stringify(
          getTitleButtonPropertyValue(titleButtonBaselineComponent, titleButtonFilterKey)
        )
    );
  }

  function formatTitleButtonPropertyValue(
    titleButtonFormatKey: any,
    titleButtonPropertyValue: any,
    titleButtonPropertyDocument: any = ctx.activeProject?.document
  ) {
    if (typeof titleButtonPropertyValue == "boolean") {
      if (titleButtonPropertyValue) {
        return "显示";
      } else {
        return "隐藏";
      }
    }
    if (titleButtonFormatKey === "width" || titleButtonFormatKey === "height") {
      const titleButtonCanvasExtent = Number(
        titleButtonPropertyDocument?.canvas?.[titleButtonFormatKey] ||
          (titleButtonFormatKey === "width" ? 2778 : 1940)
      );
      return (
        roundField((Number(titleButtonPropertyValue || 0) / titleButtonCanvasExtent) * 100) + "%"
      );
    }
    if (titleButtonFormatKey === "scale") {
      return roundField(Number(titleButtonPropertyValue || 0) * 100) + "%";
    } else if (titleButtonFormatKey === "rotation") {
      return roundField(Number(titleButtonPropertyValue || 0)) + "°";
    } else if (
      [
        "mainSize",
        "secondarySize",
        "mainSpacing",
        "secondarySpacing",
        "secondaryLineGap",
        "mainTextLeft",
        "mainTextTop",
        "secondaryTextLeft",
        "secondaryTextTop",
        "iconSize",
        "iconLeft",
        "iconTop",
        "frameSize",
        "frameSpacing",
        "frameOffsetX",
        "frameOffsetY",
        "markerSize",
        "markerLeft",
        "markerTop"
      ].includes(titleButtonFormatKey)
    ) {
      return roundField(Number(titleButtonPropertyValue || 0)) + "%";
    } else {
      return String(titleButtonPropertyValue ?? "");
    }
  }

  function getAirConditionerPropertyValue(airConditionerSourceComponent: any, airConditionerPropertyKey: any) {
    if (airConditionerSourceComponent) {
      if (airConditionerPropertyKey === "width" || airConditionerPropertyKey === "height") {
        return Number(airConditionerSourceComponent.position?.[airConditionerPropertyKey] || 100);
      } else if (airConditionerPropertyKey === "scale") {
        return Number(airConditionerSourceComponent.style?.scale || 1);
      } else if (airConditionerPropertyKey === "rotation") {
        return Number(airConditionerSourceComponent.position?.rotation || 0);
      } else {
        return (
          airConditionerSourceComponent.properties?.[airConditionerPropertyKey] ??
          airConditionerDefaults[airConditionerPropertyKey]
        );
      }
    }
  }

  function collectAirConditionerChangedProperties(airConditionerCollectComponent: any) {
    if (
      !airConditionerCollectComponent ||
      airConditionerCollectComponent.type !== "air-conditioner"
    ) {
      return [];
    }
    let airConditionerBaselineComponent = ctx.airConditionerBaselineByComponentId.get(
      airConditionerCollectComponent.id
    );
    if (!airConditionerBaselineComponent) {
      airConditionerBaselineComponent = clone(
        findComponent(ctx.baselineDocument, airConditionerCollectComponent.id)?.component ||
          airConditionerCollectComponent
      );
      ctx.airConditionerBaselineByComponentId.set(
        airConditionerCollectComponent.id,
        airConditionerBaselineComponent
      );
    }
    return Object.keys(airConditionerPropertyDefinitions).filter(
      (airConditionerFilterKey: any) =>
        JSON.stringify(
          getAirConditionerPropertyValue(airConditionerCollectComponent, airConditionerFilterKey)
        ) !==
        JSON.stringify(
          getAirConditionerPropertyValue(airConditionerBaselineComponent, airConditionerFilterKey)
        )
    );
  }

  function formatAirConditionerPropertyValue(
    airConditionerFormatKey: any,
    airConditionerPropertyValue: any,
    airConditionerPropertyDocument: any = ctx.activeProject?.document
  ) {
    if (typeof airConditionerPropertyValue == "boolean") {
      if (airConditionerPropertyValue) {
        return "显示";
      } else {
        return "隐藏";
      }
    }
    if (airConditionerFormatKey === "width" || airConditionerFormatKey === "height") {
      const airConditionerCanvasExtent = Number(
        airConditionerPropertyDocument?.canvas?.[airConditionerFormatKey] ||
          (airConditionerFormatKey === "width" ? 2778 : 1940)
      );
      return (
        roundField((Number(airConditionerPropertyValue || 0) / airConditionerCanvasExtent) * 100) +
        "%"
      );
    }
    if (["scale", "airflowScale", "badgeOpacity"].includes(airConditionerFormatKey)) {
      return roundField(Number(airConditionerPropertyValue || 0) * 100) + "%";
    } else if (["rotation", "airflowRotation", "airflowAngle"].includes(airConditionerFormatKey)) {
      return roundField(Number(airConditionerPropertyValue || 0)) + "°";
    } else if (airConditionerFormatKey === "airflowMotion") {
      if (airConditionerPropertyValue === "static") {
        return "静态";
      } else {
        return "动态";
      }
    } else if (typeof airConditionerPropertyValue == "number") {
      return roundField(airConditionerPropertyValue);
    } else {
      return String(airConditionerPropertyValue ?? "");
    }
  }

  function getIconButtonEffectPropertyValue(
    iconButtonEffectSourceComponent: any,
    iconButtonEffectPropertyKey: any
  ) {
    if (iconButtonEffectSourceComponent) {
      if (iconButtonEffectPropertyKey === "width" || iconButtonEffectPropertyKey === "height") {
        return Number(iconButtonEffectSourceComponent.position?.[iconButtonEffectPropertyKey] || 100);
      } else if (iconButtonEffectPropertyKey === "scale") {
        return Number(iconButtonEffectSourceComponent.style?.scale || 1);
      } else if (iconButtonEffectPropertyKey === "rotation") {
        return Number(iconButtonEffectSourceComponent.position?.rotation || 0);
      } else {
        return (
          iconButtonEffectSourceComponent.properties?.[iconButtonEffectPropertyKey] ??
          iconButtonEffectDefaults[iconButtonEffectPropertyKey]
        );
      }
    }
  }

  function collectIconButtonEffectChangedProperties(iconButtonEffectComponent: any) {
    if (!iconButtonEffectComponent || iconButtonEffectComponent.type !== "icon-button-effect") {
      return [];
    }
    let iconButtonEffectBaselineComponent = ctx.iconButtonEffectBaselineByComponentId.get(
      iconButtonEffectComponent.id
    );
    if (!iconButtonEffectBaselineComponent) {
      iconButtonEffectBaselineComponent = clone(
        findComponent(ctx.baselineDocument, iconButtonEffectComponent.id)?.component ||
          iconButtonEffectComponent
      );
      ctx.iconButtonEffectBaselineByComponentId.set(
        iconButtonEffectComponent.id,
        iconButtonEffectBaselineComponent
      );
    }
    return Object.keys(iconButtonEffectPropertyDefinitions).filter(
      (iconButtonEffectFilterKey: any) =>
        JSON.stringify(
          getIconButtonEffectPropertyValue(iconButtonEffectComponent, iconButtonEffectFilterKey)
        ) !==
        JSON.stringify(
          getIconButtonEffectPropertyValue(
            iconButtonEffectBaselineComponent,
            iconButtonEffectFilterKey
          )
        )
    );
  }

  /**
   * 把「图标按钮效果」属性格式化成变更摘要里的可读文案：宽高按画布尺寸换算成百分比；透明度/缩放类乘 100 加百分号；
   */
  function formatIconButtonEffectPropertyValue(
    iconButtonEffectFormatKey: any,
    iconButtonEffectPropertyValue: any,
    iconButtonEffectPropertyDocument: any = ctx.activeProject?.document
  ) {
    if (typeof iconButtonEffectPropertyValue == "boolean") {
      if (iconButtonEffectPropertyValue) {
        return "显示";
      } else {
        return "隐藏";
      }
    }
    if (iconButtonEffectFormatKey === "width" || iconButtonEffectFormatKey === "height") {
      const iconButtonEffectCanvasExtent = Number(
        iconButtonEffectPropertyDocument?.canvas?.[iconButtonEffectFormatKey] ||
          (iconButtonEffectFormatKey === "width" ? 2778 : 1940)
      );
      return (
        roundField(
          (Number(iconButtonEffectPropertyValue || 0) / iconButtonEffectCanvasExtent) * 100
        ) + "%"
      );
    }
    if (
      [
        "buttonOpacity",
        "frameOpacity",
        "glowOffStrength",
        "glowOnStrength",
        "effectOpacity",
        "effectScale",
        "scale"
      ].includes(iconButtonEffectFormatKey)
    ) {
      return roundField(Number(iconButtonEffectPropertyValue || 0) * 100) + "%";
    } else if (
      ["iconSize", "radius", "effectLeft", "effectTop"].includes(iconButtonEffectFormatKey)
    ) {
      return roundField(Number(iconButtonEffectPropertyValue || 0)) + "%";
    } else if (["effectRotation", "rotation"].includes(iconButtonEffectFormatKey)) {
      return roundField(Number(iconButtonEffectPropertyValue || 0)) + "°";
    } else if (["effectFadeDuration", "onFillFadeDuration"].includes(iconButtonEffectFormatKey)) {
      return roundField(Number(iconButtonEffectPropertyValue || 0)) + " 秒";
    } else if (iconButtonEffectFormatKey === "effectLayoutMode") {
      if (iconButtonEffectPropertyValue === "fill") {
        return "铺满";
      } else {
        return "自由";
      }
    } else {
      return String(iconButtonEffectPropertyValue || "不使用");
    }
  }

  function getIconButtonPropertyValue(iconButtonSourceComponent: any, iconButtonPropertyKey: any) {
    if (!iconButtonSourceComponent) {
      return;
    }
    if (iconButtonPropertyKey === "width" || iconButtonPropertyKey === "height") {
      return Number(iconButtonSourceComponent.position?.[iconButtonPropertyKey] || 100);
    }
    if (iconButtonPropertyKey === "scale") {
      return Number(iconButtonSourceComponent.style?.scale || 1);
    }
    if (iconButtonPropertyKey === "rotation") {
      return Number(iconButtonSourceComponent.position?.rotation || 0);
    }
    const iconButtonPropertyValues = iconButtonSourceComponent.properties || {};
    if (iconButtonPropertyKey === "iconColor") {
      return (
        iconButtonPropertyValues.iconColor ??
        iconButtonPropertyValues.clearColor ??
        iconButtonPropertyValues.iconOffColor ??
        iconButtonPropertyValues.iconOnColor ??
        iconButtonDefaults.iconColor
      );
    } else if (iconButtonPropertyKey === "iconOnColor") {
      return (
        iconButtonPropertyValues.iconOnColor ??
        iconButtonPropertyValues.occupiedColor ??
        iconButtonDefaults.iconOnColor
      );
    } else if (iconButtonPropertyKey === "mainColor") {
      return (
        iconButtonPropertyValues.mainColor ??
        iconButtonPropertyValues.mainOffColor ??
        iconButtonPropertyValues.mainOnColor ??
        iconButtonDefaults.mainColor
      );
    } else if (iconButtonPropertyKey === "secondaryColor") {
      return (
        iconButtonPropertyValues.secondaryColor ??
        iconButtonPropertyValues.secondaryOffColor ??
        iconButtonPropertyValues.secondaryOnColor ??
        iconButtonDefaults.secondaryColor
      );
    } else {
      return (
        iconButtonPropertyValues[iconButtonPropertyKey] ?? iconButtonDefaults[iconButtonPropertyKey]
      );
    }
  }

  function collectIconButtonChangedProperties(iconButtonCollectComponent: any) {
    if (
      !iconButtonCollectComponent ||
      !["icon-button", "device-button", "presence-sensor"].includes(iconButtonCollectComponent.type)
    ) {
      return [];
    }
    let iconButtonBaselineComponent = ctx.iconButtonBaselineByComponentId.get(
      iconButtonCollectComponent.id
    );
    if (!iconButtonBaselineComponent) {
      iconButtonBaselineComponent = clone(
        findComponent(ctx.baselineDocument, iconButtonCollectComponent.id)?.component ||
          iconButtonCollectComponent
      );
      ctx.iconButtonBaselineByComponentId.set(iconButtonCollectComponent.id, iconButtonBaselineComponent);
    }
    return (
      iconButtonCollectComponent.type === "presence-sensor"
        ? presenceSensorPropertyKeys(iconButtonCollectComponent)
        : iconButtonCollectComponent.type === "device-button"
          ? [
              "iconColor",
              "iconOnColor",
              "badgeColor",
              "badgeOpacity",
              "symbolSize",
              "badgeSize",
              "iconLeft",
              "iconTop",
              "mainColor",
              "mainSize",
              "mainWeight",
              "mainSpacing",
              "mainTextLeft",
              "mainTextTop",
              "secondaryColor",
              "secondarySize",
              "secondaryWeight",
              "secondarySpacing",
              "secondaryTextLeft",
              "secondaryTextTop",
              "width",
              "height",
              "scale",
              "rotation"
            ]
          : Object.keys(iconButtonPropertyDefinitions)
    ).filter(
      (iconButtonDefinitionKey: any) =>
        JSON.stringify(
          getIconButtonPropertyValue(iconButtonCollectComponent, iconButtonDefinitionKey)
        ) !==
        JSON.stringify(
          getIconButtonPropertyValue(iconButtonBaselineComponent, iconButtonDefinitionKey)
        )
    );
  }

  function resolveIconButtonPropertyDefinition(
    iconButtonDefinitionComponent: any,
    iconButtonDefinitionLookupKey: any
  ) {
    if (iconButtonDefinitionComponent?.type === "presence-sensor") {
      return presenceSensorPropertyDefinitions[iconButtonDefinitionLookupKey];
    } else if (iconButtonDefinitionComponent?.type !== "device-button") {
      return iconButtonPropertyDefinitions[iconButtonDefinitionLookupKey];
    } else if (iconButtonDefinitionLookupKey.startsWith("main")) {
      return {
        group: "标题",
        label:
          iconButtonDefinitionLookupKey === "mainOnOpacity"
            ? "透明度"
            : iconButtonPropertyDefinitions[iconButtonDefinitionLookupKey]?.label?.replace("中文", "")
      };
    } else if (iconButtonDefinitionLookupKey.startsWith("secondary")) {
      return {
        group: "状态",
        label:
          iconButtonDefinitionLookupKey === "secondaryOnOpacity"
            ? "透明度"
            : iconButtonPropertyDefinitions[iconButtonDefinitionLookupKey]?.label?.replace("英文", "")
      };
    } else {
      return iconButtonPropertyDefinitions[iconButtonDefinitionLookupKey];
    }
  }

  function formatIconButtonPropertyValue(
    iconButtonFormatKey: any,
    iconButtonPropertyValue: any,
    iconButtonPropertyDocument: any = ctx.activeProject?.document
  ) {
    if (typeof iconButtonPropertyValue == "boolean") {
      if (iconButtonPropertyValue) {
        return "显示";
      } else {
        return "隐藏";
      }
    }
    if (iconButtonFormatKey === "width" || iconButtonFormatKey === "height") {
      const iconButtonCanvasExtent = Number(
        iconButtonPropertyDocument?.canvas?.[iconButtonFormatKey] ||
          (iconButtonFormatKey === "width" ? 2778 : 1940)
      );
      return roundField((Number(iconButtonPropertyValue || 0) / iconButtonCanvasExtent) * 100) + "%";
    }
    if (iconButtonFormatKey === "scale") {
      return roundField(Number(iconButtonPropertyValue || 0) * 100) + "%";
    } else if (iconButtonFormatKey === "perspectiveCorners") {
      if (JSON.stringify(iconButtonPropertyValue) === JSON.stringify(ctx.DEFAULT_PERSPECTIVE_CORNERS)) {
        return "默认透视";
      } else {
        return "自定义透视";
      }
    } else if (iconButtonFormatKey === "orbitDuration") {
      return roundField(Number(iconButtonPropertyValue || 0)) + " 秒";
    } else if (iconButtonFormatKey === "onFillFadeDuration") {
      return roundField(Number(iconButtonPropertyValue || 0)) + " 秒";
    } else if (
      [
        "rotation",
        "frameAngle",
        "softLightAngle",
        "glowAngle",
        "haloRotation",
        "personRotation"
      ].includes(iconButtonFormatKey)
    ) {
      return roundField(Number(iconButtonPropertyValue || 0)) + "°";
    } else if (
      [
        "iconOffOpacity",
        "iconOnOpacity",
        "mainOffOpacity",
        "mainOnOpacity",
        "secondaryOffOpacity",
        "secondaryOnOpacity",
        "badgeOpacity",
        "onFillStrength",
        "frameOffOpacity",
        "frameOnOpacity",
        "softLightStrength",
        "softLightSize",
        "glowStrength",
        "glowSize",
        "haloScaleX",
        "haloScaleY",
        "haloOpacity",
        "personScale",
        "personOpacity"
      ].includes(iconButtonFormatKey)
    ) {
      return roundField(Number(iconButtonPropertyValue || 0) * 100) + "%";
    } else if (
      [
        "iconSize",
        "symbolSize",
        "badgeSize",
        "iconLeft",
        "iconTop",
        "mainTextLeft",
        "mainTextTop",
        "secondaryTextLeft",
        "secondaryTextTop",
        "cutCorner"
      ].includes(iconButtonFormatKey)
    ) {
      return roundField(Number(iconButtonPropertyValue || 0)) + "%";
    } else {
      return String(iconButtonPropertyValue ?? "");
    }
  }

  function getCameraPropertyValue(cameraSourceComponent: any, cameraPropertyKey: any) {
    if (!cameraSourceComponent) {
      return;
    }
    if (cameraPropertyKey === "width" || cameraPropertyKey === "height") {
      return Number(cameraSourceComponent.position?.[cameraPropertyKey] || 100);
    }
    if (cameraPropertyKey === "scale") {
      return Number(cameraSourceComponent.style?.scale || 1);
    }
    if (cameraPropertyKey === "rotation") {
      return Number(cameraSourceComponent.position?.rotation || 0);
    }
    const cameraPropertyValues = cameraSourceComponent.properties || {};
    if (cameraPropertyKey === "displayMode") {
      if (cameraPropertyValues.displayMode === "snapshot") {
        return "snapshot";
      } else {
        return "live";
      }
    }
    if (cameraPropertyKey === "refreshInterval") {
      const cameraRefreshInterval = Number(cameraPropertyValues.refreshInterval);
      if (Number.isFinite(cameraRefreshInterval)) {
        return Math.max(6, Math.round(cameraRefreshInterval));
      } else {
        return 10;
      }
    }
    if (cameraPropertyKey === "fit") {
      if (cameraPropertyValues.fit === "contain") {
        return "contain";
      } else {
        return "fill";
      }
    }
    if (cameraPropertyKey === "radius") {
      const cameraRadius = Number(cameraPropertyValues.radius ?? cameraDefaults.radius);
      return Math.max(0, Math.min(0.5, cameraRadius > 0.5 ? cameraRadius / 100 : cameraRadius));
    }
    return cameraPropertyValues[cameraPropertyKey] ?? cameraDefaults[cameraPropertyKey];
  }

  /**
   * 列出摄像头组件相对基线文档中同名组件发生变化的属性键。基线现取现比（走的仍是带归一化的取值函数，因此两种写法的等价值
   */
  function collectCameraChangedProperties(cameraCollectComponent: any) {
    if (!cameraCollectComponent || cameraCollectComponent.type !== "camera") {
      return [];
    }
    const cameraBaselineComponent =
      findComponent(ctx.baselineDocument, cameraCollectComponent.id)?.component || cameraCollectComponent;
    return Object.keys(cameraPropertyDefinitions).filter(
      (cameraFilterKey: any) =>
        JSON.stringify(getCameraPropertyValue(cameraCollectComponent, cameraFilterKey)) !==
        JSON.stringify(getCameraPropertyValue(cameraBaselineComponent, cameraFilterKey))
    );
  }

  function formatCameraPropertyValue(
    cameraFormatKey: any,
    cameraPropertyValue: any,
    cameraPropertyDocument: any = ctx.activeProject?.document
  ) {
    if (typeof cameraPropertyValue == "boolean") {
      if (cameraPropertyValue) {
        return "显示";
      } else {
        return "隐藏";
      }
    }
    if (cameraFormatKey === "displayMode") {
      if (cameraPropertyValue === "snapshot") {
        return "快照";
      } else {
        return "实时";
      }
    }
    if (cameraFormatKey === "refreshInterval") {
      return roundField(Number(cameraPropertyValue || 10)) + " 秒";
    }
    if (cameraFormatKey === "fit") {
      if (cameraPropertyValue === "contain") {
        return "原始比例";
      } else {
        return "压缩 16:9";
      }
    }
    if (cameraFormatKey === "width" || cameraFormatKey === "height") {
      const cameraCanvasExtent = Number(
        cameraPropertyDocument?.canvas?.[cameraFormatKey] ||
          (cameraFormatKey === "width" ? 2778 : 1940)
      );
      return roundField((Number(cameraPropertyValue || 0) / cameraCanvasExtent) * 100) + "%";
    }
    if (
      cameraFormatKey === "scale" ||
      cameraFormatKey === "radius" ||
      cameraFormatKey === "frameOpacity"
    ) {
      return roundField(Number(cameraPropertyValue || 0) * 100) + "%";
    } else if (cameraFormatKey === "rotation" || cameraFormatKey === "frameAngle") {
      return roundField(Number(cameraPropertyValue || 0)) + "°";
    } else {
      return String(cameraPropertyValue ?? "");
    }
  }

  function getPanelFrameStyleValue(panelFrameStyleSourceComponent: any, panelFrameStylePropertyKey: any) {
    if (!panelFrameStyleSourceComponent) {
      return;
    }
    if (panelFrameStylePropertyKey === "width" || panelFrameStylePropertyKey === "height") {
      return Number(panelFrameStyleSourceComponent.position?.[panelFrameStylePropertyKey] || 100);
    }
    if (panelFrameStylePropertyKey === "scale") {
      return Number(panelFrameStyleSourceComponent.style?.scale || 1);
    }
    if (panelFrameStylePropertyKey === "rotation") {
      return Number(panelFrameStyleSourceComponent.position?.rotation || 0);
    }
    const panelFrameStyleProperties = panelFrameStyleSourceComponent.properties || {};
    if (
      panelFrameStylePropertyKey === "mainTextLeft" ||
      panelFrameStylePropertyKey === "secondaryTextLeft"
    ) {
      return (
        panelFrameStyleProperties[panelFrameStylePropertyKey] ??
        panelFrameStyleProperties.textLeft ??
        panelFrameStyleDefaults[panelFrameStylePropertyKey]
      );
    }
    if (panelFrameStylePropertyKey === "mainTextTop") {
      const panelFrameStyleHeight = Math.max(
        1,
        Number(panelFrameStyleSourceComponent.position?.height || 100)
      );
      return (
        panelFrameStyleProperties.mainTextTop ??
        Number(panelFrameStyleProperties.textTop ?? 28) -
          (Number(panelFrameStyleProperties.lineGap ?? 24) / panelFrameStyleHeight) * 100
      );
    }
    if (panelFrameStylePropertyKey === "secondaryTextTop") {
      return (
        panelFrameStyleProperties.secondaryTextTop ??
        panelFrameStyleProperties.textTop ??
        panelFrameStyleDefaults.secondaryTextTop
      );
    } else {
      return (
        panelFrameStyleProperties[panelFrameStylePropertyKey] ??
        panelFrameStyleDefaults[panelFrameStylePropertyKey]
      );
    }
  }

  function collectPanelFrameStyleChanges(panelFrameStyleComponent: any) {
    if (!panelFrameStyleComponent || panelFrameStyleComponent.type !== "panel-frame") {
      return [];
    }
    let panelFrameStyleBaselineComponent = ctx.panelFrameBaselineByComponentId.get(
      panelFrameStyleComponent.id
    );
    if (!panelFrameStyleBaselineComponent) {
      panelFrameStyleBaselineComponent = clone(
        findComponent(ctx.baselineDocument, panelFrameStyleComponent.id)?.component ||
          panelFrameStyleComponent
      );
      ctx.panelFrameBaselineByComponentId.set(
        panelFrameStyleComponent.id,
        panelFrameStyleBaselineComponent
      );
    }
    return Object.keys(panelFrameStylePropertyDefinitions).filter((panelFrameStyleFilterKey: any) =>
      !panelFrameStyleBaselineComponent || panelFrameStyleBaselineComponent.type !== "panel-frame"
        ? true
        : JSON.stringify(
            getPanelFrameStyleValue(panelFrameStyleComponent, panelFrameStyleFilterKey)
          ) !==
          JSON.stringify(
            getPanelFrameStyleValue(panelFrameStyleBaselineComponent, panelFrameStyleFilterKey)
          )
    );
  }

  function formatPanelFrameStyleValue(
    panelFrameStyleFormatKey: any,
    panelFrameStylePropertyValue: any,
    panelFrameStylePropertyDocument: any = ctx.activeProject?.document
  ) {
    if (typeof panelFrameStylePropertyValue == "boolean") {
      if (panelFrameStylePropertyValue) {
        return "显示";
      } else {
        return "隐藏";
      }
    }
    if (panelFrameStyleFormatKey === "width" || panelFrameStyleFormatKey === "height") {
      const panelFrameStyleCanvasExtent = Number(
        panelFrameStylePropertyDocument?.canvas?.[panelFrameStyleFormatKey] ||
          (panelFrameStyleFormatKey === "width" ? 2778 : 1940)
      );
      return (
        roundField((Number(panelFrameStylePropertyValue || 0) / panelFrameStyleCanvasExtent) * 100) +
        "%"
      );
    }
    if (panelFrameStyleFormatKey === "scale") {
      return roundField(Number(panelFrameStylePropertyValue || 0) * 100) + "%";
    } else if (
      panelFrameStyleFormatKey === "rotation" ||
      panelFrameStyleFormatKey === "edgeAngle" ||
      panelFrameStyleFormatKey === "glowAngle"
    ) {
      return roundField(Number(panelFrameStylePropertyValue || 0)) + "°";
    } else if (
      [
        "mainOpacity",
        "secondaryOpacity",
        "edgeOpacity",
        "radius",
        "glowStrength",
        "glowSize"
      ].includes(panelFrameStyleFormatKey)
    ) {
      return roundField(Number(panelFrameStylePropertyValue || 0) * 100) + "%";
    } else if (
      ["mainTextLeft", "mainTextTop", "secondaryTextLeft", "secondaryTextTop"].includes(
        panelFrameStyleFormatKey
      )
    ) {
      return roundField(Number(panelFrameStylePropertyValue || 0)) + "%";
    } else {
      return String(panelFrameStylePropertyValue ?? "");
    }
  }

  /**
   * 读取导航按钮组件在指定属性上的当前取值，并兼容旧版「统一透明度」字段：老文档把文字/图标的闲置与激活透明度合并成
   */
  function getNavigationStyleValue(navigationStyleSourceComponent: any, navigationStylePropertyKey: any) {
    if (!navigationStyleSourceComponent) {
      return;
    }
    if (navigationStylePropertyKey === "width" || navigationStylePropertyKey === "height") {
      return Number(navigationStyleSourceComponent.position?.[navigationStylePropertyKey] || 100);
    }
    if (navigationStylePropertyKey === "scale") {
      return Number(navigationStyleSourceComponent.style?.scale || 1);
    }
    if (navigationStylePropertyKey === "rotation") {
      return Number(navigationStyleSourceComponent.position?.rotation || 0);
    }
    const navigationStyleProperties = navigationStyleSourceComponent.properties || {};
    const navigationStyleDefaultValue = navigationStyleDefaults[navigationStylePropertyKey];
    if (
      navigationStylePropertyKey === "textIdleOpacity" ||
      navigationStylePropertyKey === "textActiveOpacity" ||
      navigationStylePropertyKey === "iconIdleOpacity" ||
      navigationStylePropertyKey === "iconActiveOpacity"
    ) {
      return (
        navigationStyleProperties[navigationStylePropertyKey] ?? navigationStyleDefaultValue
      );
    } else if (
      navigationStylePropertyKey === "mainTextLeft" ||
      navigationStylePropertyKey === "secondaryTextLeft"
    ) {
      return (
        navigationStyleProperties[navigationStylePropertyKey] ??
        navigationStyleProperties.textLeft ??
        navigationStyleDefaultValue
      );
    } else if (navigationStylePropertyKey === "mainTextTop") {
      return (
        navigationStyleProperties[navigationStylePropertyKey] ??
        Number(navigationStyleProperties.textTop ?? 81.5) - 1800 / 64.36
      );
    } else if (navigationStylePropertyKey === "secondaryTextTop") {
      return (
        navigationStyleProperties[navigationStylePropertyKey] ??
        navigationStyleProperties.textTop ??
        navigationStyleDefaultValue
      );
    } else {
      return navigationStyleProperties[navigationStylePropertyKey] ?? navigationStyleDefaultValue;
    }
  }

  function collectNavigationStyleChanges(navigationChangesComponent: any) {
    ctx.pruneNavigationSavedSettings(navigationChangesComponent);
    return [
      ...(ctx.navigationButtonSavedSettingsByComponentId.get(navigationChangesComponent?.id)?.entries() ||
        [])
    ]
      .filter(
        ([savedNavigationKey, navigationSavedPropertyValue]) =>
          !ctx.areComponentValuesEqual(
            getNavigationStyleValue(navigationChangesComponent, savedNavigationKey),
            navigationSavedPropertyValue
          )
      )
      .map(([savedNavigationEntryKey]) => savedNavigationEntryKey);
  }

  function formatNavigationStyleValue(
    navigationFormatKey: any,
    navigationPropertyValue: any,
    navigationPropertyDocument: any = ctx.activeProject?.document
  ) {
    if (typeof navigationPropertyValue == "boolean") {
      if (navigationPropertyValue) {
        return "显示";
      } else {
        return "隐藏";
      }
    }
    if (navigationFormatKey === "width" || navigationFormatKey === "height") {
      const navigationStyleCanvasExtent = Number(
        navigationPropertyDocument?.canvas?.[navigationFormatKey] ||
          (navigationFormatKey === "width" ? 2778 : 1940)
      );
      return (
        roundField((Number(navigationPropertyValue || 0) / navigationStyleCanvasExtent) * 100) + "%"
      );
    }
    if (navigationFormatKey === "scale") {
      return roundField(Number(navigationPropertyValue || 0) * 100) + "%";
    } else if (navigationFormatKey === "rotation") {
      return roundField(Number(navigationPropertyValue || 0)) + "°";
    } else if (
      [
        "textIdleOpacity",
        "textActiveOpacity",
        "iconIdleOpacity",
        "iconActiveOpacity",
        "frameIdleOpacity",
        "frameActiveOpacity",
        "radius",
        "glowIdleStrength",
        "glowIdleSize",
        "glowActiveStrength",
        "glowActiveSize"
      ].includes(navigationFormatKey)
    ) {
      return roundField(Number(navigationPropertyValue || 0) * 100) + "%";
    } else if (
      [
        "mainTextLeft",
        "mainTextTop",
        "secondaryTextLeft",
        "secondaryTextTop",
        "iconLeft",
        "iconTop"
      ].includes(navigationFormatKey)
    ) {
      return roundField(Number(navigationPropertyValue || 0)) + "%";
    } else if (navigationFormatKey === "frameAngle" || navigationFormatKey === "glowAngle") {
      return roundField(Number(navigationPropertyValue || 0)) + "°";
    } else {
      return String(navigationPropertyValue ?? "");
    }
  }

  function resolveSensorKind(sensorComponent: any) {
    const sensorKindCandidate = sensorComponent?.properties?.sensorKind;
    if (
      ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(sensorKindCandidate)
    ) {
      return sensorKindCandidate;
    } else {
      return "presence";
    }
  }

  function resolveSensorKindLabel(sensorLabelComponent: any) {
    const labels: AnyObj = {
      presence: "人体/人在传感器",
      "door-window": "门窗传感器",
      "water-leak": "水浸传感器",
      smoke: "烟雾传感器",
      "natural-gas": "天然气传感器"
    };
    return labels[resolveSensorKind(sensorLabelComponent)];
  }

  /**
   * 按传感器品类列出参与「变更对比」的属性键：尺寸与变换四个键是所有品类共用的，其余按品类收敛到各自的专有字段
   */
  function presenceSensorPropertyKeys(presenceSensorComponent: any) {
    const transformPropertyKeys = ["width", "height", "scale", "rotation"];
    const resolvedSensorKind = resolveSensorKind(presenceSensorComponent);
    if (resolvedSensorKind === "presence") {
      return [
        "iconColor",
        "iconOnColor",
        "haloVisible",
        "haloScaleX",
        "haloScaleY",
        "haloRotation",
        "haloOpacity",
        "personVisible",
        "personScale",
        "personRotation",
        "personOpacity",
        "orbitDuration",
        ...transformPropertyKeys
      ];
    } else if (resolvedSensorKind === "door-window") {
      return ["iconOnColor", "perspectiveCorners", ...transformPropertyKeys];
    } else if (resolvedSensorKind === "water-leak") {
      return ["waterLeakColor", ...transformPropertyKeys];
    } else if (resolvedSensorKind === "smoke") {
      return ["smokeColor", ...transformPropertyKeys];
    } else {
      return ["naturalGasColor", ...transformPropertyKeys];
    }
  }

  const lineChartDefaults: AnyObj = {
    valueVisible: true,
    statePrecision: "auto",
    valueScale: 100,
    valueColor: "#dce1e5",
    valueOffsetX: 0,
    valueOffsetY: 0,
    updateInterval: 600,
    hours: 24,
    cornerRadius: 10,
    thresholdMode: "auto"
  };

  const lineChartPropertyDefinitions: AnyObj = {
    valueVisible: {
      group: "当前数值",
      label: "当前数值显示"
    },
    statePrecision: {
      group: "当前数值",
      label: "数值小数位"
    },
    valueScale: {
      group: "当前数值",
      label: "当前数值大小"
    },
    valueColor: {
      group: "当前数值",
      label: "当前数值颜色"
    },
    valueOffsetX: {
      group: "当前数值",
      label: "当前数值左右位置"
    },
    valueOffsetY: {
      group: "当前数值",
      label: "当前数值上下位置"
    },
    updateInterval: {
      group: "历史数据",
      label: "刷新间隔"
    },
    hours: {
      group: "历史数据",
      label: "历史范围"
    },
    cornerRadius: {
      group: "折线",
      label: "圆角大小"
    },
    thresholdMode: {
      group: "折线",
      label: "阈值模式"
    },
    thresholds: {
      group: "折线",
      label: "阈值与折线颜色"
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度"
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度"
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放"
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转"
    }
  };

  const titleButtonDefaults: AnyObj = {
    mainTextVisible: true,
    secondaryTextVisible: true,
    mainColor: "#b9bbc0",
    secondaryColor: "#70737b",
    mainSize: 34,
    secondarySize: 12,
    mainWeight: 0.3,
    secondaryWeight: 0.2,
    mainSpacing: 1,
    secondarySpacing: 2,
    secondaryLineGap: 2,
    mainTextLeft: 5.5,
    mainTextTop: 45,
    secondaryTextLeft: 54,
    secondaryTextTop: 43,
    iconVisible: true,
    iconColor: "#b9bbc0",
    iconSize: 30,
    iconLeft: 50,
    iconTop: 45,
    frameVisible: true,
    frameColor: "#60636a",
    frameWidth: 1.5,
    frameSize: 100,
    frameSpacing: 100,
    frameOffsetX: 0,
    frameOffsetY: 0,
    markerVisible: true,
    markerColor: paletteColor("--hos-accent", "#ffc46a"),
    markerSize: 10,
    markerLeft: 1.8,
    markerTop: 84
  };

  const titleButtonPropertyDefinitions: AnyObj = {
    mainTextVisible: {
      group: "中文标题",
      label: "中文标题显示"
    },
    mainColor: {
      group: "中文标题",
      label: "中文题色"
    },
    mainSize: {
      group: "中文标题",
      label: "中文大小"
    },
    mainWeight: {
      group: "中文标题",
      label: "中文粗细"
    },
    mainSpacing: {
      group: "中文标题",
      label: "中文字间距"
    },
    mainTextLeft: {
      group: "中文标题",
      label: "中文左右位置"
    },
    mainTextTop: {
      group: "中文标题",
      label: "中文上下位置"
    },
    secondaryTextVisible: {
      group: "英文标题",
      label: "英文标题显示"
    },
    secondaryColor: {
      group: "英文标题",
      label: "英文颜色"
    },
    secondarySize: {
      group: "英文标题",
      label: "英文大小"
    },
    secondaryWeight: {
      group: "英文标题",
      label: "英文粗细"
    },
    secondarySpacing: {
      group: "英文标题",
      label: "英文字间距"
    },
    secondaryLineGap: {
      group: "英文标题",
      label: "英文行间距"
    },
    secondaryTextLeft: {
      group: "英文标题",
      label: "英文左右位置"
    },
    secondaryTextTop: {
      group: "英文标题",
      label: "英文上下位置"
    },
    iconVisible: {
      group: "图标",
      label: "图标显示"
    },
    iconColor: {
      group: "图标",
      label: "图标颜色"
    },
    iconSize: {
      group: "图标",
      label: "图标大小"
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置"
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置"
    },
    frameVisible: {
      group: "括号",
      label: "括号显示"
    },
    frameColor: {
      group: "括号",
      label: "括号颜色"
    },
    frameWidth: {
      group: "括号",
      label: "括号粗细"
    },
    frameSize: {
      group: "括号",
      label: "括号大小"
    },
    frameSpacing: {
      group: "括号",
      label: "括号间距"
    },
    frameOffsetX: {
      group: "括号",
      label: "括号左右位置"
    },
    frameOffsetY: {
      group: "括号",
      label: "括号上下位置"
    },
    markerVisible: {
      group: "三角指示",
      label: "三角指示显示"
    },
    markerColor: {
      group: "三角指示",
      label: "三角指示颜色"
    },
    markerSize: {
      group: "三角指示",
      label: "三角指示大小"
    },
    markerLeft: {
      group: "三角指示",
      label: "三角指示左右位置"
    },
    markerTop: {
      group: "三角指示",
      label: "三角指示上下位置"
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度"
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度"
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放"
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转"
    }
  };

  const airConditionerDefaults: AnyObj = {
    iconVisible: true,
    mainTextVisible: true,
    secondaryTextVisible: true,
    iconOffColor: "#9aa5ad",
    iconOnColor: paletteColor("--hos-cool", "#58c4ff"),
    badgeColor: "#5b5e66",
    badgeOpacity: 0.58,
    symbolSize: 14,
    badgeSize: 28,
    iconLeft: 20,
    iconTop: 50,
    mainColor: "#c7c8cb",
    mainSize: 21,
    mainWeight: 0.24,
    mainSpacing: 0.5,
    mainTextLeft: 39,
    mainTextTop: 40,
    secondaryColor: "#75777d",
    secondarySize: 12,
    secondaryWeight: 0.12,
    secondarySpacing: 0.3,
    secondaryTextLeft: 39,
    secondaryTextTop: 67,
    airflowVisible: true,
    airflowMotion: "dynamic",
    airflowCoolColor: paletteColor("--hos-cool", "#58c4ff"),
    airflowHeatColor: paletteColor("--hos-heat", "#ff8a65"),
    airflowOtherColor: AIRFLOW_OTHER_COLOR,
    airflowAngle: 7,
    airflowCurve: 20,
    airflowLength: 200,
    airflowFadePosition: 50,
    airflowSpread: 100,
    airflowDensity: 60,
    airflowIrregularity: 50,
    airflowThickness: 40,
    airflowStrength: 200,
    airflowBlur: 6,
    airflowSpeed: 1,
    airflowOffsetX: -75,
    airflowOffsetY: 34,
    airflowWidth: 64,
    airflowHeight: 125,
    airflowScale: 1,
    airflowRotation: -3
  };

  const airConditionerPropertyDefinitions: AnyObj = {
    iconVisible: {
      group: "图标",
      label: "图标显示"
    },
    iconOffColor: {
      group: "图标",
      label: "关闭颜色"
    },
    iconOnColor: {
      group: "图标",
      label: "开启颜色"
    },
    badgeColor: {
      group: "图标",
      label: "底座颜色"
    },
    badgeOpacity: {
      group: "图标",
      label: "底座透明度"
    },
    symbolSize: {
      group: "图标",
      label: "图标大小"
    },
    badgeSize: {
      group: "图标",
      label: "底座大小"
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置"
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置"
    },
    mainTextVisible: {
      group: "标题",
      label: "标题显示"
    },
    mainColor: {
      group: "标题",
      label: "颜色"
    },
    mainSize: {
      group: "标题",
      label: "大小"
    },
    mainWeight: {
      group: "标题",
      label: "粗细"
    },
    mainSpacing: {
      group: "标题",
      label: "字间距"
    },
    mainTextLeft: {
      group: "标题",
      label: "左右位置"
    },
    mainTextTop: {
      group: "标题",
      label: "上下位置"
    },
    secondaryTextVisible: {
      group: "状态",
      label: "状态显示"
    },
    secondaryColor: {
      group: "状态",
      label: "颜色"
    },
    secondarySize: {
      group: "状态",
      label: "大小"
    },
    secondaryWeight: {
      group: "状态",
      label: "粗细"
    },
    secondarySpacing: {
      group: "状态",
      label: "字间距"
    },
    secondaryTextLeft: {
      group: "状态",
      label: "左右位置"
    },
    secondaryTextTop: {
      group: "状态",
      label: "上下位置"
    },
    airflowVisible: {
      group: "出风效果",
      label: "显示"
    },
    airflowMotion: {
      group: "出风效果",
      label: "效果模式"
    },
    airflowCoolColor: {
      group: "出风颜色",
      label: "制冷"
    },
    airflowHeatColor: {
      group: "出风颜色",
      label: "制热"
    },
    airflowOtherColor: {
      group: "出风颜色",
      label: "其它"
    },
    airflowAngle: {
      group: "出风效果",
      label: "整体方向"
    },
    airflowCurve: {
      group: "出风效果",
      label: "弯曲程度"
    },
    airflowLength: {
      group: "出风效果",
      label: "单股长度"
    },
    airflowFadePosition: {
      group: "出风效果",
      label: "渐变消失位置"
    },
    airflowSpread: {
      group: "出风效果",
      label: "扩散宽度"
    },
    airflowDensity: {
      group: "出风效果",
      label: "气流密度"
    },
    airflowIrregularity: {
      group: "出风效果",
      label: "错落程度"
    },
    airflowThickness: {
      group: "出风效果",
      label: "整体粗细"
    },
    airflowStrength: {
      group: "出风效果",
      label: "显示强度"
    },
    airflowBlur: {
      group: "出风效果",
      label: "模糊大小"
    },
    airflowSpeed: {
      group: "出风效果",
      label: "动画速度"
    },
    airflowOffsetX: {
      group: "出风位置",
      label: "左右偏移"
    },
    airflowOffsetY: {
      group: "出风位置",
      label: "上下偏移"
    },
    airflowWidth: {
      group: "出风位置",
      label: "宽度"
    },
    airflowHeight: {
      group: "出风位置",
      label: "高度"
    },
    airflowScale: {
      group: "出风位置",
      label: "缩放"
    },
    airflowRotation: {
      group: "出风位置",
      label: "旋转"
    },
    width: {
      group: "按钮尺寸",
      label: "宽度"
    },
    height: {
      group: "按钮尺寸",
      label: "高度"
    },
    scale: {
      group: "按钮变换",
      label: "缩放"
    },
    rotation: {
      group: "按钮变换",
      label: "旋转"
    }
  };

  const iconButtonEffectDefaults: AnyObj = {
    buttonVisible: true,
    effectVisible: true,
    icon: "mdi:lightbulb-outline",
    iconOffColor: "#9aa5ad",
    iconOnColor: "#ffffff",
    iconSize: 44,
    buttonOffColor: "#17242d",
    buttonOnColor: "#1f91b8",
    buttonOpacity: 0.92,
    frameColor: "#dcebf2",
    frameWidth: 1.5,
    frameOpacity: 0.72,
    radius: 50,
    glowColor: "#43c8f0",
    glowOffStrength: 0,
    glowOnStrength: 1,
    effectColorTemperatureRealtime: true,
    effectBrightnessRealtime: true,
    effectOpacity: 1,
    effectFadeDuration: 0.52,
    effectLayoutMode: "free",
    effectLeft: 50,
    effectTop: 50,
    effectScale: 1,
    effectRotation: 0
  };

  const iconButtonEffectPropertyDefinitions: AnyObj = {
    buttonVisible: {
      group: "图层显示",
      label: "按钮层"
    },
    effectVisible: {
      group: "图层显示",
      label: "效果图层"
    },
    icon: {
      group: "按钮图标",
      label: "图标"
    },
    iconOffColor: {
      group: "按钮图标",
      label: "关闭后颜色"
    },
    iconOnColor: {
      group: "按钮图标",
      label: "关闭前颜色"
    },
    iconSize: {
      group: "按钮图标",
      label: "图标大小"
    },
    buttonOffColor: {
      group: "按钮背景",
      label: "关闭后颜色"
    },
    buttonOnColor: {
      group: "按钮背景",
      label: "关闭前颜色"
    },
    buttonOpacity: {
      group: "按钮背景",
      label: "透明度"
    },
    frameColor: {
      group: "外框",
      label: "颜色"
    },
    frameWidth: {
      group: "外框",
      label: "粗细"
    },
    frameOpacity: {
      group: "外框",
      label: "透明度"
    },
    radius: {
      group: "外框",
      label: "圆角"
    },
    glowColor: {
      group: "光晕",
      label: "颜色"
    },
    glowOffStrength: {
      group: "光晕",
      label: "关闭后强度"
    },
    glowOnStrength: {
      group: "光晕",
      label: "关闭前强度"
    },
    effectColorTemperatureRealtime: {
      group: "灯光实时反馈",
      label: "色温实时"
    },
    effectBrightnessRealtime: {
      group: "灯光实时反馈",
      label: "亮度实时"
    },
    effectOpacity: {
      group: "效果图层",
      label: "透明度"
    },
    effectFadeDuration: {
      group: "效果图层",
      label: "淡入淡出时间"
    },
    effectLayoutMode: {
      group: "效果图层",
      label: "图片布局"
    },
    effectLeft: {
      group: "效果图层",
      label: "左右位置"
    },
    effectTop: {
      group: "效果图层",
      label: "上下位置"
    },
    effectScale: {
      group: "效果图层",
      label: "缩放"
    },
    effectRotation: {
      group: "效果图层",
      label: "旋转"
    },
    width: {
      group: "按钮尺寸",
      label: "宽度"
    },
    height: {
      group: "按钮尺寸",
      label: "高度"
    },
    scale: {
      group: "按钮变换",
      label: "缩放"
    },
    rotation: {
      group: "按钮变换",
      label: "旋转"
    }
  };

  const iconButtonDefaults: AnyObj = {
    iconColor: "#d7d8da",
    iconSize: 42,
    iconOffOpacity: 1,
    iconOnOpacity: 1,
    iconLeft: 50,
    iconTop: 34,
    iconOnColor: "#379bff",
    badgeColor: "#5b5e66",
    badgeOpacity: 0.58,
    symbolSize: 14,
    badgeSize: 28,
    mainColor: "#c7c8cb",
    mainSize: 25,
    mainWeight: 0.25,
    mainSpacing: 1,
    mainTextLeft: 9,
    mainTextTop: 78,
    mainOffOpacity: 1,
    mainOnOpacity: 1,
    secondaryColor: "#75777d",
    secondarySize: 10,
    secondaryWeight: 0.18,
    secondarySpacing: 0.7,
    secondaryTextLeft: 9,
    secondaryTextTop: 91,
    secondaryOffOpacity: 1,
    secondaryOnOpacity: 1,
    onFillVisible: true,
    onFillColor: "#dfb64f",
    onFillStrength: 1,
    onFillFadeDuration: 0.3,
    frameVisible: true,
    frameWidth: 1,
    frameAngle: 45,
    frameOffOpacity: 0.8,
    frameOnOpacity: 1,
    cutCorner: 20,
    softLightVisible: true,
    softLightColor: "#ffffff",
    softLightStrength: 1,
    softLightSize: 1,
    softLightAngle: 45,
    glowVisible: true,
    glowColor: "#ffffff",
    glowStrength: 1,
    glowSize: 1,
    glowAngle: 220,
    haloVisible: true,
    haloScaleX: 1,
    haloScaleY: 1,
    haloRotation: 0,
    haloOpacity: 1,
    personVisible: true,
    personScale: 1,
    personRotation: 0,
    personOpacity: 1,
    orbitDuration: 8,
    perspectiveCorners: ctx.DEFAULT_PERSPECTIVE_CORNERS,
    waterLeakColor: "#42c8ff",
    smokeColor: "#ffffff",
    naturalGasColor: "#ffb347"
  };

  const iconButtonPropertyDefinitions: AnyObj = {
    iconColor: {
      group: "图标",
      label: "图标颜色"
    },
    iconOnColor: {
      group: "图标",
      label: "开启颜色"
    },
    badgeColor: {
      group: "图标",
      label: "底座颜色"
    },
    badgeOpacity: {
      group: "图标",
      label: "底座透明度"
    },
    symbolSize: {
      group: "图标",
      label: "图标大小"
    },
    badgeSize: {
      group: "图标",
      label: "底座大小"
    },
    iconSize: {
      group: "图标",
      label: "图标大小"
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置"
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置"
    },
    iconOffOpacity: {
      group: "图标",
      label: "图标关闭后透明度"
    },
    iconOnOpacity: {
      group: "图标",
      label: "图标关闭前透明度"
    },
    mainColor: {
      group: "中文标题",
      label: "中文颜色"
    },
    mainSize: {
      group: "中文标题",
      label: "中文大小"
    },
    mainWeight: {
      group: "中文标题",
      label: "中文粗细"
    },
    mainSpacing: {
      group: "中文标题",
      label: "中文字间距"
    },
    mainTextLeft: {
      group: "中文标题",
      label: "中文左右位置"
    },
    mainTextTop: {
      group: "中文标题",
      label: "中文上下位置"
    },
    mainOffOpacity: {
      group: "中文标题",
      label: "中文关闭后透明度"
    },
    mainOnOpacity: {
      group: "中文标题",
      label: "中文关闭前透明度"
    },
    secondaryColor: {
      group: "英文标题",
      label: "英文颜色"
    },
    secondarySize: {
      group: "英文标题",
      label: "英文大小"
    },
    secondaryWeight: {
      group: "英文标题",
      label: "英文粗细"
    },
    secondarySpacing: {
      group: "英文标题",
      label: "英文字间距"
    },
    secondaryTextLeft: {
      group: "英文标题",
      label: "英文左右位置"
    },
    secondaryTextTop: {
      group: "英文标题",
      label: "英文上下位置"
    },
    secondaryOffOpacity: {
      group: "英文标题",
      label: "英文关闭后透明度"
    },
    secondaryOnOpacity: {
      group: "英文标题",
      label: "英文关闭前透明度"
    },
    onFillVisible: {
      group: "状态填充",
      label: "状态填充显示"
    },
    onFillColor: {
      group: "状态填充",
      label: "关闭前填充颜色"
    },
    onFillStrength: {
      group: "状态填充",
      label: "关闭前填充强度"
    },
    onFillFadeDuration: {
      group: "状态填充",
      label: "淡入淡出时间"
    },
    frameVisible: {
      group: "外框",
      label: "外框显示"
    },
    frameWidth: {
      group: "外框",
      label: "外框粗细"
    },
    frameAngle: {
      group: "外框",
      label: "外框渐变角度"
    },
    frameOffOpacity: {
      group: "外框",
      label: "外框关闭后透明度"
    },
    frameOnOpacity: {
      group: "外框",
      label: "外框关闭前透明度"
    },
    cutCorner: {
      group: "外框",
      label: "切角大小"
    },
    softLightVisible: {
      group: "柔光",
      label: "柔光显示"
    },
    softLightColor: {
      group: "柔光",
      label: "柔光颜色"
    },
    softLightSize: {
      group: "柔光",
      label: "柔光大小"
    },
    softLightStrength: {
      group: "柔光",
      label: "柔光强度"
    },
    softLightAngle: {
      group: "柔光",
      label: "柔光角度"
    },
    glowVisible: {
      group: "泛光",
      label: "泛光显示"
    },
    glowColor: {
      group: "泛光",
      label: "泛光颜色"
    },
    glowSize: {
      group: "泛光",
      label: "泛光大小"
    },
    glowStrength: {
      group: "泛光",
      label: "泛光强度"
    },
    glowAngle: {
      group: "泛光",
      label: "泛光角度"
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度"
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度"
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放"
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转"
    }
  };

  const presenceSensorPropertyDefinitions: AnyObj = {
    iconColor: {
      group: "显示颜色",
      label: "无人颜色"
    },
    iconOnColor: {
      group: "显示颜色",
      label: "有人颜色"
    },
    waterLeakColor: {
      group: "显示颜色",
      label: "水浸颜色"
    },
    smokeColor: {
      group: "显示颜色",
      label: "烟雾颜色"
    },
    naturalGasColor: {
      group: "显示颜色",
      label: "天然气颜色"
    },
    haloVisible: {
      group: "运动路径",
      label: "光环显示"
    },
    haloScaleX: {
      group: "运动路径",
      label: "光环宽度"
    },
    haloScaleY: {
      group: "运动路径",
      label: "光环高度"
    },
    haloRotation: {
      group: "运动路径",
      label: "光环旋转"
    },
    haloOpacity: {
      group: "运动路径",
      label: "光环透明度"
    },
    personVisible: {
      group: "运动路径",
      label: "小人显示"
    },
    personScale: {
      group: "运动路径",
      label: "小人缩放"
    },
    personRotation: {
      group: "运动路径",
      label: "小人旋转"
    },
    personOpacity: {
      group: "运动路径",
      label: "小人透明度"
    },
    orbitDuration: {
      group: "运动路径",
      label: "循环一周"
    },
    perspectiveCorners: {
      group: "透视",
      label: "四角透视"
    },
    width: iconButtonPropertyDefinitions.width,
    height: iconButtonPropertyDefinitions.height,
    scale: iconButtonPropertyDefinitions.scale,
    rotation: iconButtonPropertyDefinitions.rotation
  };

  const cameraDefaults: AnyObj = {
    mediaVisible: true,
    displayMode: "live",
    refreshInterval: 10,
    fit: "fill",
    frameVisible: true,
    frameColor: "#d4d4d4",
    frameWidth: 1,
    radius: 0.04,
    frameAngle: 45,
    frameOpacity: 0.9
  };

  const cameraPropertyDefinitions: AnyObj = {
    mediaVisible: {
      group: "画面",
      label: "画面显示"
    },
    displayMode: {
      group: "画面",
      label: "显示方式"
    },
    refreshInterval: {
      group: "画面",
      label: "快照更新时间"
    },
    fit: {
      group: "画面",
      label: "画面比例"
    },
    frameVisible: {
      group: "外框",
      label: "外框显示"
    },
    frameColor: {
      group: "外框",
      label: "外框颜色"
    },
    frameWidth: {
      group: "外框",
      label: "外框粗细"
    },
    radius: {
      group: "外框",
      label: "圆角大小"
    },
    frameAngle: {
      group: "外框",
      label: "渐变角度"
    },
    frameOpacity: {
      group: "外框",
      label: "外框透明度"
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度"
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度"
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放"
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转"
    }
  };

  const panelFrameStyleDefaults: AnyObj = {
    mainTextVisible: true,
    mainColor: "#ffffff",
    mainSize: 30,
    mainWeight: 0,
    mainOpacity: 0.72,
    mainSpacing: 2,
    mainTextLeft: 5.2,
    mainTextTop: 20,
    secondaryTextVisible: true,
    secondaryColor: "#ffffff",
    secondarySize: 15,
    secondaryWeight: 0,
    secondaryOpacity: 0.36,
    secondarySpacing: 2.1,
    secondaryTextLeft: 5.2,
    secondaryTextTop: 28,
    edgeVisible: true,
    edgeColor: "#d4d4d4",
    edgeWidth: 0.9,
    edgeOpacity: 1,
    radius: 0.195,
    edgeAngle: 45,
    glowVisible: true,
    glowColor: "#ffffff",
    glowStrength: 0.5,
    glowSize: 1.5,
    glowAngle: 242
  };

  const panelFrameStylePropertyDefinitions: AnyObj = {
    mainTextVisible: {
      group: "主文字",
      label: "主文字显示"
    },
    mainColor: {
      group: "主文字",
      label: "主文字颜色"
    },
    mainSize: {
      group: "主文字",
      label: "主文字大小"
    },
    mainWeight: {
      group: "主文字",
      label: "主文字笔画粗细"
    },
    mainOpacity: {
      group: "主文字",
      label: "主文字透明度"
    },
    mainSpacing: {
      group: "主文字",
      label: "主文字字间距"
    },
    mainTextLeft: {
      group: "主文字",
      label: "主文字左右位置"
    },
    mainTextTop: {
      group: "主文字",
      label: "主文字上下位置"
    },
    secondaryTextVisible: {
      group: "副文字",
      label: "副文字显示"
    },
    secondaryColor: {
      group: "副文字",
      label: "副文字颜色"
    },
    secondarySize: {
      group: "副文字",
      label: "副文字大小"
    },
    secondaryWeight: {
      group: "副文字",
      label: "副文字笔画粗细"
    },
    secondaryOpacity: {
      group: "副文字",
      label: "副文字透明度"
    },
    secondarySpacing: {
      group: "副文字",
      label: "副文字字间距"
    },
    secondaryTextLeft: {
      group: "副文字",
      label: "副文字左右位置"
    },
    secondaryTextTop: {
      group: "副文字",
      label: "副文字上下位置"
    },
    edgeVisible: {
      group: "外框",
      label: "外框显示"
    },
    edgeColor: {
      group: "外框",
      label: "外框颜色"
    },
    edgeWidth: {
      group: "外框",
      label: "外框粗细"
    },
    edgeOpacity: {
      group: "外框",
      label: "外框透明度"
    },
    radius: {
      group: "外框",
      label: "外框圆角"
    },
    edgeAngle: {
      group: "外框",
      label: "外框渐变角度"
    },
    glowVisible: {
      group: "柔光",
      label: "柔光显示"
    },
    glowColor: {
      group: "柔光",
      label: "柔光颜色"
    },
    glowStrength: {
      group: "柔光",
      label: "柔光强度"
    },
    glowSize: {
      group: "柔光",
      label: "柔光大小"
    },
    glowAngle: {
      group: "柔光",
      label: "柔光角度"
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度"
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度"
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放"
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转"
    }
  };

  const navigationStyleDefaults: AnyObj = {
    mainTextVisible: true,
    secondaryTextVisible: true,
    iconVisible: true,
    frameVisible: true,
    glowVisible: true,
    mainColor: "#ffffff",
    secondaryColor: "#e9edf0",
    mainSize: 30,
    secondarySize: 10,
    mainWeight: 0.5,
    secondaryWeight: 0.4,
    mainSpacing: 4,
    secondarySpacing: 3,
    mainTextLeft: 29.9,
    mainTextTop: 53.83,
    secondaryTextLeft: 29.9,
    secondaryTextTop: 81.8,
    textIdleOpacity: 0.4,
    textActiveOpacity: 0.9,
    icon: "mdi:home-outline",
    iconColor: "#fcfcfc",
    iconSize: 54,
    iconLeft: 16.5,
    iconTop: 50,
    iconIdleOpacity: 0.9,
    iconActiveOpacity: 0.9,
    frameColor: "#d9e0e6",
    frameWidth: 1.5,
    frameIdleOpacity: 1,
    frameActiveOpacity: 1,
    radius: 0.5,
    frameAngle: 45,
    glowColor: "#f2f6fa",
    glowAngle: 90,
    glowIdleStrength: 1,
    glowIdleSize: 1.5,
    glowActiveStrength: 2.4,
    glowActiveSize: 2.2
  };

  return { airConditionerDefaults, airConditionerPropertyDefinitions, cameraDefaults, cameraPropertyDefinitions, collectAirConditionerChangedProperties, collectCameraChangedProperties, collectIconButtonChangedProperties, collectIconButtonEffectChangedProperties, collectLineChartChangedProperties, collectNavigationStyleChanges, collectPanelFrameStyleChanges, collectTitleButtonChangedProperties, formatAirConditionerPropertyValue, formatCameraPropertyValue, formatIconButtonEffectPropertyValue, formatIconButtonPropertyValue, formatLineChartPropertyValue, formatNavigationStyleValue, formatPanelFrameStyleValue, formatTitleButtonPropertyValue, getAirConditionerPropertyValue, getCameraPropertyValue, getIconButtonEffectPropertyValue, getIconButtonPropertyValue, getLineChartPropertyValue, getNavigationStyleValue, getPanelFrameStyleValue, getTitleButtonPropertyValue, iconButtonDefaults, iconButtonEffectDefaults, iconButtonEffectPropertyDefinitions, iconButtonPropertyDefinitions, lineChartDefaults, lineChartPropertyDefinitions, navigationStyleDefaults, panelFrameStyleDefaults, panelFrameStylePropertyDefinitions, presenceSensorPropertyDefinitions, presenceSensorPropertyKeys, resolveIconButtonPropertyDefinition, resolveSensorKind, resolveSensorKindLabel, titleButtonDefaults, titleButtonPropertyDefinitions };
}
