const selectRecordsBySelect = new Map();
let openSelectRecord = null;
function closeStudioSelect(recordToClose = openSelectRecord) {
  recordToClose &&
    (recordToClose.wrapper.classList.remove("open"),
    recordToClose.trigger.setAttribute("aria-expanded", "false"),
    (recordToClose.menu.hidden = true),
    openSelectRecord === recordToClose && (openSelectRecord = null));
}
export function syncStudioSelect(selectElement) {
  const selectRecord = selectRecordsBySelect.get(selectElement);
  if (!selectRecord) return;
  const selectedOptionElement =
    selectElement.selectedOptions?.[0] ||
    selectElement.options[selectElement.selectedIndex] ||
    selectElement.options[0];
  ((selectRecord.trigger.textContent = selectedOptionElement?.textContent || "请选择"),
    (selectRecord.trigger.disabled = selectElement.disabled),
    selectRecord.trigger.setAttribute("aria-disabled", String(selectElement.disabled)),
    selectRecord.menu.replaceChildren(
      ...[...selectElement.options].map((optionElement) => {
        const optionButton = document.createElement("button");
        return (
          (optionButton.type = "button"),
          (optionButton.className = "studio-select-option"),
          (optionButton.textContent = optionElement.textContent),
          (optionButton.dataset.value = optionElement.value),
          (optionButton.disabled = optionElement.disabled),
          optionButton.setAttribute("role", "option"),
          optionButton.setAttribute(
            "aria-selected",
            String(optionElement.value === selectElement.value),
          ),
          optionButton.classList.toggle("selected", optionElement.value === selectElement.value),
          optionButton.addEventListener("click", (optionClickEvent) => {
            (optionClickEvent.preventDefault(),
              optionClickEvent.stopPropagation(),
              !optionElement.disabled &&
                ((selectElement.value = optionElement.value),
                syncStudioSelect(selectElement),
                closeStudioSelect(selectRecord),
                selectElement.dispatchEvent(
                  new Event("change", {
                    bubbles: true,
                  }),
                ),
                selectRecord.trigger.focus()));
          }),
          optionButton
        );
      }),
    ),
    selectElement.disabled && closeStudioSelect(selectRecord));
}
export function enhanceStudioSelect(nativeSelectElement) {
  if (!nativeSelectElement || selectRecordsBySelect.has(nativeSelectElement)) return;
  const wrapperElement = document.createElement("div");
  ((wrapperElement.className = "studio-select"),
    nativeSelectElement.before(wrapperElement),
    wrapperElement.append(nativeSelectElement),
    nativeSelectElement.classList.add("studio-native-select"),
    (nativeSelectElement.tabIndex = -1),
    nativeSelectElement.setAttribute("aria-hidden", "true"));
  const triggerButton = document.createElement("button");
  ((triggerButton.type = "button"),
    (triggerButton.className = "studio-select-trigger"),
    triggerButton.setAttribute("aria-haspopup", "listbox"),
    triggerButton.setAttribute("aria-expanded", "false"));
  const menuElement = document.createElement("div");
  ((menuElement.className = "studio-select-menu"),
    (menuElement.id =
      (nativeSelectElement.id || "studio-select-" + (selectRecordsBySelect.size + 1)) + "-menu"),
    menuElement.setAttribute("role", "listbox"),
    (menuElement.hidden = true),
    triggerButton.setAttribute("aria-controls", menuElement.id),
    wrapperElement.append(triggerButton, menuElement));
  const selectComponent: {
    select: any;
    wrapper: HTMLElement;
    trigger: HTMLElement;
    menu: HTMLElement;
    [key: string]: any;
  } = {
    select: nativeSelectElement,
    wrapper: wrapperElement,
    trigger: triggerButton,
    menu: menuElement,
  };
  (selectRecordsBySelect.set(nativeSelectElement, selectComponent),
    triggerButton.addEventListener("click", (triggerClickEvent) => {
      if (
        (triggerClickEvent.preventDefault(),
        triggerClickEvent.stopPropagation(),
        !nativeSelectElement.disabled)
      ) {
        if (openSelectRecord === selectComponent) {
          closeStudioSelect(selectComponent);
          return;
        }
        (closeStudioSelect(),
          syncStudioSelect(nativeSelectElement),
          wrapperElement.classList.add("open"),
          triggerButton.setAttribute("aria-expanded", "true"),
          (menuElement.hidden = false),
          (openSelectRecord = selectComponent));
      }
    }),
    nativeSelectElement.addEventListener("change", () => syncStudioSelect(nativeSelectElement)),
    (selectComponent.observer = new MutationObserver(() => syncStudioSelect(nativeSelectElement))),
    selectComponent.observer.observe(nativeSelectElement, {
      childList: true,
      subtree: true,
      attributes: true,
    }),
    syncStudioSelect(nativeSelectElement));
}
export function disposeStudioSelects(rootElement) {
  for (const enhancedSelect of rootElement.querySelectorAll("select")) {
    const boundSelectRecord = selectRecordsBySelect.get(enhancedSelect);
    boundSelectRecord &&
      (openSelectRecord === boundSelectRecord && closeStudioSelect(boundSelectRecord),
      boundSelectRecord.observer.disconnect(),
      selectRecordsBySelect.delete(enhancedSelect));
  }
}
export function initializeStudioSelects(containerElement = document) {
  for (const targetSelect of containerElement.querySelectorAll("select"))
    enhanceStudioSelect(targetSelect);
  (containerElement.addEventListener("pointerdown", (pointerDownEvent) => {
    openSelectRecord &&
      !openSelectRecord.wrapper.contains(pointerDownEvent.target) &&
      closeStudioSelect();
  }),
    containerElement.addEventListener("keydown", (keyDownEvent) => {
      if (keyDownEvent.key !== "Escape" || !openSelectRecord) return;
      (keyDownEvent.preventDefault(), keyDownEvent.stopPropagation());
      const openTriggerButton = openSelectRecord.trigger;
      (closeStudioSelect(), openTriggerButton.focus());
    }));
}
function syncStepperButtons(numberInputElement, stepperButtons) {
  const isInputDisabled = numberInputElement.disabled || numberInputElement.readOnly;
  for (const stepperButton of stepperButtons) stepperButton.disabled = isInputDisabled;
  numberInputElement.closest(".number-stepper")?.classList.toggle("is-disabled", isInputDisabled);
}
function enhanceNumberInput(numberInput) {
  if (!numberInput || numberInput.closest(".number-stepper")) return;
  const stepperElement = document.createElement("span");
  ((stepperElement.className = "number-stepper"),
    numberInput.before(stepperElement),
    stepperElement.append(numberInput));
  const buttonGroupElement = document.createElement("span");
  buttonGroupElement.className = "number-stepper-buttons";
  const stepperButtonConfigs = [
    {
      direction: "up",
      label: "增加数值",
    },
    {
      direction: "down",
      label: "减小数值",
    },
  ].map(({ direction: stepDirection, label: stepLabel }) => {
    const stepButton = document.createElement("button");
    ((stepButton.type = "button"),
      (stepButton.className = "number-stepper-button number-stepper-" + stepDirection),
      stepButton.setAttribute("aria-label", stepLabel),
      (stepButton.title = stepLabel));
    const performStep = () => {
      if (numberInput.disabled || numberInput.readOnly) return false;
      const previousInputValue = numberInput.value;
      try {
        stepDirection === "up" ? numberInput.stepUp() : numberInput.stepDown();
      } catch {
        return false;
      }
      return numberInput.value === previousInputValue
        ? false
        : (numberInput.dispatchEvent(
            new Event("input", {
              bubbles: true,
            }),
          ),
          true);
    };
    return (
      stepButton.addEventListener("click", (buttonClickEvent) => {
        (buttonClickEvent.preventDefault(), buttonClickEvent.stopPropagation());
      }),
      stepButton.addEventListener("pointerdown", (buttonPointerDownEvent) => {
        if (buttonPointerDownEvent.button !== 0 || numberInput.disabled || numberInput.readOnly)
          return;
        (buttonPointerDownEvent.preventDefault(),
          buttonPointerDownEvent.stopPropagation(),
          numberInput.focus({
            preventScroll: true,
          }));
        let hasValueChanged = performStep(),
          isReleaseHandled = false,
          repeatTimerId = window.setTimeout(() => {
            repeatTimerId = window.setInterval(() => {
              hasValueChanged = performStep() || hasValueChanged;
            }, 55);
          }, 320);
        const handlePointerRelease = () => {
          isReleaseHandled ||
            ((isReleaseHandled = true),
            window.clearTimeout(repeatTimerId),
            window.clearInterval(repeatTimerId),
            stepButton.removeEventListener("pointerup", handlePointerRelease),
            stepButton.removeEventListener("pointercancel", handlePointerRelease),
            stepButton.removeEventListener("lostpointercapture", handlePointerRelease),
            hasValueChanged &&
              numberInput.dispatchEvent(
                new Event("change", {
                  bubbles: true,
                }),
              ));
        };
        (stepButton.addEventListener("pointerup", handlePointerRelease),
          stepButton.addEventListener("pointercancel", handlePointerRelease),
          stepButton.addEventListener("lostpointercapture", handlePointerRelease));
        try {
          stepButton.setPointerCapture(buttonPointerDownEvent.pointerId);
        } catch {}
      }),
      buttonGroupElement.append(stepButton),
      stepButton
    );
  });
  (stepperElement.append(buttonGroupElement),
    new MutationObserver(() => syncStepperButtons(numberInput, stepperButtonConfigs)).observe(
      numberInput,
      {
        attributes: true,
        attributeFilter: ["disabled", "readonly"],
      },
    ),
    syncStepperButtons(numberInput, stepperButtonConfigs));
}
/** 扫描并增强容器内的数字输入框； */
export function initializeNumberInputs(searchRootElement: ParentNode = document) {
  for (const targetNumberInput of searchRootElement.querySelectorAll('input[type="number"]'))
    enhanceNumberInput(targetNumberInput);
}
