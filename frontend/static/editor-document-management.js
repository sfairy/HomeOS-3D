/**
 * 编辑器文档管理：页面路径、页面复制、弹窗模块与拖放排序。
 *
 * 位置：编辑器「页面管理」「弹窗设置」面板与拖拽排序交互。
 * 职责：生成不冲突的页面路径、整页复制并换新 ID、弹窗模块的中文名与推荐
 *   实体判定、模块拖放目标位置计算，以及辗转相除法求最大公约数。
 * 约定：页面路径由标题 slug 化而来，必须全局唯一；弹窗模块的推荐实体现
 *   与 HA 域一一对应，通用设备默认全部推荐。
 */
import { clone, newId, slugify } from "./editor-utils.js?v=20260919115244";

/**
 * 生成不与现有页面冲突的路径。
 *
 * @param {Array<object>} pages 现有页面列表。
 * @param {string} pageName 页面名称（中文亦可，内部会 slug 化）。
 * @param {string} [currentPath] 当前页面自身的路径，重命名时排除它以免自我冲突。
 * @returns {string} 可用路径；冲突时追加 "-2"、"-3"……
 */
export function uniquePagePath(pages, pageName, currentPath = "") {
  const basePath = slugify(pageName);
  const existingPaths = new Set(
    (pages || [])
      .map(existingPage => existingPage.path)
      .filter(existingPath => existingPath !== currentPath)
  );
  let candidatePath = basePath;
  let pathSuffix = 2;
  while (existingPaths.has(candidatePath)) {
    candidatePath = basePath + "-" + pathSuffix++;
  }
  return candidatePath;
}

/**
 * 复制页面并为其及全部子组件换上新 ID。
 *
 * @param {object} sourcePage 源页面，不会被修改。
 * @param {string} targetPageName 新页面名称。
 * @param {Array<object>} [otherPages] 其余页面，用于生成不冲突的路径。
 * @returns {object} 新页面对象。
 */
export function clonePageWithFreshIds(sourcePage, targetPageName, otherPages = []) {
  const clonedPage = clone(sourcePage);
  clonedPage.id = newId("page");
  clonedPage.name = targetPageName;
  clonedPage.path = uniquePagePath(otherPages, targetPageName);
  // 组件 ID 必须整棵子树递归换新，否则复制页与原页会共用同一批实体绑定 ID。
  const assignFreshComponentIds = components => {
    for (const component of components || []) {
      component.id = newId("component");
      assignFreshComponentIds(component.children);
    }
  };
  assignFreshComponentIds(clonedPage.components);
  return clonedPage;
}

/**
 * 按 ID 查找自定义弹窗定义。
 *
 * @param {object} editorDocument 文档模型。
 * @param {string} popupId 弹窗 ID。
 * @returns {object|null} 弹窗定义；未找到为 null。
 */
export function findCustomPopup(editorDocument, popupId) {
  return (editorDocument?.customPopups || []).find(popup => popup.id === popupId) || null;
}

/**
 * 取弹窗模块类型的中文名。
 *
 * @param {string} moduleType 模块类型。
 * @returns {string} 中文名；未知类型回退为「通用设备」。
 */
export function popupModuleTypeLabel(moduleType) {
  return (
    {
      light: "灯光",
      climate: "空调 / 浴霸",
      "air-purifier": "空气净化器",
      "water-heater": "热水器",
      "media-player": "媒体",
      "electric-bed": "电动床",
      switch: "开关 / 按钮",
      cover: "窗帘",
      camera: "摄像头",
      "line-chart": "折线图",
      generic: "通用设备",
      "capability-device": "通用设备"
    }[moduleType] || "通用设备"
  );
}

// 空调类模块支持的设备类型；未知值一律归一成 "auto"。
const CLIMATE_DEVICE_TYPES = ["auto", "air-conditioner", "bath-heater"];

/**
 * 归一弹窗气候模块的设备类型。
 *
 * @param {string} deviceType 设备类型。
 * @returns {string} 合法类型原样返回，否则为 "auto"。
 */
export function normalizedPopupClimateDeviceType(deviceType) {
  if (CLIMATE_DEVICE_TYPES.includes(deviceType)) {
    return deviceType;
  } else {
    return "auto";
  }
}

/**
 * 判断实体是否是某类弹窗模块的推荐实体。
 *
 * @param {object} entity 实体对象。
 * @param {string} recommendedModuleType 模块类型。
 * @returns {boolean} 推荐则为 true。
 */
