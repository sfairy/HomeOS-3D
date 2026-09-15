import { clone, newId, slugify } from "./editor-utils.js?v=20260916013557";
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
export function clonePageWithFreshIds(sourcePage, targetPageName, otherPages = []) {
  const clonedPage = clone(sourcePage);
  clonedPage.id = newId("page");
  clonedPage.name = targetPageName;
  clonedPage.path = uniquePagePath(otherPages, targetPageName);
  const assignFreshComponentIds = components => {
    for (const component of components || []) {
      component.id = newId("component");
      assignFreshComponentIds(component.children);
    }
  };
  assignFreshComponentIds(clonedPage.components);
  return clonedPage;
}
export function findCustomPopup(editorDocument, popupId) {
  return (editorDocument?.customPopups || []).find(popup => popup.id === popupId) || null;
}
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
const CLIMATE_DEVICE_TYPES = ["auto", "air-conditioner", "bath-heater"];
export function normalizedPopupClimateDeviceType(deviceType) {
  if (CLIMATE_DEVICE_TYPES.includes(deviceType)) {
    return deviceType;
  } else {
    return "auto";
  }
}
export function popupModuleEntityRecommended(entity, recommendedModuleType) {
  const domain = entity?.domain || String(entity?.entityId || "").split(".")[0];
  if (recommendedModuleType === "light") {
    return domain === "light";
  } else if (recommendedModuleType === "climate") {
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
    return true;
  }
}
export function reorderedPopupModules(
  modules,
  moduleId,
  beforeModuleId = null,
  placeAfter = false
) {
  const reorderedModules = [...(modules || [])];
  const sourceIndex = reorderedModules.findIndex(module => module.id === moduleId);
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
    reorderedModules.splice(sourceIndex, 0, movedModule);
    return reorderedModules;
  } else {
    reorderedModules.splice(targetIndex + (placeAfter ? 1 : 0), 0, movedModule);
    return reorderedModules;
  }
}
export function popupModuleDropPosition(rowElement, dropEvent) {
  const rowRect = rowElement.getBoundingClientRect();
  const offsetY = dropEvent.clientY - rowRect.top;
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
export function greatestCommonDivisor(firstNumber, secondNumber) {
  let leftNumber = Math.abs(Math.trunc(firstNumber));
  let rightNumber = Math.abs(Math.trunc(secondNumber));
  while (rightNumber) {
    [leftNumber, rightNumber] = [rightNumber, leftNumber % rightNumber];
  }
  return leftNumber || 1;
}
