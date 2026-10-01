export function createStartupPresentation({
  env: arg1 = globalThis,
  coverWindow: arg2 = null,
  onProgress: arg3 = () => {},
  onComplete: arg4 = () => {},
  onMotionComplete: arg5 = () => {},
  onPreparationFrame: arg6 = () => {},
  duration: arg7 = 320,
  onShadowsProgress: arg8 = null,
  onEffectsProgress: arg9 = null,
  waitForEffects: arg10 = false,
  shadowDuration: arg11 = 180,
  effectsDuration: arg12 = 240,
} = {}) {
  let text1 = "idle",
    value1 = null,
    value2 = null,
    value3 = null,
    value4 = null,
    value5 = null,
    value6 = false,
    value7 = !arg10,
    value8 = !arg10,
    value9 = null;
  const list1 = ["pointerdown", "wheel", "keydown"];
  function fn1() {
    (value1 !== null && arg1.cancelAnimationFrame(value1),
      value5 !== null && arg1.clearTimeout?.(value5),
      (value1 = value5 = null),
      arg2?.removeEventListener("hb-display-reveal", fn9));
    for (const value10 of list1) arg1.removeEventListener(value10, fn3, true);
    (arg1.removeEventListener("pagehide", fn11),
      arg1.document?.removeEventListener("visibilitychange", fn4));
  }
  function fn2() {
    value6 || ((value6 = true), arg3(1), arg5());
  }
  function fn3() {
    text1 === "done" ||
      text1 === "disposed" ||
      ((text1 = "done"), fn1(), fn2(), arg8?.(1), arg9?.(1), arg4());
  }
  function fn4() {
    arg1.document?.hidden && fn3();
  }
  function fn5() {
    text1 === "running" && value6 && value1 === null && (value1 = arg1.requestAnimationFrame(fn8));
  }
  function fn6() {
    text1 === "done" || text1 === "disposed" || value7 || ((value7 = true), fn5());
  }
  function fn7() {
    text1 === "done" || text1 === "disposed" || value8 || ((value8 = true), fn5());
  }
  function fn8(arg13) {
    if (((value1 = null), text1 !== "running")) return;
    value2 ??= arg13;
    const value11 = Math.min(1, Math.max(0, (arg13 - value2) / arg7));
    if (
      (arg3(1 - (1 - value11) ** 3),
      value6 ||
        (arg6(value11 >= 0.5 && value11 < 1 && value9 !== null && arg13 - value9 <= 24),
        (value9 = arg13)),
      value11 < 1)
    ) {
      value1 = arg1.requestAnimationFrame(fn8);
      return;
    }
    if ((fn2(), !arg8 && !arg9)) {
      fn3();
      return;
    }
    if (
      ((value5 ??=
        arg1.setTimeout?.(() => {
          (fn6(), fn7());
        }, 3000) ?? null),
      arg8)
    ) {
      if (!value7) return;
      value3 ??= arg13;
      const value13 = Math.min(1, Math.max(0, (arg13 - value3) / arg11));
      if ((arg8(value13 * value13 * (3 - 2 * value13)), value13 < 1)) {
        value1 = arg1.requestAnimationFrame(fn8);
        return;
      }
    }
    if (!arg9) {
      fn3();
      return;
    }
    if (!value8) return;
    value4 ??= arg13;
    const value12 = Math.min(1, Math.max(0, (arg13 - value4) / arg12));
    (arg9(value12 * value12 * (3 - 2 * value12)),
      value12 === 1 ? fn3() : (value1 = arg1.requestAnimationFrame(fn8)));
  }
  function fn9() {
    text1 === "waiting" &&
      (arg2?.removeEventListener("hb-display-reveal", fn9),
      (text1 = "running"),
      (value1 = arg1.requestAnimationFrame(fn8)));
  }
  function fn10() {
    if (text1 !== "idle") return;
    const value14 = arg2?.document?.getElementById("display-splash");
    if (
      !value14 ||
      arg1.document?.hidden ||
      arg1.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      fn3();
      return;
    }
    ((text1 = "waiting"), arg3(0), arg8?.(0), arg9?.(0));
    for (const value15 of list1) arg1.addEventListener(value15, fn3, true);
    (arg1.addEventListener("pagehide", fn11),
      arg1.document?.addEventListener("visibilitychange", fn4),
      arg2.addEventListener("hb-display-reveal", fn9),
      value14.classList.contains("is-leaving") && fn9());
  }
  function fn11() {
    text1 !== "disposed" && ((text1 = "disposed"), fn1(), arg3(1), arg8?.(1), arg9?.(1));
  }
  return {
    start: fn10,
    finish: fn3,
    shadowsReady: fn6,
    effectsReady: fn7,
    dispose: fn11,
    get phase() {
      return text1;
    },
  };
}
