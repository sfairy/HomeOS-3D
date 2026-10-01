export function createBackgroundCache({
  THREE: arg1,
  renderer: arg2,
  makeCanvas: arg3 = () => document.createElement("canvas"),
  now: arg4 = () => performance.now(),
  settleMs: arg5 = 250,
  maxPixels: arg6 = 4 * 1024 * 1024,
}) {
  const value1 = new arg1.Scene();
  let value2 = null,
    value3 = null,
    value4 = null,
    value5 = null,
    value6 = false,
    value7 = -Infinity,
    value8 = false,
    value9 = false,
    value10 = 0,
    value11 = 0;
  const object1 = {
    captures: 0,
    backgroundFrames: 0,
    fullFrames: 0,
    pixels: 0,
    failures: 0,
  };
  function fn1() {
    ((value6 = false), value2 && (value2.hidden = true));
  }
  function fn2() {
    (fn1(),
      value2 && ((value2.width = value2.height = 0), value2.remove()),
      (value2 = value3 = null),
      (value10 = value11 = 0),
      value5?.removeFromParent(),
      (value5 = value4 = null),
      (object1.pixels = 0));
  }
  function fn3(arg7) {
    const value12 = arg2.domElement,
      value13 = value12.width,
      value14 = value12.height;
    if (!value12.parentElement || value13 < 1 || value14 < 1 || value13 * value14 > arg6)
      return (fn2(), false);
    if (!value2) {
      if (
        ((value2 = arg3()),
        (value3 = value2.getContext("2d", {
          alpha: true,
        })),
        !value3)
      )
        throw Error("Background snapshot unavailable");
      ((value2.className = "i3d-background-house-cache"),
        value2.setAttribute("aria-hidden", "true"),
        Object.assign(value2.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: "1",
        }),
        (value2.hidden = true),
        value12.parentElement.append(value2));
    }
    return (
      (value13 !== value10 || value14 !== value11) &&
        ((value2.width = value10 = value13),
        (value2.height = value11 = value14),
        (value6 = false),
        (object1.pixels = value13 * value14)),
      value4 !== arg7 &&
        (value5?.removeFromParent(),
        (value4 = arg7),
        (value5 = arg7.clone(false)),
        value1.add(value5),
        (value6 = false)),
      true
    );
  }
  function fn4(arg8) {
    ((value5.visible = true),
      arg2.render(value1, arg8),
      object1.backgroundFrames++,
      (value2.hidden = false));
  }
  function fn5(
    arg9,
    arg10,
    { background: arg11 = null, changed: arg12 = true, enabled: arg13 = true } = {},
  ) {
    const value15 = arg4(),
      value16 = arg2.domElement;
    if (
      (arg12 && (fn1(), (value7 = value15)),
      value9 ||
        value8 ||
        !arg13 ||
        !arg11?.visible ||
        !arg11.material?.visible ||
        arg2.getRenderTarget() ||
        value16.style.opacity === "0")
    ) {
      (fn2(), arg2.render(arg9, arg10), object1.fullFrames++);
      return;
    }
    if (arg12 || value15 - value7 < arg5) {
      (fn1(), arg2.render(arg9, arg10), object1.fullFrames++);
      return;
    }
    try {
      if (!fn3(arg11)) {
        (arg2.render(arg9, arg10), object1.fullFrames++);
        return;
      }
      if (!value6) {
        const value17 = arg11.material,
          value18 = value17.visible,
          value19 = arg9.background,
          value20 = arg2.getClearAlpha();
        try {
          ((value17.visible = false),
            (arg9.background = null),
            arg2.setClearAlpha(0),
            arg2.render(arg9, arg10),
            object1.fullFrames++,
            value3.clearRect(0, 0, value10, value11),
            value3.drawImage(value16, 0, 0),
            (value6 = true),
            object1.captures++);
        } finally {
          ((value17.visible = value18), (arg9.background = value19), arg2.setClearAlpha(value20));
        }
      }
      fn4(arg10);
    } catch {
      (object1.failures++, (value8 = true), fn2(), arg2.render(arg9, arg10), object1.fullFrames++);
    }
  }
  return {
    render: fn5,
    clear: fn2,
    stats: object1,
    get active() {
      return value6 && !value2?.hidden;
    },
    dispose() {
      (fn2(), (value9 = true));
    },
  };
}
