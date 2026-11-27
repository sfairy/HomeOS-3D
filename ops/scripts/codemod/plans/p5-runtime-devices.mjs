// P5：runtime 各设备目录按能力并成一个文件（保留 security-editor 等契约 URL）。
export default {
  merges: [
    {
      into: 'homeos/frontend/src/studio/runtime/airer/airer.ts',
      from: [
        'homeos/frontend/src/studio/runtime/airer/airer-direction.ts',
        'homeos/frontend/src/studio/runtime/airer/airer-motion.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/camera/camera.ts',
      from: [
        'homeos/frontend/src/studio/runtime/camera/camera-budget.ts',
        'homeos/frontend/src/studio/runtime/camera/camera-mjpeg.ts',
        'homeos/frontend/src/studio/runtime/camera/camera-motion.ts',
        'homeos/frontend/src/studio/runtime/camera/camera-status.ts',
        'homeos/frontend/src/studio/runtime/camera/go2rtc-url.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/climate/climate.ts',
      from: [
        'homeos/frontend/src/studio/runtime/climate/boiler-copy.ts',
        'homeos/frontend/src/studio/runtime/climate/climate-panel.ts',
        'homeos/frontend/src/studio/runtime/climate/climate-state.ts',
        'homeos/frontend/src/studio/runtime/climate/purifier-extras.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/cover/cover.ts',
      from: [
        'homeos/frontend/src/studio/runtime/cover/cover-feedback.ts',
        'homeos/frontend/src/studio/runtime/cover/cover-group-panel.ts',
        'homeos/frontend/src/studio/runtime/cover/cover-groups.ts',
        'homeos/frontend/src/studio/runtime/cover/cover-memory-client.ts',
        'homeos/frontend/src/studio/runtime/cover/cover-memory-travel.ts',
        'homeos/frontend/src/studio/runtime/cover/cover-operation.ts',
        'homeos/frontend/src/studio/runtime/cover/cover-panel.ts',
        'homeos/frontend/src/studio/runtime/cover/cover-state.ts',
        'homeos/frontend/src/studio/runtime/cover/curtain-motion.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/fan/fan.ts',
      from: [
        'homeos/frontend/src/studio/runtime/fan/fan-motion.ts',
        'homeos/frontend/src/studio/runtime/fan/fan-state.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/light/light.ts',
      from: [
        'homeos/frontend/src/studio/runtime/light/light-color-picker.ts',
        'homeos/frontend/src/studio/runtime/light/light-state.ts',
        'homeos/frontend/src/studio/runtime/light/light-stream.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/nas/nas.ts',
      from: [
        'homeos/frontend/src/studio/runtime/nas/nas-panel.ts',
        'homeos/frontend/src/studio/runtime/nas/nas-status.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/navigation/navigation.ts',
      from: [
        'homeos/frontend/src/studio/runtime/navigation/binding-repair.ts',
        'homeos/frontend/src/studio/runtime/navigation/category-transition-diagnostics.ts',
        'homeos/frontend/src/studio/runtime/navigation/navigation-defaults.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/presence/presence.ts',
      from: [
        'homeos/frontend/src/studio/runtime/presence/presence-character.ts',
        'homeos/frontend/src/studio/runtime/presence/presence-editor.ts',
        'homeos/frontend/src/studio/runtime/presence/presence-focus-editor.ts',
        'homeos/frontend/src/studio/runtime/presence/presence-motion.ts',
        'homeos/frontend/src/studio/runtime/presence/presence-scene.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/speaker/speaker.ts',
      from: [
        'homeos/frontend/src/studio/runtime/speaker/speaker-models.ts',
        'homeos/frontend/src/studio/runtime/speaker/speaker-panel.ts',
        'homeos/frontend/src/studio/runtime/speaker/speaker-ring.ts',
        'homeos/frontend/src/studio/runtime/speaker/speaker-state.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/television/television.ts',
      from: [
        'homeos/frontend/src/studio/runtime/television/television-panel.ts',
        'homeos/frontend/src/studio/runtime/television/television-screen.ts',
        'homeos/frontend/src/studio/runtime/television/television-state.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/vacuum/vacuum.ts',
      from: [
        'homeos/frontend/src/studio/runtime/vacuum/vacuum-map-editor.ts',
        'homeos/frontend/src/studio/runtime/vacuum/vacuum-map.ts',
        'homeos/frontend/src/studio/runtime/vacuum/vacuum-motion.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/vehicle/vehicle.ts',
      from: [
        'homeos/frontend/src/studio/runtime/vehicle/car-card.ts',
        'homeos/frontend/src/studio/runtime/vehicle/car-charging.ts',
        'homeos/frontend/src/studio/runtime/vehicle/car-state.ts',
        'homeos/frontend/src/studio/runtime/vehicle/car-tires.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/window/window.ts',
      from: [
        'homeos/frontend/src/studio/runtime/window/window-motion.ts',
        'homeos/frontend/src/studio/runtime/window/window-opener.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/device/device.ts',
      from: [
        'homeos/frontend/src/studio/runtime/device/computer-screen.ts',
        'homeos/frontend/src/studio/runtime/device/computer-state.ts',
        'homeos/frontend/src/studio/runtime/device/device-panel.ts',
        'homeos/frontend/src/studio/runtime/device/device-profiles.ts',
        'homeos/frontend/src/studio/runtime/device/device-status.ts',
        'homeos/frontend/src/studio/runtime/device/entity-capabilities.ts',
        'homeos/frontend/src/studio/runtime/device/extra-sources.ts',
        'homeos/frontend/src/studio/runtime/device/fridge-openings.ts',
        'homeos/frontend/src/studio/runtime/device/game-console-panel.ts',
        'homeos/frontend/src/studio/runtime/device/game-console-state.ts',
        'homeos/frontend/src/studio/runtime/device/generic-device-catalog.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/panels/panels.ts',
      from: [
        'homeos/frontend/src/studio/runtime/panels/camera-extra-panel.ts',
        'homeos/frontend/src/studio/runtime/panels/compound-extra-panel.ts',
        'homeos/frontend/src/studio/runtime/panels/display-extra-panel.ts',
        'homeos/frontend/src/studio/runtime/panels/extended-extra-panel.ts',
        'homeos/frontend/src/studio/runtime/panels/image-extra-panel.ts',
        'homeos/frontend/src/studio/runtime/panels/input-extra-panel.ts',
        'homeos/frontend/src/studio/runtime/panels/light-extra-panel.ts',
        'homeos/frontend/src/studio/runtime/panels/list-extra-panel.ts',
        'homeos/frontend/src/studio/runtime/panels/native-extra-panel.ts',
        'homeos/frontend/src/studio/runtime/panels/panel-utils.ts',
        'homeos/frontend/src/studio/runtime/panels/service-extra-panel.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/runtime/security/security.ts',
      from: [
        'homeos/frontend/src/studio/runtime/security/lock-motion.ts',
        'homeos/frontend/src/studio/runtime/security/lock-panel.ts',
        'homeos/frontend/src/studio/runtime/security/lock-state.ts',
        'homeos/frontend/src/studio/runtime/security/security-alarm.ts',
        'homeos/frontend/src/studio/runtime/security/window-config-merge.ts',
      ],
    },
  ],
}
