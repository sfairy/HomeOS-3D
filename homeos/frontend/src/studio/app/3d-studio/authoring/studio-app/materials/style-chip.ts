
export function createMaterialStyleChip(styleId: any, styleLabel: any, swatchColors: any, isCustom: any) {
  const styleChip = document.createElement("button"),
    swatchStrip = document.createElement("span"),
    labelElement = document.createElement("span");
  return (
    (styleChip.type = "button"),
    (styleChip.className = "material-style-chip" + (isCustom ? " is-custom" : "")),
    (styleChip.dataset.materialStyleId = styleId),
    styleChip.setAttribute("role", "radio"),
    styleChip.setAttribute("aria-checked", "false"),
    styleChip.setAttribute("tabindex", "-1"),
    (styleChip.title = styleLabel + (isCustom ? "（个人预设）" : "")),
    (swatchStrip.className = "material-style-chip-swatches"),
    swatchStrip.append(
      ...swatchColors.map((swatchColor: any) => {
        const swatchCell = document.createElement("i");
        return ((swatchCell.style.background = swatchColor), swatchCell);
      }),
    ),
    (labelElement.className = "material-style-chip-label"),
    (labelElement.textContent = styleLabel),
    styleChip.append(swatchStrip, labelElement),
    styleChip
  );
}
