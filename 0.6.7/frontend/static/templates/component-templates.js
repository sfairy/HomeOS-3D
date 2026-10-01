import {
  percentageBarDefaults as percentageBarDefaults2,
  percentageBarDimensions as percentageBarDimensions2,
} from "../percentage-bar-model.js?v=20260930-percentage-text-offset-v1";
import { FLOW_LINE_DEFAULTS as FLOW_LINE_DEFAULTS2 } from "../flow-line-model.js?v=20260930-flow-line-sign-v1";
import { interaction3dTemplate as interaction3dTemplate2 } from "../modules/interaction3d/definition.js?v=20260911-page-dimming-defaults-v1-20260918-review-1234-v2-region-only-v1-20260926-fan-v1-20260926-airer-v2";
const f = new Map();
registerComponentTemplate(interaction3dTemplate2);
const p = new Map(),
  w = {
    shared: [
      "time",
      "date",
      "weather",
      "line-chart",
      "percentage-bar",
      "panel-frame",
      "flow-line",
      "navigation-button",
      "scene-mode",
    ],
    page: [
      "image",
      "floorplan-auto-diagram",
      "title-button",
      "light-statistics",
      "icon-button",
      "icon-button-effect",
      "device-button",
      "presence-sensor",
      "air-conditioner",
      "vacuum-map",
      "camera",
      "line-chart",
      "percentage-bar",
      "panel-frame",
      "flow-line",
      "scene-mode",
    ],
  },
  S = {
    image: {
      properties: {
        opacity: 1,
        layoutMode: "free",
        fit: "contain",
      },
      style: {
        scale: 1,
        visible: true,
      },
    },
    "floorplan-auto-diagram": {
      properties: {
        label: "户型图自动导图",
        exportFolder: "",
        layoutMode: "free",
        baseAssetId: "",
        floorPlanAssetId: "",
        previewReady: false,
        previewing: false,
        interactionMode: "position",
        cameraView: "free",
        cameraMode: "orthographic",
        floorSelection: "",
        cameraTopRotation: 0,
        cameraFocalLength: 50,
        generated: false,
        lightLayers: [],
      },
      style: {
        scale: 1,
        visible: true,
      },
    },
    "vacuum-map": {
      properties: {
        opacity: 0.5,
      },
      style: {
        scale: 1.049,
        visible: true,
      },
      dimensions: {
        width: 1555.68,
        height: 1605.684,
      },
    },
    "icon-button-effect": {
      properties: {
        icon: "mdi:lightbulb-outline",
        iconOffColor: "#4f4f4f",
        iconOnColor: "#ffffff",
        iconSize: 79,
        buttonOffColor: "#bababa",
        buttonOnColor: "#feae01",
        buttonOpacity: 0.8,
        frameColor: "#dcebf2",
        frameWidth: 0,
        frameOpacity: 0,
        radius: 50,
        glowColor: "#ffa200",
        glowOffStrength: 0,
        glowOnStrength: 3,
        effectAssetId: "",
        effectOpacity: 1,
        effectFadeDuration: 0.3,
        effectBlendMode: "normal",
        effectLayoutMode: "fill",
        effectLeft: 50,
        effectTop: 50,
        effectScale: 1,
        effectRotation: 0,
      },
      style: {
        scale: 0.19458752228421689,
        visible: true,
      },
      dimensions: {
        width: 208.35,
        height: 208.35,
      },
    },
    "title-button": {
      properties: {
        mainText: "房间",
        secondaryText: "ROOM\nLIGHTING",
        mainTextVisible: true,
        secondaryTextVisible: true,
        mainColor: "#b9bbc0",
        secondaryColor: "#70737b",
        mainSize: 45,
        secondarySize: 19,
        mainWeight: 0.3,
        secondaryWeight: 0,
        mainSpacing: 5.7,
        secondarySpacing: 1.9,
        secondaryLineGap: 6,
        mainTextTop: 43.3,
        secondaryTextTop: 42.2,
        iconVisible: false,
        icon: "mdi:home-account",
        iconSize: 55,
        iconLeft: 10.7,
        iconTop: 42.5,
        frameColor: "#60636a",
        frameWidth: 0.8,
        frameSize: 119,
        frameOffsetY: -6.1,
        markerVisible: true,
        markerColor: "#f2a20d",
        markerSize: 16,
        markerTop: 110,
        opacity: 1,
      },
      style: {
        scale: 0.9213987523473026,
        visible: true,
      },
      dimensions: {
        width: 500.04,
        height: 121.94,
      },
    },
    "icon-button": {
      properties: {
        mainText: "灯光",
        secondaryText: "LIGHTING",
        icon: "mdi:light-recessed",
        backgroundOffColor: "#24262c",
        backgroundOffOpacity: 0.82,
        backgroundOnColor: "#dfb64f",
        backgroundOnOpacity: 1,
        iconLeft: 46.7,
        iconTop: 31.3,
        iconOffColor: "#ffffff",
        iconOffOpacity: 0.5,
        iconOnColor: "#ffffff",
        iconOnOpacity: 0.9,
        iconSize: 72,
        mainOffColor: "#ffffff",
        mainOffOpacity: 0.5,
        mainOnColor: "#ffffff",
        mainOnOpacity: 0.9,
        mainSize: 20,
        mainSpacing: 0.1,
        mainTextLeft: 6,
        mainTextTop: 74.6,
        mainWeight: 0.68,
        secondaryOffColor: "#ffffff",
        secondaryOffOpacity: 0.5,
        secondaryOnColor: "#ffffff",
        secondaryOnOpacity: 0.9,
        secondarySize: 8,
        secondarySpacing: 1.5,
        secondaryTextLeft: 6,
        secondaryTextTop: 90.8,
        secondaryWeight: 0.67,
        onFillVisible: true,
        onFillColor: "#e4ad2c",
        onFillStrength: 1,
        onFillFadeDuration: 0.1,
        frameVisible: true,
        frameColor: "#81838a",
        frameWidth: 1.3,
        frameAngle: 71,
        frameOffOpacity: 0.6,
        frameOpacity: 0.8,
        cutCorner: 25,
        softLightVisible: true,
        softLightStrength: 2,
        softLightSize: 2,
        softLightAngle: 45,
        glowVisible: true,
        glowStrength: 1,
        glowSize: 1,
        glowAngle: 249,
        opacity: 1,
      },
      style: {
        scale: 0.779857559628849,
        visible: true,
      },
      dimensions: {
        width: 277.8,
        height: 300.16,
      },
    },
    "device-button": {
      properties: {
        mainText: "设备",
        secondaryText: "",
        icon: "",
        iconColor: "#d7d8da",
        iconOnColor: "#2372bf",
        iconOffOpacity: 0.72,
        iconOnOpacity: 1,
        iconLeft: 12.8,
        iconTop: 50,
        iconSize: 55,
        symbolSize: 35,
        badgeSize: 51,
        badgeOpacity: 0.36,
        mainColor: "#b0b0b0",
        mainOffOpacity: 0.82,
        mainOnOpacity: 1,
        mainSize: 21,
        mainWeight: 0.24,
        mainSpacing: 0.5,
        mainTextLeft: 39,
        mainTextTop: 40,
        secondaryColor: "#706f6f",
        secondaryOffOpacity: 0.64,
        secondaryOnOpacity: 0.82,
        secondarySize: 15,
        secondaryWeight: 0.12,
        secondarySpacing: 0.3,
        secondaryTextLeft: 39,
        secondaryTextTop: 66.2,
        onFillVisible: false,
        onFillColor: "#248eb2",
        onFillStrength: 0.16,
        frameVisible: true,
        frameWidth: 1,
        frameAngle: 45,
        frameOffOpacity: 0.35,
        frameOnOpacity: 0.8,
        cutCorner: 12,
        softLightVisible: true,
        softLightColor: "#ffffff",
        softLightStrength: 0.45,
        softLightSize: 1,
        softLightAngle: 45,
        glowVisible: false,
        glowColor: "#248eb2",
        glowStrength: 0.5,
        glowSize: 1,
        glowAngle: 220,
      },
      style: {
        scale: 0.7774703949015426,
        visible: true,
      },
      dimensions: {
        width: 277.8,
        height: 206.36,
      },
    },
    "presence-sensor": {
      properties: {
        sensorKind: "presence",
        mainText: "人在",
        secondaryText: "",
        occupiedColor: "#ffffff",
        waterLeakColor: "#42c8ff",
        smokeColor: "#ffffff",
        naturalGasColor: "#ffb347",
        clearColor: "#758189",
        animationStrength: 0.72,
        haloScale: 1,
        haloVisible: true,
        haloScaleX: 1,
        haloScaleY: 1,
        haloRotation: 0,
        haloOpacity: 1,
        personScale: 1,
        personVisible: true,
        personRotation: 0,
        personOpacity: 1,
        orbitDuration: 8,
        showDuration: true,
        historyHours: 24,
      },
      style: {
        scale: 1,
        visible: true,
      },
      dimensions: {
        width: 360,
        height: 240,
      },
    },
    camera: {
      properties: {
        fit: "fill",
        displayMode: "live",
        mediaVisible: true,
        frameVisible: true,
        opacity: 1,
        radius: 11,
        refreshInterval: 10,
      },
      style: {
        scale: 0.8252317102372743,
        visible: true,
      },
      dimensions: {
        width: 611.16,
        height: 343.7775,
      },
    },
    "air-conditioner": {
      properties: {
        deviceType: "auto",
        mainText: "空调",
        secondaryText: "",
        icon: "mdi:air-conditioner",
        iconOffColor: "#c2c2c2",
        iconOnColor: "#4581d2",
        badgeColor: "#c3c3c7",
        badgeOpacity: 0.3,
        symbolSize: 30,
        badgeSize: 39,
        iconLeft: 21.5,
        iconTop: 50,
        mainColor: "#c7c8cb",
        secondaryColor: "#969696",
        mainSize: 21,
        secondarySize: 12,
        mainWeight: 0.6,
        secondaryWeight: 0.12,
        mainSpacing: 6,
        secondarySpacing: 0.3,
        mainTextLeft: 39,
        mainTextTop: 40,
        secondaryTextLeft: 39,
        secondaryTextTop: 63.7,
        airflowVisible: true,
        airflowMotion: "dynamic",
        airflowColor: "#ffffff",
        airflowCoolColor: "#5baeed",
        airflowHeatColor: "#f67713",
        airflowAngle: 0,
        airflowCurve: 0,
        airflowLength: 200,
        airflowFadePosition: 50,
        airflowSpread: 100,
        airflowDensity: 60,
        airflowIrregularity: 50,
        airflowThickness: 40,
        airflowStrength: 219,
        airflowBlur: 6,
        airflowSpeed: 1,
        airflowHeight: 300,
        airflowScale: 0.4817745640382381,
      },
      style: {
        scale: 1.0190713138587422,
        visible: true,
      },
      dimensions: {
        width: 305.58,
        height: 150.08,
      },
    },
    time: {
      properties: {
        hour12: false,
        showSeconds: true,
        color: "#248eb2",
        fontSize: 89,
        fontWeight: 1,
        letterSpacing: 4.7,
        opacity: 1,
      },
      style: {
        scale: 0.576,
        visible: true,
      },
      dimensions: {
        width: 496.6612,
        height: 105.02,
      },
    },
    date: {
      properties: {
        showWeekday: true,
        showLunar: true,
        primaryColor: "#8d9296",
        primarySize: 36,
        primaryWeight: 0.5,
        primarySpacing: 1,
        lunarColor: "#7f878c",
        lunarSize: 24,
        lunarWeight: 0.5,
        lunarSpacing: 0.2,
        lineGap: 11,
        opacity: 1,
      },
      style: {
        scale: 0.642,
        visible: true,
      },
      dimensions: {
        width: 353.92,
        height: 81.08,
      },
    },
    weather: {
      properties: {
        iconVisible: true,
        temperatureVisible: true,
        conditionVisible: true,
        humidityVisible: true,
        iconSize: 109,
        iconGap: 0,
        temperatureColor: "#aeb3b7",
        temperatureSize: 32,
        temperatureWeight: 0.5,
        temperatureSpacing: 2.8,
        secondaryColor: "#8d9296",
        secondarySize: 18,
        secondaryWeight: 0.5,
        secondarySpacing: 1,
        lineGap: 7,
        opacity: 1,
      },
      style: {
        scale: 0.8056171554518585,
        visible: true,
      },
      dimensions: {
        width: 263.8,
        height: 109,
      },
    },
    "line-chart": {
      properties: {
        valueVisible: true,
        valueScale: 66,
        valueColor: "#94a5b3",
        valueOffsetX: -0.4,
        valueOffsetY: 1,
        updateInterval: 600,
        hours: 12,
        cornerRadius: 14,
      },
      style: {
        scale: 1,
        visible: true,
      },
      dimensions: {
        width: 525.042,
        height: 300.16,
      },
    },
    "panel-frame": {
      properties: {
        mainText: "温度",
        secondaryText: "TEMPERATURE",
        mainTextVisible: true,
        mainColor: "#ffffff",
        mainSize: 30,
        mainWeight: 0,
        mainSpacing: 2,
        secondaryTextVisible: true,
        secondaryColor: "#ffffff",
        secondarySize: 15,
        secondaryWeight: 0,
        secondarySpacing: 2.1,
        edgeVisible: true,
        edgeAngle: 45,
        glowVisible: true,
        glowColor: "#ffffff",
        glowAngle: 242,
      },
      style: {
        scale: 1,
        visible: true,
      },
      dimensions: {
        width: 527.82,
        height: 300.16,
      },
    },
    "navigation-button": {
      properties: {
        targetPage: "",
        mainText: "页面导航",
        secondaryText: "NAVIGATION",
        icon: "mdi:home-outline",
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
        secondaryWeight: 0,
        secondarySpacing: 3,
        lineGap: 20,
        textIdleOpacity: 0.4,
        textActiveOpacity: 0.9,
        textAlign: "left",
        textLeft: 29.9,
        textTop: 81.8,
        iconColor: "#fcfcfc",
        iconSize: 50,
        iconLeft: 16.5,
        iconIdleOpacity: 0.3,
        iconActiveOpacity: 0.9,
        frameColor: "#ffffff",
        glowColor: "#f2f6fa",
        frameWidth: 1.5,
        frameIdleOpacity: 0.3,
        frameActiveOpacity: 1,
        frameAngle: 45,
        glowAngle: 90,
        glowIdleStrength: 1,
        glowActiveStrength: 2.4,
        glowIdleSize: 1.5,
        glowActiveSize: 2.2,
        textGlowVisible: false,
        textGlowIdleStrength: 1.5,
        textGlowActiveStrength: 1.5,
        textGlowIdleSize: 3,
        radius: 0.5,
        idleOpacity: 0.3,
        activeOpacity: 0.96,
      },
      style: {
        scale: 0.8533204506895217,
        visible: true,
      },
      dimensions: {
        width: 555.6,
        height: 153.832,
      },
    },
  },
  x =
    /(?:text|label|name|title|icon|assetid|targetpage|layoutmode|freelayout|naturalwidth|naturalheight|fit|refreshinterval|exportfolder|previewready|previewing|interactionmode|generated|lightlayers|exportresolution|exportcamera|floorselection)$/i;
