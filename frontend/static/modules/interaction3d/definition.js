/**
 * 3D 交互组件的类型标识与新建实例的默认模板。
 *
 * 位置：这是「新建一个 3D 交互组件」时前端唯一的初始值来源 —— 后端只做校验与存储，
 *   不补齐默认值，因此这里出现的字段名与取值必须与渲染层、设置面板的读取口径一致。
 * 对外导出：INTERACTION3D_TYPE（组件 type）、INTERACTION3D_FEATURE（授权能力名）、
 *   INTERACTION3D_LIGHTING_MODES / BACKGROUND_THEMES（设置面板的下拉项，元素为 [值, 中文文案]）、
 *   normalizeInteraction3dLightingMode / normalizeBackgroundTheme（取值归一化）、
 *   interaction3dTemplate（模板本体，含 create）。
 * 全局约定：
 *   - `module.3d_interaction` 是与授权服务约定死的能力名，改名会让已购用户直接失去权限；
 *   - lightingMode 只认 standard / region，backgroundTheme 只认 grid / dots ——
 *     文档里可能存在旧版本写入的值或别名，读入时一律经 normalize* 归一，渲染层不再重复判断；
 *     其中 `contours` 是背景主题的历史别名，仍被接受但统一折算成 dots，避免旧文档渲染异常；
 *   - create 生成的尺寸按画布 56% 居中放置，模板里的调暗强度（pageDimStrength）等数值
 *     是观感调过的经验值，调整前需确认与渲染层的光照公式仍匹配。
 * 副作用：无，模块只导出常量与一个纯工厂函数。
 */

// 前四个常量为下拉项与各自的白名单归一函数；interaction3dTemplate 是同一链条里的模板本体。
export const INTERACTION3D_TYPE = "interaction3d",
  INTERACTION3D_FEATURE = "module.3d_interaction",
  INTERACTION3D_LIGHTING_MODES = [
    ["standard", "\u6807\u51C6\u5149\u5F71"],
    ["region", "\u8F7B\u91CF\u67D4\u5149"]
  ],
  normalizeInteraction3dLightingMode = lightingMode =>
    lightingMode === "region" ? "region" : "standard",
  BACKGROUND_THEMES = [
    ["grid", "\u7ECF\u5178\u7F51\u683C"],
    ["dots", "\u5FAE\u5149\u661F\u5C18"]
  ],
  normalizeBackgroundTheme = themeName =>
    themeName === "dots" || themeName === "contours" ? "dots" : "grid",
  interaction3dTemplate = {
    id: INTERACTION3D_TYPE,
    type: INTERACTION3D_TYPE,
    name: "3D \u4EA4\u4E92",
    description:
      "\u5728 3D \u6237\u578B\u4E2D\u67E5\u770B\u548C\u63A7\u5236\u706F\u5149\u3001\u8BBE\u5907\u3002",
    scopes: ["page"],
    /**
     * 依据当前画布尺寸生成一个默认组件实例。
     *
     * 默认值不是「随便填」：画布尺寸沿用设计标称的 2778 × 1940（2 倍 DPI 下的 1389 × 970），
     * 组件占画布 56% 并居中，保证任何画布比例下新建的组件都完整落在可视区内。
     *
     * @param {object} options 新建参数。
     * @param {string} options.id 实例 ID，由调用方生成，模板不负责唯一性。
     * @param {string} [options.instanceName] 实例显示名，同时写入 label 与 instanceName。
     * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
     * @returns {object} 完整的组件文档（position / properties / bindings 等已填默认值）。
     */
    create({ id: instanceId, instanceName: displayName = "3D \u4EA4\u4E92", canvas: canvasSize }) {
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
          backgroundVisible: !0,
          backgroundTheme: "grid",
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
