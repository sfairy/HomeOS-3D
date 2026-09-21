/**
 * 工作室表单控件的外观增强（自定义下拉框与数字步进器）。
 *
 * 属性面板大量使用原生 <select> 与 <input type="number">，本模块在原地把它们包装成可编排
 * 样式的 DOM。原生控件仍保留在 DOM 中并作为唯一「值来源」，只是被隐藏（tabIndex = -1 且
 * aria-hidden）；所有交互最终回写原生控件并派发 input / change，已有业务监听器无需改动。
 */

import { capturePointer } from "../../utils/pointer-capture.js?v=20260921192957";

// 原生 select → 控制器记录的映射；openController 记录当前展开的那个（全局同时只允许一个）。
const controllersBySelect = new Map();
let openController = null;

/**
 * 收起指定的下拉框（默认收起当前展开的那个）。
 */
function closeStudioSelect(targetController = openController) {
  if (targetController) {
    targetController.wrapper.classList.remove("open");
    // aria-expanded 必须与实际可见性同步，否则读屏用户会听到错误的展开状态。
    targetController.trigger.setAttribute("aria-expanded", "false");
    targetController.menu.hidden = true;
    if (openController === targetController) {
      openController = null;
    }
  }
}

/**
 * 把原生 select 的当前状态同步到自定义控件上。
 */
export function syncStudioSelect(selectElement) {
  const selectController = controllersBySelect.get(selectElement);
  if (!selectController) {
    return;
  }
  // 取显示文本的三级兜底：优先标准接口，其次按 selectedIndex 取，
  // 最后退回第一项 —— 浏览器对「无选中项」的处理并不一致。
  const selectedOptionElement =
    selectElement.selectedOptions?.[0] ||
    selectElement.options[selectElement.selectedIndex] ||
    selectElement.options[0];
  selectController.trigger.textContent = selectedOptionElement?.textContent || "请选择";
  selectController.trigger.disabled = selectElement.disabled;
  // aria-disabled 用字符串写：属性值只能是字符串。
  selectController.trigger.setAttribute("aria-disabled", String(selectElement.disabled));
  // 整体重建菜单项（而不是做 diff）：选项数量少，重建更简单且不会残留旧节点。
  selectController.menu.replaceChildren(
    ...[...selectElement.options].map(optionElement => {
      const optionButtonElement = document.createElement("button");
      optionButtonElement.type = "button";
      optionButtonElement.className = "studio-select-option";
      optionButtonElement.textContent = optionElement.textContent;
      optionButtonElement.dataset.value = optionElement.value;
      optionButtonElement.disabled = optionElement.disabled;
      optionButtonElement.setAttribute("role", "option");
      optionButtonElement.setAttribute(
        "aria-selected",
        String(optionElement.value === selectElement.value)
      );
      optionButtonElement.classList.toggle("selected", optionElement.value === selectElement.value);
      optionButtonElement.addEventListener("click", optionClickEvent => {
        // 阻止默认与冒泡：菜单项在 wrapper 内部，冒泡会再次触发 trigger 的开合逻辑。
        optionClickEvent.preventDefault();
        optionClickEvent.stopPropagation();
        if (!optionElement.disabled) {
          selectElement.value = optionElement.value;
          syncStudioSelect(selectElement);
          closeStudioSelect(selectController);
          // 派发冒泡的 change 事件，等价于用户直接操作原生控件。
          selectElement.dispatchEvent(
            new Event("change", {
              bubbles: true
            })
          );
          // 焦点归还给触发器，保证键盘用户不会掉进隐藏的原生控件里。
          selectController.trigger.focus();
        }
      });
      return optionButtonElement;
    })
  );
  // 控件被禁用时顺手收起：保留一个打不开又占位的展开菜单会让人困惑。
  if (selectElement.disabled) {
    closeStudioSelect(selectController);
  }
}

/**
 * 把单个原生 select 增强成自定义下拉框（幂等，重复调用不会重复包装）。
 */
