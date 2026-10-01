import { speakerState } from "./speaker-state.js?v=20260926-speaker-v1";
export function speakerRingFrame(arg1, arg2) {
  const value1 =
    arg1 === "playing" ? Math.pow(0.5 - 0.5 * Math.cos((arg2 * Math.PI * 2) / 3200), 1.5) : 0;
  return {
    visible: arg1 === "playing" || arg1 === "paused",
    brightness: arg1 === "playing" ? 0.035 + 0.965 * value1 : arg1 === "paused" ? 0.12 : 0,
    breath: value1,
    rotation: (arg2 * Math.PI * 2) / 18000,
  };
}
export function createSpeakerRings({ requestFrame: arg3 = () => {} } = {}) {
  let value2,
    value3,
    list1 = [],
    value4 = false,
    value5 = false;
  const value6 =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ??
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)"),
    fn1 = () => {
      value4 || arg3();
    };
  value6?.addEventListener?.("change", fn1);
  const fn2 = (arg4) => {
      for (let value7 = arg4; value7; value7 = value7.parent) {
        if (value7.visible === false) return false;
        if (value7 === value2) return true;
      }
      return false;
    },
    fn3 = (arg5) => {
      for (const value8 of arg5.parts) value8.visible = false;
    };
  return {
    sync({ root: arg6, revision: arg7, bindings: arg8 = [], states: arg9 = {} }) {
      if (!value4) {
        (value2 !== arg6 || value3 !== arg7) &&
          (list1.forEach(fn3),
          (list1 = []),
          (value2 = arg6),
          (value3 = arg7),
          value2?.traverse((arg10) => {
            if (arg10.userData?.environmentModelType !== "speaker") return;
            const list2 = [];
            (arg10.traverse((arg11) => {
              (arg11.userData?.speakerRing || arg11.userData?.speakerHalo) && list2.push(arg11);
            }),
              list1.push({
                model: arg10,
                parts: list2,
                state: "off",
              }));
          }));
        for (const value9 of list1) {
          const value10 = arg8.find(
              (arg12) =>
                arg12.floorId === value9.model.userData.environmentFloorId &&
                arg12.modelId === value9.model.userData.environmentModelId,
            ),
            value11 =
              value10 && value10.visible !== false ? speakerState(value10, arg9).ring : "off";
          value11 !== value9.state &&
            ((value9.state = value11), this.tick(performance.now()), arg3());
        }
      }
    },
    tick(arg13) {
      if (value4) return false;
      const value12 = value6?.matches === true;
      value5 = false;
      let value13 = false;
      for (const value14 of list1) {
        if (!fn2(value14.model)) continue;
        const value15 = speakerRingFrame(value14.state, value12 ? 800 : arg13);
        value5 ||= value14.state === "playing" && !value12;
        for (const value16 of value14.parts) {
          if (
            (value16.visible !== value15.visible && (value13 = true),
            (value16.visible = value15.visible),
            value16.userData.speakerRing)
          )
            (value16.material.color.r !== value15.brightness && (value13 = true),
              value16.material.color.setRGB(
                value15.brightness,
                value15.brightness,
                value15.brightness,
              ));
          else {
            const value17 = value16.userData.speakerHalo * value15.breath;
            (value16.material.opacity !== value17 && (value13 = true),
              (value16.material.opacity = value17));
          }
          value14.state === "playing" &&
            !value12 &&
            (value16.rotation.z !== value15.rotation && (value13 = true),
            (value16.rotation.z = value15.rotation));
        }
      }
      return ((value13 || value5) && arg3(), value5);
    },
    nextDelay() {
      return value5 ? 1000 / 30 : Infinity;
    },
    dispose() {
      value4 ||
        ((value4 = true),
        value6?.removeEventListener?.("change", fn1),
        list1.forEach(fn3),
        (list1 = []),
        (value2 = null),
        (value5 = false));
    },
  };
}
