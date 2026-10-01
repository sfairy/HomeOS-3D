const p = new WeakMap(),
  F = 580,
  h = 24,
  v = ".hb-interaction3d-host, iframe, video, audio, object, embed",
  y = ["translate", "opacity", "transition", "willChange", "pointerEvents"];
function S(arg1) {
  return (
    (
      arg1.context.document?.pages?.find((arg2) => arg2.id === arg1.context.page?.id) ||
      arg1.context.page
    )?.sharedComponentIds || []
  );
}
function L(arg3) {
  let value1 = arg3;
  for (let value2 = 0; value2 < 8; value2++)
    value1 = Math.max(
      0,
      Math.min(
        1,
        value1 -
          (0.6 * value1 - 0.6 * value1 * value1 + value1 * value1 * value1 - arg3) /
            (0.6 - 1.2 * value1 + 3 * value1 * value1),
      ),
    );
  return value1 * value1 * (3 - 2 * value1);
}
function z(arg4) {
  return !arg4 || arg4 === "none"
    ? ["0px", "0px"]
    : arg4.match(/(?:calc\([^)]*\)|[^\s])+/g) || ["0px", "0px"];
}
const N =
    "a[href], area[href], button, input, select, textarea, [tabindex], [contenteditable], summary",
  x = ["pointerdown", "click", "dblclick", "contextmenu", "keydown", "focusin"];
