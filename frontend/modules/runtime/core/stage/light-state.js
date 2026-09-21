/*
 * 灯光状态解算。
 *
 * 把状态表里的实体状态解算成面板要展示的灯光状态，并批量刷新灯光控件。
 *
 * 由 core/stage.js 的 mountStage 外提而来：这里只放函数，对外部状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 stage.js 里的 getter/setter，读到的始终是调用时刻的值。
 */
export function createLightStateReaders(ctx) {
  // 读某盏灯的当前状态：先问本地缓存（含滑动历史 / 上次已知值），
  // 缓存没有才回落到宿主下发的实体状态，避免宿主状态滞后时灯色闪一下。
  const readLightState = entityId =>
    ctx.lightStateCache.resolve(entityId || "", ctx.statesByEntityId[entityId]);

  // 一帧里要用的灯状态：正在预览灯光效果时用预览值覆盖真实值，
  // 预览结束后立刻回落到真实状态（preview.state 的第二个参数就是回落值）。
  const resolveLightState = lightEntityId =>
    ctx.lightPreview.state(lightEntityId, readLightState(lightEntityId));

  // 取某盏灯的渲染状态：编辑态下若正在预览该灯的灯光效果，强制按「开且可用」渲染，
  // 让编辑器立刻看到效果而不依赖实体真实状态。
  function lightStateForBinding(lightBinding) {
    const lightSnapshot = resolveLightState(lightBinding.entityId);
    if (ctx.isEditing && ctx.lightEffectPreview?.id === lightBinding.id) {
      lightSnapshot.on = true;
      lightSnapshot.available = true;
      if (ctx.lightEffectPreview.kind !== "defaults") {
        lightSnapshot.brightness = ctx.lightEffectPreview.kind === "brightnessMin" ? 1 : 100;
      }
      if (ctx.lightEffectPreview.kind.startsWith("brightness")) {
        lightSnapshot.brightnessSupported = true;
      }
      if (ctx.lightEffectPreview.kind.startsWith("temperature")) {
        lightSnapshot.temperatureSupported = true;
        lightSnapshot.kelvin = ctx.lightEffectPreview.kind.endsWith("Min")
          ? lightSnapshot.minimum
          : lightSnapshot.maximum;
      }
    }
    return lightSnapshot;
  }

  // 把灯光状态铺到 3D 场景；preview 表示允许采用本地预览值（滑杆拖动中）。
  // immediate 用于场景替换后直接置位，跳过过渡。
  function applyLightStates(options) {
    const previewMode = ctx.isEditing || ctx.isViewEditing;
    const previewLightId =
      previewMode && !ctx.isViewEditing && ctx.focusMode !== "edit" ? ctx.lightEffectPreview?.id : null;
    ctx.stageOptions.setEditorEffects?.(previewMode, !!previewLightId);
    if (
      (!ctx.stageOptions.floorTransitionActive && ctx.cameraTransition?.owner !== "floor") ||
      !!ctx.stageOptions.floorEffectsFollow
    ) {
      ctx.stageOptions.setLightStates(
        (ctx.config.lights || [])
          .filter(light => light.entityId)
          .map(lightStateEntry => {
            const lightState = lightStateForBinding(lightStateEntry);
            return {
              ...lightStateEntry,
              ...(ctx.isEditing && ctx.lightEffectPreview?.id === lightStateEntry.id
                ? lightState
                : ctx.lightRenderState(lightState)),
              ...(previewMode && lightStateEntry.id !== previewLightId
                ? {
                    on: false
                  }
                : {})
            };
          }),
        previewMode
          ? {
              ...options,
              editor: true,
              immediate: true
            }
          : options
      );
    }
  }
  return { applyLightStates, lightStateForBinding, readLightState, resolveLightState };
}
