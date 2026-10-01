import { entityPowerIsOn, entityToggleCommand } from "./entity-power.js?v=20260818-airer-v1";
const T = new Set(["switch", "input_boolean", "light", "fan"]);
export function resolveSceneControlMode(arg1, arg2 = "") {
  return ["switch", "scene"].includes(arg1) ? arg1 : T.has(arg2.split(".")[0]) ? "switch" : "scene";
}
export function sceneModeState(arg3, arg4, arg5) {
  const value1 = arg4?.newState?.state ?? arg4?.state,
    value2 = resolveSceneControlMode(arg5, arg3) === "scene";
  return {
    momentary: value2,
    active: !value2 && entityPowerIsOn(arg3, arg4),
    available:
      !!arg3 && value1 != null && value1 !== "unavailable" && (value2 || value1 !== "unknown"),
  };
}
export function sceneModeCommand(arg6, arg7, arg8) {
  const value3 = sceneModeState(arg6, arg7, arg8);
  if (!value3.available) throw new Error("情景模式关联实体不可用。");
  const value4 = arg6.split(".")[0];
  return !value3.momentary && ["climate", "media_player", "water_heater"].includes(value4)
    ? {
        ...entityToggleCommand(arg6, arg7),
        entityId: arg6,
      }
    : {
        domain: value4,
        service: ["button", "input_button"].includes(value4)
          ? "press"
          : value3.momentary || !value3.active
            ? "turn_on"
            : "turn_off",
        entityId: arg6,
      };
}
export function bindSceneMode(arg9, arg10, arg11, arg12) {
  const value5 = arg11.properties || {},
    value6 = arg11.bindings?.entity?.entityId || "",
    value7 = resolveSceneControlMode(value5.controlMode, value6);
  let value8 = arg12.states?.get(value6),
    value9 = arg12.previewState || "auto",
    value10 = false,
    value11 = false,
    text1 = "",
    value12 = false,
    value13 = null;
  const set1 = new Set(),
    fn1 = (arg13, arg14) =>
      Number.isFinite(Number(arg13)) ? Math.max(0, Math.min(1, Number(arg13))) : arg14,
    value14 = value5.activationAnimation !== "none";
  arg9.classList.toggle("has-animation", value14);
  function fn2() {
    if (value12) return;
    const value15 = sceneModeState(value6, value8, value7),
      value16 =
        arg12.editable && value9 !== "auto"
          ? value9 === "on"
          : value15.available && (value15.active || value11);
    (arg10.classList.toggle("active", value16),
      arg10.style.setProperty(
        "--navigation-text-opacity",
        String(
          fn1(value16 ? value5.textActiveOpacity : value5.textIdleOpacity, value16 ? 0.9 : 0.4),
        ),
      ),
      arg10.style.setProperty(
        "--navigation-icon-opacity",
        String(
          fn1(value16 ? value5.iconActiveOpacity : value5.iconIdleOpacity, value16 ? 0.9 : 0.3),
        ),
      ),
      (arg9.dataset.state = value15.available ? (value15.active ? "on" : "off") : "unavailable"),
      arg9.setAttribute("aria-busy", String(value10)),
      arg9.setAttribute("aria-disabled", String(!value15.available || value10 || !!arg12.editable)),
      (arg9.tabIndex = arg12.editable || !value15.available ? -1 : 0),
      value15.momentary
        ? arg9.removeAttribute("aria-pressed")
        : arg9.setAttribute("aria-pressed", String(value15.active)),
      arg9.classList.toggle("is-unavailable", !arg12.editable && !value15.available),
      (arg9.title =
        text1 || (value6 ? (value15.available ? "" : "关联实体不可用") : "请在编辑器中绑定实体")));
  }
  function fn3() {
    if (!value14 || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    for (const value19 of set1) value19.cancel();
    set1.clear();
    const value17 = arg10.querySelector(".hb-navigation-icon");
    if (!value17?.animate) return;
    const value18 = value17.animate(
      [
        {
          transform: "translate(-50%,-50%) scale(1)",
          offset: 0,
        },
        {
          transform: "translate(-50%,-50%) scale(.86)",
          offset: 0.18,
        },
        {
          transform: "translate(-50%,-50%) scale(1.09)",
          offset: 0.48,
        },
        {
          transform: "translate(-50%,-50%) scale(.98)",
          offset: 0.73,
        },
        {
          transform: "translate(-50%,-50%) scale(1)",
          offset: 1,
        },
      ],
      {
        duration: 460,
        easing: "ease-in-out",
      },
    );
    (set1.add(value18), value18.finished.catch(() => {}).finally(() => set1.delete(value18)));
  }
  async function fn4(arg15) {
    if (!arg12.editable && (arg15?.stopPropagation(), !(value10 || value12)))
      try {
        const value20 = sceneModeCommand(value6, value8, value7);
        if (
          ((value10 = true),
          (value11 = false),
          (text1 = ""),
          clearTimeout(value13),
          arg9.classList.remove("is-error"),
          fn2(),
          fn3(),
          await arg12.callEntityService(
            value20.domain,
            value20.service,
            value20.entityId,
            value20.data || {},
          ),
          value12)
        )
          return;
        sceneModeState(value6, value8, value7).momentary &&
          value14 &&
          ((value11 = true),
          (value13 = setTimeout(() => {
            ((value11 = false), fn2());
          }, 700)));
      } catch (error1) {
        value12 ||
          (arg9.classList.add("is-error"),
          (text1 = error1.message || "情景模式触发失败"),
          arg12.onError?.(error1));
      } finally {
        value12 || ((value10 = false), fn2());
      }
  }
  arg9.addEventListener("click", fn4);
  const object1 = {
    update(arg16, arg17 = value9) {
      ((value8 = arg16), (value9 = arg17), fn2());
    },
    destroy() {
      ((value12 = true), clearTimeout(value13));
      for (const value21 of set1) value21.cancel();
      (set1.clear(), arg9.removeEventListener("click", fn4));
    },
  };
  return (
    (arg9.sceneModeController = object1),
    arg12.cleanup?.(() => object1.destroy()),
    fn2(),
    object1
  );
}
