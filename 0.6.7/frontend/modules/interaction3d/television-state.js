const v = (arg1, arg2) => (arg1 instanceof Map ? arg1.get(arg2) : arg1?.[arg2]);
export function televisionArtwork(arg3 = {}) {
  return (
    [arg3.entity_picture_local, arg3.entity_picture, arg3.media_image_url].find(
      (arg4) =>
        typeof arg4 == "string" && /^\/api\/(?:media_player_proxy|image_proxy)\/[^\s]+$/.test(arg4),
    ) || ""
  );
}
export function televisionState(arg5, arg6 = {}, arg7 = Date.now()) {
  const value1 = v(arg6, arg5.entityId),
    value2 = value1?.newState || value1 || {},
    value3 = value2.attributes || {},
    value4 = String(value2.state || "unknown").toLowerCase(),
    value5 =
      !!arg5.entityId &&
      value2.available !== false &&
      !["unknown", "unavailable", ""].includes(value4),
    value6 = value5 && !["off", "standby"].includes(value4),
    value7 = televisionPower(arg5, arg6),
    value8 = arg5.powerEntityId ? value7.available : value5,
    value9 = arg5.powerEntityId ? value7.on : value6,
    value10 = value9 && (!value6 || ["on", "idle"].includes(value4)),
    fn1 = (arg8) =>
      arg8 !== null && arg8 !== "" && Number.isFinite(Number(arg8)) ? Number(arg8) : null,
    value11 = fn1(value3.media_duration),
    value12 = fn1(value3.media_position),
    value13 = Date.parse(value3.media_position_updated_at || ""),
    value14 =
      value9 && value4 === "playing" && Number.isFinite(value13)
        ? Math.max(0, (arg7 - value13) / 1000)
        : 0;
  let value15 = value9 && !value10 ? televisionArtwork(value3) : "";
  if (value15) {
    const value16 = JSON.stringify([
      value3.media_content_id,
      value3.media_title,
      value3.media_series_title,
      value3.media_season,
      value3.media_episode,
      value3.media_album_name,
      value3.media_artist,
      value3.app_name,
      value3.source,
    ]);
    let value17 = 2166136261;
    for (let value18 = 0; value18 < value16.length; value18++)
      value17 = Math.imul(value17 ^ value16.charCodeAt(value18), 16777619);
    value15 += (value15.includes("?") ? "&" : "?") + "hb_i3d=" + (value17 >>> 0).toString(36);
  }
  return {
    state: value4,
    available: value8,
    on: value9,
    idle: value10,
    mediaAvailable: value5,
    playing: value9 && value6 && value4 === "playing",
    name: arg5.label || value3.friendly_name || "电视",
    status:
      !arg5.entityId && !arg5.powerEntityId
        ? "尚未绑定媒体实体"
        : value8
          ? !value9 && arg5.powerEntityId
            ? "电视已关闭"
            : value9 && !value6
              ? "已开启"
              : {
                  playing: "播放中",
                  paused: "已暂停",
                  buffering: "缓冲中",
                  idle: "空闲",
                  on: "已开启",
                  off: "已关闭",
                  standby: "待机",
                }[value4] || value4
          : "设备不可用",
    title: value10
      ? "暂无播放内容"
      : String(
          value3.media_title ||
            value3.media_series_title ||
            value3.app_name ||
            value3.source ||
            "暂无播放内容",
        ),
    app: String(value3.app_name || value3.source || ""),
    artist: String(value3.media_artist || ""),
    artwork: value15,
    duration: value11 > 0 ? value11 : null,
    position:
      value12 !== null
        ? Math.min(value11 > 0 ? value11 : Infinity, Math.max(0, value12 + value14))
        : null,
    updated: value2.updatedAt || value2.last_updated || "",
  };
}
export function televisionTime(arg9) {
  if (!Number.isFinite(arg9)) return "—";
  const value19 = Math.max(0, Math.floor(arg9));
  return Math.floor(value19 / 60) + ":" + String(value19 % 60).padStart(2, "0");
}
export function televisionPower(arg10, arg11 = {}, arg12) {
  const value20 = arg10.powerEntityId || arg10.entityId || "",
    value21 = value20.split(".")[0],
    value22 = v(arg11, value20),
    value23 = value22?.newState || value22 || {},
    value24 =
      !!value20 &&
      value23.available !== false &&
      typeof value23.state == "string" &&
      !["unknown", "unavailable", ""].includes(value23.state),
    value25 = value24 && !["off", "standby"].includes(value23.state),
    value26 = typeof arg12 == "boolean" ? arg12 : !value25,
    value27 = value26 ? "turn_on" : "turn_off",
    value28 = Number(value23.attributes?.supported_features) || 0,
    value29 =
      value21 === "switch" || (value21 === "media_player" && !!(value28 & (value26 ? 128 : 256)));
  return {
    entityId: value20,
    domain: value21,
    on: value25,
    available: value24,
    supported: value29,
    service: value27,
    reason: value24 ? (value29 ? "" : "此实体不支持开关机") : "电源状态不可用",
    command: {
      entityId: value20,
      domain: value21,
      service: value27,
      data: {},
      deviceKind: "television",
    },
  };
}
export function televisionMediaControl(arg13, arg14, arg15) {
  const value30 = v(arg14, arg13.entityId),
    value31 = value30?.newState || value30 || {},
    value32 = televisionState(arg13, arg14),
    value33 = Number(value31.attributes?.supported_features) || 0,
    value34 =
      arg15 === "previous"
        ? "media_previous_track"
        : arg15 === "next"
          ? "media_next_track"
          : value32.playing
            ? "media_pause"
            : "media_play",
    value35 = {
      media_previous_track: 16,
      media_next_track: 32,
      media_pause: 1,
      media_play: 16384,
    }[value34];
  return {
    enabled:
      value32.on &&
      value32.mediaAvailable &&
      !["off", "standby"].includes(value32.state) &&
      !!(value33 & value35),
    command: {
      domain: "media_player",
      entityId: arg13.entityId,
      service: value34,
      data: {},
      deviceKind: "television",
    },
  };
}
