/**
 * 编辑器「组件模板」内置模板库。
 *
 * 位置：编辑器侧边栏 / 主页面的「添加控件」弹窗完全由本文件供数，home.js 直接消费。
 * 职责：注册并保管全部内置控件模板（registerComponentTemplate）、按作用域列举
 *   （listComponentTemplates）、按模板实例化出完整组件（createComponentFromTemplate）、
 *   打开项目时把存量文档补齐到当前结构（normalizeDashboardDocument）。
 *
 * 模板与「组件文档模型」的关系：模板只描述出厂默认值，create() 产出的对象就是
 *   backend/app/panel/schema.py 中 PanelComponent 的 JSON 形态
 *   （id / type / componentVersion / position / bindings / properties / style /
 *   actions / children）。落库与校验都以展开后的组件文档为准，模板本身不持久化，
 *   只在组件上留下 templateRef 作为来源与版本标记。
 *
 * 模板数据从哪来：文件下半部分逐个 registerComponentTemplate({...}) 注册的内置定义，
 *   外加下方 registerComponentTemplate(interaction3dTemplate) 注册的 3D 交互模板
 *   （本体定义在 modules/interaction3d/definition.js）；
 *   各类型默认 properties / style / dimensions 集中在 componentDefaultsByType。
 *   创建出的组件由 home.js 插入当前页面文档，保存后经后端 panel/schema.py 校验落库。
 *
 * 全局约定：
 *   - 设计标称画布 2778×1940（2 倍 DPI 的 1389×970，与 schema.Canvas 同源），
 *     position 的 x / y / width / height 都是该画布下的像素；新组件一律先按比例定尺寸再居中，
 *     由用户在编辑器里二次拖拽缩放；
 *   - 颜色统一写 #rrggbb 小写十六进制，透明度另用 0~1 的 opacity / *Opacity 字段表示；
 *   - scopes 决定模板出现在哪个区域：shared = 侧边栏（所有页面可见），page = 主页面；
 *   - zIndex 从 1 起，负数留给背景类组件。
 *
 * 副作用：模块导入即执行全部注册；templatesById 是模块级单例，同 id 重复注册会覆盖。
 * 新增控件类型时要同步改：本文件的 registerComponentTemplate 注册块、
 *   componentDefaultsByType（打开旧文档时补默认值）、templateScopeOrder（弹窗排序），
 *   以及前端渲染分支（renderer/registry.js、home.js）和后端 schema 的放行范围。
 */
import { interaction3dTemplate } from "../modules/interaction3d/definition.js?v=20260918175732";
// 模板注册表：id -> 冻结后的模板定义。模块级单例，导入即被下方的注册块填满。
const templatesById = new Map();
// 文档缺 theme 时的兜底主题，名字必须与后端 schema.Theme 的默认名 homeos-dark 一致。
const DEFAULT_DASHBOARD_THEME = Object.freeze({
  name: "homeos-dark",
  variables: {}
});
// 自定义弹窗没有独立模板库，templateRef 缺失时统一回落到这个内置弹窗模板 id。
const DEFAULT_POPUP_TEMPLATE = "custom-popup";
// interaction3d 模板由 3D 模块自行定义，这里只负责注册，避免模板库反向依赖 3D 实现细节。
registerComponentTemplate(interaction3dTemplate);
// 弹窗里的展示顺序。模板是否可用由各自 scopes 决定，这张表只管排序，
// 因此漏登记的模板不会消失，只会被排到列表末尾（见 listComponentTemplates）。
const templateScopeOrder = {
  shared: ["time", "date", "weather", "line-chart", "panel-frame", "navigation-button"],
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
    "panel-frame"
  ]
};
// 各控件类型的默认 properties / style / dimensions，键为组件的 type。
// createComponentFromTemplate 会用这里的值覆盖模板 create() 给出的同名属性：
// 模板函数只负责与画布、实体相关的部分，通用观感默认值集中在这里维护。
// dimensions 是设计标称画布 2778×1940 上的定稿像素值——部分类型与 create() 里的比例
// 换算结果一致，其余是按设计稿单独标定的，因此它的优先级高于 create() 的比例结果。
// style.scale 多为设计稿调优后量出的值，刻意保留完整小数位，避免二次四舍五入后观感走样。
// 注意取值方向与 normalizeComponent 相反——归一化时以文档里已写下的取值优先。
const componentDefaultsByType = {
  image: {
    properties: {
      opacity: 1,
      layoutMode: "free",
      fit: "contain"
    },
    style: {
      scale: 1,
      visible: true
    }
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
      lightLayers: []
    },
    style: {
      scale: 1,
      visible: true
    }
  },
  "vacuum-map": {
    properties: {
      opacity: 0.5
    },
    style: {
      scale: 1.049,
      visible: true
    },
    dimensions: {
      width: 1555.68,
      height: 1605.684
    }
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
      effectRotation: 0
    },
    style: {
      scale: 0.19458752228421689,
      visible: true
    },
    dimensions: {
      width: 208.35,
      height: 208.35
    }
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
      opacity: 1
    },
    style: {
      scale: 0.9213987523473026,
      visible: true
    },
    dimensions: {
      width: 500.04,
      height: 121.94
    }
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
      opacity: 1
    },
    style: {
      scale: 0.779857559628849,
      visible: true
    },
    dimensions: {
      width: 277.8,
      height: 300.16
    }
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
      glowAngle: 220
    },
    style: {
      scale: 0.7774703949015426,
      visible: true
    },
    dimensions: {
      width: 277.8,
      height: 206.36
    }
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
      historyHours: 24
    },
    style: {
      scale: 1,
      visible: true
    },
    dimensions: {
      width: 360,
      height: 240
    }
  },
  camera: {
    properties: {
      fit: "fill",
      displayMode: "live",
      mediaVisible: true,
      frameVisible: true,
      opacity: 1,
      radius: 11,
      refreshInterval: 10
    },
    style: {
      scale: 0.8252317102372743,
      visible: true
    },
    dimensions: {
      width: 611.16,
      height: 343.7775
    }
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
      airflowScale: 0.4817745640382381
    },
    style: {
      scale: 1.0190713138587422,
      visible: true
    },
    dimensions: {
      width: 305.58,
      height: 150.08
    }
  },
  time: {
    properties: {
      hour12: false,
      showSeconds: true,
      color: "#248eb2",
      fontSize: 89,
      fontWeight: 1,
      letterSpacing: 4.7,
      opacity: 1
    },
    style: {
      scale: 0.576,
      visible: true
    },
    dimensions: {
      width: 496.6612,
      height: 105.02
    }
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
      opacity: 1
    },
    style: {
      scale: 0.642,
      visible: true
    },
    dimensions: {
      width: 353.92,
      height: 81.08
    }
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
      opacity: 1
    },
    style: {
      scale: 0.8056171554518585,
      visible: true
    },
    dimensions: {
      width: 263.8,
      height: 109
    }
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
      cornerRadius: 14
    },
    style: {
      scale: 1,
      visible: true
    },
    dimensions: {
      width: 525.042,
      height: 300.16
    }
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
      glowAngle: 242
    },
    style: {
      scale: 1,
      visible: true
    },
    dimensions: {
      width: 527.82,
      height: 300.16
    }
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
      activeOpacity: 0.96
    },
    style: {
      scale: 0.8533204506895217,
      visible: true
    },
    dimensions: {
      width: 555.6,
      height: 153.832
    }
  }
};
/**
 * 注册一个控件模板，供模板库列举与实例化。
 *
 * @param {object} template 模板定义：必须含 id（全局唯一）与 create（工厂函数），
 *   可选 name / description / thumbnailId / scopes。
 * @returns {void}
 * @throws {Error} 缺少 id，或 create 不是函数——这类模板进不了库，早抛早发现。
 */
