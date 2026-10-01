export function fanMotionState(arg1) {
  arg1 = arg1?.newState || arg1 || {};
  const value1 = arg1.attributes || {},
    value2 = arg1.available !== false && arg1.state === "on",
    value3 =
      typeof value1.percentage == "number" && Number.isFinite(value1.percentage)
        ? Math.max(0, Math.min(100, value1.percentage))
        : 40;
  return {
    on: value2 && value3 > 0,
    percentage: value3,
    oscillating: value2 && value1.oscillating === true,
    direction: value1.direction === "reverse" ? -1 : 1,
  };
}
export function createFanMotion({
  requestFrame: arg2 = () => {},
  reducedMotion: arg3 = () =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
} = {}) {
  let value4,
    value5,
    list1 = [],
    value6 = false,
    value7 = false,
    value8 = null;
  const fn1 = (arg4) => {
      for (let value9 = arg4; value9; value9 = value9.parent) {
        if (value9.visible === false) return false;
        if (value9 === value4) return true;
      }
      return false;
    },
    fn2 = () =>
      list1.forEach((arg5) => {
        arg5.yaw && (arg5.yaw.rotation.y = 0);
      });
  return {
    sync({ root: arg6, revision: arg7, bindings: arg8 = [], states: arg9 = {} }) {
      if (value7) return;
      (value4 !== arg6 || value5 !== arg7) &&
        (fn2(),
        (value4 = arg6),
        (value5 = arg7),
        (list1 = []),
        (value8 = null),
        value4?.traverse((arg10) => {
          if (arg10.userData?.environmentModelType !== "fan") return;
          const object1 = {
            model: arg10,
            swingTime: 0,
            state: fanMotionState(null),
          };
          (arg10.traverse((arg11) => {
            arg11.userData?.fanPart && (object1[arg11.userData.fanPart] = arg11);
          }),
            list1.push(object1));
        }));
      let value10 = false;
      for (const value11 of list1) {
        const value12 = arg8.find(
            (arg12) =>
              arg12.floorId === value11.model.userData.environmentFloorId &&
              arg12.modelId === value11.model.userData.environmentModelId,
          ),
          value13 = fanMotionState(value12 ? arg9[value12.entityId] : null);
        (JSON.stringify(value13) !== JSON.stringify(value11.state) && (value10 = true),
          (value11.state = value13));
      }
      value10 && arg2();
    },
    tick(arg13) {
      if (value7) return false;
      const value14 = value8 === null ? 0 : Math.max(0, Math.min(0.08, (arg13 - value8) / 1000));
      if (((value8 = arg13), (value6 = false), arg3())) return false;
      for (const value15 of list1)
        !value15.state.on ||
          !fn1(value15.model) ||
          ((value6 = true),
          value15.rotor &&
            (value15.rotor.rotation.z =
              (value15.rotor.rotation.z -
                value15.state.direction * (3 + value15.state.percentage * 0.16) * value14) %
              (Math.PI * 2)),
          value15.yaw &&
            value15.state.oscillating &&
            ((value15.swingTime += value14),
            (value15.yaw.rotation.y = (Math.sin(value15.swingTime * 0.6) * Math.PI) / 4)));
      return (value6 && arg2(), value6);
    },
    nextDelay() {
      return value6 ? 1000 / 30 : Infinity;
    },
    dispose() {
      value7 ||
        ((value7 = true), fn2(), (list1 = []), (value4 = null), (value6 = false), (value8 = null));
    },
  };
}
