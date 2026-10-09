import {
  GENERIC_DEVICE_KINDS,
  genericDeviceProfile,
} from "../../device/generic-device-catalog";

export function buildFloorCameraConfig(
  rawFloorConfig: any,
  applyPageAppearancePreset: (config: any) => any,
  transformFloorCamera: (pose: any, floorSelectionId?: any, isImmediate?: boolean) => any,
) {
  const as2 = applyPageAppearancePreset(structuredClone(rawFloorConfig));
  if (
    ((as2.camera = transformFloorCamera(
      as2.floorCameras?.[as2.floorSelection] || as2.camera,
      as2.floorSelection,
    )),
    (as2.lights = (as2.lights || []).map((configLightEntry: any) => ({
      ...configLightEntry,
      ...(configLightEntry.focusCamera
        ? {
            focusCamera: transformFloorCamera(configLightEntry.focusCamera, as2.floorSelection),
          }
        : {}),
    }))),
    as2.security?.cameras &&
      (as2.security.cameras = (as2.security.cameras || []).map((configCameraEntry: any) => ({
        ...configCameraEntry,
        ...(configCameraEntry.focusCamera
          ? {
              focusCamera: transformFloorCamera(
                configCameraEntry.focusCamera,
                as2.floorSelection,
              ),
            }
          : {}),
      }))),
    as2.security?.presenceSensors &&
      (as2.security.presenceSensors = as2.security.presenceSensors.map((configPresenceEntry: any) => ({
        ...configPresenceEntry,
        ...(configPresenceEntry.focusCamera
          ? {
              focusCamera: transformFloorCamera(
                configPresenceEntry.focusCamera,
                as2.floorSelection,
              ),
            }
          : {}),
      }))),
    as2.environment)
  ) {
    for (const environmentGroupName of [
      "airConditioners",
      "airers",
      "fans",
      "airPurifiers",
      "waterHeaters",
      "curtains",
      "curtainGroups",
      "temperatureHumidity",
    ])
      as2.environment[environmentGroupName] = (as2.environment[environmentGroupName] || []).map(
        (environmentGroupEntry: any) => ({
          ...environmentGroupEntry,
          ...(environmentGroupEntry.focusCamera
            ? {
                focusCamera: transformFloorCamera(
                  environmentGroupEntry.focusCamera,
                  as2.floorSelection,
                ),
              }
            : {}),
        }),
      );
  }
  for (const deviceGroupName of [
    "nas",
    "speakers",
    "televisions",
    "vacuums",
    ...GENERIC_DEVICE_KINDS.map(
      (profileDeviceKindName) => genericDeviceProfile(profileDeviceKindName).collection,
    ),
  ])
    as2.devices?.[deviceGroupName] &&
      (as2.devices[deviceGroupName] = as2.devices[deviceGroupName].map((configDeviceEntry: any) => ({
        ...configDeviceEntry,
        ...(configDeviceEntry.focusCamera
          ? {
              focusCamera: transformFloorCamera(
                configDeviceEntry.focusCamera,
                as2.floorSelection,
              ),
            }
          : {}),
      })));
  if (as2.devices?.vacuums) {
    for (const configVacuumEntry of as2.devices.vacuums)
      configVacuumEntry.followCamera &&
        (configVacuumEntry.followCamera = transformFloorCamera(
          configVacuumEntry.followCamera,
          as2.floorSelection,
        ));
  }
  return as2;
}