export function registerComponentTemplate(template) {
  if (!template?.id || typeof template.create != "function") {
    throw new Error("控件模板必须包含 id 和 create。");
  }
  templatesById.set(
    template.id,
    // 冻结浅拷贝：防止调用方后续改动模板对象导致「同一份模板在不同页面表现不一致」。
    Object.freeze({
      ...template
    })
  );
}
/**
 * 按作用域列出可用模板，并给出稳定的展示顺序。
 *
 * @param {string} scope 作用域："shared"（侧边栏，所有页面可见）或 "page"（主页面）。
 * @returns {Array<object>} 属于该作用域的模板数组，顺序与 templateScopeOrder 一致。
 */
export function listComponentTemplates(scope) {
  // 取不到排序表（例如新增作用域）时退化为空数组，模板依旧可用，只是按注册顺序排列。
  const templateOrder = templateScopeOrder[scope] || [];
  return [...templatesById.values()]
    .filter(listedTemplate => listedTemplate.scopes?.includes(scope))
    .sort((leftTemplate, rightTemplate) => {
      const leftOrderIndex = templateOrder.indexOf(leftTemplate.id);
      const rightOrderIndex = templateOrder.indexOf(rightTemplate.id);
      return (
        // 未登记的模板统一用 MAX_SAFE_INTEGER 参与比较，等于全部排到列表末尾；
        // 之所以不用 -1，是为了避免「新模板插到最前面」打乱用户熟悉的入口位置。
        (leftOrderIndex < 0 ? Number.MAX_SAFE_INTEGER : leftOrderIndex) -
        (rightOrderIndex < 0 ? Number.MAX_SAFE_INTEGER : rightOrderIndex)
      );
    });
}
/**
 * 按模板 id 实例化一份完整组件文档。
 *
 * @param {string} templateId 模板 id，来自模板库卡片上的 data-templateId。
 * @param {object} [templateOptions] 实例化参数（id、instanceName、canvas、targetPage 等），
 *   原样透传给模板的 create()。
 * @returns {object} 组件文档对象，形态等同 backend/app/panel/schema.py 的 PanelComponent。
 * @throws {Error} 模板 id 未注册。
 */
export function createComponentFromTemplate(templateId, templateOptions) {
  const templateDefinition = templatesById.get(templateId);
  if (!templateDefinition) {
    throw new Error("控件模板不存在。");
  }
  const baseComponent = {
    ...templateDefinition.create(templateOptions),
    // 只记来源模板与版本号：版本用于模板结构变更后的迁移判断，不参与渲染。
    templateRef: {
      templateId: templateId,
      version: 1
    }
  };
  const componentDefaults = componentDefaultsByType[baseComponent.type];
  // 未在 componentDefaultsByType 登记的类型（含第三方注册的模板）直接用 create() 的结果，
  // 不做二次覆盖，保证外部模板能完全自定义自己的默认值。
  if (!componentDefaults) {
    return baseComponent;
  }
  // 深拷贝默认值再展开：多个实例若共享同一份对象，改一个组件的属性会串到其它组件上。
  const defaultProperties = structuredClone(componentDefaults.properties || {});
  const defaultStyle = structuredClone(componentDefaults.style || {});
  const defaultDimensions = componentDefaults.dimensions;
  // position 单独浅拷贝，下面可能要按画布重算尺寸与居中坐标。
  const position = {
    ...baseComponent.position
  };
  if (defaultDimensions) {
    // 这里才是最终生效的尺寸：create() 里按比例算出的宽高会被 componentDefaultsByType.dimensions
    // 覆盖，比例值只对未登记 dimensions 的类型（image、presence-sensor 等）起作用。
    // 缺 canvas 时回落到设计标称画布 2778×1940，与后端 schema.Canvas 默认值同源。
    const canvasWidth = Number(templateOptions?.canvas?.width || 2778);
    const canvasHeight = Number(templateOptions?.canvas?.height || 1940);
    position.width = defaultDimensions.width;
    position.height = defaultDimensions.height;
    // 新组件默认居中，用户随后在编辑器里拖到目标位置。
    position.x = (canvasWidth - defaultDimensions.width) / 2;
    position.y = (canvasHeight - defaultDimensions.height) / 2;
  }
  return {
    ...baseComponent,
    position: position,
    properties: {
      ...baseComponent.properties,
      ...defaultProperties,
      // 实例名由调用方生成（同名自动加序号），不能被组件默认值覆盖回去。
      instanceName: baseComponent.properties.instanceName
    },
    style: {
      ...baseComponent.style,
      ...defaultStyle
    }
  };
}
/**
 * 打开已有文档时的归一化：只做「补全」和「清理」，绝不改写存量取值。
 *
 * 模板默认值仅用于补齐缺失字段（例如新版本新增的默认项），任何文档里已经写下的
 * properties / style 都原样保留——否则用户刚保存的属性会在下次打开时被默认值覆盖，
 * 表现为「改完保存无效」。
 *
 * 只有 templateId / version 这类结构字段会被规整回模板引用格式。
 */