function enhanceStudioSelect(hostSelectElement) {
  if (!hostSelectElement || controllersBySelect.has(hostSelectElement)) {
    return;
  }
  const wrapperElement = document.createElement("div");
  wrapperElement.className = "studio-select";
  // 把原生控件挪进包装层内：保持它仍在同一表单 / 同一布局位置，只是不可见。
  hostSelectElement.before(wrapperElement);
  wrapperElement.append(hostSelectElement);
  hostSelectElement.classList.add("studio-native-select");
  hostSelectElement.tabIndex = -1;
  hostSelectElement.setAttribute("aria-hidden", "true");
  const triggerElement = document.createElement("button");
  triggerElement.type = "button";
  triggerElement.className = "studio-select-trigger";
  triggerElement.setAttribute("aria-haspopup", "listbox");
  triggerElement.setAttribute("aria-expanded", "false");
  const menuElement = document.createElement("div");
  menuElement.className = "studio-select-menu";
  // 菜单 id 优先复用原生控件的 id，便于上层用 label 的 for 属性定位；
  // 没有 id 时用当前控制器数量生成一个稳定后缀。
  menuElement.id =
    (hostSelectElement.id || "studio-select-" + (controllersBySelect.size + 1)) + "-menu";
  menuElement.setAttribute("role", "listbox");
  menuElement.hidden = true;
  triggerElement.setAttribute("aria-controls", menuElement.id);
  wrapperElement.append(triggerElement, menuElement);
  const controllerRecord = {
    select: hostSelectElement,
    wrapper: wrapperElement,
    trigger: triggerElement,
    menu: menuElement
  };
  controllersBySelect.set(hostSelectElement, controllerRecord);
  triggerElement.addEventListener("click", triggerClickEvent => {
    triggerClickEvent.preventDefault();
    triggerClickEvent.stopPropagation();
    if (!hostSelectElement.disabled) {
      // 再次点击同一个触发器表示收起（toggle 语义）。
      if (openController === controllerRecord) {
        closeStudioSelect(controllerRecord);
        return;
      }
      // 展开前先关掉其它已展开的下拉，保证同一时刻只有一个菜单可见。
      closeStudioSelect();
      syncStudioSelect(hostSelectElement);
      wrapperElement.classList.add("open");
      triggerElement.setAttribute("aria-expanded", "true");
      menuElement.hidden = false;
      openController = controllerRecord;
    }
  });
  hostSelectElement.addEventListener("change", () => syncStudioSelect(hostSelectElement));
  // 选项由外部代码动态增删，用 MutationObserver 兜住所有改动，
  // 避免要求每个调用点都记得手动调用同步函数。
  new MutationObserver(() => syncStudioSelect(hostSelectElement)).observe(hostSelectElement, {
    childList: true,
    subtree: true,
    attributes: true
  });
  syncStudioSelect(hostSelectElement);
}

/**
 * 增强根节点下所有原生下拉框，并注册全局的收起交互。
 */
export function initializeStudioSelects(rootElement = document) {
  for (const discoveredSelect of rootElement.querySelectorAll("select")) {
    enhanceStudioSelect(discoveredSelect);
  }
  // 点击菜单与触发器之外的任何位置都收起；用 pointerdown 而不是 click，
  // 这样在拖拽 / 触屏手势开始时就能收起，反应更跟手。
  rootElement.addEventListener("pointerdown", pointerEvent => {
    if (openController && !openController.wrapper.contains(pointerEvent.target)) {
      closeStudioSelect();
    }
  });
  rootElement.addEventListener("keydown", keydownEvent => {
    if (keydownEvent.key !== "Escape" || !openController) {
      return;
    }
    // 拦下 Escape：避免它继续冒泡去关闭外层的弹窗。
    keydownEvent.preventDefault();
    keydownEvent.stopPropagation();
    const triggerToFocus = openController.trigger;
    closeStudioSelect();
    triggerToFocus.focus();
  });
}

/**
 * 同步步进按钮的禁用态。
 * 只读输入框同样要禁用步进按钮：stepUp / stepDown 对 readonly 无效，留着按钮会点了没反应。
 */
function syncStepperButtonsDisabled(stepperInput, stepperButtons) {
  const isStepperDisabled = stepperInput.disabled || stepperInput.readOnly;
  for (const stepperButton of stepperButtons) {
    stepperButton.disabled = isStepperDisabled;
  }
  stepperInput.closest(".number-stepper")?.classList.toggle("is-disabled", isStepperDisabled);
}

/**
 * 给数字输入框加上下步进按钮（幂等）。
 */
