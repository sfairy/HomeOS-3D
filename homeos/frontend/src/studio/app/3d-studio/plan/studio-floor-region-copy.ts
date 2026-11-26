/**
 * 地面分区工具的**全部用户文案**（0.8.9 `studio-floor-region-editor.js`）。
 *
 * 为什么集中成一个模块：同一句话分散在三个文件里写，必然会漂移 ——
 * 属性面板标题、画布提示、toast 各写一份，改一处只修一个入口（这正是
 * `DIFF-AND-PORT-PLAN.md` 附录十七记录的教训）。
 *
 * 上游的 `原色 / 浅色` 是面板按钮，`木地板 / 瓷砖` 是同一档在平面图例里的叫法；
 * 两者不是同一条文案，都要保留。
 */

/** 引导语：随状态切换（未选中 / 已选中 / 标记起点 / 点终点）。 */
export const FLOOR_REGION_PROMPT = Object.freeze({
  idle: '在平面图中点选房间或已有分区。',
  selected: '点选房间或已有分区，可以设置铺面，也可以画分割线。',
  selectedShort: '选择铺面，或在这块地面上画分割线。',
  splitStart: '点击所选区域的边界，标记分割起点。',
  splitEnd: '点击对侧边界完成分割，Esc 取消。',
})

/** 失败提示。 */
export const FLOOR_REGION_ERROR = Object.freeze({
  noFloor: '请选择有闭合墙体的室内地面。',
  notNearEdge: '请靠近所选区域的边界。',
  splitInvalid: '分割线需留在所选区域内，避开洞口，并将区域分成两块。',
  tooComplex: '分区边界过于复杂，或已达到本层分区上限。',
})

/** 面板按钮与图例。 */
export const FLOOR_REGION_LABEL = Object.freeze({
  cut: '画分割线',
  cancel: '取消画线',
  remove: '移除分区',
  wood: '原色',
  tile: '浅色',
  /** 平面图图例（与按钮同档，但用材质名而不是色档名）。 */
  legendWood: '木地板',
  legendTile: '瓷砖',
  /** 深浅滑条的档位说明。 */
  woodTone: '原色深浅',
  tileTone: '浅色深浅',
})

/** 铺面按钮 → 深浅档位的说明文案。 */
export function floorRegionToneLabel(finish: string): string {
  if (finish === 'wood') return FLOOR_REGION_LABEL.woodTone
  if (finish === 'tile') return FLOOR_REGION_LABEL.tileTone
  return '深浅'
}
