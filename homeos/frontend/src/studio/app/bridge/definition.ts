import { withPageAppearancePreset as withPageAppearancePreset } from "./page-appearance-presets";
const INTERACTION3D_TYPE = "interaction3d";
export const INTERACTION3D_LIGHTING_MODES = [
    ["standard", "标准光影"],
    ["region", "轻量柔光"],
  ],

  normalizeInteraction3dLightingMode = (lightingMode: any) =>
    lightingMode === "region" ? "region" : "standard",
  BACKGROUND_THEMES = [
    ["grid", "经典网格"],
    ["dots", "微光星尘"],
  ],
  normalizeBackgroundTheme = (themeId: any) =>
    themeId === "dots" || themeId === "contours" ? "dots" : "grid",
  interaction3dTemplate = {
    id: INTERACTION3D_TYPE,
    type: INTERACTION3D_TYPE,
    name: "3D 交互",
    description: "在 3D 户型中查看和控制灯光、设备。",
    scopes: ["page"],
    create({ id: componentId, instanceName: instanceName = "3D 交互", canvas: canvas }: any) {
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
          backgroundVisible: false,
          backgroundTheme: "grid",
          sceneStyle: "default",
          wallOpacity: null as any,
          backgroundMotion: true,
          renderScale: 1,
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
            panEnabled: true,
            zoomEnabled: true,
          },
          behaviorScope: "global",
          pageBehaviors: {} as Record<string, any>,
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
          lights: [] as any[],
          devices: {
            nas: [] as any[],
          },
          environment: {
            dimStrength: 70,
            airConditioners: [] as any[],
            airers: [] as any[],
            fans: [] as any[],
            airPurifiers: [] as any[],
            waterHeaters: [] as any[],
            curtains: [] as any[],
            temperatureHumidity: [] as any[],
          },
        },
        bindings: {} as Record<string, any>,
        actions: {} as Record<string, any>,
        children: [] as any[],
        style: {
          scale: 1,
          visible: true,
        },
      };
    },
  };
