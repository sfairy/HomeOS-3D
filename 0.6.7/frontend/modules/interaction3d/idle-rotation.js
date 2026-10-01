const S = new URL(
  import.meta.url.startsWith("file:")
    ? "../../static/modules/interaction3d/page-behavior.js?v=20260911-page-behavior-light-v2-20260926-speaker-v1"
    : "../../../../bridge-static/modules/interaction3d/page-behavior.js?v=20260911-page-behavior-light-v2-20260926-speaker-v1",
  import.meta.url,
);
export const { resolvePageBehavior } = await import(S.href);
export function createIdleRotation({
  now: arg5 = () => performance.now(),
  returnToBase: arg1,
  start: arg2,
  rotate: arg3,
  stop: arg4,
}) {
  let object1 = {
      enabled: false,
      idleSeconds: 30,
      speed: 6,
      direction: "clockwise",
    },
    value1 = false,
    value2 = false,
    text1 = "waiting",
    value3 = arg5(),
    value4 = 0,
    value5 = 0,
    value6 = 0,
    value7 = 0;
  function fn1(arg6 = arg5()) {
    const value8 = text1 === "returning" || text1 === "rotating";
    (value7++,
      (text1 = "waiting"),
      (value3 = arg6),
      (value4 = 0),
      (value5 = 0),
      (value6 = 0),
      value8 && arg4());
  }
  return {
    configure(arg7 = {}, arg8 = arg5()) {
      const object2 = {
        enabled: arg7?.enabled === true,
        direction: arg7?.direction === "counterclockwise" ? "counterclockwise" : "clockwise",
        idleSeconds: Number.isInteger(arg7?.idleSeconds)
          ? Math.max(1, Math.min(3600, arg7.idleSeconds))
          : 30,
        speed: Number.isFinite(arg7?.speed) ? Math.max(0.5, Math.min(30, arg7.speed)) : 6,
      };
      JSON.stringify(object2) !== JSON.stringify(object1) && ((object1 = object2), fn1(arg8));
    },
    setAvailable(arg9, arg10 = arg5()) {
      value1 !== !!arg9 && ((value1 = !!arg9), fn1(arg10));
    },
    hold(arg11, arg12 = arg5()) {
      ((value2 = !!arg11), fn1(arg12));
    },
    activity: fn1,
    tick(arg13 = arg5()) {
      if (!(!object1.enabled || !value1 || value2)) {
        if (text1 === "waiting" && arg13 - value3 >= object1.idleSeconds * 1000) {
          text1 = "returning";
          const value9 = ++value7;
          arg1(() => {
            value9 !== value7 ||
              text1 !== "returning" ||
              !value1 ||
              value2 ||
              !object1.enabled ||
              ((text1 = "rotating"), (value4 = arg5()), (value5 = 0), (value6 = 0), arg2());
          });
        } else {
          if (text1 === "rotating") {
            const value10 = Math.max(0, Math.min(0.1, (arg13 - value4) / 1000));
            value4 = arg13;
            const value11 = Math.min(1, value6 / 0.6);
            ((value6 += value10),
              (value5 =
                (value5 +
                  (((value10 * object1.speed * Math.PI) / 180) *
                    (value11 + Math.min(1, value6 / 0.6))) /
                    2) %
                (Math.PI * 2)),
              arg3(object1.direction === "counterclockwise" ? -value5 : value5));
          }
        }
      }
    },
    dispose() {
      ((value1 = false), fn1());
    },
    nextDelay(arg14 = arg5()) {
      return !object1.enabled || !value1 || value2
        ? Infinity
        : text1 === "rotating"
          ? 0
          : text1 === "waiting"
            ? Math.max(0, value3 + object1.idleSeconds * 1000 - arg14)
            : Infinity;
    },
    get phase() {
      return text1;
    },
  };
}
export function createIdleFocusExit({ now: arg16 = () => performance.now(), onExit: arg15 } = {}) {
  let object3 = {
      enabled: false,
      idleSeconds: 30,
    },
    value12 = false,
    value13 = false,
    value14 = false,
    value15 = false,
    value16 = arg16();
  function fn2(arg17 = arg16()) {
    value14 || ((value16 = arg17), (value15 = false));
  }
  return {
    configure(arg18 = {}, arg19 = arg16()) {
      if (value14) return;
      const object4 = {
        enabled: arg18?.enabled === true,
        idleSeconds: Number.isInteger(arg18?.idleSeconds)
          ? Math.max(1, Math.min(3600, arg18.idleSeconds))
          : 30,
      };
      (object4.enabled === object3.enabled && object4.idleSeconds === object3.idleSeconds) ||
        ((object3 = object4), fn2(arg19));
    },
    setAvailable(arg20, arg21 = arg16()) {
      value14 ||
        value12 === !!arg20 ||
        ((value12 = !!arg20), value12 || (value13 = false), fn2(arg21));
    },
    hold(arg22, arg23 = arg16()) {
      value14 || ((value13 = !!arg22), fn2(arg23));
    },
    activity: fn2,
    tick(arg24 = arg16()) {
      value14 ||
        !object3.enabled ||
        !value12 ||
        value13 ||
        value15 ||
        (arg24 - value16 >= object3.idleSeconds * 1000 && ((value15 = true), arg15()));
    },
    nextDelay(arg25 = arg16()) {
      return value14 || !object3.enabled || !value12 || value13 || value15
        ? Infinity
        : Math.max(0, value16 + object3.idleSeconds * 1000 - arg25);
    },
    dispose() {
      ((value14 = true), (value12 = false), (value13 = false));
    },
  };
}
export function createIdleIconVisibility({
  now: arg26 = () => performance.now(),
  onChange: arg27 = () => {},
} = {}) {
  let object5 = {
      enabled: false,
      idleSeconds: 30,
    },
    value17 = false,
    value18 = false,
    value19 = false,
    value20 = false,
    value21 = arg26();
  function fn3(arg28) {
    value19 !== arg28 && ((value19 = arg28), arg27(value19));
  }
  function fn4(arg29 = arg26()) {
    value20 || ((value21 = arg29), fn3(false));
  }
  return {
    configure(arg30 = {}, arg31 = arg26()) {
      if (value20) return;
      const object6 = {
        enabled: arg30?.enabled === true,
        idleSeconds: Number.isInteger(arg30?.idleSeconds)
          ? Math.max(1, Math.min(3600, arg30.idleSeconds))
          : 30,
      };
      (object6.enabled === object5.enabled && object6.idleSeconds === object5.idleSeconds) ||
        ((object5 = object6), fn4(arg31));
    },
    setAvailable(arg32, arg33 = arg26()) {
      value20 ||
        value17 === !!arg32 ||
        ((value17 = !!arg32), value17 || (value18 = false), fn4(arg33));
    },
    hold(arg34, arg35 = arg26()) {
      value20 || ((value18 = !!arg34), fn4(arg35));
    },
    activity: fn4,
    tick(arg36 = arg26()) {
      value20 ||
        !object5.enabled ||
        !value17 ||
        value18 ||
        (arg36 - value21 >= object5.idleSeconds * 1000 && fn3(true));
    },
    dispose() {
      value20 || ((value20 = true), (value17 = false), (value18 = false), fn3(false));
    },
    get hidden() {
      return value19;
    },
    nextDelay(arg37 = arg26()) {
      return value20 || !object5.enabled || !value17 || value18 || value19
        ? Infinity
        : Math.max(0, value21 + object5.idleSeconds * 1000 - arg37);
    },
  };
}
