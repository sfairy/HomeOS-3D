import { bathHeaterState as bathHeaterState2 } from "./bath-heater.js";
import {
  climateState as climateState2,
  climateControl as climateControl2,
  climatePowerControl as climatePowerControl2,
  climateModeLabel as climateModeLabel2,
  climateSwingModeLabel as climateSwingModeLabel2,
  createClimateModeHistory as createClimateModeHistory2,
  createWaterHeaterFeedback as createWaterHeaterFeedback2,
  waterHeaterStatusLabel as waterHeaterStatusLabel2,
} from "./climate-state.js?v=20260926-climate-capabilities-v1";
import { createPurifierExtras as createPurifierExtras2 } from "./purifier-extras.js?v=20260925-menu-bounds-v3-20260926-airer-v2";
import { purifierState as purifierState2 } from "./purifier-state.js";
const Me = (arg1, arg2) =>
    ({
      on: "开启",
      off: "关闭",
      middle: "居中",
    })[arg1] || climateSwingModeLabel2(arg1, arg2),
  Re = {
    auto: "自动",
    low: "低风",
    medium: "中风",
    high: "高风",
    middle: "中风",
    quiet: "静音",
    silent: "静音",
    turbo: "强劲",
    diffuse: "柔风",
    focus: "集中",
  },
  Be = {
    auto: "自动",
    silent: "静音",
    quiet: "静音",
    low: "低",
    medium: "中",
    middle: "中",
    high: "高",
    turbo: "强劲",
    sleep: "睡眠",
    favorite: "最爱",
    favorite_level: "最爱",
    strong: "强劲",
    normal: "标准",
    natural: "自然风",
  };
