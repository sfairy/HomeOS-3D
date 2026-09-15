/**
 * 画质设置的性能告警。
 *
 * 位置：设置面板在「应用」之前调用 performanceWarnings 收集提示，必要时用
 *   confirmPerformanceWarning 弹窗征求确认 —— 这些设置本身合法，只是可能让低端设备掉帧。
 * 对外导出：performanceWarnings、confirmPerformanceWarning。
 * 全局约定：告警文案是面向用户的界面文案，由本文件统一产出（未做 i18n），
 *   调用方不要拆分或改写；弹窗的 class / id 前缀 `i3d-performance-` 与样式表约定死。
 * 副作用：confirmPerformanceWarning 会向 document.body 插入并移除 <dialog> 节点。
 */
import { normalizeGroundReflection as normalizeReflection } from "./reflection-settings.js";
/**
 * 比较新旧设置，列出「变更后会更容易掉帧」的项目。
 *
 * 只提示「变贵」的方向（例如分辨率调高、开启反射），调低画质不会产生任何告警。
 *
 * @param {object} currentProperties 当前组件属性。
 * @param {object} pendingProperties 待应用的组件属性。
 * @returns {string[]} 告警文案列表；为空表示可以直接应用。
 */
export function performanceWarnings(currentProperties, pendingProperties) {
  const warningList = [];
  // 三个代价阈值自上而下检查：标准光影比轻量柔光贵、renderScale 超过 1 属超采样、
  // motionRenderScale 达到 0.8 会让转动与聚焦过渡期间的绘制量显著上升。
  if (
    (currentProperties.lightingMode === "region" &&
      pendingProperties.lightingMode === "standard" &&
      warningList.push(
        "\u6807\u51C6\u5149\u5F71\u9700\u8981\u8BA1\u7B97\u66F4\u591A\u5B9E\u65F6\u5149\u7167\u4E0E\u9634\u5F71\u3002"
      ),
    pendingProperties.renderScale > 1 &&
      pendingProperties.renderScale > (currentProperties.renderScale ?? 1) &&
      warningList.push(
        "\u9AD8\u6E05\u6E32\u67D3\u9700\u8981\u5904\u7406\u66F4\u591A\u753B\u9762\u50CF\u7D20\u3002"
      ),
    pendingProperties.motionRenderScale >= 0.8 &&
      pendingProperties.motionRenderScale > (currentProperties.motionRenderScale ?? 0) &&
      warningList.push(
        "\u8F83\u9AD8\u7684\u8F6C\u52A8\u5206\u8FA8\u7387\u4F1A\u589E\u52A0\u65CB\u8F6C\u548C\u805A\u7126\u8FC7\u6E21\u65F6\u7684\u7ED8\u5236\u5F00\u9500\u3002"
      ),
    pendingProperties.groundReflection)
  ) {
    // 反射代价分三档：关闭或强度为 0 不计；单侧反射记 1；室内外同时反射记 2（多绘一组倒影）。
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
    // 第二条额外要求分辨率越过 512 档位（且当前不是没开反射），否则半档微调不值得打扰用户。
    (pendingReflectionCost > currentReflectionCost &&
      warningList.push(
        pendingReflectionCost === 2
          ? "\u5BA4\u5185\u548C\u5BA4\u5916\u540C\u65F6\u53CD\u5C04\uFF0C\u9700\u8981\u989D\u5916\u7ED8\u5236\u4E24\u7EC4\u5012\u5F71\u3002"
          : "\u5730\u9762\u53CD\u5C04\u9700\u8981\u989D\u5916\u7ED8\u5236\u5012\u5F71\u3002"
      ),
      pendingReflectionCost &&
        pendingReflection.resolution > 512 &&
        (pendingReflection.resolution > currentReflection.resolution || !currentReflectionCost) &&
        warningList.push(
          "\u9AD8\u53CD\u5C04\u6E05\u6670\u5EA6\u4F1A\u589E\u52A0\u5012\u5F71\u7684\u7ED8\u5236\u5F00\u9500\u548C\u663E\u5B58\u5360\u7528\u3002"
        ));
  }
  return warningList;
}
/**
 * 用模态弹窗征求用户对性能告警的确认。
 *
 * @param {string[]} warnings performanceWarnings 产出的告警文案。
 * @param {object} [options] 选项。
 * @param {Document} [options.document] 文档对象，默认全局 document（可注入以便测试）。
 * @param {AbortSignal} [options.signal] 外部取消信号；已中止时直接返回 false，且中止后立即按取消收尾。
 * @returns {Promise<boolean>} true 表示用户确认继续，false 表示取消（或已被中止）。
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
            (titleElement.textContent = "\u753B\u8D28\u4E0E\u6D41\u7545\u5EA6\u63D0\u793A"));
          const descriptionElement = documentRef.createElement("div");
          descriptionElement.id = "i3d-performance-description";
          for (const warning of warnings) {
            const paragraphElement = documentRef.createElement("p");
            ((paragraphElement.textContent = warning), descriptionElement.append(paragraphElement));
          }
          const noteElement = documentRef.createElement("p");
          ((noteElement.className = "i3d-performance-note"),
            (noteElement.textContent =
              "\u624B\u673A\u3001iPad \u6216\u6027\u80FD\u8F83\u4F4E\u7684\u8BBE\u5907\u53EF\u80FD\u51FA\u73B0\u6389\u5E27\u3001\u53D1\u70ED\u6216\u8017\u7535\u589E\u52A0\u3002\u5982\u679C\u4E0D\u591F\u6D41\u7545\uFF0C\u53EF\u4EE5\u964D\u4F4E\u753B\u8D28\u6216\u5173\u95ED\u53CD\u5C04\u3002"),
            descriptionElement.append(noteElement));
          const actionsElement = documentRef.createElement("div");
          actionsElement.className = "dialog-actions";
          const cancelButtonElement = documentRef.createElement("button"),
            confirmButtonElement = documentRef.createElement("button");
          ((cancelButtonElement.type = confirmButtonElement.type = "button"),
            (cancelButtonElement.textContent = "\u53D6\u6D88"),
            (confirmButtonElement.textContent = "\u7EE7\u7EED\u5E94\u7528"),
            (confirmButtonElement.className = "primary"),
            actionsElement.append(cancelButtonElement, confirmButtonElement),
            dialogElement.append(titleElement, descriptionElement, actionsElement));
          // settle 必须幂等：取消按钮、Esc、外部 abort 可能相继触发，只有第一次的结果算数。
          let isSettled = !1;
          // 唯一的结果出口：关闭并移除 <dialog>、摘掉 abort 监听后，以 result（true = 继续
          // 应用）决议 Promise；幂等由外层 isSettled 把关，只有第一次调用算数。
          const settle = result => {
              isSettled ||
                ((isSettled = !0),
                signal?.removeEventListener("abort", handleCancel),
                dialogElement.close(),
                dialogElement.remove(),
                resolve(result));
            },
            handleCancel = () => settle(!1);
          // 事件绑定与挂载一次性完成：close 事件兜底为「取消」，因为 Esc 关闭只触发 close；
          // 由于 settle 幂等，用户点「继续应用」后再触发 close 不会推翻已定的结果。
          // 焦点主动交给取消按钮，让默认操作是「不改变画质」。
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
