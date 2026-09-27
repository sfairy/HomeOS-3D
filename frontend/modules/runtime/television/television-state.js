/**
 * 电视（media_player + 可选电源实体）的状态归一化与控制命令构造：从 HA 实体抽出开关机、
 */

import {
  entityDomainFromId,
  finiteNumberOrNull,
  readFromMapOrRecord,
  resolveStateEntry,
  stateTextOf
} from "../core/static-helpers.js?v=2609271411";
/**
 * 从媒体实体属性里挑出可用的封面地址。
 */
function televisionArtwork(entityAttributes = {}) {
  return (
    // 只接受本机代理地址（/api/media_player_proxy 与 /api/image_proxy）：
    [
      entityAttributes.entity_picture_local,
      entityAttributes.entity_picture,
      entityAttributes.media_image_url
    ].find(
      candidateUrl =>
        typeof candidateUrl == "string" &&
        /^\/api\/(?:media_player_proxy|image_proxy)\/[^\s]+$/.test(candidateUrl)
    ) || ""
  );
}
/**
 * 把 HA 状态归一化成 3D 电视屏幕需要的展示状态。
 */
export function televisionState(item, stateSources = {}, nowMs = Date.now()) {
  const receivedState = readFromMapOrRecord(stateSources, item.entityId);
  const stateObject = resolveStateEntry(receivedState, {});
  const attributes = stateObject.attributes || {};
  // 媒体实体缺失时用 unknown 兜底，后面统一按不可用处理。
  const stateValue = stateTextOf(stateObject) || "unknown";
  // 媒体侧可用性：绑定了实体、HA 未标记不可用、状态非未知。
  const mediaAvailable =
    !!item.entityId &&
    stateObject.available !== false &&
    !["unknown", "unavailable", ""].includes(stateValue);
  const mediaOn = mediaAvailable && !["off", "standby"].includes(stateValue);
  const powerControl = televisionPower(item, stateSources);
  // 绑定了独立电源实体时，以电源为准：媒体实体可能整机断电而报 unknown，
  const available = item.powerEntityId ? powerControl.available : mediaAvailable;
  const isOn = item.powerEntityId ? powerControl.on : mediaOn;
  // 已开机但媒体侧没在播：面板显示「空闲」而不是沿用上一首曲目。
  const idle = isOn && (!mediaOn || ["on", "idle"].includes(stateValue));
  const duration = finiteNumberOrNull(attributes.media_duration);
  const reportedPosition = finiteNumberOrNull(attributes.media_position);
  const positionUpdatedAt = Date.parse(attributes.media_position_updated_at || "");
  // HA 只在状态变化时上报 media_position，播放期间靠「上报时刻 + 已过时间」推算，
  const elapsedSeconds =
    isOn && stateValue === "playing" && Number.isFinite(positionUpdatedAt)
      ? Math.max(0, (nowMs - positionUpdatedAt) / 1000)
      : 0;
  let artworkUrl = isOn && !idle ? televisionArtwork(attributes) : "";
  if (artworkUrl) {
    // 封面地址在同一台电视上往往是固定不变的（代理地址不变，内容却随曲目变），
    const artworkSignature = JSON.stringify([
      attributes.media_content_id,
      attributes.media_title,
      attributes.media_series_title,
      attributes.media_season,
      attributes.media_episode,
      attributes.media_album_name,
      attributes.media_artist,
      attributes.app_name,
      attributes.source
    ]);
    // FNV-1a 32 位哈希：无依赖、够短，只为做缓存区分，不需要抗碰撞。
    let hash = 2166136261;
    for (let index = 0; index < artworkSignature.length; index++) {
      hash = Math.imul(hash ^ artworkSignature.charCodeAt(index), 16777619);
    }
    // 用 36 进制压缩哈希长度；地址已带查询串时改用 & 追加。
    artworkUrl += (artworkUrl.includes("?") ? "&" : "?") + "hb_i3d=" + (hash >>> 0).toString(36);
  }
  // 返回结构是电视屏幕与面板的内部契约；status 是一个优先级链：
  return {
    state: stateValue,
    available: available,
    on: isOn,
    idle: idle,
    mediaAvailable: mediaAvailable,
    playing: isOn && mediaOn && stateValue === "playing",
    name: item.label || attributes.friendly_name || "电视",
    status:
      !item.entityId && !item.powerEntityId
        ? "尚未绑定媒体实体"
        : available
          ? !isOn && item.powerEntityId
            ? "电视已关闭"
            : isOn && !mediaOn
              ? "已开启"
              : {
                  playing: "播放中",
                  paused: "已暂停",
                  buffering: "缓冲中",
                  idle: "空闲",
                  on: "已开启",
                  off: "已关闭",
                  standby: "待机"
                }[stateValue] || stateValue
          : "设备不可用",
    title: idle
      ? "暂无播放内容"
      : String(
          attributes.media_title ||
            attributes.media_series_title ||
            attributes.app_name ||
            attributes.source ||
            "暂无播放内容"
        ),
    app: String(attributes.app_name || attributes.source || ""),
    artist: String(attributes.media_artist || ""),
    artwork: artworkUrl,
    // duration 为 0 或负数时视为「无时长」，后面进度条据此走未知态。
    duration: duration > 0 ? duration : null,
    // 进度上界取时长；时长未知时用 Infinity 兜底，只保证下界不小于 0。
    position:
      reportedPosition !== null
        ? Math.min(
            duration > 0 ? duration : Infinity,
            Math.max(0, reportedPosition + elapsedSeconds)
          )
        : null,
    updated: stateObject.updatedAt || stateObject.last_updated || ""
  };
}
/**
 * 把秒数格式化成 m:ss。
 */
