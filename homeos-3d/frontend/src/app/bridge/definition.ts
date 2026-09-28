/**
 * 3D 交互组件的类型标识与新建实例的默认模板。
 */
import { withPageAppearancePreset } from "./page-appearance-presets.js";

// 前四个常量为下拉项与各自的白名单归一函数；interaction3dTemplate 是同一链条里的模板本体。
const INTERACTION3D_TYPE = "interaction3d",
  INTERACTION3D_LIGHTING_MODES = [
    ["standard", "标准光影"],
    ["region", "轻量柔光"]
  ],
  // 两档并存，standard 为默认：只有显式写了 "region" 才走轻量柔光（二维光照图 + 接触阴影），
  normalizeInteraction3dLightingMode = (lightingMode: unknown) =>
    lightingMode === "region" ? "region" : "standard",
  BACKGROUND_THEMES = [
    ["grid", "经典网格"],
    ["dots", "微光星尘"]
  ],
  normalizeBackgroundTheme = (themeName: unknown) =>
    themeName === "dots" || themeName === "contours" ? "dots" : "grid",
  interaction3dTemplate = {
    id: INTERACTION3D_TYPE,
    type: INTERACTION3D_TYPE,
    name: "3D 交互",
    description:
      "在 3D 户型中查看和控制灯光、设备。",
    scopes: ["page"],
    /**
     * 依据当前画布尺寸生成一个默认组件实例。
     * @param {string} options.id 实例 ID，由调用方生成，模板不负责唯一性。
     */
    create({
      id: instanceId,
      instanceName: displayName = "3D 交互",
      canvas: canvasSize
    }: {
      id: string;
      instanceName?: string;
      canvas?: { width?: unknown; height?: unknown } | null;
    }) {
      const canvasWidth = Number(canvasSize?.width || 2778),
        canvasHeight = Number(canvasSize?.height || 1940),
        componentWidth = canvasWidth * 0.56,
        componentHeight = canvasHeight * 0.56;
      return {
        id: instanceId,
        type: INTERACTION3D_TYPE,
        componentVersion: 1,
        position: {
          x: (canvasWidth - componentWidth) / 2,
          y: (canvasHeight - componentHeight) / 2,
          width: componentWidth,
          height: componentHeight,
          rotation: 0,
          zIndex: 1
        },
        properties: {
          label: displayName,
          instanceName: displayName,
          layoutMode: "free",
          // 画布默认透明：背景平面与网格不画，3D 户型直接浮在宿主卡片上。
          backgroundVisible: !1,
          backgroundTheme: "grid",
          sceneStyle: "default",
          wallOpacity: null,
          backgroundMotion: !0,
          renderScale: 0.8,
          lightingMode: "standard",
          groundReflection: { mode: "off", resolution: 512, strength: 0.18 },
          ...withPageAppearancePreset({}),
          popupOpacity: 74,
          interaction: { rotationMode: "free", panEnabled: !1, zoomEnabled: !1 },
          behaviorScope: "global",
          pageBehaviors: {},
          autoRotate: { enabled: !1, idleSeconds: 30, speed: 6, direction: "clockwise" },
          idleExitFocus: { enabled: !1, idleSeconds: 30 },
          idleHideIcons: { enabled: !1, idleSeconds: 30 },
          hideIconsWhileRotating: !1,
          lights: [],
          devices: { nas: [] },
          environment: {
            dimStrength: 70,
            airConditioners: [],
            // 空气净化器与温湿度计都是 1.0.0 新增的环境集合：模板里显式给出空数组，
            airPurifiers: [],
            curtains: [],
            temperatureHumidity: []
          }
        },
        bindings: {},
        actions: {},
        children: [],
        style: { scale: 1, visible: !0 }
      };
    }
  };
export {
  INTERACTION3D_LIGHTING_MODES,
  normalizeInteraction3dLightingMode,
  BACKGROUND_THEMES,
  normalizeBackgroundTheme,
  interaction3dTemplate
};
