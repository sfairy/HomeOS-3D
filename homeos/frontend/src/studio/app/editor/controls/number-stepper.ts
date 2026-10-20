/**
 * 检查器数字输入增强（± 步进器）—— 从 home.ts 单体切出。
 *
 * 语义提示：`formatLastSeen` 实为「给 inspector 数字输入套上 ± 步进器」（名字沿用历史），
 * `runRecord` 是单步加减的计算（纯函数、零依赖）。`enhancedNumberInputsSet` 是「已增强过」的
 * 去重 WeakSet，宿主按引用注入（切片只 `.has()` / `.add()`，不重新绑定）。
 */

import { clampNumber as clampNumber2 } from "../editor-utils";

function stepNumberInput(changedPagePathElement: any, stepDelta: any) {
  if (!changedPagePathElement || changedPagePathElement.disabled || changedPagePathElement.readOnly)
    return false;
  const dashboardName = changedPagePathElement.value;
  try {
    stepDelta > 0 ? changedPagePathElement.stepUp() : changedPagePathElement.stepDown();
  } catch {
    const shouldShowDisplayLinkState =
        Number(changedPagePathElement.dataset?.numberStep) ||
        Number(changedPagePathElement.step) ||
        1,
      shouldShowDisplayLinkValue = Number(changedPagePathElement.value) || 0,
      shouldShowDisplayLink =
        changedPagePathElement.min === "" ? -Infinity : Number(changedPagePathElement.min),
      dashboardDisplayUrl =
        changedPagePathElement.max === "" ? Infinity : Number(changedPagePathElement.max);
    changedPagePathElement.value = String(
      clampNumber2(
        shouldShowDisplayLinkValue + shouldShowDisplayLinkState * stepDelta,
        shouldShowDisplayLink,
        dashboardDisplayUrl,
      ),
    );
  }
  return changedPagePathElement.value === dashboardName
    ? false
    : (changedPagePathElement.dispatchEvent(
        new Event("input", {
          bubbles: true,
        }),
      ),
      true);
}

interface NumberStepperDeps {
  /** 「已装过步进器」的输入元素去重集合（宿主每实例一份，按引用注入）。 */
  enhancedNumberInputsSet: WeakSet<any>;
}

export function formatLastSeen(
  deps: NumberStepperDeps,
  lastSeenTimestamp: Document | HTMLElement = document,
) {
  const { enhancedNumberInputsSet } = deps;
  const lastSeenDate =
    lastSeenTimestamp instanceof HTMLInputElement && lastSeenTimestamp.type === "number"
      ? [lastSeenTimestamp]
      : [
          ...(lastSeenTimestamp.querySelectorAll?.<HTMLInputElement>(
            '.inspector-form input[type="number"], .i3d-editor input[type="number"], .i3d-vacuum-map-editor input[type="number"]',
          ) || []),
        ];
  for (const formatDisplayTokenExpiryElement of lastSeenDate) {
    if (enhancedNumberInputsSet.has(formatDisplayTokenExpiryElement)) continue;
    enhancedNumberInputsSet.add(formatDisplayTokenExpiryElement);
    const formatDisplayTokenExpiryElementElement = document.createElement("span");
    formatDisplayTokenExpiryElementElement.className = "inspector-number-control";
    const displayDeviceElement = document.createElement("span");
    displayDeviceElement.className = "inspector-number-steppers";
    const displayDeviceHandler = (displayDevice: any, loadDisplayPairingCodes: any, pairingCodes: any) => {
      const pairingsEmptyElement = document.createElement("button");
      return (
        (pairingsEmptyElement.type = "button"),
        (pairingsEmptyElement.tabIndex = -1),
        (pairingsEmptyElement.className = "inspector-number-stepper"),
        pairingsEmptyElement.setAttribute("aria-label", loadDisplayPairingCodes),
        (pairingsEmptyElement.innerHTML =
          '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="' +
          pairingCodes +
          '"></path></svg>'),
        pairingsEmptyElement.addEventListener("click", (pairingsEmptyElementState) =>
          pairingsEmptyElementState.preventDefault(),
        ),
        pairingsEmptyElement.addEventListener("pointerdown", (pairingsEmptyElementValue) => {
          if (
            pairingsEmptyElementValue.button !== 0 ||
            formatDisplayTokenExpiryElement.disabled ||
            formatDisplayTokenExpiryElement.readOnly
          )
            return;
          (pairingsEmptyElementValue.preventDefault(),
            formatDisplayTokenExpiryElement.focus({
              preventScroll: true,
            }));
          let np2 = stepNumberInput(formatDisplayTokenExpiryElement, displayDevice),
            isPairingsEmptyElement = false,
            setTimeout = window.setTimeout(() => {
              setTimeout = window.setInterval(() => {
                np2 = stepNumberInput(formatDisplayTokenExpiryElement, displayDevice) || np2;
              }, 55);
            }, 320);
          const pairingsEmptyElementHandler = () => {
            isPairingsEmptyElement ||
              ((isPairingsEmptyElement = true),
              window.clearTimeout(setTimeout),
              window.clearInterval(setTimeout),
              pairingsEmptyElement.removeEventListener("pointerup", pairingsEmptyElementHandler),
              pairingsEmptyElement.removeEventListener(
                "pointercancel",
                pairingsEmptyElementHandler,
              ),
              pairingsEmptyElement.removeEventListener(
                "lostpointercapture",
                pairingsEmptyElementHandler,
              ),
              np2 &&
                formatDisplayTokenExpiryElement.dispatchEvent(
                  new Event("change", {
                    bubbles: true,
                  }),
                ));
          };
          (pairingsEmptyElement.addEventListener("pointerup", pairingsEmptyElementHandler),
            pairingsEmptyElement.addEventListener("pointercancel", pairingsEmptyElementHandler),
            pairingsEmptyElement.addEventListener(
              "lostpointercapture",
              pairingsEmptyElementHandler,
            ));
          try {
            pairingsEmptyElement.setPointerCapture(pairingsEmptyElementValue.pointerId);
          } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
        }),
        pairingsEmptyElement
      );
    };
    (displayDeviceElement.append(
      displayDeviceHandler(1, "增加数值", "M1 5 5 1l4 4"),
      displayDeviceHandler(-1, "减少数值", "M1 1 5 5l4-4"),
    ),
      formatDisplayTokenExpiryElement.before(formatDisplayTokenExpiryElementElement),
      formatDisplayTokenExpiryElementElement.append(
        formatDisplayTokenExpiryElement,
        displayDeviceElement,
      ));
    let isPairingsEmptyElementActive = false;
    (formatDisplayTokenExpiryElement.addEventListener("keydown", (pairingsEmptyElementConfig) => {
      ["ArrowUp", "ArrowDown"].includes(pairingsEmptyElementConfig.key) &&
        (pairingsEmptyElementConfig.preventDefault(),
        (isPairingsEmptyElementActive =
          stepNumberInput(
            formatDisplayTokenExpiryElement,
            pairingsEmptyElementConfig.key === "ArrowUp" ? 1 : -1,
          ) || isPairingsEmptyElementActive));
    }),
      formatDisplayTokenExpiryElement.addEventListener("keyup", (pairingsEmptyElementRef) => {
        !["ArrowUp", "ArrowDown"].includes(pairingsEmptyElementRef.key) ||
          !isPairingsEmptyElementActive ||
          ((isPairingsEmptyElementActive = false),
          formatDisplayTokenExpiryElement.dispatchEvent(
            new Event("change", {
              bubbles: true,
            }),
          ));
      }));
  }
}
