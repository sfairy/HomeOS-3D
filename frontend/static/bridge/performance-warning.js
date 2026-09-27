/**
 * 画质设置的性能告警。
 */
import { normalizeGroundReflection as normalizeReflection } from "./reflection-settings.js?v=2609271226";
/**
 * 比较新旧设置，列出「变更后会更容易掉帧」的项目。
 */
export function performanceWarnings(currentProperties, pendingProperties) {
  const warningList = [];
  if (
    (currentProperties.lightingMode === "region" &&
      pendingProperties.lightingMode === "standard" &&
      warningList.push(
        "标准光影需要计算更多实时光照与阴影。"
      ),
    pendingProperties.renderScale > 1 &&
      pendingProperties.renderScale > (currentProperties.renderScale ?? 1) &&
      warningList.push(
        "高清渲染需要处理更多画面像素。"
      )),
    pendingProperties.motionRenderScale >= 0.8 &&
      pendingProperties.motionRenderScale > (currentProperties.motionRenderScale ?? 0) &&
      warningList.push(
        "较高的转动分辨率会增加旋转和聚焦过渡时的绘制开销。"
      ),
    pendingProperties.groundReflection
  ) {
    const currentReflection = normalizeReflection(currentProperties.groundReflection),
      pendingReflection = normalizeReflection(pendingProperties.groundReflection),
      reflectionCost = reflection =>
        reflection.strength === 0 || reflection.mode === "off"
          ? 0
          : reflection.mode === "all"
            ? 2
            : 1,
      currentReflectionCost = reflectionCost(currentReflection),
      pendingReflectionCost = reflectionCost(pendingReflection);
    // 只在与当前档位对比确实变贵时才提示；
    (pendingReflectionCost > currentReflectionCost &&
      warningList.push(
        pendingReflectionCost === 2
          ? "室内和室外同时反射，需要额外绘制两组倒影。"
          : "地面反射需要额外绘制倒影。"
      ),
      pendingReflectionCost &&
        pendingReflection.resolution > 512 &&
        (pendingReflection.resolution > currentReflection.resolution || !currentReflectionCost) &&
        warningList.push(
          "高反射清晰度会增加倒影的绘制开销和显存占用。"
        ));
  }
  return warningList;
}
/**
 * 用模态弹窗征求用户对性能告警的确认。
 */
export function confirmPerformanceWarning(
  warnings,
  { document: documentRef = document, signal: signal } = {}
) {
  // 无告警直接放行；已经有中止信号时连弹窗都不必创建。
  return warnings.length
    ? signal?.aborted
      ? Promise.resolve(!1)
      : new Promise(resolve => {
          // 用原生 <dialog> + showModal：自带焦点陷阱、Esc 关闭与顶层层叠，不必自己搭模态层。
          const dialogElement = documentRef.createElement("dialog");
          // aria-labelledby / describedby 指向下面的标题与说明，保证读屏器能完整朗读告警内容。
          ((dialogElement.className = "settings-dialog i3d-performance-dialog"),
            dialogElement.setAttribute("aria-labelledby", "i3d-performance-title"),
            dialogElement.setAttribute("aria-describedby", "i3d-performance-description"));
          const titleElement = documentRef.createElement("h2");
          ((titleElement.id = "i3d-performance-title"),
            (titleElement.textContent = "画质与流畅度提示"));
          const descriptionElement = documentRef.createElement("div");
          descriptionElement.id = "i3d-performance-description";
          for (const warning of warnings) {
            const paragraphElement = documentRef.createElement("p");
            ((paragraphElement.textContent = warning), descriptionElement.append(paragraphElement));
          }
          const noteElement = documentRef.createElement("p");
          ((noteElement.className = "i3d-performance-note"),
            (noteElement.textContent =
              "手机、iPad 或性能较低的设备可能出现掉帧、发热或耗电增加。如果不够流畅，可以降低画质或关闭反射。"),
            descriptionElement.append(noteElement));
          const actionsElement = documentRef.createElement("div");
          actionsElement.className = "dialog-actions";
          const cancelButtonElement = documentRef.createElement("button"),
            confirmButtonElement = documentRef.createElement("button");
          ((cancelButtonElement.type = confirmButtonElement.type = "button"),
            (cancelButtonElement.textContent = "取消"),
            (confirmButtonElement.textContent = "继续应用"),
            (confirmButtonElement.className = "primary"),
            actionsElement.append(cancelButtonElement, confirmButtonElement),
            dialogElement.append(titleElement, descriptionElement, actionsElement));
          // settle 必须幂等：取消按钮、Esc、外部 abort 可能相继触发，只有第一次的结果算数。
          let isSettled = !1;
          // 唯一的结果出口：关闭并移除 <dialog>、摘掉 abort 监听后，以 result（true = 继续
          const settle = result => {
              isSettled ||
                ((isSettled = !0),
                signal?.removeEventListener("abort", handleCancel),
                dialogElement.close(),
                dialogElement.remove(),
                resolve(result));
            },
            handleCancel = () => settle(!1);
          (cancelButtonElement.addEventListener("click", handleCancel),
            confirmButtonElement.addEventListener("click", () => settle(!0)),
            dialogElement.addEventListener("cancel", event => {
              (event.preventDefault(), settle(!1));
            }),
            dialogElement.addEventListener("close", () => settle(!1)),
            signal?.addEventListener("abort", handleCancel, { once: !0 }),
            documentRef.body.append(dialogElement),
            dialogElement.showModal(),
            cancelButtonElement.focus());
        })
    : Promise.resolve(!0);
}
