import { speakerState, speakerCommand } from "./speaker-state.js?v=20260926-speaker-v1";
import { televisionTime } from "./television-state.js?v=20260914-tv-power-poster-v1";
export function createSpeakerPanel({
  onControl: arg1 = async () => {},
  fetchMedia: arg2 = (...arg3) => fetch(...arg3),
} = {}) {
  const fn1 = (arg4, arg5 = "", arg6 = "") => {
      const value47 = document.createElement(arg4);
      return ((value47.className = arg5), (value47.textContent = arg6), value47);
    },
    value1 = fn1("div", "i3d-television-panel i3d-speaker-panel");
  value1.hidden = true;
  const value2 = fn1("div", "i3d-nas-heading"),
    value3 = fn1("h3"),
    value4 = fn1("span", "i3d-tv-status"),
    value5 = fn1("div", "i3d-popup-heading-text");
  (value5.append(value3, value4), value2.append(value5));
  const value6 = fn1("div", "i3d-tv-content"),
    value7 = fn1("img", "i3d-tv-artwork"),
    value8 = fn1("div", "i3d-tv-details"),
    value9 = fn1("strong"),
    value10 = fn1("span"),
    value11 = fn1("span"),
    value12 = fn1("span", "i3d-tv-time");
  ((value7.alt = "正在播放的内容封面"), (value7.hidden = true));
  const value13 = fn1("progress"),
    value14 = fn1("input");
  ((value14.type = "range"),
    (value14.min = "0"),
    (value14.step = "1"),
    value14.setAttribute("aria-label", "播放进度"),
    value8.append(value9, value10, value11, value13, value14, value12),
    value6.append(value7, value8));
  const value15 = fn1("div", "i3d-tv-actions i3d-speaker-actions"),
    value16 = fn1("div", "i3d-speaker-settings"),
    value17 = fn1("p", "i3d-tv-error");
  value17.setAttribute("role", "status");
  const value18 = fn1("div", "i3d-popup-body");
  (value18.append(value6, value15, value16, value17), value1.append(value2, value18));
  let value19 = null,
    value20 = 0,
    value21 = false,
    value22 = null,
    value23 = null,
    list1 = [],
    text1 = "";
  const list2 = [],
    map1 = new Map(),
    fn2 = (arg7) =>
      ["media_play", "media_pause"].includes(arg7)
        ? "playback"
        : ["volume_set", "volume_up", "volume_down"].includes(arg7)
          ? "volume"
          : ["turn_on", "turn_off"].includes(arg7)
            ? "power"
            : arg7,
    fn3 = (arg8) => map1.has(fn2(arg8)),
    fn4 = (arg9, arg10) => !value19 || value19.editing || !arg9.available || (arg10 && fn3(arg10));
  async function fn5(arg11, arg12 = {}, arg13 = value17) {
    if (!value19 || value21 || value19.editing || fn3(arg11)) return;
    const value48 = speakerCommand(value19.item, value19.states, arg11, arg12);
    if (!value48.enabled) return;
    const value49 = value20,
      value50 = fn2(arg11),
      object1 = {};
    (map1.set(value50, object1), (arg13.textContent = ""), fn11());
    try {
      return (await arg1(value48.command), !value21 && value49 === value20);
    } catch (error1) {
      return (
        value49 === value20 &&
          !value21 &&
          (arg13.textContent = error1?.message || "媒体控制失败，请重试。"),
        false
      );
    } finally {
      value49 === value20 &&
        !value21 &&
        (map1.get(value50) === object1 && map1.delete(value50), fn11());
    }
  }
  function fn6(arg14, arg15, arg16, arg17 = value15) {
    const value51 = fn1("button", "", arg14);
    return (
      (value51.type = "button"),
      value51.addEventListener("click", () => {
        const value52 = speakerState(value19.item, value19.states);
        fn5(typeof arg15 == "function" ? arg15(value52) : arg15, arg16 ? arg16(value52) : {});
      }),
      arg17.append(value51),
      list2.push({
        element: value51,
        service: arg15,
      }),
      value51
    );
  }
  const value24 = fn1("div", "i3d-popup-power-actions");
  (value2.append(value24),
    (fn6("开机", "turn_on", null, value24).className = "i3d-tv-power"),
    (fn6("关机", "turn_off", null, value24).className = "i3d-tv-power"),
    fn6("上一首", "media_previous_track"));
  const value25 = fn6("播放", (arg18) => (arg18.playing ? "media_pause" : "media_play"));
  (fn6("下一首", "media_next_track"), fn6("停止", "media_stop"));
  const value26 = fn1("div", "i3d-speaker-volume");
  value16.append(value26);
  const value27 = fn1("label", "i3d-speaker-field i3d-volume-slider"),
    value28 = fn1("span", "", "音量"),
    value29 = fn1("input", "i3d-control-range");
  ((value29.type = "range"),
    (value29.min = "0"),
    (value29.max = "100"),
    (value29.step = "1"),
    value29.setAttribute("aria-label", "音量"),
    value27.append(value28, value29),
    value26.append(value27),
    list2.push({
      element: value27,
      input: value29,
      service: "volume_set",
    }),
    value29.addEventListener("input", () => {
      value28.textContent = "音量 " + Math.round(Number(value29.value)) + "%";
    }),
    value29.addEventListener(
      "change",
      () =>
        void fn5("volume_set", {
          volume_level: Number(value29.value) / 100,
        }),
    ),
    value14.addEventListener(
      "change",
      () =>
        void fn5("media_seek", {
          seek_position: Number(value14.value),
        }),
    ));
  const value30 = fn1("div", "i3d-speaker-actions");
  value26.append(value30);
  const value31 = fn6("音量−", "volume_down", null, value30),
    value32 = fn6("音量＋", "volume_up", null, value30),
    value33 = fn6(
      "静音",
      "volume_mute",
      (arg19) => ({
        is_volume_muted: arg19.attributes.is_volume_muted !== true,
      }),
      value26,
    ),
    value34 = fn6(
      "随机播放",
      "shuffle_set",
      (arg20) => ({
        shuffle: arg20.attributes.shuffle !== true,
      }),
      value16,
    ),
    list3 = [];
  for (const [value53, value54, value55, value56] of [
    ["来源", "select_source", "source", "source_list"],
    ["音效", "select_sound_mode", "sound_mode", "sound_mode_list"],
    ["循环", "repeat_set", "repeat", null],
  ]) {
    const value57 = fn1("label", "i3d-speaker-field"),
      value58 = fn1("select");
    (value57.append(fn1("span", "", value53), value58),
      value16.append(value57),
      value58.setAttribute("aria-label", value53),
      value58.addEventListener(
        "change",
        () =>
          void fn5(value54, {
            [value55]: value58.value,
          }),
      ),
      list3.push({
        select: value58,
        attribute: value55,
        choices: value56,
        signature: "",
      }),
      list2.push({
        element: value57,
        input: value58,
        service: value54,
      }));
  }
  const value35 = fn1("button", "i3d-speaker-browse"),
    value36 = fn1("button", "", "返回上级"),
    value37 = fn1("h3", "", "媒体库"),
    value38 = fn1("div", "i3d-speaker-media-list");
  ((value35.title = "浏览媒体"),
    value35.setAttribute("aria-label", "浏览媒体"),
    (value35.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h10M4 10h10M4 15h5M17 18V5l4-1v4l-4 1"/><ellipse cx="14" cy="18" rx="3" ry="2.5"/></svg>'),
    value6.append(value35));
  const value39 = fn1("dialog", "i3d-speaker-media-dialog"),
    value40 = fn1("div", "i3d-speaker-media-heading"),
    value41 = fn1("button", "", "关闭"),
    value42 = fn1("button", "", "重新加载"),
    value43 = fn1("button", "", "播放当前内容"),
    value44 = fn1("div", "i3d-speaker-media-toolbar"),
    value45 = fn1("p", "i3d-tv-error");
  (value39.setAttribute("aria-label", "选择播放媒体"),
    value45.setAttribute("role", "status"),
    value41.setAttribute("aria-label", "关闭媒体库"));
  for (const value59 of [value35, value36, value41, value42, value43]) value59.type = "button";
  ((value36.hidden = value43.hidden = true),
    value40.append(value37, value41),
    value44.append(value36, value42, value43),
    value39.append(value40, value44, value38, value45),
    value1.append(value39));
  let value46 = null;
  function fn7() {
    (fn9(),
      value39.open && value39.close(),
      value38.replaceChildren(),
      (value45.textContent = ""),
      value19 && !value21 && fn11());
  }
  (value41.addEventListener("click", fn7),
    value39.addEventListener("keydown", (arg21) => {
      arg21.key === "Escape" && (arg21.preventDefault(), arg21.stopPropagation(), fn7());
    }),
    value39.addEventListener("cancel", (arg22) => {
      (arg22.preventDefault(), fn7());
    }),
    value39.addEventListener("close", () => {
      value39.open || fn9();
    }),
    value35.addEventListener("click", () => {
      !value19 ||
        value21 ||
        value19.editing ||
        !speakerState(value19.item, value19.states).available ||
        (value39.open || value39.showModal(), fn10(null, []));
    }),
    value36.addEventListener("click", () => {
      const value60 = list1.slice(0, -1);
      fn10(value60.at(-1) || null, value60.slice(0, -1));
    }),
    value42.addEventListener("click", () => void fn10(list1.at(-1) || null, list1.slice(0, -1))));
  async function fn8(arg23) {
    (await fn5(
      "play_media",
      {
        media_content_id: arg23.media_content_id,
        media_content_type: arg23.media_content_type,
      },
      value45,
    )) && fn7();
  }
  value43.addEventListener("click", () => {
    value46 && fn8(value46);
  });
  function fn9() {
    (value23?.abort(), (value23 = null));
  }
  async function fn10(arg24, arg25) {
    if (
      !value19 ||
      value21 ||
      value19.editing ||
      !speakerState(value19.item, value19.states).available
    )
      return;
    fn9();
    const abortController1 = new AbortController();
    value23 = abortController1;
    const value61 = value20;
    ((value45.textContent = ""),
      value38.replaceChildren(),
      (value37.textContent = "正在加载…"),
      (value43.hidden = true),
      fn11());
    try {
      const value62 = await arg2("/api/v1/ha/media/browse", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
          },
          signal: abortController1.signal,
          body: JSON.stringify({
            playerLibrary: true,
            entityId: value19.item.entityId,
            mediaContentId: arg24?.media_content_id || "",
            mediaContentType: arg24?.media_content_type || "",
          }),
        }),
        value63 = await value62.json();
      if (!value62.ok || value63.ok === false)
        throw new Error(value63.detail || value63.error || "媒体库加载失败");
      if (value21 || value61 !== value20 || abortController1.signal.aborted) return;
      const value64 = value63.result || {};
      ((value46 = value64),
        (value43.hidden =
          !value64.can_play || !speakerState(value19.item, value19.states).supports("play_media")),
        (list1 = arg24 ? [...arg25, arg24] : []),
        (value36.hidden = list1.length === 0),
        (value37.textContent = value64.title || "媒体库"));
      for (const value65 of value64.children || []) {
        const value66 = fn1("div", "i3d-speaker-media-row");
        if (
          (value66.append(fn1("span", "", value65.title || value65.media_content_id || "媒体")),
          value65.can_expand)
        ) {
          const value67 = fn1("button", "", "打开");
          ((value67.type = "button"),
            (value67.onclick = () => void fn10(value65, list1)),
            value66.append(value67));
        }
        if (value65.can_play && speakerState(value19.item, value19.states).supports("play_media")) {
          const value68 = fn1("button", "", "播放");
          ((value68.type = "button"),
            (value68.onclick = () => void fn8(value65)),
            value66.append(value68));
        }
        value38.append(value66);
      }
      value38.childElementCount || value38.append(fn1("p", "", "暂无可浏览的媒体"));
    } catch (error2) {
      value61 === value20 &&
        !value21 &&
        !abortController1.signal.aborted &&
        ((value37.textContent = "媒体库"),
        (value45.textContent = error2?.message || "媒体库加载失败，请重试。"));
    } finally {
      value23 === abortController1 && ((value23 = null), value19 && fn11());
    }
  }
  function fn11() {
    if (!value19 || value21) return;
    const value69 = speakerState(value19.item, value19.states);
    if (
      ((value3.textContent = value69.name),
      (value3.title = value69.name),
      (value4.textContent = value69.status),
      (value4.title = value69.status),
      (value9.textContent = value69.on ? value69.title : value69.status),
      (value10.textContent = value69.artist),
      (value11.textContent = value69.album),
      (value10.hidden = !value69.artist),
      (value11.hidden = !value69.album),
      text1 !== value69.artwork)
    ) {
      ((text1 = value69.artwork), (value7.hidden = true));
      const value72 = value20;
      ((value7.onload = () => {
        !value21 &&
          value72 === value20 &&
          value19 &&
          text1 === value69.artwork &&
          (value7.hidden = false);
      }),
        (value7.onerror = () => {
          value7.hidden = true;
        }),
        value69.artwork ? (value7.src = value69.artwork) : value7.removeAttribute("src"));
    }
    value25.textContent = value69.playing ? "暂停" : "播放";
    for (const value73 of list2) {
      const value74 =
        typeof value73.service == "function" ? value73.service(value69) : value73.service;
      ((value73.element.hidden = !value69.supports(value74)),
        (value73.input || value73.element).setAttribute("aria-busy", String(fn3(value74))),
        ((value73.input || value73.element).disabled =
          fn4(value69, value74) || !speakerCommand(value19.item, value19.states, value74).enabled));
    }
    ((value31.hidden ||= value69.supports("volume_set")),
      (value32.hidden ||= value69.supports("volume_set")),
      (value30.hidden = value31.hidden && value32.hidden),
      (value26.hidden = value27.hidden && value30.hidden && value33.hidden),
      (value16.hidden = ![
        "volume_set",
        "volume_up",
        "volume_down",
        "volume_mute",
        "shuffle_set",
        "select_source",
        "select_sound_mode",
        "repeat_set",
      ].some((arg26) => value69.supports(arg26))));
    const value70 = value69.duration !== null && value69.position !== null;
    ((value13.hidden = !value70 || value69.supports("media_seek")),
      (value14.hidden = !value70 || !value69.supports("media_seek")),
      (value12.hidden = !value70),
      (value13.max = value14.max = value69.duration || 1),
      (value13.value = value69.position || 0),
      document.activeElement !== value14 && (value14.value = value69.position || 0),
      (value14.disabled = fn4(value69, "media_seek") || !value69.on),
      (value12.textContent =
        televisionTime(value69.position) + " / " + televisionTime(value69.duration)));
    const value71 = value69.attributes.volume_level;
    (document.activeElement !== value29 &&
      ((value29.value = Number.isFinite(value71) ? value71 * 100 : 0),
      (value28.textContent = Number.isFinite(value71)
        ? "音量 " + Math.round(value71 * 100) + "%"
        : "音量")),
      (value33.textContent = value69.attributes.is_volume_muted === true ? "取消静音" : "静音"),
      value33.setAttribute("aria-pressed", String(value69.attributes.is_volume_muted === true)),
      value34.setAttribute("aria-pressed", String(value69.attributes.shuffle === true)));
    for (const value75 of list3) {
      const value76 = value75.choices
          ? value69.attributes[value75.choices] || []
          : ["off", "all", "one"],
        value77 = JSON.stringify(value76);
      if (value75.signature !== value77) {
        ((value75.signature = value77), value75.select.replaceChildren());
        for (const value78 of value76) {
          if (typeof value78 != "string") continue;
          const value79 = fn1(
            "option",
            "",
            value75.attribute === "repeat"
              ? {
                  off: "关闭循环",
                  all: "列表循环",
                  one: "单曲循环",
                }[value78]
              : value78,
          );
          ((value79.value = value78), value75.select.append(value79));
        }
      }
      ((value75.select.value = value69.attributes[value75.attribute] || ""),
        (value75.select.disabled ||= value76.length === 0));
    }
    ((value35.hidden = !value69.supports("browse_media")),
      (value35.disabled = fn4(value69) || !!value23),
      !value69.supports("browse_media") && value39.open && fn7());
    for (const value80 of [value36, value42, ...value38.querySelectorAll("button")])
      value80.disabled =
        fn4(value69) || !!value23 || (value80.textContent === "播放" && fn3("play_media"));
    ((value43.disabled = fn4(value69, "play_media") || !!value23),
      value39.setAttribute("aria-busy", String(!!value23)),
      !value69.playing && value22 !== null && (clearInterval(value22), (value22 = null)),
      value69.playing && value22 === null && !value1.hidden && (value22 = setInterval(fn11, 1000)));
  }
  function fn12() {
    (value20++,
      fn7(),
      (value46 = null),
      map1.clear(),
      value22 !== null && clearInterval(value22),
      (value22 = null),
      (list1 = []),
      value38.replaceChildren(),
      (value37.textContent = ""),
      (value36.hidden = true),
      (value17.textContent = ""),
      (text1 = ""),
      value7.removeAttribute("src"),
      (value7.hidden = true));
  }
  return {
    root: value1,
    update(arg27) {
      value21 ||
        ((value19?.item.id !== arg27.item.id || value19?.item.entityId !== arg27.item.entityId) &&
          fn12(),
        (value19 = arg27),
        fn11());
    },
    hide() {
      (!value19 && value1.hidden) || ((value1.hidden = true), fn12(), (value19 = null));
    },
    dispose() {
      value21 || (this.hide(), (value21 = true), value1.remove());
    },
  };
}
