/**
 * 环境/房间列表项（HA area 区域映射展示结构）。
 * 用于设备页/户型图的房间筛选 Tab 渲染。
 */
export interface RoomListItem {
  /** 房间/区域唯一 ID（对应 HA area_id，或虚拟房间的自增 id） */
  id: string
  /** 默认标签（HA area_name 或实体计数合成的兜底文案，未自定义时展示） */
  defaultLabel: string
  /** 是否为固定内置项（如"全部房间"伪项，不可删除/重命名） */
  fixed: boolean
  /** 最终展示标签（优先取用户自定义别名，其次 defaultLabel） */
  displayLabel: string
}
