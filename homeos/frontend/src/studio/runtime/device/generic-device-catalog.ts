import { DEVICE_PROFILE_TABLE } from "./device-profiles";

/**
 * 设备档案统一由 `device-profiles` 提供；这里只保留 3D 场景需要的
 * 默认高度与状态灯开关，避免前后端/各面板各写一份白名单。
 */
const GENERIC_DEVICE_PROFILES = Object.freeze(
  Object.fromEntries(
    Object.entries(DEVICE_PROFILE_TABLE).map(([deviceKind, profile]) => [
      deviceKind,
      Object.freeze({
        ...profile,
        icon: profile.icon || "mdi:devices",
        height: profile.height ?? 0.9,
        statusIndicator: profile.statusIndicator !== false,
      }),
    ]),
  ),
);
export const GENERIC_DEVICE_KINDS = Object.freeze(Object.keys(GENERIC_DEVICE_PROFILES)),
  isGenericDeviceKind = (candidateKind: any) => Object.hasOwn(GENERIC_DEVICE_PROFILES, candidateKind),
  genericDeviceProfile = (requestedKind: any) =>
    isGenericDeviceKind(requestedKind) ? (GENERIC_DEVICE_PROFILES as any)[requestedKind] : null;
export function genericDeviceMetadata(placements: any[] = []) {
  return Object.fromEntries(
    GENERIC_DEVICE_KINDS.map((deviceKind) => {
      const deviceProfile = genericDeviceProfile(deviceKind);
      return [
        deviceProfile.collection,
        placements
          .filter((placement) =>
            (deviceProfile.modelTypes || [deviceProfile.modelType]).includes(placement.type),
          )
          .map((entry, entryIndex) => ({
            id: entry.id,
            type: entry.type,
            name:
              entry.name ||
              (deviceProfile.modelLabels?.[entry.type] || deviceProfile.label) +
                " " +
                (entryIndex + 1),
            x: entry.x,
            y: entry.y,
            height:
              (Number(entry.elevation) || 0) +
              (Number(entry.height) || deviceProfile.height) *
                (deviceKind === "smallcar" ? 1 : 0.5) +
              (deviceKind === "smallcar" ? 0.25 : 0),
          })),
      ];
    }),
  );
}
