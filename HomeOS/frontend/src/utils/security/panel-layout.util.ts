/**
 * 安防面板布局配置工具模块。
 *
 * 职责：
 * - 从户型图楼层 floatingWidgets 中查找 securityPanel 类型的小部件；
 * - 读取/同步安防面板区域配置到布局配置（zones 随布局持久化）；
 * - 供安防面板初始化与区域保存时镜像更新布局使用。
 *
 * 依赖：UILayoutConfig/FloatingWidget 布局类型、SecurityZonePayload 区域类型。
 */
/** 从户型图楼层 floatingWidgets 读写 securityPanel 区域配置 */
import type { FloatingWidget, UILayoutConfig } from '@/types/layout'
import type { SecurityZonePayload } from '@/utils/security/zones-api.util'

/** 安防面板布局引用：楼层 ID + 小部件对象 */
interface SecurityPanelLayoutRef {
  floorId: string
  widget: FloatingWidget
}

/**
 * 查找布局中所有启用的安防面板小部件。
 *
 * @param layout 布局配置
 * @returns 安防面板引用列表（enabled !== false 的）
 */
function findSecurityPanelWidgets(layout: UILayoutConfig): SecurityPanelLayoutRef[] {
  const refs: SecurityPanelLayoutRef[] = []
  for (const floor of layout.floors || []) {
    for (const widget of floor.floatingWidgets || []) {
      if (widget.type === 'securityPanel' && widget.enabled !== false) {
        refs.push({ floorId: floor.id, widget })
      }
    }
  }
  return refs
}

/**
 * 从布局中读取首个安防面板的区域配置。
 *
 * @param layout 布局配置
 * @returns 区域配置数组；无安防面板或无区域时返回空数组
 */
export function getSecurityPanelZonesFromLayout(layout: UILayoutConfig): SecurityZonePayload[] {
  for (const { widget } of findSecurityPanelWidgets(layout)) {
    const zones = widget.config?.zones
    if (Array.isArray(zones) && zones.length) {
      return zones as SecurityZonePayload[]
    }
  }
  return []
}

/**
 * 将区域配置镜像写入所有安防面板小部件的 config.zones。
 *
 * @param uiStore 布局 store，提供 layoutConfig 与 updateFloatingWidget
 * @param zones 待写入的区域配置
 * @returns true 表示至少更新了一个小部件；false 表示无安防面板小部件
 */
export function mirrorSecurityPanelZonesToLayout(
  uiStore: {
    layoutConfig: UILayoutConfig
    updateFloatingWidget: (id: string, updates: Partial<FloatingWidget>, floorId?: string) => void
  },
  zones: SecurityZonePayload[],
): boolean {
  const refs = findSecurityPanelWidgets(uiStore.layoutConfig)
  if (!refs.length) return false
  for (const { floorId, widget } of refs) {
    uiStore.updateFloatingWidget(
      widget.id,
      {
        config: { ...(widget.config || {}), zones },
      },
      floorId,
    )
  }
  return true
}