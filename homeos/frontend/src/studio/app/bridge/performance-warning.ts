import { normalizeGroundReflection as normalizeGroundReflection } from "./reflection-settings";
export function performanceWarnings(currentProperties: any, nextProperties: any) {
  const warningMessages: any[] = [];
  if (
    (nextProperties.renderScale > 1 &&
      nextProperties.renderScale > (currentProperties.renderScale ?? 1) &&
      warningMessages.push("高清渲染需要处理更多画面像素。"),
    nextProperties.motionRenderScale >= 0.8 &&
      nextProperties.motionRenderScale > (currentProperties.motionRenderScale ?? 0) &&
      warningMessages.push("较高的转动分辨率会增加旋转和聚焦过渡时的绘制开销。"),
    nextProperties.groundReflection)
  ) {
    const currentReflection = normalizeGroundReflection(currentProperties.groundReflection),
      nextReflection = normalizeGroundReflection(nextProperties.groundReflection),
      resolveReflectionLevel = (reflectionSettings: any) =>
        reflectionSettings.strength === 0 || reflectionSettings.mode === "off"
          ? 0
          : reflectionSettings.mode === "all"
            ? 2
            : 1,
      currentReflectionLevel = resolveReflectionLevel(currentReflection),
      nextReflectionLevel = resolveReflectionLevel(nextReflection);
    (nextReflectionLevel > currentReflectionLevel &&
      warningMessages.push(
        nextReflectionLevel === 2
          ? "室内和室外同时反射，需要额外绘制两组倒影。"
          : "地面反射需要额外绘制倒影。",
      ),
      nextReflectionLevel &&
        nextReflection.resolution > 512 &&
        (nextReflection.resolution > currentReflection.resolution || !currentReflectionLevel) &&
        warningMessages.push("高反射清晰度会增加倒影的绘制开销和显存占用。"));
  }
  return warningMessages;
}
export function confirmPerformanceWarning(
  warningLines: string[],
  {
    document: contentDocument = document,
    signal: abortSignal,
  }: { document?: Document; signal?: AbortSignal } = {},
) {
  return warningLines.length
    ? abortSignal?.aborted
      ? Promise.resolve(false)
      : new Promise((resolve) => {
          const dialogElement = contentDocument.createElement("dialog");
          ((dialogElement.className = "settings-dialog i3d-performance-dialog"),
            dialogElement.setAttribute("aria-labelledby", "i3d-performance-title"),
            dialogElement.setAttribute("aria-describedby", "i3d-performance-description"));
          const titleElement = contentDocument.createElement("h2");
          ((titleElement.id = "i3d-performance-title"),
            (titleElement.textContent = "画质与流畅度提示"));
          const descriptionElement = contentDocument.createElement("div");
          descriptionElement.id = "i3d-performance-description";
          for (const warningText of warningLines) {
            const paragraphElement = contentDocument.createElement("p");
            ((paragraphElement.textContent = warningText),
              descriptionElement.append(paragraphElement));
          }
          const noteElement = contentDocument.createElement("p");
          ((noteElement.className = "i3d-performance-note"),
            (noteElement.textContent =
              "手机、iPad 或性能较低的设备可能出现掉帧、发热或耗电增加。如果不够流畅，可以降低画质或关闭反射。"),
            descriptionElement.append(noteElement));
          const actionsElement = contentDocument.createElement("div");
          actionsElement.className = "dialog-actions";
          const cancelButton = contentDocument.createElement("button"),
            confirmButton = contentDocument.createElement("button");
          ((cancelButton.type = confirmButton.type = "button"),
            (cancelButton.textContent = "取消"),
            (confirmButton.textContent = "继续应用"),
            (confirmButton.className = "primary"),
            actionsElement.append(cancelButton, confirmButton),
            dialogElement.append(titleElement, descriptionElement, actionsElement));
          let isSettled = false;
          const handleDecision = (shouldApply: any) => {
              isSettled ||
                ((isSettled = true),
                abortSignal?.removeEventListener("abort", handleCancel),
                dialogElement.close(),
                dialogElement.remove(),
                resolve(shouldApply));
            },
            handleCancel = () => handleDecision(false);
          (cancelButton.addEventListener("click", handleCancel),
            confirmButton.addEventListener("click", () => handleDecision(true)),
            dialogElement.addEventListener("cancel", (cancelEvent) => {
              (cancelEvent.preventDefault(), handleDecision(false));
            }),
            dialogElement.addEventListener("close", () => handleDecision(false)),
            abortSignal?.addEventListener("abort", handleCancel, {
              once: true,
            }),
            contentDocument.body.append(dialogElement),
            dialogElement.showModal(),
            cancelButton.focus());
        })
    : Promise.resolve(true);
}
