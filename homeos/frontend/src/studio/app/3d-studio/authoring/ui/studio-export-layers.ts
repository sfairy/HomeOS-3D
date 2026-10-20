/**
 * 导出面板的「图层清单」渲染：把当前项目的电视画面层 / 汽车充电层 / 灯组层逐条渲染成勾选行，
 * 外加导出文件名的净化（`sanitizeExportName`）。
 *
 * DOM 宿主元素与三个取数助手按 deps 显式传入：助手读的是宿主闭包里的 `studioProject`
 * （宿主仍是「项目状态」的唯一持有者）。
 */

import { EXPORT_IMAGE_EXTENSION as EXPORT_IMAGE_EXTENSION2 } from "../../export/export-utils";

/** 导出图层渲染需要的外部状态：图层清单容器 + 取数助手（都读宿主里的 `studioProject`）。 */
interface StudioExportLayerDeps {
  exportGroupFilesElement: HTMLElement | null;
  getOrderedFloorList: () => any[];
  listScreenRows: (floors?: any) => any[];
  listChargingRows: (floors?: any) => any[];
  listLightGroupRows: (floors?: any) => any[];
}

export function renderExportLayers(deps: StudioExportLayerDeps) {
  if (!deps.exportGroupFilesElement) return;
  const wl2 = deps.getOrderedFloorList(),
    exportLayerItems: any = [],
    addExportLayerItem = (layerFileKey: any, layerLabel: any, layerNote: any) => {
      const exportLayerRow = document.createElement("li"),
        exportLayerLabel = document.createElement("label"),
        exportLayerCheckbox = document.createElement("input");
      ((exportLayerCheckbox.type = "checkbox"),
        (exportLayerCheckbox.checked = true),
        (exportLayerCheckbox.dataset.exportFile = layerFileKey));
      const exportLayerCaption = document.createElement("span");
      exportLayerCaption.textContent = layerLabel;
      const exportLayerNote = document.createElement("small");
      ((exportLayerNote.textContent = layerNote),
        exportLayerLabel.append(exportLayerCheckbox, exportLayerCaption),
        exportLayerRow.append(exportLayerLabel, exportLayerNote),
        exportLayerItems.push(exportLayerRow));
    };
  (deps.listScreenRows(wl2).forEach(
    ({
      floor: layerFloor,
      item: renderExportLayersScreenItem,
      index: screenIndex,
      key: screenKey,
    }: any) => {
      const screenLayerName =
        "" +
        (wl2.length > 1 ? layerFloor.name + "-" : "") +
        (renderExportLayersScreenItem.screenLayerName || "电视画面 " + (screenIndex + 1));
      addExportLayerItem(
        "screen:" + screenKey,
        sanitizeExportName(screenLayerName, "电视画面-" + (screenIndex + 1)) +
          "." +
          EXPORT_IMAGE_EXTENSION2,
        "该电视的独立开启透明层",
      );
    },
  ),
    deps.listChargingRows(wl2).forEach(
      ({
        floor: vehicleLayerFloor,
        item: renderExportLayersVehicleItem,
        index: vehicleIndex,
        key: vehicleKey,
      }: any) => {
        const vehicleLayerName =
          "" +
          (wl2.length > 1 ? vehicleLayerFloor.name + "-" : "") +
          (renderExportLayersVehicleItem.chargingLayerName || "汽车充电 " + (vehicleIndex + 1));
        addExportLayerItem(
          "vehicle:" + vehicleKey,
          sanitizeExportName(vehicleLayerName, "汽车充电-" + (vehicleIndex + 1)) +
            "." +
            EXPORT_IMAGE_EXTENSION2,
          "该汽车的独立充电光效层",
        );
      },
    ),
    deps.listLightGroupRows(wl2).forEach(
      ({
        floor: groupLayerFloor,
        group: layerLightGroup,
        index: groupIndex,
        key: groupLayerKey,
      }: any) => {
        const groupLayerName =
          "" +
          (wl2.length > 1 ? groupLayerFloor.name + "-" : "") +
          (layerLightGroup.name || "灯组-" + (groupIndex + 1));
        addExportLayerItem(
          "group:" + groupLayerKey,
          sanitizeExportName(groupLayerName, "灯组-" + (groupIndex + 1)) +
            "." +
            EXPORT_IMAGE_EXTENSION2,
          "该灯组的透明光效层",
        );
      },
    ),
    deps.exportGroupFilesElement.replaceChildren(...exportLayerItems));
}

export function sanitizeExportName(rawExportName: any, fallbackName: any) {
  return (
    String(rawExportName || "")
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || fallbackName
  );
}