export function televisionTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "—";
  }
  const totalSeconds = Math.max(0, Math.floor(seconds));
  return Math.floor(totalSeconds / 60) + ":" + String(totalSeconds % 60).padStart(2, "0");
}
/**
 * 归一化电视的电源状态并生成开关机命令。
 */
export function televisionPower(powerItem, powerStates = {}, desiredOn) {
  // 允许「电源就是媒体播放器自身」的简化配置。
  const powerEntityId = powerItem.powerEntityId || powerItem.entityId || "";
  const domain = entityDomainFromId(powerEntityId);
  const powerState = readFromMapOrRecord(powerStates, powerEntityId);
  const powerStateObject = resolveStateEntry(powerState, {});
  const powerAvailable =
    !!powerEntityId &&
    powerStateObject.available !== false &&
    typeof powerStateObject.state == "string" &&
    !["unknown", "unavailable", ""].includes(powerStateObject.state);
  // standby 在本项目里等同于关机，与电视遥控器的语义一致。
  const powerOn = powerAvailable && !["off", "standby"].includes(powerStateObject.state);
  const turnOn = typeof desiredOn == "boolean" ? desiredOn : !powerOn;
  const service = turnOn ? "turn_on" : "turn_off";
  const supportedFeatures = Number(powerStateObject.attributes?.supported_features) || 0;
  // switch 域必然支持开关；media_player 则要看能力位：128=开机、256=关机。
  const supported =
    domain === "switch" ||
    (domain === "media_player" && !!(supportedFeatures & (turnOn ? 128 : 256)));
  return {
    entityId: powerEntityId,
    domain: domain,
    on: powerOn,
    available: powerAvailable,
    supported: supported,
    service: service,
    reason: powerAvailable ? (supported ? "" : "此实体不支持开关机") : "电源状态不可用",
    command: {
      entityId: powerEntityId,
      domain: domain,
      service: service,
      data: {},
      deviceKind: "television"
    }
  };
}
/**
 * 生成媒体控制（上一曲 / 下一曲 / 播放暂停）命令。
 */
export function televisionMediaControl(mediaItem, mediaStates, action) {
  const mediaState = readFromMapOrRecord(mediaStates, mediaItem.entityId);
  const mediaStateObject = resolveStateEntry(mediaState, {});
  const mediaPlayerState = televisionState(mediaItem, mediaStates);
  const mediaSupportedFeatures = Number(mediaStateObject.attributes?.supported_features) || 0;
  const mediaService =
    action === "previous"
      ? "media_previous_track"
      : action === "next"
        ? "media_next_track"
        : mediaPlayerState.playing
          ? "media_pause"
          : "media_play";
  // 每个服务对应的能力位（HA MediaPlayerEntityFeature）：
  const requiredFeature = {
    media_previous_track: 16,
    media_next_track: 32,
    media_pause: 1,
    media_play: 16384
  }[mediaService];
  return {
    // 三重前置条件：电视已开机、媒体实体可用、且实体声明了对应能力位。
    enabled:
      mediaPlayerState.on &&
      mediaPlayerState.mediaAvailable &&
      !["off", "standby"].includes(mediaPlayerState.state) &&
      !!(mediaSupportedFeatures & requiredFeature),
    command: {
      domain: "media_player",
      entityId: mediaItem.entityId,
      service: mediaService,
      data: {},
      deviceKind: "television"
    }
  };
}
