/**
 * 取暖壁挂炉的**用户文案**（0.8.9 `climate-panel.js` + `config-editor.js` 采暖段）。
 *
 * 为什么单独一份：壁挂炉在数据上是 `climate` 主实体，但它和空调的差别全在文案与
 * 两个开关（`underfloorHeating` / `heatingPanelStyle`）上；把这些散进空调面板的分支里，
 * 后面再加一种采暖设备时又会复制一遍。
 */

export const BOILER_COPY = Object.freeze({
  /** 设备类型名（目录卡片 / 图例 / 面板标题）。 */
  label: '取暖壁挂炉',
  /** 面板 aria 标签（与「空调/浴霸」同构）。 */
  panelLabel: '取暖壁挂炉控制',
  /** 制热态。 */
  heating: '正在制热',

  /** 配置段。 */
  pickPrimaryEntity: '选择采暖主实体',
  primaryEntityHint: '采暖主实体控制本层地暖。盘管按室内地面自动排列，庭院和楼板洞口留空。',
  underfloorToggle: '制热时显示本层地暖盘管',
  heatingPanelStyleThermostat: '温控卡',
  heatingPanelStyleClimate: '空调卡',

  /** 浴霸联动的前置条件（与壁挂炉同属「本层采暖设备」提示）。 */
  needBathHeaterModel: '请先在本层添加浴霸模型',
  bathHeaterMountHint: '浴霸顶部安装面距本层地面的高度，灯面和出风格栅朝下。',
})

/**
 * 是否是采暖壁挂炉。
 *
 * 两条判据都要认：`climateType` 是配置里的显式声明，而旧数据里壁挂炉只被分到
 * `boiler` kind（没有 `climateType`），只看一个会漏掉一半设备。
 */
export function isHeatingBoiler(item: { climateType?: string; climateKind?: string; type?: string } | null): boolean {
  if (!item) return false
  return item.climateType === 'heating-boiler' || item.climateKind === 'boiler' || item.type === 'heating-boiler'
}

/**
 * 壁挂炉是否在制热。
 *
 * 判据顺序：`hvac_action`（HA 给的实时动作）→ `hvac_mode` → `state`。
 * 只看 `state === 'heat'` 会漏掉「mode=heat 但 action=idle（已到温）」这种正常停机。
 */
export function isBoilerHeating(
  deviceState: {
    hvacAction?: string
    action?: string
    mode?: string
    state?: string
  } | null,
): boolean {
  const action = String(deviceState?.hvacAction ?? deviceState?.action ?? '').toLowerCase()
  if (action) return action === 'heating' || action === 'heat'
  const mode = String(deviceState?.mode ?? deviceState?.state ?? '').toLowerCase()
  return mode === 'heat' || mode === 'heating'
}

/** 面板标题：壁挂炉用专属 aria，其余沿用调用方给的名字。 */
export function boilerPanelLabel(item: Parameters<typeof isHeatingBoiler>[0], fallback: string): string {
  return isHeatingBoiler(item) ? BOILER_COPY.panelLabel : fallback
}

/**
 * 壁挂炉的面板形态（0.8.9 `item.heatingPanelStyle`）。
 *
 * 判据就是上游那一行：`heatingPanelStyle === 'climate' ? 'climate' : 'thermostat'`。
 * 也就是说**只有显式空调卡才是空调卡**，缺省、脏值、旧枚举（`air-conditioner`）都按
 * 温控卡处理 —— 宁可少显示几个按钮，也不要给壁挂炉露出空调专属的风速/摆风。
 */
export function heatingPanelStyleOf(
  item: { heatingPanelStyle?: unknown } | null | undefined,
): 'climate' | 'thermostat' {
  return item?.heatingPanelStyle === 'climate' ? 'climate' : 'thermostat'
}

/** 温控卡形态：壁挂炉要隐藏「风速 / 摆风 / 左右摆风」三组。 */
export function isThermostatBoilerPanel(item: Parameters<typeof isHeatingBoiler>[0]): boolean {
  return isHeatingBoiler(item) && heatingPanelStyleOf(item as { heatingPanelStyle?: unknown } | null) === 'thermostat'
}
