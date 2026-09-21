/**
 * 3D 交互组件的类型标识与新建实例的默认模板。
 *
 * 前端唯一的初始值来源：后端只校验与存储、不补默认值，故这里的字段名与取值必须与渲染层、
 * 设置面板的读取口径一致。`module.3d_interaction` 是与授权服务约定死的能力名，改名会让已购用户失去权限。
 * lightingMode 只认 standard / region，backgroundTheme 只认 grid / dots（历史别名 contours 折算成 dots），
 * 读入时统一经 normalize* 归一；sceneStyle 只认 default / warm-wood，wallOpacity 为 null（跟随主题）或 0~1。
 * create 按画布 56% 居中放置，模板里的观感数值（如 pageDimStrength）调整前需确认与渲染层光照公式仍匹配。
 */

// 前四个常量为下拉项与各自的白名单归一函数；interaction3dTemplate 是同一链条里的模板本体。
const INTERACTION3D_TYPE = "interaction3d",
  INTERACTION3D_FEATURE = "module.3d_interaction",
  INTERACTION3D_LIGHTING_MODES = [
    ["standard", "标准光影"],
    ["region", "轻量柔光"]
  ],
  normalizeInteraction3dLightingMode = lightingMode =>
    lightingMode === "region" ? "region" : "standard",
  BACKGROUND_THEMES = [
    ["grid", "经典网格"],
    ["dots", "微光星尘"]
  ],
  normalizeBackgroundTheme = themeName =>
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
     * 尺寸沿用设计标称 2778 × 1940，组件占画布 56% 并居中，保证任何画布比例下都完整落在可视区内。
     * @param {string} options.id 实例 ID，由调用方生成，模板不负责唯一性。
     */
    create({ id: instanceId, instanceName: displayName = "3D 交互", canvas: canvasSize }) {
      // 画布缺省值与 preview-layout.js 中的兜底值必须一致，否则预览与真实渲染会错位。
      const canvasWidth = Number(canvasSize?.width || 2778),
        canvasHeight = Number(canvasSize?.height || 1940),
        componentWidth = canvasWidth * 0.56,
        componentHeight = canvasHeight * 0.56;
      // 返回的对象里，properties 的字段名由渲染层直接消费（例如 renderScale、pageDimStrength
      // 的六个页面键），改动字段名必须同步改渲染层，否则会退化成默认观感。
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
          lightingMode: "region",
          groundReflection: { mode: "off", resolution: 512, strength: 0.18 },
          pageDimStrength: {
            overview: 0,
            light: 0,
            environment: 30,
            devices: 40,
            vacuum: 15,
            security: 31
          },
          focusDimStrength: 7,
          focusVignetteStrength: 14,
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
          environment: { dimStrength: 70, airConditioners: [], curtains: [] }
        },
        bindings: {},
        actions: {},
        children: [],
        style: { scale: 1, visible: !0 }
      };
    }
  };
// 对外只留下面这几个。INTERACTION3D_TYPE 与 INTERACTION3D_FEATURE 只供本模块内构造默认实例
// （模板的 id / type 字段），它们不是「给别人的接口」，故不再导出。
export {
  INTERACTION3D_LIGHTING_MODES,
  normalizeInteraction3dLightingMode,
  BACKGROUND_THEMES,
  normalizeBackgroundTheme,
  interaction3dTemplate
};