export function popupModuleEntityRecommended(entity, recommendedModuleType) {
  // entity.domain 缺失时从 entityId 的前缀推导，兼容只带 ID 的瘦实体。
  const domain = entity?.domain || String(entity?.entityId || "").split(".")[0];
  if (recommendedModuleType === "light") {
    return domain === "light";
  } else if (recommendedModuleType === "climate") {
    // 浴霸在 HA 里常挂 fan 域，与 climate 一起算作空调类设备。
    return ["climate", "fan"].includes(domain);
  } else if (recommendedModuleType === "air-purifier") {
    return domain === "fan";
  } else if (recommendedModuleType === "water-heater") {
    return domain === "water_heater";
  } else if (recommendedModuleType === "media-player") {
    return domain === "media_player";
  } else if (recommendedModuleType === "electric-bed") {
    return ["number", "select", "button", "switch"].includes(domain);
  } else if (recommendedModuleType === "switch") {
    return ["switch", "input_boolean", "button"].includes(domain);
  } else if (recommendedModuleType === "cover") {
    return domain === "cover";
  } else if (recommendedModuleType === "camera") {
    return domain === "camera";
  } else if (recommendedModuleType === "line-chart") {
    return domain === "sensor";
  } else {
    // 通用设备不筛选，任何实体都可选。
    return true;
  }
}

/**
 * 计算模块拖放后的新顺序。
 *
 * @param {Array<object>} modules 模块列表。
 * @param {string} moduleId 被拖动的模块 ID。
 * @param {string|null} [beforeModuleId] 参照模块 ID；为空表示移到末尾。
 * @param {boolean} [placeAfter] 是否插到参照模块之后。
 * @returns {Array<object>} 新数组；无变化时返回原顺序的浅拷贝。
 */
export function reorderedPopupModules(
  modules,
  moduleId,
  beforeModuleId = null,
  placeAfter = false
) {
  const reorderedModules = [...(modules || [])];
  const sourceIndex = reorderedModules.findIndex(module => module.id === moduleId);
  // 拖到自己身上或找不到源模块时直接返回，避免数组被改坏。
  if (sourceIndex < 0 || moduleId === beforeModuleId) {
    return reorderedModules;
  }
  const [movedModule] = reorderedModules.splice(sourceIndex, 1);
  if (!beforeModuleId) {
    reorderedModules.push(movedModule);
    return reorderedModules;
  }
  const targetIndex = reorderedModules.findIndex(
    targetModule => targetModule.id === beforeModuleId
  );
  if (targetIndex < 0) {
    // 参照模块不在列表里，退回原位，保证拖放失败时顺序不变。
    reorderedModules.splice(sourceIndex, 0, movedModule);
    return reorderedModules;
  } else {
    reorderedModules.splice(targetIndex + (placeAfter ? 1 : 0), 0, movedModule);
    return reorderedModules;
  }
}

/**
 * 根据拖放点位置判断插入方向与落点边缘。
 *
 * @param {HTMLElement} rowElement 目标行元素。
 * @param {DragEvent} dropEvent 拖放事件。
 * @returns {{placeAfter: boolean, edge: string}} placeAfter 表示插到该行之后，
 *   edge 为 top / bottom / left / right。
 */
export function popupModuleDropPosition(rowElement, dropEvent) {
  const rowRect = rowElement.getBoundingClientRect();
  const offsetY = dropEvent.clientY - rowRect.top;
  // 上下各留一块判定区（最多 48px、行高的 22%），中间横向再分成左右两半。
  const edgeThresholdPx = Math.min(48, rowRect.height * 0.22);
  if (offsetY <= edgeThresholdPx) {
    return {
      placeAfter: false,
      edge: "top"
    };
  } else if (offsetY >= rowRect.height - edgeThresholdPx) {
    return {
      placeAfter: true,
      edge: "bottom"
    };
  } else if (dropEvent.clientX < rowRect.left + rowRect.width / 2) {
    return {
      placeAfter: false,
      edge: "left"
    };
  } else {
    return {
      placeAfter: true,
      edge: "right"
    };
  }
}

/**
 * 求最大公约数（辗转相除法），用于按比例简化尺寸。
 *
 * @param {number} firstNumber 第一个数。
 * @param {number} secondNumber 第二个数。
 * @returns {number} 最大公约数；两者都为 0 时返回 1，避免调用方除零。
 */
export function greatestCommonDivisor(firstNumber, secondNumber) {
  let leftNumber = Math.abs(Math.trunc(firstNumber));
  let rightNumber = Math.abs(Math.trunc(secondNumber));
  while (rightNumber) {
    [leftNumber, rightNumber] = [rightNumber, leftNumber % rightNumber];
  }
  return leftNumber || 1;
}
