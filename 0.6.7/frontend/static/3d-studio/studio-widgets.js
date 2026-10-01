const c = new Map();
let i = null;
function u(arg1 = i) {
  arg1 &&
    (arg1.wrapper.classList.remove("open"),
    arg1.trigger.setAttribute("aria-expanded", "false"),
    (arg1.menu.hidden = true),
    i === arg1 && (i = null));
}
export function syncStudioSelect(arg2) {
  const value1 = c.get(arg2);
  if (!value1) return;
  const value2 = arg2.selectedOptions?.[0] || arg2.options[arg2.selectedIndex] || arg2.options[0];
  ((value1.trigger.textContent = value2?.textContent || "请选择"),
    (value1.trigger.disabled = arg2.disabled),
    value1.trigger.setAttribute("aria-disabled", String(arg2.disabled)),
    value1.menu.replaceChildren(
      ...[...arg2.options].map((arg3) => {
        const value3 = document.createElement("button");
        return (
          (value3.type = "button"),
          (value3.className = "studio-select-option"),
          (value3.textContent = arg3.textContent),
          (value3.dataset.value = arg3.value),
          (value3.disabled = arg3.disabled),
          value3.setAttribute("role", "option"),
          value3.setAttribute("aria-selected", String(arg3.value === arg2.value)),
          value3.classList.toggle("selected", arg3.value === arg2.value),
          value3.addEventListener("click", (arg4) => {
            (arg4.preventDefault(),
              arg4.stopPropagation(),
              !arg3.disabled &&
                ((arg2.value = arg3.value),
                syncStudioSelect(arg2),
                u(value1),
                arg2.dispatchEvent(
                  new Event("change", {
                    bubbles: true,
                  }),
                ),
                value1.trigger.focus()));
          }),
          value3
        );
      }),
    ),
    arg2.disabled && u(value1));
}
export function enhanceStudioSelect(arg5) {
  if (!arg5 || c.has(arg5)) return;
  const value4 = document.createElement("div");
  ((value4.className = "studio-select"),
    arg5.before(value4),
    value4.append(arg5),
    arg5.classList.add("studio-native-select"),
    (arg5.tabIndex = -1),
    arg5.setAttribute("aria-hidden", "true"));
  const value5 = document.createElement("button");
  ((value5.type = "button"),
    (value5.className = "studio-select-trigger"),
    value5.setAttribute("aria-haspopup", "listbox"),
    value5.setAttribute("aria-expanded", "false"));
  const value6 = document.createElement("div");
  ((value6.className = "studio-select-menu"),
    (value6.id = (arg5.id || "studio-select-" + (c.size + 1)) + "-menu"),
    value6.setAttribute("role", "listbox"),
    (value6.hidden = true),
    value5.setAttribute("aria-controls", value6.id),
    value4.append(value5, value6));
  const object1 = {
    select: arg5,
    wrapper: value4,
    trigger: value5,
    menu: value6,
  };
  (c.set(arg5, object1),
    value5.addEventListener("click", (arg6) => {
      if ((arg6.preventDefault(), arg6.stopPropagation(), !arg5.disabled)) {
        if (i === object1) {
          u(object1);
          return;
        }
        (u(),
          syncStudioSelect(arg5),
          value4.classList.add("open"),
          value5.setAttribute("aria-expanded", "true"),
          (value6.hidden = false),
          (i = object1));
      }
    }),
    arg5.addEventListener("change", () => syncStudioSelect(arg5)),
    (object1.observer = new MutationObserver(() => syncStudioSelect(arg5))),
    object1.observer.observe(arg5, {
      childList: true,
      subtree: true,
      attributes: true,
    }),
    syncStudioSelect(arg5));
}
export function disposeStudioSelects(arg7) {
  for (const value7 of arg7.querySelectorAll("select")) {
    const value8 = c.get(value7);
    value8 && (i === value8 && u(value8), value8.observer.disconnect(), c.delete(value7));
  }
}
export function initializeStudioSelects(arg8 = document) {
  for (const value9 of arg8.querySelectorAll("select")) enhanceStudioSelect(value9);
  (arg8.addEventListener("pointerdown", (arg9) => {
    i && !i.wrapper.contains(arg9.target) && u();
  }),
    arg8.addEventListener("keydown", (arg10) => {
      if (arg10.key !== "Escape" || !i) return;
      (arg10.preventDefault(), arg10.stopPropagation());
      const value10 = i.trigger;
      (u(), value10.focus());
    }));
}
function v(arg11, arg12) {
  const value11 = arg11.disabled || arg11.readOnly;
  for (const value12 of arg12) value12.disabled = value11;
  arg11.closest(".number-stepper")?.classList.toggle("is-disabled", value11);
}
export function enhanceNumberInput(arg13) {
  if (!arg13 || arg13.closest(".number-stepper")) return;
  const value13 = document.createElement("span");
  ((value13.className = "number-stepper"), arg13.before(value13), value13.append(arg13));
  const value14 = document.createElement("span");
  value14.className = "number-stepper-buttons";
  const value15 = [
    {
      direction: "up",
      label: "增加数值",
    },
    {
      direction: "down",
      label: "减小数值",
    },
  ].map(({ direction: arg14, label: arg15 }) => {
    const value16 = document.createElement("button");
    ((value16.type = "button"),
      (value16.className = "number-stepper-button number-stepper-" + arg14),
      value16.setAttribute("aria-label", arg15),
      (value16.title = arg15));
    const fn1 = () => {
      if (arg13.disabled || arg13.readOnly) return false;
      const value17 = arg13.value;
      try {
        arg14 === "up" ? arg13.stepUp() : arg13.stepDown();
      } catch {
        return false;
      }
      return arg13.value === value17
        ? false
        : (arg13.dispatchEvent(
            new Event("input", {
              bubbles: true,
            }),
          ),
          true);
    };
    return (
      value16.addEventListener("click", (arg16) => {
        (arg16.preventDefault(), arg16.stopPropagation());
      }),
      value16.addEventListener("pointerdown", (arg17) => {
        if (arg17.button !== 0 || arg13.disabled || arg13.readOnly) return;
        (arg17.preventDefault(),
          arg17.stopPropagation(),
          arg13.focus({
            preventScroll: true,
          }));
        let value18 = fn1(),
          value19 = false,
          value20 = window.setTimeout(() => {
            value20 = window.setInterval(() => {
              value18 = fn1() || value18;
            }, 55);
          }, 320);
        const fn2 = () => {
          value19 ||
            ((value19 = true),
            window.clearTimeout(value20),
            window.clearInterval(value20),
            value16.removeEventListener("pointerup", fn2),
            value16.removeEventListener("pointercancel", fn2),
            value16.removeEventListener("lostpointercapture", fn2),
            value18 &&
              arg13.dispatchEvent(
                new Event("change", {
                  bubbles: true,
                }),
              ));
        };
        (value16.addEventListener("pointerup", fn2),
          value16.addEventListener("pointercancel", fn2),
          value16.addEventListener("lostpointercapture", fn2));
        try {
          value16.setPointerCapture(arg17.pointerId);
        } catch {}
      }),
      value14.append(value16),
      value16
    );
  });
  (value13.append(value14),
    new MutationObserver(() => v(arg13, value15)).observe(arg13, {
      attributes: true,
      attributeFilter: ["disabled", "readonly"],
    }),
    v(arg13, value15));
}
export function initializeNumberInputs(arg18 = document) {
  for (const value21 of arg18.querySelectorAll('input[type="number"]')) enhanceNumberInput(value21);
}
