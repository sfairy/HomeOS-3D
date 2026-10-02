import { withPageAppearancePreset as withPageAppearancePreset } from "./page-appearance-presets";
export const INTERACTION3D_TYPE = "interaction3d",
  INTERACTION3D_FEATURE = "module.3d_interaction",
  INTERACTION3D_LIGHTING_MODES = [
    ["standard", "标准光影"],
    ["region", "轻量柔光"],
  ],
  // 两档并存，standard 为默认：只有显式写了 "region" 才走轻量柔光（二维光照图 + 接触阴影），
  normalizeInteraction3dLightingMode = (lightingMode) =>
    lightingMode === "region" ? "region" : "standard",
  BACKGROUND_THEMES = [
    ["grid", "经典网格"],
    ["dots", "微光星尘"],
  ],
  normalizeBackgroundTheme = (themeId) =>
    themeId === "dots" || themeId === "contours" ? "dots" : "grid",
  interaction3dTemplate = {
    id: INTERACTION3D_TYPE,
    type: INTERACTION3D_TYPE,
    name: "3D 交互",
    description: "在 3D 户型中查看和控制灯光、设备。",
    scopes: ["page"],
    create({ id: componentId, instanceName: instanceName = "3D 交互", canvas: canvas }) {
      const canvasWidth = Number(canvas?.width || 2778),
        canvasHeight = Number(canvas?.height || 1940),
        componentWidth = canvasWidth * 0.56,
        componentHeight = canvasHeight * 0.56;
      return {
        id: componentId,
        type: INTERACTION3D_TYPE,
        componentVersion: 1,
        position: {
          x: (canvasWidth - componentWidth) / 2,
          y: (canvasHeight - componentHeight) / 2,
          width: componentWidth,
          height: componentHeight,
          rotation: 0,
          zIndex: 1,
        },
        properties: {
          label: instanceName,
          instanceName: instanceName,
          layoutMode: "free",
          backgroundVisible: true,
          backgroundTheme: "grid",
          sceneStyle: "default",
          wallOpacity: null,
          backgroundMotion: true,
          renderScale: 0.8,
          lightingMode: "standard",
          groundReflection: {
            mode: "off",
            resolution: 512,
            strength: 0.18,
          },
          ...withPageAppearancePreset({}),
          popupOpacity: 74,
          interaction: {
            rotationMode: "free",
            panEnabled: false,
            zoomEnabled: false,
          },
          behaviorScope: "global",
          pageBehaviors: {},
          autoRotate: {
            enabled: false,
            idleSeconds: 30,
            speed: 6,
            direction: "clockwise",
          },
          idleExitFocus: {
            enabled: false,
            idleSeconds: 30,
          },
          idleHideIcons: {
            enabled: false,
            idleSeconds: 30,
          },
          hideIconsWhileRotating: false,
          lights: [],
          devices: {
            nas: [],
          },
          environment: {
            dimStrength: 70,
            airConditioners: [],
            airers: [],
            fans: [],
            airPurifiers: [],
            waterHeaters: [],
            curtains: [],
            temperatureHumidity: [],
          },
        },
        bindings: {},
        actions: {},
        children: [],
        style: {
          scale: 1,
          visible: true,
        },
      };
    },
  };
