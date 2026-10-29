/**
 * 设备类别的分组与图标（0.8.1：原「设备类别弹窗」已并入 `openConfigurationPicker`，
 * 这里只剩纯数据，供类别选择器的分组与 `configurationProgress` 复用）。
 */

import { GENERIC_DEVICE_KINDS, genericDeviceProfile } from "../../../device/generic-device-catalog";

export interface DeviceCategoryProfile {
  label: string;
  icon: string;
}

const FIXED_DEVICE_CATEGORIES: Readonly<Record<string, DeviceCategoryProfile>> = Object.freeze({
  nas: Object.freeze({ label: "NAS", icon: "mdi:nas" }),
  television: Object.freeze({ label: "电视", icon: "mdi:television" }),
  speaker: Object.freeze({ label: "智能音响", icon: "mdi:speaker" }),
  "water-heater": Object.freeze({ label: "热水器", icon: "mdi:water-boiler" }),
  airer: Object.freeze({ label: "晾衣架", icon: "mdi:hanger" }),
});

/** 兜底分组名；静态分组与未分组型号都必须落回同一个分组，避免弹窗里出现两个同名分区。 */
const OTHER_DEVICE_GROUP_LABEL = "其他设备";

const DEVICE_CATEGORY_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = Object.freeze([
  ["常用设备", ["nas", "television", "speaker", "router", "home-network-cabinet", "smart-socket-86"]],
  [
    "家用电器",
    [
      "water-heater",
      "airer",
      "fridge",
      "dishwasher",
      "washer",
      "dryer",
      "rangehood",
      "water-purifier",
      "ricecooker",
      "steamoven",
      "air-fryer",
      "humidifier",
      "aroma-diffuser",
      "pressure-cooker",
      "disinfection-cabinet",
      "tea_bar_machine",
      "pipelinewaterpurifier",
      "juicer",
      "bread-maker",
      "power-blender",
      "microwave",
      "coffee-machine",
      "toilet",
    ],
  ],
  [
    OTHER_DEVICE_GROUP_LABEL,
    ["smallcar", "plant", "bed", "sofa", "computer", "printer", "3d-printer", "pet-feeder", "pet-fountain", "pet-dryer"],
  ],
] as ReadonlyArray<readonly [string, readonly string[]]>);

export function resolveDeviceCategoryProfile(deviceKind: string): DeviceCategoryProfile {
  const fixedProfile = FIXED_DEVICE_CATEGORIES[deviceKind];
  if (fixedProfile) return fixedProfile;
  const genericProfile = genericDeviceProfile(deviceKind);
  return genericProfile
    ? { label: genericProfile.label, icon: genericProfile.icon }
    : { label: String(deviceKind ?? ""), icon: "" };
}

/** 返回 `[分组名, 型号列表]`；过滤掉不存在的型号，未分组型号补进「其他设备」。 */
export function deviceCategoryGroups(): Array<[string, string[]]> {
  const groupedKinds = new Set<string>(),
    groups = DEVICE_CATEGORY_GROUPS.map(
      ([groupLabel, groupKinds]) =>
        [
          groupLabel,
          groupKinds.filter((deviceKind) => {
            if (!FIXED_DEVICE_CATEGORIES[deviceKind] && !genericDeviceProfile(deviceKind)) return false;
            groupedKinds.add(deviceKind);
            return true;
          }),
        ] as [string, string[]],
    ).filter(([, groupKinds]) => groupKinds.length),
    leftoverKinds = ["nas", "television", "speaker", "water-heater", "airer", ...GENERIC_DEVICE_KINDS].filter(
      (deviceKind) => !groupedKinds.has(deviceKind),
    );
  if (leftoverKinds.length) {
    // 合并进静态的「其他设备」分组，而不是再 push 一个同名分组——
    // 否则弹窗里会出现两个「其他设备」标题（未分组型号如 sofa 会被单独成组）。
    const otherDeviceGroup = groups.find(([groupLabel]) => groupLabel === OTHER_DEVICE_GROUP_LABEL);
    if (otherDeviceGroup) otherDeviceGroup[1].push(...new Set(leftoverKinds));
    else groups.push([OTHER_DEVICE_GROUP_LABEL, [...new Set(leftoverKinds)]]);
  }
  return groups;
}

export const MDI_SVG_ROOT = "/static/vendor/mdi/7.4.47/svg/";