function normalizeComponent(mappedComponent, canvas) {
  // 老文档可能只存了 type 没有 templateRef；内置模板的 id 与 type 同名，用 type 兜底即可命中。
  const resolvedTemplateId = mappedComponent.templateRef?.templateId || mappedComponent.type;
  let createdComponent = null;
  try {
    createdComponent = createComponentFromTemplate(resolvedTemplateId, {
      id: mappedComponent.id,
      instanceName: mappedComponent.properties?.instanceName,
      canvas: canvas,
      targetPage: mappedComponent.properties?.targetPage
    });
  } catch {
    // 未知或已下线的模板：保留原样，不能因为归一化失败就拒绝打开项目。
    createdComponent = null;
  }
  // position / bindings / actions 一律沿用文档里的原值：位置是用户的版面成果，
  // 绑定与动作可能已被手动改过，模板默认值只用来补 properties / style 的缺字段。
  const preparedComponent = createdComponent
    ? {
        ...mappedComponent,
        properties: {
          ...(createdComponent.properties || {}),
          ...(mappedComponent.properties || {})
        },
        style: {
          ...(createdComponent.style || {}),
          ...(mappedComponent.style || {})
        },
        position: mappedComponent.position,
        bindings: mappedComponent.bindings || {},
        actions: mappedComponent.actions || {}
      }
    : {
        ...mappedComponent
      };
  const storedTemplateReference =
    mappedComponent.templateRef && typeof mappedComponent.templateRef === "object"
      ? mappedComponent.templateRef
      : {};
  preparedComponent.templateRef = {
    templateId: resolvedTemplateId,
    version: Number(storedTemplateReference.version) > 0 ? Number(storedTemplateReference.version) : 1
  };
  // 子组件递归归一化：组合控件的多层 children 也要逐层补齐默认值。
  preparedComponent.children = (mappedComponent.children || []).map(childComponent =>
    normalizeComponent(childComponent, canvas)
  );
  return preparedComponent;
}
/**
 * 打开项目时归一化整份仪表盘文档：补齐缺失结构，但不动用户已保存的取值。
 *
 * 兼容意图：旧版本保存的文档可能缺 sharedComponents / customPopups / theme，
 * 或组件上还没有 templateRef。这里就地补齐后再交给编辑器渲染，避免旧项目直接报错打不开；
 * 反过来，新前端新增的默认项也通过同一入口补给旧文档，不需要写一次性迁移脚本。
 *
 * @param {object} editorDocument 已解析的项目文档，含 canvas / sharedComponents /
 *   pages / customPopups / theme。
 * @returns {object} 同一个文档对象（就地修改），缺省字段已补全。
 */
export function normalizeDashboardDocument(editorDocument) {
  const documentCanvas = editorDocument.canvas || {};
  // 侧边栏组件与页面组件可能是不同时期保存的，逐个走 normalizeComponent 补齐。
  editorDocument.sharedComponents = (editorDocument.sharedComponents || []).map(sharedComponent =>
    normalizeComponent(sharedComponent, documentCanvas)
  );
  editorDocument.pages = (editorDocument.pages || []).map(page => ({
    ...page,
    // 页面本身只透传，组件列表逐个归一化；用 || [] 兜住「有页面但还没放控件」的新页面。
    components: (page.components || []).map(component =>
      normalizeComponent(component, documentCanvas)
    )
  }));
  // 自定义弹窗不走 componentDefaultsByType，只需把 templateRef 规整成后端认的形态。
  editorDocument.customPopups = (editorDocument.customPopups || []).map(popup => {
    const storedTemplateReference =
      popup.templateRef && typeof popup.templateRef === "object" ? popup.templateRef : {};
    return {
      ...popup,
      templateRef: {
        // 缺模板 id 的老弹窗回落到内置 custom-popup，保证弹窗仍可打开、可另存。
        templateId: storedTemplateReference.templateId || DEFAULT_POPUP_TEMPLATE,
        version:
          Number(storedTemplateReference.version) > 0
            ? Number(storedTemplateReference.version)
            : 1
      }
    };
  });
  // 主题缺名就无法解析变量，整份文档的配色会退化，这里用内置主题兜底。
  if (!editorDocument.theme?.name) {
    editorDocument.theme = structuredClone(DEFAULT_DASHBOARD_THEME);
  }
  return editorDocument;
}
/**
 * 按当前时间属性推算时间控件的默认宽高。
 *
 * 宽度是估算值：等宽数字按字号系数累加字符数，再叠加字间距与右侧留白，
 * 目的只是让新组件「落地时框住内容」，用户之后可以随意调整字号与位置。
 *
 * @param {object} [timeOptions] 时间属性（fontSize、fontWeight、letterSpacing、
 *   hour12、showSeconds）。
 * @returns {{width: number, height: number}} 画布像素单位的宽高。
 */
export function timeComponentDimensions(timeOptions = {}) {
  // 上下限与编辑器属性面板的滑杆范围一致，避免脏数据把默认框撑到画布之外。
  const fontSize = Math.max(12, Math.min(500, Number(timeOptions.fontSize || 96)));
  const letterSpacing = Math.max(-20, Math.min(100, Number(timeOptions.letterSpacing || 0)));
  const showSeconds = timeOptions.showSeconds === true;
  // 按最宽的字符组合估位数：12 小时制带秒是 "12:00:00 AM"（11 位），
  // 24 小时制不带秒是 "12:00"（5 位），其余组合取中间值。
  const characterCount = timeOptions.hour12 === true ? (showSeconds ? 11 : 8) : showSeconds ? 8 : 5;
  const fontWeight = Number(timeOptions.fontWeight ?? 0.4);
  // 字重 ≥0.67 时笔画明显变宽，按 1.035 放大框宽，避免粗体被裁掉；
  // fontWeight 也存在 1~900 的整数写法，这里先用 (w-1)/899 折算到 0~1 再比较。
  const widthScale = (fontWeight > 1 ? (fontWeight - 1) / 899 : fontWeight) >= 0.67 ? 1.035 : 1;
  // 宽 = 字宽累加 + 字间距 + 右侧留白：0.61 是等宽数字的平均字宽系数，
  // 0.16 是右侧留白；字间距只在字符之间生效，所以乘 (字符数 - 1)。
  return {
    width: Math.max(
      fontSize,
      fontSize * 0.61 * characterCount * widthScale +
        letterSpacing * Math.max(0, characterCount - 1) +
        fontSize * 0.16
    ),
    // 1.18 为行高系数，留出上下伸部（数字与冒号不等的字形高度）。
    height: Math.max(20, fontSize * 1.18)
  };
}
/**
 * 按日期属性推算日期控件的默认宽高（主行 + 可选的农历行）。
 *
 * @param {object} [dateOptions] 日期属性（primarySize、lunarSize、primarySpacing、
 *   lunarSpacing、lineGap、showWeekday、showLunar）。
 * @returns {{width: number, height: number}} 画布像素单位的宽高。
 */
