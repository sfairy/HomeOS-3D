/**
 * 「模型列表为空 / 还能添加」时的指引文案（上游 0.8.9 的同一条判定链）。
 *
 * 为什么单独成文件：这段判定原来内联在面板总装函数里，十几个分支把那个已经很长的函数
 * 变成了整块的三元树。改成「按种类查表 + 少量兜底分支」以后，总装不再有这棵树，
 * 新增类别也只需要在表里加一行。
 *
 * 占位符：
 * - `{label}`：面板上的种类名（「开窗器」「风扇 / 吊扇」…）；
 * - `{media}`：媒体设备的品牌名（电视 / 投影仪）。
 */

import { mediaDeviceProfile } from '@app/bridge/presets'

import type { PickerEditorHost } from './picker-row'

type HintTemplates = Readonly<{ add: string; empty: string }>

/**
 * 逐种类的固定文案。`vacuum` / `window-opener` 的可选项不是「模型」：
 * 前者是扫地机模型，后者是窗扇（平开按扇、推拉按组），所以文案单独写。
 */
const KIND_HINTS: Readonly<Record<string, HintTemplates>> = Object.freeze({
  vacuum: {
    add: '点击“添加扫地机”，选择模型后绑定扫地机设备。',
    empty: '当前楼层暂无扫地机模型，请先在 3D 户型图绘制中添加扫地机器人后更新户型。',
  },
  'window-opener': {
    add: '选择活动窗扇或推拉窗组，再绑定开窗器 cover 实体。',
    empty: '当前楼层没有可动窗扇，请先绘制自定义窗户并设置开启方式。',
  },
  // 0.9.0：开门器的宿主是「户型里画的门」，空态要指向画门这一步（不是窗扇）。
  'door-opener': {
    add: '选择可动门模型，再绑定 cover 或 switch 实体。',
    empty: '当前楼层没有可动门，请先在 3D 户型图中绘制门。',
  },
  speaker: {
    add: '点击“添加设备”，选择智能音响、长条音响或立式音响模型，并绑定媒体播放器实体。',
    empty: '当前楼层暂无音响模型，请先在 3D 户型图绘制中添加智能音响、长条音响或立式音响后更新户型。',
  },
  nas: {
    add: '点击“添加设备”，选择设备类型和模型，再绑定开启实体。',
    empty: '当前楼层暂无 NAS 模型，请先在 3D 户型图绘制中添加 NAS 模型后更新户型。',
  },
  cover: {
    add: '点击“添加窗帘”，选择需要控制的窗帘模型。',
    empty: '当前楼层暂无窗帘模型，请先在 3D 户型图绘制中添加普通窗帘后更新户型。',
  },
  'water-heater': {
    add: '点击“添加热水器”，选择需要控制的热水器模型。',
    empty: '当前楼层暂无热水器模型，请先在 3D 户型图绘制中添加储水式或燃气式热水器后更新户型。',
  },
})

/** 空调族（风扇 / 排气扇 / 净化器 / 晾衣架）：文案只有种类名不同。 */
const LABEL_HINTS: HintTemplates = Object.freeze({
  add: '点击“添加{label}”，选择需要控制的{label}模型。',
  empty: '当前楼层暂无{label}模型，请先在 3D 户型图绘制中添加{label}后更新户型。',
})

const LABEL_KINDS: Readonly<Record<string, HintTemplates>> = Object.freeze({
  airer: LABEL_HINTS,
  fan: LABEL_HINTS,
  purifier: LABEL_HINTS,
})

/** 走通用设备目录的种类（NAS 之外）：先挑模型，再绑定 HA 设备。 */
const GENERIC_HINTS: HintTemplates = Object.freeze({
  add: '点击“添加{label}”，选择模型并绑定 HA 设备。',
  empty: '当前楼层暂无{label}模型，请先在 3D 户型图绘制中添加{label}后更新户型。',
})

const CLIMATE_HINTS: HintTemplates = Object.freeze({
  add: '点击“添加空调/浴霸”，选择设备类型和关联模型。',
  empty: '当前楼层暂无可关联模型，请先在 3D 户型图绘制中添加壁挂空调、柜机或空调出风口后更新户型。',
})

const LIGHT_HINTS: HintTemplates = Object.freeze({
  add: '点击“添加灯光”，选择需要控制的灯组。',
  empty: '当前楼层暂无灯组，请先在 3D 户型图绘制中添加灯组后更新户型。',
})

const MEDIA_HINTS: HintTemplates = Object.freeze({
  add: '点击“添加设备”，选择{media}模型并绑定媒体播放器实体。',
  empty: '当前楼层暂无{media}模型，请先在 3D 户型图绘制中添加后更新户型。',
})

/** 选中哪一组文案：种类表优先，其次按模式兜底。 */
function hintTemplatesFor(editorHost: PickerEditorHost): HintTemplates {
  const kindHints = KIND_HINTS[editorHost.deviceKind] || LABEL_KINDS[editorHost.deviceKind]
  if (kindHints) return kindHints
  if (editorHost.isGenericDeviceMode) return GENERIC_HINTS
  if (editorHost.isMediaDeviceMode) return MEDIA_HINTS
  if (editorHost.isClimateMode) return CLIMATE_HINTS
  return LIGHT_HINTS
}

/** 按设备种类给出模型列表的指引文案。 */
export function modelListHint(editorHost: PickerEditorHost, hasAddableModels: boolean): string {
  const templates = hintTemplatesFor(editorHost),
    template = hasAddableModels ? templates.add : templates.empty
  return template
    .split('{label}')
    .join(editorHost.kindLabel || '')
    .split('{media}')
    .join(mediaDeviceProfile(editorHost.deviceKind)?.label || '媒体设备')
}
