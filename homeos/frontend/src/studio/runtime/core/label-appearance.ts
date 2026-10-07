export function backgroundOpacity(value: any) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}
export function appendBackgroundOpacityControl(containerElement: any, target: any, key: any, onChange: any) {
  const documentNode = containerElement.ownerDocument,
    labelElement = documentNode.createElement("label"),
    spanElement = documentNode.createElement("span"),
    inputElement = documentNode.createElement("input"),
    noteElement = documentNode.createElement("p");
  (Object.assign(inputElement, {
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(Math.round(backgroundOpacity(target[key]) * 100)),
  }),
    inputElement.setAttribute("aria-label", "背景不透明度"));
  const syncLabel = () => {
    spanElement.textContent = "背景不透明度（" + inputElement.value + "%）";
  };
  return (
    inputElement.addEventListener("input", () => {
      ((target[key] = Number(inputElement.value) / 100), syncLabel(), onChange());
    }),
    syncLabel(),
    labelElement.append(spanElement, inputElement),
    (noteElement.className = "i3d-note"),
    (noteElement.textContent = "仅调整背景，文字与图标不变。0% 背景完全透明，100% 背景完全显示。"),
    containerElement.append(labelElement, noteElement),
    inputElement
  );
}
