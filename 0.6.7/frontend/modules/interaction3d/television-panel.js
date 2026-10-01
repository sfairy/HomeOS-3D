import {
  televisionState,
  televisionTime,
  televisionPower,
  televisionMediaControl,
} from "./television-state.js?v=20260914-tv-power-poster-v1";
export function createTelevisionPanel({ onControl: arg1 = async () => {} } = {}) {
  const fn1 = (arg2, arg3) => {
      const value28 = document.createElement(arg2);
      return ((value28.className = arg3), value28);
    },
    value1 = fn1("div", "i3d-television-panel"),
    value2 = fn1("div", "i3d-nas-heading"),
    value3 = fn1("h3", ""),
    value4 = fn1("span", "i3d-tv-status"),
    value5 = fn1("div", "i3d-tv-content"),
    value6 = fn1("img", "i3d-tv-artwork"),
    value7 = fn1("div", "i3d-tv-details"),
    value8 = fn1("strong", ""),
    value9 = fn1("span", ""),
    value10 = fn1("progress", ""),
    value11 = fn1("span", "i3d-tv-time"),
    value12 = fn1("button", "i3d-tv-power"),
    value13 = fn1("button", "i3d-tv-power"),
    value14 = fn1("p", "i3d-tv-error");
  ((value12.type = value13.type = "button"), value14.setAttribute("role", "status"));
  const value15 = fn1("div", "i3d-tv-actions");
  (value15.setAttribute("role", "group"), value15.setAttribute("aria-label", "电视播放控制"));
  const value16 = ["previous", "play", "next"].map((arg4) => {
    const value29 = fn1("button", "");
    return (
      (value29.type = "button"),
      value29.addEventListener("click", async () => {
        if (!value20 || value25 || value20.editing || value26 || value22 !== null) return;
        const value30 = televisionMediaControl(value20.item, value20.states, arg4);
        if (!value30.enabled) return;
        const value31 = value24;
        ((value26 = true), (value14.textContent = ""), fn4());
        try {
          await arg1(value30.command);
        } catch (error1) {
          !value25 &&
            value31 === value24 &&
            (value14.textContent = error1?.message || "播放控制失败，请重试。");
        } finally {
          !value25 && value31 === value24 && ((value26 = false), fn4());
        }
      }),
      value15.append(value29),
      {
        action: arg4,
        button: value29,
      }
    );
  });
  ((value6.hidden = true),
    (value6.alt = "正在播放的内容封面"),
    value6.addEventListener("error", () => {
      value6.hidden = true;
    }));
  const value17 = fn1("div", "i3d-popup-heading-text"),
    value18 = fn1("div", "i3d-popup-power-actions");
  (value17.append(value3, value4),
    value18.append(value12, value13),
    value2.append(value17, value18),
    value7.append(value8, value9, value10, value11),
    value5.append(value6, value7));
  const value19 = fn1("div", "i3d-popup-body");
  (value19.append(value5, value15, value14),
    value1.append(value2, value19),
    (value1.hidden = true));
  let value20,
    text1 = "",
    value21 = null,
    value22 = null,
    value23 = null,
    value24 = 0,
    value25 = false,
    value26 = false,
    value27 = false;
  function fn2() {
    (value23 !== null && clearTimeout(value23),
      (value23 = null),
      (value22 = null),
      (value27 = false));
  }
  async function fn3(arg5) {
    if (!value20 || value25 || value20.editing || value26 || value22 !== null) return;
    const value32 = televisionPower(value20.item, value20.states, arg5);
    if (!value32.available || !value32.supported) return;
    const value33 = value24;
    ((value22 = arg5),
      (value27 = false),
      (value14.textContent = ""),
      fn4(),
      (value23 = setTimeout(() => {
        !value25 && value24 === value33 && (fn2(), fn4());
      }, 14000)));
    try {
      (await arg1(value32.command), !value25 && value33 === value24 && ((value27 = true), fn4()));
    } catch (error2) {
      !value25 &&
        value33 === value24 &&
        (fn2(), (value14.textContent = error2?.message || "开关机失败，请重试。"), fn4());
    }
  }
  (value12.addEventListener("click", () => fn3(true)),
    value13.addEventListener("click", () => fn3(false)));
  function fn4() {
    if (!value20) return;
    const value34 = televisionState(value20.item, value20.states),
      value35 = televisionPower(value20.item, value20.states);
    value27 && value22 !== null && value22 === value35.on && value35.available && fn2();
    for (const [value36, value37] of [
      [value12, true],
      [value13, false],
    ]) {
      const value38 = televisionPower(value20.item, value20.states, value37);
      ((value36.textContent =
        value22 === value37 ? (value37 ? "开机中…" : "关机中…") : value37 ? "开机" : "关机"),
        value36.setAttribute("aria-label", value37 ? "开启电视" : "关闭电视"),
        (value36.disabled =
          !!value20.editing ||
          value26 ||
          value22 !== null ||
          !value38.available ||
          !value38.supported),
        (value36.title = value20.editing ? "编辑预览不可控制设备" : value38.reason));
    }
    value1.setAttribute("aria-busy", String(value22 !== null));
    for (const { action: value39, button: value40 } of value16) {
      const value41 = televisionMediaControl(value20.item, value20.states, value39);
      ((value40.textContent =
        value39 === "previous"
          ? "上一集"
          : value39 === "next"
            ? "下一集"
            : value34.playing
              ? "暂停"
              : "播放"),
        value40.setAttribute("aria-label", value40.textContent),
        (value40.disabled = !!value20.editing || value26 || value22 !== null || !value41.enabled),
        (value40.title = value41.enabled ? "" : "当前设备状态或播放器不支持此操作"));
    }
    ((value3.textContent = value34.name),
      (value4.textContent = value34.status),
      (value8.textContent = value34.on ? value34.title : value34.status),
      (value9.textContent = [value34.app, value34.artist].filter(Boolean).join(" · ") || "—"),
      (value9.hidden = false),
      value34.artwork !== text1 &&
        ((text1 = value34.artwork),
        (value6.hidden = !text1),
        text1
          ? ((value6.hidden = true),
            (value6.onload = () => {
              value20 && text1 === value34.artwork && (value6.hidden = false);
            }),
            (value6.src = text1))
          : value6.removeAttribute("src")),
      (value10.hidden = value11.hidden = false),
      (value10.max = value34.duration || 1),
      (value10.value = value34.position || 0),
      (value11.textContent =
        televisionTime(value34.position) + " / " + televisionTime(value34.duration)),
      !value34.playing && value21 !== null && (clearInterval(value21), (value21 = null)));
  }
  return {
    root: value1,
    update(arg6) {
      (value20?.item.id !== arg6.item.id &&
        (value24++, (value26 = false), fn2(), (value14.textContent = "")),
        (value20 = arg6),
        fn4(),
        televisionState(arg6.item, arg6.states).playing &&
          value21 === null &&
          (value21 = setInterval(fn4, 1000)));
    },
    hide() {
      ((value1.hidden = true), value21 !== null && clearInterval(value21), (value21 = null));
    },
    dispose() {
      ((value25 = true),
        value24++,
        fn2(),
        this.hide(),
        (value20 = null),
        value6.removeAttribute("src"),
        value1.remove());
    },
  };
}