function enhanceNumberInput(numberInput) {
  if (!numberInput || numberInput.closest(".number-stepper")) {
    return;
  }
  const stepperWrapperElement = document.createElement("span");
  stepperWrapperElement.className = "number-stepper";
  numberInput.before(stepperWrapperElement);
  stepperWrapperElement.append(numberInput);
  const stepperButtonsContainer = document.createElement("span");
  stepperButtonsContainer.className = "number-stepper-buttons";
  const stepperButtonDefinitions = [
    {
      direction: "up",
      label: "增加数值"
    },
    {
      direction: "down",
      label: "减小数值"
    }
  ].map(({ direction: stepDirection, label: buttonLabel }) => {
    const stepperButtonElement = document.createElement("button");
    stepperButtonElement.type = "button";
    stepperButtonElement.className = "number-stepper-button number-stepper-" + stepDirection;
    // 图标按钮没有文本，必须给无障碍标签与 title。
    stepperButtonElement.setAttribute("aria-label", buttonLabel);
    stepperButtonElement.title = buttonLabel;
    // 单次步进：返回是否真的改变了值，供长按结束决定要不要补发 change 事件。
    const stepOnce = () => {
      if (numberInput.disabled || numberInput.readOnly) {
        return false;
      }
      const previousValue = numberInput.value;
      try {
        if (stepDirection === "up") {
          numberInput.stepUp();
        } else {
          numberInput.stepDown();
        }
      } catch {
        // 非法 step / 空值等情况下浏览器可能抛错，此处静默按「未改变」处理。
        return false;
      }
      if (numberInput.value === previousValue) {
        return false;
      } else {
        // 每次步进都派发 input 事件，让面板上的联动（例如尺寸预览）实时刷新；
        // change 事件留到整段操作结束时再发，避免长按连点时事件风暴。
        numberInput.dispatchEvent(
          new Event("input", {
            bubbles: true
          })
        );
        return true;
      }
    };
    stepperButtonElement.addEventListener("click", buttonClickEvent => {
      // 键盘触发 click 时不做任何事：实际的步进逻辑挂在 pointerdown 上，
      // 这里只阻止按钮抢走焦点与默认行为。
      buttonClickEvent.preventDefault();
      buttonClickEvent.stopPropagation();
    });
    stepperButtonElement.addEventListener("pointerdown", pointerDownEvent => {
      // 只响应鼠标左键或触摸 / 笔的主按键。
      if (pointerDownEvent.button !== 0 || numberInput.disabled || numberInput.readOnly) {
        return;
      }
      pointerDownEvent.preventDefault();
      pointerDownEvent.stopPropagation();
      // 焦点给输入框而不是按钮：用户连点后可以直接继续键入。
      numberInput.focus({
        preventScroll: true
      });
      let didStep = stepOnce();
      let isPointerReleased = false;
      // 长按加速：先等 320 毫秒（区分单击与长按），随后每 55 毫秒步进一次。
      let repeatTimerId = window.setTimeout(() => {
        repeatTimerId = window.setInterval(() => {
          didStep = stepOnce() || didStep;
        }, 55);
      }, 320);
      // 长按收尾：清掉加速定时器并解绑三个结束事件（up / cancel / lostpointercapture）。
      const handleRepeatEnd = () => {
        // 用标志位保证只收尾一次：pointerup / pointercancel / lostpointercapture 可能都触发。
        if (!isPointerReleased) {
          isPointerReleased = true;
          // 同一个 id 可能对应 timeout 也可能对应 interval，两个都清掉更稳妥。
          window.clearTimeout(repeatTimerId);
          window.clearInterval(repeatTimerId);
          stepperButtonElement.removeEventListener("pointerup", handleRepeatEnd);
          stepperButtonElement.removeEventListener("pointercancel", handleRepeatEnd);
          stepperButtonElement.removeEventListener("lostpointercapture", handleRepeatEnd);
          if (didStep) {
            numberInput.dispatchEvent(
              new Event("change", {
                bubbles: true
              })
            );
          }
        }
      };
      stepperButtonElement.addEventListener("pointerup", handleRepeatEnd);
      stepperButtonElement.addEventListener("pointercancel", handleRepeatEnd);
      stepperButtonElement.addEventListener("lostpointercapture", handleRepeatEnd);
      // 捕获指针：鼠标按住后移出按钮仍能收到 pointerup，否则长按会停不下来。
      capturePointer(stepperButtonElement, pointerDownEvent.pointerId);
    });
    stepperButtonsContainer.append(stepperButtonElement);
    return stepperButtonElement;
  });
  stepperWrapperElement.append(stepperButtonsContainer);
  // 只监听 disabled / readonly 两个属性：观察全部属性会在样式类频繁变动时产生无谓回调。
  new MutationObserver(() =>
    syncStepperButtonsDisabled(numberInput, stepperButtonDefinitions)
  ).observe(numberInput, {
    attributes: true,
    attributeFilter: ["disabled", "readonly"]
  });
  syncStepperButtonsDisabled(numberInput, stepperButtonDefinitions);
}

/**
 * 增强容器内所有数字输入框。
 */
export function initializeNumberInputs(containerElement = document) {
  for (const numberInputElement of containerElement.querySelectorAll('input[type="number"]')) {
    enhanceNumberInput(numberInputElement);
  }
}
