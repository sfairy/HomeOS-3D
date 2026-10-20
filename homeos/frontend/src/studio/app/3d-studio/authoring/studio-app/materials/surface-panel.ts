import { syncHtmlRangeProgress as syncHtmlRangeProgress2 } from "../../../../shared/util/range-progress";

export function createMaterialSlotSurfacePanel(slotEntry: any, isSurfaceExpanded: any) {
  const surfacePanelElement = document.createElement("div");
  surfacePanelElement.className = "material-slot-surface";
  surfacePanelElement.dataset.materialSlotSurface = slotEntry.name;
  surfacePanelElement.hidden = !isSurfaceExpanded;
  for (const surfaceField of [
    { key: "roughness", label: "粗糙度", value: slotEntry.roughness },
    { key: "metalness", label: "金属度", value: slotEntry.metalness },
  ]) {
    const fieldLabelElement = document.createElement("label"),
      rangeInputElement = document.createElement("input"),
      outputElement = document.createElement("output");
    ((fieldLabelElement.className = "material-slot-surface-field"),
      (fieldLabelElement.textContent = surfaceField.label),
      (rangeInputElement.type = "range"),
      (rangeInputElement.min = "0"),
      (rangeInputElement.max = "1"),
      (rangeInputElement.step = "0.01"),
      (rangeInputElement.value = String(
        Math.min(1, Math.max(0, Number(surfaceField.value) || 0)),
      )),
      (rangeInputElement.dataset.materialSlotSurfaceKey = surfaceField.key),
      (rangeInputElement.dataset.materialSlotSurfaceName = slotEntry.name),
      /* 统一滑条观感（几何/配色）由 main.css 的 `hos-range-ui` 提供，本处不再写几何。 */
      rangeInputElement.classList.add("hos-range-ui"),
      (outputElement.textContent = Number(rangeInputElement.value).toFixed(2)),
      /* 自绘轨道靠 `--progress-pct` 铺左侧金色段：初值先写一次，否则整条都是灰槽。 */
      syncHtmlRangeProgress2(rangeInputElement),
      fieldLabelElement.append(rangeInputElement, outputElement),
      surfacePanelElement.append(fieldLabelElement));
  }
  const surfaceResetButton = document.createElement("button");
  return (
    (surfaceResetButton.type = "button"),
    (surfaceResetButton.className = "material-slot-surface-reset"),
    (surfaceResetButton.dataset.materialSlotSurfaceReset = slotEntry.name),
    (surfaceResetButton.textContent = "跟随档位（清除这两项改动）"),
    surfacePanelElement.append(surfaceResetButton),
    surfacePanelElement
  );
}
