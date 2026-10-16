/**
 * @file devices-view-filter.internals.ts
 * @module frontend/src/features/device/composables
 */
/** /devices 内存列表：按域/关键词/状态/房间/排序过滤（纯函数） */

import { entityMatchesAreaFilter } from '@homeos/shared'
import type { DeviceListItem, DeviceFilterState } from '@/shared/types/device'

export type DevicesMemoryFilterInput = {
  items: DeviceListItem[]
  activeDomain: string
  query: string
  filter: DeviceFilterState
  roomAreaId: string
  controllableOnly: boolean
}

/**
 * 对内存态设备列表做前端过滤与排序（REST 分页模式不应调用）。
 */
export function filterMemoryDeviceItems(input: DevicesMemoryFilterInput): DeviceListItem[] {
  const q = input.query.trim().toLowerCase()
  const status = input.filter.status
  const room = input.roomAreaId
  const sort = input.filter.sort

  let result = input.items.filter((device): device is DeviceListItem => {
    if (!device) return false
    if (input.activeDomain !== 'all' && device.domain !== input.activeDomain) return false
    if (!q) return true
    return device.name.toLowerCase().includes(q) || device.entity_id.toLowerCase().includes(q)
  })

  if (status === 'online') {
    result = result.filter((device) => !device.unavailable)
  } else if (status === 'offline') {
    result = result.filter((device) => device.unavailable)
  } else if (status === 'low-battery') {
    result = result.filter(
      (device) => device.batteryLevel != null && device.batteryLevel <= 20,
    )
  }

  if (room) {
    result = result.filter((device) =>
      entityMatchesAreaFilter(
        device.area ? { area_id: device.area.id, area_name: device.area.name } : undefined,
        room,
      ),
    )
  }

  if (sort === 'name-asc') {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  } else if (sort === 'name-desc') {
    result = [...result].sort((a, b) => b.name.localeCompare(a.name, 'zh'))
  } else if (sort === 'status') {
    result = [...result].sort((a, b) => {
      if (a.unavailable !== b.unavailable) return a.unavailable ? 1 : -1
      return a.name.localeCompare(b.name, 'zh')
    })
  } else if (sort === 'last-changed') {
    result = [...result].sort((a, b) => {
      const left = a.lastChanged ? new Date(a.lastChanged).getTime() : 0
      const right = b.lastChanged ? new Date(b.lastChanged).getTime() : 0
      return right - left
    })
  }

  if (input.controllableOnly) {
    result = result.filter((device) => device.controllable)
  }

  return result
}
