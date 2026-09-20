/**
 * 编辑器文档管理：页面路径、页面复制、弹窗模块与拖放排序。
 *
 * 位置：编辑器「页面管理」「弹窗设置」面板与拖拽排序交互。
 * 职责：生成不冲突的页面路径、整页复制并换新 ID、弹窗模块的中文名与推荐
 *   实体判定、模块拖放目标位置计算，以及辗转相除法求最大公约数。
 * 约定：页面路径由标题 slug 化而来，必须全局唯一；弹窗模块的推荐实体现
 *   与 HA 域一一对应，通用设备默认全部推荐。
 */
import { clone, newId, slugify } from "./editor-utils.js?v=20260920080000";
// 「按 ID 切域」只有一份实现（P12 收口 B 类末尾那一项的残留补齐）：本文件原先在
// popupModuleEntityRecommended 里手写 `String(entity?.entityId || "").split(".")[0]`。
// 那条表达式与助手函数体逐字相同，换过去语义不变。
import { entityDomainFromId } from "./utils/entities.js?v=20260920080000";

/**
 * 生成不与现有页面冲突的路径。
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
 */
export function findCustomPopup(editorDocument, popupId) {
  return (editorDocument?.customPopups || []).find(popup => popup.id === popupId) || null;
}

/**
 * 取弹窗模块类型的中文名。
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
 */
export function popupModuleEntityRecommended(entity, recommendedModuleType) {
  // entity.domain 缺失时从 entityId 的前缀推导，兼容只带 ID 的瘦实体。
  const domain = entity?.domain || entityDomainFromId(entity?.entityId);
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
 */
export function greatestCommonDivisor(firstNumber, secondNumber) {
  let leftNumber = Math.abs(Math.trunc(firstNumber));
  let rightNumber = Math.abs(Math.trunc(secondNumber));
  while (rightNumber) {
    [leftNumber, rightNumber] = [rightNumber, leftNumber % rightNumber];
  }
  return leftNumber || 1;
}
