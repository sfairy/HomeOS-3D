import { coverState } from "./cover-state.js?v=20260914-cover-live-drag-v6-airer-icon-v1";
export function createAirerMotion({
  requestFrame: arg1 = () => {},
  now: arg2 = () => performance.now(),
} = {}) {
  let value1,
    value2,
    list1 = [],
    value3 = false,
    value4 = false;
  const fn1 = (arg3) => arg3.floorId + "/" + arg3.modelId;
  function fn2(arg4, arg5) {
    const value5 = arg4.motion;
    if (!value5) return;
    const value6 = Math.max(0, Math.min(1, (arg5 - value5.start) / value5.duration));
    ((arg4.position = value5.from + (value5.to - value5.from) * value6),
      value6 === 1 && (arg4.motion = null));
  }
  function fn3(arg6) {
    (arg6.rig.pose(arg6.position),
      arg6.outlinePosition !== arg6.position &&
        ((arg6.model.userData.environmentOutlineRevision =
          (arg6.model.userData.environmentOutlineRevision || 0) + 1),
        (arg6.outlinePosition = arg6.position)),
      (arg6.model.userData.environmentOutlineMoving = !!(arg6.motion || arg6.state?.moving)));
  }
  return {
    sync({ root: arg7, revision: arg8, bindings: arg9 = [], states: arg10 = {} }) {
      if (value4) return;
      const value7 = arg2();
      (value1 !== arg7 || value2 !== arg8) &&
        ((value1 = arg7),
        (value2 = arg8),
        (list1 = []),
        value1?.traverse((arg11) => {
          arg11.userData?.environmentModelType === "airer" &&
            arg11.traverse((arg12) => {
              arg12.userData?.airerRig &&
                list1.push({
                  key: arg11.userData.environmentFloorId + "/" + arg11.userData.environmentModelId,
                  model: arg11,
                  rig: arg12.userData.airerRig,
                  position: 55,
                  motion: null,
                  signature: "",
                });
            });
        }));
      for (const value8 of list1) {
        const value9 = arg9.find((arg13) => fn1(arg13) === value8.key),
          value10 = coverState(value9?.entityId || "", arg10[value9?.entityId]),
          value11 = value9?.entityId || "",
          value12 = JSON.stringify([
            value11,
            value10.available,
            value10.state,
            value10.position,
            value9?.travelSeconds,
            value9?.unboundPosition,
          ]);
        if (value12 !== value8.signature) {
          fn2(value8, value7);
          const value17 = !value8.signature || value11 !== value8.entityId;
          value8.motion = null;
          const value18 =
            value8.state?.moving && value10.moving && value8.state.opening !== value10.opening;
          if (
            ((value17 || !value10.available || !value10.moving || value18) &&
              ((value8.reportTime = null), (value8.reportInterval = null)),
            !value9?.entityId)
          )
            value8.position = value9?.unboundPosition ?? value8.rig.preview ?? 55;
          else {
            if (value10.available && value10.position !== null) {
              if (value10.moving && value10.position !== value8.state?.position) {
                const value19 = value8.reportTime == null ? null : value7 - value8.reportTime;
                (value19 >= 80 &&
                  value19 <= 5000 &&
                  (value8.reportInterval =
                    value8.reportInterval == null
                      ? value19
                      : Math.max(value19, value8.reportInterval * 0.7 + value19 * 0.3)),
                  (value8.reportTime = value7));
              } else value10.moving && value8.reportTime == null && (value8.reportTime = value7);
              if (value17 || !value10.moving || value18) value8.position = value10.position;
              else {
                if (value8.position !== value10.position) {
                  const value20 = value8.reportInterval ?? 1000,
                    value21 = Math.max(120, Math.min(5500, value20 * 1.15));
                  value8.motion = {
                    from: value8.position,
                    to: value10.position,
                    start: value7,
                    duration: value21,
                  };
                }
              }
            } else {
              if (value10.available && value10.moving) {
                const value22 = value10.opening ? 100 : 0;
                (value17 && (value8.position = value9?.unboundPosition ?? value8.rig.preview ?? 55),
                  value22 !== value8.position &&
                    (value8.motion = {
                      from: value8.position,
                      to: value22,
                      start: value7,
                      duration: Math.max(
                        180,
                        (Math.abs(value22 - value8.position) / 100) *
                          (value9?.travelSeconds || 20) *
                          1000,
                      ),
                    }));
              }
            }
          }
          ((value8.signature = value12),
            (value8.entityId = value11),
            (value8.state = value10),
            fn3(value8),
            arg1());
        }
        const value13 = (value9?.extraControls || []).find((arg14) =>
            arg14.entityId.startsWith("light."),
          ),
          value14 = arg10[value13?.entityId],
          value15 = value14?.newState || value14,
          value16 = value15?.available !== false && value15?.state === "on";
        value8.light !== value16 &&
          ((value8.light = value16), value8.rig.setLight(value16), arg1());
      }
    },
    tick(arg15 = arg2()) {
      value3 = false;
      for (const value23 of list1)
        value23.motion &&
          (fn2(value23, arg15), fn3(value23), (value3 ||= !!value23.motion), arg1());
      return value3;
    },
    read(arg16, arg17) {
      const value24 = list1.find((arg18) => arg18.key === fn1(arg16));
      return {
        ...arg17,
        estimated: arg17.position === null,
        visualPosition: value24?.position ?? null,
      };
    },
    nextDelay() {
      return list1.some((arg19) => arg19.motion) ? 1000 / 30 : Infinity;
    },
    dispose() {
      value4 = true;
      for (const value25 of list1) delete value25.model.userData.environmentOutlineMoving;
      ((list1 = []), (value1 = null), (value3 = false));
    },
  };
}