function E(arg5, arg6) {
  const list1 = [arg5, ...arg5.querySelectorAll(N)];
  for (const value3 of list1)
    value3.tabIndex >= 0 &&
      !arg6.tabStops.has(value3) &&
      (arg6.tabStops.set(value3, value3.getAttribute("tabindex")),
      value3.setAttribute("tabindex", "-1"));
}
function A(arg7, arg8, arg9) {
  if (arg8.hidden === arg9) return;
  if (((arg8.hidden = arg9), arg9))
    (E(arg7, arg8),
      arg7.contains(arg7.ownerDocument.activeElement) && arg7.ownerDocument.activeElement.blur(),
      (arg7.style.pointerEvents = "none"));
  else {
    for (const [value5, value6] of arg8.tabStops)
      value6 === null
        ? value5.removeAttribute("tabindex")
        : value5.setAttribute("tabindex", value6);
    (arg8.tabStops.clear(), (arg7.style.pointerEvents = arg8.style.pointerEvents));
  }
  const value4 = arg9 ? "true" : arg8.ariaHidden;
  arg7.getAttribute("aria-hidden") !== value4 &&
    (value4 === null
      ? arg7.removeAttribute("aria-hidden")
      : arg7.setAttribute("aria-hidden", value4));
}
function w(arg10, arg11, arg12, arg13) {
  const [value7, value9 = "0px", value8] = arg12.translate;
  ((arg11.style.translate =
    "calc(" +
    value7 +
    " - " +
    arg10.distance * arg13 +
    "px) " +
    value9 +
    (value8 ? " " + value8 : "")),
    (arg11.style.opacity = String(arg12.opacity * (1 - arg13))),
    A(arg11, arg12, arg13 > 0 || (arg10.owners.size > 0 && arg10.targets.has(arg11))));
}
function M(arg14, arg15, arg16) {
  for (const value10 of y) arg15.style[value10] = arg16.style[value10];
  (A(arg15, arg16, false), arg14.members.delete(arg15), arg14.targets.delete(arg15));
}
function I(arg17) {
  (arg17.frame !== null && arg17.view.cancelAnimationFrame(arg17.frame), (arg17.frame = null));
}
function b(arg18) {
  for (const value11 of arg18.targets) {
    const value12 = arg18.members.get(value11);
    value12 && w(arg18, value11, value12, arg18.amount);
  }
}
function D(arg19, arg20, arg21 = true) {
  if (arg19.to === arg20 && ((arg21 && arg19.frame !== null) || arg19.amount === arg20)) {
    b(arg19);
    return;
  }
  I(arg19);
  const value13 = arg19.amount;
  if (
    ((arg19.to = arg20),
    !arg21 || arg19.view.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  ) {
    ((arg19.amount = arg20), b(arg19));
    return;
  }
  const value14 = arg19.view.performance.now(),
    value15 = F * Math.abs(arg20 - value13),
    fn1 = (arg22) => {
      arg19.frame = null;
      const value16 = value15 ? Math.max(0, Math.min(1, (arg22 - value14) / value15)) : 1;
      ((arg19.amount = value13 + (arg20 - value13) * L(value16)),
        b(arg19),
        value16 < 1 && (arg19.frame = arg19.view.requestAnimationFrame(fn1)));
    };
  arg19.frame = arg19.view.requestAnimationFrame(fn1);
}
function g(arg23) {
  const list2 = [...arg23.clients],
    set1 = new Set(list2.flatMap(S)),
    set2 = new Set([...arg23.owners].flatMap(S)),
    value17 = [...arg23.canvas.children].filter((arg24) => {
      const value21 =
        arg24.dataset?.componentId || arg24.dataset?.effectFor || arg24.dataset?.airflowFor;
      return (
        set1.has(value21) &&
        !list2.some((arg25) => arg24.contains(arg25.root)) &&
        !arg24.matches?.(v) &&
        !arg24.querySelector?.(v)
      );
    }),
    set3 = new Set(value17);
  for (const [value22, value23] of arg23.members) set3.has(value22) || M(arg23, value22, value23);
  const value18 = arg23.canvas.getBoundingClientRect(),
    value19 = value18.width / arg23.canvas.clientWidth || 1;
  let value20 = h;
  for (const value24 of value17) {
    let value25 = arg23.members.get(value24);
    const value26 = value24.getBoundingClientRect();
    if (
      ((value20 = Math.max(
        value20,
        (value26.right - value18.left) / value19 +
          h +
          (value25 && arg23.targets.has(value24) ? arg23.distance * arg23.amount : 0),
      )),
      !value25)
    ) {
      const value27 = arg23.view.getComputedStyle(value24);
      ((value25 = {
        style: Object.fromEntries(y.map((arg26) => [arg26, value24.style[arg26] || ""])),
        opacity: Number(value27.opacity),
        translate: z(value27.translate),
        hidden: false,
        tabStops: new Map(),
        ariaHidden: value24.getAttribute("aria-hidden"),
      }),
        arg23.members.set(value24, value25),
        (value24.style.transition = "none"),
        (value24.style.willChange = [value25.style.willChange, "opacity", "translate"]
          .filter((arg27) => arg27 && arg27 !== "auto")
          .join(",")),
        w(arg23, value24, value25, 0));
    }
  }
  if (((arg23.distance = value20), arg23.owners.size)) {
    const set4 = new Set(
      value17.filter((arg28) =>
        set2.has(arg28.dataset.componentId || arg28.dataset.effectFor || arg28.dataset.airflowFor),
      ),
    );
    for (const value28 of arg23.targets)
      !set4.has(value28) &&
        arg23.members.has(value28) &&
        (arg23.targets.delete(value28), w(arg23, value28, arg23.members.get(value28), 0));
    arg23.targets = set4;
  }
  b(arg23);
}
function C(arg29, arg30) {
  if ((arg29.owners.delete(arg30), arg29.clients.delete(arg30), arg29.clients.size))
    (g(arg29), D(arg29, arg29.owners.size ? 1 : 0, false));
  else {
    (I(arg29), arg29.observer.disconnect());
    for (const value29 of x) arg29.canvas.removeEventListener(value29, arg29.guard, true);
    for (const [value30, value31] of arg29.members) M(arg29, value30, value31);
    p.get(arg29.canvas) === arg29 && p.delete(arg29.canvas);
  }
}
export function createInteraction3dFocusLayout(arg31, arg32 = {}) {
  const object1 = {
    root: arg31,
    context: arg32,
  };
  let value32 = null,
    value33 = false,
    value34 = false;
  const fn2 = () => {
    if (value34 || arg32.editable) return;
    const value35 = arg31.closest(".hb-renderer-canvas");
    if (value32?.canvas !== value35) {
      if ((value32 && C(value32, object1), (value32 = null), !value35)) return;
      if (((value32 = p.get(value35)), !value32)) {
        const value36 = value35.ownerDocument.defaultView;
        value32 = {
          canvas: value35,
          view: value36,
          clients: new Set(),
          owners: new Set(),
          members: new Map(),
          targets: new Set(),
          frame: null,
          amount: 0,
          to: 0,
          distance: h,
        };
        const value37 = value32;
        value32.guard = (arg33) => {
          for (const [value38, value39] of value37.members)
            if (value39.hidden && value38.contains(arg33.target)) {
              (arg33.preventDefault(),
                arg33.stopImmediatePropagation(),
                arg33.type === "focusin" && arg33.target.blur());
              return;
            }
        };
        for (const value40 of x) value35.addEventListener(value40, value32.guard, true);
        ((value32.observer = new value36.MutationObserver((arg34) => {
          arg34.some((arg35) => arg35.target === value35) && g(value37);
          for (const [value41, value42] of value37.members) value42.hidden && E(value41, value42);
        })),
          value32.observer.observe(value35, {
            childList: true,
            subtree: true,
          }),
          p.set(value35, value32));
      }
      value32.clients.add(object1);
    }
    value32 &&
      (value33 ? value32.owners.add(object1) : value32.owners.delete(object1),
      g(value32),
      D(value32, value32.owners.size ? 1 : 0));
  };
  return {
    refresh: fn2,
    setActive(arg36) {
      value34 || arg32.editable || ((value33 = arg36 === true), fn2());
    },
    dispose() {
      value34 || ((value34 = true), value32 && C(value32, object1), (value32 = null));
    },
  };
}
