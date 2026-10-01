const g = 1.5;
export function createDemandFrameLoop({
  step: arg1,
  onWake: arg2 = () => {},
  now: arg3 = () => performance.now(),
  maxFps: arg4 = 60,
  requestFrame: arg5 = (arg9) => requestAnimationFrame(arg9),
  cancelFrame: arg6 = (arg10) => cancelAnimationFrame(arg10),
  schedule: arg7 = (arg11, arg12) => setTimeout(arg11, arg12),
  cancel: arg8 = (arg13) => clearTimeout(arg13),
}) {
  let value1 = null,
    value2 = null,
    value3 = true,
    value4 = false,
    value5 = false,
    value6 = false,
    value7 = -Infinity;
  const value8 =
      arg4 === Infinity ? 0 : 1000 / (Number.isFinite(arg4) && arg4 > 0 ? Math.min(arg4, 60) : 60),
    object1 = {
      frames: 0,
      deadlines: 0,
    };
  function fn1() {
    (value1 !== null && arg6(value1), value2 !== null && arg8(value2), (value1 = value2 = null));
  }
  function fn2() {
    if (!(value4 || !value3)) {
      if (value5) {
        value6 = true;
        return;
      }
      (value2 !== null && arg8(value2),
        (value2 = null),
        value1 === null && (arg2(), (value1 = arg5(fn3))));
    }
  }
  function fn3(arg14 = arg3()) {
    if (((value1 = null), value4 || !value3)) return;
    if (arg14 + 1.5 < value7) {
      value1 = arg5(fn3);
      return;
    }
    ((value7 = arg14 - value7 >= value8 ? arg14 + value8 : value7 + value8),
      (value5 = true),
      (value6 = false),
      object1.frames++);
    let value9 = Infinity;
    try {
      value9 = arg1(arg14);
    } finally {
      value5 = false;
    }
    value4 ||
      !value3 ||
      (value6 || value9 <= 0
        ? (value1 = arg5(fn3))
        : Number.isFinite(value9) &&
          (value2 = arg7(() => {
            ((value2 = null), object1.deadlines++, fn2());
          }, value9)));
  }
  return {
    wake: fn2,
    stats: object1,
    wakeAnimation() {
      value5 || fn2();
    },
    setAvailable(arg15) {
      value4 ||
        value3 === !!arg15 ||
        ((value3 = !!arg15), value3 ? fn2() : (fn1(), (value7 = -Infinity)));
    },
    dispose() {
      ((value4 = true), fn1());
    },
    get pending() {
      return value1 !== null || value2 !== null;
    },
  };
}
