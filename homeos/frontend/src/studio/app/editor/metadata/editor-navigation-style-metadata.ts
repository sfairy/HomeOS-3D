/**
 * 导航 / 样式属性元数据表 —— 从 home.ts 单体切出。
 *
 * 纯数据（label / group / 默认值 / 选项 label 映射），无闭包捕获、无 store：
 * 编辑器据此渲染属性面板的分组与文案，取值逻辑仍在 home.ts。
 * 多声明语句已整条随切片搬出（`--whole-statement`），回引保持同名绑定，调用点零改写。
 */

import { DEFAULT_PERSPECTIVE_CORNERS } from "./editor-perspective-constants";

export const navigationVisibilityComponentState = {
    valueVisible: true,
    statePrecision: "auto",
    valueScale: 100,
    valueColor: "#dce1e5",
    valueOffsetX: 0,
    valueOffsetY: 0,
    updateInterval: 600,
    hours: 24,
    cornerRadius: 10,
    thresholdMode: "auto",
  },
  navigationVisibilityComponentValue = {
    valueVisible: {
      group: "当前数值",
      label: "当前数值显示",
    },
    statePrecision: {
      group: "当前数值",
      label: "数值小数位",
    },
    valueScale: {
      group: "当前数值",
      label: "当前数值大小",
    },
    valueColor: {
      group: "当前数值",
      label: "当前数值颜色",
    },
    valueOffsetX: {
      group: "当前数值",
      label: "当前数值左右位置",
    },
    valueOffsetY: {
      group: "当前数值",
      label: "当前数值上下位置",
    },
    updateInterval: {
      group: "历史数据",
      label: "刷新间隔",
    },
    hours: {
      group: "历史数据",
      label: "历史范围",
    },
    cornerRadius: {
      group: "折线",
      label: "圆角大小",
    },
    thresholdMode: {
      group: "折线",
      label: "阈值模式",
    },
    thresholds: {
      group: "折线",
      label: "阈值与折线颜色",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };

export const navigationPreviewClickComponentId = {
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
    markerColor: "#f2a20d",
    markerSize: 10,
    markerLeft: 1.8,
    markerTop: 84,
  },
  navigationPreviewClickComponentIdState = {
    mainTextVisible: {
      group: "中文标题",
      label: "中文标题显示",
    },
    mainColor: {
      group: "中文标题",
      label: "中文题色",
    },
    mainSize: {
      group: "中文标题",
      label: "中文大小",
    },
    mainWeight: {
      group: "中文标题",
      label: "中文粗细",
    },
    mainSpacing: {
      group: "中文标题",
      label: "中文字间距",
    },
    mainTextLeft: {
      group: "中文标题",
      label: "中文左右位置",
    },
    mainTextTop: {
      group: "中文标题",
      label: "中文上下位置",
    },
    secondaryTextVisible: {
      group: "英文标题",
      label: "英文标题显示",
    },
    secondaryColor: {
      group: "英文标题",
      label: "英文颜色",
    },
    secondarySize: {
      group: "英文标题",
      label: "英文大小",
    },
    secondaryWeight: {
      group: "英文标题",
      label: "英文粗细",
    },
    secondarySpacing: {
      group: "英文标题",
      label: "英文字间距",
    },
    secondaryLineGap: {
      group: "英文标题",
      label: "英文行间距",
    },
    secondaryTextLeft: {
      group: "英文标题",
      label: "英文左右位置",
    },
    secondaryTextTop: {
      group: "英文标题",
      label: "英文上下位置",
    },
    iconVisible: {
      group: "图标",
      label: "图标显示",
    },
    iconColor: {
      group: "图标",
      label: "图标颜色",
    },
    iconSize: {
      group: "图标",
      label: "图标大小",
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置",
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置",
    },
    frameVisible: {
      group: "括号",
      label: "括号显示",
    },
    frameColor: {
      group: "括号",
      label: "括号颜色",
    },
    frameWidth: {
      group: "括号",
      label: "括号粗细",
    },
    frameSize: {
      group: "括号",
      label: "括号大小",
    },
    frameSpacing: {
      group: "括号",
      label: "括号间距",
    },
    frameOffsetX: {
      group: "括号",
      label: "括号左右位置",
    },
    frameOffsetY: {
      group: "括号",
      label: "括号上下位置",
    },
    markerVisible: {
      group: "三角指示",
      label: "三角指示显示",
    },
    markerColor: {
      group: "三角指示",
      label: "三角指示颜色",
    },
    markerSize: {
      group: "三角指示",
      label: "三角指示大小",
    },
    markerLeft: {
      group: "三角指示",
      label: "三角指示左右位置",
    },
    markerTop: {
      group: "三角指示",
      label: "三角指示上下位置",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };

export const onNavigationStyleApplyDialogCloseValue = {
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
    effectRotation: 0,
  },
  onNavigationStyleApplyConfirmButtonClickState = {
    iconVisible: true,
    mainTextVisible: true,
    secondaryTextVisible: true,
    iconOffColor: "#9aa5ad",
    iconOnColor: "#73c8ff",
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
  onNavigationStyleApplyConfirmButtonClickValue = {
    iconVisible: {
      group: "图标",
      label: "图标显示",
    },
    iconOffColor: {
      group: "图标",
      label: "关闭颜色",
    },
    iconOnColor: {
      group: "图标",
      label: "开启颜色",
    },
    badgeColor: {
      group: "图标",
      label: "底座颜色",
    },
    badgeOpacity: {
      group: "图标",
      label: "底座透明度",
    },
    symbolSize: {
      group: "图标",
      label: "图标大小",
    },
    badgeSize: {
      group: "图标",
      label: "底座大小",
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置",
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置",
    },
    mainTextVisible: {
      group: "标题",
      label: "标题显示",
    },
    mainColor: {
      group: "标题",
      label: "颜色",
    },
    mainSize: {
      group: "标题",
      label: "大小",
    },
    mainWeight: {
      group: "标题",
      label: "粗细",
    },
    mainSpacing: {
      group: "标题",
      label: "字间距",
    },
    mainTextLeft: {
      group: "标题",
      label: "左右位置",
    },
    mainTextTop: {
      group: "标题",
      label: "上下位置",
    },
    secondaryTextVisible: {
      group: "状态",
      label: "状态显示",
    },
    secondaryColor: {
      group: "状态",
      label: "颜色",
    },
    secondarySize: {
      group: "状态",
      label: "大小",
    },
    secondaryWeight: {
      group: "状态",
      label: "粗细",
    },
    secondarySpacing: {
      group: "状态",
      label: "字间距",
    },
    secondaryTextLeft: {
      group: "状态",
      label: "左右位置",
    },
    secondaryTextTop: {
      group: "状态",
      label: "上下位置",
    },
    airflowVisible: {
      group: "出风效果",
      label: "显示",
    },
    airflowMotion: {
      group: "出风效果",
      label: "效果模式",
    },
    airflowCoolColor: {
      group: "出风颜色",
      label: "制冷",
    },
    airflowHeatColor: {
      group: "出风颜色",
      label: "制热",
    },
    airflowOtherColor: {
      group: "出风颜色",
      label: "其它",
    },
    airflowAngle: {
      group: "出风效果",
      label: "整体方向",
    },
    airflowCurve: {
      group: "出风效果",
      label: "弯曲程度",
    },
    airflowLength: {
      group: "出风效果",
      label: "单股长度",
    },
    airflowFadePosition: {
      group: "出风效果",
      label: "渐变消失位置",
    },
    airflowSpread: {
      group: "出风效果",
      label: "扩散宽度",
    },
    airflowDensity: {
      group: "出风效果",
      label: "气流密度",
    },
    airflowIrregularity: {
      group: "出风效果",
      label: "错落程度",
    },
    airflowThickness: {
      group: "出风效果",
      label: "整体粗细",
    },
    airflowStrength: {
      group: "出风效果",
      label: "显示强度",
    },
    airflowBlur: {
      group: "出风效果",
      label: "模糊大小",
    },
    airflowSpeed: {
      group: "出风效果",
      label: "动画速度",
    },
    airflowOffsetX: {
      group: "出风位置",
      label: "左右偏移",
    },
    airflowOffsetY: {
      group: "出风位置",
      label: "上下偏移",
    },
    airflowWidth: {
      group: "出风位置",
      label: "宽度",
    },
    airflowHeight: {
      group: "出风位置",
      label: "高度",
    },
    airflowScale: {
      group: "出风位置",
      label: "缩放",
    },
    airflowRotation: {
      group: "出风位置",
      label: "旋转",
    },
    width: {
      group: "按钮尺寸",
      label: "宽度",
    },
    height: {
      group: "按钮尺寸",
      label: "高度",
    },
    scale: {
      group: "按钮变换",
      label: "缩放",
    },
    rotation: {
      group: "按钮变换",
      label: "旋转",
    },
  };

export const styleSourceComponentIdState = {
  buttonVisible: {
    group: "图层显示",
    label: "按钮层",
  },
  effectVisible: {
    group: "图层显示",
    label: "效果图层",
  },
  icon: {
    group: "按钮图标",
    label: "图标",
  },
  iconOffColor: {
    group: "按钮图标",
    label: "关闭后颜色",
  },
  iconOnColor: {
    group: "按钮图标",
    label: "关闭前颜色",
  },
  iconSize: {
    group: "按钮图标",
    label: "图标大小",
  },
  buttonOffColor: {
    group: "按钮背景",
    label: "关闭后颜色",
  },
  buttonOnColor: {
    group: "按钮背景",
    label: "关闭前颜色",
  },
  buttonOpacity: {
    group: "按钮背景",
    label: "透明度",
  },
  frameColor: {
    group: "外框",
    label: "颜色",
  },
  frameWidth: {
    group: "外框",
    label: "粗细",
  },
  frameOpacity: {
    group: "外框",
    label: "透明度",
  },
  radius: {
    group: "外框",
    label: "圆角",
  },
  glowColor: {
    group: "光晕",
    label: "颜色",
  },
  glowOffStrength: {
    group: "光晕",
    label: "关闭后强度",
  },
  glowOnStrength: {
    group: "光晕",
    label: "关闭前强度",
  },
  effectColorTemperatureRealtime: {
    group: "灯光实时反馈",
    label: "色温实时",
  },
  effectBrightnessRealtime: {
    group: "灯光实时反馈",
    label: "亮度实时",
  },
  effectOpacity: {
    group: "效果图层",
    label: "透明度",
  },
  effectFadeDuration: {
    group: "效果图层",
    label: "淡入淡出时间",
  },
  effectLayoutMode: {
    group: "效果图层",
    label: "图片布局",
  },
  effectLeft: {
    group: "效果图层",
    label: "左右位置",
  },
  effectTop: {
    group: "效果图层",
    label: "上下位置",
  },
  effectScale: {
    group: "效果图层",
    label: "缩放",
  },
  effectRotation: {
    group: "效果图层",
    label: "旋转",
  },
  width: {
    group: "按钮尺寸",
    label: "宽度",
  },
  height: {
    group: "按钮尺寸",
    label: "高度",
  },
  scale: {
    group: "按钮变换",
    label: "缩放",
  },
  rotation: {
    group: "按钮变换",
    label: "旋转",
  },
};

export const styleComponentTypeState = {
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
    perspectiveCorners: DEFAULT_PERSPECTIVE_CORNERS,
    waterLeakColor: "#42c8ff",
    smokeColor: "#ffffff",
    naturalGasColor: "#ffb347",
  },
  styleComponentTypeValue = {
    iconColor: {
      group: "图标",
      label: "图标颜色",
    },
    iconOnColor: {
      group: "图标",
      label: "开启颜色",
    },
    badgeColor: {
      group: "图标",
      label: "底座颜色",
    },
    badgeOpacity: {
      group: "图标",
      label: "底座透明度",
    },
    symbolSize: {
      group: "图标",
      label: "图标大小",
    },
    badgeSize: {
      group: "图标",
      label: "底座大小",
    },
    iconSize: {
      group: "图标",
      label: "图标大小",
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置",
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置",
    },
    iconOffOpacity: {
      group: "图标",
      label: "图标关闭后透明度",
    },
    iconOnOpacity: {
      group: "图标",
      label: "图标关闭前透明度",
    },
    mainColor: {
      group: "中文标题",
      label: "中文颜色",
    },
    mainSize: {
      group: "中文标题",
      label: "中文大小",
    },
    mainWeight: {
      group: "中文标题",
      label: "中文粗细",
    },
    mainSpacing: {
      group: "中文标题",
      label: "中文字间距",
    },
    mainTextLeft: {
      group: "中文标题",
      label: "中文左右位置",
    },
    mainTextTop: {
      group: "中文标题",
      label: "中文上下位置",
    },
    mainOffOpacity: {
      group: "中文标题",
      label: "中文关闭后透明度",
    },
    mainOnOpacity: {
      group: "中文标题",
      label: "中文关闭前透明度",
    },
    secondaryColor: {
      group: "英文标题",
      label: "英文颜色",
    },
    secondarySize: {
      group: "英文标题",
      label: "英文大小",
    },
    secondaryWeight: {
      group: "英文标题",
      label: "英文粗细",
    },
    secondarySpacing: {
      group: "英文标题",
      label: "英文字间距",
    },
    secondaryTextLeft: {
      group: "英文标题",
      label: "英文左右位置",
    },
    secondaryTextTop: {
      group: "英文标题",
      label: "英文上下位置",
    },
    secondaryOffOpacity: {
      group: "英文标题",
      label: "英文关闭后透明度",
    },
    secondaryOnOpacity: {
      group: "英文标题",
      label: "英文关闭前透明度",
    },
    onFillVisible: {
      group: "状态填充",
      label: "状态填充显示",
    },
    onFillColor: {
      group: "状态填充",
      label: "关闭前填充颜色",
    },
    onFillStrength: {
      group: "状态填充",
      label: "关闭前填充强度",
    },
    onFillFadeDuration: {
      group: "状态填充",
      label: "淡入淡出时间",
    },
    frameVisible: {
      group: "外框",
      label: "外框显示",
    },
    frameWidth: {
      group: "外框",
      label: "外框粗细",
    },
    frameAngle: {
      group: "外框",
      label: "外框渐变角度",
    },
    frameOffOpacity: {
      group: "外框",
      label: "外框关闭后透明度",
    },
    frameOnOpacity: {
      group: "外框",
      label: "外框关闭前透明度",
    },
    cutCorner: {
      group: "外框",
      label: "切角大小",
    },
    softLightVisible: {
      group: "柔光",
      label: "柔光显示",
    },
    softLightColor: {
      group: "柔光",
      label: "柔光颜色",
    },
    softLightSize: {
      group: "柔光",
      label: "柔光大小",
    },
    softLightStrength: {
      group: "柔光",
      label: "柔光强度",
    },
    softLightAngle: {
      group: "柔光",
      label: "柔光角度",
    },
    glowVisible: {
      group: "泛光",
      label: "泛光显示",
    },
    glowColor: {
      group: "泛光",
      label: "泛光颜色",
    },
    glowSize: {
      group: "泛光",
      label: "泛光大小",
    },
    glowStrength: {
      group: "泛光",
      label: "泛光强度",
    },
    glowAngle: {
      group: "泛光",
      label: "泛光角度",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  },
  styleComponentTypeConfig = {
    iconColor: {
      group: "显示颜色",
      label: "无人颜色",
    },
    iconOnColor: {
      group: "显示颜色",
      label: "有人颜色",
    },
    waterLeakColor: {
      group: "显示颜色",
      label: "水浸颜色",
    },
    smokeColor: {
      group: "显示颜色",
      label: "烟雾颜色",
    },
    naturalGasColor: {
      group: "显示颜色",
      label: "天然气颜色",
    },
    haloVisible: {
      group: "运动路径",
      label: "光环显示",
    },
    haloScaleX: {
      group: "运动路径",
      label: "光环宽度",
    },
    haloScaleY: {
      group: "运动路径",
      label: "光环高度",
    },
    haloRotation: {
      group: "运动路径",
      label: "光环旋转",
    },
    haloOpacity: {
      group: "运动路径",
      label: "光环透明度",
    },
    personVisible: {
      group: "运动路径",
      label: "小人显示",
    },
    personScale: {
      group: "运动路径",
      label: "小人缩放",
    },
    personRotation: {
      group: "运动路径",
      label: "小人旋转",
    },
    personOpacity: {
      group: "运动路径",
      label: "小人透明度",
    },
    orbitDuration: {
      group: "运动路径",
      label: "循环一周",
    },
    perspectiveCorners: {
      group: "透视",
      label: "四角透视",
    },
    width: styleComponentTypeValue.width,
    height: styleComponentTypeValue.height,
    scale: styleComponentTypeValue.scale,
    rotation: styleComponentTypeValue.rotation,
  };

export const navigationIconOptionState = {
    mediaVisible: true,
    displayMode: "live",
    refreshInterval: 10,
    fit: "fill",
    frameVisible: true,
    frameColor: "#d4d4d4",
    frameWidth: 1,
    radius: 0.04,
    frameAngle: 45,
    frameOpacity: 0.9,
  },
  navigationIconOptionStateState = {
    mediaVisible: {
      group: "画面",
      label: "画面显示",
    },
    displayMode: {
      group: "画面",
      label: "显示方式",
    },
    refreshInterval: {
      group: "画面",
      label: "快照更新时间",
    },
    fit: {
      group: "画面",
      label: "画面比例",
    },
    frameVisible: {
      group: "外框",
      label: "外框显示",
    },
    frameColor: {
      group: "外框",
      label: "外框颜色",
    },
    frameWidth: {
      group: "外框",
      label: "外框粗细",
    },
    radius: {
      group: "外框",
      label: "圆角大小",
    },
    frameAngle: {
      group: "外框",
      label: "渐变角度",
    },
    frameOpacity: {
      group: "外框",
      label: "外框透明度",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };

export const navigationIconDraftDocumentValue = {
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
    glowAngle: 242,
  },
  navigationIconDraftDocumentConfig = {
    mainTextVisible: {
      group: "主文字",
      label: "主文字显示",
    },
    mainColor: {
      group: "主文字",
      label: "主文字颜色",
    },
    mainSize: {
      group: "主文字",
      label: "主文字大小",
    },
    mainWeight: {
      group: "主文字",
      label: "主文字笔画粗细",
    },
    mainOpacity: {
      group: "主文字",
      label: "主文字透明度",
    },
    mainSpacing: {
      group: "主文字",
      label: "主文字字间距",
    },
    mainTextLeft: {
      group: "主文字",
      label: "主文字左右位置",
    },
    mainTextTop: {
      group: "主文字",
      label: "主文字上下位置",
    },
    secondaryTextVisible: {
      group: "副文字",
      label: "副文字显示",
    },
    secondaryColor: {
      group: "副文字",
      label: "副文字颜色",
    },
    secondarySize: {
      group: "副文字",
      label: "副文字大小",
    },
    secondaryWeight: {
      group: "副文字",
      label: "副文字笔画粗细",
    },
    secondaryOpacity: {
      group: "副文字",
      label: "副文字透明度",
    },
    secondarySpacing: {
      group: "副文字",
      label: "副文字字间距",
    },
    secondaryTextLeft: {
      group: "副文字",
      label: "副文字左右位置",
    },
    secondaryTextTop: {
      group: "副文字",
      label: "副文字上下位置",
    },
    edgeVisible: {
      group: "外框",
      label: "外框显示",
    },
    edgeColor: {
      group: "外框",
      label: "外框颜色",
    },
    edgeWidth: {
      group: "外框",
      label: "外框粗细",
    },
    edgeOpacity: {
      group: "外框",
      label: "外框透明度",
    },
    radius: {
      group: "外框",
      label: "外框圆角",
    },
    edgeAngle: {
      group: "外框",
      label: "外框渐变角度",
    },
    glowVisible: {
      group: "柔光",
      label: "柔光显示",
    },
    glowColor: {
      group: "柔光",
      label: "柔光颜色",
    },
    glowStrength: {
      group: "柔光",
      label: "柔光强度",
    },
    glowSize: {
      group: "柔光",
      label: "柔光大小",
    },
    glowAngle: {
      group: "柔光",
      label: "柔光角度",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };

export const entryStateRef = {
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
    glowActiveSize: 2.2,
  },
  entryStateEntry = {
    mainTextVisible: {
      group: "文字",
      label: "主文字显示",
    },
    secondaryTextVisible: {
      group: "文字",
      label: "副文字显示",
    },
    mainColor: {
      group: "文字",
      label: "主文字颜色",
    },
    secondaryColor: {
      group: "文字",
      label: "副文字颜色",
    },
    mainSize: {
      group: "文字",
      label: "主文字大小",
    },
    secondarySize: {
      group: "文字",
      label: "副文字大小",
    },
    mainWeight: {
      group: "文字",
      label: "主文字笔画粗细",
    },
    secondaryWeight: {
      group: "文字",
      label: "副文字笔画粗细",
    },
    mainSpacing: {
      group: "文字",
      label: "主文字字间距",
    },
    secondarySpacing: {
      group: "文字",
      label: "副文字字间距",
    },
    mainTextLeft: {
      group: "文字",
      label: "主文字左右位置",
    },
    mainTextTop: {
      group: "文字",
      label: "主文字上下位置",
    },
    secondaryTextLeft: {
      group: "文字",
      label: "副文字左右位置",
    },
    secondaryTextTop: {
      group: "文字",
      label: "副文字上下位置",
    },
    textIdleOpacity: {
      group: "文字",
      label: "文字选择前透明度",
    },
    textActiveOpacity: {
      group: "文字",
      label: "文字选择后透明度",
    },
    iconVisible: {
      group: "图标",
      label: "图标显示",
    },
    iconColor: {
      group: "图标",
      label: "图标颜色",
    },
    iconSize: {
      group: "图标",
      label: "图标大小",
    },
    iconLeft: {
      group: "图标",
      label: "图标左右位置",
    },
    iconTop: {
      group: "图标",
      label: "图标上下位置",
    },
    iconIdleOpacity: {
      group: "图标",
      label: "图标选择前透明度",
    },
    iconActiveOpacity: {
      group: "图标",
      label: "图标选择后透明度",
    },
    frameVisible: {
      group: "外框",
      label: "外框显示",
    },
    frameColor: {
      group: "外框",
      label: "外框颜色",
    },
    frameWidth: {
      group: "外框",
      label: "外框粗细",
    },
    frameIdleOpacity: {
      group: "外框",
      label: "外框选择前透明度",
    },
    frameActiveOpacity: {
      group: "外框",
      label: "外框选择后透明度",
    },
    radius: {
      group: "外框",
      label: "外框圆角",
    },
    frameAngle: {
      group: "外框",
      label: "外框渐变角度",
    },
    glowVisible: {
      group: "背景光晕",
      label: "背景光晕显示",
    },
    glowColor: {
      group: "背景光晕",
      label: "背景光晕颜色",
    },
    glowAngle: {
      group: "背景光晕",
      label: "背景光晕角度",
    },
    glowIdleStrength: {
      group: "背景光晕",
      label: "选择前光晕强度",
    },
    glowIdleSize: {
      group: "背景光晕",
      label: "选择前光晕大小",
    },
    glowActiveStrength: {
      group: "背景光晕",
      label: "选择后光晕强度",
    },
    glowActiveSize: {
      group: "背景光晕",
      label: "选择后光晕大小",
    },
    width: {
      group: "尺寸与变换",
      label: "控件宽度",
    },
    height: {
      group: "尺寸与变换",
      label: "控件高度",
    },
    scale: {
      group: "尺寸与变换",
      label: "控件缩放",
    },
    rotation: {
      group: "尺寸与变换",
      label: "控件旋转",
    },
  };
