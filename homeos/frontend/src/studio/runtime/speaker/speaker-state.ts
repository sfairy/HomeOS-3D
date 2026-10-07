import { televisionState } from "../television/television-state";
const SPEAKER_FEATURES = Object.freeze({
  media_pause: 1,
  media_seek: 2,
  volume_set: 4,
  volume_mute: 8,
  media_previous_track: 16,
  media_next_track: 32,
  turn_on: 128,
  turn_off: 256,
  play_media: 512,
  volume_up: 1024,
  volume_down: 1024,
  select_source: 2048,
  media_stop: 4096,
  media_play: 16384,
  shuffle_set: 32768,
  select_sound_mode: 65536,
  browse_media: 131072,
  repeat_set: 262144,
});
export function speakerState(entity: any, sourceStates: Record<string, any> = {}, nowMs = Date.now()) {
  const rawState =
      sourceStates instanceof Map
        ? sourceStates.get(entity.entityId)
        : (sourceStates as any)[entity.entityId],
    entityState = rawState?.newState || rawState || {},
    attributes = entityState.attributes || {},
    tvState = televisionState(
      {
        ...entity,
        label: entity.label || attributes.friendly_name || "智能音响",
        powerEntityId: "",
      },
      sourceStates,
      nowMs,
    ),
    supportedFeatures = Number(attributes.supported_features) || 0,
    supports = (feature: any) => !!(supportedFeatures & (SPEAKER_FEATURES as any)[feature]),
    isAvailable = tvState.available && entity.modelAvailable !== false;
  return {
    ...tvState,
    available: isAvailable,
    attributes: attributes,
    supports: supports,
    album: String(attributes.media_album_name || ""),
    ring:
      isAvailable && tvState.playing
        ? "playing"
        : isAvailable && tvState.state === "paused"
          ? "paused"
          : "off",
    status: entity.modelAvailable === false ? "模型已失联" : tvState.status,
  };
}
export function speakerCommand(commandEntity: any, commandStates: any, service: any, serviceData: Record<string, any> = {}) {
  const state = speakerState(commandEntity, commandStates);
  return {
    enabled:
      state.available &&
      state.supports(service) &&
      (state.on || ["turn_on", "browse_media"].includes(service)),
    command: {
      deviceKind: "speaker",
      domain: "media_player",
      entityId: commandEntity.entityId,
      service: service,
      data: serviceData,
    },
  };
}
