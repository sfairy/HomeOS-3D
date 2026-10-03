import { domElement } from "@app/utils/dom-factory";
const {
  hsToRgbColor: hsToRgbColor,
  lightColorPickerHsFromPoint: hsFromPoint,
  lightColorPickerPointFromHs: pointFromHs,
} = await (import("@app/renderer/controls/light-runtime"));
export function createLightColorPicker({
  onPreview: onPreview,
  onCommit: onCommit,
  onCancel: onCancel,
}) {
  const pickerElement = document.createElement("div");
  ((pickerElement.className = "i3d-color-picker"),
    pickerElement.setAttribute("role", "slider"),
    pickerElement.setAttribute("aria-label", "选择灯光颜色"));
  const handleElement = document.createElement("i");
  ((handleElement.className = "i3d-color-handle"), pickerElement.append(handleElement));
  let hsPair = [0, 0],
    isEnabled = false,
    pickerEntityId = "",
    activePointerId = null,
    previewToken = null;
  const syncPickerVisual = () => {
    const pickerRect = pickerElement.getBoundingClientRect(),
      normalizedPoint = pointFromHs(hsPair, pickerRect.width / pickerRect.height);
    (pickerElement.style.setProperty("--i3d-color-x", normalizedPoint.x * 100 + "%"),
      pickerElement.style.setProperty("--i3d-color-y", normalizedPoint.y * 100 + "%"),
      pickerElement.style.setProperty("--i3d-color", "rgb(" + hsToRgbColor(hsPair).join(",") + ")"),
      pickerElement.setAttribute(
        "aria-valuetext",
        "色相 " + Math.round(hsPair[0]) + " 度，饱和度 " + Math.round(hsPair[1]) + "%",
      ));
  };
  function releasePointer() {
    const releasedPointerId = activePointerId;
    if (((activePointerId = null), releasedPointerId !== null))
      try {
        pickerElement.releasePointerCapture?.(releasedPointerId);
      } catch {}
  }
  function cancelPicker() {
    releasePointer();
    const cancelledToken = previewToken;
    ((previewToken = null), cancelledToken !== null && onCancel(pickerEntityId, cancelledToken));
  }
  const applyHsColor = (nextHs) => {
      ((hsPair = nextHs), syncPickerVisual(), (previewToken = onPreview([...hsPair])));
    },
    updateColorFromPointer = (pointerEvent) => {
      const hitRect = pickerElement.getBoundingClientRect();
      !hitRect.width ||
        !hitRect.height ||
        applyHsColor(
          hsFromPoint(
            (pointerEvent.clientX - hitRect.left) / hitRect.width,
            (pointerEvent.clientY - hitRect.top) / hitRect.height,
            hitRect.width / hitRect.height,
          ),
        );
    };
  return (
    pickerElement.addEventListener("pointerdown", (pointerDownEvent) => {
      !isEnabled ||
        activePointerId !== null ||
        (pointerDownEvent.button !== undefined && pointerDownEvent.button !== 0) ||
        ((activePointerId = pointerDownEvent.pointerId),
        pickerElement.setPointerCapture?.(activePointerId),
        updateColorFromPointer(pointerDownEvent),
        pointerDownEvent.preventDefault());
    }),
    pickerElement.addEventListener("pointermove", (pointerMoveEvent) => {
      activePointerId === pointerMoveEvent.pointerId && updateColorFromPointer(pointerMoveEvent);
    }),
    pickerElement.addEventListener("pointerup", (pointerUpEvent) => {
      activePointerId === pointerUpEvent.pointerId &&
        (updateColorFromPointer(pointerUpEvent),
        releasePointer(),
        (previewToken = null),
        onCommit([...hsPair]));
    }),
    pickerElement.addEventListener("pointercancel", cancelPicker),
    pickerElement.addEventListener("lostpointercapture", () => {
      activePointerId !== null && cancelPicker();
    }),
    pickerElement.addEventListener("keydown", (keyEvent) => {
      if (!isEnabled) return;
      if (keyEvent.key === "Escape") {
        (cancelPicker(), keyEvent.preventDefault());
        return;
      }
      if (keyEvent.key === "Enter" || keyEvent.key === " ") {
        ((previewToken = null), onCommit([...hsPair]), keyEvent.preventDefault());
        return;
      }
      const stepAmount = keyEvent.shiftKey ? 10 : 3;
      let [hue, saturation] = hsPair;
      if (keyEvent.key === "ArrowLeft") hue -= stepAmount;
      else {
        if (keyEvent.key === "ArrowRight") hue += stepAmount;
        else {
          if (keyEvent.key === "ArrowUp") saturation -= stepAmount;
          else {
            if (keyEvent.key === "ArrowDown") saturation += stepAmount;
            else return;
          }
        }
      }
      (applyHsColor([((hue % 360) + 360) % 360, Math.max(0, Math.min(100, saturation))]),
        keyEvent.preventDefault());
    }),
    {
      root: pickerElement,
      cancel: cancelPicker,
      dispose: cancelPicker,
      update(pickerState) {
        ((pickerEntityId !== pickerState.entityId ||
          !pickerState.enabled ||
          !pickerState.visible) &&
          cancelPicker(),
          (pickerEntityId = pickerState.entityId),
          (isEnabled = pickerState.enabled && pickerState.visible),
          (pickerElement.hidden = !pickerState.visible),
          (pickerElement.tabIndex = isEnabled ? 0 : -1),
          pickerElement.setAttribute("aria-disabled", String(!isEnabled)),
          activePointerId === null &&
            previewToken === null &&
            ((hsPair = pickerState.hs || [0, 0]), syncPickerVisual()));
      },
    }
  );
}
export function createLightModeMenu(onSelect) {
  const makeElement = (tagName, className) => domElement(document, tagName, className),
    modeRoot = makeElement("div", "i3d-light-mode"),
    triggerButton = makeElement("button", "i3d-light-mode-trigger");
  ((triggerButton.type = "button"),
    triggerButton.setAttribute("aria-label", "灯光模式"),
    triggerButton.setAttribute("aria-haspopup", "menu"));
  const labelElement = makeElement("span", "");
  triggerButton.append(labelElement);
  const menuElement = makeElement("div", "i3d-light-mode-menu");
  (menuElement.setAttribute("role", "menu"),
    menuElement.setAttribute("aria-label", "灯光模式"),
    modeRoot.append(triggerButton, menuElement));
  let selectedMode = "",
    menuEntityId = "",
    modesSignature = "";
  const modeButtons = [],
    getVisibleOptions = () => modeButtons.filter((optionButton) => !optionButton.hidden);
  function closeMenu(shouldRestoreFocus = false) {
    ((menuElement.hidden = true),
      triggerButton.setAttribute("aria-expanded", "false"),
      shouldRestoreFocus && !triggerButton.disabled && triggerButton.focus());
  }
  function openMenu(shouldFocusLast = false) {
    if (triggerButton.disabled || modeRoot.hidden) return;
    ((menuElement.hidden = false), triggerButton.setAttribute("aria-expanded", "true"));
    const visibleButtons = getVisibleOptions();
    (shouldFocusLast
      ? visibleButtons.at(-1)
      : visibleButtons.find((candidateButton) => candidateButton.value === selectedMode) ||
        visibleButtons[0]
    )?.focus();
  }
  for (const [modeKey, modeLabel] of [
    ["color", "彩光"],
    ["temperature", "色温"],
    ["white", "白光"],
  ]) {
    const modeOptionButton = makeElement("button", "i3d-light-mode-option");
    ((modeOptionButton.type = "button"),
      (modeOptionButton.value = modeKey),
      (modeOptionButton.textContent = modeLabel),
      (modeOptionButton.tabIndex = -1),
      modeOptionButton.setAttribute("role", "menuitemradio"),
      modeOptionButton.addEventListener("click", () => {
        triggerButton.disabled ||
          modeOptionButton.hidden ||
          (closeMenu(true), selectedMode !== modeKey && onSelect(modeKey));
      }),
      menuElement.append(modeOptionButton),
      modeButtons.push(modeOptionButton));
  }
  (triggerButton.addEventListener("click", () => (menuElement.hidden ? openMenu() : closeMenu())),
    triggerButton.addEventListener("keydown", (triggerKeyEvent) => {
      ["ArrowDown", "ArrowUp"].includes(triggerKeyEvent.key) &&
        (triggerKeyEvent.preventDefault(),
        triggerKeyEvent.stopPropagation(),
        openMenu(triggerKeyEvent.key === "ArrowUp"));
    }),
    modeRoot.addEventListener("keydown", (menuKeyEvent) => {
      if (menuElement.hidden) return;
      if (menuKeyEvent.key === "Escape") {
        (menuKeyEvent.preventDefault(), menuKeyEvent.stopPropagation(), closeMenu(true));
        return;
      }
      if (menuKeyEvent.key === "Tab") {
        closeMenu(true);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(menuKeyEvent.key)) return;
      (menuKeyEvent.preventDefault(), menuKeyEvent.stopPropagation());
      const visibleOptions = getVisibleOptions(),
        currentIndex = visibleOptions.indexOf(document.activeElement),
        nextIndex =
          menuKeyEvent.key === "Home"
            ? 0
            : menuKeyEvent.key === "End"
              ? visibleOptions.length - 1
              : (currentIndex +
                  (menuKeyEvent.key === "ArrowDown" ? 1 : -1) +
                  visibleOptions.length) %
                visibleOptions.length;
      visibleOptions[nextIndex]?.focus();
    }),
    modeRoot.addEventListener("focusout", (focusOutEvent) => {
      modeRoot.contains(focusOutEvent.relatedTarget) || closeMenu();
    }));
  const handleOutsidePointerDown = (documentPointerEvent) => {
    modeRoot.contains(documentPointerEvent.target) || closeMenu();
  };
  return (
    document.addEventListener("pointerdown", handleOutsidePointerDown, true),
    closeMenu(),
    {
      root: modeRoot,
      close: closeMenu,
      dispose() {
        (document.removeEventListener("pointerdown", handleOutsidePointerDown, true), closeMenu());
      },
      update({ modes: modes, value: selectedValue, disabled: isDisabled, entity: entityId }) {
        const nextModesSignature = Object.keys(modes)
          .filter((modeName) => modes[modeName])
          .join(",");
        ((menuEntityId !== entityId || modesSignature !== nextModesSignature || isDisabled) &&
          closeMenu(),
          (menuEntityId = entityId),
          (modesSignature = nextModesSignature),
          (selectedMode = selectedValue),
          (modeRoot.hidden = Object.values(modes).filter(Boolean).length < 2),
          (triggerButton.disabled = isDisabled));
        for (const menuButton of modeButtons)
          ((menuButton.hidden = !modes[menuButton.value]),
            menuButton.setAttribute("aria-checked", String(menuButton.value === selectedMode)),
            menuButton.value === selectedMode &&
              (labelElement.textContent = menuButton.textContent));
      },
    }
  );
}
