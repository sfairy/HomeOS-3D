/**
 * 设备类别的分组与图标（0.8.1：原「设备类别弹窗」已并入 `openConfigurationPicker`，
 * 这里只剩纯数据，供类别选择器的分组与 `configurationProgress` 复用）。
 */

import { GENERIC_DEVICE_KINDS, genericDeviceProfile } from '../../../device/generic-device-catalog'
import { MEDIA_DEVICE_KINDS, mediaDeviceProfile } from '@app/bridge/presets'

export interface DeviceCategoryProfile {
  label: string
  icon: string
}

const FIXED_DEVICE_CATEGORIES: Readonly<Record<string, DeviceCategoryProfile>> = Object.freeze({
  nas: Object.freeze({ label: 'NAS', icon: 'mdi:nas' }),
  ...Object.fromEntries(
    MEDIA_DEVICE_KINDS.map((mediaKind) => [
      mediaKind,
      Object.freeze({ label: mediaDeviceProfile(mediaKind)!.label, icon: mediaDeviceProfile(mediaKind)!.icon }),
    ]),
  ),
  speaker: Object.freeze({ label: '智能音响', icon: 'mdi:speaker' }),
  'water-heater': Object.freeze({ label: '热水器', icon: 'mdi:water-boiler' }),
  // 0.8.9 取暖壁挂炉：走 climate 主实体，但没有卡片的「集合」概念，
  // 所以登记为固定类别（不走 generic 目录），配置段见 `boiler-section.ts`。
  'heating-boiler': Object.freeze({ label: '取暖壁挂炉', icon: 'mdi:water-boiler' }),
  airer: Object.freeze({ label: '晾衣架', icon: 'mdi:hanger' }),
})

/** 兜底分组名；静态分组与未分组型号都必须落回同一个分组，避免弹窗里出现两个同名分区。 */
const OTHER_DEVICE_GROUP_LABEL = '其他设备'

/**
 * 设备类别的三个分组（上游 0.8.9 `deviceCategoryGroups`，逐项对齐）。
 *
 * 顺序不是随手排的：上游把「常用设备」（含开关控制台 / PlayStation 这类没有 HA 域的
 * 入口）与「家用电器」分两屏，同一组内按「使用频率 + 品类相邻」排，宠物四件套固定落在
 * 「其他设备」末尾。本仓此前漏了开关控制台、PlayStation、除湿机、取暖器、电动阀门，
 * 且宠物三件顺序与上游相反。
 *
 * `heating-boiler` 刻意**不在**这里：上游把它只当环境类别（`环境类别 → 取暖壁挂炉`），
 * 设备类别弹窗里没有这一项，否则会出现「同一个壁挂炉两个入口」。
 */
const DEVICE_CATEGORY_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = Object.freeze([
  [
    '常用设备',
    [
      'nas',
      ...MEDIA_DEVICE_KINDS,
      'speaker',
      'switch-console',
      'playstation',
      'router',
      'home-network-cabinet',
      'smart-socket-86',
    ],
  ],
  [
    '家用电器',
    [
      'water-heater',
      'airer',
      'fridge',
      'dishwasher',
      'washer',
      'floor-washer',
      'dryer',
      'rangehood',
      'water-purifier',
      'ricecooker',
      'steamoven',
      'air-fryer',
      'humidifier',
      'dehumidifier',
      'heater',
      'electric-valve',
      'aroma-diffuser',
      'pressure-cooker',
      'disinfection-cabinet',
      'tea_bar_machine',
      'pipelinewaterpurifier',
      'juicer',
      'bread-maker',
      'power-blender',
      'microwave',
      'coffee-machine',
      'toilet',
    ],
  ],
  [
    OTHER_DEVICE_GROUP_LABEL,
    [
      'smallcar',
      'plant',
      'bed',
      'sofa',
      'computer',
      'printer',
      '3d-printer',
      'pet-feeder',
      'pet-fountain',
      'smart-litter-box',
      'pet-dryer',
    ],
  ],
] as ReadonlyArray<readonly [string, readonly string[]]>)

export function resolveDeviceCategoryProfile(deviceKind: string): DeviceCategoryProfile {
  const fixedProfile = FIXED_DEVICE_CATEGORIES[deviceKind]
  if (fixedProfile) return fixedProfile
  const genericProfile = genericDeviceProfile(deviceKind)
  return genericProfile
    ? { label: genericProfile.label, icon: genericProfile.icon }
    : { label: String(deviceKind ?? ''), icon: '' }
}

/** 返回 `[分组名, 型号列表]`；过滤掉不存在的型号，未分组型号补进「其他设备」。 */
export function deviceCategoryGroups(): Array<[string, string[]]> {
  const groupedKinds = new Set<string>(),
    groups = DEVICE_CATEGORY_GROUPS.map(
      ([groupLabel, groupKinds]) =>
        [
          groupLabel,
          groupKinds.filter((deviceKind) => {
            if (!FIXED_DEVICE_CATEGORIES[deviceKind] && !genericDeviceProfile(deviceKind)) return false
            groupedKinds.add(deviceKind)
            return true
          }),
        ] as [string, string[]],
    ).filter(([, groupKinds]) => groupKinds.length),
    leftoverKinds = ['nas', ...MEDIA_DEVICE_KINDS, 'speaker', 'water-heater', 'airer', ...GENERIC_DEVICE_KINDS].filter(
      (deviceKind) => !groupedKinds.has(deviceKind),
    )
  if (leftoverKinds.length) {
    // 合并进静态的「其他设备」分组，而不是再 push 一个同名分组——
    // 否则弹窗里会出现两个「其他设备」标题（未分组型号如 sofa 会被单独成组）。
    const otherDeviceGroup = groups.find(([groupLabel]) => groupLabel === OTHER_DEVICE_GROUP_LABEL)
    if (otherDeviceGroup) otherDeviceGroup[1].push(...new Set(leftoverKinds))
    else groups.push([OTHER_DEVICE_GROUP_LABEL, [...new Set(leftoverKinds)]])
  }
  return groups
}

export const MDI_SVG_ROOT = '/static/vendor/mdi/7.4.47/svg/'
