import { clone, newId, slugify } from "./editor-utils";
const selectedProjectStorageKey = "homeos:editor:selected-project";
export function rememberEditorProject(
  projectId: any,
  getSessionStorage = () => globalThis.sessionStorage,
) {
  try {
    getSessionStorage()?.setItem(selectedProjectStorageKey, projectId);
  } catch {}
}
export function restoredEditorProject(
  projects: any,
  preferredProjectId: any = null,
  readSessionStorage = () => globalThis.sessionStorage,
) {
  if (projects.some((project: any) => project.id === preferredProjectId)) return preferredProjectId;
  let storedProjectId: any;
  try {
    storedProjectId = readSessionStorage()?.getItem(selectedProjectStorageKey);
  } catch {}
  return (
    projects.find((matchedProject: any) => matchedProject.id === storedProjectId)?.id ??
    projects[0]?.id ??
    null
  );
}
export function uniquePagePath(pages: any, pageName: any, excludedPath = "") {
  const basePagePath = slugify(pageName),
    existingPathSet = new Set(
      (pages || []).map((page: any) => page.path).filter((pagePath: any) => pagePath !== excludedPath),
    );
  let candidatePath = basePagePath,
    suffixIndex = 2;
  for (; existingPathSet.has(candidatePath);) candidatePath = basePagePath + "-" + suffixIndex++;
  return candidatePath;
}
export function clonePageWithFreshIds(sourcePage: any, newPageName: any, existingPages: any[] = []) {
  const clonedPage = clone(sourcePage);
  ((clonedPage.id = newId("page")),
    (clonedPage.name = newPageName),
    (clonedPage.path = uniquePagePath(existingPages, newPageName)));
  const assignFreshComponentIds = (components: any) => {
    for (const component of components || [])
      ((component.id = newId("component")), assignFreshComponentIds(component.children));
  };
  return (assignFreshComponentIds(clonedPage.components), clonedPage);
}
export function findCustomPopup(editorDocument: any, popupId: any) {
  return (
    (editorDocument?.customPopups || []).find((customPopup: any) => customPopup.id === popupId) || null
  );
}
export function popupModuleTypeLabel(moduleType: any) {
  return (
    ({
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
      "capability-device": "通用设备",
    } as any)[moduleType] || "通用设备"
  );
}
const climateDeviceTypes = ["auto", "air-conditioner", "bath-heater"];
export function normalizedPopupClimateDeviceType(deviceType: any) {
  return climateDeviceTypes.includes(deviceType) ? deviceType : "auto";
}
export function popupModuleEntityRecommended(entity: any, popupModuleType: any) {
  const entityDomain = entity?.domain || String(entity?.entityId || "").split(".")[0];
  return popupModuleType === "light"
    ? entityDomain === "light"
    : popupModuleType === "climate"
      ? ["climate", "fan"].includes(entityDomain)
      : popupModuleType === "air-purifier"
        ? entityDomain === "fan"
        : popupModuleType === "water-heater"
          ? entityDomain === "water_heater"
          : popupModuleType === "media-player"
            ? entityDomain === "media_player"
            : popupModuleType === "electric-bed"
              ? ["number", "select", "button", "switch"].includes(entityDomain)
              : popupModuleType === "switch"
                ? ["switch", "input_boolean", "button"].includes(entityDomain)
                : popupModuleType === "cover"
                  ? entityDomain === "cover"
                  : popupModuleType === "camera"
                    ? entityDomain === "camera"
                    : popupModuleType === "line-chart"
                      ? entityDomain === "sensor"
                      : true;
}
export function reorderedPopupModules(
  modules: any,
  draggedModuleId: any,
  targetModuleId: any = null,
  shouldPlaceAfter = false,
) {
  const reorderedModules = [...(modules || [])],
    draggedIndex = reorderedModules.findIndex((module) => module.id === draggedModuleId);
  if (draggedIndex < 0 || draggedModuleId === targetModuleId) return reorderedModules;
  const [draggedModule] = reorderedModules.splice(draggedIndex, 1);
  if (!targetModuleId) return (reorderedModules.push(draggedModule), reorderedModules);
  const targetIndex = reorderedModules.findIndex(
    (targetModule) => targetModule.id === targetModuleId,
  );
  return targetIndex < 0
    ? (reorderedModules.splice(draggedIndex, 0, draggedModule), reorderedModules)
    : (reorderedModules.splice(targetIndex + (shouldPlaceAfter ? 1 : 0), 0, draggedModule),
      reorderedModules);
}
export function popupModuleDropPosition(moduleElement: any, pointerEvent: any) {
  const boundingRect = moduleElement.getBoundingClientRect(),
    pointerOffsetY = pointerEvent.clientY - boundingRect.top,
    edgeThresholdPx = Math.min(48, boundingRect.height * 0.22);
  return pointerOffsetY <= edgeThresholdPx
    ? {
        placeAfter: false,
        edge: "top",
      }
    : pointerOffsetY >= boundingRect.height - edgeThresholdPx
      ? {
          placeAfter: true,
          edge: "bottom",
        }
      : pointerEvent.clientX < boundingRect.left + boundingRect.width / 2
        ? {
            placeAfter: false,
            edge: "left",
          }
        : {
            placeAfter: true,
            edge: "right",
          };
}
export function greatestCommonDivisor(firstNumber: any, secondNumber: any) {
  let currentDivisor = Math.abs(Math.trunc(firstNumber)),
    currentRemainder = Math.abs(Math.trunc(secondNumber));
  for (; currentRemainder;)
    [currentDivisor, currentRemainder] = [currentRemainder, currentDivisor % currentRemainder];
  return currentDivisor || 1;
}