export function dateComponentDimensions(dateOptions = {}) {
  const primarySize = Math.max(12, Math.min(500, Number(dateOptions.primarySize || 36)));
  const lunarSize = Math.max(10, Math.min(500, Number(dateOptions.lunarSize || 24)));
  const primarySpacing = Math.max(-20, Math.min(100, Number(dateOptions.primarySpacing || 1)));
  const lunarSpacing = Math.max(-20, Math.min(100, Number(dateOptions.lunarSpacing || 1)));
  const lineGap = Math.max(0, Math.min(200, Number(dateOptions.lineGap ?? 8)));
  // 主行行宽系数：带星期是「2026年9月16日 周三」这类最长形态（约 9.35 字宽），
  // 不带星期去掉「周X」后按 6.35 字宽估算。
  const primaryLineHeight = dateOptions.showWeekday === false ? 6.35 : 9.35;
  // 农历行如「八月初六」，最长约 6 个字宽。
  const lunarLineHeight = 6;
  // 13 / 5 是主行与农历行可能出现的最大字符数，用于把字间距累加进宽度。
  const primaryWidth = primarySize * primaryLineHeight + primarySpacing * 13;
  const lunarWidth = lunarSize * lunarLineHeight + lunarSpacing * 5;
  const showLunar = dateOptions.showLunar === true;
  return {
    // 额外加 0.12 个主字号作右侧留白，避免最后一个字贴边。
    width: Math.max(primarySize, primaryWidth, showLunar ? lunarWidth : 0) + primarySize * 0.12,
    // 1.16 / 1.18 为两行的行高系数，lineGap 是行间距。
    height: primarySize * 1.16 + (showLunar ? lunarSize * 1.18 + lineGap : 0)
  };
}
/**
 * 按天气属性推算天气控件的默认宽高（图标 + 温度 / 次要信息两栏）。
 *
 * @param {object} [weatherOptions] 天气属性（iconSize、iconGap、temperatureSize、
 *   secondarySize、lineGap，以及三组 *Visible 开关）。
 * @returns {{width: number, height: number}} 画布像素单位的宽高。
 */
