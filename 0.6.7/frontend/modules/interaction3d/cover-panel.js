import { createPurifierExtras } from "./purifier-extras.js?v=20260926-airer-v2";
import {
  coverState,
  coverControl,
  coverStateLabel,
  coverCanAdjustBlades,
} from "./cover-state.js?v=20260914-cover-live-drag-v6-airer-icon-v1";
export function createCoverPanel({
  element: arg1,
  onControl: arg2 = async () => {},
  onPreview: arg3 = () => {},
  onExtraControl: arg4 = async () => {},
  onLayout: arg5 = () => {},
} = {}) {
  const value1 = arg1?.ownerDocument || globalThis.document,
    fn1 = (arg6, arg7 = "", arg8 = "") => {
      const value30 = value1.createElement(arg6);
      return ((value30.className = arg7), (value30.textContent = arg8), value30);
    },
    fn2 = (arg9, ...arg10) => {
      if (typeof arg9.replaceChildren == "function") arg9.replaceChildren(...arg10);
      else {
        for (const value31 of [...(arg9.children || [])]) value31.remove?.();
        arg9.append(...arg10);
      }
    },
    value2 = arg1 || fn1("section");
  value2.classList.add("i3d-cover-panel");
  const value3 = fn1("div", "i3d-cover-heading"),
    value4 = fn1("h3", "", "窗帘"),
    value5 = fn1("p", "", "尚未绑定设备");
  value3.append(value4, value5);
  const value6 = fn1("p", "i3d-cover-blade-hint", "叶片角度 · 50% 为 90°打开");
  value6.hidden = true;
  const value7 = fn1("div", "i3d-cover-controls-slot"),
    value8 = fn1("section", "hb-cover-details-controls"),
    value9 = fn1("label", "hb-cover-details-position"),
    value10 = fn1("span", "hb-cover-details-position-heading"),
    value11 = fn1("output");
  (value11.setAttribute("aria-label", "当前开合位置"), value10.append(value11));
  const value12 = fn1("input");
  ((value12.type = "range"),
    (value12.min = "0"),
    (value12.max = "100"),
    (value12.step = "1"),
    value12.setAttribute("aria-label", "目标开合位置"));
  const value13 = fn1("span", "hb-cover-details-position-legend");
  (value13.append(fn1("small", "", "关闭"), fn1("small", "", "打开")),
    value9.append(value10, value12, value13));
  const value14 = fn1("div", "hb-cover-details-actions"),
    list1 = [];
  for (const [value32, value33, value34] of [
    ["关闭", "close_cover", "closeSupported"],
    ["暂停", "stop_cover", "stopSupported"],
    ["打开", "open_cover", "openSupported"],
  ]) {
    const value35 = fn1("button");
    ((value35.type = "button"),
      (value35.dataset.coverAction = value33),
      value35.setAttribute("aria-label", value32),
      value35.append(fn1("strong", "", value32)),
      value35.addEventListener("click", () => fn10(value33)),
      list1.push({
        button: value35,
        service: value33,
        capability: value34,
      }),
      value14.append(value35));
  }
  (value8.append(value9, value14), value7.append(value8));
  const value15 = fn1("p", "i3d-cover-feedback");
  ((value15.hidden = true),
    value15.setAttribute("role", "status"),
    value15.setAttribute("aria-live", "polite"));
  const value16 = fn1("div", "i3d-climate-panel i3d-airer-extras"),
    value17 = fn1("div", "i3d-purifier-extras i3d-extra-grid");
  value16.append(value17);
  const value18 = createPurifierExtras({
      element: value17,
      onControl: arg4,
      onLayout: arg5,
    }),
    value19 = fn1("div", "i3d-popup-body");
  (value19.append(value6, value7, value15, value16), fn2(value2, value3, value19));
  let object1 = {},
    value20 = coverState("", null),
    value21 = false,
    value22 = 0,
    value23 = 0,
    value24 = false,
    value25 = null,
    value26 = null,
    value27 = null,
    value28 = false,
    text1 = "",
    value29 = 0,
    text2 = "";
  const fn3 = () =>
      !value21 && !object1.editing && object1.item?.modelAvailable !== false && value20.available,
    fn4 = () =>
      value27 ??
      object1.presentation?.targetPosition ??
      object1.presentation?.position ??
      (value25?.confirmed ? value20.position : (value25?.target ?? value20.position)),
    fn5 = () =>
      object1.presentation || {
        ...value20,
        closedConfirmed: value20.closedConfirmed && !value24,
      },
    fn6 = () =>
      fn3() &&
      (object1.item?.coverKind === "dream"
        ? coverCanAdjustBlades(value20, fn5()) &&
          !(!object1.presentation && value25 && !value25.blade)
        : value20.positionSupported);
  function fn7() {
    (value26 !== null && clearTimeout(value26), (value26 = null), (value25 = null));
  }
  function fn8() {
    const value36 = object1.item?.coverKind === "dream",
      value37 = value36
        ? (value27 ??
          object1.presentation?.tiltTarget ??
          object1.presentation?.tiltPosition ??
          value20.tiltPosition)
        : fn4();
    ((value12.value = String(value37 ?? 0)),
      value12.style.setProperty("--hb-cover-position-progress", (value37 ?? 0) + "%"),
      value12.setAttribute(
        "aria-valuetext",
        value37 === null
          ? "当前位置未知，滑动设置目标"
          : value36
            ? "叶片角度 " + Math.round(value37) + "%，50% 为 90°打开"
            : "目标 " +
              Math.round(value37) +
              "%，当前位置" +
              (value20.position === null ? "未知" : Math.round(value20.position) + "%"),
      ),
      value2.setAttribute("aria-invalid", String(!!(object1.error || text1))));
  }
  async function fn9(arg11) {
    const value38 = value22,
      value39 = ++value23,
      value40 = !!object1.presentation;
    (fn7(),
      (value27 = null),
      (value28 = false),
      (text1 = ""),
      value20.dream &&
        ["open_cover", "close_cover", "stop_cover"].includes(arg11.service) &&
        (value24 ||= arg11.service === "open_cover" || !value20.closedConfirmed),
      (value25 = {
        blade:
          object1.item?.coverKind === "dream" &&
          ["set_cover_position", "set_cover_tilt_position"].includes(arg11.service),
        ticket: value39,
        revision: value29,
        initialState: value20.state,
        initialPosition: value20.position,
        confirmed: false,
        wasMoving: false,
        service: arg11.service,
        target:
          arg11.service === "set_cover_position"
            ? arg11.data.position
            : arg11.service === "open_cover"
              ? 100
              : arg11.service === "close_cover"
                ? 0
                : null,
        sending: true,
      }),
      value40 ||
        (value26 = setTimeout(() => {
          value21 ||
            value22 !== value38 ||
            value25?.ticket !== value39 ||
            ((value26 = null), (value25 = null), fn12());
        }, 15000)),
      fn12());
    try {
      await arg2(arg11, object1.item);
    } catch (error1) {
      !value21 &&
        value22 === value38 &&
        value23 === value39 &&
        (fn7(),
        (text1 =
          error1?.message ||
          (object1.item?.airer ? "晾衣架控制失败，请重试。" : "窗帘控制失败，请重试。")),
        fn12());
    } finally {
      !value21 &&
        value22 === value38 &&
        value23 === value39 &&
        (value40 ? fn7() : value25 && (value25.sending = false), fn12());
    }
  }
  function fn10(arg12, arg13) {
    if (fn3())
      try {
        return fn9(
          coverControl(
            {
              ...value20,
              ...fn5(),
            },
            arg12,
            arg13,
          ),
        );
      } catch (error2) {
        ((text1 = error2.message), fn12());
      }
  }
  (value12.addEventListener("pointerdown", () => {
    fn6() && (value28 = true);
  }),
    value12.addEventListener("input", () => {
      if (!fn6()) return;
      const value41 = Number(value12.value);
      if (!Number.isFinite(value41)) return;
      ((value28 = true), (value27 = Math.max(0, Math.min(100, Math.round(value41)))));
      const value42 = arg3(object1.item?.entityId, value27, object1.item);
      (value42 &&
        (object1 = {
          ...object1,
          presentation: value42,
        }),
        fn12());
    }),
    value12.addEventListener("change", () => {
      if (value27 === null) {
        ((value28 = false), fn8());
        return;
      }
      const value43 = value27;
      if (((value27 = null), (value28 = false), fn6()))
        return fn10(
          object1.item?.coverKind === "dream" && value20.tiltSupported
            ? "set_cover_tilt_position"
            : "set_cover_position",
          value43,
        );
      fn8();
    }));
  function fn11() {
    ((value27 = null), (value28 = false));
    const value44 = arg3(object1.item?.entityId, null, object1.item);
    (value44 &&
      (object1 = {
        ...object1,
        presentation: value44,
      }),
      fn12());
  }
  (value12.addEventListener("pointercancel", fn11),
    value12.addEventListener("blur", () => {
      value27 !== null && fn11();
    }));
  function fn12() {
    if (value21) return;
    ((value4.textContent =
      object1.item?.label || value20.name || (object1.item?.airer ? "晾衣架" : "窗帘")),
      (value4.title = value4.textContent));
    const value45 = fn5();
    value5.textContent = object1.editing
      ? "控制预览"
      : object1.item?.entityId
        ? value20.available
          ? coverStateLabel(value45.state)
          : "设备不可用"
        : "尚未绑定设备";
    const value46 = object1.item?.coverKind === "dream",
      value47 = object1.item?.airer;
    (value2.classList.toggle("is-dream", value46),
      (value6.hidden = !value46),
      value46 &&
        !object1.editing &&
        value20.available &&
        (value5.textContent =
          {
            open: "整体已开启",
            closed: "整体已关闭",
            opening: "整体正在开启",
            closing: "整体正在关闭",
          }[value45.state] || value5.textContent),
      !object1.editing &&
        value20.available &&
        value45.state === "open" &&
        value45.position > 0 &&
        value45.position < 100 &&
        (value5.textContent = value46 ? "整体部分开启" : "部分开启"),
      value47 &&
        !object1.editing &&
        value20.available &&
        (value5.textContent = value45.opening
          ? "正在上升"
          : value45.closing
            ? "正在下降"
            : value20.position === 100
              ? "已升至最高"
              : value20.position === 0
                ? "已降至最低"
                : "已暂停"),
      value12.setAttribute(
        "aria-label",
        value47 ? "目标升降位置" : value46 ? "目标叶片角度" : "目标开合位置",
      ),
      (value13.children[0].textContent = value47 ? "最低" : value46 ? "一侧闭合" : "关闭"),
      (value13.children[1].textContent = value47 ? "最高" : value46 ? "反向闭合" : "打开"));
    const value48 =
      value27 ??
      (value46 ? value20.tiltPosition : value45.estimated ? value20.position : value45.position);
    ((value11.textContent = value48 === null ? "未知" : Math.round(value48) + "%"),
      (value11.title = value47
        ? "晾杆升降位置，100%为最高"
        : value27 !== null
          ? value46
            ? "目标叶片角度预览"
            : "目标开合位置预览"
          : value46
            ? "叶片角度：50% 为 90°打开"
            : "整体开合位置"),
      value11.setAttribute(
        "aria-label",
        value47 ? "当前升降位置" : value46 ? "当前叶片角度" : "当前开合位置",
      ),
      (value12.disabled = !fn6()),
      !object1.editing &&
        value20.available &&
        value45.estimated &&
        !value45.moving &&
        (value5.textContent = "在线"),
      value46 &&
        !object1.editing &&
        value20.available &&
        (!value20.overallFeedbackAvailable || value45.awaitingArrival || value45.estimated) &&
        !value45.moving &&
        (value5.textContent = "在线"),
      (value6.textContent = "叶片角度"),
      (value12.title =
        value46 && !fn6() && value20.available
          ? value20.overallFeedbackAvailable
            ? "关闭到位后可调节叶片"
            : "暂不可调节叶片"
          : ""));
    for (const { button: value50, service: value51, capability: value52 } of list1) {
      ((value50.children[0].textContent =
        value51 === "stop_cover"
          ? "暂停"
          : value47
            ? value51 === "open_cover"
              ? "上升"
              : "下降"
            : value46
              ? value51 === "open_cover"
                ? "开启"
                : "关闭"
              : value51 === "open_cover"
                ? "打开"
                : "关闭"),
        (value50.title = value46
          ? "整体" + value50.children[0].textContent
          : value50.children[0].textContent),
        value50.setAttribute("aria-label", value50.title),
        (value50.disabled = !fn3() || !value20[value52]));
      const value53 = !!(value25 && !value25.confirmed && value25.service === value51);
      (value50.setAttribute("aria-busy", String(value53)),
        value50.classList.toggle(
          "is-active",
          (value51 === "open_cover" && value45.opening) ||
            (value51 === "close_cover" && value45.closing),
        ));
    }
    const value49 = object1.error || text1 || "";
    ((value15.textContent = value49),
      (value15.hidden = !value49),
      value15.classList.toggle("is-error", !!value49),
      value2.setAttribute(
        "aria-busy",
        String(
          !!(object1.presentation ? object1.presentation.preview : value25 && !value25.confirmed),
        ),
      ),
      fn8());
  }
  function fn13(arg14 = {}) {
    if (value21) return;
    const value54 = arg14.item?.entityId || "";
    (value54 !== value20.entityId || arg14.item?.id !== object1.item?.id) &&
      (value28 && arg3(object1.item?.entityId, null, object1.item),
      value22++,
      (value24 = false),
      fn7(),
      (value27 = null),
      (value28 = false),
      (text1 = ""),
      (value29 = 0),
      (text2 = ""));
    const value55 = value20;
    ((object1 = arg14),
      (value16.hidden = !arg14.item?.airer || !arg14.item?.extraControls?.length),
      value18.update({
        item: {
          ...arg14.item,
          extraControls: arg14.item?.airer ? arg14.item.extraControls : [],
        },
        states: arg14.states || {},
        editing: arg14.editing,
      }),
      (value20 =
        arg14.state?.entityId === value54 && typeof arg14.state?.positionKnown == "boolean"
          ? arg14.state
          : coverState(value54, arg14.state, arg14.item)),
      value20.overallFeedbackAvailable &&
        (value20.position !== value55.position || value20.state !== value55.state) &&
        (value24 = false),
      !fn6() &&
        value28 &&
        ((value27 = null), (value28 = false), arg3(value54, null, object1.item)));
    const value56 = JSON.stringify([
      value20.state,
      value20.position,
      value20.raw.updatedAt ?? value20.raw.last_updated,
      value20.raw.lastChanged ?? value20.raw.last_changed,
    ]);
    if (
      (text2 !== value56 && ((text2 = value56), value29++),
      fn3() || ((value27 = null), (value28 = false), fn7()),
      !object1.presentation && value25 && value29 > value25.revision)
    ) {
      const value57 =
          value25.target !== null &&
          value20.position !== null &&
          Math.abs(value20.position - value25.target) <= 0.5,
        value58 = value25.service === "stop_cover" && !value20.moving,
        value59 =
          value25.service === "open_cover" &&
          value20.position === null &&
          value20.state === "open" &&
          value25.initialState !== "open",
        value60 = value25.confirmed && value25.wasMoving && !value20.moving;
      if (value57 || value58 || value59 || value60) fn7();
      else {
        if (value25.target !== null) {
          const value61 =
              value25.initialPosition === null
                ? value25.service === "open_cover"
                  ? 1
                  : value25.service === "close_cover"
                    ? -1
                    : 0
                : Math.sign(value25.target - value25.initialPosition),
            value62 =
              value61 !== 0 &&
              value20.position !== null &&
              value25.initialPosition !== null &&
              (value20.position - value25.initialPosition) * value61 > 0.5,
            value63 =
              value20.state !== value25.initialState &&
              ((value61 > 0 && value20.opening) || (value61 < 0 && value20.closing));
          ((value62 || value63) &&
            ((value25.confirmed = true),
            value26 !== null && clearTimeout(value26),
            (value26 = null)),
            value25.confirmed && value20.moving && (value25.wasMoving = true));
        }
      }
    }
    (value28 || (value27 = null), fn12());
  }
  function fn14() {
    value21 ||
      ((value21 = true),
      value28 && arg3(object1.item?.entityId, null, object1.item),
      value22++,
      fn7(),
      value18.dispose(),
      fn2(value2));
  }
  return (
    fn12(),
    {
      root: value2,
      update: fn13,
      dispose: fn14,
      deactivate() {
        value28 && fn11();
      },
    }
  );
}