export function registerUiPackDefinition(arg1) {
  if (!arg1?.id || !arg1?.version) throw new Error("UI 方案必须包含 id 和 version。");
  p.set(
    arg1.id,
    Object.freeze({
      ...arg1,
    }),
  );
}
export function hasUiPackDefinition(arg2) {
  return p.has(arg2);
}
registerUiPackDefinition({
  id: "ui.base",
  version: "1.0.0",
  popupTemplate: "dwell-light",
  theme: {
    name: "dashboard-v1-dark",
    variables: {},
  },
  componentDefaults: S,
});
export function registerComponentTemplate(arg3) {
  if (!arg3?.id || typeof arg3.create != "function")
    throw new Error("控件模板必须包含 id 和 create。");
  const text = arg3.uiPackId || "ui.base";
  f.set(
    text + ":" + arg3.id,
    Object.freeze({
      ...arg3,
      uiPackId: text,
    }),
  );
}
export function listComponentTemplates(arg4, v1 = "ui.base") {
  const list = w[arg4] || [];
  return [...f.values()]
    .filter((arg5) => arg5.uiPackId === v1 && arg5.scopes?.includes(arg4))
    .sort((arg6, arg7) => {
      const indexOf = list.indexOf(arg6.id),
        indexOf2 = list.indexOf(arg7.id);
      return (
        (indexOf < 0 ? Number.MAX_SAFE_INTEGER : indexOf) -
        (indexOf2 < 0 ? Number.MAX_SAFE_INTEGER : indexOf2)
      );
    });
}
export function createComponentFromTemplate(arg8, arg9) {
  const text2 = arg9?.uiPackId || "ui.base",
    v2 = f.get(text2 + ":" + arg8);
  if (!v2) throw new Error("控件模板不存在。");
  const options = {
      ...v2.create(arg9),
      templateRef: {
        uiPackId: text2,
        templateId: arg8,
        version: 1,
      },
    },
    v3 = p.get(text2)?.componentDefaults?.[options.type];
  if (!v3) return options;
  const structuredClone2 = structuredClone(v3.properties || {}),
    structuredClone3 = structuredClone(v3.style || {}),
    dimensions = v3.dimensions,
    options2 = {
      ...options.position,
    };
  if (dimensions) {
    const v4 = Number(arg9?.canvas?.width || 2778),
      v5 = Number(arg9?.canvas?.height || 1940);
    ((options2.width = dimensions.width),
      (options2.height = dimensions.height),
      (options2.x = (v4 - dimensions.width) / 2),
      (options2.y = (v5 - dimensions.height) / 2));
  }
  return {
    ...options,
    position: options2,
    properties: {
      ...options.properties,
      ...structuredClone2,
      instanceName: options.properties.instanceName,
    },
    style: {
      ...options.style,
      ...structuredClone3,
    },
  };
}
function T(v6 = {}) {
  return Object.fromEntries(Object.entries(v6).filter(([v7]) => x.test(v7)));
}
function h(arg10, arg11, arg12) {
  const v8 = arg10.templateRef?.templateId || arg10.type;
  let value = null;
  try {
    value = createComponentFromTemplate(v8, {
      id: arg10.id,
      instanceName: arg10.properties?.instanceName,
      canvas: arg12,
      targetPage: arg10.properties?.targetPage,
      uiPackId: arg11.id,
    });
  } catch (v9) {
    if (f.has("ui.base:" + v8)) throw v9;
  }
  const options3 = value
    ? {
        ...arg10,
        properties: {
          ...(value.properties || {}),
          ...T(arg10.properties),
          ...(["flow-line", "percentage-bar"].includes(arg10.type)
            ? structuredClone(arg10.properties || {})
            : {}),
        },
        style: {
          ...(value.style || {}),
          ...(Object.prototype.hasOwnProperty.call(arg10.style || {}, "scale")
            ? {
                scale: arg10.style.scale,
              }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(arg10.style || {}, "visible")
            ? {
                visible: arg10.style.visible,
              }
            : {}),
        },
        position: arg10.position,
        bindings: arg10.bindings || {},
        actions: arg10.actions || {},
      }
    : {
        ...arg10,
      };
  return (
    (options3.templateRef = {
      uiPackId: arg11.id,
      templateId: v8,
      version: Number(arg11.templateVersion || 1),
    }),
    (options3.children = (arg10.children || []).map((arg13) => h(arg13, arg11, arg12))),
    options3
  );
}
export function applyUiPackToDocument(arg14, arg15) {
  const v10 = p.get(arg15.id);
  if (!v10) throw new Error("UI 方案“" + (arg15.name || arg15.id) + "”运行时未正确加载。");
  const options4 = arg14.canvas || {};
  return (
    (arg14.sharedComponents = (arg14.sharedComponents || []).map((arg16) =>
      h(arg16, arg15, options4),
    )),
    (arg14.pages = (arg14.pages || []).map((arg17) => ({
      ...arg17,
      components: (arg17.components || []).map((arg18) => h(arg18, arg15, options4)),
    }))),
    (arg14.customPopups = (arg14.customPopups || []).map((arg19) => ({
      ...arg19,
      templateRef: {
        uiPackId: arg15.id,
        templateId: arg15.popupTemplate || v10.popupTemplate || "custom-popup",
        version: Number(arg15.templateVersion || 1),
      },
    }))),
    (arg14.theme = structuredClone(arg15.theme || v10.theme || arg14.theme || {})),
    (arg14.uiPack = {
      id: arg15.id,
      version: arg15.version,
    }),
    arg14
  );
}
export function timeComponentDimensions(v11 = {}) {
  const max = Math.max(12, Math.min(500, Number(v11.fontSize || 96))),
    max2 = Math.max(-20, Math.min(100, Number(v11.letterSpacing || 0))),
    v12 = v11.showSeconds === true,
    num = v11.hour12 === true ? (v12 ? 11 : 8) : v12 ? 8 : 5,
    v13 = Number(v11.fontWeight ?? 0.4),
    num2 = (v13 > 1 ? (v13 - 1) / 899 : v13) >= 0.67 ? 1.035 : 1;
  return {
    width: Math.max(max, max * 0.61 * num * num2 + max2 * Math.max(0, num - 1) + max * 0.16),
    height: Math.max(20, max * 1.18),
  };
}
export function dateComponentDimensions(v14 = {}) {
  const max3 = Math.max(12, Math.min(500, Number(v14.primarySize || 36))),
    max4 = Math.max(10, Math.min(500, Number(v14.lunarSize || 24))),
    max5 = Math.max(-20, Math.min(100, Number(v14.primarySpacing || 1))),
    max6 = Math.max(-20, Math.min(100, Number(v14.lunarSpacing || 1))),
    max7 = Math.max(0, Math.min(200, Number(v14.lineGap ?? 8))),
    num3 = v14.showWeekday === false ? 6.35 : 9.35,
    num4 = 6,
    v15 = max3 * num3 + max5 * 13,
    v16 = max4 * num4 + max6 * 5,
    v17 = v14.showLunar === true;
  return {
    width: Math.max(max3, v15, v17 ? v16 : 0) + max3 * 0.12,
    height: max3 * 1.16 + (v17 ? max4 * 1.18 + max7 : 0),
  };
}
export function weatherComponentDimensions(v18 = {}) {
  const max8 = Math.max(12, Math.min(500, Number(v18.iconSize || 64))),
    max9 = Math.max(12, Math.min(500, Number(v18.temperatureSize || 32))),
    max10 = Math.max(10, Math.min(500, Number(v18.secondarySize || 18))),
    max11 = Math.max(0, Math.min(300, Number(v18.iconGap ?? 22))),
    max12 = Math.max(0, Math.min(200, Number(v18.lineGap ?? 7))),
    v19 =
      v18.temperatureVisible !== false ||
      v18.conditionVisible !== false ||
      v18.humidityVisible !== false,
    num5 = v18.temperatureVisible === false ? 0 : max9 * 4.4,
    num6 = v18.conditionVisible === false && v18.humidityVisible === false ? 0 : max10 * 8.6,
    max13 = v19 ? Math.max(num5, num6, max10 * 3) : 0,
    v20 =
      (v18.temperatureVisible === false ? 0 : max9 * 1.12) +
      (v18.conditionVisible === false && v18.humidityVisible === false ? 0 : max10 * 1.14 + max12);
  return {
    width: Math.max(20, (v18.iconVisible === false ? 0 : max8 + (v19 ? max11 : 0)) + max13),
    height: Math.max(20, v18.iconVisible === false ? 0 : max8, v20),
  };
}
(registerComponentTemplate({
  id: "image",
  name: "图片",
  type: "image",
  description: "显示图片素材，可关联实体并设置点按动作。",
  scopes: ["page"],
  create({ id: v21, instanceName: v22 = "图片", canvas: v23 }) {
    const v24 = Number(v23?.width || 2778),
      v25 = Number(v23?.height || 1940),
      num7 = 320,
      num8 = 240;
    return {
      id: v21,
      type: "image",
      componentVersion: 1,
      position: {
        x: (v24 - num7) / 2,
        y: (v25 - num8) / 2,
        width: num7,
        height: num8,
        rotation: 0,
        zIndex: 1,
      },
      bindings: {},
      properties: {
        instanceName: v22,
        opacity: 1,
        layoutMode: "free",
        fit: "contain",
      },
      style: {
        scale: 1,
        visible: true,
      },
      actions: {},
      children: [],
    };
  },
}),
  registerComponentTemplate({
    id: "floorplan-auto-diagram",
    name: "户型图自动导图",
    type: "floorplan-auto-diagram",
    description: "把 3D 户型底图和灯组效果层合并为一个可交互的导图控件。",
    scopes: ["page"],
    create({ id: v26, instanceName: v27 = "户型图自动导图", canvas: v28 }) {
      const v29 = Number(v28?.width || 2778),
        v30 = Number(v28?.height || 1940),
        v31 = v29 * 0.56,
        v32 = v30 * 0.56;
      return {
        id: v26,
        type: "floorplan-auto-diagram",
        componentVersion: 1,
        position: {
          x: (v29 - v31) / 2,
          y: (v30 - v32) / 2,
          width: v31,
          height: v32,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: {
          instanceName: v27,
          label: v27,
          exportFolder: "",
          layoutMode: "free",
          baseAssetId: "",
          floorPlanAssetId: "",
          previewReady: false,
          previewing: false,
          interactionMode: "position",
          cameraView: "free",
          cameraMode: "orthographic",
          floorSelection: "",
          cameraTopRotation: 0,
          cameraFocalLength: 50,
          generated: false,
          lightLayers: [],
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "vacuum-map",
    name: "扫地机器人实时地图",
    type: "vacuum-map",
    description: "将扫地机器人实时地图作为透明图层叠加到底图上。",
    scopes: ["page"],
    create({
      id: v33,
      instanceName: v34 = "扫地机器人实时地图",
      canvas: v35,
      vacuumMapEntityId: v36 = "",
    }) {
      const v37 = Number(v35?.width || 2778),
        v38 = Number(v35?.height || 1940),
        v39 = v37 * 0.56,
        v40 = (v39 * 1156) / 1120;
      return {
        id: v33,
        type: "vacuum-map",
        componentVersion: 1,
        position: {
          x: (v37 - v39) / 2,
          y: (v38 - v40) / 2,
          width: v39,
          height: v40,
          rotation: 0,
          zIndex: 1,
        },
        bindings: v36
          ? {
              entity: {
                entityId: v36,
              },
            }
          : {},
        properties: {
          instanceName: v34,
          opacity: 0.5,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "icon-button-effect",
    name: "图标按钮（效果）",
    type: "icon-button-effect",
    description: "同时包含可交互的图标按钮和跟随实体状态显隐的效果图片。",
    scopes: ["page"],
    create({
      id: v41,
      instanceName: v42 = "图标按钮（效果）",
      canvas: v43,
      lightEntityId: v44 = "",
    }) {
      const v45 = Number(v43?.width || 2778),
        v46 = Number(v43?.height || 1940),
        v47 = v45 * 0.075,
        v48 = v47;
      return {
        id: v41,
        type: "icon-button-effect",
        componentVersion: 1,
        position: {
          x: (v45 - v47) / 2,
          y: (v46 - v48) / 2,
          width: v47,
          height: v48,
          rotation: 0,
          zIndex: 1,
        },
        bindings: v44
          ? {
              entity: {
                entityId: v44,
              },
            }
          : {},
        properties: {
          instanceName: v42,
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
          effectAssetId: "",
          effectOpacity: 1,
          effectFadeDuration: 0.52,
          effectColorTemperatureRealtime: true,
          effectBrightnessRealtime: true,
          effectLayoutMode: "free",
          effectLeft: 50,
          effectTop: 50,
          effectScale: 1,
          effectRotation: 0,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: v44
          ? {
              tap: {
                type: "toggle",
              },
            }
          : {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "title-button",
    name: "标题按钮",
    type: "title-button",
    description: "中英文双标题、左右括号和下方三角指示的房间标题按钮。",
    scopes: ["page"],
    create({ id: v49, instanceName: v50 = "标题按钮", canvas: v51 }) {
      const v52 = Number(v51?.width || 2778),
        v53 = Number(v51?.height || 1940),
        v54 = v52 * 0.18,
        v55 = v53 * 0.065;
      return {
        id: v49,
        type: "title-button",
        componentVersion: 1,
        position: {
          x: (v52 - v54) / 2,
          y: (v53 - v55) / 2,
          width: v54,
          height: v55,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: {
          instanceName: v50,
          mainTextVisible: true,
          secondaryTextVisible: true,
          mainText: "客厅",
          secondaryText: "LIVING ROOM\nLIGHTING",
          mainColor: "#b9bbc0",
          secondaryColor: "#70737b",
          mainSize: 45,
          secondarySize: 19,
          mainWeight: 0.3,
          secondaryWeight: 0,
          mainSpacing: 5.7,
          secondarySpacing: 1.9,
          secondaryLineGap: 6,
          mainTextLeft: 18.2,
          mainTextTop: 43.3,
          secondaryTextLeft: 42.9,
          secondaryTextTop: 42.2,
          iconVisible: true,
          icon: "mdi:home-account",
          iconColor: "#b9bbc0",
          iconSize: 55,
          iconLeft: 10.7,
          iconTop: 42.5,
          frameColor: "#60636a",
          frameVisible: true,
          frameWidth: 0.8,
          frameSize: 120,
          frameSpacing: 84,
          frameOffsetX: -7.2,
          frameOffsetY: -6.1,
          markerVisible: true,
          markerColor: "#f2a20d",
          markerSize: 16,
          markerLeft: 1.8,
          markerTop: 110,
        },
        style: {
          scale: 1.2932807744280563,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "light-statistics",
    name: "数量统计",
    type: "light-statistics",
    description: "统计灯光、开关、空调等设备当前开启或运行的数量。",
    thumbnailId: "light-statistics",
    scopes: ["page"],
    create({ id: v56, instanceName: v57 = "数量统计", canvas: v58 }) {
      const v59 = Number(v58?.width || 2778),
        v60 = Number(v58?.height || 1940),
        v61 = v59 * 0.18,
        v62 = v60 * 0.065;
      return {
        id: v56,
        type: "light-statistics",
        componentVersion: 1,
        position: {
          x: (v59 - v61) / 2,
          y: (v60 - v62) / 2,
          width: v61,
          height: v62,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: {
          instanceName: v57,
          entityIds: [],
          entityLabels: {},
          title: "数量",
          iconVisible: true,
          icon: "mdi:lightbulb-group-outline",
          iconColor: "#8b9298",
          iconActiveColor: "#f2a20d",
          iconGap: 4.5,
          titleVisible: true,
          titleColor: "#b9bbc0",
          titleSize: 32,
          titleWeight: 0.3,
          titleSpacing: 1.2,
          countVisible: true,
          countColor: "#b9bbc0",
          countActiveColor: "#f2a20d",
          countSize: 34,
          countWeight: 0.35,
          countSpacing: 0,
          countGap: 4.5,
          iconSize: 42,
        },
        style: {
          scale: 1.2932807744280563,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "icon-button",
    name: "图标按钮",
    type: "icon-button",
    description: "跟随灯光实体状态变化的切角图标按钮。",
    scopes: ["page"],
    create({ id: v63, instanceName: v64 = "图标按钮", canvas: v65, lightEntityId: v66 = "" }) {
      const v67 = Number(v65?.width || 2778),
        v68 = Number(v65?.height || 1940),
        v69 = v67 * 0.1,
        v70 = v68 * 0.15;
      return {
        id: v63,
        type: "icon-button",
        componentVersion: 1,
        position: {
          x: (v67 - v69) / 2,
          y: (v68 - v70) / 2,
          width: v69,
          height: v70,
          rotation: 0,
          zIndex: 1,
        },
        bindings: v66
          ? {
              entity: {
                entityId: v66,
              },
            }
          : {},
        properties: {
          instanceName: v64,
          mainText: "主灯",
          secondaryText: "MAIN LIGHT",
          icon: "mdi:ceiling-light",
          iconColor: "#d7d8da",
          mainColor: "#c7c8cb",
          secondaryColor: "#75777d",
          iconOffOpacity: 1,
          iconOnOpacity: 1,
          iconLeft: 50,
          iconTop: 34,
          mainOffOpacity: 1,
          mainOnOpacity: 1,
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
          iconSize: 42,
          mainSize: 25,
          secondarySize: 10,
          mainWeight: 0.25,
          secondaryWeight: 0.18,
          mainSpacing: 1,
          secondarySpacing: 0.7,
          mainTextLeft: 9,
          mainTextTop: 78,
          secondaryTextLeft: 9,
          secondaryTextTop: 91,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: v66
          ? {
              tap: {
                type: "toggle",
              },
            }
          : {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "device-button",
    name: "设备按钮",
    type: "device-button",
    description: "显示图标、标题和实时状态，点击可切换实体。",
    scopes: ["page"],
    create({ id: v71, instanceName: v72 = "设备按钮", canvas: v73 }) {
      const v74 = Number(v73?.width || 2778),
        v75 = Number(v73?.height || 1940),
        v76 = v74 * 0.1,
        v77 = v75 * 0.11;
      return {
        id: v71,
        type: "device-button",
        componentVersion: 1,
        position: {
          x: (v74 - v76) / 2,
          y: (v75 - v77) / 2,
          width: v76,
          height: v77,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: {
          instanceName: v72,
          mainText: "",
          secondaryText: "",
          icon: "",
          iconVisible: true,
          mainTextVisible: true,
          secondaryTextVisible: true,
          iconColor: "#d7d8da",
          iconOnColor: "#379bff",
          badgeColor: "#5b5e66",
          badgeOpacity: 0.58,
          mainColor: "#c7c8cb",
          secondaryColor: "#75777d",
          iconLeft: 20,
          iconTop: 50,
          symbolSize: 14,
          badgeSize: 28,
          mainSize: 21,
          secondarySize: 12,
          mainWeight: 0.24,
          secondaryWeight: 0.12,
          mainSpacing: 0.5,
          secondarySpacing: 0.3,
          mainTextLeft: 39,
          mainTextTop: 40,
          secondaryTextLeft: 39,
          secondaryTextTop: 67,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "presence-sensor",
    name: "传感器",
    type: "presence-sensor",
    description: "添加后在属性中选择传感器类型，当前支持人在、门窗和水浸状态的动态显示。",
    scopes: ["page"],
    create({ id: v78, instanceName: v79 = "传感器", canvas: v80, entityId: v81 = "" }) {
      const v82 = Number(v80?.width || 2778),
        v83 = Number(v80?.height || 1940),
        num9 = 360,
        num10 = 240;
      return {
        id: v78,
        type: "presence-sensor",
        componentVersion: 1,
        position: {
          x: (v82 - num9) / 2,
          y: (v83 - num10) / 2,
          width: num9,
          height: num10,
          rotation: 0,
          zIndex: 1,
        },
        bindings: v81
          ? {
              entity: {
                entityId: v81,
              },
            }
          : {},
        properties: {
          instanceName: v79,
          sensorKind: "presence",
          mainText: "人在",
          secondaryText: "",
          occupiedColor: "#ffffff",
          waterLeakColor: "#42c8ff",
          smokeColor: "#ffffff",
          naturalGasColor: "#ffb347",
          clearColor: "#758189",
          animationStrength: 0.72,
          haloScale: 1,
          haloVisible: true,
          haloScaleX: 1,
          haloScaleY: 1,
          haloRotation: 0,
          haloOpacity: 1,
          personScale: 1,
          personVisible: true,
          personRotation: 0,
          personOpacity: 1,
          orbitDuration: 8,
          showDuration: true,
          historyHours: 24,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "camera",
    name: "摄像头实时预览",
    type: "camera",
    description: "实时预览摄像头，点击可放大查看。",
    scopes: ["page"],
    create({ id: v84, instanceName: v85 = "摄像头实时预览", canvas: v86 }) {
      const v87 = Number(v86?.width || 2778),
        v88 = Number(v86?.height || 1940),
        v89 = v87 * 0.22,
        v90 = (v89 * 9) / 16;
      return {
        id: v84,
        type: "camera",
        componentVersion: 1,
        position: {
          x: (v87 - v89) / 2,
          y: (v88 - v90) / 2,
          width: v89,
          height: v90,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: {
          instanceName: v85,
          fit: "fill",
          displayMode: "live",
          refreshInterval: 10,
          mediaVisible: true,
          frameVisible: true,
          frameColor: "#d4d4d4",
          frameWidth: 1,
          frameAngle: 45,
          frameOpacity: 0.9,
          radius: 0.04,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {
          tap: {
            type: "more-info",
            data: {
              popupSource: "current",
            },
          },
        },
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "air-conditioner",
    name: "空调 / 浴霸",
    type: "air-conditioner",
    description: "显示空调或浴霸状态并按实体能力提供控制，内置可调整的动态出风效果。",
    scopes: ["page"],
    create({ id: v91, instanceName: v92 = "空调", canvas: v93 }) {
      const v94 = Number(v93?.width || 2778),
        v95 = Number(v93?.height || 1940),
        v96 = v94 * 0.11,
        v97 = v95 * 0.08;
      return {
        id: v91,
        type: "air-conditioner",
        componentVersion: 1,
        position: {
          x: (v94 - v96) / 2,
          y: (v95 - v97) / 2,
          width: v96,
          height: v97,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: {
          deviceType: "auto",
          instanceName: v92,
          mainText: "",
          secondaryText: "",
          icon: "mdi:air-conditioner",
          iconOffColor: "#9aa5ad",
          iconOnColor: "#73c8ff",
          badgeColor: "#5b5e66",
          badgeOpacity: 0.58,
          symbolSize: 14,
          badgeSize: 28,
          iconLeft: 20,
          iconTop: 50,
          mainColor: "#c7c8cb",
          secondaryColor: "#75777d",
          mainSize: 21,
          secondarySize: 12,
          mainWeight: 0.24,
          secondaryWeight: 0.12,
          mainSpacing: 0.5,
          secondarySpacing: 0.3,
          mainTextLeft: 39,
          mainTextTop: 40,
          secondaryTextLeft: 39,
          secondaryTextTop: 67,
          airflowVisible: true,
          airflowMotion: "dynamic",
          airflowCoolColor: "#73c8ff",
          airflowHeatColor: "#ff8a65",
          airflowOtherColor: "#dce2e6",
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
          airflowRotation: -3,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {
          tap: {
            type: "more-info",
          },
          doubleTap: {
            type: "toggle",
          },
        },
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "time",
    name: "时间",
    type: "time",
    description: "显示设备本地时间，不依赖 Home Assistant 实体。",
    scopes: ["shared"],
    create({ id: v98, instanceName: v99 = "时间", canvas: v100 }) {
      const v101 = Number(v100?.width || 2778),
        v102 = Number(v100?.height || 1940),
        options5 = {
          instanceName: v99,
          hour12: false,
          showSeconds: false,
          color: "#248eb2",
          fontSize: 96,
          fontWeight: 0.4,
          letterSpacing: 2.2,
          opacity: 1,
        },
        { width: timeComponentDimensions2, height: timeComponentDimensions3 } =
          timeComponentDimensions(options5);
      return {
        id: v98,
        type: "time",
        componentVersion: 1,
        position: {
          x: (v101 - timeComponentDimensions2) / 2,
          y: (v102 - timeComponentDimensions3) / 2,
          width: timeComponentDimensions2,
          height: timeComponentDimensions3,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: options5,
        style: {
          scale: 1.8,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "date",
    name: "日期",
    type: "date",
    description: "显示设备本地年月日、星期与农历。",
    scopes: ["shared"],
    create({ id: v103, instanceName: v104 = "日期", canvas: v105 }) {
      const v106 = Number(v105?.width || 2778),
        v107 = Number(v105?.height || 1940),
        options6 = {
          instanceName: v104,
          showWeekday: true,
          showLunar: false,
          primaryColor: "#8d9296",
          primarySize: 36,
          primaryWeight: 0.4,
          primarySpacing: 1,
          lunarColor: "#7f878c",
          lunarSize: 24,
          lunarWeight: 0.4,
          lunarSpacing: 1,
          lineGap: 8,
          opacity: 1,
        },
        { width: dateComponentDimensions2, height: dateComponentDimensions3 } =
          dateComponentDimensions(options6);
      return {
        id: v103,
        type: "date",
        componentVersion: 1,
        position: {
          x: (v106 - dateComponentDimensions2) / 2,
          y: (v107 - dateComponentDimensions3) / 2,
          width: dateComponentDimensions2,
          height: dateComponentDimensions3,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: options6,
        style: {
          scale: 2,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "weather",
    name: "天气",
    type: "weather",
    description: "显示彩云天气当前状态、温度和湿度。",
    scopes: ["shared"],
    create({
      id: v108,
      instanceName: v109 = "天气",
      canvas: v110,
      weatherEntityId: v111 = "",
      sunEntityId: v112 = "",
    }) {
      const v113 = Number(v110?.width || 2778),
        v114 = Number(v110?.height || 1940),
        options7 = {
          instanceName: v109,
          iconVisible: true,
          temperatureVisible: true,
          conditionVisible: true,
          humidityVisible: true,
          iconSize: 64,
          iconGap: 22,
          temperatureColor: "#aeb3b7",
          temperatureSize: 32,
          temperatureWeight: 0.4,
          temperatureSpacing: 1,
          secondaryColor: "#8d9296",
          secondarySize: 18,
          secondaryWeight: 0.4,
          secondarySpacing: 1,
          lineGap: 7,
          opacity: 1,
        },
        { width: weatherComponentDimensions2, height: weatherComponentDimensions3 } =
          weatherComponentDimensions(options7),
        options8 = {};
      return (
        v111 &&
          (options8.entity = {
            entityId: v111,
          }),
        v112 &&
          (options8.sun = {
            entityId: v112,
          }),
        {
          id: v108,
          type: "weather",
          componentVersion: 1,
          position: {
            x: (v113 - weatherComponentDimensions2) / 2,
            y: (v114 - weatherComponentDimensions3) / 2,
            width: weatherComponentDimensions2,
            height: weatherComponentDimensions3,
            rotation: 0,
            zIndex: 1,
          },
          bindings: options8,
          properties: options7,
          style: {
            scale: 1.8,
            visible: true,
          },
          actions: {},
          children: [],
        }
      );
    },
  }),
  registerComponentTemplate({
    id: "line-chart",
    name: "折线图",
    type: "line-chart",
    description: "显示温度或湿度实体的 24 小时趋势、当前值与极值。",
    scopes: ["shared", "page"],
    create({ id: v115, instanceName: v116 = "折线图", canvas: v117, sensorEntityId: v118 = "" }) {
      const v119 = Number(v117?.width || 2778),
        v120 = Number(v117?.height || 1940),
        v121 = v119 * 0.19,
        v122 = v120 * 0.16;
      return {
        id: v115,
        type: "line-chart",
        componentVersion: 1,
        position: {
          x: (v119 - v121) / 2,
          y: (v120 - v122) / 2,
          width: v121,
          height: v122,
          rotation: 0,
          zIndex: 1,
        },
        bindings: v118
          ? {
              entity: {
                entityId: v118,
              },
            }
          : {},
        properties: {
          instanceName: v116,
          valueVisible: true,
          valueScale: 100,
          valueColor: "#dce1e5",
          valueOffsetX: 0,
          valueOffsetY: 0,
          updateInterval: 600,
          hours: 24,
          cornerRadius: 10,
          thresholdMode: "auto",
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {
          tap: {
            type: "more-info",
          },
        },
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "panel-frame",
    name: "底图框",
    type: "panel-frame",
    description: "双行标题、渐变外框和内向柔光容器。",
    scopes: ["shared", "page"],
    create({ id: v123, instanceName: v124 = "底图框", canvas: v125 }) {
      const v126 = Number(v125?.width || 2778),
        v127 = Number(v125?.height || 1940),
        v128 = v126 * 0.19,
        v129 = v127 * 0.16;
      return {
        id: v123,
        type: "panel-frame",
        componentVersion: 1,
        position: {
          x: (v126 - v128) / 2,
          y: (v127 - v129) / 2,
          width: v128,
          height: v129,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: {
          instanceName: v124,
          mainTextVisible: true,
          mainText: "温度",
          mainColor: "#ffffff",
          mainSize: 30,
          mainWeight: 0,
          mainOpacity: 0.72,
          mainSpacing: 2,
          secondaryTextVisible: true,
          secondaryText: "TEMPERATURE",
          secondaryColor: "#ffffff",
          secondarySize: 15,
          secondaryWeight: 0,
          secondaryOpacity: 0.36,
          secondarySpacing: 2.1,
          mainTextLeft: 5.2,
          mainTextTop: 20,
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
          glowAngle: 242,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "navigation-button",
    name: "导航按钮",
    type: "navigation-button",
    description: "默认用于页面跳转，也可绑定实体执行切换或打开弹窗。",
    scopes: ["shared"],
    create({ id: v130, instanceName: v131 = "导航按钮", canvas: v132, targetPage: v133 = "" }) {
      const v134 = Number(v132?.width || 2778),
        v135 = Number(v132?.height || 1940),
        v136 = v134 * 0.2,
        v137 = v135 * 0.085,
        v138 = String(v133 || "");
      return {
        id: v130,
        type: "navigation-button",
        componentVersion: 1,
        position: {
          x: (v134 - v136) / 2,
          y: (v135 - v137) / 2,
          width: v136,
          height: v137,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {},
        properties: {
          instanceName: v131,
          targetPage: v138,
          mainText: "页面导航",
          secondaryText: "NAVIGATION",
          icon: "mdi:home-outline",
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
          mainTextTop: 53.832318210068365,
          secondaryTextLeft: 29.9,
          secondaryTextTop: 81.8,
          textIdleOpacity: 0.4,
          textActiveOpacity: 0.9,
          iconColor: "#fcfcfc",
          iconSize: 50,
          iconLeft: 16.5,
          iconTop: 50,
          iconIdleOpacity: 0.3,
          iconActiveOpacity: 0.9,
          frameColor: "#ffffff",
          glowColor: "#f2f6fa",
          frameWidth: 1.5,
          frameIdleOpacity: 0.3,
          frameActiveOpacity: 1,
          frameAngle: 45,
          glowAngle: 90,
          glowIdleStrength: 1,
          glowActiveStrength: 2.4,
          glowIdleSize: 1.5,
          glowActiveSize: 2.2,
          radius: 0.5,
        },
        style: {
          scale: 0.9232946236554526,
          visible: true,
        },
        actions: v138
          ? {
              tap: {
                type: "navigate",
                target: v138,
              },
            }
          : {},
        children: [],
      };
    },
  }));
const O = {
  icon: "mdi:home-import-outline",
  iconActiveOpacity: 0.9,
  iconColor: "#656565",
  iconIdleOpacity: 0.3,
  iconLeft: 16.5,
  iconSize: 50,
  iconTop: 50,
  iconVisible: true,
  mainColor: "#414141",
  mainSize: 27,
  mainSpacing: 4,
  mainText: "情景模式",
  mainTextLeft: 29.9,
  mainTextTop: 53.832318210068365,
  mainTextVisible: true,
  mainWeight: 0.5,
  secondaryColor: "#131313",
  secondarySize: 10,
  secondarySpacing: 3,
  secondaryText: "SCENE",
  secondaryTextLeft: 29.9,
  secondaryTextTop: 81.8,
  secondaryTextVisible: true,
  secondaryWeight: 0,
  textActiveOpacity: 0.9,
  textIdleOpacity: 0.4,
  instanceName: "情景模式",
  activationAnimation: "spring",
  controlMode: "scene",
};
(registerComponentTemplate({
  id: "scene-mode",
  name: "情景模式",
  type: "scene-mode",
  description: "开关切换 · 情景执行",
  scopes: ["shared", "page"],
  create({ id: v139, instanceName: v140 = "情景模式", canvas: v141 }) {
    return {
      id: v139,
      type: "scene-mode",
      componentVersion: 1,
      position: {
        x: (Number(v141?.width || 2778) - 555.6) / 2,
        y: (Number(v141?.height || 1940) - 153.832) / 2,
        width: 555.6,
        height: 153.832,
        rotation: 0,
        zIndex: 1,
      },
      bindings: {},
      actions: {},
      children: [],
      properties: {
        ...O,
        instanceName: v140,
      },
      style: {
        scale: 0.3934332813319446,
        visible: true,
      },
    };
  },
}),
  registerComponentTemplate({
    id: "flow-line",
    name: "流水线条",
    type: "flow-line",
    description: "自由绘制水流与能量路径，支持颜色、光尾、流速与发光 DIY。",
    scopes: ["shared", "page"],
    create({ id: v142, instanceName: v143 = "流水线条", canvas: v144 }) {
      const num11 = Number(v144?.width) || 2778,
        num12 = Number(v144?.height) || 1940,
        v145 = num11 * 0.3,
        v146 = num12 * 0.15;
      return {
        id: v142,
        type: "flow-line",
        componentVersion: 1,
        position: {
          x: (num11 - v145) / 2,
          y: (num12 - v146) / 2,
          width: v145,
          height: v146,
          rotation: 0,
          zIndex: 1,
        },
        properties: {
          ...structuredClone(FLOW_LINE_DEFAULTS2),
          instanceName: v143,
        },
        style: {
          scale: 1,
          visible: true,
        },
        bindings: {},
        actions: {},
        children: [],
      };
    },
  }),
  registerComponentTemplate({
    id: "percentage-bar",
    name: "百分比柱状图",
    type: "percentage-bar",
    description: "单个或多个百分比实体，支持渐变、内嵌游标与玻璃液柱，仅显示。",
    scopes: ["shared", "page"],
    create({ id: v147, instanceName: v148 = "百分比柱状图", canvas: v149 }) {
      const options9 = {
          ...percentageBarDefaults2,
          instanceName: v148,
          series: [
            {
              entityId: "",
              attribute: "",
              label: "",
              color: "#f2a20d",
            },
          ],
        },
        { width: v150, height: v151 } = percentageBarDimensions2(options9);
      return {
        id: v147,
        type: "percentage-bar",
        componentVersion: 1,
        position: {
          x: (Number(v149?.width || 2778) - v150) / 2,
          y: (Number(v149?.height || 1940) - v151) / 2,
          width: v150,
          height: v151,
          rotation: 0,
          zIndex: 1,
        },
        properties: options9,
        bindings: {},
        style: {
          scale: 1,
          visible: true,
        },
        actions: {},
        children: [],
      };
    },
  }));