let De = 0;
function je(arg3, arg4) {
  const ownerDocument = arg3.ownerDocument,
    defaultView = ownerDocument.defaultView;
  let value = null,
    value2 = null,
    text = "",
    num = 0;
  function fn1(v1 = false) {
    if (!value) return;
    const v2 = value;
    ((value = null),
      value2 != null && defaultView?.cancelAnimationFrame?.(value2),
      (value2 = null));
    try {
      v2.menu.hidePopover?.();
    } catch {}
    ((v2.menu.hidden = true),
      v2.picker.append(v2.menu),
      v2.element.setAttribute("aria-expanded", "false"),
      ownerDocument.removeEventListener?.("pointerdown", fn2, true),
      ownerDocument.removeEventListener?.("scroll", fn3, true),
      ownerDocument.removeEventListener?.("keydown", fn4, true),
      v1 &&
        !v2.element.disabled &&
        v2.element.focus?.({
          preventScroll: true,
        }));
  }
  function fn2(arg5) {
    value && !value.picker.contains?.(arg5.target) && !value.menu.contains?.(arg5.target) && fn1();
  }
  function fn3(arg6) {
    value && !value.menu.contains?.(arg6.target) && fn1();
  }
  function fn4(arg7) {
    arg7.key === "Escape" && (arg7.preventDefault(), arg7.stopPropagation(), fn1(true));
  }
  function fn5() {
    if (!value) return;
    const { element: element2, menu: element3 } = value,
      boundingClientRect = element2.getBoundingClientRect();
    if (
      element2.disabled ||
      ownerDocument.hidden ||
      element2.isConnected === false ||
      (element2.getClientRects && !element2.getClientRects().length)
    ) {
      fn1();
      return;
    }
    const v3 = defaultView?.getComputedStyle?.(element2);
    if (v3?.visibility === "hidden" || arg3.closest?.('[hidden], [aria-hidden="true"]')) {
      fn1();
      return;
    }
    const num2 = element2.offsetWidth || boundingClientRect.width || 1,
      num3 = element2.offsetHeight || boundingClientRect.height || 1,
      num4 = boundingClientRect.width / num2 || 1,
      num5 = boundingClientRect.height / num3 || 1,
      v4 = arg3.closest?.(".interaction3d-stage")?.getBoundingClientRect(),
      v5 = defaultView?.visualViewport,
      v6 = Math.max(v5?.offsetLeft || 0, v4?.left || 0) + 8,
      v7 = Math.max(v5?.offsetTop || 0, v4?.top || 0) + 8,
      v8 =
        Math.min(
          (v5?.offsetLeft || 0) + (v5?.width || defaultView?.innerWidth || 1024),
          v4?.right ?? Infinity,
        ) - 8,
      v9 =
        Math.min(
          (v5?.offsetTop || 0) + (v5?.height || defaultView?.innerHeight || 768),
          v4?.bottom ?? Infinity,
        ) - 8;
    if (v8 <= v6 || v9 <= v7 || boundingClientRect.bottom < v7 || boundingClientRect.top > v9) {
      fn1();
      return;
    }
    element3.dataset.theme = arg3.closest?.("[data-scene-style]")?.dataset.sceneStyle || "";
    const min = Math.min(Math.max(num2, 320), (v8 - v6) / num4);
    Object.assign(element3.style, {
      width: "max-content",
      minWidth: Math.min(Math.max(num2, 112), min) + "px",
      maxWidth: min + "px",
    });
    const min2 = Math.min(element3.offsetWidth || Math.max(num2, 112), min);
    Object.assign(element3.style, {
      width: min2 + "px",
      transform: "scale(" + num4 + "," + num5 + ")",
      transformOrigin: "0 0",
    });
    const v10 = Math.min(280, (element3.scrollHeight || value.choices.length * 40 + 12) + 2) * num5,
      max = Math.max(
        0,
        v9 -
          (boundingClientRect.bottom ?? boundingClientRect.top + boundingClientRect.height) -
          4 * num5,
      ),
      max2 = Math.max(0, boundingClientRect.top - v7 - 4 * num5),
      v11 = max < v10 && max2 > max,
      min3 = Math.min(v9 - v7, v11 ? max2 : max),
      min4 = Math.min(v10, min3);
    (Object.assign(element3.style, {
      maxHeight: Math.min(280, min3 / num5) + "px",
      left: Math.max(v6, Math.min(boundingClientRect.left, v8 - min2 * num4)) + "px",
      top:
        Math.max(
          v7,
          Math.min(
            v11
              ? boundingClientRect.top - 4 * num5 - min4
              : (boundingClientRect.bottom ?? boundingClientRect.top + boundingClientRect.height) +
                  4 * num5,
            v9 - min4,
          ),
        ) + "px",
    }),
      element3.style.setProperty(
        "--i3d-climate-accent",
        v3?.getPropertyValue("--i3d-climate-accent") || "#73c8ff",
      ));
  }
  function fn6() {
    ((value2 = null), fn5(), value && (value2 = defaultView?.requestAnimationFrame?.(fn6) ?? null));
  }
  function fn7(arg8, arg9) {
    arg8.choices.forEach((arg10, arg11) => {
      arg10.tabIndex = arg11 === arg9 ? 0 : -1;
    });
    const element4 = arg8.choices[arg9];
    if (
      (element4?.focus?.({
        preventScroll: true,
      }),
      element4 && arg8.menu.clientHeight)
    ) {
      const offsetTop = element4.offsetTop,
        v12 = offsetTop + element4.offsetHeight;
      offsetTop < arg8.menu.scrollTop
        ? (arg8.menu.scrollTop = offsetTop)
        : v12 > arg8.menu.scrollTop + arg8.menu.clientHeight &&
          (arg8.menu.scrollTop = v12 - arg8.menu.clientHeight);
    }
  }
  function fn8(arg12, v13 = false) {
    if (arg12.element.disabled) return;
    if (value === arg12) {
      fn1(true);
      return;
    }
    (fn1(),
      (value = arg12),
      (text = ""),
      (num = 0),
      (ownerDocument.body || arg12.picker).append(arg12.menu),
      (arg12.menu.hidden = false),
      arg12.element.setAttribute("aria-expanded", "true"));
    try {
      arg12.menu.showPopover?.();
    } catch {}
    if ((fn5(), !value)) return;
    (ownerDocument.addEventListener?.("pointerdown", fn2, true),
      ownerDocument.addEventListener?.("scroll", fn3, true),
      ownerDocument.addEventListener?.("keydown", fn4, true));
    const indexOf = arg12.values.indexOf(arg12.element.value);
    (fn7(arg12, indexOf < 0 ? (v13 ? arg12.choices.length - 1 : 0) : indexOf), fn6());
  }
  function fn9(arg13, arg14, arg15, arg16) {
    const v14 = arg4("div", "i3d-climate-picker"),
      element5 = arg4("button", "i3d-climate-choice i3d-climate-picker-value");
    ((element5.type = "button"),
      element5.setAttribute("role", "combobox"),
      element5.setAttribute("aria-label", arg13),
      element5.setAttribute("aria-haspopup", "listbox"),
      element5.setAttribute("aria-expanded", "false"));
    const element6 = arg4("div", "i3d-extra-select-menu i3d-climate-picker-menu");
    ((element6.id = "i3d-climate-options-" + ++De),
      (element6.hidden = true),
      element6.setAttribute("popover", "manual"),
      element6.setAttribute("role", "listbox"),
      element6.setAttribute("aria-label", arg13 + " 选项"),
      element5.setAttribute("aria-controls", element6.id));
    const options = {
      picker: v14,
      element: element5,
      menu: element6,
      values: arg14,
      labels: arg15,
      choices: [],
    };
    for (const v15 of arg14) {
      const element7 = arg4("button", "", arg15[v15] || v15);
      ((element7.type = "button"),
        (element7.value = v15),
        (element7.tabIndex = -1),
        element7.setAttribute("role", "option"),
        element7.setAttribute("aria-selected", "false"),
        element7.addEventListener("click", () => {
          if (!(value !== options || element5.disabled)) return (fn1(true), arg16(v15));
        }),
        options.choices.push(element7),
        element6.append(element7));
    }
    return (
      element5.addEventListener("click", () => fn8(options)),
      element5.addEventListener("keydown", (arg17) => {
        ["ArrowDown", "ArrowUp"].includes(arg17.key) &&
          (arg17.preventDefault(), fn8(options, arg17.key === "ArrowUp"));
      }),
      element6.addEventListener("keydown", (arg18) => {
        if (arg18.key === "Tab") {
          fn1(true);
          return;
        }
        if (arg18.key === "Escape") {
          (arg18.preventDefault(), arg18.stopPropagation(), fn1(true));
          return;
        }
        const indexOf2 = options.choices.indexOf(ownerDocument.activeElement),
          v16 = options.choices.length;
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(arg18.key))
          (arg18.preventDefault(),
            fn7(
              options,
              arg18.key === "Home"
                ? 0
                : arg18.key === "End"
                  ? v16 - 1
                  : (indexOf2 + (arg18.key === "ArrowDown" ? 1 : -1) + v16) % v16,
            ));
        else {
          if (
            arg18.key.length === 1 &&
            arg18.key !== " " &&
            !arg18.ctrlKey &&
            !arg18.metaKey &&
            !arg18.altKey &&
            !arg18.isComposing
          ) {
            arg18.preventDefault();
            const now = Date.now();
            ((text = now - num > 700 ? arg18.key : text + arg18.key), (num = now));
            const index = options.choices.findIndex((arg19) =>
              arg19.textContent.toLocaleLowerCase().startsWith(text.toLocaleLowerCase()),
            );
            index >= 0 && fn7(options, index);
          }
        }
      }),
      v14.append(element5, element6),
      options
    );
  }
  function fn10(arg20, arg21, arg22, arg23) {
    ((arg20.element.disabled = arg23),
      (arg20.element.value = arg21),
      (arg20.element.textContent = arg22 || "请选择"),
      (arg20.element.title = arg22 || ""),
      arg20.choices.forEach((arg24) => {
        arg24.setAttribute("aria-selected", String(arg24.value === arg21));
      }),
      value === arg20 && arg23 && fn1());
  }
  return {
    create: fn9,
    sync: fn10,
    close: fn1,
  };
}
export function createClimatePanel({
  element: v17,
  onControl: v18 = async () => {},
  onLayout: v19 = () => {},
  modeHistory: v20 = createClimateModeHistory2(),
} = {}) {
  const document = v17?.ownerDocument || globalThis.document,
    v21 = (arg25, arg26, v22 = "") => {
      const element8 = document.createElement(arg25);
      return ((element8.className = arg26), (element8.textContent = v22), element8);
    },
    v23 = (arg27, ...v24) => {
      if (typeof arg27.replaceChildren == "function") arg27.replaceChildren(...v24);
      else {
        for (const v25 of [...(arg27.children || [])]) v25.remove?.();
        arg27.append(...v24);
      }
    },
    element9 = v17 || v21("section", "");
  element9.classList.add("i3d-climate-panel");
  const je2 = je(element9, v21),
    v26 = v21("div", "i3d-climate-heading"),
    element10 = v21("h3", "", "空调"),
    element11 = v21("p", "", "尚未绑定设备"),
    element12 = v21("button", "i3d-climate-power");
  element12.type = "button";
  const v27 = v21("div", "i3d-climate-heading-text");
  (v27.append(element10, element11), v26.append(v27, element12));
  const v28 = v21("div", "i3d-climate-thermostat-slot"),
    v29 = v21("section", "hb-climate-thermostat"),
    element13 = v21("button", "hb-climate-temperature-step", "−"),
    element14 = v21("button", "hb-climate-temperature-step", "+");
  ((element13.type = element14.type = "button"),
    element13.setAttribute("aria-label", "降低设定温度"),
    element14.setAttribute("aria-label", "提高设定温度"));
  const v30 = v21("div", "i3d-climate-temperature-content"),
    element15 = v21("output", "i3d-climate-target"),
    element16 = v21("span", "", "当前温度 --");
  (element15.setAttribute("aria-label", "设定温度"),
    v30.append(v21("small", "", "设定温度"), element15, element16),
    v29.append(element13, v30, element14),
    v28.append(v29));
  const element17 = v21("button", "i3d-climate-choice");
  ((element17.type = "button"),
    element17.setAttribute("aria-label", "离家模式"),
    element17.addEventListener("click", () => fn16("set_away_mode", !v43.away)));
  const element18 = v21("p", "i3d-climate-feedback");
  (element18.setAttribute("role", "status"), (element18.hidden = true));
  const v31 = () =>
    createWaterHeaterFeedback2({
      onChange(arg28) {
        ((element18.textContent = arg28), (element18.hidden = !arg28));
      },
    });
  let v32 = v31();
  const element19 = v21("p", "i3d-climate-temperature-interval"),
    v33 = v21("div", "i3d-climate-groups i3d-climate-main-groups"),
    element20 = v21("p", "i3d-climate-empty"),
    element21 = v21("p", "i3d-climate-error"),
    v34 = v21("section", "i3d-climate-option-group"),
    element22 = v21("span", "", "风速"),
    element23 = v21("input", "");
  ((element23.type = "range"),
    (element23.min = "0"),
    (element23.max = "100"),
    element23.setAttribute("aria-label", "净化器风速"),
    element23.addEventListener("input", () => {
      element22.textContent = "风速 " + element23.value + "%";
    }),
    element23.addEventListener("change", () => fn16("set_percentage", Number(element23.value))));
  const element24 = v21("div", "i3d-climate-choices");
  (element24.setAttribute("role", "group"),
    element24.setAttribute("aria-label", "净化器风速档位"),
    v34.append(element22, element23, element24));
  let text2 = "",
    list = [];
  (element20.setAttribute("role", "status"), element21.setAttribute("role", "status"));
  const v35 = v21("section", "i3d-climate-range"),
    list2 = [];
  for (const [v36, v37] of [
    ["target_temp_low", "温区下限"],
    ["target_temp_high", "温区上限"],
  ]) {
    const v38 = v21("div", "hb-climate-thermostat"),
      element25 = v21("button", "hb-climate-temperature-step", "−"),
      element26 = v21("button", "hb-climate-temperature-step", "+");
    ((element25.type = element26.type = "button"),
      element25.setAttribute("aria-label", "降低" + v37),
      element26.setAttribute("aria-label", "提高" + v37));
    const v39 = v21("div", "i3d-climate-temperature-content"),
      element27 = v21("output", "i3d-climate-range-value");
    (element27.setAttribute("aria-label", v37),
      v39.append(v21("small", "", v37), element27),
      v38.append(element25, v39, element26),
      v35.append(v38),
      element25.addEventListener("click", () => fn14(v36, -1)),
      element26.addEventListener("click", () => fn14(v36, 1)),
      list2.push({
        field: v36,
        output: element27,
        decrease: element25,
        increase: element26,
      }));
  }
  const v40 = v21("div", "i3d-popup-body");
  (v40.append(element17, element18, v28, v35, element19, v34, v33, element20, element21),
    v23(element9, v26, v40));
  const v41 = v21("div", "i3d-climate-groups i3d-extra-grid");
  v40.append(v41);
  const v42 = createPurifierExtras2({
    element: v41,
    onControl: (arg29) =>
      v18(
        options2.item?.climateType === "bath-heater"
          ? {
              ...arg29,
              deviceKind: "climate-extra",
            }
          : options2.item?.pedestalFan
            ? {
                ...arg29,
                deviceKind: "fan-extra",
              }
            : v43.waterHeater
              ? {
                  ...arg29,
                  deviceKind: "water-heater-extra",
                }
              : !options2.item?.airPurifier && !v43.purifier
                ? {
                    ...arg29,
                    deviceKind: "climate-extra",
                  }
                : arg29,
        options2.item,
      ),
    onLayout: v19,
  });
  let options2 = {},
    v43 = climateState2("", null),
    v44 = false,
    v45 = false,
    text3 = "",
    num6 = 0,
    value3 = null,
    value4 = null,
    value5 = null,
    text4 = "",
    list3 = [],
    v46 = Promise.resolve(),
    num7 = 0;
  const v47 = () => !v44 && !options2.editing && !options2.busy && v43.available,
    v48 = () => {
      (value5 !== null && clearTimeout(value5), (value5 = null), (value4 = null), (value3 = null));
    };
  function fn11() {
    return value4 ?? v43.temperature;
  }
  function fn12(v49 = fn11()) {
    ((element15.value = v49 === null ? "" : String(v49)),
      (element15.textContent = v49 === null ? "--" : "" + v49 + (v43.temperatureUnit || "°")),
      (element16.textContent =
        v43.currentTemperature === null
          ? "当前温度 --"
          : "当前温度 " + v43.currentTemperature + (v43.temperatureUnit || "°")),
      (element13.disabled = !v47() || (v49 !== null && v49 <= v43.minimum)),
      (element14.disabled = !v47() || (v49 !== null && v49 >= v43.maximum)));
  }
  function fn13() {
    return (
      value3 || {
        target_temp_low: v43.targetLow,
        target_temp_high: v43.targetHigh,
      }
    );
  }
  function fn14(arg30, arg31) {
    if (!v47()) return;
    const v50 = fn13(),
      options3 = {
        target_temp_low: v50.target_temp_low ?? v43.minimum,
        target_temp_high: v50.target_temp_high ?? v43.maximum,
      };
    ((options3[arg30] += v50[arg30] === null ? 0 : arg31 * v43.step),
      (options3[arg30] =
        arg30 === "target_temp_low"
          ? Math.min(options3[arg30], options3.target_temp_high)
          : Math.max(options3[arg30], options3.target_temp_low)),
      fn16("set_temperature", options3));
  }
  async function fn15(arg32) {
    if (!v47()) return;
    const v51 = num6,
      value6 = num7 ? v46 : null;
    let v52;
    ((v46 = new Promise((arg33) => {
      v52 = arg33;
    })),
      num7++,
      (v45 = true),
      (text3 = ""),
      arg32.service === "set_temperature" &&
        (v48(),
        "temperature" in arg32.data
          ? (value4 = arg32.data.temperature)
          : (value3 = {
              ...arg32.data,
            }),
        (value5 = setTimeout(() => {
          ((value5 = null), (value4 = null), (value3 = null), v44 || fn19());
        }, 8000))),
      fn19());
    let value7 = null;
    try {
      if ((value6 && (await value6), v44 || v51 !== num6 || !v47())) return;
      (v43.waterHeater && (value7 = v32.begin(arg32)),
        await v18(
          options2.item?.pedestalFan
            ? {
                ...arg32,
                deviceKind: "fan",
              }
            : arg32,
          options2.item,
        ),
        value7 && (v32.sent(value7), v32.sync(v43.raw)));
    } catch (v53) {
      (value7 && v32.fail(value7, v53?.message),
        !v44 &&
          v51 === num6 &&
          ((text3 = v53?.message || "设备控制失败，请重试。"), num7 === 1 && v48()));
    } finally {
      (v52(), !v44 && v51 === num6 && (num7--, (v45 = num7 > 0), fn19()));
    }
  }
  function fn16(arg34, arg35) {
    if (v47())
      try {
        return fn15(climateControl2(v43, arg34, arg35));
      } catch (v54) {
        ((text3 = v54.message), fn19());
      }
  }
  function fn17({ toggle: v55 = true } = {}) {
    if (!v47() || (!v55 && v43.on)) return Promise.resolve(false);
    try {
      return fn15(climatePowerControl2(v43, v55 ? !v43.on : true, v20.get(v43.entityId)));
    } catch (v56) {
      return ((text3 = v56.message), fn19(), Promise.resolve(false));
    }
  }
  (element12.addEventListener("click", () => fn17()),
    element13.addEventListener("click", () =>
      fn16("set_temperature", fn11() === null ? v43.minimum : fn11() - v43.step),
    ),
    element14.addEventListener("click", () =>
      fn16("set_temperature", fn11() === null ? v43.minimum : fn11() + v43.step),
    ));
  function fn18() {
    (je2.close(), v23(v33), (list3 = []));
    const element28 = v21("div", "i3d-climate-primary-groups");
    ((element28.hidden = true), v33.append(element28));
    for (const [v57, v58, v59, v60, v61] of [
      [
        "运行模式",
        v43.purifier
          ? v43.presetModes
          : v43.waterHeater && !v43.nativePower
            ? v43.modes
            : v43.modes.filter((arg36) => arg36 !== "off"),
        v43.purifier ? "presetMode" : "mode",
        v43.purifier ? "set_preset_mode" : v43.waterHeater ? "set_operation_mode" : "set_hvac_mode",
        Object.fromEntries(
          (v43.purifier ? v43.presetModes : v43.modes).map((arg37) => [
            arg37,
            v43.purifier
              ? Be[String(arg37).trim().toLowerCase()] || arg37
              : climateModeLabel2(arg37, v43.waterHeater ? "water-heater" : "air-conditioner"),
          ]),
        ),
      ],
      ["风速", v43.fanModes, "fanMode", "set_fan_mode", Re],
      [
        v43.horizontalSwingModes?.length ? "上下摆风" : "摆风",
        v43.swingModes,
        "swingMode",
        "set_swing_mode",
        Object.fromEntries(v43.swingModes.map((arg38) => [arg38, Me(arg38)])),
      ],
      [
        "左右摆风",
        v43.horizontalSwingModes || [],
        "horizontalSwingMode",
        "set_swing_horizontal_mode",
        Object.fromEntries(
          (v43.horizontalSwingModes || []).map((arg39) => [arg39, Me(arg39, "horizontal")]),
        ),
      ],
      [
        "预设模式",
        !v43.purifier && !v43.waterHeater ? v43.presetModes : [],
        "presetMode",
        "set_preset_mode",
        Object.fromEntries(
          (v43.presetModes || []).map((arg40) => [arg40, climateModeLabel2(arg40)]),
        ),
      ],
      [
        "方向",
        v43.purifier && v43.directionSupported ? ["forward", "reverse"] : [],
        "direction",
        "set_direction",
        {
          forward: "正向",
          reverse: "反向",
        },
      ],
    ]) {
      if (!v58.length) continue;
      const v62 = v21("section", "i3d-climate-option-group"),
        v63 = v21("h4", "", v57);
      v62.append(v63);
      const includes =
          !v43.purifier && !v43.waterHeater && ["mode", "fanMode", "presetMode"].includes(v59),
        v64 = includes ? element28 : v33;
      if (
        (includes && (element28.hidden = false),
        includes ||
          (!v43.purifier &&
            !v43.waterHeater &&
            (v58.length > 4 || v58.some((arg41) => [...(v61[arg41] || arg41)].length > 8))))
      ) {
        const v65 = je2.create(v57, v58, v61, (arg42) => fn16(v60, arg42));
        (list3.push(
          Object.assign(v65, {
            field: v59,
            select: true,
          }),
        ),
          v62.append(v65.picker),
          v64.append(v62));
        continue;
      }
      const element29 = v21("div", "i3d-climate-choices");
      (element29.setAttribute("role", "group"),
        element29.setAttribute("aria-label", v57),
        options2.item?.pedestalFan &&
          v59 === "presetMode" &&
          element29.classList.add("i3d-fan-modes"));
      for (const v66 of v58) {
        const element30 = v21("button", "i3d-climate-choice", v61[v66] || v66);
        ((element30.type = "button"),
          element30.addEventListener("click", () => fn16(v60, v66)),
          list3.push({
            element: element30,
            field: v59,
            value: v66,
          }),
          element29.append(element30));
      }
      (v62.append(element29), v64.append(v62));
    }
    if (v43.purifier && v43.oscillatingSupported) {
      const v67 = v21("section", "i3d-climate-option-group"),
        v68 = v21("h4", "", options2.item?.pedestalFan ? "摇头" : "摆动"),
        element31 = v21("button", "i3d-climate-choice", v43.oscillating ? "已开启" : "已关闭");
      ((element31.type = "button"),
        element31.addEventListener("click", () => fn16("oscillate", !v43.oscillating)),
        list3.push({
          element: element31,
          field: "oscillating",
          value: true,
        }),
        v67.append(v68, element31),
        v33.append(v67));
    }
  }
  function fn19() {
    if (v44) return;
    const options4 = options2.item || {},
      v69 = !!options4.entityId,
      v70 = v47();
    (element9.setAttribute(
      "aria-label",
      options4.climateType === "bath-heater"
        ? "浴霸控制"
        : v43.waterHeater
          ? "热水器控制"
          : options4.airPurifier
            ? "空气净化器控制"
            : v43.purifier
              ? "风扇控制"
              : "空调控制",
    ),
      (element10.textContent = options4.label || v43.name || "空调"),
      (element10.title = element10.textContent),
      (element11.textContent = options2.editing
        ? "控制预览"
        : v69
          ? v43.available
            ? v43.on
              ? climateModeLabel2(v43.mode)
              : "已关闭"
            : "设备不可用"
          : "尚未绑定设备"),
      v43.purifier &&
        v43.available &&
        !options2.editing &&
        (element11.textContent = v43.on ? (options4.pedestalFan ? "运行中" : "净化中") : "已关闭"),
      v43.waterHeater &&
        v43.available &&
        !options2.editing &&
        (element11.textContent = waterHeaterStatusLabel2(v43.raw)),
      options4.waterHeater &&
        !v69 &&
        !options2.editing &&
        (options4.deviceId || options4.extraControls?.length) &&
        (element11.textContent = "各功能独立控制"),
      options4.climateType === "bath-heater" &&
        !options2.editing &&
        (element11.textContent = bathHeaterState2(options4, options2.states).label));
    const value8 = options4.airPurifier ? purifierState2(options4, options2.states) : null;
    (value8 && !options2.editing && (element11.textContent = value8.label),
      element9.classList.toggle("is-air-conditioner-panel", !v43.purifier && !v43.waterHeater),
      element9.classList.toggle("is-fan-panel", !!options4.pedestalFan),
      (element23.className = "i3d-control-range"),
      element23.setAttribute("aria-label", options4.pedestalFan ? "电风扇风速" : "净化器风速"),
      element24.setAttribute(
        "aria-label",
        options4.pedestalFan ? "电风扇风速档位" : "净化器风速档位",
      ));
    const v71 = value8 || v43;
    ((element9.dataset.climateMode = v71.available ? v71.visualMode : "off"),
      element9.classList.toggle("is-preview", !!options2.editing),
      element9.classList.toggle("is-on", v71.available && v71.on),
      element9.classList.toggle("is-running", v71.available && v71.running),
      (element17.hidden = !v43.waterHeater || !v43.awaySupported),
      (element17.disabled = !v70 || v45),
      (element17.textContent = v43.away ? "离家模式 · 已开启" : "离家模式 · 已关闭"),
      element17.setAttribute("aria-pressed", String(!!v43.away)),
      (element12.hidden =
        !!(
          (options4.climateType === "bath-heater" || options4.airPurifier) &&
          !options4.entityId
        ) || !!(v43.waterHeater && !v43.canTurnOn && !v43.canTurnOff)),
      (element12.textContent = v43.on ? "关闭" : "开启"),
      element9.setAttribute("aria-busy", String(v45 || !!options2.busy)),
      (element12.disabled =
        !v70 ||
        (!v43.turnOnSupported && !v43.modes.some((arg43) => arg43 !== "off")) ||
        (v43.on && !v43.waterHeater && !v43.modes.includes("off"))),
      !v43.waterHeater &&
        !v43.purifier &&
        (element12.disabled = !v70 || (v43.on ? !v43.canTurnOff : !v43.canTurnOn)),
      v43.waterHeater &&
        (element12.disabled = !v70 || v45 || (v43.on ? !v43.canTurnOff : !v43.canTurnOn)),
      element12.setAttribute("aria-pressed", String(v43.on)),
      element12.setAttribute(
        "aria-label",
        element10.textContent +
          "，" +
          (v43.on ? "关闭" : "开启") +
          (options4.climateType === "bath-heater"
            ? "浴霸主实体"
            : v43.waterHeater
              ? "热水器"
              : options4.pedestalFan
                ? "电风扇"
                : v43.purifier
                  ? "空气净化器"
                  : "空调"),
      ),
      (v28.hidden = element15.hidden = !v43.temperatureSupported || v43.useTemperatureRange),
      (v35.hidden = !v43.useTemperatureRange),
      (v34.hidden = !v43.purifier || !v43.percentageSupported),
      (element23.disabled = !v70),
      (element23.step = String(v43.percentageStep || 1)),
      (element23.value = String(v43.percentage ?? 0)),
      (element22.textContent = "风速 " + (v43.percentage ?? "--") + "%"));
    const list4 = v43.speedLevels || [],
      stringify = JSON.stringify([v43.entityId, list4]);
    ((element23.hidden = list4.length > 0),
      (element24.hidden = !list4.length),
      text2 !== stringify &&
        ((text2 = stringify),
        v23(element24),
        (list = list4.map((arg44) => {
          const element32 = v21("button", "i3d-climate-choice", arg44.label);
          return (
            (element32.type = "button"),
            element32.addEventListener("click", () => fn16("set_percentage", arg44.percentage)),
            element24.append(element32),
            {
              button: element32,
              ...arg44,
            }
          );
        }))));
    let v72 = -1;
    (v43.on &&
      v43.percentage > 0 &&
      (v72 = list4.findIndex((arg45) => Math.abs(arg45.percentage - v43.percentage) <= 1)),
      list4.length &&
        (element22.textContent =
          v72 >= 0
            ? "风速 · " + list4[v72].label
            : v43.presetMode
              ? "风速 · 由模式控制"
              : v43.on
                ? "风速 " + (v43.percentage ?? "--") + "%"
                : "风速 · 已关闭"),
      list.forEach(({ button: v73 }, arg46) => {
        ((v73.disabled = !v70), v73.setAttribute("aria-pressed", String(arg46 === v72)));
      }),
      fn12());
    const v74 = fn13();
    for (const v75 of list2) {
      const v76 = v74[v75.field],
        v77 = v75.field === "target_temp_low";
      ((v75.output.textContent = v76 == null ? "--" : "" + v76 + (v43.temperatureUnit || "°")),
        (v75.decrease.disabled =
          !v70 ||
          (v76 !== null && v76 <= (v77 ? v43.minimum : (v74.target_temp_low ?? v43.minimum)))),
        (v75.increase.disabled =
          !v70 ||
          (v76 !== null && v76 >= (v77 ? (v74.target_temp_high ?? v43.maximum) : v43.maximum))));
    }
    ((element19.hidden = v43.waterHeater
      ? v43.temperatureSupported || (v43.currentTemperature === null && v43.temperature === null)
      : !v43.useTemperatureRange &&
        (v43.temperatureSupported || v43.currentTemperature === null || v43.purifier)),
      (element19.textContent = v43.waterHeater
        ? "当前水温 " +
          (v43.currentTemperature ?? "--") +
          v43.temperatureUnit +
          " · 目标 " +
          (v43.temperature ?? "--") +
          v43.temperatureUnit +
          "（只读）"
        : "当前温度 " + (v43.currentTemperature ?? "--") + (v43.temperatureUnit || "°")));
    const stringify2 = JSON.stringify([
      v43.entityId,
      !!options4.pedestalFan,
      v43.modes,
      v43.fanModes,
      v43.swingModes,
      v43.horizontalSwingModes,
      v43.presetModes,
      v43.directionSupported,
      v43.oscillatingSupported,
      v43.nativePower,
    ]);
    text4 !== stringify2 && ((text4 = stringify2), fn18());
    for (const v78 of list3)
      if (
        (v78.field === "oscillating" &&
          (v78.element.textContent = v43.oscillating ? "已开启" : "已关闭"),
        (v78.element.disabled = !v70),
        v78.select)
      ) {
        const text5 = v43[v78.field] || "",
          v79 = v78.labels[text5] || (v78.field === "mode" ? climateModeLabel2(text5) : text5);
        je2.sync(v78, text5, v79, !v70);
      } else v78.element.setAttribute("aria-pressed", String(v43[v78.field] === v78.value));
    ((element20.hidden =
      v43.available &&
      (v43.purifier ||
        v43.temperatureSupported ||
        v43.rangeSupported ||
        v43.canTurnOn ||
        v43.canTurnOff ||
        list3.length > 0 ||
        (v43.waterHeater && (v43.canTurnOn || v43.canTurnOff || v43.awaySupported)))),
      (options4.climateType === "bath-heater" || options4.airPurifier || options4.waterHeater) &&
        options4.extraControls?.length &&
        (element20.hidden = true),
      (element20.textContent =
        options4.waterHeater && !v69 && options4.deviceId
          ? "请在附加功能中选择要显示的功能"
          : v69
            ? v43.raw?.state === "unavailable"
              ? "设备离线"
              : ""
            : "尚未绑定设备"),
      (element20.hidden ||= !element20.textContent),
      (element21.textContent = options2.error || text3),
      (element21.hidden = !element21.textContent));
  }
  function fn20(v80 = {}) {
    if (v44) return;
    const text6 = v80.item?.entityId || "";
    text6 !== v43.entityId &&
      (num6++,
      (num7 = 0),
      (v46 = Promise.resolve()),
      (v45 = false),
      (text3 = ""),
      v48(),
      v32.dispose(),
      (v32 = v31()),
      (element18.textContent = ""),
      (element18.hidden = true));
    const useTemperatureRange = v43.useTemperatureRange;
    ((options2 = v80),
      v42.update({
        item: v80.item,
        states: v80.states || {},
        editing: v80.editing || v80.busy,
      }),
      (v43 =
        v80.state?.entityId === text6 && Array.isArray(v80.state?.modes)
          ? v80.state
          : climateState2(text6, v80.state)),
      v80.item?.airPurifier &&
        !text6 &&
        (v43 = {
          ...v43,
          purifier: true,
          name: "空气净化器",
        }),
      v80.item?.waterHeater &&
        !text6 &&
        (v43 = {
          ...v43,
          waterHeater: true,
          name: "热水器",
        }),
      useTemperatureRange !== v43.useTemperatureRange && v48(),
      v43.waterHeater && v32.sync(v43.raw),
      v80.editing || v20.observe(text6, v43.raw),
      value4 !== null &&
        v43.temperature !== null &&
        Math.abs(v43.temperature - value4) < Math.max(0.001, v43.step / 100) &&
        v48(),
      value3 &&
        ["target_temp_low", "target_temp_high"].every(
          (arg47, arg48) =>
            [v43.targetLow, v43.targetHigh][arg48] !== null &&
            Math.abs([v43.targetLow, v43.targetHigh][arg48] - value3[arg47]) <
              Math.max(0.001, v43.step / 100),
        ) &&
        v48(),
      fn19());
  }
  function fn21() {
    v44 || ((v44 = true), num6++, je2.close(), v48(), v32.dispose(), v42.dispose(), v23(element9));
  }
  return (
    fn19(),
    {
      root: element9,
      update: fn20,
      power: fn17,
      dispose: fn21,
      cancelPending() {
        (num6++,
          je2.close(),
          (num7 = 0),
          (v46 = Promise.resolve()),
          (v45 = false),
          v48(),
          v32.dispose(),
          (v32 = v31()),
          (element18.textContent = ""),
          (element18.hidden = true));
      },
    }
  );
}
