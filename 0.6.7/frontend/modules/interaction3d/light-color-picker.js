const {
  hsToRgbColor: k,
  lightColorPickerHsFromPoint: A,
  lightColorPickerPointFromHs: E,
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../static/renderer/light-runtime.js", import.meta.url))
  : import(
      new URL(
        "../../../../bridge-static/renderer/light-runtime.js?v=20260926-rgb-edge-v1",
        import.meta.url,
      )
    ));
export function createLightColorPicker({ onPreview: arg1, onCommit: arg2, onCancel: arg3 }) {
  const value1 = document.createElement("div");
  ((value1.className = "i3d-color-picker"),
    value1.setAttribute("role", "slider"),
    value1.setAttribute("aria-label", "选择灯光颜色"));
  const value2 = document.createElement("i");
  ((value2.className = "i3d-color-handle"), value1.append(value2));
  let list1 = [0, 0],
    value3 = false,
    text1 = "",
    value4 = null,
    value5 = null;
  const fn1 = () => {
    const value6 = value1.getBoundingClientRect(),
      value7 = E(list1, value6.width / value6.height);
    (value1.style.setProperty("--i3d-color-x", value7.x * 100 + "%"),
      value1.style.setProperty("--i3d-color-y", value7.y * 100 + "%"),
      value1.style.setProperty("--i3d-color", "rgb(" + k(list1).join(",") + ")"),
      value1.setAttribute(
        "aria-valuetext",
        "色相 " + Math.round(list1[0]) + " 度，饱和度 " + Math.round(list1[1]) + "%",
      ));
  };
  function fn2() {
    const value8 = value4;
    if (((value4 = null), value8 !== null))
      try {
        value1.releasePointerCapture?.(value8);
      } catch {}
  }
  function fn3() {
    fn2();
    const value9 = value5;
    ((value5 = null), value9 !== null && arg3(text1, value9));
  }
  const fn4 = (arg4) => {
      ((list1 = arg4), fn1(), (value5 = arg1([...list1])));
    },
    fn5 = (arg5) => {
      const value10 = value1.getBoundingClientRect();
      !value10.width ||
        !value10.height ||
        fn4(
          A(
            (arg5.clientX - value10.left) / value10.width,
            (arg5.clientY - value10.top) / value10.height,
            value10.width / value10.height,
          ),
        );
    };
  return (
    value1.addEventListener("pointerdown", (arg6) => {
      !value3 ||
        value4 !== null ||
        (arg6.button !== undefined && arg6.button !== 0) ||
        ((value4 = arg6.pointerId),
        value1.setPointerCapture?.(value4),
        fn5(arg6),
        arg6.preventDefault());
    }),
    value1.addEventListener("pointermove", (arg7) => {
      value4 === arg7.pointerId && fn5(arg7);
    }),
    value1.addEventListener("pointerup", (arg8) => {
      value4 === arg8.pointerId && (fn5(arg8), fn2(), (value5 = null), arg2([...list1]));
    }),
    value1.addEventListener("pointercancel", fn3),
    value1.addEventListener("lostpointercapture", () => {
      value4 !== null && fn3();
    }),
    value1.addEventListener("keydown", (arg9) => {
      if (!value3) return;
      if (arg9.key === "Escape") {
        (fn3(), arg9.preventDefault());
        return;
      }
      if (arg9.key === "Enter" || arg9.key === " ") {
        ((value5 = null), arg2([...list1]), arg9.preventDefault());
        return;
      }
      const value11 = arg9.shiftKey ? 10 : 3;
      let [value12, value13] = list1;
      if (arg9.key === "ArrowLeft") value12 -= value11;
      else {
        if (arg9.key === "ArrowRight") value12 += value11;
        else {
          if (arg9.key === "ArrowUp") value13 -= value11;
          else {
            if (arg9.key === "ArrowDown") value13 += value11;
            else return;
          }
        }
      }
      (fn4([((value12 % 360) + 360) % 360, Math.max(0, Math.min(100, value13))]),
        arg9.preventDefault());
    }),
    {
      root: value1,
      cancel: fn3,
      dispose: fn3,
      update(arg10) {
        ((text1 !== arg10.entityId || !arg10.enabled || !arg10.visible) && fn3(),
          (text1 = arg10.entityId),
          (value3 = arg10.enabled && arg10.visible),
          (value1.hidden = !arg10.visible),
          (value1.tabIndex = value3 ? 0 : -1),
          value1.setAttribute("aria-disabled", String(!value3)),
          value4 === null && value5 === null && ((list1 = arg10.hs || [0, 0]), fn1()));
      },
    }
  );
}
export function createLightModeMenu(arg11) {
  const fn6 = (arg12, arg13) => {
      const value18 = document.createElement(arg12);
      return ((value18.className = arg13), value18);
    },
    value14 = fn6("div", "i3d-light-mode"),
    value15 = fn6("button", "i3d-light-mode-trigger");
  ((value15.type = "button"),
    value15.setAttribute("aria-label", "灯光模式"),
    value15.setAttribute("aria-haspopup", "menu"));
  const value16 = fn6("span", "");
  value15.append(value16);
  const value17 = fn6("div", "i3d-light-mode-menu");
  (value17.setAttribute("role", "menu"),
    value17.setAttribute("aria-label", "灯光模式"),
    value14.append(value15, value17));
  let text2 = "",
    text3 = "",
    text4 = "";
  const list2 = [],
    fn7 = () => list2.filter((arg14) => !arg14.hidden);
  function fn8(arg15 = false) {
    ((value17.hidden = true),
      value15.setAttribute("aria-expanded", "false"),
      arg15 && !value15.disabled && value15.focus());
  }
  function fn9(arg16 = false) {
    if (value15.disabled || value14.hidden) return;
    ((value17.hidden = false), value15.setAttribute("aria-expanded", "true"));
    const value19 = fn7();
    (arg16
      ? value19.at(-1)
      : value19.find((arg17) => arg17.value === text2) || value19[0]
    )?.focus();
  }
  for (const [value20, value21] of [
    ["color", "彩光"],
    ["temperature", "色温"],
    ["white", "白光"],
  ]) {
    const value22 = fn6("button", "i3d-light-mode-option");
    ((value22.type = "button"),
      (value22.value = value20),
      (value22.textContent = value21),
      (value22.tabIndex = -1),
      value22.setAttribute("role", "menuitemradio"),
      value22.addEventListener("click", () => {
        value15.disabled || value22.hidden || (fn8(true), text2 !== value20 && arg11(value20));
      }),
      value17.append(value22),
      list2.push(value22));
  }
  (value15.addEventListener("click", () => (value17.hidden ? fn9() : fn8())),
    value15.addEventListener("keydown", (arg18) => {
      ["ArrowDown", "ArrowUp"].includes(arg18.key) &&
        (arg18.preventDefault(), arg18.stopPropagation(), fn9(arg18.key === "ArrowUp"));
    }),
    value14.addEventListener("keydown", (arg19) => {
      if (value17.hidden) return;
      if (arg19.key === "Escape") {
        (arg19.preventDefault(), arg19.stopPropagation(), fn8(true));
        return;
      }
      if (arg19.key === "Tab") {
        fn8(true);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(arg19.key)) return;
      (arg19.preventDefault(), arg19.stopPropagation());
      const value23 = fn7(),
        value24 = value23.indexOf(document.activeElement),
        value25 =
          arg19.key === "Home"
            ? 0
            : arg19.key === "End"
              ? value23.length - 1
              : (value24 + (arg19.key === "ArrowDown" ? 1 : -1) + value23.length) % value23.length;
      value23[value25]?.focus();
    }),
    value14.addEventListener("focusout", (arg20) => {
      value14.contains(arg20.relatedTarget) || fn8();
    }));
  const fn10 = (arg21) => {
    value14.contains(arg21.target) || fn8();
  };
  return (
    document.addEventListener("pointerdown", fn10, true),
    fn8(),
    {
      root: value14,
      close: fn8,
      dispose() {
        (document.removeEventListener("pointerdown", fn10, true), fn8());
      },
      update({ modes: arg22, value: arg23, disabled: arg24, entity: arg25 }) {
        const value26 = Object.keys(arg22)
          .filter((arg26) => arg22[arg26])
          .join(",");
        ((text3 !== arg25 || text4 !== value26 || arg24) && fn8(),
          (text3 = arg25),
          (text4 = value26),
          (text2 = arg23),
          (value14.hidden = Object.values(arg22).filter(Boolean).length < 2),
          (value15.disabled = arg24));
        for (const value27 of list2)
          ((value27.hidden = !arg22[value27.value]),
            value27.setAttribute("aria-checked", String(value27.value === text2)),
            value27.value === text2 && (value16.textContent = value27.textContent));
      },
    }
  );
}
