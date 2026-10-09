const readEntityState = (stateSource: any, entityId: any) =>
  stateSource instanceof Map ? stateSource.get(entityId) : stateSource?.[entityId];

/** 0.7.2：screenImage.assetId = user:<32hex>；兼容旧 posterAssetId（裸 hex 或 user:） */
export function televisionScreenAssetId(televisionConfig: any = {}) {
  const fromScreen = televisionConfig?.screenImage?.assetId;
  if (typeof fromScreen == "string" && /^user:[0-9a-f]{32}$/i.test(fromScreen.trim()))
    return fromScreen.trim().toLowerCase();
  const legacy = String(televisionConfig?.posterAssetId || "")
    .trim()
    .toLowerCase();
  const bare = legacy.replace(/^user:/, "");
  return /^[0-9a-f]{32}$/.test(bare) ? "user:" + bare : "";
}

function televisionPosterAssetUrl(televisionConfig: any) {
  const assetId = televisionScreenAssetId(televisionConfig);
  return assetId ? "/api/v1/assets/user/" + assetId.slice(5) : "";
}
function televisionArtwork(
  artworkAttributes: {
    entity_picture_local?: any;
    entity_picture?: any;
    media_image_url?: any;
  } = {},
) {
  return (
    [
      artworkAttributes.entity_picture_local,
      artworkAttributes.entity_picture,
      artworkAttributes.media_image_url,
    ].find(
      (candidateArtworkUrl) =>
        typeof candidateArtworkUrl == "string" &&
        /^\/api\/(?:media_player_proxy|image_proxy)\/[^\s]+$/.test(candidateArtworkUrl),
    ) || ""
  );
}
export function televisionState(televisionConfig: any, entityStateStore: Record<string, any> = {}, nowMs = Date.now()) {
  const stateEntry = readEntityState(entityStateStore, televisionConfig.entityId),
    entityState = stateEntry?.newState || stateEntry || {},
    stateAttributes = entityState.attributes || {},
    normalizedState = String(entityState.state || "unknown").toLowerCase(),
    isMediaAvailable =
      !!televisionConfig.entityId &&
      entityState.available !== false &&
      !["unknown", "unavailable", ""].includes(normalizedState),
    isMediaOn = isMediaAvailable && !["off", "standby"].includes(normalizedState),
    powerState = televisionPower(televisionConfig, entityStateStore),
    isAvailable = televisionConfig.powerEntityId ? powerState.available : isMediaAvailable,
    isOn = televisionConfig.powerEntityId ? powerState.on : isMediaOn,
    isIdle = isOn && (!isMediaOn || ["on", "idle"].includes(normalizedState)),
    parseFiniteNumber = (rawInput: any) =>
      rawInput !== null && rawInput !== "" && Number.isFinite(Number(rawInput))
        ? Number(rawInput)
        : null,
    mediaDurationSeconds = parseFiniteNumber(stateAttributes.media_duration),
    mediaPositionSeconds = parseFiniteNumber(stateAttributes.media_position),
    mediaPositionUpdatedAtMs = Date.parse(stateAttributes.media_position_updated_at || ""),
    mediaPositionElapsedSeconds =
      isOn && normalizedState === "playing" && Number.isFinite(mediaPositionUpdatedAtMs)
        ? Math.max(0, (nowMs - mediaPositionUpdatedAtMs) / 1000)
        : 0;
  let artworkUrl = isOn && !isIdle ? televisionArtwork(stateAttributes) : "";
  const customPosterUrl = televisionPosterAssetUrl(televisionConfig);
  if (artworkUrl) {
    const artworkIdentityJson = JSON.stringify([
      stateAttributes.media_content_id,
      stateAttributes.media_title,
      stateAttributes.media_series_title,
      stateAttributes.media_season,
      stateAttributes.media_episode,
      stateAttributes.media_album_name,
      stateAttributes.media_artist,
      stateAttributes.app_name,
      stateAttributes.source,
    ]);
    let artworkHash = 2166136261;
    for (let charIndex = 0; charIndex < artworkIdentityJson.length; charIndex++)
      artworkHash = Math.imul(artworkHash ^ artworkIdentityJson.charCodeAt(charIndex), 16777619);
    artworkUrl +=
      (artworkUrl.includes("?") ? "&" : "?") + "hb_i3d=" + (artworkHash >>> 0).toString(36);
  }
  return {
    state: normalizedState,
    available: isAvailable,
    on: isOn,
    idle: isIdle,
    mediaAvailable: isMediaAvailable,
    playing: isOn && isMediaOn && normalizedState === "playing",
    name: televisionConfig.label || stateAttributes.friendly_name || "电视",
    status:
      !televisionConfig.entityId && !televisionConfig.powerEntityId
        ? "尚未绑定媒体实体"
        : isAvailable
          ? !isOn && televisionConfig.powerEntityId
            ? "电视已关闭"
            : isOn && !isMediaOn
              ? "已开启"
              : {
                  playing: "播放中",
                  paused: "已暂停",
                  buffering: "缓冲中",
                  idle: "空闲",
                  on: "已开启",
                  off: "已关闭",
                  standby: "待机",
                }[normalizedState] || normalizedState
          : "设备不可用",
    title: isIdle
      ? "暂无播放内容"
      : String(
          stateAttributes.media_title ||
            stateAttributes.media_series_title ||
            stateAttributes.app_name ||
            stateAttributes.source ||
            "暂无播放内容",
        ),
    app: String(stateAttributes.app_name || stateAttributes.source || ""),
    artist: String(stateAttributes.media_artist || ""),
    artwork: artworkUrl,
    customPosterUrl: customPosterUrl,
    screenImageUrl: artworkUrl || (isOn ? customPosterUrl : ""),
    duration: mediaDurationSeconds! > 0 ? mediaDurationSeconds : null,
    position:
      mediaPositionSeconds !== null
        ? Math.min(
            mediaDurationSeconds! > 0 ? mediaDurationSeconds! : Infinity!,
            Math.max(0, mediaPositionSeconds + mediaPositionElapsedSeconds),
          )
        : null,
    updated: entityState.updatedAt || entityState.last_updated || "",
  };
}
export function televisionTime(totalSeconds: any) {
  if (!Number.isFinite(totalSeconds)) return "—";
  const wholeSeconds = Math.max(0, Math.floor(totalSeconds));
  return Math.floor(wholeSeconds / 60) + ":" + String(wholeSeconds % 60).padStart(2, "0");
}
export function televisionPower(powerConfig: any, powerStateStore: Record<string, any> = {}, desiredOn: any = undefined) {
  const targetEntityId = powerConfig.powerEntityId || powerConfig.entityId || "",
    entityDomain = targetEntityId.split(".")[0],
    powerStateEntry = readEntityState(powerStateStore, targetEntityId),
    powerEntityState = powerStateEntry?.newState || powerStateEntry || {},
    isPowerAvailable =
      !!targetEntityId &&
      powerEntityState.available !== false &&
      typeof powerEntityState.state == "string" &&
      !["unknown", "unavailable", ""].includes(powerEntityState.state),
    isPowerOn = isPowerAvailable && !["off", "standby"].includes(powerEntityState.state),
    shouldTurnOn = typeof desiredOn == "boolean" ? desiredOn : !isPowerOn,
    powerService = shouldTurnOn ? "turn_on" : "turn_off",
    powerSupportedFeatures = Number(powerEntityState.attributes?.supported_features) || 0,
    canTogglePower =
      entityDomain === "switch" ||
      (entityDomain === "media_player" && !!(powerSupportedFeatures & (shouldTurnOn ? 128 : 256)));
  return {
    entityId: targetEntityId,
    domain: entityDomain,
    on: isPowerOn,
    available: isPowerAvailable,
    supported: canTogglePower,
    service: powerService,
    reason: isPowerAvailable ? (canTogglePower ? "" : "此实体不支持开关机") : "电源状态不可用",
    command: {
      entityId: targetEntityId,
      domain: entityDomain,
      service: powerService,
      data: {} as Record<string, any>,
      deviceKind: "television",
    },
  };
}
export function televisionMediaControl(mediaConfig: any, mediaStateStore: any, mediaAction: any) {
  const mediaStateEntry = readEntityState(mediaStateStore, mediaConfig.entityId),
    mediaEntityState = mediaStateEntry?.newState || mediaStateEntry || {},
    televisionSnapshot = televisionState(mediaConfig, mediaStateStore),
    mediaSupportedFeatures = Number(mediaEntityState.attributes?.supported_features) || 0,
    mediaService =
      mediaAction === "previous"
        ? "media_previous_track"
        : mediaAction === "next"
          ? "media_next_track"
          : televisionSnapshot.playing
            ? "media_pause"
            : "media_play",
    requiredFeatureMask = {
      media_previous_track: 16,
      media_next_track: 32,
      media_pause: 1,
      media_play: 16384,
    }[mediaService];
  return {
    enabled:
      televisionSnapshot.on &&
      televisionSnapshot.mediaAvailable &&
      !["off", "standby"].includes(televisionSnapshot.state) &&
      !!(mediaSupportedFeatures & requiredFeatureMask),
    command: {
      domain: "media_player",
      entityId: mediaConfig.entityId,
      service: mediaService,
      data: {} as Record<string, any>,
      deviceKind: "television",
    },
  };
}