export function weatherComponentDimensions(weatherOptions = {}) {
  const iconSize = Math.max(12, Math.min(500, Number(weatherOptions.iconSize || 64)));
  const temperatureSize = Math.max(12, Math.min(500, Number(weatherOptions.temperatureSize || 32)));
  const secondarySize = Math.max(10, Math.min(500, Number(weatherOptions.secondarySize || 18)));
  const iconGap = Math.max(0, Math.min(300, Number(weatherOptions.iconGap ?? 22)));
  const weatherLineGap = Math.max(0, Math.min(200, Number(weatherOptions.lineGap ?? 7)));
  // 三个开关默认都当成「显示」：旧文档可能没有这些字段，用 !== false 才算兼容写法。
  const hasSecondaryInfo =
    weatherOptions.temperatureVisible !== false ||
    weatherOptions.conditionVisible !== false ||
    weatherOptions.humidityVisible !== false;
  // 4.4 / 8.6 是「26°C」与「多云 68%」的最宽估位（以各自字号为单位）。
  const temperatureWidth = weatherOptions.temperatureVisible === false ? 0 : temperatureSize * 4.4;
  const secondaryWidth =
    weatherOptions.conditionVisible === false && weatherOptions.humidityVisible === false
      ? 0
      : secondarySize * 8.6;
  // 次要信息全关时只剩温度，宽度取两栏最大值；secondarySize * 3 兜住极短文案的最小宽度。
  const infoWidth = hasSecondaryInfo
    ? Math.max(temperatureWidth, secondaryWidth, secondarySize * 3)
    : 0;
  // 1.12 / 1.14 为温度行与次要信息行的行高系数，weatherLineGap 是两行间距。
  const infoHeight =
    (weatherOptions.temperatureVisible === false ? 0 : temperatureSize * 1.12) +
    (weatherOptions.conditionVisible === false && weatherOptions.humidityVisible === false
      ? 0
      : secondarySize * 1.14 + weatherLineGap);
  // 宽 = 图标（含与文字之间的 iconGap）+ 文字块宽；图标隐藏时两者都不占宽。
  return {
    width: Math.max(
      20,
      (weatherOptions.iconVisible === false ? 0 : iconSize + (hasSecondaryInfo ? iconGap : 0)) +
        infoWidth
    ),
    // 高度取「图标高」与「文字块高」的较大者；20 是防止全部隐藏时出现零高组件。
    height: Math.max(20, weatherOptions.iconVisible === false ? 0 : iconSize, infoHeight)
  };
}
registerComponentTemplate({
  id: "image",
  name: "图片",
  type: "image",
  description: "显示图片素材，可关联实体并设置点按动作。",
  scopes: ["page"],
  /**
   * 创建图片组件：固定 4:3 框体并居中。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成，模板不负责唯一性。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 图片组件文档。
   */
  create({ id: imageComponentId, instanceName: imageInstanceName = "图片", canvas: imageCanvas }) {
    const imageCanvasWidth = Number(imageCanvas?.width || 2778);
    const imageCanvasHeight = Number(imageCanvas?.height || 1940);
    // 图片属于内容型控件，不跟随画布比例：固定 320×240（4:3），接近多数素材的原始比例，
    // 这样「contain」铺满时四周留白最小。
    const imageWidth = 320;
    const imageHeight = 240;
    return {
      id: imageComponentId,
      type: "image",
      componentVersion: 1,
      position: {
        x: (imageCanvasWidth - imageWidth) / 2,
        y: (imageCanvasHeight - imageHeight) / 2,
        width: imageWidth,
        height: imageHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: {
        instanceName: imageInstanceName,
        opacity: 1,
        layoutMode: "free",
        fit: "contain"
      },
      style: {
        scale: 1,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "floorplan-auto-diagram",
  name: "户型图自动导图",
  type: "floorplan-auto-diagram",
  description: "把 3D 户型底图和灯组效果层合并为一个可交互的导图控件。",
  scopes: ["page"],
  /**
   * 创建户型图自动导图组件：占画布 56% 并居中。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名，同时写入 label。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 户型图自动导图组件文档。
   */
  create({
    id: floorplanComponentId,
    instanceName: floorplanInstanceName = "户型图自动导图",
    canvas: floorplanCanvas
  }) {
    const floorplanCanvasWidth = Number(floorplanCanvas?.width || 2778);
    const floorplanCanvasHeight = Number(floorplanCanvas?.height || 1940);
    // 0.56 与 interaction3d 模板保持同一比例，导图是 3D 场景的二维投影，两者视觉范围要对得上。
    const floorplanWidth = floorplanCanvasWidth * 0.56;
    const floorplanHeight = floorplanCanvasHeight * 0.56;
    return {
      id: floorplanComponentId,
      type: "floorplan-auto-diagram",
      componentVersion: 1,
      position: {
        x: (floorplanCanvasWidth - floorplanWidth) / 2,
        y: (floorplanCanvasHeight - floorplanHeight) / 2,
        width: floorplanWidth,
        height: floorplanHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: {
        instanceName: floorplanInstanceName,
        label: floorplanInstanceName,
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
        lightLayers: []
      },
      style: {
        scale: 1,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "vacuum-map",
  name: "扫地机器人实时地图",
  type: "vacuum-map",
  description: "将扫地机器人实时地图作为透明图层叠加到底图上。",
  scopes: ["page"],
  /**
   * 创建扫地机器人实时地图组件：占画布 56% 宽，按素材原始比例推高。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @param {string} [options.vacuumMapEntityId] 扫地机实体 ID，给了才写实体绑定。
   * @returns {object} 扫地机器人实时地图组件文档。
   */
  create({
    id: vacuumMapComponentId,
    instanceName: vacuumMapInstanceName = "扫地机器人实时地图",
    canvas: vacuumMapCanvas,
    vacuumMapEntityId: vacuumMapEntityId = ""
  }) {
    const vacuumMapCanvasWidth = Number(vacuumMapCanvas?.width || 2778);
    const vacuumMapCanvasHeight = Number(vacuumMapCanvas?.height || 1940);
    // 56% 与底图（户型图 / 3D 交互）对齐，实时地图作为透明图层叠在底图上，范围必须一致。
    const vacuumMapWidth = vacuumMapCanvasWidth * 0.56;
    // 1156:1120 是扫地机地图素材的原始宽高比，按宽度等比推高，避免拉伸变形。
    const vacuumMapHeight = (vacuumMapWidth * 1156) / 1120;
    return {
      id: vacuumMapComponentId,
      type: "vacuum-map",
      componentVersion: 1,
      position: {
        x: (vacuumMapCanvasWidth - vacuumMapWidth) / 2,
        y: (vacuumMapCanvasHeight - vacuumMapHeight) / 2,
        width: vacuumMapWidth,
        height: vacuumMapHeight,
        rotation: 0,
        zIndex: 1
      },
      // 有实体才写 entity 绑定；从模板库直接拖出的组件没有实体，留空对象等用户在属性面板里选。
      bindings: vacuumMapEntityId
        ? {
            entity: {
              entityId: vacuumMapEntityId
            }
          }
        : {},
      properties: {
        instanceName: vacuumMapInstanceName,
        opacity: 0.5
      },
      style: {
        scale: 1,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "icon-button-effect",
  name: "图标按钮（效果）",
  type: "icon-button-effect",
  description: "同时包含可交互的图标按钮和跟随实体状态显隐的效果图片。",
  scopes: ["page"],
  /**
   * 创建「图标按钮（效果）」组件：正方形按钮 + 跟随灯状态的叠加效果图。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @param {string} [options.lightEntityId] 灯实体 ID，给了才写实体绑定与点按切换动作。
   * @returns {object} 图标按钮（效果）组件文档。
   */
  create({
    id: iconButtonEffectComponentId,
    instanceName: iconButtonEffectInstanceName = "图标按钮（效果）",
    canvas: iconButtonEffectCanvas,
    lightEntityId: iconButtonEffectLightEntityId = ""
  }) {
    const iconButtonEffectCanvasWidth = Number(iconButtonEffectCanvas?.width || 2778);
    const iconButtonEffectCanvasHeight = Number(iconButtonEffectCanvas?.height || 1940);
    // 0.075 是设计标称画布下的正方形按钮占比（2778 × 0.075 ≈ 208）；
    // 效果图以 fill 方式铺满同一框（effectLayoutMode: "fill"），故宽高取相同值。
    const iconButtonEffectWidth = iconButtonEffectCanvasWidth * 0.075;
    const iconButtonEffectHeight = iconButtonEffectWidth;
    return {
      id: iconButtonEffectComponentId,
      type: "icon-button-effect",
      componentVersion: 1,
      position: {
        x: (iconButtonEffectCanvasWidth - iconButtonEffectWidth) / 2,
        y: (iconButtonEffectCanvasHeight - iconButtonEffectHeight) / 2,
        width: iconButtonEffectWidth,
        height: iconButtonEffectHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: iconButtonEffectLightEntityId
        ? {
            entity: {
              entityId: iconButtonEffectLightEntityId
            }
          }
        : {},
      properties: {
        instanceName: iconButtonEffectInstanceName,
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
        effectRotation: 0
      },
      style: {
        scale: 1,
        visible: true
      },
      // 只有绑定了灯实体才预置「点按切换」动作，否则留空，避免点按无反馈却看不出原因。
      actions: iconButtonEffectLightEntityId
        ? {
            tap: {
              type: "toggle"
            }
          }
        : {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "title-button",
  name: "标题按钮",
  type: "title-button",
  description: "中英文双标题、左右括号和下方三角指示的房间标题按钮。",
  scopes: ["page"],
  /**
   * 创建标题按钮组件：占画布 0.18 × 0.065 并居中。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 标题按钮组件文档。
   */
  create({
    id: titleButtonComponentId,
    instanceName: titleButtonInstanceName = "标题按钮",
    canvas: titleButtonCanvas
  }) {
    const titleButtonCanvasWidth = Number(titleButtonCanvas?.width || 2778);
    const titleButtonCanvasHeight = Number(titleButtonCanvas?.height || 1940);
    // 0.18 × 0.065 是设计标称画布 2778×1940 上的房间标题条比例（约 500 × 126），
    // 与「数量统计」同宽，便于多页统一排版；实际落地尺寸以 componentDefaultsByType 为准。
    const titleButtonWidth = titleButtonCanvasWidth * 0.18;
    const titleButtonHeight = titleButtonCanvasHeight * 0.065;
    return {
      id: titleButtonComponentId,
      type: "title-button",
      componentVersion: 1,
      position: {
        x: (titleButtonCanvasWidth - titleButtonWidth) / 2,
        y: (titleButtonCanvasHeight - titleButtonHeight) / 2,
        width: titleButtonWidth,
        height: titleButtonHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: {
        instanceName: titleButtonInstanceName,
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
        markerTop: 110
      },
      style: {
        scale: 1.2932807744280563,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "light-statistics",
  name: "数量统计",
  type: "light-statistics",
  description: "统计灯光、开关、空调等设备当前开启或运行的数量。",
  thumbnailId: "light-statistics",
  scopes: ["page"],
  /**
   * 创建数量统计组件：与标题按钮同尺寸，便于并排排版。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 数量统计组件文档。
   */
  create({
    id: lightStatisticsComponentId,
    instanceName: lightStatisticsInstanceName = "数量统计",
    canvas: lightStatisticsCanvas
  }) {
    const lightStatisticsCanvasWidth = Number(lightStatisticsCanvas?.width || 2778);
    const lightStatisticsCanvasHeight = Number(lightStatisticsCanvas?.height || 1940);
    // 与标题按钮取同一组比例（0.18 × 0.065），两者常在页面顶部成对出现。
    const lightStatisticsWidth = lightStatisticsCanvasWidth * 0.18;
    const lightStatisticsHeight = lightStatisticsCanvasHeight * 0.065;
    return {
      id: lightStatisticsComponentId,
      type: "light-statistics",
      componentVersion: 1,
      position: {
        x: (lightStatisticsCanvasWidth - lightStatisticsWidth) / 2,
        y: (lightStatisticsCanvasHeight - lightStatisticsHeight) / 2,
        width: lightStatisticsWidth,
        height: lightStatisticsHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: {
        instanceName: lightStatisticsInstanceName,
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
        iconSize: 42
      },
      style: {
        scale: 1.2932807744280563,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "icon-button",
  name: "图标按钮",
  type: "icon-button",
  description: "跟随灯光实体状态变化的切角图标按钮。",
  scopes: ["page"],
  /**
   * 创建图标按钮组件：占画布 0.1 × 0.15 并居中。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @param {string} [options.lightEntityId] 灯实体 ID，给了才写绑定与点按切换动作。
   * @returns {object} 图标按钮组件文档。
   */
  create({
    id: iconButtonComponentId,
    instanceName: iconButtonInstanceName = "图标按钮",
    canvas: iconButtonCanvas,
    lightEntityId: iconButtonLightEntityId = ""
  }) {
    const iconButtonCanvasWidth = Number(iconButtonCanvas?.width || 2778);
    const iconButtonCanvasHeight = Number(iconButtonCanvas?.height || 1940);
    // 0.1 宽、0.15 高是设计标称画布上的竖版按钮比例（约 278 × 291），
    // 比设备按钮略高，留出上下两行文字的呼吸空间。
    const iconButtonWidth = iconButtonCanvasWidth * 0.1;
    const iconButtonHeight = iconButtonCanvasHeight * 0.15;
    return {
      id: iconButtonComponentId,
      type: "icon-button",
      componentVersion: 1,
      position: {
        x: (iconButtonCanvasWidth - iconButtonWidth) / 2,
        y: (iconButtonCanvasHeight - iconButtonHeight) / 2,
        width: iconButtonWidth,
        height: iconButtonHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: iconButtonLightEntityId
        ? {
            entity: {
              entityId: iconButtonLightEntityId
            }
          }
        : {},
      properties: {
        instanceName: iconButtonInstanceName,
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
        secondaryTextTop: 91
      },
      style: {
        scale: 1,
        visible: true
      },
      // 未绑定实体时不预置动作：动作类型由实体能力决定，凭空写 toggle 会给出错误预期。
      actions: iconButtonLightEntityId
        ? {
            tap: {
              type: "toggle"
            }
          }
        : {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "device-button",
  name: "设备按钮",
  type: "device-button",
  description: "显示图标、标题和实时状态，点击可切换实体。",
  scopes: ["page"],
  /**
   * 创建设备按钮组件：占画布 0.1 × 0.11 并居中，默认不绑定实体。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 设备按钮组件文档。
   */
  create({
    id: deviceButtonComponentId,
    instanceName: deviceButtonInstanceName = "设备按钮",
    canvas: deviceButtonCanvas
  }) {
    const deviceButtonCanvasWidth = Number(deviceButtonCanvas?.width || 2778);
    const deviceButtonCanvasHeight = Number(deviceButtonCanvas?.height || 1940);
    // 0.1 × 0.11 是设计标称画布上的横向按钮比例（约 278 × 213），与图标按钮同宽、更扁，
    // 对应「图标 + 主副标题」的单行排布。
    const deviceButtonWidth = deviceButtonCanvasWidth * 0.1;
    const deviceButtonHeight = deviceButtonCanvasHeight * 0.11;
    return {
      id: deviceButtonComponentId,
      type: "device-button",
      componentVersion: 1,
      position: {
        x: (deviceButtonCanvasWidth - deviceButtonWidth) / 2,
        y: (deviceButtonCanvasHeight - deviceButtonHeight) / 2,
        width: deviceButtonWidth,
        height: deviceButtonHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: {
        instanceName: deviceButtonInstanceName,
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
        secondaryTextTop: 67
      },
      style: {
        scale: 1,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "presence-sensor",
  name: "传感器",
  type: "presence-sensor",
  description: "添加后在属性中选择传感器类型，当前支持人在、门窗和水浸状态的动态显示。",
  scopes: ["page"],
  /**
   * 创建传感器组件：固定 360×240 并居中，按 sensorKind 切换动效。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @param {string} [options.entityId] 传感器实体 ID，给了才写实体绑定。
   * @returns {object} 传感器组件文档。
   */
  create({
    id: presenceSensorComponentId,
    instanceName: presenceSensorInstanceName = "传感器",
    canvas: presenceSensorCanvas,
    entityId: presenceSensorEntityId = ""
  }) {
    const presenceSensorCanvasWidth = Number(presenceSensorCanvas?.width || 2778);
    const presenceSensorCanvasHeight = Number(presenceSensorCanvas?.height || 1940);
    // 传感器带光晕、人形等动效元素，不随画布比例缩放：固定 360×240（3:2），
    // 保证动效的轨道半径与素材比例在任何画布上都一致。
    const presenceSensorWidth = 360;
    const presenceSensorHeight = 240;
    return {
      id: presenceSensorComponentId,
      type: "presence-sensor",
      componentVersion: 1,
      position: {
        x: (presenceSensorCanvasWidth - presenceSensorWidth) / 2,
        y: (presenceSensorCanvasHeight - presenceSensorHeight) / 2,
        width: presenceSensorWidth,
        height: presenceSensorHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: presenceSensorEntityId
        ? {
            entity: {
              entityId: presenceSensorEntityId
            }
          }
        : {},
      properties: {
        instanceName: presenceSensorInstanceName,
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
        historyHours: 24
      },
      style: {
        scale: 1,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "camera",
  name: "摄像头实时预览",
  type: "camera",
  description: "实时预览摄像头，点击可放大查看。",
  scopes: ["page"],
  /**
   * 创建摄像头组件：宽为画布 0.22，按 16:9 画面比例推高并居中。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 摄像头组件文档（含点击查看大图动作）。
   */
  create({
    id: cameraComponentId,
    instanceName: cameraInstanceName = "摄像头实时预览",
    canvas: cameraCanvas
  }) {
    const cameraCanvasWidth = Number(cameraCanvas?.width || 2778);
    const cameraCanvasHeight = Number(cameraCanvas?.height || 1940);
    // 0.22 是设计标称画布上的预览框占比（约 611 × 344）。
    const cameraWidth = cameraCanvasWidth * 0.22;
    // 高 = 宽 × 9/16，即 16:9 的横屏画面比例（摄像头主流取值），等比推高保证预览不变形。
    const cameraHeight = (cameraWidth * 9) / 16;
    return {
      id: cameraComponentId,
      type: "camera",
      componentVersion: 1,
      position: {
        x: (cameraCanvasWidth - cameraWidth) / 2,
        y: (cameraCanvasHeight - cameraHeight) / 2,
        width: cameraWidth,
        height: cameraHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: {
        instanceName: cameraInstanceName,
        fit: "fill",
        displayMode: "live",
        refreshInterval: 10,
        mediaVisible: true,
        frameVisible: true,
        frameColor: "#d4d4d4",
        frameWidth: 1,
        frameAngle: 45,
        frameOpacity: 0.9,
        radius: 0.04
      },
      style: {
        scale: 1,
        visible: true
      },
      actions: {
        tap: {
          type: "more-info",
          data: {
            popupSource: "current"
          }
        }
      },
      children: []
    };
  }
});
registerComponentTemplate({
  id: "air-conditioner",
  name: "空调 / 浴霸",
  type: "air-conditioner",
  description: "显示空调或浴霸状态并按实体能力提供控制，内置可调整的动态出风效果。",
  scopes: ["page"],
  /**
   * 创建空调 / 浴霸组件：占画布 0.11 × 0.08 并居中，内置动态出风效果。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 空调 / 浴霸组件文档（含点按详情、双击切换动作）。
   */
  create({
    id: airConditionerComponentId,
    instanceName: airConditionerInstanceName = "空调",
    canvas: airConditionerCanvas
  }) {
    const airConditionerCanvasWidth = Number(airConditionerCanvas?.width || 2778);
    const airConditionerCanvasHeight = Number(airConditionerCanvas?.height || 1940);
    // 0.11 × 0.08 是设计标称画布上的宽扁卡片比例（约 306 × 155），
    // 对应「图标 + 主副标题」的横向排布；实际落地尺寸以 componentDefaultsByType 为准。
    const airConditionerWidth = airConditionerCanvasWidth * 0.11;
    const airConditionerHeight = airConditionerCanvasHeight * 0.08;
    return {
      id: airConditionerComponentId,
      type: "air-conditioner",
      componentVersion: 1,
      position: {
        x: (airConditionerCanvasWidth - airConditionerWidth) / 2,
        y: (airConditionerCanvasHeight - airConditionerHeight) / 2,
        width: airConditionerWidth,
        height: airConditionerHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: {
        deviceType: "auto",
        instanceName: airConditionerInstanceName,
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
        airflowRotation: -3
      },
      style: {
        scale: 1,
        visible: true
      },
      actions: {
        tap: {
          type: "more-info"
        },
        doubleTap: {
          type: "toggle"
        }
      },
      children: []
    };
  }
});
registerComponentTemplate({
  id: "time",
  name: "时间",
  type: "time",
  description: "显示设备本地时间，不依赖 Home Assistant 实体。",
  scopes: ["shared"],
  /**
   * 创建时间组件：宽高交给 timeComponentDimensions，与属性面板的实时估算共用一套公式。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 时间组件文档。
   */
  create({ id: timeComponentId, instanceName: timeInstanceName = "时间", canvas: timeCanvas }) {
    const timeCanvasWidth = Number(timeCanvas?.width || 2778);
    const timeCanvasHeight = Number(timeCanvas?.height || 1940);
    const timeProperties = {
      instanceName: timeInstanceName,
      hour12: false,
      // 默认不显示秒：秒会让字符数从 5 位变 8 位，宽度估算随之抖动。
      showSeconds: false,
      color: "#248eb2",
      fontSize: 96,
      fontWeight: 0.4,
      letterSpacing: 2.2,
      opacity: 1
    };
    // 尺寸由属性推导而非写死比例，用户在属性面板改字号时能立刻得到匹配的框体。
    const { width: timeWidth, height: timeHeight } = timeComponentDimensions(timeProperties);
    return {
      id: timeComponentId,
      type: "time",
      componentVersion: 1,
      position: {
        x: (timeCanvasWidth - timeWidth) / 2,
        y: (timeCanvasHeight - timeHeight) / 2,
        width: timeWidth,
        height: timeHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: timeProperties,
      // scale 是展示缩放：position 宽高 × scale 才是屏幕上的实际尺寸。
      // 这里的值会被 componentDefaultsByType.time.style.scale 覆盖，仅为模板自带初值。
      style: {
        scale: 1.8,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "date",
  name: "日期",
  type: "date",
  description: "显示设备本地年月日、星期与农历。",
  scopes: ["shared"],
  /**
   * 创建日期组件：宽高交给 dateComponentDimensions，默认不显示农历。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 日期组件文档。
   */
  create({ id: dateComponentId, instanceName: dateInstanceName = "日期", canvas: dateCanvas }) {
    const dateCanvasWidth = Number(dateCanvas?.width || 2778);
    const dateCanvasHeight = Number(dateCanvas?.height || 1940);
    const dateProperties = {
      instanceName: dateInstanceName,
      showWeekday: true,
      // 默认关农历：农历行会让组件高度翻倍，需要时由用户在属性面板打开。
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
      opacity: 1
    };
    const { width: dateWidth, height: dateHeight } = dateComponentDimensions(dateProperties);
    return {
      id: dateComponentId,
      type: "date",
      componentVersion: 1,
      position: {
        x: (dateCanvasWidth - dateWidth) / 2,
        y: (dateCanvasHeight - dateHeight) / 2,
        width: dateWidth,
        height: dateHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: dateProperties,
      style: {
        scale: 2,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "weather",
  name: "天气",
  type: "weather",
  description: "显示彩云天气当前状态、温度和湿度。",
  scopes: ["shared"],
  /**
   * 创建天气组件：宽高交给 weatherComponentDimensions，实体绑定按需拼装。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @param {string} [options.weatherEntityId] 天气实体 ID，用于当前状态与温度。
   * @param {string} [options.sunEntityId] 太阳实体 ID，用于日出日落等衍生信息。
   * @returns {object} 天气组件文档。
   */
  create({
    id: weatherComponentId,
    instanceName: weatherInstanceName = "天气",
    canvas: weatherCanvas,
    weatherEntityId: weatherEntityId = "",
    sunEntityId: sunEntityId = ""
  }) {
    const weatherCanvasWidth = Number(weatherCanvas?.width || 2778);
    const weatherCanvasHeight = Number(weatherCanvas?.height || 1940);
    const weatherProperties = {
      instanceName: weatherInstanceName,
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
      opacity: 1
    };
    const { width: weatherWidth, height: weatherHeight } =
      weatherComponentDimensions(weatherProperties);
    const weatherBindings = {};
    // 绑定槽位名（entity / sun）由渲染层直接读取，与属性面板的下拉项一一对应。
    if (weatherEntityId) {
      weatherBindings.entity = {
        entityId: weatherEntityId
      };
    }
    if (sunEntityId) {
      weatherBindings.sun = {
        entityId: sunEntityId
      };
    }
    return {
      id: weatherComponentId,
      type: "weather",
      componentVersion: 1,
      position: {
        x: (weatherCanvasWidth - weatherWidth) / 2,
        y: (weatherCanvasHeight - weatherHeight) / 2,
        width: weatherWidth,
        height: weatherHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: weatherBindings,
      properties: weatherProperties,
      style: {
        scale: 1.8,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "line-chart",
  name: "折线图",
  type: "line-chart",
  description: "显示温度或湿度实体的 24 小时趋势、当前值与极值。",
  scopes: ["shared", "page"],
  /**
   * 创建折线图组件：占画布 0.19 × 0.16 并居中，可绑定传感器实体。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @param {string} [options.sensorEntityId] 温度 / 湿度传感器实体 ID，给了才写绑定。
   * @returns {object} 折线图组件文档（含点按查看详情动作）。
   */
  create({
    id: lineChartComponentId,
    instanceName: lineChartInstanceName = "折线图",
    canvas: lineChartCanvas,
    sensorEntityId: lineChartSensorEntityId = ""
  }) {
    const lineChartCanvasWidth = Number(lineChartCanvas?.width || 2778);
    const lineChartCanvasHeight = Number(lineChartCanvas?.height || 1940);
    // 0.19 × 0.16 是设计标称画布上的图表卡片比例（约 528 × 310），与底图框取同一组数值，
    // 因为常见用法是把折线图叠在底图框里。
    const lineChartWidth = lineChartCanvasWidth * 0.19;
    const lineChartHeight = lineChartCanvasHeight * 0.16;
    return {
      id: lineChartComponentId,
      type: "line-chart",
      componentVersion: 1,
      position: {
        x: (lineChartCanvasWidth - lineChartWidth) / 2,
        y: (lineChartCanvasHeight - lineChartHeight) / 2,
        width: lineChartWidth,
        height: lineChartHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: lineChartSensorEntityId
        ? {
            entity: {
              entityId: lineChartSensorEntityId
            }
          }
        : {},
      properties: {
        instanceName: lineChartInstanceName,
        valueVisible: true,
        valueScale: 100,
        valueColor: "#dce1e5",
        valueOffsetX: 0,
        valueOffsetY: 0,
        updateInterval: 600,
        hours: 24,
        cornerRadius: 10,
        thresholdMode: "auto"
      },
      style: {
        scale: 1,
        visible: true
      },
      actions: {
        tap: {
          type: "more-info"
        }
      },
      children: []
    };
  }
});
registerComponentTemplate({
  id: "panel-frame",
  name: "底图框",
  type: "panel-frame",
  description: "双行标题、渐变外框和内向柔光容器。",
  scopes: ["shared", "page"],
  /**
   * 创建底图框组件：与折线图同尺寸（0.19 × 0.16），作纯装饰容器。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @returns {object} 底图框组件文档（无绑定、无动作）。
   */
  create({
    id: panelFrameComponentId,
    instanceName: panelFrameInstanceName = "底图框",
    canvas: panelFrameCanvas
  }) {
    const panelFrameCanvasWidth = Number(panelFrameCanvas?.width || 2778);
    const panelFrameCanvasHeight = Number(panelFrameCanvas?.height || 1940);
    // 与折线图共用 0.19 × 0.16：两者叠放时边框正好包住图表，不需要用户手动对齐。
    const panelFrameWidth = panelFrameCanvasWidth * 0.19;
    const panelFrameHeight = panelFrameCanvasHeight * 0.16;
    return {
      id: panelFrameComponentId,
      type: "panel-frame",
      componentVersion: 1,
      position: {
        x: (panelFrameCanvasWidth - panelFrameWidth) / 2,
        y: (panelFrameCanvasHeight - panelFrameHeight) / 2,
        width: panelFrameWidth,
        height: panelFrameHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: {
        instanceName: panelFrameInstanceName,
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
        glowAngle: 242
      },
      style: {
        scale: 1,
        visible: true
      },
      actions: {},
      children: []
    };
  }
});
registerComponentTemplate({
  id: "navigation-button",
  name: "导航按钮",
  type: "navigation-button",
  description: "默认用于页面跳转，也可绑定实体执行切换或打开弹窗。",
  scopes: ["shared"],
  /**
   * 创建导航按钮组件：占画布 0.2 × 0.085 并居中，按目标页面预置跳转动作。
   *
   * @param {object} options 实例化参数。
   * @param {string} options.id 实例 ID，由调用方生成。
   * @param {string} [options.instanceName] 实例显示名。
   * @param {{width?: number, height?: number}} [options.canvas] 目标画布尺寸。
   * @param {string} [options.targetPage] 目标页面 path，给了才预置 navigate 动作。
   * @returns {object} 导航按钮组件文档。
   */
  create({
    id: navigationButtonComponentId,
    instanceName: navigationButtonInstanceName = "导航按钮",
    canvas: navigationButtonCanvas,
    targetPage: navigationButtonTargetPage = ""
  }) {
    const navigationButtonCanvasWidth = Number(navigationButtonCanvas?.width || 2778);
    const navigationButtonCanvasHeight = Number(navigationButtonCanvas?.height || 1940);
    // 0.2 × 0.085 是设计标称画布上的长条导航比例（约 556 × 165），
    // 比其它按钮更宽，方便左侧图标 + 右侧两行文案的排布。
    const navigationButtonWidth = navigationButtonCanvasWidth * 0.2;
    const navigationButtonHeight = navigationButtonCanvasHeight * 0.085;
    // targetPage 统一转成字符串：属性来源可能是 undefined 或数字，避免把非字符串写进文档。
    const navigationButtonTargetPagePath = String(navigationButtonTargetPage || "");
    return {
      id: navigationButtonComponentId,
      type: "navigation-button",
      componentVersion: 1,
      position: {
        x: (navigationButtonCanvasWidth - navigationButtonWidth) / 2,
        y: (navigationButtonCanvasHeight - navigationButtonHeight) / 2,
        width: navigationButtonWidth,
        height: navigationButtonHeight,
        rotation: 0,
        zIndex: 1
      },
      bindings: {},
      properties: {
        instanceName: navigationButtonInstanceName,
        targetPage: navigationButtonTargetPagePath,
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
        radius: 0.5
      },
      style: {
        scale: 0.9232946236554526,
        visible: true
      },
      // 没选目标页面就不写 navigate 动作：动作里的 target 必须与非空 path 成对出现。
      actions: navigationButtonTargetPagePath
        ? {
            tap: {
              type: "navigate",
              target: navigationButtonTargetPagePath
            }
          }
        : {},
      children: []
    };
  }
});
