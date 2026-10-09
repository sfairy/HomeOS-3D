/**
 * @file useSecurityZoneEditorList.ts
 * @module composables/security
 * @description 安防区域编辑器列表 composable，管理区域导航与渲染列表的展开/折叠状态。
 *   - 基于 useHomeModeItemExpansion 复用紧凑模式下的展开/折叠逻辑
 *   - 生成区域导航项（含名称、传感器数等元信息）
 *   - 在紧凑模式下仅渲染激活区域；展开模式下渲染全部
 * @dependencies vue, ../../features/settings/automate/home-mode/home-mode.internals, @/utils/security/zone-room.util
 */
import { computed, type Ref } from 'vue'
import { useHomeModeItemExpansion } from '@/composables/home-mode/editor.internals'
import { zoneTypeLabel, type SecurityZoneDraft } from '@/utils/security/zone-room.util'

/** 房间可选项 */
interface RoomOption {
  /** 房间 ID */
  id: string
  /** 房间显示标签 */
  label: string
}

/**
 * 安防区域编辑器列表 composable
 * @param zones 区域草稿列表
 * @param roomOptions 房间可选项列表
 * @returns 展开状态、导航项与渲染列表
 */
export function useSecurityZoneEditorList(
  zones: Ref<SecurityZoneDraft[] | undefined>,
  roomOptions: Ref<RoomOption[]>,
) {
  // 区域总数
  const zoneCount = computed(() => zones.value?.length ?? 0)
  // 复用 home-mode 的展开/折叠逻辑
  const { isCompact, expandedAll, activeTabIndex, selectItem, expandAll, collapseAll } =
    useHomeModeItemExpansion(zoneCount)

  // 区域导航项：每项包含索引、标签、元信息与占位标记
  const zoneNavItems = computed(() =>
    (zones.value ?? []).map((zone, i) => {
      // 优先匹配房间标签
      const roomLabel = roomOptions.value.find((r) => r.id === zone.roomId)?.label || ''
      const name = zone.name?.trim()
      // 名称 > 房间标签 > "区域 {i+1}" 回退
      const label = name || roomLabel || `区域 ${i + 1}`
      const sensorCount = zone.sensors?.length || 0
      // 元信息：区域类型 · 传感器数量
      const meta = `${zoneTypeLabel(zone.zoneType || 'all')} · ${sensorCount} 传感器`
      return {
        index: i,
        label,
        meta,
        // 既无名称也无房间标签时标记为占位，UI 显示淡色
        placeholder: !name && !roomLabel,
      }
    }),
  )

  // 实际渲染的区域列表：展开模式渲染全部；紧凑模式仅渲染激活项
  const renderedZones = computed(() => {
    const list = zones.value ?? []
    // 非紧凑模式或已展开全部：渲染所有区域
    if (!isCompact.value || expandedAll.value) {
      return list.map((zone, idx) => ({ zone, idx }))
    }
    // 紧凑模式：仅渲染激活索引对应的区域
    if (activeTabIndex.value != null && list[activeTabIndex.value]) {
      return [{ zone: list[activeTabIndex.value], idx: activeTabIndex.value }]
    }
    return []
  })

  return {
    isCompact,
    expandedAll,
    activeTabIndex,
    selectItem,
    expandAll,
    collapseAll,
    zoneNavItems,
    renderedZones,
  }
}